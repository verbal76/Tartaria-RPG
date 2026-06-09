import { buildStallVendor } from '../app/engine/vendors';

// OTA-384 — armor/materials carry no authored `tc`, so they fell to a narrow
// rarity floor and Common pieces collapsed onto ~5 TC. Pricing is now grounded
// in the item's worth (armor folds in AC / stat bonuses / durability) with a
// wider rarity band, so the shelf shows real variation.

function collect(category: 'armor' | 'materials', runs: number): number[] {
  const prices: number[] = [];
  for (let i = 0; i < runs; i++) {
    for (const o of buildStallVendor(category, 'Stall').offers) prices.push(o.price);
  }
  return prices;
}

describe('stall pricing variation', () => {
  it('armor prices vary and clear the old ~5 TC floor', () => {
    const prices = collect('armor', 40);
    expect(prices.length).toBeGreaterThan(20);
    // Many distinct values — not everything pinned to one low number.
    expect(new Set(prices).size).toBeGreaterThan(8);
    // A real spread exists between the cheapest and priciest pieces.
    expect(Math.max(...prices) - Math.min(...prices)).toBeGreaterThan(20);
    // Value-grounded prices sit well above the old flat ~5.
    const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
    expect(avg).toBeGreaterThan(15);
  });

  it('materials prices vary too (wider rarity band)', () => {
    const prices = collect('materials', 40);
    expect(new Set(prices).size).toBeGreaterThan(5);
  });
});
