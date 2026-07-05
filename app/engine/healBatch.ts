// healBatch.ts — OTA-693. "Use Max" batch healing. Instead of tapping "use First
// Aid Kit" ten times, one action uses the OPTIMAL number of a fixed-heal
// consumable: the most that fit UNDER your max HP (no overheal waste), or the
// whole stack if even all of them wouldn't fill you. The player asked for this so
// they "get the most use out of their items" — and to have it explained in the UI
// so a count that stops short of the stack doesn't read as broken.

/** The no-waste count to use: as many as fit under the gap without overhealing,
 *  capped at the quantity carried.
 *   - perItem <= 0 (variable / unknown heal — an effect-less food that rolls dice):
 *     we can't compute an exact no-overheal count, so use the whole stack (the
 *     per-use HP clamp still prevents actual overheal, it just can't be optimised).
 *   - gap <= 0 (already full) or quantity <= 0: nothing to do.
 *   - else: floor(gap / perItem), capped at quantity. This is the count that lands
 *     AT OR JUST UNDER max — e.g. gap 55, heal 6/item, 11 carried → floor(55/6)=9
 *     (54, leaving 1 short but wasting nothing); using the 10th would overheal. */
export function healBatchCount(perItem: number, gap: number, quantity: number): number {
  if (quantity <= 0 || gap <= 0) return 0;
  if (perItem <= 0) return quantity;
  return Math.min(quantity, Math.floor(gap / perItem));
}

/** One-line explanation for the UI, so a Max that stops before the whole stack
 *  reads as intentional, not broken. */
export const HEAL_BATCH_NOTE =
  'Uses the most that fit under your max HP — any that would overheal stay in your pack.';
