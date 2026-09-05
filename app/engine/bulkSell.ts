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
const RUNECASTER_NAMES = new Set(
  WEAPONS.filter((w) => w.weaponKind === 'runecaster').map((w) => w.name.toLowerCase()),
);

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

/**
 * ⚠⚠⚠ OTA-1570 — A RUNE-CASTER IS NOT SPARE GEAR ANY MORE, AND THIS HOLE IS MINE.
 *
 * The owner's log, two hours after OTA-1561 shipped: `Sold Earthshaker … for 14
 * TC`, `Sold Mud Shell … for 13 TC` — both swept by SELL ALL COMMON GEAR. Every
 * item in that sweep was correctly Common and the button did exactly what it
 * says. What changed is what a Common rune-caster IS.
 *
 * OTA-1561 opened the Crucible to rune-casters: they take PASSIVES that scale
 * with the wielder's stats, two of them (three at Legendary), at five reserved
 * pieces a visit. A Common rune-caster is now the cheapest way into that entire
 * system — the thing you upgrade, not the thing you clear out. Selling one for
 * 13 TC was a fine trade the day before 1561 and a bad one the day after, and
 * the sweep had no way to know the rules had moved under it.
 *
 * ⚠⚠ THIS IS THE SAME REASONING `isForged` ALREADY USES, one step earlier. That
 * spares a piece the player has ALREADY put work into; this spares the piece the
 * work is done TO. Rarity was never the question — "can this become something"
 * is, and rarity is a poor proxy for it in both directions.
 */
function isRunecaster(item: InventoryItem): boolean {
  if (item.kind === 'runecaster') return true;
  if ((item.tags ?? []).some((t) => t.toLowerCase() === 'runecaster')) return true;
  // ⚠ The catalog is the last word. An instance can reach here with no tags at
  // all (an inferred row, a migrated save), and the sweep must still spare it —
  // the same reason isGearItem keys on the catalog rather than on the instance.
  return RUNECASTER_NAMES.has(item.name.toLowerCase());
}

/**
 * ⚠⚠ OTA-1683 — A COATED PIECE IS WORK YOU DID. Owner, 09-04 22:03: *"when you
 * sell common gear in bulk, it should exclude common gear that is unequipped
 * but has had coatings applied to them"* — and his alternative, a lock like the
 * Crucible reserve, is the same sentence from the other side: the sweep must
 * not spend something the player invested in. A coating is a consumable
 * painted on for the life of the weapon (OTA-360), exactly the shape `isForged`
 * already spares one step up, so it joins that rule rather than a new one. The
 * per-item sell row still sells a coated piece by hand; only the sweep steps
 * around it, and the confirm says how many it stepped around.
 */
export function isCoatedGear(item: Pick<InventoryItem, 'coating' | 'coating2'>): boolean {
  return !!item.coating || !!item.coating2;
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
  /** OTA-1683 — Common gear the sweep stepped around because it carries a
   *  coating. Counted so the confirm can say so instead of leaving a held-out
   *  piece to read as a button that missed one. */
  sparedCoated: number;
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
  const commonGear = sellable.filter(({ item }) =>
    item.rarity === 'Common'      // explicit — never the colour, never a default
    && isGearItem(item)           // weapons + armor only
    && !isForged(item)            // never something the player built
    && !isRunecaster(item),       // OTA-1570 — never the thing the Crucible upgrades
  );
  // OTA-1683 — never something the player coated, and say how many were spared.
  const rows = commonGear.filter(({ item }) => !isCoatedGear(item));
  const sparedCoated = commonGear.length - rows.length;
  const count = rows.reduce((n, r) => n + Math.max(1, r.item.quantity ?? 1), 0);
  const total = rows.reduce((n, r) => n + r.price * Math.max(1, r.item.quantity ?? 1), 0);
  return { rows, count, total, sparedCoated };
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
