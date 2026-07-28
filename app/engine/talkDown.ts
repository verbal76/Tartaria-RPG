// OTA-806 — Talk down a fight. A high-Charisma answer to "where does persuade
// actually matter?": in combat, `persuade` / `intimidate` / `convince` a foe is a
// real d20 + CHA contest that can END the encounter without a kill.
//
// It is NOT the same as fleeing. Fleeing (the `escape` intent) is you running —
// you may take a parting hit and you LEAVE the tile. A talk-down is the foe
// standing down: on success the enemies disengage and you KEEP the ground (loot
// the room, finish exploring, walk on). The trade is that a talked-down foe drops
// no kill loot and no combat XP — you avoided the fight, you didn't win it.
//
// Guardrails against a free "win button":
//   - Bosses / story-class threats refuse outright (a Guardian doesn't parley).
//   - The DC scales with how many foes face you and the toughest one's tier, so a
//     pack of Rares is a long shot for a middling talker.
//   - Failure costs the turn AND draws the enemy counter (runEnemyGroupCounters at
//     the call site) — the same downside as any missed combat action. That makes
//     spamming it against a tough group actively dangerous, so there's no risk-free
//     grind.

import type { Enemy, Rarity } from './types';

const RARITY_RANK: Record<Rarity, number> = {
  Common: 0, Uncommon: 1, Rare: 2, Legendary: 3,
};

// Base DC for a lone Common foe, then +2 per rarity tier of the TOUGHEST enemy and
// +2 per additional enemy past the first. A lone Common sits at 10 (a coin-flip for
// CHA 10); a pair of Rares lands at ~16 (needs real Charisma or a good roll).
const TALKDOWN_BASE_DC = 10;
const TALKDOWN_DC_PER_TIER = 2;
const TALKDOWN_DC_PER_EXTRA_ENEMY = 2;

/** Story-class threats never stand down — you can't sweet-talk a Guardian off its
 *  post. Detected by the `boss` flag (Guardians + boss-gate spawns all carry it). */
export function isTalkDownBlocked(enemies: Enemy[]): boolean {
  return enemies.some((e) => e.boss === true);
}

/** The DC to talk this specific group down. Deterministic in the group's makeup so
 *  the same standoff always reads the same difficulty. */
export function talkDownDC(enemies: Enemy[]): number {
  if (enemies.length === 0) return TALKDOWN_BASE_DC;
  const toughest = enemies.reduce(
    (max, e) => Math.max(max, RARITY_RANK[e.rarity] ?? 0),
    0,
  );
  const extra = Math.max(0, enemies.length - 1);
  return (
    TALKDOWN_BASE_DC
    + toughest * TALKDOWN_DC_PER_TIER
    + extra * TALKDOWN_DC_PER_EXTRA_ENEMY
  );
}

/** True if the typed action reads as INTIMIDATION rather than reasoned persuasion —
 *  picks the flavor of the narration (fear vs. reason). Both share the same CHA
 *  contest and DC; only the words differ. */
export function isIntimidationVerb(input: string): boolean {
  return /\b(intimidate|threaten|scare|menace|frighten|cow|bully)\b/i.test(input);
}

/** True if EVERY foe is a beast/automaton rather than a person — changes whether
 *  they "flee" (animals bolt) or "back off / stand down" (people relent). A `type`
 *  of 'Human' (the humanoid enemy class) marks a person. */
export function isBeastPack(enemies: Enemy[]): boolean {
  return enemies.every((e) => e.type !== 'Human');
}

/** Build the success line: how the standoff ends, tuned by intimidation-vs-reason
 *  and beast-vs-person, naming the lead foe. */
export function talkDownSuccessLine(enemies: Enemy[], intimidation: boolean): string {
  const lead = enemies[0]?.name ?? 'the threat';
  const many = enemies.length > 1;
  const subject = many ? `${lead} and the others` : lead;
  const beasts = isBeastPack(enemies);
  if (intimidation) {
    return beasts
      ? `You draw yourself up and drive your voice at ${subject} — a predator's certainty, not prey's fear. Something in them decides you aren't worth it. They break and melt back into the waste.`
      : `You put steel in it — name what happens if this goes further, and mean it. ${subject} weigh you, and stand down. No one wanted to die here today.`;
  }
  return beasts
    ? `You slow everything down — low voice, open hands, no sudden moves — until the fight goes out of ${subject}. They circle once and slip away, leaving the ground to you.`
    : `You find the words that cost them nothing to accept. ${subject} lower their guard, mutter something, and drift off. The standoff is over and the ground is yours.`;
}

/** Build the failure line — the words don't land and the fight is still on. */
export function talkDownFailLine(enemies: Enemy[], intimidation: boolean): string {
  const lead = enemies[0]?.name ?? 'the threat';
  if (intimidation) {
    return `${lead} isn't buying the bluff. If anything your threat sharpens the room — steel first, talk later.`;
  }
  return `The words glance off ${lead}. Whatever moves people, it isn't reaching this one — not while blood's still up.`;
}
