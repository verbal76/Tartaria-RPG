// OTA-1089 — PHASE 4: LET THE DEBT COME DUE, BEHIND A DIFFICULTY TOGGLE.
//
// The build plan: "the ledger actually calls. Corruption, standing and elapsed
// time produce consequences you can feel. You have every substrate already —
// hoursElapsed, weather, corruption, faction standing — none of it currently
// threatens anything." And, in the same breath, the warning that decided the
// shape of this file: "⚠ HIGHEST RISK OF MAKING THE GAME WORSE. Overtuned
// pressure in a game with no fail-forward is punishing. Ship it behind a
// difficulty toggle and tune from logs."
//
// ── WHY EVERY NUMBER IN THE GAME IS NOT IN HERE ──────────────────────────
// Corruption and weather already bite (corruption.ts stat penalties, price
// multiplier, extra encounters; weatherEffects.ts reposition cost, attack
// penalty, HP and corruption ticks). Those are shipped, played and balanced.
// Re-scaling them from here would put a difficulty multiplier on top of a
// year of tuning and quietly invalidate all of it.
//
// So Phase 4 turns the two substrates that genuinely threaten NOTHING today —
// elapsed time and faction standing — into pressure, and increases the RATE at
// which the other two accumulate rather than what they do when they land:
//
//   TIDE       (time)       — the buried country gets leaner the longer you
//                             stay. Prices drift, and the Arbiter says so.
//   HOSTILE    (standing)   — a faction that hates you starts finding you.
//   CREEP      (corruption) — weather notches corruption into you faster.
//   EXPOSURE   (weather)    — a storm takes a heavier bite.
//
// Four dials, four substrates, one profile per tier. Everything a consumer
// needs is a single multiplier, which is what makes this tunable from the
// owner's pasted logs instead of from a rewrite.
//
// ── THE TOGGLE ───────────────────────────────────────────────────────────
// Chosen at character creation, on the step after "why did you come down?" —
// so the last thing you say before walking is how much the mud is allowed to
// take. Owner's call on the names (Doom-shaped, first person) and on the
// change rule: ⚠ IT CAN BE LOWERED MID-RUN AND NEVER RAISED. You can always
// ask the buried country for less; you cannot retroactively claim you took
// more. See canChangeTo.
// ⚠⚠ OTA-1136 — THE RULE ABOVE IS NOW EXPLICITLY AMENDED, ON THE OWNER'S CALL.
//
// Everything above this line is the ORIGINAL design and it still holds for the
// four dials it shipped with. But its founding restriction — "pressure only
// owns substrates that threatened NOTHING before; re-scaling an already-tuned
// system would put a difficulty multiplier on top of a year of balance work" —
// was written when pressure was a two-system experiment bolted onto a shipped
// game. The owner's instruction, after reading a survey of how the industry
// actually builds difficulty: "let's make the difficulty tiers mean something,
// the effects should be game wide."
//
// That is a deliberate reversal, made with the trade understood, so it is
// written down rather than quietly worked around:
//   • WHAT WE GIVE UP — the guarantee that a fight at 'owed' is the fight a
//     year of tuning produced. It still is, because 'owed' is the identity row
//     of every dial below (all 1.0 / unchanged). What we give up is the
//     guarantee for the OTHER tiers, which now genuinely diverge.
//   • WHY IT IS WORTH IT — a difficulty setting that only touches prices,
//     patrols and weather is not a difficulty setting, it is a weather
//     setting. Players read "difficulty" as "how hard are the fights".
//   • ⚠ WHAT PROTECTS THE TUNING — the identity row. Every dial is defined so
//     that 'owed' changes nothing, and every consumer must be written so that
//     the 'owed' value is a mathematical no-op, not a value that happens to be
//     close. The tests enforce this: see ota1136DifficultySystems.
//
// ── THE THREE LEVER TYPES ────────────────────────────────────────────────
// From the survey, and worth keeping in view because it predicts which of
// these will feel good:
//   MULTIPLIERS    cheap to build, feel fake at extremes (damage sponges).
//   RULE CHANGES   free to compute, feel meaningful (permadeath, save limits,
//                  no auto-identify). The best value in the list.
//   CONTENT SWAPS  expensive, best feel ("three grunts become one elite").
// The registry below is tagged by type so a future dial is added with its
// cost/benefit visible rather than defaulting to a multiplier because a
// multiplier is a config value.
//
// ⚠ AND THE TRAP THIS GAME HAS ALREADY HIT ONCE: damage sponges. OTA-1111
// shipped guard-crack precisely because resisted fights refused to end, and
// combatStress exists to measure stall rate. So NO dial here scales enemy HP
// or damage, and the pack-size dial is paired with the swing cap (OTA-1112) in
// its consumer — growing the pack without growing the cap turns 'bury_me' into
// a stall generator, which is longer rather than harder.
import type { PlayerCharacter } from './types';

