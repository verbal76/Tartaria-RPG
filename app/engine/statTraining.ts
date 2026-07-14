// OTA 058 — Use-based stat progression (Skyrim model with success-gate).
//
// Every SUCCESSFUL action that uses a stat (combat hit, passed skill
// check, made the climb tier, won the parry, talked the vendor down,
// etc.) accrues progress on that stat. Failures don't count — the
// system rewards effective use, not flailing.
//
// 2026-05-25 — finer progressive scaling per playtester:
//   "as your stats get better the amount needed to grow the skill
//    should progressively get higher for the individual stat."
// Replaced the 3-tier coarse award with a 6-step curve so the ramp
// is continuous up through mid-twenties and high stats take real
// commitment to advance:
//   stat  1-5   → +3 per use   (~33 uses to next +1)
//   stat  6-10  → +2 per use   (~50 uses)
//   stat 11-14  → +1 per use   (100 uses)
//   stat 15-18  → +0.5 per use (200 uses)
//   stat 19-22  → +0.25 per use (400 uses)
//   stat 23+    → +0.1 per use (1000 uses) — late-game commitment
//
// When progress hits 100, the base stat increments by 1 and progress
// rolls over the overshoot — nothing wasted.
//
// Display is the 20-segment fineProgressBar (5% per rune) introduced
// by VIZ-1 (OTA-006). Internal progress is precise.

import type { PlayerCharacter, Stats } from './types';

/** Uses required to advance a stat by 1. Each tier sets a per-use
 *  award; LEVEL_UP_THRESHOLD is the same across all tiers — it's
 *  the per-use AMOUNT that varies. */
export const LEVEL_UP_THRESHOLD = 100;

// OTA-800 — hard training ceiling. Before this, a stat trained forever (the
// 23+ tier still awards 0.1/use), so a patient grind against a pet weak enemy
// could push a stat into the hundreds and trivialize the game (damage/AC/skill
// DCs all key off the raw stat). 30 is the design's own stated peak — the curve
// comment above calls "30 STR ... still grindable in a long enough session" the
// late-game target, and the 23+ tier costs ~1000 uses per point, so reaching 30
// is already an extreme commitment; nobody hits it in normal play, but it bounds
// the exploit. Tunable design knob — mirrored on the dog (dogCompanion.ts) and
// golem (golems.ts) training twins so no companion out-scales it either.
export const MAX_TRAINED_STAT = 30;

export type StatKey = keyof Stats;

/** How much progress one successful use awards, given the current
 *  base stat value. Smooth descending curve so each new level
 *  costs more than the last, with a floor at 0.1 so 30 STR is
 *  still grindable in a long enough session. */
export function progressAwardFor(currentStat: number): number {
  if (currentStat <= 5)  return 3;
  if (currentStat <= 10) return 2;
  if (currentStat <= 14) return 1;
  if (currentStat <= 18) return 0.5;
  if (currentStat <= 22) return 0.25;
  return 0.1;
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
  // OTA-800 — at the ceiling the stat can't climb; stop training it (and don't
  // bank progress that could never cash out).
  if (baseStat >= MAX_TRAINED_STAT) return { player, leveled: null };
  const amount = progressAwardFor(baseStat);
  if (amount <= 0) return { player, leveled: null };
  const prevProgress = player.statProgress?.[stat] ?? 0;
  let progress = prevProgress + amount;
  let next = baseStat;
  let leveled: TrainResult['leveled'] = null;
  while (progress >= LEVEL_UP_THRESHOLD && next < MAX_TRAINED_STAT) {
    progress -= LEVEL_UP_THRESHOLD;
    const before = next;
    next = before + 1;
    if (!leveled) leveled = { stat, from: before, to: next };
  }
  // Just hit the ceiling — flush leftover progress so the bar reads full-and-done
  // instead of stranding a partial that can never level.
  if (next >= MAX_TRAINED_STAT) progress = 0;
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
    && (['strength', 'dexterity', 'intelligence', 'wisdom', 'charisma', 'stealth'] as const).every(
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
      stealth: player.statProgress?.stealth ?? 0, // OTA-348
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
 *  entry; we add to these lists as new train surfaces land.
 *
 *  2026-05-26 OTA-057 — CHA/WIS conceptual split. CHA is the active
 *  social push (initiating a buy/sell/gift, talking the agent into
 *  handing you the contract). WIS is the passive perception payoff
 *  (the lesson you carry away on completion, the whisper you
 *  overheard, the new ground you covered). Buying/selling/gifting/
 *  accepting no longer double-train both stats.
 *  Cardinal-travel WIS is gated on tile novelty (sliding window of
 *  20 recent tiles) so pacing between two safe screens no longer
 *  trains it.
 */
export const SKILL_ACTIVITIES: Record<StatKey, string[]> = {
  strength: [
    'Punch / kick attacks',
    'Landing melee attacks in combat',
    'Two-handed weapon swings',
    'Climbing (per tier)',
    'Heavy salvage / breaking',
    'Carrying 20+ items in your pouch (passive, on new ground)',
  ],
  dexterity: [
    'Climbing (per tier)',
    'Parry / dodge in combat',
  ],
  intelligence: [
    'Scrapping items in your pack',
    'Salvaging large named items',
    'Using Aetheric powers (shape / summon / mend)',
    'Identifying lore / concepts',
    'Solving investigate puzzles',
  ],
  wisdom: [
    'Travelling to NEW ground (cardinal travel onto a fresh tile)',
    'Hearing a whisper',
    'Completing a hunt, mystery, or storyline',
    'Finishing a faction contract',
    'Resting after combat',
    'Surviving wasteland encounters',
  ],
  charisma: [
    'Talking a foe down in combat (persuade / intimidate)',
    'Passing a diplomacy check in a hunt / mystery / storyline stage',
    'Buying from a vendor',
    'Selling to a vendor',
    'Accepting a hunt / mystery / storyline / faction contract',
    'Wearing named armor / wielding named weapon (passive, on new ground)',
    'Completing a storyline chapter',
  ],
  // OTA-348 — Stealth's own activities (moved off DEX). Starting value is a
  // race-proportional roll; these grow it from there.
  stealth: [
    'A successful STEALTH approach (the APPROACH "use stealth" toggle)',
    'Stealing from vendors',
    'Sleight-of-hand / pickpocket takes',
  ],
};
