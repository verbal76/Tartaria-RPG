// OTA-940 — the boss spoils table. Owner spec: no boss fight ends in mud cloth and
// scrap metal — bosses pay out high-end materials (+ a Rare, NOT Legendary, piece of
// gear for non-apex bosses); Guardians and summit/tower bosses take the materials
// half only because their Legendary signature tables already hand out the gear.
import {
  rollBossSpoils,
  isApexBoss,
  BOSS_RARE_MATERIALS,
  BOSS_LEGENDARY_MATERIALS,
  BOSS_RARE_GEAR,
} from '../app/engine/bossLoot';
import { CORE_GUARDIAN_TRAIT } from '../app/engine/coreGuardians';
import type { Enemy } from '../app/engine/types';

const mk = (o: Partial<Enemy>): Enemy =>
  ({ name: 'B', type: 'Beast', abilityPoint: 'Strength 8', attack: 'a', damage: '2d6', hp: 300, rarity: 'Legendary', loot: [], ...o } as unknown as Enemy);

// deterministic rand from a script of values
const seq = (...vals: number[]) => {
  let i = 0;
  return () => vals[Math.min(i++, vals.length - 1)]!;
};

describe('OTA-940 rollBossSpoils', () => {
  it('non-boss enemies roll nothing', () => {
    expect(rollBossSpoils(mk({ boss: false }), 50, seq(0))).toEqual([]);
  });

  it('pools are stocked and Rare-or-better by construction (floors are structural)', () => {
    expect(BOSS_RARE_MATERIALS.length).toBeGreaterThanOrEqual(20);
    expect(BOSS_LEGENDARY_MATERIALS.length).toBeGreaterThanOrEqual(20);
    expect(BOSS_RARE_GEAR.length).toBeGreaterThanOrEqual(50);
    expect(BOSS_LEGENDARY_MATERIALS).toContain('Dragon Scale'); // OTA-962 stock feeds in
  });

  it('a standard boss rolls 2 materials and can add ONE Rare gear piece', () => {
    // rand: mat1 tier (no leg), mat1 pick, mat2 tier, mat2 pick, gear gate (yes), gear pick
    const spoils = rollBossSpoils(mk({ boss: true }), 50, seq(0.9, 0.1, 0.9, 0.2, 0.1, 0.3));
    expect(spoils).toHaveLength(3);
    expect(BOSS_RARE_MATERIALS).toContain(spoils[0]!);
    expect(BOSS_RARE_MATERIALS).toContain(spoils[1]!);
    expect(BOSS_RARE_GEAR).toContain(spoils[2]!);
  });

  it('a heavy boss (power >= 80) rolls 3 materials', () => {
    // three (tier, pick) pairs, then the gear gate roll fails (0.9 >= 0.6)
    const spoils = rollBossSpoils(mk({ boss: true }), 90, seq(0.9, 0.1, 0.9, 0.2, 0.9, 0.3, 0.9));
    expect(spoils.length).toBe(3);
  });

  it('apex bosses (Guardian / summit) take materials ONLY — never gear from this table', () => {
    const guardian = mk({ boss: true, traits: [CORE_GUARDIAN_TRAIT, 'tier:3'] });
    const summit = mk({ boss: true, traits: ['summit_climb:spire_of_glass'] });
    expect(isApexBoss(guardian)).toBe(true);
    expect(isApexBoss(summit)).toBe(true);
    for (const apex of [guardian, summit]) {
      // rand forces the gear gate open — apex must still skip it
      const spoils = rollBossSpoils(apex, 90, seq(0.1, 0.1, 0.1, 0.2, 0.1, 0.3, 0.0, 0.0));
      expect(spoils).toHaveLength(3); // 3 materials at power 90, no 4th gear entry
      for (const n of spoils) {
        expect([...BOSS_RARE_MATERIALS, ...BOSS_LEGENDARY_MATERIALS]).toContain(n);
        expect(BOSS_RARE_GEAR).not.toContain(n);
      }
    }
  });

  it('every spoil is always a real catalog name from a Rare+ pool', () => {
    for (let trial = 0; trial < 50; trial++) {
      const spoils = rollBossSpoils(mk({ boss: true }), 40 + trial);
      for (const n of spoils) {
        const known = BOSS_RARE_MATERIALS.includes(n)
          || BOSS_LEGENDARY_MATERIALS.includes(n)
          || BOSS_RARE_GEAR.includes(n);
        expect(known).toBe(true);
      }
      expect(spoils.length).toBeGreaterThanOrEqual(2);
      expect(spoils.length).toBeLessThanOrEqual(4);
    }
  });
});
