import { effectiveStatsBreakdown } from '../app/engine/equipment';
import { tierDescription } from '../app/engine/corruption';
import type { PlayerCharacter, Stats, StatusEffect } from '../app/engine/types';

const BASE_STATS: Stats = { strength: 10, dexterity: 10, intelligence: 10, wisdom: 10, charisma: 10 };

function makePlayer(overrides: Partial<PlayerCharacter> = {}): PlayerCharacter {
  return {
    name: 'Test',
    raceId: 'tartarian_giant',
    factionId: 'reclaimers_guild',
    stats: { ...BASE_STATS },
    hp: 30,
    hpMax: 30,
    stamina: 10,
    staminaMax: 10,
    milestones: { enemiesDefeated: 0, travelsCompleted: 0, checksSucceeded: 0 },
    equipped: {},
    ac: 12,
    tc: 100,
    corruption: 0,
    inventory: [],
    factionStanding: [],
    currentLocationId: 'tartarian_outskirts',
    activeQuests: [],
    mapSeed: 'test|test|test|0',
    mapX: 4,
    mapY: 4,
    ...overrides,
  } as PlayerCharacter;
}

describe('OTA 040 — Player Sheet helpers', () => {
  describe('effectiveStatsBreakdown', () => {
    it('Tartarian Giant: STR breakdown shows +2 race source', () => {
      const player = makePlayer({ raceId: 'tartarian_giant' });
      const b = effectiveStatsBreakdown(player);
      expect(b.strength.base).toBe(10);
      expect(b.strength.total).toBe(12);
      const raceSource = b.strength.sources.find((s) => s.label === 'race');
      expect(raceSource).toEqual({ label: 'race', delta: 2 });
    });

    it('Tainted corruption: CHA gets -1 corruption source', () => {
      const player = makePlayer({ raceId: 'unknowing_mass', corruption: 20 });
      const b = effectiveStatsBreakdown(player);
      expect(b.charisma.total).toBe(9); // base 10 - 1 corruption
      const corrSource = b.charisma.sources.find((s) => s.label.includes('corruption'));
      expect(corrSource?.delta).toBe(-1);
    });

    it('Food buff appears as its own source with the food label', () => {
      const carrotBuff: StatusEffect = {
        kind: 'food_buff',
        remainingRounds: 4,
        buffStat: 'wisdom',
        buffBonus: 1,
        label: 'Wild Carrot (+1 WIS)',
      };
      const player = makePlayer({ raceId: 'unknowing_mass', statusEffects: [carrotBuff] });
      const b = effectiveStatsBreakdown(player);
      expect(b.wisdom.total).toBe(11);
      const foodSource = b.wisdom.sources.find((s) => s.label.includes('Wild Carrot'));
      expect(foodSource?.delta).toBe(1);
    });

    it('No sources when nothing modifies the stat (clean Unknowing Mass)', () => {
      const player = makePlayer({ raceId: 'unknowing_mass', corruption: 0 });
      const b = effectiveStatsBreakdown(player);
      expect(b.strength.sources).toHaveLength(0);
      expect(b.strength.total).toBe(b.strength.base);
    });

    it('Hollowed corruption stacks -2 onto every stat', () => {
      const player = makePlayer({ raceId: 'unknowing_mass', corruption: 100 });
      const b = effectiveStatsBreakdown(player);
      for (const k of ['strength', 'dexterity', 'intelligence', 'wisdom', 'charisma'] as const) {
        expect(b[k].total).toBe(8); // 10 base - 2 hollowed
        const corrSource = b[k].sources.find((s) => s.label.includes('corruption'));
        expect(corrSource?.delta).toBe(-2);
      }
    });
  });

  describe('tierDescription', () => {
    it('returns a non-empty string per tier', () => {
      expect(tierDescription('clean').length).toBeGreaterThan(0);
      expect(tierDescription('tainted').length).toBeGreaterThan(0);
      expect(tierDescription('corrupted').length).toBeGreaterThan(0);
      expect(tierDescription('hollowed').length).toBeGreaterThan(0);
    });
    it('Hollowed description mentions Purifiers', () => {
      expect(tierDescription('hollowed')).toMatch(/Purifier/i);
    });
  });
});
