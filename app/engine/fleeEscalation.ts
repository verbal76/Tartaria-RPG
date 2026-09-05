// fleeEscalation — OTA-1678, THE CHASE GETS HARDER.
//
// ⚠⚠⚠ THE OWNER'S RULE, IN HIS WORDS: "on the randoms there should be a flee
// escalation. the ones that I'm purposely throwing you head first into some
// big guy because you have to do that to complete or progress a mission or a
// storyline — I don't think there should be a progression on those, only on
// the randoms. I want the rest of the world to be dangerous… if you step into
// danger level 3 you're going to see some big bad guys and there is a chance
// you're going to get stuck having that fight that might end the game for you."
//
// His own log is the measurement behind it: he flees everything at ~100 HP or
// more on random ground and wins the escape roll nearly every time. OTA-1009
// made the flee contested (fastest pursuer's d20 + speed) and OTA-1459 made it
// cost stamina, and neither moved the outcome: the bar is the same on the
// first break as on the fourth, the same on a danger-1 verge as in a danger-5
// pit, and the same for a Legendary as for a rat. So on random ground the bar
// now rises with the three things that should make a chase harder — where you
// are, what is chasing you, and how many times you have already tried — and
// falls when the thing chasing you is bleeding.
//
// ⚠⚠ RANDOM IS DECLARED BY THE PRODUCER, NEVER INFERRED BY THE READER. There is
// no field on an Enemy or a scene that says "this fight is a mission's"; there
// are dozens of scripted spawn sites (hunt stages, core guardians, chain marks,
// captors, summit bosses, hostile traders) and four world rolls (beginScene's
// encounter, the climb encounter, the rest ambush, the patrol crossing). Marking
// the four rolls with `Enemy.unscripted` is the smaller, safer side: a scripted
// body that is ever mis-marked would make a mission fight harder to leave, and
// that is the one thing the owner said must not happen — so the four producers
// stamp it and everything else stays at the OTA-1009 contract by construction.
// A lineup counts as unscripted only when EVERY live body carries the mark: a
// mission mark that joins a roaming pack turns the whole scene scripted, which
// is the direction the rule leans. Bodies from saves written before this OTA
// carry no mark and stay at the old contract until the next roll.
//
// ⚠ Rides on the enemy like `pos` and `coating` (OTA-1506 / OTA-1513): splices,
// kills, saves and loads carry it with no parallel-array bookkeeping.

import type { Enemy, Rarity } from './types';
import { escapePursuit, type EscapePursuit } from './combatRules';

/** +1 per danger level above the frontier: danger 1 adds nothing, danger 5 adds 4. */
export const FLEE_DANGER_STEP = 1;
/** The pursuer's own weight: a Legendary runs you down harder than a rat. */
export const FLEE_RARITY_BONUS: Readonly<Record<Rarity, number>> = {
  Common: 0, Uncommon: 1, Rare: 2, Legendary: 3,
};
/** +2 per failed break THIS ENCOUNTER — they have your measure now. */
export const FLEE_RETRY_STEP = 2;
/** −2 when the pursuer is at or under half HP, −4 at or under a quarter. */
export const FLEE_WOUNDED_HALF = 2;
export const FLEE_WOUNDED_QUARTER = 4;

/** The four world rolls stamp this on every body they place. */
export function markUnscripted<T extends Enemy>(enemies: readonly T[]): T[] {
  return enemies.map((e) => ({ ...e, unscripted: true }));
}

function liveBodies(enemies: readonly Enemy[], hps: readonly number[] | undefined): Array<{ e: Enemy; hp: number }> {
  const out: Array<{ e: Enemy; hp: number }> = [];
  enemies.forEach((e, i) => {
    const hp = hps?.[i] ?? e.hp;
    if (hp > 0) out.push({ e, hp });
  });
  return out;
}

/** True when every LIVE body in the lineup was rolled by the world. An empty
 *  lineup is not a chase at all and answers false. */
