// Core Guardians — Aether-Born Order tests.
//
// Covers:
// - Tier resolution from kill count (1..9)
// - Spawn returns null for non-Capitals
// - Spawn produces a boss enemy with the core_guardian trait
// - Tier-driven AC scaling pipes through abilityPoint
// - HP scales with player HP pool
// - Each Capital has both a Guardian and a gear pair
// - Detection helpers (isCoreGuardian, capitalIdFromGuardian)
// - dropsForCapital returns a fresh weapon + armor each call

import type { PlayerCharacter } from '../app/engine/types';
import {
  CORE_GUARDIAN_TRAIT,
  GUARDIAN_GEAR_BY_CAPITAL,
  GUARDIANS_BY_CAPITAL,
  capitalIdFromGuardian,
  dropsForCapital,
  fleeAftermathLine,
  hasUndefeatedGuardian,
  isCoreGuardian,
  isFinalGuardian,
  spawnGuardianForCapital,
  tierForKills,
  totalGuardiansCount,
} from '../app/engine/coreGuardians';
import { LOST_CAPITAL_LOCATIONS } from '../app/engine/mainQuest';

function makePlayer(overrides: Partial<PlayerCharacter> = {}): PlayerCharacter {
  return {
    name: 'Test',
    raceId: 'human',
    factionId: 'reclaimers_guild',
    stats: {
      strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10,
    } as PlayerCharacter['stats'],
    hp: 30,
    hpMax: 30,
    stamina: 10,
    staminaMax: 10,
    ac: 12,
    tc: 0,
    corruption: 0,
    inventory: [],
    factionStanding: [],
    currentLocationId: 'asgardar',
    activeQuests: [],
    mainQuest: { phase: 'revelation', coresRecovered: [] },
    ...overrides,
  } as PlayerCharacter;
}

