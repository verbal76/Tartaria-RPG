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
import type { PlayerCharacter } from './types';

export type PressureTier = 'salvage' | 'owed' | 'let_it_come' | 'bury_me';

/** Ascending. Index IS the ordering, and canChangeTo is the only place that
 *  matters — a tier's position must never be inferred anywhere else. */
export const PRESSURE_ORDER: readonly PressureTier[] = ['salvage', 'owed', 'let_it_come', 'bury_me'] as const;

/** ⚠ What every save written before this OTA gets, and what the picker starts
 *  on. 'owed' is the game as it has always played, plus the two new systems at
 *  their gentlest — which is the whole point of the phase — and anybody who
 *  finds that too much can drop to 'salvage' from Settings without abandoning
 *  the character. That escape hatch is why the default can be honest. */
export const DEFAULT_PRESSURE: PressureTier = 'owed';

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
}

export const PRESSURE_PROFILES: Record<PressureTier, PressureProfile> = {
  salvage: {
    id: 'salvage',
    label: '"I only came for the salvage."',
    subtitle: 'The mud lets you work. Time costs nothing, old grudges stay cold, and the weather is only weather.',
    tide: 0, hostile: 0, creep: 0.5, exposure: 0.5,
  },
  owed: {
    id: 'owed',
    label: '"I know what I owe."',
    subtitle: 'The intended run. The clock is real, the factions remember, and none of it is beyond managing.',
    tide: 1, hostile: 1, creep: 1, exposure: 1,
  },
  let_it_come: {
    id: 'let_it_come',
    label: '"Let it come."',
    subtitle: 'Supplies thin faster, the ones you have crossed start finding you, and a storm is a reason to stop.',
    tide: 1.8, hostile: 1.7, creep: 1.5, exposure: 1.4,
  },
  bury_me: {
    id: 'bury_me',
    label: '"Bury me with them."',
    subtitle: 'The buried country collects everything it is owed. Nothing here is tuned to be survivable.',
    tide: 2.8, hostile: 2.5, creep: 2, exposure: 1.8,
  },
};

export function isPressureTier(v: string | undefined | null): v is PressureTier {
  return !!v && (PRESSURE_ORDER as readonly string[]).includes(v);
}

/** The tier this character is playing. Absent = DEFAULT_PRESSURE, which is
 *  what every pre-OTA-1089 save reads as. Tolerant of a junk value from a
 *  hand-edited or newer save rather than throwing at it. */
export function pressureOf(p: Pick<PlayerCharacter, 'pressure'> | null | undefined): PressureTier {
  return isPressureTier(p?.pressure) ? p!.pressure! : DEFAULT_PRESSURE;
}

export function profileOf(p: Pick<PlayerCharacter, 'pressure'> | null | undefined): PressureProfile {
  return PRESSURE_PROFILES[pressureOf(p)];
}

/** ⚠ LOWER ONLY, EVER. The owner's rule, and the right one: a player who is
 *  drowning can always ask for less, and nobody gets to finish a run on
 *  "Bury me with them" that they spent on "I only came for the salvage."
 *  Equality is allowed so a no-op tap is not an error. */
export function canChangeTo(from: PressureTier, to: PressureTier): boolean {
  return PRESSURE_ORDER.indexOf(to) <= PRESSURE_ORDER.indexOf(from);
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

/** One line for the Settings row / character sheet, so a player can always see
 *  what they are playing without going back to a screen that no longer exists. */
export function pressureSummary(p: Pick<PlayerCharacter, 'pressure'> | null | undefined): string {
  const prof = profileOf(p);
  return `${prof.label} — ${prof.subtitle}`;
}
