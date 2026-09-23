// ⚠⚠⚠ OTA-1873 — A BULK SALE IS REVIEWED BEFORE IT IS MADE.
//
// Owner: the two sweeps — SELL ALL COMMON GEAR and SELL ALL LOOT — commit on a
// count and a total. Those two numbers are the safety OTA-1232 built and they
// are still right, but they cannot answer the one question a player actually
// has in front of a full pack: WHICH pieces. A number says how much is leaving;
// it never says that the Mud Shell in the list is the one you meant to keep.
//
// ⚠⚠ SO THE PLAN GETS A ROW LIST AND A VETO, AND THE PLAN ITSELF IS UNTOUCHED.
// `planCommonGearSale` / `planLootSale` still decide ELIGIBILITY — every guard
// those two learned (isForged, isRunecaster, isCoatedGear, isSweepableLoot, the
// gate-satisfier hold-back) is inherited exactly as it stands, and nothing here
// can widen them. This module answers a strictly narrower question: OF THE ROWS
// THE PLAN ALREADY CHOSE, which ones does the player still want in?
//
// ⚠ THE VETO IS TRANSACTION-LOCAL, AND THAT IS THE DESIGN, NOT A SHORTCUT. The
// excluded set is owned by the open review popup and dies with it. It is not a
// reservation, not a pin, not a save-flag: a player who backs out and reopens
// the sweep gets the full candidate list again, because "not this time" is a
// different sentence from "never sell this", and the game already has three
// ways to say the second one (reserve for fusion, save for quest, a coating).
//
// ⚠ EVERYTHING HERE IS PURE. No store, no mutation, no clock — the popup reads
// these to draw and to total, and the vendor screen reads `includedCandidates`
// at fire time to sell. That separation is the same one OTA-1232 wrote into
// `BulkSellPlan`'s own contract ("the plan is RETURNED, not executed"), carried
// one step further: now the CUT is returned too, and the same numbers the
// player read are the numbers that sell.
import type { BulkSellCandidate, BulkSellPlan } from './bulkSell';

/** One line in the review popup. `included` is the live answer, not a request. */
export interface BulkSellReviewRow {
  /** Instance id — the identity the veto is keyed on (OTA-687's rule: never a
   *  name, so a spare copy and the one you are keeping are separable). */
  id: string;
  name: string;
  /** Pieces in this row. A stack of 3 is one row worth 3 pieces. */
  quantity: number;
  /** Per-piece price the caller already computed (war premium, rapport, all). */
  unitPrice: number;
  /** unitPrice × quantity — what this row contributes when it is in. */
  lineTotal: number;
  included: boolean;
}

/** Instance ids the player has tapped OUT of this transaction. */
export type ExcludedIds = ReadonlySet<string>;

/** The state a freshly-opened review starts in: every eligible row IS in.
 *  ⚠ Opt-OUT, never opt-in. The sweep's promise is "all of this"; a review that
 *  opened empty would silently turn one tap into N taps and quietly become a
 *  different feature. */
export const NOTHING_EXCLUDED: ExcludedIds = Object.freeze(new Set<string>()) as ExcludedIds;

/** Quantity-aware piece count for one row (mirrors planCommonGearSale's own
 *  `Math.max(1, quantity ?? 1)` so a row missing a quantity still counts once). */
function piecesIn(row: BulkSellCandidate): number {
  return Math.max(1, row.item.quantity ?? 1);
}

/** The popup's rows, in the plan's order — which is the caller's order, which is
 *  the order the SELL list already shows. Never re-sorted here: a review that
 *  reorders itself as you tap is a review you cannot keep your place in. */
export function reviewRowsFor(
  plan: Pick<BulkSellPlan, 'rows'>,
  excluded: ExcludedIds,
): BulkSellReviewRow[] {
  return plan.rows.map((row) => {
    const quantity = piecesIn(row);
    return {
      id: row.item.id,
      name: row.item.name,
      quantity,
      unitPrice: row.price,
      lineTotal: row.price * quantity,
      included: !excluded.has(row.item.id),
    };
  });
}

/** The rows that will actually be sold — the plan's own rows minus the vetoes.
 *  ⚠ This is what the vendor screen sells from, and it is re-derived from a
 *  FRESH plan at fire time (OTA-1232's staleness rule), so a piece sold by hand
 *  between the review and the yes simply is not in the new plan. */
export function includedCandidates(
  plan: Pick<BulkSellPlan, 'rows'>,
  excluded: ExcludedIds,
): BulkSellCandidate[] {
  return plan.rows.filter((row) => !excluded.has(row.item.id));
}

/** Live totals for the popup's heading and its confirm button.
 *  ⚠ Derived from the same rows the list draws, so the number on the button can
 *  never disagree with the ticks above it — the disagreement OTA-1307 is about,
 *  one layer up. */
export function reviewTotals(
  plan: Pick<BulkSellPlan, 'rows'>,
  excluded: ExcludedIds,
): { count: number; total: number; excludedCount: number } {
  let count = 0;
  let total = 0;
  let excludedCount = 0;
  for (const row of plan.rows) {
    const pieces = piecesIn(row);
    if (excluded.has(row.item.id)) {
      excludedCount += pieces;
      continue;
    }
    count += pieces;
    total += row.price * pieces;
  }
  return { count, total, excludedCount };
}

/** Tap a row: out if it was in, in if it was out. Returns a NEW set — the old
 *  one is never mutated, so React sees the change and a stale render can never
 *  show a tick the totals disagree with. */
export function toggleExclusion(excluded: ExcludedIds, id: string): ExcludedIds {
  const next = new Set(excluded);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

/** True when the player has vetoed every row — the confirm must not be live.
 *  ⚠ Selling nothing is not a smaller sale, it is a no-op wearing a confirm
 *  button, and OTA-1307's lesson is that a button which does nothing when
 *  pressed is the worst thing a modal can contain. */
export function reviewIsEmpty(
  plan: Pick<BulkSellPlan, 'rows'>,
  excluded: ExcludedIds,
): boolean {
  return reviewTotals(plan, excluded).count === 0;
}
