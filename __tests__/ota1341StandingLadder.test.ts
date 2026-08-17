// ⚠ OTA-1341 — FACTION STANDING FINALLY DOES SOMETHING AT THE COUNTER.
//
// Owner: *"what the hell do I actually do at faction standing? I've traded with
// the vendor that I had a negative 90 on … there's no real benefit to have good
// standing. I could be a giant asshole to everybody."* Verified true before this
// OTA: vendorPriceMod never read standing, and pressure.ts only used it to
// punish. The ladder this suite pins:
//   Known (+10) 5% · Trusted (+25) 10% + rapport vouched · Honored (+50) 15%
//   Hostile (−25) +15% markup · Hated (−50) +25% markup
// and the two safety rules that make it shippable:
//   · the combined positive discount (CHA + ladder) caps at 0.20 — the exact cap
//     the OTA-802/916 no-arbitrage argument was made at;
//   · hostility overrides charm — no discount ever stacks onto a markup.
import {
  vendorPriceMod, standingTier, standingTierLabel, standingPriceDiscount,
  rapportQuestId, CHA_PRICE_DISCOUNT_CAP,
} from '../app/engine/factionRapport';
import { sellPriceFor } from '../app/engine/sellPrice';
import type { InventoryItem } from '../app/engine/types';

const F = 'reclaimers_guild';
const rapportDone = [rapportQuestId(F)];

describe('OTA-1341 — the standing ladder at the vendor counter', () => {
  it('⚠⚠ the tiers price as documented, with no quest and no Charisma', () => {
    expect(vendorPriceMod(10, [], F, 0)).toBe(0);
    expect(vendorPriceMod(10, [], F, 10)).toBeCloseTo(0.05);
    expect(vendorPriceMod(10, [], F, 25)).toBeCloseTo(0.10);
    expect(vendorPriceMod(10, [], F, 50)).toBeCloseTo(0.15);
    expect(vendorPriceMod(10, [], F, -25)).toBeCloseTo(-0.15);
    expect(vendorPriceMod(10, [], F, -90)).toBeCloseTo(-0.25);
  });

  it('⚠⚠ the combined positive discount caps at the proven-safe 0.20', () => {
    // CHA 20 (0.20) + Honored (0.15) must NOT become 0.35 — that would let a
    // discounted buy undercut the 0.8×catalog sell ceiling (arbitrage).
    expect(vendorPriceMod(20, rapportDone, F, 50)).toBeCloseTo(CHA_PRICE_DISCOUNT_CAP);
    expect(vendorPriceMod(20, rapportDone, F, 50)).toBeLessThanOrEqual(0.20);
  });

  it('⚠ Trusted standing vouches for you: the CHA discount flows without the rapport quest', () => {
    // CHA 15 = 10% charm. Un-vouched stranger: standing 0 → nothing.
    expect(vendorPriceMod(15, [], F, 0)).toBe(0);
    // Trusted: charm (0.10) + ladder (0.10) = 0.20, no quest completed.
    expect(vendorPriceMod(15, [], F, 25)).toBeCloseTo(0.20);
  });

  it('⚠ hostility overrides charm — a Hated faction never discounts, whatever your Charisma', () => {
    expect(vendorPriceMod(20, rapportDone, F, -50)).toBeCloseTo(-0.25);
  });

  it('a factionless vendor is untouched by the ladder', () => {
    expect(vendorPriceMod(20, rapportDone, null, 50)).toBe(0);
    expect(vendorPriceMod(20, rapportDone, undefined, -50)).toBe(0);
  });

  it('the tier reads and labels agree with the thresholds', () => {
    expect(standingTier(9)).toBe('neutral');
    expect(standingTier(10)).toBe('known');
    expect(standingTier(24)).toBe('known');
    expect(standingTier(25)).toBe('trusted');
    expect(standingTier(50)).toBe('honored');
    expect(standingTier(-25)).toBe('hostile');
    expect(standingTier(-50)).toBe('hated');
    expect(standingTierLabel(-90)).toBe('Hated');
    expect(standingTierLabel(0)).toBe('Neutral');
    expect(standingPriceDiscount(0)).toBe(0);
  });

  it('⚠ a negative modifier reaches the sell-back: the vendor who hates you pays less', () => {
    const item: InventoryItem = {
      id: 's1', name: 'Patched Cloth', kind: 'misc', rarity: 'Common', quantity: 1, tags: [],
    } as InventoryItem;
    const neutral = sellPriceFor(item, null, 0);
    const hated = sellPriceFor(item, null, -0.25);
    expect(hated).toBeLessThanOrEqual(neutral);
    expect(hated).toBeGreaterThanOrEqual(1);
  });
});
