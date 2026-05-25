// OTA 058 — Use-based stat progression (Skyrim model with success-gate).
//
// Every SUCCESSFUL action that uses a stat (combat hit, passed skill
// check, made the climb tier, won the parry, talked the vendor down,
// etc.) accrues progress on that stat. Failures don't count — the
// system rewards effective use, not flailing.
//
// Tiered cost so early growth feels generous and high stats are
// hard-won:
//   stat ≤ 10  → +2 progress per use  (50 uses to next +1)
//   stat 11-14 → +1 progress per use  (100 uses)
//   stat 15+   → +0.5 progress per use (200 uses) — caps the
//                late-game grind
//
// When progress hits 100, the base stat increments by 1 and progress
// rolls over the overshoot — nothing wasted.
//
// Display is quantized into 4 quarters for the Player Sheet
// (▮▮▯▯ = 50%). The internal value is precise; the UI rounds to
// 0/25/50/75 so the player doesn't see every 1-2% tick.

import type { PlayerCharacter, Stats } from './types';

/** Uses required to advance a stat by 1. Each tier sets a per-use
 *  award; LEVEL_UP_THRESHOLD is the same across all tiers — it's
 *  the per-use AMOUNT that varies. */
export const LEVEL_UP_THRESHOLD = 100;

export type StatKey = keyof Stats;

/** How much progress one successful use awards, given the current
 *  base stat value. */
export function progressAwardFor(currentStat: number): number {
  if (currentStat <= 10) return 2;
  if (currentStat <= 14) return 1;
  return 0.5;
}

export interface TrainResult {
  player: PlayerCharacter;
  /** Set when the use crossed the threshold and the base stat just
   *  ticked up. Used to surface a 'reward'-channel log line. */
  leveled: { stat: StatKey; from: number; to: number } | null;
}

/**
 * Award progress to `stat` for a successful use. If `success` is
 * false, returns the player unchanged — failures don't train.
 *
 * The award amount comes from progressAwardFor() applied to the
 * stat's current base value, so a stat at 8 trains twice as fast
 * as the same stat at 12. Mastery is hard.
 */
export function trainStat(
  player: PlayerCharacter,
  stat: StatKey,
  success: boolean,
): TrainResult {
  if (!success) return { player, leveled: null };
  const baseStat = player.stats[stat];
  const amount = progressAwardFor(baseStat);
  if (amount <= 0) return { player, leveled: null };
  const prevProgress = player.statProgress?.[stat] ?? 0;
  let progress = prevProgress + amount;
  let next = baseStat;
  let leveled: TrainResult['leveled'] = null;
  while (progress >= LEVEL_UP_THRESHOLD) {
    progress -= LEVEL_UP_THRESHOLD;
    const before = next;
    next = before + 1;
    if (!leveled) leveled = { stat, from: before, to: next };
  }
  return {
    player: {
      ...player,
      stats: { ...player.stats, [stat]: next },
      statProgress: { ...(player.statProgress ?? {}), [stat]: progress },
    },
    leveled,
  };
}

/** Initialize statProgress on hydration if the slot pre-dates OTA 058. */
export function ensureStatProgress(player: PlayerCharacter): PlayerCharacter {
  if (player.statProgress
    && (['strength', 'dexterity', 'intelligence', 'wisdom', 'charisma'] as const).every(
      (k) => typeof player.statProgress![k] === 'number',
    )
  ) {
    return player;
  }
  return {
    ...player,
    statProgress: {
      strength: player.statProgress?.strength ?? 0,
      dexterity: player.statProgress?.dexterity ?? 0,
      intelligence: player.statProgress?.intelligence ?? 0,
      wisdom: player.statProgress?.wisdom ?? 0,
      charisma: player.statProgress?.charisma ?? 0,
    },
  };
}

/**
 * Quantized display value for the Player Sheet — returns 0, 25, 50,
 * 75, or 99 (never 100; the level-up flushes progress when it lands).
 * The player sees the bar flip at meaningful intervals instead of
 * every 1-2% tick.
 *
 * 2026-05-25 [VIZ-1] — kept for backwards compatibility with any
 * caller that still wants the quartile. New code paths (CharacterScreen
 * skill rows) now use rawProgressPercent + fineProgressBar.
 */
export function displayedProgressPercent(player: PlayerCharacter, stat: StatKey): number {
  const prog = player.statProgress?.[stat] ?? 0;
  if (prog < 25) return 0;
  if (prog < 50) return 25;
  if (prog < 75) return 50;
  if (prog < LEVEL_UP_THRESHOLD) return 75;
  return 99;
}

/** Compact 4-segment bar string for the Player Sheet (legacy
 *  quartile bar — kept for any non-CharacterScreen caller). */
export function displayedProgressBar(player: PlayerCharacter, stat: StatKey): string {
  const filled = displayedProgressPercent(player, stat) / 25;
  return '▮▮▮▮'.slice(0, filled) + '▯▯▯▯'.slice(0, 4 - filled);
}

/** 2026-05-25 [VIZ-1] — raw 0-99 progress without quartile rounding.
 *  Used by CharacterScreen so the player sees fine-grained progress
 *  toward the next stat level instead of "still 25%" for ages. */
export function rawProgressPercent(player: PlayerCharacter, stat: StatKey): number {
  const prog = player.statProgress?.[stat] ?? 0;
  return Math.min(prog, 99);
}

/** 2026-05-25 [VIZ-1] — 20-segment progress bar (each filled rune
 *  = 5%). Replaces the 4-segment quartile bar on the Player Sheet
 *  per playtester ask: "make a larger 100 status bar and show your
 *  current status on it." */
export function fineProgressBar(player: PlayerCharacter, stat: StatKey): string {
  const filled = Math.round(rawProgressPercent(player, stat) / 5);
  const clamp = Math.max(0, Math.min(20, filled));
  return '▮'.repeat(clamp) + '▯'.repeat(20 - clamp);
}

/** 2026-05-25 [VIZ-1] — what player activities grow each stat. Surfaced
 *  in the CharacterScreen so the player knows how to train. Order is
 *  rough frequency (most-common first). Every stat has at least one
 *  entry; we add to these lists as new train surfaces land. */
export const SKILL_ACTIVITIES: Record<StatKey, string[]> = {
  strength: [
    'Landing melee attacks in combat',
    'Two-handed weapon swings',
    'Heavy salvage / breaking',
  ],
  dexterity: [
    'Successful climbs (per tier)',
    'Parry / dodge in combat',
    'Stealing from vendors',
    'Stealth approaches',
  ],
  intelligence: [
    'Scrapping items in your pack',
    'Identifying lore / concepts',
    'Solving investigate puzzles',
  ],
  wisdom: [
    'Resting after combat',
    'Surviving wasteland encounters',
    'Finishing hunt / mystery contracts',
  ],
  charisma: [
    'Buying from vendors',
    'Selling to vendors',
    'Gifting reputation items',
    'Accepting contracts',
  ],
};
