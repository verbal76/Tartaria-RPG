// OTA-851 [living world — variety] — the WORLD EVENT engine + roaming patrols.
//
// OTA-844's pulse only ever did one thing (a faction rose, rivals fell), so the
// world's "heartbeat" got old fast. This replaces that single beat with a broad,
// weighted catalogue of events — skirmishes, musters, caravans, schisms, omens,
// bounties posted, warbands fielded — so no two stretches of play read the same.
// Events carry a data-only EFFECT the store applies (tide shifts, patrol musters,
// rep nudges, bounty offers) plus a short rumour and a terse Arbiter line.
//
// It also owns ROAMING PATROLS: faction war-parties that wander loops near their
// outposts on the world grid and can be blundered into anywhere — not just when
// you route toward the outpost (that's OTA-850's approach interception). Both the
// event selection and the patrol walk are DETERMINISTIC (seeded by the world tick
// index), so the world is reproducible and testable — no Math.random here.

import type { FactionMeta } from './worldPulse';
import { withArticleCap } from './grammar';

const TIDE_MIN = -5, TIDE_MAX = 5;
const clampTide = (v: number) => Math.max(TIDE_MIN, Math.min(TIDE_MAX, v));
/** Small deterministic hash so a tick index scatters selections without RNG. */
function hash(n: number): number { const x = Math.sin(n * 12.9898) * 43758.5453; return x - Math.floor(x); }
function seededPick<T>(arr: readonly T[], seed: number): T | undefined {
  if (arr.length === 0) return undefined;
  return arr[Math.floor(hash(seed) * arr.length) % arr.length];
}

export interface WorldEventCtx {
  factions: readonly FactionMeta[];
  tides: Record<string, number>;
  standings: ReadonlyArray<{ factionId: string; standing: number }>;
}

/** Data-only effect the store applies — keeps the catalogue pure. */
export interface WorldEventEffect {
  /** factionId → momentum delta (clamped by the store). */
  tideDelta?: Record<string, number>;
  /** A faction fields extra roaming patrols. */
  musterPatrols?: { factionId: string; count: number };
  /** ⚠⚠ OTA-1157 — NO EVENT IN THIS CATALOGUE MAY USE THIS. Owner's rule: "you
   *  should work to get standing, not earn it by breathing." The two that did are
   *  documented above; both now pay a tide. The field and the store's handler are
   *  kept ONLY for a future AUTHORED beat the player actually walks into — never
   *  for the ambient world tick, which fires on a clock the player never touches.
   *  `ota1157AmbientStandingOff` asserts the catalogue's repDelta count is ZERO. */
  repDelta?: { factionId: string; delta: number };
  /** A bounty is fresh on the board (the store surfaces an Arbiter nudge). */
  offerBounty?: boolean;
}

export interface WorldEvent {
  kind: string;
  /** World-feed line (🗞). */
  rumor: string;
  /** Optional terse Arbiter update. */
  arbiter?: string;
  effect: WorldEventEffect;
}

interface EventDef {
  kind: string;
  weight: number;
  eligible: (ctx: WorldEventCtx) => boolean;
  build: (ctx: WorldEventCtx, seed: number) => WorldEvent;
}

const realIdsOf = (ctx: WorldEventCtx) => new Set(ctx.factions.map((f) => f.id));
const nameOf = (ctx: WorldEventCtx, id: string) => ctx.factions.find((f) => f.id === id)?.name ?? id;
const standingOf = (ctx: WorldEventCtx, id: string) => ctx.standings.find((s) => s.factionId === id)?.standing ?? 0;
const realRivals = (ctx: WorldEventCtx, f: FactionMeta) => (f.rivals ?? []).filter((r) => realIdsOf(ctx).has(r));
const realAllies = (ctx: WorldEventCtx, f: FactionMeta) => (f.allies ?? []).filter((a) => realIdsOf(ctx).has(a));
const favored = (ctx: WorldEventCtx) => ctx.factions.filter((f) => standingOf(ctx, f.id) >= 10);
const ascendant = (ctx: WorldEventCtx) => [...ctx.factions].sort((a, b) => (ctx.tides[b.id] ?? 0) - (ctx.tides[a.id] ?? 0));

