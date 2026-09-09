// combatProse — pure display strings for combat lines. No store, no native
// modules, no I/O. Anything in here must stay importable from a bare test.
import { pick } from './rng';

/**
 * ⚠⚠⚠ OTA-1790 — THE ATTACK PROSE CAME HOME, AND THE MOVE PAID FOR THE PASS.
 *
 * `attackOpener`, `attackHit`, `attackMiss`, `attackKill` and `weaponPhrase`
 * lived at the bottom of a 37,000-line `gameStore.ts` — five pure functions of
 * (weapon, enemy name, damage) that touch no state, no `get`, no `set`, and
 * whose whole job is the thing this file's first two lines describe. They are
 * moved here verbatim: same words, same `pick` pools, same order, so every line
 * the game has ever printed still prints.
 *
 * ⚠⚠ THIS IS THE EXTRACTION THE OWNER ASKED FOR, AT ITS SMALLEST HONEST SIZE.
 * His ruling on the store ceiling was *"EXTRACT, DO NOT JUST RAISE IT"*, and
 * `check:storeceiling` was sitting at 36,998 of 36,998 with no headroom at all —
 * so wiring the transcript needed lines that did not exist. Rather than raise
 * the number, the pass gave back more than it took, and the boundary was not
 * invented for the occasion: this file was already named for exactly these
 * functions and already declared the rule they obey.
 */

/**
 * ⚠⚠ OTA-1570 — HOW MUCH OF THEM THAT BLOW WAS, in words. The knockout line used
 * to say "half their fight" unconditionally, on a sentence that prints the exact
 * numbers a few characters later — so the prose and the arithmetic disagreed in
 * the owner's own logs, twice: 11 of 13 and 28 of 32, both called "half".
 *
 * ⚠ The bands are deliberately coarse. A knockout is a dramatic beat, and
 * "86% of their fight" is a spreadsheet, not a sentence. What the line owes the
 * player is not precision — it is not being WRONG.
 *
 * ⚠ maxHp 0 falls to the bottom band rather than dividing: an enemy with no
 * recorded maximum tells us nothing about the size of the blow, and the quietest
 * of the four readings is the only one that cannot be contradicted by the
 * numbers printed beside it.
 */
export function koShare(dmg: number, maxHp: number): string {
  const share = maxHp > 0 ? dmg / maxHp : 0;
  if (share >= 0.85) return 'nearly the whole of their fight';
  if (share >= 0.6) return 'the better part of their fight';
  if (share >= 0.4) return 'half their fight';
  return 'the last of their fight';
}

/* ─── MOVED VERBATIM FROM gameStore.ts (OTA-1790) ─────────────────────────── */

export function weaponPhrase(weapon: string | null): string {
  return weapon ? ` with the ${weapon.toLowerCase()}` : '';
}

export function attackOpener(enemyName: string, weapon?: string | null): string {
  const w = weapon ?? null;
  if (w) {
    // arb-fix — these openers are picked at attack time, BEFORE initiative is
    // rolled, so none of them may assert who acts first (the resolved
    // "You seize the initiative" / "X moves first" line prints later and would
    // contradict them). Keep the flavor turn-order-neutral.
    return pick([
      `You raise the ${w.toLowerCase()} toward ${enemyName}. The room narrows around the both of you.`,
      `Your ${w.toLowerCase()} comes around in an arc; ${enemyName} squares up to meet it.`,
      `You commit forward with the ${w.toLowerCase()}. ${enemyName} watches your hands.`,
      `You bring the ${w.toLowerCase()} to bear on ${enemyName}.`,
    ]);
  }
  return pick([
    `You close on ${enemyName}. The room narrows around the both of you.`,
    `${enemyName} fixes on you. You commit to the strike.`,
    `You drive toward ${enemyName}, set to strike.`,
  ]);
}

export function attackHit(weapon: string | null, enemyName: string, dmg: number, remainingHp: number): string {
  const wp = weaponPhrase(weapon);
  return pick([
    `Your strike${wp} lands for ${dmg}. ${enemyName} staggers — ${remainingHp} HP remaining. It answers.`,
    `${enemyName} takes ${dmg}${wp}. It reels: ${remainingHp} left. Then it fights back.`,
    `Clean hit${wp} for ${dmg}. ${enemyName} has ${remainingHp} left and does not back away.`,
    `The blow${wp} finds purchase — ${dmg} damage, ${remainingHp} HP standing. ${enemyName} commits to the counter.`,
  ]);
}

export function attackMiss(weapon: string | null, enemyName: string): string {
  const wp = weaponPhrase(weapon);
  return pick([
    `Your strike${wp} glances off. ${enemyName} seizes the opening.`,
    `${enemyName} reads the motion and slips it${wp ? ` — the ${weapon!.toLowerCase()} carves only air` : ''}. The counter is already coming.`,
    `${wp ? `The ${weapon!.toLowerCase()} cuts air` : 'Your strike cuts air'}. ${enemyName} answers immediately.`,
    `Half a beat too slow. ${enemyName} steps inside your reach.`,
  ]);
}