export type PressureTier = 'salvage' | 'owed' | 'let_it_come' | 'bury_me' | 'custom';

/** Ascending. Index IS the ordering, and canChangeTo is the only place that
 *  matters — a tier's position must never be inferred anywhere else.
 *  ⚠ OTA-1136 — 'custom' is deliberately NOT in this list. It has no position
 *  on a one-dimensional ladder because it is not a point on one: it is a set of
 *  per-system choices. See canChangeTo for how the lower-only rule survives
 *  that. */
export const PRESSURE_ORDER: readonly Exclude<PressureTier, 'custom'>[] = ['salvage', 'owed', 'let_it_come', 'bury_me'] as const;

/** The four presets, in picker order — 'custom' is offered alongside them but
 *  is not one of them. */
export const PRESET_TIERS: readonly Exclude<PressureTier, 'custom'>[] = PRESSURE_ORDER;

/** ⚠ What every save written before this OTA gets, and what the picker starts
 *  on. 'owed' is the game as it has always played, plus the two new systems at
 *  their gentlest — which is the whole point of the phase — and anybody who
 *  finds that too much can drop to 'salvage' from Settings without abandoning
 *  the character. That escape hatch is why the default can be honest. */
export const DEFAULT_PRESSURE: Exclude<PressureTier, 'custom'> = 'owed';

export interface PressureProfile {
  id: PressureTier;
  /** The button. First person, the way Doom's are — this is the player's own
   *  answer to the Arbiter, not a label on a slider. */
  label: string;
  /** One line under it, saying plainly what changes. A difficulty name that
   *  sounds good and explains nothing is a trap on a screen you cannot revisit. */
  subtitle: string;
  /** TIDE — how hard elapsed time presses. 0 disables it outright. */
  tide: number;
  /** HOSTILE — how readily a faction you have wronged comes looking. 0 = never. */
  hostile: number;
  /** CREEP — multiplier on corruption GAINED from weather. Not on what
   *  corruption does; see the header. */
  creep: number;
  /** EXPOSURE — multiplier on weather HP bite. Same rule. */
  exposure: number;

  // ── OTA-1136 — THE GAME-WIDE DIALS ────────────────────────────────────
  // Every one of these is defined so that 'owed' is a mathematical no-op.
  // A consumer that cannot honour that must not use the dial.

  /** MULTIPLIER — the wasteland encounter roll. 1.0 = the shipped 0.29 /
   *  0.225 (OTA-1134). Scales the chance a step produces an encounter AT
   *  ALL; what KIND it produces is `discovery` below. */
  spawn: number;
  /** MULTIPLIER — how generous the world is with the encounters that HELP:
   *  vendors, treasure caches, fusion benches, hidden sites. Deliberately a
   *  SEPARATE dial from `spawn`, because the encounter roll produces both
   *  danger and help from one number — scaling only the roll would make a
   *  hard run scarcer in vendors as well as thicker in enemies, which is two
   *  punishments billed as one. Above 1.0 a gentler tier finds MORE help. */
  discovery: number;
  /** MULTIPLIER — bodies in an attack party. The owner asked for both
   *  directions: 'salvage' shrinks packs, 'bury_me' grows them. ⚠ Its
   *  consumer MUST scale the OTA-1112 swing cap alongside it; see the header. */
  pack: number;
  /** MULTIPLIER — loot found per tile. ⚠ Kept gentle on purpose: this stacks
   *  with TIDE's price drift, and cutting supply while raising prices is the
   *  resource-starvation trap — tedium, not tension. */
  loot: number;
  /** CONTENT SWAP — chance a would-be group of grunts arrives instead as one
   *  tougher body. The survey's "this is the good one": same encounter count,
   *  completely different fight, and no damage sponge anywhere in it. 0 =
   *  never. */
  elite: number;
  /** RULE CHANGE — does an unidentified curio stay unidentified? The game
   *  already HAS an identification system (static inference → Qwen synthesis);
   *  this decides whether it runs for free. false = the row resolves itself
   *  as it always has. */
  witholdIdentity: boolean;
  /** RULE CHANGE — does the enemy panel show weakness / resist tags the
   *  bestiary has NOT yet earned? false = current behaviour (shown once
   *  discovered). true = discovery only, nothing given away. */
  witholdIntel: boolean;