// The catalogue. Deliberately broad so the world stays fresh; add freely.
const EVENTS: EventDef[] = [
  {
    kind: 'surge', weight: 10, eligible: () => true,
    build: (ctx, seed) => {
      const mover = seededPick(ctx.factions, seed)!;
      const rival = realRivals(ctx, mover)[0];
      const delta: Record<string, number> = { [mover.id]: 1 };
      realRivals(ctx, mover).forEach((r) => (delta[r] = -1));
      realAllies(ctx, mover).forEach((a) => (delta[a] = (delta[a] ?? 0) + 1));
      return {
        kind: 'surge',
        rumor: rival
          ? `The ${mover.name} press their claim across the waste, and the ${nameOf(ctx, rival)} give ground.`
          : `The ${mover.name} grow bolder across the waste.`,
        effect: { tideDelta: delta },
      };
    },
  },
  {
    kind: 'setback', weight: 8, eligible: (ctx) => favored(ctx).some((f) => realRivals(ctx, f).length > 0),
    build: (ctx, seed) => {
      const ally = seededPick(favored(ctx).filter((f) => realRivals(ctx, f).length > 0), seed)!;
      const rival = seededPick(realRivals(ctx, ally), seed + 1)!;
      return {
        kind: 'setback',
        rumor: `The ${nameOf(ctx, rival)} took a hard loss near the frontier — and the ${ally.name} are paying good coin to press the advantage.`,
        arbiter: `"The ${ally.name} have work for a willing hand," the Arbiter notes. "The board will show it."`,
        effect: { tideDelta: { [rival]: -1 }, offerBounty: true },
      };
    },
  },
  {
    kind: 'skirmish', weight: 9,
    eligible: (ctx) => ctx.factions.some((f) => realRivals(ctx, f).length > 0),
    build: (ctx, seed) => {
      const f = seededPick(ctx.factions.filter((x) => realRivals(ctx, x).length > 0), seed)!;
      const r = seededPick(realRivals(ctx, f), seed + 2)!;
      return {
        kind: 'skirmish',
        rumor: `${f.name} and ${nameOf(ctx, r)} outriders clashed in the dust — neither side walked away whole.`,
        effect: { tideDelta: { [f.id]: -1, [r]: -1 } },
      };
    },
  },
  {
    kind: 'muster', weight: 8, eligible: (ctx) => ascendant(ctx).some((f) => (ctx.tides[f.id] ?? 0) >= 1),
    build: (ctx, seed) => {
      const f = seededPick(ascendant(ctx).filter((x) => (ctx.tides[x.id] ?? 0) >= 1), seed)!;
      return {
        kind: 'muster',
        rumor: `The ${f.name} are mustering — more of their patrols on the roads now.`,
        arbiter: `"The ${f.name} ride in numbers lately," the Arbiter says. "Mind the open country."`,
        effect: { musterPatrols: { factionId: f.id, count: 1 } },
      };
    },
  },
  {
    kind: 'warband', weight: 6, eligible: (ctx) => ascendant(ctx).some((f) => (ctx.tides[f.id] ?? 0) >= 2),
    build: (ctx, seed) => {
      const f = seededPick(ascendant(ctx).filter((x) => (ctx.tides[x.id] ?? 0) >= 2), seed)!;
      return {
        kind: 'warband',
        rumor: `${withArticleCap(f.name)} warband has taken to the roads in force.`,
        arbiter: `"${withArticleCap(f.name)} warband is abroad," the Arbiter warns. "That is a fight, not a patrol."`,
        effect: { musterPatrols: { factionId: f.id, count: 2 }, tideDelta: { [f.id]: 1 } },
      };
    },
  },
  {
    kind: 'bounty', weight: 7, eligible: (ctx) => favored(ctx).some((f) => realRivals(ctx, f).length > 0),
    build: (ctx, seed) => {
      const ally = seededPick(favored(ctx).filter((f) => realRivals(ctx, f).length > 0), seed)!;
      return {
        kind: 'bounty',
        rumor: `The ${ally.name} have posted a bounty on the board.`,
        arbiter: `"The ${ally.name} want a debt collected," the Arbiter says. "Read the World if you'd take it."`,
        effect: { offerBounty: true },
      };
    },
  },
  {
    kind: 'schism', weight: 5, eligible: (ctx) => ctx.factions.some((f) => realAllies(ctx, f).length > 0),
    build: (ctx, seed) => {
      const f = seededPick(ctx.factions.filter((x) => realAllies(ctx, x).length > 0), seed)!;
      const a = seededPick(realAllies(ctx, f), seed + 3)!;
      return {
        kind: 'schism',
        rumor: `Word is the ${f.name} and the ${nameOf(ctx, a)} have fallen out — an old alliance fraying.`,
        effect: { tideDelta: { [f.id]: -1, [a]: -1 } },
      };
    },
  },
  {
    kind: 'truce', weight: 4, eligible: (ctx) => ctx.factions.some((f) => realRivals(ctx, f).length > 0),
    build: (ctx, seed) => {
      const f = seededPick(ctx.factions.filter((x) => realRivals(ctx, x).length > 0), seed)!;
      const r = seededPick(realRivals(ctx, f), seed + 4)!;
      // Pull both toward neutral.
      const df = (ctx.tides[f.id] ?? 0) > 0 ? -1 : 1;
      const dr = (ctx.tides[r] ?? 0) > 0 ? -1 : 1;
      return {
        kind: 'truce',
        rumor: `The ${f.name} and the ${nameOf(ctx, r)} have called an uneasy truce. For now.`,
        effect: { tideDelta: { [f.id]: df, [r]: dr } },
      };
    },
  },
  {
    // ⚠ OTA-1157 — NO `repDelta`. THE WORLD DOES NOT MOVE YOUR STANDING ANY MORE.
    // Owner: "you should work to get standing, not earn it by breathing."
    // This used to pay +2 — plus the −1 that a +2 cascades to each rival — gated on
    // `favored` (≥10), which is BOTH the eligibility test and the target pool, so it
    // fed whoever was already ahead, starting from a home faction that begins AT 10.
    // ⚠ The rumor is REWRITTEN WITH the effect, deliberately. The old line ("they
    // count you a friend now") is a STANDING CLAIM; leaving it with nothing behind
    // it would be OTA-1156 finding 9 all over again — text describing a rule the
    // code does not have. A defection genuinely strengthens the faction it lands
    // in, so it pays a TIDE instead: a real consequence, about the world, not you.
    kind: 'defector', weight: 5, eligible: (ctx) => favored(ctx).length > 0,
    build: (ctx, seed) => {
      const ally = seededPick(favored(ctx), seed)!;
      return {
        kind: 'defector',
        rumor: `${withArticleCap(ally.name)} rival lost an officer to them — defected outright, and took what they knew along.`,
        effect: { tideDelta: { [ally.id]: 1 } },
      };
    },
  },
  {
    kind: 'pilgrimage', weight: 5, eligible: () => true,
    build: (ctx, seed) => {
      const f = seededPick(ctx.factions, seed)!;
      return { kind: 'pilgrimage', rumor: `The ${f.name} are on the move in numbers — a pilgrimage, or a march.`, effect: { tideDelta: { [f.id]: 1 } } };
    },
  },
  {
    kind: 'caravan', weight: 6, eligible: () => true,
    build: (ctx, seed) => {
      const f = seededPick(ctx.factions, seed)!;
      return { kind: 'caravan', rumor: `${withArticleCap(f.name)} caravan was sighted on the trade road, heavy with goods.`, effect: {} };
    },
  },
  {
    kind: 'relic', weight: 6, eligible: () => true,
    build: (_ctx, seed) => {
      const rumors = [
        'A prospector swears a Tartarian relic surfaced after the last storm.',
        'Old machines are stirring beneath the dunes, they say.',
        'A buried door was found ajar in the deep waste.',
      ];
      return { kind: 'relic', rumor: seededPick(rumors, seed)!, effect: {} };
    },
  },
  {
    kind: 'market', weight: 5, eligible: () => true,
    build: (_ctx, seed) => {
      const rumors = [
        'Prices are swinging in the markets — someone cornered the salvage trade.',
        'Coin runs thin this season; the brokers have grown tight-fisted.',
        'A glut of relics hit the market — buyers are choosy now.',
      ];
      return { kind: 'market', rumor: seededPick(rumors, seed)!, effect: {} };
    },
  },
  {
    kind: 'omen', weight: 5, eligible: () => true,
    build: (_ctx, seed) => {
      const rumors = [
        'The Aether burned strange colors over the horizon last night.',
        'The wind carried voices no one could place. An omen, the old ones say.',
        'A dead spire lit for a heartbeat, then went dark.',
      ];
      return { kind: 'omen', rumor: seededPick(rumors, seed)!, effect: {} };
    },
  },
  {
    kind: 'purge', weight: 4, eligible: (ctx) => ctx.factions.some((f) => realRivals(ctx, f).length > 0),
    build: (ctx, seed) => {
      const f = seededPick(ctx.factions.filter((x) => realRivals(ctx, x).length > 0), seed)!;
      const r = seededPick(realRivals(ctx, f), seed + 5)!;
      return { kind: 'purge', rumor: `The ${f.name} are purging ${nameOf(ctx, r)} sympathizers from their holdings.`, effect: { tideDelta: { [f.id]: 1, [r]: -1 } } };
    },
  },
  {
    // ⚠ OTA-1157 — the second of the two, same reasoning as `defector` above.
    // ("remembered your name" was the standing claim; a windfall makes them
    // stronger, which is a tide, and which they get whether they like you or not.)
    kind: 'windfall', weight: 4, eligible: (ctx) => favored(ctx).length > 0,
    build: (ctx, seed) => {
      const ally = seededPick(favored(ctx), seed)!;
      return { kind: 'windfall', rumor: `The ${ally.name} shared out a windfall — every hand in their holdings is a little richer for it.`, effect: { tideDelta: { [ally.id]: 1 } } };
    },
  },
];

