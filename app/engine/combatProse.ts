// combatProse — pure display strings for combat lines. No store, no native
// modules, no I/O. Anything in here must stay importable from a bare test.

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