  // ── OTA-1194 — THE THREE COMBAT-FEEL DIALS ────────────────────────────
  // Owner, after the OTA-1192/1193 balance pass landed: *"if I'm tuning this to
  // be normal difficulty level just above the bottom, can you use this as a
  // baseline and tune the other levels accordingly."*
  //
  // ⚠ WHY THESE THREE AND NOT A NEW MULTIPLIER. OTA-1190 through 1193 changed
  // how the game FEELS in a fight — the hunt scaler learned to read gear, HP
  // regen moved to per-tile, and dodge got a cooldown. Every one of those is a
  // GLOBAL constant. So the gentlest tier took the identical nerf the owner's
  // over-geared run did, and the player least able to absorb it absorbed all of
  // it. A difficulty ladder whose rungs cannot express the levers that actually
  // decide whether you feel invincible is not a ladder.
  //
  // ⚠⚠ AND `gearBlend` KNOWINGLY CROSSES THIS FILE'S OWN LINE — recorded here
  // rather than quietly worked around, the same way OTA-1136 recorded its
  // reversal. The header says: *"NO dial here scales enemy HP or damage."* This
  // one does, at one remove: it changes how much of your kit `overLevelT` can
  // see, which moves the spawn's tier, which moves its stats.
  //   • WHY IT IS STILL RIGHT — the prohibition exists to forbid DAMAGE SPONGES
  //     (see OTA-1111 guard-crack and the combatStress stall metric). This is
  //     the opposite failure mode: the complaint is that a fully-kitted
  //     character fights the world a fresh arrival fights. Scaling the blend
  //     makes the world MATCH the player rather than inflating a health bar,
  //     and the fight still ends in the same number of rounds.
  //   • ⚠ WHAT STILL PROTECTS THE TUNING — the identity row, unchanged. At
  //     'owed' all three are exact no-ops (0 rounds of change, ×1, ×1), so the
  //     baseline the owner is playing right now is the baseline that ships.

  /** MULTIPLIER on `DODGE_COOLDOWN_ROUNDS` (3). ⚠ `salvage` is **0**, i.e. no
   *  cooldown at all — deliberately the pre-OTA-1193 behaviour, because the
   *  free-dodge loop is exactly the safety net a struggling player is asking
   *  for when they pick the gentlest tier. Written as thirds so the product is
   *  a whole number of rounds and the intent is readable at the call site. */
  dodgeLock: number;
  /** MULTIPLIER on HP regen from worn armour. ⚠ Only the PER-TILE HP half —
   *  stamina regen is untouched, for the same reason OTA-1192 left it alone
   *  (it is barely a combat resource, and tiles already drain it). Above 1.0 a
   *  gentler tier mends faster on the road. */
  mend: number;
  /** MULTIPLIER on `GEAR_POWER_BLEND` (0.5). 1.0 = the shipped half weight. At
   *  `bury_me` this reaches **2.0 → the full designed weight of 1.0**, which
   *  OTA-1182 wrote and then deliberately shipped at half awaiting device
   *  evidence: the top tier is where that evidence costs least. ⚠ It can never
   *  make the world EASIER than authored — `gearPowerTerm` clamps both terms at
   *  0 above a fresh-arrival baseline, so a multiplier only scales something
   *  already non-negative. */
  gearBlend: number;

  // ⚠ OTA-1140 — THE `hunger` DIAL IS GONE, AND THIS IS WHY.
  // OTA-1136 wrote it as "MULTIPLIER — hunger clock rate. 1.0 = +1 stamina
  // penalty per 8 in-game hours, exactly as shipped." That description was
  // wrong when it was written. Hunger had ALREADY been removed from the game:
  // `effectiveStaminaMax` ignores `hungerStaminaPenalty` outright, and both
  // accrual sites are hardcoded to 0. The comment at the removal says why —
  // *"a hidden, unexplained mechanic whose ONLY effect was shrinking this cap;
  // food already tops off HP and water already tops off stamina, so it just
  // added invisible friction."*
  // So the dial was a control over nothing: checkable in the CUSTOM picker,
  // scaled by every tier, and incapable of changing a single number. A switch
  // that does nothing is worse than a missing one, because the player believes
  // it. Reviving hunger to give it something to do would be reversing a shipped
  // design decision to justify a config field, which is exactly backwards — so
  // the field goes and the decision stands. If hunger ever comes back as a
  // mechanic the owner wants, a dial for it is four lines.
}