/**
 * Pick and build one world event, deterministically from `seed` (the world tick
 * index). Only eligible events are in the draw; selection is weighted. Returns
 * null only if nothing is eligible (shouldn't happen — several events are always
 * eligible). Pure.
 */
export function pickWorldEvent(ctx: WorldEventCtx, seed: number): WorldEvent | null {
  const pool = EVENTS.filter((e) => e.eligible(ctx));
  if (pool.length === 0) return null;
  // Weighted deterministic draw.
  const total = pool.reduce((s, e) => s + e.weight, 0);
  let r = hash(seed) * total;
  let chosen = pool[0]!;
  for (const e of pool) { if (r < e.weight) { chosen = e; break; } r -= e.weight; }
  const ev = chosen.build(ctx, seed);
  // Clamp any tide deltas defensively (store also clamps).
  if (ev.effect.tideDelta) {
    for (const k of Object.keys(ev.effect.tideDelta)) {
      ev.effect.tideDelta[k] = Math.max(-2, Math.min(2, ev.effect.tideDelta[k]!));
    }
  }
  return ev;
}

/** Apply an event's tide deltas onto a tides map (clamped). Pure. */
export function applyTideDelta(tides: Record<string, number>, delta: Record<string, number> | undefined): Record<string, number> {
  if (!delta) return { ...tides };
  const next = { ...tides };
  for (const [id, d] of Object.entries(delta)) next[id] = clampTide((next[id] ?? 0) + d);
  return next;
}

