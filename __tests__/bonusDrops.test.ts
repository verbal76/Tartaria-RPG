// OTA-716 — a Fallout-4-ish sprinkle of GOOD crafting materials on top of
// the basic loot flood, at two engagement moments: a hard-won fight, and a
// completed (easy-to-miss) story thread. Purely additive; materials only.

import {
  rollBonusMaterial,
  isHardWonFight,
  maybeCombatBonus,
  maybeLoreHookBonus,
  HARD_WON_COMBAT_BONUS_CHANCE,
  LORE_HOOK_BONUS_CHANCE,
} from '../app/engine/bonusDrops';

// Deterministic rng that yields a fixed queue then repeats the last value.
function seq(values: number[]): () => number {
  let i = 0;
  return () => (i < values.length ? values[i++]! : values[values.length - 1]!);
}
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0x100000000; };
}

describe('OTA-716 — isHardWonFight', () => {
  it('true for tanky / Rare+ / boss enemies', () => {
    expect(isHardWonFight({ hp: 110, rarity: 'Common' })).toBe(true);   // high HP
    expect(isHardWonFight({ hp: 10, rarity: 'Rare' })).toBe(true);      // rare
    expect(isHardWonFight({ hp: 10, rarity: 'Legendary' })).toBe(true);
    expect(isHardWonFight({ hp: 10, rarity: 'Common', boss: true })).toBe(true);
  });
  it('false for a weak common enemy', () => {
    expect(isHardWonFight({ hp: 18, rarity: 'Common' })).toBe(false);
  });
});

describe('OTA-716 — rollBonusMaterial tiers', () => {
  it('picks Uncommon / Rare / Legendary by the roll band', () => {
    expect(rollBonusMaterial(seq([0.5, 0])).rarity).toBe('Uncommon');
    expect(rollBonusMaterial(seq([0.8, 0])).rarity).toBe('Rare');
    expect(rollBonusMaterial(seq([0.97, 0])).rarity).toBe('Legendary');
  });
  it('always returns a named material', () => {
    const m = rollBonusMaterial(seq([0.5, 0]));
    expect(typeof m.name).toBe('string');
    expect(m.name.length).toBeGreaterThan(0);
  });
});

describe('OTA-716 — maybeCombatBonus (additive, hard-won only)', () => {
  it('never fires for a weak fight, however lucky the roll', () => {
    expect(maybeCombatBonus({ hp: 18, rarity: 'Common' }, seq([0.0, 0.0, 0.0]))).toBeNull();
  });
  it('fires for a hard fight when the chance roll passes', () => {
    // first rng = chance (0.1 < 0.22 → yes), then tier (0.5 → Uncommon), pick.
    const b = maybeCombatBonus({ hp: 110, rarity: 'Common' }, seq([0.1, 0.5, 0]));
    expect(b).toBeTruthy();
    expect(b!.rarity).toBe('Uncommon');
  });
  it('does NOT fire on a hard fight when the chance roll fails', () => {
    expect(maybeCombatBonus({ hp: 110, rarity: 'Common' }, seq([0.9, 0, 0]))).toBeNull();
  });
});

describe('OTA-716 — maybeLoreHookBonus', () => {
  it('fires below the chance, not above', () => {
    expect(maybeLoreHookBonus(seq([0.1, 0.5, 0]))).toBeTruthy();
    expect(maybeLoreHookBonus(seq([0.95, 0, 0]))).toBeNull();
  });
});

describe('OTA-716 — cadence is a sprinkle, not every fight', () => {
  it('hard-won combat bonus lands near its configured rate', () => {
    const rng = lcg(0xBEEF);
    let hits = 0;
    const N = 20000;
    for (let i = 0; i < N; i++) if (maybeCombatBonus({ hp: 110, rarity: 'Common' }, rng)) hits++;
    const rate = hits / N;
    // Comfortably around HARD_WON_COMBAT_BONUS_CHANCE (0.22), never "always".
    expect(rate).toBeGreaterThan(HARD_WON_COMBAT_BONUS_CHANCE - 0.05);
    expect(rate).toBeLessThan(HARD_WON_COMBAT_BONUS_CHANCE + 0.05);
  });
  it('lore-hook bonus lands near its configured rate', () => {
    const rng = lcg(0xF00D);
    let hits = 0;
    const N = 20000;
    for (let i = 0; i < N; i++) if (maybeLoreHookBonus(rng)) hits++;
    const rate = hits / N;
    expect(rate).toBeGreaterThan(LORE_HOOK_BONUS_CHANCE - 0.05);
    expect(rate).toBeLessThan(LORE_HOOK_BONUS_CHANCE + 0.05);
  });
  it('material tiers skew Uncommon > Rare > Legendary', () => {
    const rng = lcg(0x1234);
    const counts = { Uncommon: 0, Rare: 0, Legendary: 0 };
    const N = 20000;
    for (let i = 0; i < N; i++) counts[rollBonusMaterial(rng).rarity]++;
    expect(counts.Uncommon).toBeGreaterThan(counts.Rare);
    expect(counts.Rare).toBeGreaterThan(counts.Legendary);
    expect(counts.Legendary).toBeGreaterThan(0); // still shows up sometimes
  });
});
