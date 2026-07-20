// OTA-912 — summit bosses, the Aether Collection Beacon → Skyreacher Boltcaster
// reward chain, and the Skyreacher Chart map items. Engine/data contract only;
// the store flow (spawn → defeat → grant) rides on the greatClimbs handler.

import {
  GREAT_CLIMBS,
  SUMMIT_BOSSES,
  summitBossFor,
  buildSummitBoss,
  summitClimbIdFromEnemy,
  greatClimbById,
} from '../app/engine/greatClimbs';
import { findWeaponByName, findGearByName } from '../app/engine/crafting';

describe('OTA-912 — summit bosses', () => {
  it('has one named boss per great climb, all flagged boss:true and machine-typed', () => {
    expect(SUMMIT_BOSSES).toHaveLength(5);
    const climbIds = new Set(GREAT_CLIMBS.map((c) => c.id));
    for (const b of SUMMIT_BOSSES) {
      expect(climbIds.has(b.climbId)).toBe(true);
      expect(b.base.boss).toBe(true);
      expect(b.base.rarity).toBe('Legendary');
      expect(b.base.name.length).toBeGreaterThan(3);
      expect(b.approachLine.length).toBeGreaterThan(20);
      expect(b.defeatLine.length).toBeGreaterThan(10);
    }
    // one per climb, no gaps
    expect(new Set(SUMMIT_BOSSES.map((b) => b.climbId)).size).toBe(5);
  });

  it('bosses read as vulnerable to the anti-machine elements the Boltcaster deals', () => {
    // OTA-918 — electrical weakness now comes from the Automation/Mechanism TYPE map
    // (a single 1.5x); the explicit vulnerable:electrical trait was removed because it
    // double-dipped (type-weak x trait-vuln = 2.25x). Acid is NOT a type weakness, so
    // its trait is the intended single source that makes the Boltcaster's acid rider bite.
    for (const b of SUMMIT_BOSSES) {
      const traits = b.base.traits ?? [];
      expect(['Automation', 'Mechanism']).toContain(b.base.type); // type map carries the electrical weakness
      expect(traits).not.toContain('vulnerable:electrical'); // no double-dip
      expect(traits).toContain('vulnerable:acid');
    }
  });

  it('summit bosses sit at a real boss HP tier (guarding the biggest reward)', () => {
    // OTA-918 — raised from 270-320 (~46% of the story-boss floor) to a real Legendary
    // boss tier so the game's largest reward package isn't behind its lightest fight.
    for (const b of SUMMIT_BOSSES) {
      expect(b.base.hp).toBeGreaterThanOrEqual(440);
    }
  });

  it('buildSummitBoss stamps the climb-id trait, and it round-trips through summitClimbIdFromEnemy', () => {
    for (const c of GREAT_CLIMBS) {
      const boss = buildSummitBoss(c.id);
      expect(boss).not.toBeNull();
      expect(summitClimbIdFromEnemy(boss)).toBe(c.id);
      expect(summitBossFor(c.id)?.climbId).toBe(c.id);
    }
    // a generic enemy carries no summit id
    expect(summitClimbIdFromEnemy({ traits: ['armored', 'aerial'] })).toBeNull();
    expect(buildSummitBoss('nope')).toBeNull();
  });
});

describe('OTA-912 — the reward chain (Boltcaster + charts + beacon)', () => {
  it('the Beacon Rifle is a collect-only Legendary electrical weapon', () => {
    const bolt = findWeaponByName('Beacon Rifle');
    expect(bolt).not.toBeNull();
    expect(bolt!.rarity).toBe('Legendary');
    expect(bolt!.damageType).toBe('electrical'); // acid rider is a permanent baked-in coating at build
    expect(bolt!.tags).toContain('collect_only');
    expect(bolt!.tags).toContain('beacon_rifle');
  });

  it('the Aether Collection Beacon exists as a collect-only quest item', () => {
    const beacon = findGearByName('Aether Collection Beacon');
    expect(beacon).not.toBeNull();
    expect(beacon!.tags).toContain('collect_only');
  });

  it('all five Skyreacher Charts carry a map effect pointing at a real great climb', () => {
    const seen = new Set<string>();
    for (let i = 1; i <= 5; i++) {
      const chart = findGearByName(`Skyreacher Chart (${i} of 5)`);
      expect(chart).not.toBeNull();
      const fx = chart!.effect as { kind: string; climbId: string; index: number; total: number } | undefined;
      expect(fx?.kind).toBe('map');
      expect(fx?.total).toBe(5);
      expect(fx?.index).toBe(i);
      expect(greatClimbById(fx!.climbId)).not.toBeNull();
      seen.add(fx!.climbId);
    }
    // the five charts cover all five distinct climbs
    expect(seen.size).toBe(5);
  });
});