/** ⚠ Keyed by PRESET, not by PressureTier: 'custom' deliberately has no
 *  profile of its own. It is not a fifth set of numbers, it is a per-system
 *  composition of these four, resolved by dialOf(). */
export const PRESSURE_PROFILES: Record<Exclude<PressureTier, 'custom'>, PressureProfile> = {
  salvage: {
    id: 'salvage',
    label: '"I only came for the salvage."',
    subtitle: 'The mud lets you work. Time costs nothing, old grudges stay cold, and the weather is only weather.',
    tide: 0, hostile: 0, creep: 0.5, exposure: 0.5,
    spawn: 0.6, discovery: 1.4, pack: 0.7, loot: 1.25, elite: 0,
    witholdIdentity: false, witholdIntel: false,
    // ⚠ dodgeLock 0 = NO cooldown, the pre-OTA-1193 game. This tier's whole
    // promise is "the mud lets you work"; taking the safety net away from the
    // player who asked for one is the wrong direction on the wrong rung.
    dodgeLock: 0, mend: 1.5, gearBlend: 0.5,
  },
  owed: {
    id: 'owed',
    label: '"I know what I owe."',
    subtitle: 'The intended run. The clock is real, the factions remember, and none of it is beyond managing.',
    tide: 1, hostile: 1, creep: 1, exposure: 1,
    // ⚠ THE IDENTITY ROW. Every value here must be a no-op. This is what
    // protects a year of combat tuning from the amendment in the header, and
    // ota1136DifficultySystems asserts it verbatim.
    spawn: 1, discovery: 1, pack: 1, loot: 1, elite: 0,
    witholdIdentity: false, witholdIntel: false,
    // ⚠ THE IDENTITY ROW CONTINUES. 1 × 3 rounds = the shipped 3, ×1 regen, and
    // ×1 on a GEAR_POWER_BLEND that is itself already 0.5. This is the tier the
    // owner is playing while tuning, so it must remain the thing that ships.
    dodgeLock: 1, mend: 1, gearBlend: 1,
  },
  let_it_come: {
    id: 'let_it_come',
    label: '"Let it come."',
    subtitle: 'Supplies thin faster, the ones you have crossed start finding you, and a storm is a reason to stop.',
    tide: 1.8, hostile: 1.7, creep: 1.5, exposure: 1.4,
    spawn: 1.35, discovery: 0.85, pack: 1.3, loot: 0.85, elite: 0.15,
    witholdIdentity: true, witholdIntel: false,
    // 4/3 × 3 = 4 rounds. Written as a fraction of the base so the whole-number
    // intent survives someone re-tuning DODGE_COOLDOWN_ROUNDS.
    dodgeLock: 4 / 3, mend: 0.75, gearBlend: 1.5,
  },
  bury_me: {
    id: 'bury_me',
    label: '"Bury me with them."',
    subtitle: 'The buried country collects everything it is owed. Nothing here is tuned to be survivable.',
    tide: 2.8, hostile: 2.5, creep: 2, exposure: 1.8,
    // ⚠ `loot` bottoms out at 0.7, not lower. Below that the run stops being
    // hard and starts being unplayable-by-attrition, which the survey names as
    // the resource-starvation trap. The difficulty here is meant to come from
    // `elite` and `pack`, not from an empty world.
    spawn: 1.7, discovery: 0.7, pack: 1.6, loot: 0.7, elite: 0.3,
    witholdIdentity: true, witholdIntel: true,
    // 5/3 × 3 = 5 rounds — roughly one dodge per two ordinary skirmishes.
    // ⚠ It stops at 5 rather than climbing further: raiders die in 2-4 rounds,
    // so a longer lock would delete the stance from normal play rather than
    // rationing it, and a tool you never get to use is not a harder game.
    // ⚠ gearBlend 2 takes GEAR_POWER_BLEND to its full designed 1.0 — the
    // weight OTA-1182 wrote and shipped at half pending evidence.
    dodgeLock: 5 / 3, mend: 0.5, gearBlend: 2,
  },
};

export function isPressureTier(v: string | undefined | null): v is PressureTier {
  // ⚠ OTA-1136 — 'custom' IS a valid tier and must validate here, even though
  // it is deliberately absent from PRESSURE_ORDER (it has no rung on the
  // ladder — see canChangeTo). Testing membership of the ORDER alone silently
  // demoted every custom character to the default: pressureOf fell through to
  // DEFAULT_PRESSURE, and the whole picker did nothing.
  return !!v && ((PRESSURE_ORDER as readonly string[]).includes(v) || v === 'custom');
}

