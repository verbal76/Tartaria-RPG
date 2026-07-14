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
import { findRecipeByResult, findMaterialByName, findWeaponByName, findArmorByName, findGearByName } from './crafting';

// Approximate "fair" base price per rarity tier, in TC. Matches the
// upper bound of typical vendor catalog prices.
const RARITY_BASE: Record<Rarity, number> = {
  Common: 12,
  Uncommon: 35,
  Rare: 90,
  Legendary: 240,
};

// OTA-802 (B1c) — "you can never sell an item back for more than the CHEAPEST
// price you could have bought it for." Stall buy prices are random
// (vendors.rarityPrice × a 0.8–1.25 haggle spread), so the cheapest realistic buy
// of a bonus-less item is ≈ rarityPrice-min × 0.8. Capping the sell-back at that
// closes cross-stall arbitrage (the reported case: a Common armor selling back for
// 11 TC while a stall sold it for 8). Deterministic so buy/sell can't drift apart
// with the RNG. Untiered raw stuff (no rarity) keeps its small kind-based value.
const RARITY_BUY_FLOOR: Record<Rarity, number> = {
  Common: 5,      // rarityPrice min 6 × 0.8
  Uncommon: 14,   // 18 × 0.8
  Rare: 40,       // 50 × 0.8
  Legendary: 112, // 140 × 0.8
};

// OTA-802 (B1b) — bottleneck CRAFTING materials (Golem/aether fuel + Mud-Golem
// stock). Keeping fused items scrappable created a real crafting-materials market
// (the intended loop), but these mats carried a rarity that made them lucrative to
// SELL — so fuse-free-junk → scrap → sell was a money pump. Per the design call:
// keep the scrap feeding crafting, just price these as near-worthless AT VENDORS
// so they're valuable to YOU (to craft/summon with), not as cash. A flat 3 TC —
// above the 2 TC misc floor so they're not literally worthless, well below the
// old rarity price (a Rare Golem Core was ~36 TC).
const BOTTLENECK_CRAFTING_SELL = 3;
const BOTTLENECK_CRAFTING_MATS = new Set([
  'golem core', 'aetheric shard', 'aether dust', 'aetheric dust',
  'aether crystal', 'aetheric cloth', 'mudstone',
]);

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

/** OTA-802 (B1a) — the raw SELL value of a named material/item, for costing a
 *  recipe's ingredients. Mirrors sellPriceFor's own base logic (catalog rarity →
 *  base table × SELL_FRACTION) so a crafted item's sell cap is grounded in what
 *  you'd get selling the raw ingredients instead. Vendor-independent. */
function rawSellValueByName(name: string): number {
  const rarity =
    findMaterialByName(name)?.rarity
    ?? findWeaponByName(name)?.rarity
    ?? findArmorByName(name)?.rarity
    ?? findGearByName(name)?.rarity;
  if (!rarity) return 2; // untiered raw material ≈ misc floor
  return Math.max(1, Math.round(RARITY_BASE[rarity] * SELL_FRACTION));
}

/** OTA-802 (B1a) — sell cap for a SELF-CRAFTED item: the summed raw-sell value of
 *  its recipe ingredients, so crafting-to-sell is break-even (never a profit
 *  loop) — you can't out-earn just selling the parts. A Legendary result gets a
 *  slight bump (×1.25) per the design call: a Legendary craft is a real
 *  achievement and may net a little over parts. Returns null when the item has no
 *  known recipe (can't cost it) — the normal price then stands. */
function selfCraftedSellCap(item: InventoryItem): number | null {
  const recipe = findRecipeByResult(item.name);
  if (!recipe) return null;
  const ingredientValue = recipe.ingredients.reduce(
    (sum, ing) => sum + rawSellValueByName(ing.name) * ing.quantity,
    0,
  );
  const bump = item.rarity === 'Legendary' ? 1.25 : 1;
  return Math.max(1, Math.round(ingredientValue * bump));
}

export function sellPriceFor(
  item: InventoryItem,
  vendor: VendorInstance | null | undefined,
  // OTA-805 — Charisma-scaled faction rapport BONUS (0..0.20). Applied to the FINAL
  // sell price (after the B1 caps) so an earned, high-CHA merchant genuinely sells
  // higher at a faction they've built rapport with. It's an earned exception to the
  // generic RARITY_BUY_FLOOR cap; the SELL_FRACTION (0.4) gap keeps buy-then-sell a
  // loss so it's a merchant perk, not arbitrage. Bottleneck crafting mats are
  // exempt (they stay crafting-only). Callers pass vendorPriceMod(...); default 0.
  rapportBonus = 0,
): number {
  const withRapport = (price: number) =>
    rapportBonus > 0 ? Math.max(1, Math.round(price * (1 + rapportBonus))) : price;
  // OTA-802 (B1b) — bottleneck crafting materials price as near-worthless AT
  // VENDORS (crafting-only value), checked BEFORE the vendor-offer match so a
  // materials stall that lists them can't reopen the fuse→scrap→sell money pump.
  // No rapport bonus — they're deliberately not a cash commodity.
  if (BOTTLENECK_CRAFTING_MATS.has(item.name.toLowerCase())) {
    return BOTTLENECK_CRAFTING_SELL;
  }
  // Match against the vendor's own offers first — that's the most
  // accurate price reference because it reflects what they paid.
  let raw: number;
  if (vendor) {
    const offer = vendor.offers.find((o) => o.itemName.toLowerCase() === item.name.toLowerCase());
    if (offer) {
      const dur = durabilityFraction(item);
      raw = Math.max(1, Math.round(offer.price * SELL_FRACTION * dur));
      return withRapport(applySellCaps(item, raw));
    }
  }
  if (!item.rarity) {
    // Untiered raw stuff still has a small base value via kind.
    if (item.kind === 'consumable') return withRapport(3);
    if (item.kind === 'misc') return withRapport(2);
    return withRapport(1);
  }
  // arb149 — equippable gear uses the higher gear base; everything else (relics,
  // materials, consumables-with-a-tier) keeps the generic base.
  const baseTable = GEAR_KINDS.has(item.kind) ? GEAR_RARITY_BASE : RARITY_BASE;
  const base = baseTable[item.rarity] ?? 5;
  const dur = durabilityFraction(item);
  raw = Math.max(1, Math.round(base * SELL_FRACTION * dur));
  return withRapport(applySellCaps(item, raw));
}

/** OTA-802 — apply the B1 sell caps to a computed base sell price:
 *  (a) a self-crafted item never sells above its ingredient value (+Legendary
 *      bump); (c) nothing sells above the cheapest realistic buy for its rarity
 *  (RARITY_BUY_FLOOR), closing cross-stall arbitrage. */
function applySellCaps(item: InventoryItem, raw: number): number {
  let price = raw;
  if (item.selfCrafted) {
    const cap = selfCraftedSellCap(item);
    if (cap != null) price = Math.min(price, cap);
  }
  if (item.rarity) {
    price = Math.min(price, RARITY_BUY_FLOOR[item.rarity] ?? price);
  }
  return Math.max(1, price);
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
