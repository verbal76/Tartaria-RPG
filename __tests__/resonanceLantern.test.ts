// OTA-772 — the Aetheric Torch "resonance probe" gamble.
//
// The torch became a scarce resource whose USE, in a room that still holds an
// unresolved hook, rolls a low WISDOM-scaled chance at a single Rare/Legendary
// material/weapon/armor drop. A miss is a dead miss. These tests pin the odds
// math, the WISDOM scaling of both hit-chance and tier, that a hit always
// resolves to a REAL catalog item, and that gear rewards exclude the
// Aethercraft "power" rows.

import {
  rollTorchProbe,
  rollTorchReward,
  probeHitChance,
  probeLegendaryChance,
  isResonanceLantern,
  PROBE_BASE_HIT,
  PROBE_WIS_HIT_CAP,
  PROBE_BASE_LEGENDARY,
} from '../app/engine/resonanceLantern';
import { WEAPONS, ARMOR, MATERIALS, lookupCraftedItem } from '../app/engine/crafting';

// A deterministic RNG that replays a fixed queue of values, then holds the
// last one. Lets each test drive the exact branch it wants.
function seq(values: number[]): () => number {
  let i = 0;
  return () => (i < values.length ? values[i++]! : values[values.length - 1]!);
}

describe('probe odds math', () => {
  it('base hit chance at WIS ≤ 10 is the floor', () => {
    expect(probeHitChance(10)).toBeCloseTo(PROBE_BASE_HIT, 5);
    expect(probeHitChance(1)).toBeCloseTo(PROBE_BASE_HIT, 5);
  });

  it('hit chance climbs with WISDOM but caps (~30% ceiling)', () => {
    expect(probeHitChance(14)).toBeGreaterThan(probeHitChance(10));
    expect(probeHitChance(18)).toBeGreaterThan(probeHitChance(14));
    // Capped: a huge WIS can't exceed base + cap.
    expect(probeHitChance(99)).toBeCloseTo(PROBE_BASE_HIT + PROBE_WIS_HIT_CAP, 5);
    expect(probeHitChance(99)).toBeLessThanOrEqual(0.30001);
  });

  it('legendary tier chance also scales with WISDOM off a low base', () => {
    expect(probeLegendaryChance(10)).toBeCloseTo(PROBE_BASE_LEGENDARY, 5);
    expect(probeLegendaryChance(20)).toBeGreaterThan(probeLegendaryChance(10));
  });
});

describe('rollTorchProbe outcomes', () => {
  it('a roll at/above the hit chance is a DEAD MISS (no reward)', () => {
    // First rng() = 0.99 ≥ hit chance → miss.
    const r = rollTorchProbe(14, seq([0.99]));
    expect(r.hit).toBe(false);
    expect(r.reward).toBeNull();
  });

  it('a roll below the hit chance HITS and yields a real catalog item', () => {
    // rng: [hit=0.0 < chance] [tier=0.99 → Rare] [category=0.0 → material] [pick=0]
    const r = rollTorchProbe(14, seq([0.0, 0.99, 0.0, 0.0]));
    expect(r.hit).toBe(true);
    expect(r.reward).not.toBeNull();
    expect(r.reward!.rarity).toBe('Rare');
    expect(r.reward!.category).toBe('material');
    // The granted name resolves to a REAL catalog row of the claimed rarity.
    const look = lookupCraftedItem(r.reward!.name);
    expect(look.rarity).toBe('Rare');
  });

  it('low tier-roll under the legendary chance yields a Legendary drop', () => {
    // rng: [hit=0.0] [tier=0.0 < legChance → Legendary] [category=0.9 → armor] [pick=0]
    const r = rollTorchProbe(20, seq([0.0, 0.0, 0.9, 0.0]));
    expect(r.hit).toBe(true);
    expect(r.reward!.rarity).toBe('Legendary');
    expect(r.reward!.category).toBe('armor');
    const look = lookupCraftedItem(r.reward!.name);
    expect(look.rarity).toBe('Legendary');
    expect(look.kind).toBe('armor');
  });

  it('a weapon reward is a real equippable weapon, never an Aethercraft power row', () => {
    // category=0.6 → weapon (between .55 and .775)
    const r = rollTorchProbe(14, seq([0.0, 0.99, 0.6, 0.0]));
    expect(r.hit).toBe(true);
    expect(r.reward!.category).toBe('weapon');
    const w = WEAPONS.find((x) => x.name === r.reward!.name)!;
    expect(w).toBeTruthy();
    // The 'weapon' tag is exactly what separates gear from rune_power rows.
    expect(w.tags).toContain('weapon');
    expect(w.tags).not.toContain('rune_power');
  });

  it('every material/weapon/armor pool is non-empty at both tiers (odds never dead-end)', () => {
    const hasRare = (list: readonly { rarity: string }[]) => list.some((x) => x.rarity === 'Rare');
    const hasLeg = (list: readonly { rarity: string }[]) => list.some((x) => x.rarity === 'Legendary');
    for (const list of [WEAPONS, ARMOR, MATERIALS]) {
      expect(hasRare(list)).toBe(true);
      expect(hasLeg(list)).toBe(true);
    }
  });
});

describe('rollTorchReward — the OTA-776 GUARANTEED aimed-tool payout', () => {
  it('always returns a real catalog reward (no hit gate)', () => {
    // Even a "would-miss" first rng value yields a reward — the tool is aimed,
    // not a gamble. Sweep several seeds; every one must produce a real item.
    for (const seed of [0.0, 0.3, 0.5, 0.7, 0.99]) {
      const r = rollTorchReward(14, seq([seed, seed, seed, seed]));
      expect(r).not.toBeNull();
      const look = lookupCraftedItem(r!.name);
      expect(['Rare', 'Legendary']).toContain(look.rarity);
      expect(r!.rarity).toBe(look.rarity);
    }
  });

  it('WISDOM still scales the Rare-vs-Legendary tier', () => {
    // tier roll = 0.0 is below the legendary chance at any WIS → Legendary.
    const leg = rollTorchReward(20, seq([0.0, 0.0, 0.0]));
    expect(leg!.rarity).toBe('Legendary');
    // tier roll = 0.99 is above the legendary chance → Rare.
    const rare = rollTorchReward(10, seq([0.99, 0.0, 0.0]));
    expect(rare!.rarity).toBe('Rare');
  });
});

describe('isResonanceLantern gates the gamble to torches only', () => {
  it('matches the Aetheric Torch and lantern variants', () => {
    expect(isResonanceLantern({ name: 'Aetheric Torch' })).toBe(true);
    expect(isResonanceLantern({ name: 'Storm Lantern' })).toBe(true);
  });

  it('does NOT match other revealScene detectors (flares, sound stones)', () => {
    expect(isResonanceLantern({ name: 'Signal Flare' })).toBe(false);
    expect(isResonanceLantern({ name: 'Aetheric Flare' })).toBe(false);
    expect(isResonanceLantern({ name: 'Basic Aether Detector' })).toBe(false);
    expect(isResonanceLantern({ name: 'Cavern Sound Stones' })).toBe(false);
  });
});
