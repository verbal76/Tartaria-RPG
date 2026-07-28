// OTA-911 — great-climb guardian ambushes + the strap's move to the legs slot.

import {
  climbEncounterTiers,
  climbEncounterAtTier,
  buildClimbEncounter,
} from '../app/engine/climbEncounters';
import { validSlotsForItem } from '../app/engine/equipment';
import type { InventoryItem } from '../app/engine/types';

describe('OTA-911 — climb encounter scheduling', () => {
  it('every great climb fires at least two ambushes, more the taller it is', () => {
    const counts = [11, 12, 13, 14, 15].map((n) => climbEncounterTiers(n).length);
    for (const c of counts) expect(c).toBeGreaterThanOrEqual(2);
    // monotonic-ish and scales with height: the 15-tier climb has more than the 11
    expect(climbEncounterTiers(15).length).toBeGreaterThan(climbEncounterTiers(11).length);
  });

  it('ambush tiers sit in the middle pitches — never the first hold or the summit', () => {
    for (const n of [11, 12, 13, 14, 15]) {
      const tiers = climbEncounterTiers(n);
      for (const t of tiers) {
        expect(t).toBeGreaterThanOrEqual(2);
        expect(t).toBeLessThanOrEqual(n - 1);
      }
      // no duplicates
      expect(new Set(tiers).size).toBe(tiers.length);
    }
  });

  it('climbEncounterAtTier agrees with the schedule', () => {
    const tiers = climbEncounterTiers(15);
    expect(climbEncounterAtTier(tiers[0]!, 15)).toBe(true);
    expect(climbEncounterAtTier(1, 15)).toBe(false); // first hold is safe
    expect(climbEncounterAtTier(15, 15)).toBe(false); // summit is the reward, not a fight
  });

  it('builds winged/drone guardians that get tougher higher up', () => {
    const low = buildClimbEncounter(3, 15);
    const high = buildClimbEncounter(13, 15);
    for (const enc of [low, high]) {
      expect(enc.enemies.length).toBeGreaterThanOrEqual(1);
      expect(enc.intro.length).toBeGreaterThan(10);
      for (const e of enc.enemies) {
        expect(e.type).toBe('Automation');
        expect((e.traits ?? []).includes('aerial')).toBe(true); // winged / airborne
        expect(e.loot.length).toBeGreaterThan(0);
      }
    }
    // higher band is a rarer construct than the low band
    const rank = (r: string) => ['Common', 'Uncommon', 'Rare', 'Legendary'].indexOf(r);
    expect(rank(high.enemies[0]!.rarity)).toBeGreaterThan(rank(low.enemies[0]!.rarity));
  });

  it('is deterministic on (tier, totalTiers)', () => {
    const a = buildClimbEncounter(8, 14);
    const b = buildClimbEncounter(8, 14);
    expect(a.enemies.map((e) => e.name)).toEqual(b.enemies.map((e) => e.name));
  });
});

describe('OTA-911 — the Hardened Climbing Strap is worn on the legs', () => {
  const strap: InventoryItem = {
    id: 'strap_test',
    name: 'Hardened Climbing Strap',
    kind: 'misc',
    rarity: 'Common',
    quantity: 1,
    tags: ['exploration', 'common', 'wardrobe'],
  };

  it('routes the wardrobe strap to the legs slot (not cloak)', () => {
    expect(validSlotsForItem(strap)).toEqual(['legs']);
  });
});