// ── Roaming patrols ──────────────────────────────────────────────────────────

export interface Patrol {
  factionId: string;
  /** Current grid cell. */
  gx: number;
  gy: number;
  /** Home outpost cell — the patrol wanders a loop around it. */
  homeX: number;
  homeY: number;
  /** Per-patrol phase so two patrols of the same faction don't overlap. */
  phase: number;
  /** ⚠ OTA-1221 — a QUARRY group placed by a bounty contract (OTA-1166), not part of
   *  the faction's fielded army. maintainPatrols must neither count these toward the
   *  faction's patrol target nor cull them as excess — without the flag, the war
   *  maintenance tick deleted the freshly-seeded quarry within the hour (they append
   *  LAST, and the trim drops from the tail), so the player arrived to an empty
   *  contract ground: the exact failure OTA-1166 exists to remove. */
  quarry?: boolean;
}

/** OTA-853 — patrols ROAM THE WHOLE MAP now (no home leash). A deterministic wander:
 *  each step picks a cardinal direction from the hash, with a light drift toward a
 *  target when one is set (the store points them at a rival outpost so they go LOOKING
 *  for someone's ground to take, instead of circling their own). Pure. */
export function stepPatrol(p: Patrol, tickIndex: number, target?: { x: number; y: number }): Patrol {
  const h = hash(p.phase * 31 + tickIndex);
  let dx = 0, dy = 0;
  // 55% of steps drift toward the target (if any); the rest wander freely, so a patrol
  // heads roughly for a fight but never on rails.
  if (target && h < 0.55) {
    const distX = target.x - p.gx, distY = target.y - p.gy;
    if (distX === 0 && distY === 0) { /* arrived — wander below */ }
    else if (Math.abs(distX) >= Math.abs(distY)) dx = distX > 0 ? 1 : -1;
    else dy = distY > 0 ? 1 : -1;
  }
  if (dx === 0 && dy === 0) {
    if (h < 0.25) dx = 1; else if (h < 0.5) dx = -1; else if (h < 0.75) dy = 1; else dy = -1;
  }
  return { ...p, gx: p.gx + dx, gy: p.gy + dy };
}