export function isUnscriptedLineup(enemies: readonly Enemy[], hps?: readonly number[]): boolean {
  const live = liveBodies(enemies, hps);
  return live.length > 0 && live.every(({ e }) => e.unscripted === true);
}

export interface FleeEscalation {
  danger: number;
  rarity: number;
  retry: number;
  /** Negative or zero. */
  wounded: number;
  total: number;
  /** The breakdown the roll card prints, e.g. `danger +2, Rare +2, 2nd try +2, wounded −2`. Empty when nothing applies. */
  note: string;
}

function ordinal(n: number): string {
  if (n === 2) return '2nd';
  if (n === 3) return '3rd';
  return `${n}th`;
}

/** The escalation ONE pursuer brings, from its rarity and wounds plus the
 *  ground and the count of failed breaks so far. */
export function fleeEscalationFor(pursuer: Enemy, pursuerHp: number, danger: number, failedAttempts: number): FleeEscalation {
  const d = Math.max(0, Math.round(danger) - 1) * FLEE_DANGER_STEP;
  const r = FLEE_RARITY_BONUS[pursuer.rarity] ?? 0;
  const t = Math.max(0, Math.round(failedAttempts)) * FLEE_RETRY_STEP;
  const maxHp = Math.max(1, pursuer.hp);
  const frac = pursuerHp / maxHp;
  const w = frac <= 0.25 ? -FLEE_WOUNDED_QUARTER : frac <= 0.5 ? -FLEE_WOUNDED_HALF : 0;
  const parts: string[] = [];
  if (d) parts.push(`danger +${d}`);
  if (r) parts.push(`${pursuer.rarity} +${r}`);
  if (t) parts.push(`${ordinal(failedAttempts + 1)} try +${t}`);
  if (w) parts.push(`wounded −${-w}`);
  return { danger: d, rarity: r, retry: t, wounded: w, total: d + r + t + w, note: parts.join(', ') };
}

/**
 * The pursuit for this lineup. A scripted lineup (any live body without the
 * mark) is exactly OTA-1009's `escapePursuit` — the bar does not move. An
 * unscripted lineup takes the pursuer whose speed PLUS escalation is highest:
 * you only need to outrun the one who can catch you, and a wounded fast thing
 * may no longer be that one.
 */
export function escalatedPursuit(
  enemies: readonly Enemy[],
  hps: readonly number[] | undefined,
  danger: number,
  failedAttempts: number,
): EscapePursuit | null {
  const live = liveBodies(enemies, hps);
  if (live.length === 0) return null;
  if (!isUnscriptedLineup(enemies, hps)) return escapePursuit(live.map(({ e }) => e));
  let best: EscapePursuit | null = null;
  for (const { e, hp } of live) {
    const base = escapePursuit([e]);
    if (!base) continue;
    const esc = fleeEscalationFor(e, hp, danger, failedAttempts);
    const bonus = Math.max(0, base.bonus + esc.total);
    if (!best || bonus > best.bonus) {
      best = esc.note ? { bonus, label: e.name, note: `SPD ${base.bonus}, ${esc.note}` } : { bonus, label: e.name };
    }
  }
  return best;
}

/** The flat bar with no pursuer — SKILL_DC.escape in combatRules, mirrored so
 *  the odds can be computed without a roll. Pinned equal by the suite. */
export const FLAT_ESCAPE_DC = 9;

/**
 * Exact odds, in whole percent, that d20 + playerBonus meets the bar. With a
 * pursuer the bar is its own d20 + bonus (ties to the runner), so the count
 * runs over all 400 pairs; without one it is the flat DC.
 */
export function fleeOddsPercent(playerBonus: number, pursuitBonus: number | null): number {
  let wins = 0;
  if (pursuitBonus === null) {
    for (let p = 1; p <= 20; p++) if (p + playerBonus >= FLAT_ESCAPE_DC) wins++;
    return Math.round((wins / 20) * 100);
  }
  for (let p = 1; p <= 20; p++) {
    for (let q = 1; q <= 20; q++) if (p + playerBonus >= q + pursuitBonus) wins++;
  }
  return Math.round((wins / 400) * 100);
}
