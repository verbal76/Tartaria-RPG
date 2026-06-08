// knockout.ts — OTA-361 humanoid knockout rule.
//
// "You should be able to knock out humanoid enemies … hit them with at
// least half of their original HP value … in a single blow." Per the
// player's clarification, the threshold is measured against the
// CUMULATIVE damage of one attack — the weapon roll PLUS the coating
// roll (1d4 corruption, etc.) PLUS every flat/percent bonus that landed
// that round — summed together, "as long as it's only in one round of
// the attack." And it must be STRICTLY MORE than half: "all of it adds
// up to one hit point more than half."
//
// Two more gates from the locked design:
//   - HUMANOID only (enemy.type 'Human'). Beasts / automata / undead
//     can't be subdued and carry no kit to loot.
//   - NON-LETHAL only. A blow that drops them to 0 kills as normal —
//     you can't knock out a corpse. So the KO fires only when the enemy
//     survives the blow (resultingHp > 0).
//
// The caller passes the already-summed blow damage as `blowDamage`.
// When weapon coatings deal immediate on-hit damage (coating phase 2),
// that roll must be folded into `blowDamage` BEFORE this check so it
// counts toward the knockout, exactly as the player described.

export interface KnockoutCheck {
  /** Enemy type string (e.g. 'Human', 'Mud Creature'). */
  enemyType: string;
  /** CUMULATIVE damage of the single attack this round (weapon +
   *  coating + every bonus), already summed by the caller. */
  blowDamage: number;
  /** The enemy's max / original HP. */
  maxHp: number;
  /** The enemy's HP AFTER this blow lands. */
  resultingHp: number;
  /** True if the enemy is already knocked out (don't re-trigger). */
  alreadyKnockedOut?: boolean;
}

/** Only humanoids are subduable. */
export function isSubduable(enemyType: string | undefined): boolean {
  return (enemyType ?? '').toLowerCase() === 'human';
}

/** The cumulative-damage threshold for a knockout: STRICTLY more than
 *  half the enemy's max HP ("one hit point more than half"). For a
 *  25-HP foe that's 13; for a 24-HP foe that's also 13 (> 12). */
export function knockoutThreshold(maxHp: number): number {
  return Math.floor(maxHp / 2) + 1;
}

/** Does this single, cumulative, NON-LETHAL blow knock a HUMANOID out?
 *  True only when: the enemy is a humanoid, not already down, survives
 *  the blow (resultingHp > 0), and the summed blow damage is strictly
 *  more than half their max HP. */
export function knocksOutHumanoid(c: KnockoutCheck): boolean {
  if (!isSubduable(c.enemyType)) return false;
  if (c.alreadyKnockedOut) return false;
  if (c.resultingHp <= 0) return false; // lethal → kill, not knockout
  return c.blowDamage > c.maxHp / 2; // strictly more than half
}
