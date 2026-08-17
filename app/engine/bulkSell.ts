// ⚠⚠ OTA-1232 — "SELL ALL COMMON GEAR", AND THE THREE THINGS THAT WORD HIDES.
//
// Owner: *"how about a sell all common weapons and sell all common armor button
// since I noticed that seems to be my most sold items. those are the ones marked
// beige in my inventory correct? and of course these would be non-equipped
// items."* Beige is correct — `#c9a86a` in both `rarityHexColor` (inventory) and
// `rarityColor` (vendor). But the button as literally described would have sold
// things he very much wants, for three separate reasons:
//
// ⚠⚠ (1) COMMON IS NOT A JUNK TIER, IT IS THE DEFAULT TIER. From his own device
// log: `Scrap Metal x2 (Common)`, `Aether Dust (Common)`, `Worn Tartarian Coin x8
// (Common)`, plus Trail Rations and Bioluminescent Fungus. A literal "sell all
// Common" empties the crafting stock and the food in one tap. Hence GEAR — this
// selects weapons and armor and nothing else, which is what "my most sold items"
// actually meant.
//
// ⚠⚠ (2) BEIGE IS THE `default:` BRANCH OF THAT COLOUR SWITCH — it renders Common
// AND anything whose rarity is missing or unrecognised. Selecting on the colour
// would quietly sweep unknowns. This keys on `rarity === 'Common'` explicitly, so
// an item with no rarity is left alone rather than treated as junk by accident.
//
// ⚠ (3) A FUSED PIECE CAN SIT AT COMMON while carrying real Crucible work. Those
// are excluded: rarity is a poor proxy for effort, and the one thing a bulk sell
// must never do is spend something the player built.
//
// ⚠ EQUIPPED is handled by the CALLER, which already excludes by INSTANCE ID
// (OTA-687) rather than by name — so a spare copy of an equipped item's name is
// still sellable, and the equipped one is not. That rule is not re-implemented
// here; it is inherited by taking the caller's already-filtered list.
import type { InventoryItem } from './types';
import { WEAPONS, ARMOR } from './crafting';

const WEAPON_NAMES = new Set(WEAPONS.map((w) => w.name.toLowerCase()));
const ARMOR_NAMES = new Set(ARMOR.map((a) => a.name.toLowerCase()));

/** Weapons and armor only — never consumables, never materials, never relics. */
export function isGearItem(item: Pick<InventoryItem, 'name'>): boolean {
  const n = item.name.toLowerCase();
  return WEAPON_NAMES.has(n) || ARMOR_NAMES.has(n);
}

/** ⚠ A Crucible-forged piece carries `uniqueStats`; rarity does not describe it.
 *  Excluded from every bulk sweep. */
function isForged(item: InventoryItem): boolean {
  return !!(item as InventoryItem & { uniqueStats?: unknown }).uniqueStats;
}

export interface BulkSellCandidate {
  item: InventoryItem;
  price: number;
}

export interface BulkSellPlan {
  /** Rows that will actually be sold, in the caller's order. */
  rows: BulkSellCandidate[];
  /** Total pieces — quantity-aware, so a stack of 3 counts 3. */
  count: number;
  /** Total TC at the prices the caller computed (war premium, rapport, all of it). */
  total: number;
}

/** ⚠⚠ THE PLAN IS RETURNED, NOT EXECUTED. The screen shows `count` and `total` in
 *  a confirm before anything is sold — that number IS the safety on a bulk
 *  action, and it can only be shown if the selection is computed separately from
 *  the doing. A one-tap sweep with no count is how a player loses a weapon they
 *  meant to keep.
 *
 *  Takes the caller's ALREADY-FILTERED sellable rows (equipped instances and
 *  unsellables removed, prices computed) and narrows to Common gear. */
export function planCommonGearSale(sellable: readonly BulkSellCandidate[]): BulkSellPlan {
  const rows = sellable.filter(({ item }) =>
    item.rarity === 'Common'      // explicit — never the colour, never a default
    && isGearItem(item)           // weapons + armor only
    && !isForged(item),           // never something the player built
  );
  const count = rows.reduce((n, r) => n + Math.max(1, r.item.quantity ?? 1), 0);
  const total = rows.reduce((n, r) => n + r.price * Math.max(1, r.item.quantity ?? 1), 0);
  return { rows, count, total };
}

/** ⚠ OTA-1349 — PUNCHLIST-BRAVO B5: THE SWEEP'S HOLD-BACKS ARE SAID OUT LOUD.
 *  OTA-1320 excludes a last gate-satisfier (your only breathing mask, your only
 *  climbing kit) from SELL ALL COMMON GEAR — correctly — but the confirm never
 *  said so, and a hold-out nobody explains reads as the button refusing to work.
 *  This builds the one line the confirm appends (shape per the owner's proposed
 *  wording: "1 piece held back — your only way to breathe toxic air."). Pure;
 *  returns null when nothing was held. */
export function bulkSellHeldBackNote(
  held: readonly { name: string; label: string }[],
): string | null {
  if (held.length === 0) return null;
  if (held.length === 1) {
    const h = held[0]!;
    return `1 piece held back — the ${h.name} is your only way to ${h.label}.`;
  }
  const parts = held.map((h) => `the ${h.name} (your only way to ${h.label})`);
  return `${held.length} pieces held back — ${parts.join(', ')}.`;
}
