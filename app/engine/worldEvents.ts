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
  /** Nudge the player's standing with a faction. */
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
        rumor: `A ${f.name} warband has taken to the roads in force.`,
        arbiter: `"A ${f.name} warband is abroad," the Arbiter warns. "That is a fight, not a patrol."`,
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
    kind: 'defector', weight: 5, eligible: (ctx) => favored(ctx).length > 0,
    build: (ctx, seed) => {
      const ally = seededPick(favored(ctx), seed)!;
      return {
        kind: 'defector',
        rumor: `A ${ally.name} agent brought you word — they count you a friend now.`,
        effect: { repDelta: { factionId: ally.id, delta: 2 } },
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
      return { kind: 'caravan', rumor: `A ${f.name} caravan was sighted on the trade road, heavy with goods.`, effect: {} };
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
    kind: 'windfall', weight: 4, eligible: (ctx) => favored(ctx).length > 0,
    build: (ctx, seed) => {
      const ally = seededPick(favored(ctx), seed)!;
      return { kind: 'windfall', rumor: `The ${ally.name} shared out a windfall — and remembered your name.`, effect: { repDelta: { factionId: ally.id, delta: 1 } } };
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
}

const PATROL_RADIUS = 3; // how far a patrol strays from its outpost

/** Advance a patrol one wandering step. Deterministic from (phase, tickIndex).
 *  Stays within PATROL_RADIUS of home — beyond it, the step is pulled back toward
 *  home, so the path loops the outpost without ever repeating exactly. Pure. */
export function stepPatrol(p: Patrol, tickIndex: number): Patrol {
  const distX = p.gx - p.homeX, distY = p.gy - p.homeY;
  const manhattan = Math.abs(distX) + Math.abs(distY);
  let dx = 0, dy = 0;
  if (manhattan >= PATROL_RADIUS) {
    // Too far — head back toward home (favor the larger axis).
    if (Math.abs(distX) >= Math.abs(distY)) dx = distX > 0 ? -1 : 1;
    else dy = distY > 0 ? -1 : 1;
  } else {
    // Wander: pick an axis + direction from the hash.
    const h = hash(p.phase * 31 + tickIndex);
    if (h < 0.25) dx = 1; else if (h < 0.5) dx = -1; else if (h < 0.75) dy = 1; else dy = -1;
  }
  return { ...p, gx: p.gx + dx, gy: p.gy + dy };
}

/** Patrols within `radius` (Manhattan) of a cell. Pure. */
export function patrolsNear(patrols: readonly Patrol[], gx: number, gy: number, radius = 2): Patrol[] {
  return patrols.filter((p) => Math.abs(p.gx - gx) + Math.abs(p.gy - gy) <= radius);
}