/** Patrols within `radius` (Manhattan) of a cell. Pure. */
export function patrolsNear(patrols: readonly Patrol[], gx: number, gy: number, radius = 2): Patrol[] {
  return patrols.filter((p) => Math.abs(p.gx - gx) + Math.abs(p.gy - gy) <= radius);
}

// ─────────────────────────────────────────────────────────────────────────────
// OTA-865 — LOCAL WAR HEAT. How contested the ground around a point is, 0..1, read
// straight from how many war-parties are roaming nearby. Feeds the vendor micro-economy:
// a hot area means soldiers are buying, so traders mark up (and pay more, since they can
// resell). Needs a genuine CLUSTER — a lone wanderer reads as ~0 — so quiet ground stays
// cheap and only real fighting moves prices.
// ─────────────────────────────────────────────────────────────────────────────
const HEAT_RADIUS = 5;      // Manhattan tiles counted as "around here"
const HEAT_BASELINE = 1;    // one passing patrol is just traffic, not a war
const HEAT_SPAN = 6;        // this many patrols above baseline = fully contested

/** 0..1 contestedness of the ground around a cell, from nearby roaming patrols. */
export function localWarHeat(patrols: readonly Patrol[], gx: number, gy: number): number {
  const near = patrolsNear(patrols, gx, gy, HEAT_RADIUS).length;
  return Math.max(0, Math.min(1, (near - HEAT_BASELINE) / HEAT_SPAN));
}

/** The two factions with the most war-parties near a cell — who's fighting over this
 *  ground right now. Returns [] when nothing's near, one id when only one faction is. */
export function contestedFactions(patrols: readonly Patrol[], gx: number, gy: number): string[] {
  const near = patrolsNear(patrols, gx, gy, HEAT_RADIUS);
  const count = new Map<string, number>();
  for (const p of near) count.set(p.factionId, (count.get(p.factionId) ?? 0) + 1);
  return [...count.entries()].sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0])).slice(0, 2).map((e) => e[0]);
}