describe('Core Guardians', () => {
  describe('tierForKills', () => {
    it('returns 1 for zero kills', () => {
      expect(tierForKills(0)).toBe(1);
    });
    it('progresses 1→9 with each Core taken', () => {
      for (let k = 0; k < 9; k++) expect(tierForKills(k)).toBe(k + 1);
    });
    it('caps at 9 even with excess kills', () => {
      expect(tierForKills(20)).toBe(9);
    });
  });

  describe('catalog completeness', () => {
    it('has 9 Guardians', () => {
      expect(totalGuardiansCount()).toBe(9);
      expect(Object.keys(GUARDIANS_BY_CAPITAL)).toHaveLength(9);
    });
    it('every Lost Capital has a Guardian', () => {
      for (const cap of LOST_CAPITAL_LOCATIONS) {
        expect(GUARDIANS_BY_CAPITAL[cap]).toBeDefined();
        expect(GUARDIANS_BY_CAPITAL[cap]!.base.boss).toBe(true);
      }
    });
    it('every Lost Capital has a gear pair', () => {
      for (const cap of LOST_CAPITAL_LOCATIONS) {
        const set = GUARDIAN_GEAR_BY_CAPITAL[cap];
        expect(set).toBeDefined();
        expect(set!.weapon.kind).toBe('weapon');
        expect(set!.armor.kind).toBe('armor');
        expect(set!.weapon.tags).toContain('core_guardian_set');
        expect(set!.armor.tags).toContain('core_guardian_set');
      }
    });
  });

  describe('spawnGuardianForCapital', () => {
    it('returns null for non-Capital locations', () => {
      const p = makePlayer({ currentLocationId: 'tartarian_outskirts' });
      expect(spawnGuardianForCapital(p, 'tartarian_outskirts')).toBeNull();
    });
    it('returns a boss-tagged enemy with the core_guardian trait', () => {
      const p = makePlayer();
      const g = spawnGuardianForCapital(p, 'asgardar');
      expect(g).not.toBeNull();
      expect(g!.boss).toBe(true);
      expect(g!.traits).toContain(CORE_GUARDIAN_TRAIT);
    });
    // OTA-798 — every Guardian must carry an authored weakness + resistance so
    // the "Weakness exposed" combat lines and the EnemyPanel actually engage
    // (players asked why Guardians showed no weakness/strength). Guardian types
    // (aether_construct / mud_revenant) aren't in the type-resistance map, so the
    // trait is the ONLY thing that makes the damage system read non-'normal'.
    it('every Guardian carries a vulnerable: and resist: trait the damage system reads', () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { traitDamageMultiplier, traitDefenses } = require('../app/engine/enemyTraits');
      for (const capitalId of Object.keys(GUARDIANS_BY_CAPITAL)) {
        const g = spawnGuardianForCapital(makePlayer(), capitalId)!;
        const def = traitDefenses(g.traits);
        expect(def.weaknesses.length).toBeGreaterThan(0);
        expect(def.resists.length).toBeGreaterThan(0);
        // The authored weakness actually multiplies damage (×1.5, 'vulnerable').
        const weakType = def.weaknesses[0];
        expect(traitDamageMultiplier(g.traits, weakType).match).toBe('vulnerable');
        // The authored resistance actually halves it (×0.5, 'resist').
        const resistType = def.resists[0];
        expect(traitDamageMultiplier(g.traits, resistType).match).toBe('resist');
      }
    });
    it('tier 1 spawn matches kill count of 0', () => {
      const p = makePlayer({ mainQuest: { phase: 'revelation', coresRecovered: [] } });
      const g = spawnGuardianForCapital(p, 'asgardar');
      expect(g!.traits).toContain('tier:1');
    });
    it('tier 9 spawn at 8 prior cores', () => {
      const p = makePlayer({
        mainQuest: {
          phase: 'cores',
          coresRecovered: [
            'asgardar', 'samarran', 'nimari', 'drakova', 'voronov',
            'karok_sa', 'yuldra_tul', 'ostragar',
          ],
        },
      });
      const g = spawnGuardianForCapital(p, 'iskan_veil');
      expect(g!.traits).toContain('tier:9');
    });

    // OTA-925 — the final Guardian (last Core in the run) is the game's last boss.
    it('isFinalGuardian fires only on the last Core, order-independently', () => {
      const last = LOST_CAPITAL_LOCATIONS.length; // 9
      expect(isFinalGuardian(0)).toBe(false);
      expect(isFinalGuardian(last - 2)).toBe(false); // 7 cores → 8th fight, not final
      expect(isFinalGuardian(last - 1)).toBe(true);  // 8 cores → 9th (final) fight
      expect(isFinalGuardian(last)).toBe(true);       // defensive: never under-fires
    });

    it('the final Guardian is a fixed ~20-round wall, Capital-independent', () => {
      // 8 Cores held → the 9th and final Guardian, whichever seat is left.
      const eightCores = (leftOut: string) =>
        makePlayer({
          hpMax: 30,
          mainQuest: {
            phase: 'cores',
            coresRecovered: LOST_CAPITAL_LOCATIONS.filter((id) => id !== leftOut),
          },
        });
      // Two different "saved for last" Capitals: authored base.hp differs (Vaelka 30 vs
      // Cantor 50) but the final override ignores base.hp, so the fight HP is identical.
      const lastIsVaelka = spawnGuardianForCapital(eightCores('asgardar'), 'asgardar')!;
      const lastIsCantor = spawnGuardianForCapital(eightCores('voronov'), 'voronov')!;
      expect(lastIsVaelka.hp).toBe(lastIsCantor.hp);
      // Sized for a long final-boss fight — far above the ~12-round apex band, and well
      // past the 8th Guardian (tier 8) at the same player power.
      expect(lastIsVaelka.hp).toBeGreaterThanOrEqual(600);
      const tier8 = makePlayer({
        hpMax: 30,
        mainQuest: {
          phase: 'cores',
          coresRecovered: LOST_CAPITAL_LOCATIONS.slice(0, 7), // 7 cores → 8th fight
        },
      });
      const eighth = spawnGuardianForCapital(tier8, LOST_CAPITAL_LOCATIONS[7]!)!;
      expect(lastIsVaelka.hp).toBeGreaterThan(eighth.hp);
    });

    // OTA-926 — the Guardians are the game's main antagonists and must ramp
    // monotonically: each fight tougher than the last, regardless of which Capital the
    // player fights in which ORDER. HP is now Capital-independent, so spawning a
    // different Capital at each tier still yields a strictly increasing HP curve.
    it('HP ramps strictly upward tier 1→9, independent of Capital/order', () => {
      const caps = LOST_CAPITAL_LOCATIONS;
      const hps: number[] = [];
      for (let tier = 1; tier <= 9; tier++) {
        // Fixed, at-curve player power (over-level = 1.0 at every tier) so the ramp
        // reflects the authored tier curve, not player scaling. Spawn a DIFFERENT
        // Capital each tier — the seat must not change the HP.
        const p = makePlayer({ mainQuest: { phase: 'cores', coresRecovered: caps.slice(0, tier - 1) } });
        hps.push(spawnGuardianForCapital(p, caps[tier - 1]!)!.hp);
      }
      for (let i = 1; i < hps.length; i++) {
        expect(hps[i]).toBeGreaterThan(hps[i - 1]!);
      }
      // The final Guardian is the biggest wall in the run.
      expect(hps[8]).toBe(Math.max(...hps));
    });

    it('HP scales up with player hpMax', () => {
      const lowHp = makePlayer({ hpMax: 30 });
      const highHp = makePlayer({ hpMax: 80 });
      const a = spawnGuardianForCapital(lowHp, 'asgardar');
      const b = spawnGuardianForCapital(highHp, 'asgardar');
      expect(b!.hp).toBeGreaterThan(a!.hp);
    });
    it('AC scales via abilityPoint bump from tier acBonus', () => {
      const t1 = makePlayer({ mainQuest: { phase: 'revelation', coresRecovered: [] } });
      const t5 = makePlayer({
        mainQuest: {
          phase: 'cores',
          coresRecovered: ['asgardar', 'samarran', 'nimari', 'drakova'],
        },
      });
      const g1 = spawnGuardianForCapital(t1, 'voronov');
      const g5 = spawnGuardianForCapital(t5, 'voronov');
      const ap1 = parseInt(String(g1!.abilityPoint).match(/\d+/)?.[0] ?? '0', 10);
      const ap5 = parseInt(String(g5!.abilityPoint).match(/\d+/)?.[0] ?? '0', 10);
      expect(ap5).toBeGreaterThan(ap1);
    });

    // OTA-448 — the first Guardian should be a straightforward (not easy) win
    // for a kitted player; later Guardians ramp monotonically harder.
    it('eases the first Guardian and ramps AC monotonically through tier 9', () => {
      const acWithBoss = (g: { abilityPoint?: unknown }) => {
        const ap = parseInt(String(g.abilityPoint).match(/\d+/)?.[0] ?? '0', 10);
        return Math.max(5, Math.min(18, 5 + ap)) + 6; // mirror enemyAC + boss +6
      };
      const caps = LOST_CAPITAL_LOCATIONS;
      const acs: number[] = [];
      for (let tier = 1; tier <= 9; tier++) {
        const p = makePlayer({
          hpMax: 32,
          mainQuest: { phase: 'cores', coresRecovered: caps.slice(0, tier - 1) },
        });
        acs.push(acWithBoss(spawnGuardianForCapital(p, 'asgardar')!));
      }
      // First Guardian is hittable: AC 14 (was 17).
      expect(acs[0]).toBe(14);
      // Monotonic non-decreasing ramp.
      for (let i = 1; i < acs.length; i++) {
        expect(acs[i]).toBeGreaterThanOrEqual(acs[i - 1]!);
      }
      // Late game keeps its hardness.
      expect(acs[8]).toBe(22);
    });
  });

  describe('detection helpers', () => {
    it('isCoreGuardian true for spawned Guardian', () => {
      const p = makePlayer();
      const g = spawnGuardianForCapital(p, 'asgardar')!;
      expect(isCoreGuardian(g)).toBe(true);
    });
    it('isCoreGuardian false for vanilla enemy', () => {
      expect(isCoreGuardian({
        name: 'Mud Wolf',
        type: 'mud',
        abilityPoint: 'Strength 3',
        attack: 'Bite',
        damage: '1d6',
        hp: 10,
        rarity: 'Common',
        loot: [],
      })).toBe(false);
    });
    it('capitalIdFromGuardian resolves the live Guardian back to its Capital', () => {
      const p = makePlayer();
      const g = spawnGuardianForCapital(p, 'drakova')!;
      expect(capitalIdFromGuardian(g)).toBe('drakova');
    });
  });

  describe('dropsForCapital', () => {
    it('returns a fresh inventory item pair', () => {
      const a = dropsForCapital('asgardar')!;
      const b = dropsForCapital('asgardar')!;
      // Different unique ids per call (so two kills don't collide).
      expect(a.weapon.id).not.toBe(b.weapon.id);
      expect(a.armor.id).not.toBe(b.armor.id);
      // Both quest-tagged as core_guardian_set (but NOT quest-bound;
      // gear can be dropped/sold/scrapped — only the Core itself is
      // protected by the 'quest' tag).
      expect(a.weapon.tags).toContain('core_guardian_set');
      expect(a.weapon.tags).not.toContain('quest');
    });
    it('returns null for non-Capital', () => {
      expect(dropsForCapital('tartarian_outskirts')).toBeNull();
    });
  });

  describe('flee aftermath', () => {
    it('returns a faction-flavored line for every playable faction', () => {
      const factions = [
        'reclaimers_guild', 'forgotten_order', 'mud_monarchs', 'true_tartarians',
        'eternal_dynasty', 'conspiracy_architects', 'servants_of_giants',
        'stone_builders', 'tartarian_revivalists',
      ];
      for (const f of factions) {
        const line = fleeAftermathLine(f);
        expect(line).not.toBeNull();
        expect(line!.length).toBeGreaterThan(30);
      }
    });
  });

  describe('hasUndefeatedGuardian', () => {
    it('true at an unrecovered Capital', () => {
      const p = makePlayer({ mainQuest: { phase: 'revelation', coresRecovered: [] } });
      expect(hasUndefeatedGuardian(p, 'asgardar')).toBe(true);
    });
    it('false at a recovered Capital', () => {
      const p = makePlayer({ mainQuest: { phase: 'cores', coresRecovered: ['asgardar'] } });
      expect(hasUndefeatedGuardian(p, 'asgardar')).toBe(false);
    });
    it('false at a non-Capital location', () => {
      const p = makePlayer();
      expect(hasUndefeatedGuardian(p, 'tartarian_outskirts')).toBe(false);
    });
  });
});
