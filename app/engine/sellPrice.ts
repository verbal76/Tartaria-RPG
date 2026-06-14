// Sell-back pricing for vendor trades. Player gets roughly 40% of a
// reasonable buy price — generous enough to make selling worthwhile,
// stingy enough that the player can't grind by churning items.
//
// Inputs:
//   item     — the inventory entry the player is selling
//   vendor   — the vendor receiving it. If they happen to sell the same
//              item in their offers, sell value = offer price × 0.4,
//              which keeps small-town economies coherent.
//   tags     — kept to favor faction-aligned vendors when the item
//              comes from their tag pool (future hook; currently noop).
//
// Returns 0 when the item is not sellable (quest items, raw materials
// with no rarity tier).

import type { InventoryItem, Rarity } from './types';
import type { VendorInstance } from './vendors';

// Approximate "fair" base price per rarity tier, in TC. Matches the
// upper bound of typical vendor catalog prices.
const RARITY_BASE: Record<Rarity, number> = {
  Common: 12,
  Uncommon: 35,
  Rare: 90,
  Legendary: 240,
};

// arb149 — equippable GEAR (weapons + armor) is worth more than raw materials
// of the same rarity, but the flat RARITY_BASE priced a Common Titan's Guard Mask
// the same as a Common scrap of cloth → ~5 TC, which the player (rightly) called
// too low for a real piece of kit. Gear gets its own higher base so a Common
// piece nets ~11 TC, an Uncommon ~26, etc. Still below a typical buy price, so
// it doesn't open a buy-low/sell-high pump (the vendor-offer match below already
// caps resale to the SAME vendor at 40% of their price).
const GEAR_RARITY_BASE: Record<Rarity, number> = {
  Common: 28,
  Uncommon: 65,
  Rare: 150,
  Legendary: 320,
};
const GEAR_KINDS = new Set(['weapon', 'armor', 'dog_armor', 'runecaster']);

const SELL_FRACTION = 0.4;

export function sellPriceFor(item: InventoryItem, vendor: VendorInstance | null | undefined): number {
  // Match against the vendor's own offers first — that's the most
  // accurate price reference because it reflects what they paid.
  if (vendor) {
    const offer = vendor.offers.find((o) => o.itemName.toLowerCase() === item.name.toLowerCase());
    if (offer) {
      const dur = durabilityFraction(item);
      return Math.max(1, Math.round(offer.price * SELL_FRACTION * dur));
    }
  }
  if (!item.rarity) {
    // Untiered raw stuff still has a small base value via kind.
    if (item.kind === 'consumable') return 3;
    if (item.kind === 'misc') return 2;
    return 1;
  }
  // arb149 — equippable gear uses the higher gear base; everything else (relics,
  // materials, consumables-with-a-tier) keeps the generic base.
  const baseTable = GEAR_KINDS.has(item.kind) ? GEAR_RARITY_BASE : RARITY_BASE;
  const base = baseTable[item.rarity] ?? 5;
  const dur = durabilityFraction(item);
  return Math.max(1, Math.round(base * SELL_FRACTION * dur));
}

/** Per-piece durability factor: 1.0 at full or untracked, scales down
 *  to 0.4 at 0 durability so even broken kit has a salvage value. */
function durabilityFraction(item: InventoryItem): number {
  const d = item.durability;
  if (!d || d.max <= 0) return 1;
  const ratio = d.current / d.max;
  return Math.max(0.4, Math.min(1, ratio));
}

/** True if the item cannot be sold — quest items, equipped items, etc.
 *  Equipped check is the caller's responsibility (we don't have player
 *  context here); this just covers the catalog-level cases. */
export function isUnsellable(item: InventoryItem): boolean {
  if (item.tags?.includes('quest')) return true;
  if (item.tags?.includes('unsellable')) return true;
  // arb107 — Crucible-fused items are UNSELLABLE. They're one-of-a-kind
  // gear minted to be wielded, not a commodity. Without this, a fused
  // item's unique name never matches a vendor offer, so it fell through to
  // the RARITY_BASE fallback (96 TC for a forced-Legendary faction fuse,
  // 36 TC for a Rare) — far above its acquisition cost (free scrap + a
  // ~50 TC catalyst + a free outpost Crucible). That was an unbounded,
  // net-positive money pump (red-team confirmed). The `fused` tag is
  // stamped by applyFusion on every fused item, faction-themed or not, so
  // this closes both the faction-catalyst and plain-fusion variants.
  if (item.tags?.includes('fused')) return true;
  return false;
}