// ─────────────────────────────────────────────────────────────────────────────
// OTA-864 — WAR-FEED FLAVOUR. The board used to draw clashes from 2 lines, outpost
// assaults from 1, and beast maulings from 4, so it read the same on loop. These are
// deep, deterministic pools (seeded by the sim index) that vary BOTH the verb and the
// scenario — where the fight happened, how it turned, what it cost — so the war reads
// like a war, not a stuck ticker. All pure: same seed → same line.
// ─────────────────────────────────────────────────────────────────────────────

// A clash where W beat L in the open. {W} = winner name, {L} = loser name.
const CLASH_LINES: readonly string[] = [
  'A {W} patrol broke a {L} column in the open waste and left the sand red.',
  'Two war-parties met at a dry wash — the {W} rode out; the {L} did not.',
  'The {W} caught a {L} patrol watering their mounts and cut them down to the last.',
  'A running fight along the ridge ended with the {W} standing over {L} dead.',
  'The {W} sprang an ambush from the dunes; the {L} scattered and were hunted down.',
  'A {L} scouting party walked into {W} guns at the crossroads and was gutted.',
  'Blades out at dusk — the {W} shattered a {L} patrol and stripped the bodies.',
  'The {W} ran a {L} column into a box canyon and finished them there.',
  'A duel of outriders spilled into a rout; the {W} chased the {L} for miles.',
  'The {W} held the high ground and broke wave after wave of {L} until none rose.',
  'A night raid — the {W} slit the {L} pickets and took the camp before dawn.',
  'The {W} traded volleys with a {L} patrol across a salt pan and won the field.',
  'A {L} war-party pressed too far from its lines; the {W} encircled and destroyed it.',
  'The {W} bled for it, but a {L} patrol was left broken in the flats.',
  'Steel rang at the old road — the {W} carried the day over the {L}.',
  'The {W} torched a {L} supply train and put its guards to the sword.',
  'A skirmish over a ruined well turned into a slaughter; the {W} took the water.',
  'The {W} feigned a retreat and turned on the pursuing {L}, wiping them out.',
  'Outnumbered, the {W} still broke the {L} line and sent the rest running.',
  'A {L} patrol was caught in the open by {W} riders and ridden down.',
];

// Tacked onto a clash that SEEDED a fresh grudge (neutrals coming to blows). Varied.
const GRUDGE_TAILS: readonly string[] = [
  'Bad blood runs between them now.',
  'A grudge is born of it.',
  "There'll be no forgetting this one.",
  'What was indifference is now a feud.',
  'The first cut of a new war.',
  'Neither will let this pass.',
  'A quarrel that was nothing is a hatred now.',
];

/** A world-board line for a patrol clash. `friction` = the fight seeded a new grudge. */
export function patrolClashLine(winner: string, loser: string, friction: boolean, seed: number): string {
  const base = (seededPick(CLASH_LINES, seed) ?? CLASH_LINES[0]!)
    .replace(/\{W\}/g, winner).replace(/\{L\}/g, loser);
  if (!friction) return base;
  const tail = seededPick(GRUDGE_TAILS, seed * 7 + 3) ?? GRUDGE_TAILS[0]!;
  return `${base} ${tail}`;
}

// An outpost assault: {A} attacker sacks {D} defender's outpost.
const ASSAULT_LINES: readonly string[] = [
  'A {A} war-party struck the {D} outpost and burned what they could carry off.',
  'The {A} stormed the {D} outpost at first light and left it smoking.',
  'Raiders of the {A} breached the {D} palisade and sacked the stores within.',
  'The {A} put the {D} outpost to the torch and drove off its garrison.',
  'A lightning raid — the {A} looted the {D} outpost and were gone by dark.',
  'The {A} overran a {D} watchpost and carried its munitions home.',
  'The {D} outpost held for an hour before the {A} broke the gate.',
  'The {A} poisoned the {D} outpost well and razed the granary.',
  'A {A} column battered the {D} outpost walls and stripped it bare.',
  'The {A} caught the {D} garrison changing watch and took the outpost cheap.',
  'The {A} left the {D} outpost a ruin and its banner in the dust.',
  'Smoke over the flats — the {A} had been at the {D} outpost again.',
  'The {A} sapped the {D} outpost gate and swarmed through the breach.',
  'A {D} outpost fell in a night to a {A} raid nobody saw coming.',
];