/** The tier this character is playing. Absent = DEFAULT_PRESSURE, which is
 *  what every pre-OTA-1089 save reads as. Tolerant of a junk value from a
 *  hand-edited or newer save rather than throwing at it. */
export function pressureOf(p: Pick<PlayerCharacter, 'pressure'> | null | undefined): PressureTier {
  return isPressureTier(p?.pressure) ? p!.pressure! : DEFAULT_PRESSURE;
}

/** ⚠ OTA-1136 — COMPOSES for a CUSTOM character. Every consumer that already
 *  read `profileOf(player).tide` keeps working and becomes custom-aware for
 *  free, without each site having to learn that a fifth tier exists. A preset
 *  returns its own row untouched (same object identity as before), so this is
 *  a no-op for every run that is not custom. */
export function profileOf(
  p: (Pick<PlayerCharacter, 'pressure'> & { pressureCustom?: unknown }) | null | undefined,
): PressureProfile {
  const tier = pressureOf(p);
  if (tier !== 'custom') return PRESSURE_PROFILES[tier];
  const custom = normalizeCustom(p?.pressureCustom);
  const on = PRESSURE_PROFILES[custom.intensity];
  const off = PRESSURE_PROFILES[DEFAULT_PRESSURE];
  const has = (id: DifficultySystemId): boolean => custom.systems.includes(id);
  const pickOf = (id: DifficultySystemId): PressureProfile => (has(id) ? on : off);
  return {
    id: 'custom' as PressureTier,
    label: on.label,
    subtitle: on.subtitle,
    tide: pickOf('tide').tide,
    hostile: pickOf('hostile').hostile,
    creep: pickOf('creep').creep,
    exposure: pickOf('exposure').exposure,
    spawn: pickOf('spawn').spawn,
    discovery: pickOf('discovery').discovery,
    pack: pickOf('pack').pack,
    loot: pickOf('loot').loot,
    elite: pickOf('elite').elite,
    witholdIdentity: pickOf('identity').witholdIdentity,
    witholdIntel: pickOf('intel').witholdIntel,
    // OTA-1194 — each governed by its own switch, so "let it come, but leave my
    // dodge alone" is expressible like every other system here.
    dodgeLock: pickOf('dodgeLock').dodgeLock,
    mend: pickOf('mend').mend,
    gearBlend: pickOf('gearBlend').gearBlend,
  };
}

/** ⚠ LOWER ONLY, EVER. The owner's rule, and the right one: a player who is
 *  drowning can always ask for less, and nobody gets to finish a run on
 *  "Bury me with them" that they spent on "I only came for the salvage."
 *  Equality is allowed so a no-op tap is not an error.
 *
 *  ⚠ OTA-1136 — AND CUSTOM DOES NOT GET TO BE A BACK DOOR. A set of per-system
 *  switches has no position on a one-dimensional ladder, which is exactly the
 *  shape a player could have used to climb: pick 'salvage', then "customise"
 *  to bury_me numbers on every system and call it a sidegrade. So a custom
 *  configuration is ranked by its INTENSITY, and a custom→custom change must
 *  additionally only ever REMOVE systems. You can always ask for less of it,
 *  and for fewer of them; never more of either. */
export function canChangeTo(
  from: PressureTier,
  to: PressureTier,
  opts?: { fromCustom?: unknown; toCustom?: unknown },
): boolean {
  const rank = (t: PressureTier, c: unknown): number =>
    PRESSURE_ORDER.indexOf(t === 'custom' ? normalizeCustom(c).intensity : t);
  const fromRank = rank(from, opts?.fromCustom);
  const toRank = rank(to, opts?.toCustom);
  if (toRank > fromRank) return false;
  if (from === 'custom' && to === 'custom') {
    // Same intensity or lower is not enough — the SET has to shrink too.
    const had = new Set(normalizeCustom(opts?.fromCustom).systems);
    return normalizeCustom(opts?.toCustom).systems.every((id) => had.has(id));
  }
  return true;
}

// ── TIDE ──────────────────────────────────────────────────────────────────
// The one substrate the plan singles out as tracked-and-inert: hoursElapsed
// moves all game long and threatens nothing. It now buys scarcity.

/** In-game hours per tide stage at tide 1.0. Roughly four days — long enough
 *  that a session does not walk through two of them. */
export const TIDE_HOURS_PER_STAGE = 96;
/** ⚠ HARD CEILING on stages, so a long run cannot price itself out of the
 *  game. At the top tier this caps the drift at TIDE_MAX_STAGES steps and
 *  stops; there is no runaway. */
