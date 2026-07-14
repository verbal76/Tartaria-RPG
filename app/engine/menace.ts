// OTA-1093 — Menace: the price of ruling by fear. Intimidation is powerful — you can
// skip fights and extort goods — so the world answers. Every time you lean on a
// threat, your MENACE climbs, and menace has teeth in three directions:
//   1. Self-blunting — the more feared you are, the more braced everything is for
//      you, so your intimidate DC creeps up. Over-rely on the threat and the threat
//      stops working, forcing you back to the blade or the honest word.
//   2. Encounter pressure — a known menace draws readier, meaner encounters.
//   3. Decay — stop trading on fear and, over game-time, the reputation fades.
//
// Menace is VISIBLE on the character portrait (see CharacterScreen) so the player
// owns the trade-off rather than eating mystery difficulty.

/** Menace gained per intimidation ATTEMPT (win or lose — the word gets out either
 *  way). People remember a shakedown harder than a spooked animal does. */
export const MENACE_PER_INTIMIDATE_PERSON = 8;
export const MENACE_PER_INTIMIDATE_ANIMAL = 4;

/** Menace bled off per in-game hour once you stop. Slow — a reputation for cruelty
 *  doesn't evaporate overnight. */
export const MENACE_DECAY_PER_HOUR = 0.4;

/** Menace is uncapped in principle but the effects plateau; this bounds the store
 *  value so a long session can't overflow it into nonsense. */
export const MENACE_MAX = 100;

/** Lazily decay a stored menace value to "now" (game-hours). Pure. */
export function decayedMenace(menace: number, lastHour: number, nowHour: number): number {
  const elapsed = Math.max(0, nowHour - lastHour);
  return Math.max(0, menace - elapsed * MENACE_DECAY_PER_HOUR);
}

/** How much your reputation adds to an intimidate DC (the self-blunting tax). +1 per
 *  20 menace, so it ramps slowly and never fully locks intimidation out. */
export function menaceIntimidateDcBonus(menace: number): number {
  return Math.floor(Math.max(0, menace) / 20);
}

/** Extra encounter pressure from menace, as a 0..~0.25 multiplier the encounter roll
 *  can fold into its spawn chance. Caps so a feared player isn't buried in fights. */
export function menaceEncounterBonus(menace: number): number {
  return Math.min(0.25, Math.max(0, menace) / 400);
}

export type MenaceTier = 'Unremarkable' | 'Noticed' | 'Feared' | 'Dreaded';

/** The label shown on the portrait, so "Menace" reads as an identity, not a number. */
export function menaceTier(menace: number): MenaceTier {
  if (menace < 10) return 'Unremarkable';
  if (menace < 35) return 'Noticed';
  if (menace < 70) return 'Feared';
  return 'Dreaded';
}

/** Add menace for an intimidation attempt, clamped. Pure. */
export function raiseMenace(current: number, kind: 'person' | 'animal'): number {
  const add = kind === 'person' ? MENACE_PER_INTIMIDATE_PERSON : MENACE_PER_INTIMIDATE_ANIMAL;
  return Math.min(MENACE_MAX, Math.max(0, current) + add);
}
