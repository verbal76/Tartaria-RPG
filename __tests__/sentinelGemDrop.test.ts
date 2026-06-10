import { resurrectionGemDropChance, BASE_GEM_DROP_CHANCE } from '../app/engine/raceMechanics';

// arb-fix — Sentinel "Immunity to Time": raised per-kill Resurrection Gem
// drop chance. Other races keep the base rate.
describe('Sentinel Resurrection Gem drop boost', () => {
  it('Sentinels get a higher per-kill gem chance than the base rate', () => {
    expect(resurrectionGemDropChance('architectural_sentinel')).toBeGreaterThan(BASE_GEM_DROP_CHANCE);
  });

  it('every other race keeps the base rate', () => {
    for (const r of ['tartarian_giant', 'mud_dweller', 'reclaimer', 'mud_golem', 'unknowing_mass', 'aetherborn']) {
      expect(resurrectionGemDropChance(r)).toBe(BASE_GEM_DROP_CHANCE);
    }
    expect(resurrectionGemDropChance(undefined)).toBe(BASE_GEM_DROP_CHANCE);
  });

  it('the boost stays rare (well under 5% per kill)', () => {
    expect(resurrectionGemDropChance('architectural_sentinel')).toBeLessThan(0.05);
  });

  // OTA-436 — [audit #20] gem economy tightened: base halved to 0.25%, Sentinel
  // to ~0.625%, so passive gem income roughly halves and death keeps its stakes.
  it('base + Sentinel rates are the tightened values', () => {
    expect(BASE_GEM_DROP_CHANCE).toBe(0.0025);
    expect(resurrectionGemDropChance('architectural_sentinel')).toBe(0.00625);
  });
});
