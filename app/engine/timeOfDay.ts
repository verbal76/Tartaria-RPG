// 2026-05-25 — time-of-day helpers. Day / night modifiers apply to:
//   - Stealth checks: +1 at night, -1 in the day (the buried world
//     punishes loud daytime sneaks; the silt eats sound after dusk).
//   - Wasteland encounter probability: 1.3× at night, 0.85× during
//     the day. Things that hunt in Tartaria prefer the dark; players
//     who travel and rest after sunset eat the risk.
//
// Period boundaries match describeTime() in gameStore.ts:
//   00:00-06:00 → night
//   06:00-12:00 → morning
//   12:00-18:00 → afternoon
//   18:00-24:00 → evening
//
// "Night" for modifier purposes = evening + night (18:00-06:00).
// Morning + afternoon (06:00-18:00) = "day".

export type DayPeriod = 'night' | 'morning' | 'afternoon' | 'evening';

export function getDayPeriod(hoursElapsed: number | undefined): DayPeriod {
  const total = hoursElapsed ?? 0;
  const hour = Math.floor(((total % 24) + 24) % 24);
  if (hour < 6) return 'night';
  if (hour < 12) return 'morning';
  if (hour < 18) return 'afternoon';
  return 'evening';
}

/** True for evening + night windows (18:00 through 06:00). */
export function isNight(hoursElapsed: number | undefined): boolean {
  const p = getDayPeriod(hoursElapsed);
  return p === 'night' || p === 'evening';
}

/** Modifier added to the d20 + stat total on player stealth checks.
 *  +1 at night, -1 during day. Returns 0 for callers that pass
 *  undefined (defensive — should be rare). */
export function stealthTimeBonus(hoursElapsed: number | undefined): number {
  if (hoursElapsed === undefined || hoursElapsed === null) return 0;
  return isNight(hoursElapsed) ? 1 : -1;
}

/** Multiplier on wasteland encounter rollChance. Night = more
 *  dangerous (1.3×), day = quieter (0.85×). Applied at the call
 *  site as `rollChance * encounterRateMultiplier(hoursElapsed)`. */
export function encounterRateMultiplier(hoursElapsed: number | undefined): number {
  if (hoursElapsed === undefined || hoursElapsed === null) return 1;
  return isNight(hoursElapsed) ? 1.3 : 0.85;
}