export function attackKill(weapon: string | null, enemyName: string, dmg: number): string {
  const wp = weaponPhrase(weapon);
  return pick([
    `Your blow${wp} lands clean — ${dmg} damage. ${enemyName} crumples in the dust. The Aetherstone settles.`,
    `${enemyName} folds${wp ? ` under the ${weapon!.toLowerCase()}` : ''}. ${dmg} damage was enough. The room exhales.`,
    `Final strike${wp} for ${dmg}. ${enemyName} is still. The Aetherstone hums on, indifferent.`,
    `The killing blow${wp}: ${dmg}. ${enemyName} drops where it stood.`,
  ]);
}

/* ─── OTA-1790 — LAYER B: THE CONSEQUENCE, WITHOUT THE ARITHMETIC ─────────── */

/**
 * ⚠⚠⚠ THESE ARE THE SAME EVENTS AS THE FOUR ABOVE, MINUS THE NUMBERS, AND THE
 * DIFFERENCE IS THE WHOLE POINT.
 *
 * The pack splits the transcript in two: *"A. EVENT LINE Fast factual scan...
 * B. PROSE / CONSEQUENCE Natural-language narration beneath or between actions.
 * This is where the weapon, coating, status, armor interaction and other
 * meaningful consequence belongs."* Its worked example carries no arithmetic at
 * all — *"You strike with your fire-coated sword. The fire coating ignites the
 * target."*
 *
 * ⚠⚠ SO THE NARRATION MUST NOT RESTATE THE DAMAGE OR THE REMAINING HP. The
 * event line above it now says `YOU HIT Raider for 25 HP`, read straight off the
 * authority. Prose that also said "lands for 25 … 12 HP remaining" would be the
 * *"disconnected damage values"* and *"duplicated actor/outcome labels"* the
 * pack names, just wearing a nicer typeface.
 *
 * ⚠ AND THE LINES ABOVE ARE UNTOUCHED, WHICH IS WHY NOTHING IS LOST. The
 * resolver still writes its full sentence — every number in it — to
 * `entry.text`, so the disk log, the LOG export and the owner's playtest reports
 * read exactly as they did yesterday. These shorter lines ride on the EVENT, and
 * only the feed reads them. One authority, two audiences.
 *
 * ⚠ THE WEAPON IS NAMED WHENEVER IT IS KNOWN — the pack again: *"The prose
 * should mention the ACTUAL weapon used when known. Do not reduce every player
 * hit to generic 'you attack.'"* `weaponPhrase(null)` is the bare-hand case and
 * drops the clause rather than inventing a weapon.
 */
export function hitProse(weapon: string | null, enemyName: string): string {
  const wp = weaponPhrase(weapon);
  return pick([
    `Your strike${wp} lands clean. ${enemyName} staggers, and answers.`,
    `${enemyName} takes it${wp}, reels, and fights back.`,
    `Clean contact${wp}. ${enemyName} does not back away.`,
    `The blow${wp} finds purchase. ${enemyName} commits to the counter.`,
  ]);
}

export function missProse(weapon: string | null, enemyName: string): string {
  const wp = weaponPhrase(weapon);
  return pick([
    `Your strike${wp} glances off. ${enemyName} seizes the opening.`,
    `${enemyName} reads the motion and slips it. The counter is already coming.`,
    `${wp ? `The ${weapon!.toLowerCase()} cuts air` : 'Your strike cuts air'}. ${enemyName} answers immediately.`,
    `Half a beat too slow. ${enemyName} steps inside your reach.`,
  ]);
}

export function killProse(weapon: string | null, enemyName: string): string {
  const wp = weaponPhrase(weapon);
  return pick([
    `Your blow${wp} lands clean. ${enemyName} crumples in the dust, and the Aetherstone settles.`,
    `${enemyName} folds${wp ? ` under the ${weapon!.toLowerCase()}` : ''}. The room exhales.`,
    `The final strike${wp}. ${enemyName} is still; the Aetherstone hums on, indifferent.`,
    `The killing blow${wp}. ${enemyName} drops where it stood.`,
  ]);
}

/**
 * The incoming half. ⚠ `armour` IS PASSED, NOT GUESSED: the caller has just
 * finished asking whether the plate actually soaked anything, and the pack's own
 * example — *"Your armour turns the blow aside"* — is a claim about mechanics
 * that must be true when it is printed. A transcript that says the armour held
 * on a blow it did not touch is worse than one that says nothing.
 */
export function enemyStrikeProse(
  enemyName: string,
  damageType: string | null,
  opts?: { armour?: boolean; killed?: boolean },
): string {
  const t = damageType ? ` ${damageType}` : '';
  if (opts?.killed) {
    return pick([
      `${enemyName} presses the${t || ''} attack home, and you have nothing left to give it.`,
      `The last of it arrives${t ? ` —${t}` : ''}, and your legs go out from under you.`,
    ]);
  }
  if (opts?.armour) {
    return pick([
      `${enemyName} strikes you. Your armour turns the worst of the${t || ' blow'} aside.`,
      `The blow arrives${t ? ` —${t} —` : ''} and your plate takes the brunt of it.`,
    ]);
  }
  return pick([
    `${enemyName} strikes you${t ? ` and the${t} goes straight through` : ''}. You feel it.`,
    `${enemyName} comes in hard${t ? `, all${t}` : ''}, and nothing you wear stops it.`,
    `The${t || ' blow'} lands square on you. ${enemyName} is not finished.`,
  ]);
}