export const TIDE_MAX_STAGES = 6;
/** Price drift per stage. 4% compounding would be brutal; this is flat. */
export const TIDE_PRICE_PER_STAGE = 0.04;

/** How far the tide has come in for this character. Integer, monotonic in
 *  hours, and 0 for the whole of 'salvage'. */
export function tideStage(hoursElapsed: number, profile: PressureProfile): number {
  if (profile.tide <= 0) return 0;
  const raw = Math.floor((Math.max(0, hoursElapsed) * profile.tide) / TIDE_HOURS_PER_STAGE);
  return Math.min(TIDE_MAX_STAGES, raw);
}

/** What a vendor's asking price is multiplied by. 1.0 at stage 0, so a fresh
 *  character and every 'salvage' run see exactly today's economy. */
export function tidePriceMultiplier(stage: number): number {
  return 1 + Math.max(0, Math.min(TIDE_MAX_STAGES, stage)) * TIDE_PRICE_PER_STAGE;
}

/** Said once, when a stage turns over. The pressure has to be LEGIBLE or it is
 *  just a number quietly getting worse, which is the failure mode the plan is
 *  warning about. */
export function tideCrossLine(stage: number): string | null {
  const lines: Record<number, string> = {
    1: 'The stalls are the same stalls, and the prices are not. Somebody upstream has started keeping more back.',
    2: 'Two of the roadside pitches you knew are gone, and the ones still standing have less on the cloth.',
    3: 'Everything costs what it costs now, and nobody apologises for it. The season has turned against buyers.',
    4: 'You are quoted a figure for rope that would have bought a weapon when you came down.',
    5: 'The traders have stopped pretending there will be more next month. What is on the table is the stock.',
    6: 'It is as thin as it gets. Whatever you are still carrying is worth more than what anybody will sell you.',
  };
  return lines[stage] ?? null;
}

// ── HOSTILE GROUND ────────────────────────────────────────────────────────
// Standing already moves and already reads as a number on a screen. Below
// this, the people it belongs to start looking for you.

/** Standing at or under this is not "disliked", it is hunted. */
export const HOSTILE_STANDING = -25;
/** Base chance per qualifying step that a hostile faction finds you, before
 *  the tier dial. Deliberately low — this stacks on the encounter roll that
 *  already exists, and doubling a player's ambush rate is how pressure stops
 *  being pressure and starts being an unplayable tile. */
export const HOSTILE_BASE_CHANCE = 0.05;
/** ⚠ And a ceiling on the result, so no combination of tier and standing can
 *  make the road impassable. */
export const HOSTILE_MAX_CHANCE = 0.22;

/** The chance a faction you have wronged catches up with you on this step.
 *  Zero when nobody hates you enough, and zero for the whole of 'salvage'. */
export function hostileHuntChance(
  standings: readonly { factionId: string; standing: number }[],
  profile: PressureProfile,
): number {
  if (profile.hostile <= 0) return 0;
  const worst = standings.reduce((m, s) => Math.min(m, s.standing), 0);
  if (worst > HOSTILE_STANDING) return 0;
  // One extra step of chance for every full HOSTILE_STANDING past the line, so
  // being loathed by one faction is worse than being disliked by four.
  const depth = 1 + Math.floor((HOSTILE_STANDING - worst) / Math.abs(HOSTILE_STANDING));
  return Math.min(HOSTILE_MAX_CHANCE, HOSTILE_BASE_CHANCE * depth * profile.hostile);
}

/** Who is hunting, or null. The worst standing wins; ties break on faction id
 *  so the same save always names the same people. */
export function worstStandingFaction(
  standings: readonly { factionId: string; standing: number }[],
): string | null {
  const bad = standings.filter((s) => s.standing <= HOSTILE_STANDING);
  if (bad.length === 0) return null;
  return [...bad].sort((a, b) => a.standing - b.standing || a.factionId.localeCompare(b.factionId))[0]!.factionId;
}

// ── CREEP + EXPOSURE ──────────────────────────────────────────────────────
// These do NOT change what corruption or weather DO. They change how fast you
// take them on. See the header for why that distinction is load-bearing.

/** Corruption gained from a weather tick, after the tier dial. Rounds AWAY
 *  from zero so a dial below 1 can soften a tick without silently erasing it —
 *  'salvage' should be gentler, not immune. */
export function scaledCorruptionGain(raw: number, profile: PressureProfile): number {
  if (raw <= 0) return raw;
  return Math.max(1, Math.round(raw * profile.creep));
}

