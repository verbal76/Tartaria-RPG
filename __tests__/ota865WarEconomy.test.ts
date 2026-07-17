// OTA-865 [war micro-economy] — contested ground moves vendor prices. Pins the pure
// pieces: war-heat from patrol density, the bounded price multipliers, the buy-price
// chain + the "stranger price" the savings line reads from, and the ▲/▼ ticker semantics.

import { warPriceFactor, finalBuyPrice, strangerBuyPrice, priceArrow } from '../app/engine/vendorPricing';
import { localWarHeat, contestedFactions, type Patrol } from '../app/engine/worldEvents';

const mk = (factionId: string, gx: number, gy: number): Patrol => ({ factionId, gx, gy, homeX: gx, homeY: gy, phase: 0 });

describe('OTA-865 — localWarHeat', () => {
  it('quiet ground reads ~0; a lone patrol is just traffic', () => {
    expect(localWarHeat([], 40, 20)).toBe(0);
    expect(localWarHeat([mk('a', 40, 20)], 40, 20)).toBe(0); // baseline of 1 subtracted
  });
  it('a cluster of war-parties heats the ground toward 1', () => {
    const cluster = Array.from({ length: 8 }, (_, i) => mk(i % 2 ? 'a' : 'b', 40 + (i % 3), 20 + (i % 2)));
    expect(localWarHeat(cluster, 40, 20)).toBeGreaterThan(0.5);
  });
  it('saturates at 1 and never exceeds it', () => {
    const swarm = Array.from({ length: 30 }, () => mk('a', 40, 20));
    expect(localWarHeat(swarm, 40, 20)).toBe(1);
  });
  it('distant patrols do not count', () => {
    expect(localWarHeat([mk('a', 5, 5), mk('a', 78, 38)], 40, 20)).toBe(0);
  });
});

describe('OTA-865 — contestedFactions', () => {
  it('returns the two factions with the most nearby war-parties', () => {
    const near = [mk('order', 40, 20), mk('order', 41, 20), mk('order', 40, 21), mk('monarchs', 41, 21), mk('ghost', 42, 20)];
    const top = contestedFactions(near, 40, 20);
    expect(top[0]).toBe('order');       // 3 parties, clear lead
    expect(top).toEqual(['order', 'ghost']); // second slot: count tie (1=1) broken id-ascending
    expect(top.length).toBeLessThanOrEqual(2);
  });
});

describe('OTA-865 — warPriceFactor is bounded', () => {
  it('no heat = no change; full heat = +12% buy / +8% sell; clamps', () => {
    expect(warPriceFactor(0)).toEqual({ buyMult: 1, sellMult: 1 });
    expect(warPriceFactor(1)).toEqual({ buyMult: 1.12, sellMult: 1.08 });
    expect(warPriceFactor(5).buyMult).toBe(1.12);   // clamped
    expect(warPriceFactor(-1).buyMult).toBe(1);      // clamped
  });
});

describe('OTA-865 — buy price chain + stranger price', () => {
  it('the discount lowers the buy price; a stranger (no discount) pays more', () => {
    // No corruption/tide/war so the arithmetic is exact: you = 100×0.8 = 80, stranger = 100.
    const parts = { corruptionMult: 1, buyDiscount: 0.2, tideMult: 1, warBuyMult: 1 };
    expect(finalBuyPrice(100, parts)).toBe(80);
    expect(strangerBuyPrice(100, parts)).toBe(100);
    expect(strangerBuyPrice(100, parts)).toBeGreaterThan(finalBuyPrice(100, parts)); // saved coin
  });
  it('war heat raises what everyone pays', () => {
    const base = { corruptionMult: 1, buyDiscount: 0.2, tideMult: 1 };
    const calm = finalBuyPrice(100, { ...base, warBuyMult: 1 });
    const hot = finalBuyPrice(100, { ...base, warBuyMult: 1.12 });
    expect(hot).toBeGreaterThan(calm);
  });
});

describe('OTA-865 — priceArrow semantics (color = player benefit)', () => {
  it('BUY: above base is bad (red ▲), below base is good (green ▼), equal is null', () => {
    expect(priceArrow(120, 100, 'buy')).toEqual({ glyph: '▲', good: false });
    expect(priceArrow(80, 100, 'buy')).toEqual({ glyph: '▼', good: true });
    expect(priceArrow(100, 100, 'buy')).toBeNull();
  });
  it('SELL: above base is good (green ▲), below base is bad (red ▼)', () => {
    expect(priceArrow(120, 100, 'sell')).toEqual({ glyph: '▲', good: true });
    expect(priceArrow(80, 100, 'sell')).toEqual({ glyph: '▼', good: false });
  });
});
