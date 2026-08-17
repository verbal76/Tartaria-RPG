// ⚠ OTA-1336 — COMMONS SELL FOR WHAT THEY ARE, NOT FOR THE FLAT FLOOR.
//
// Owner: *"I sold the other day like 11 items. I got 81 TC … I think our floor is
// too low on selling Commons."* And his own pricing instinct: *"two bone compound
// bows, one 10/10, one 32/32 … one sells for 11 or 12."*
//
// Two defects made every Common weapon sell at 5 TC:
//   1. The OTA-922 per-piece arbitrage hatch read `tcBuy` and ARMOR only. Weapons
//      author their price as `tc` (265 of 276; Commons list 15–55 TC), and the
//      stall lists a weapon at `tc || tcBuy || rarityPrice` — so the "cheapest
//      realistic buy" the flat 5 TC floor modelled does not exist for a priced
//      weapon. gearBuyFloor now reads `tcBuy ?? tc` for both kinds.
//   2. Two pristine copies of one piece priced identically regardless of the
//      temper roll. Gear now sells in a QUALITY band (0.35–0.5 of base): the
//      temper extremes (sturdy workhorse / fragile glass-cannon) both price high
//      — pricing off durability max alone would underprice glass cannons, whose
//      power went into perks instead.
//
// The OTA-802 invariant is untouched and asserted here: nothing ever sells above
// 0.8 × its own catalog price — no cross-stall arbitrage.
import { sellPriceFor } from '../app/engine/sellPrice';
import { findWeaponByName, findArmorByName, WEAPONS, ARMOR } from '../app/engine/crafting';
import type { InventoryItem } from '../app/engine/types';

type Priced = { name: string; rarity?: string; tc?: number; tcBuy?: number; baseDurability?: number };

// A real Common weapon with an authored price and a real durability base, straight
// from the live catalog — the test tracks the data, not a hardcoded name.
const commonWeapon = (WEAPONS as unknown as Priced[]).find(
  (w) => w.rarity === 'Common' && (w.tc ?? 0) >= 30 && (w.baseDurability ?? 25) >= 20,
)!;

const gear = (name: string, kind: 'weapon' | 'armor', durability?: { current: number; max: number }): InventoryItem => ({
  id: 't1', name, kind, rarity: 'Common', quantity: 1, tags: [],
  ...(durability ? { durability } : {}),
} as InventoryItem);

describe('OTA-1336 — the Common sell floor prices the instance', () => {
  const base = commonWeapon.baseDurability ?? 25;

  it('⚠⚠ a pristine sturdy Common weapon clears the owner\'s "11 or 12"', () => {
    // temper 1 → max = base × 1.8 (the 32/32 of his example, scaled).
    const sturdyMax = Math.round(base * 1.8);
    const price = sellPriceFor(gear(commonWeapon.name, 'weapon', { current: sturdyMax, max: sturdyMax }), null);
    expect(price).toBeGreaterThanOrEqual(11);
  });

  it('⚠⚠ a pristine glass-cannon prices HIGH too — its power went into perks, not longevity', () => {
    // temper 0 → max = base × 0.4. Pricing off durability max alone would call
    // this piece junk; the whole-instance read says it is a specialist roll.
    const fragileMax = Math.max(1, Math.round(base * 0.4));
    const price = sellPriceFor(gear(commonWeapon.name, 'weapon', { current: fragileMax, max: fragileMax }), null);
    expect(price).toBeGreaterThanOrEqual(11);
  });

  it('⚠ a middling temper prices lowest of the three, but far above the old 5 TC clamp', () => {
    const midMax = Math.round(base * 1.1); // temper 0.5
    const mid = sellPriceFor(gear(commonWeapon.name, 'weapon', { current: midMax, max: midMax }), null);
    const sturdyMax = Math.round(base * 1.8);
    const sturdy = sellPriceFor(gear(commonWeapon.name, 'weapon', { current: sturdyMax, max: sturdyMax }), null);
    expect(mid).toBeGreaterThan(5);
    expect(mid).toBeLessThanOrEqual(sturdy);
  });

  it('⚠ wear still discounts: a beaten copy sells for less than a pristine one', () => {
    const max = Math.round(base * 1.8);
    const pristine = sellPriceFor(gear(commonWeapon.name, 'weapon', { current: max, max }), null);
    const beaten = sellPriceFor(gear(commonWeapon.name, 'weapon', { current: Math.max(1, Math.round(max * 0.2)), max }), null);
    expect(beaten).toBeLessThan(pristine);
  });

  it('⚠⚠ the OTA-802 invariant holds for every priced Common piece: sell ≤ 0.8 × its own buy price', () => {
    const check = (rows: Priced[], kind: 'weapon' | 'armor') => {
      for (const row of rows) {
        if (row.rarity !== 'Common') continue;
        const buy = row.tcBuy ?? row.tc;
        if (!buy || buy <= 0) continue;
        const rowBase = row.baseDurability ?? 25;
        const max = Math.round(rowBase * 1.8); // best-case instance
        const price = sellPriceFor(gear(row.name, kind, { current: max, max }), null);
        expect(price).toBeLessThanOrEqual(Math.round(buy * 0.8));
      }
    };
    check(WEAPONS as unknown as Priced[], 'weapon');
    check(ARMOR as unknown as Priced[], 'armor');
  });

  it('⚠ cheap authored armor stays bounded by its OWN buy price (a tcBuy-8 vest still sells ~6)', () => {
    const cheap = (ARMOR as unknown as Priced[]).find((a) => a.rarity === 'Common' && (a.tcBuy ?? 99) <= 8);
    if (!cheap) return; // catalog changed — the invariant test above still covers it
    const rowBase = cheap.baseDurability ?? 25;
    const max = Math.round(rowBase * 1.8);
    const price = sellPriceFor(gear(cheap.name, 'armor', { current: max, max }), null);
    expect(price).toBeLessThanOrEqual(Math.round((cheap.tcBuy ?? 8) * 0.8));
  });

  it('⚠ an unpriced catalog piece keeps the flat floor of its OWN rarity (no undefined blowups)', () => {
    // The Golem weapon line carries no tc/tcBuy — it must fall back cleanly to the
    // flat RARITY_BUY_FLOOR for whatever tier the piece actually is.
    const unpriced = (WEAPONS as unknown as Priced[]).find((w) => !w.tc && !w.tcBuy);
    if (!unpriced) return;
    const flatFloor: Record<string, number> = { Common: 5, Uncommon: 14, Rare: 40, Legendary: 112 };
    const price = sellPriceFor(gear(unpriced.name, 'weapon', { current: 20, max: 20 }), null);
    expect(price).toBeGreaterThanOrEqual(1);
    expect(price).toBeLessThanOrEqual(flatFloor[unpriced.rarity ?? 'Common'] ?? 5);
  });

  it('sanity: the catalog rows the suite leans on exist', () => {
    expect(commonWeapon).toBeTruthy();
    expect(findWeaponByName(commonWeapon.name)).toBeTruthy();
    expect(findArmorByName('definitely-not-a-real-piece')).toBeFalsy();
  });
});