/** Weather HP bite, after the tier dial. `raw` is negative. */
export function scaledWeatherBite(raw: number, profile: PressureProfile): number {
  if (raw >= 0) return raw;
  return Math.min(-1, Math.round(raw * profile.exposure));
}


// ── OTA-1136 — CUSTOM: PICK THE INTENSITY, THEN PICK WHAT IT TOUCHES ──────
//
// Owner: "create a custom selection that fires a popup and lets you check what
// systems they want to effect."
//
// The survey's cleanest pattern in the medium is the roguelite one — Slay the
// Spire's Ascension, Hades' Heat — where difficulty is a set of INDEPENDENT,
// legible rules the player assembles, rather than one opaque label. And its
// recommended compromise for everyone else is "presets as the front door,
// custom as an advanced option that maps to the same variables". That is
// exactly this: the four presets stay, and CUSTOM is the same variables with
// the player holding the switches.
//
// The model is deliberately two-part rather than a slider per system:
//   INTENSITY — one preset, borrowed wholesale.
//   SYSTEMS   — which dials that intensity is allowed to touch. Everything
//               unchecked falls back to 'owed', the identity row.
// So "let it come, but only for the fights" is expressible, and so is "bury me
// with them, but leave my loot alone". A per-system slider would have been
// finer-grained and unreadable on a phone, and would have exploded the QA
// surface the survey warns about.

/** The switches the popup renders. `id` is what persists; keep them stable. */
export type DifficultySystemId =
  | 'spawn' | 'discovery' | 'pack' | 'loot' | 'elite'
  | 'identity' | 'intel'
  | 'tide' | 'hostile' | 'creep' | 'exposure'
  // OTA-1194 — the three combat-feel dials.
  | 'dodgeLock' | 'mend' | 'gearBlend';

export interface DifficultySystem {
  id: DifficultySystemId;
  /** Row title in the popup. Plain, not evocative — this screen is a control
   *  panel, and the survey is explicit that a difficulty name which sounds
   *  good and explains nothing is a trap. */
  label: string;
  /** One line saying what actually changes. */
  blurb: string;
  /** Which lever type, so the player can see they are choosing between kinds
   *  of change and not just amounts. */
  kind: 'multiplier' | 'rule' | 'content';
}

export const DIFFICULTY_SYSTEMS: readonly DifficultySystem[] = [
  { id: 'spawn', label: 'Enemy spawn rate', kind: 'multiplier',
    blurb: 'How often crossing open ground turns into a fight.' },
  { id: 'pack', label: 'Attack party size', kind: 'multiplier',
    blurb: 'How many bodies come at you at once.' },
  { id: 'elite', label: 'Elites instead of numbers', kind: 'content',
    blurb: 'A group of common foes sometimes arrives as one dangerous one instead.' },
  // OTA-1194 — grouped with the other fight dials, above the world dials,
  // because these are the three the player will feel first.
  { id: 'dodgeLock', label: 'Dodge recharge', kind: 'multiplier',
    blurb: 'How many beats you spend recovering your footing before you can set for another dodge.' },
  { id: 'mend', label: 'Armour mends you on the road', kind: 'multiplier',
    blurb: 'How much health your worn gear gives back for each tile you cross.' },
  { id: 'gearBlend', label: 'The world reads your kit', kind: 'multiplier',
    blurb: 'How closely what you meet is matched to the armour and weapon you are actually carrying.' },
  { id: 'discovery', label: 'Vendors and hidden places', kind: 'multiplier',
    blurb: 'How readily the world offers you traders, caches and secret sites.' },
  { id: 'loot', label: 'Loot per tile', kind: 'multiplier',
    blurb: 'How much a searched tile gives up.' },
  { id: 'identity', label: 'Unknown items stay unknown', kind: 'rule',
    blurb: 'Curios are not identified for you — what it is, you work out.' },
  { id: 'intel', label: 'No free weakness intel', kind: 'rule',
    blurb: 'Resistances and weaknesses only from the bestiary you earned.' },
  { id: 'tide', label: 'Prices over time', kind: 'multiplier',
    blurb: 'How fast the buried country gets lean and dear.' },
  { id: 'hostile', label: 'Grudges come looking', kind: 'multiplier',
    blurb: 'How readily a faction you have wronged finds you on the road.' },
  { id: 'creep', label: 'Corruption from weather', kind: 'multiplier',
    blurb: 'How fast a storm notches the Aether into you.' },
  { id: 'exposure', label: 'Weather damage', kind: 'multiplier',
    blurb: 'How hard the sky hits when it turns.' },
] as const;