/** A world-board line for an outpost assault. */
export function outpostAssaultLine(attacker: string, defender: string, seed: number): string {
  return (seededPick(ASSAULT_LINES, seed) ?? ASSAULT_LINES[0]!)
    .replace(/\{A\}/g, attacker).replace(/\{D\}/g, defender);
}

// A beast/environment mauling of a patrol. {F} = the patrol's faction name.
const MAUL_LINES: readonly string[] = [
  'Wasteland beasts fell on a {F} patrol — none rode home.',
  'A {F} patrol wandered into a nest of drones and was torn apart.',
  'Something in the silt took a {F} patrol whole. Only tracks remained.',
  'A {F} column was run down by wasteland predators.',
  'The dunes swallowed a {F} patrol in a storm; the sand kept them.',
  'A rust-ghoul pack ran a {F} patrol to ground and left nothing.',
  'A {F} patrol drank from a bad spring and never woke.',
  'Sinkholes took half a {F} column; the beasts took the rest.',
  'A {F} patrol was caught in the open by a silt-wyrm and unmade.',
  'Carrion-drones stripped a {F} patrol before the sun was high.',
  'A {F} patrol chased shade into a predator warren and did not return.',
  'The flats went quiet where a {F} patrol had been — only their gear was found.',
  'A cave-in buried a {F} patrol scouting the old tunnels.',
  'A {F} patrol froze in a night squall miles from any fire.',
  'Something large crossed a {F} patrol in the dark. Come morning, nothing.',
  'A {F} patrol was mobbed by burrow-things and dragged under.',
];

/** A world-board line for a beast/environment mauling. */
export function patrolMaulLine(faction: string, seed: number): string {
  return (seededPick(MAUL_LINES, seed) ?? MAUL_LINES[0]!).replace(/\{F\}/g, faction);
}

// OTA-868 — a PITCHED BLOC BATTLE: allied war-parties pile into a clash and it becomes a
// coalition engagement. {W}=winning bloc's lead faction, {L}=losing bloc's lead, {N}=total
// war-parties lost across both sides.
const BLOC_LINES: readonly string[] = [
  'A pitched battle erupted in the open waste — the {W} and their allies shattered the {L} coalition. {N} war-parties fell.',
  'Banners of the {W} drew their allies in and rolled over the {L} host; {N} columns lay broken by dusk.',
  'The {W} bloc met the {L} coalition in force at a dry crossroads — a true battle, and {N} patrols never rode home.',
  'Allies of the {W} converged on a {L} war-party and turned a skirmish into a slaughter. {N} columns lost.',
  'The {L} coalition made a stand; the {W} and their sworn broke it, at a cost of {N} war-parties all told.',
  'Two blocs collided near the flats — the {W} and their allies held the field, the {L} left {N} columns in the dust.',
  'A running bloc-battle raged for hours; the {W} coalition ground down the {L}, {N} patrols spent between them.',
  'The {W} rallied their allies and enveloped the {L} host in the open — {N} war-parties broke.',
  'What began as one clash pulled in whole alliances; the {W} bloc carried it, {N} columns fallen.',
  'The {L} coalition was caught between the {W} and their allies and cut to pieces — {N} war-parties lost.',
  'Sworn banners answered the call on both sides; the {W} out-bled the {L}, {N} columns gone to the sand.',
  'A set-piece battle of blocs near the ruins — the {W} and allies stood; the {L} coalition shattered, {N} patrols lost.',
];

/** A world-board line for a pitched bloc battle. `casualties` fills {N}. */
export function blocBattleLine(winnerLead: string, loserLead: string, casualties: number, seed: number): string {
  return (seededPick(BLOC_LINES, seed) ?? BLOC_LINES[0]!)
    .replace(/\{W\}/g, winnerLead).replace(/\{L\}/g, loserLead).replace(/\{N\}/g, String(Math.max(1, casualties)));
}