/** What a CUSTOM character stores. Absent on every preset run. */
export interface PressureCustom {
  /** The preset whose numbers the CHECKED systems borrow. Never 'custom'. */
  intensity: Exclude<PressureTier, 'custom'>;
  /** Checked systems. Anything not listed runs at 'owed'. */
  systems: DifficultySystemId[];
}

const DIFFICULTY_SYSTEM_IDS: ReadonlySet<string> = new Set(DIFFICULTY_SYSTEMS.map((d) => d.id));

/** Tolerant of junk from a hand-edited or newer save: unknown ids are dropped
 *  and a bad intensity falls back to the default rather than throwing. */
export function normalizeCustom(v: unknown): PressureCustom {
  const raw = (v ?? {}) as Partial<PressureCustom>;
  const intensity: Exclude<PressureTier, 'custom'> =
    isPressureTier(raw.intensity) && (PRESET_TIERS as readonly string[]).includes(raw.intensity)
      ? (raw.intensity as Exclude<PressureTier, 'custom'>)
      : DEFAULT_PRESSURE;
  const systems = Array.isArray(raw.systems)
    ? raw.systems.filter((id): id is DifficultySystemId => DIFFICULTY_SYSTEM_IDS.has(id as string))
    : [];
  return { intensity, systems: [...new Set(systems)] };
}

/** ⚠ THE ONE ACCESSOR EVERY CONSUMER USES. Reads a single dial for this
 *  character, resolving CUSTOM's per-system choice. Going through here rather
 *  than through profileOf() is what makes CUSTOM work at all: a consumer that
 *  reaches for `profileOf(p).spawn` directly would read the INTENSITY for a
 *  system the player left unchecked. */
export function dialOf<K extends keyof PressureProfile>(
  p: (Pick<PlayerCharacter, 'pressure'> & { pressureCustom?: unknown }) | null | undefined,
  dial: K,
  /** The system switch that governs this dial, when it differs from the dial
   *  name (only `identity` / `intel` do). */
  system: DifficultySystemId = dial as DifficultySystemId,
): PressureProfile[K] {
  void system; // the composition lives in profileOf; kept for call-site clarity
  return profileOf(p)[dial];
}

/** ⚠ PACK SIZE AND THE SWING CAP MOVE TOGETHER, ALWAYS. Growing a pack without
 *  growing OTA-1112's per-round swing cap does not make the fight harder, it
 *  makes it longer — bodies queue up behind a cap that never let them act, and
 *  the sim's stall tail comes straight back. Both consumers call this. */
export function scaledPackSize(base: number, mult: number): number {
  return Math.max(1, Math.round(base * mult));
}

/** ⚠ OTA-1194 — PER-TILE HP REGEN, SCALED BY TIER. Rounds rather than floors, and that
 *  choice is load-bearing in both directions:
 *   • At the cap — `HP_REGEN_CAP` is 2, and the owner's run wears the full 2 — bury_me's
 *     ×0.5 gives 1. That is the real halving, landing exactly where the problem was
 *     measured (he GAINED HP during fights at +2 a round).
 *   • At the margin, a single +1 piece survives: 1 × 0.5 = 0.5, and JS rounds a tie UP.
 *     Flooring would zero it, which turns a worn item into a dead stat and reads as a
 *     bug rather than as difficulty.
 *  ⚠ Never returns more than the base at a tier that is meant to give MORE only because
 *  `mend` says so — there is no clamp to base here on purpose, because salvage's 1.5 is
 *  supposed to exceed it. */
export function scaledRegen(base: number, mult: number): number {
  const m = Number.isFinite(mult) ? Math.max(0, mult) : 1;
  return Math.max(0, Math.round(base * m));
}

/** Deliberately a SMALLER growth than pack size: three more bodies should not
 *  mean three more swings landing every round, or 'bury_me' is a shredder
 *  rather than a harder fight. Grows at the square root, floors at the shipped
 *  cap so no tier can ever swing LESS than the game does today. */
export function scaledSwingCap(base: number, mult: number): number {
  return Math.max(base, Math.round(base * Math.sqrt(Math.max(1, mult))));
}

/** One line for the Settings row / character sheet, so a player can always see
 *  what they are playing without going back to a screen that no longer exists. */
export function pressureSummary(p: Pick<PlayerCharacter, 'pressure'> | null | undefined): string {
  const prof = profileOf(p);
  return `${prof.label} — ${prof.subtitle}`;
}
