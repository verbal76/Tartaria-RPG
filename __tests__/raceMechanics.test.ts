import {
  barehandDamageFor,
  effectiveAC,
  racialStatBonusesFor,
  detectACContexts,
} from '../app/engine/raceMechanics';
import type { PlayerCharacter, Stats } from '../app/engine/types';

const ZERO_STATS: Stats = { strength: 0, dexterity: 0, intelligence: 0, wisdom: 0, charisma: 0 };

function makePlayer(overrides: Partial<PlayerCharacter> = {}): PlayerCharacter {
  return {
    name: 'Test',
    raceId: 'tartarian_giant',
    factionId: 'reclaimers_guild',
    stats: { ...ZERO_STATS },
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

describe('OTA 038 — race mechanics', () => {
  describe('barehandDamageFor', () => {
    it('parses Tartarian Giant 1d6 +2', () => {
      expect(barehandDamageFor('tartarian_giant')).toEqual({ count: 1, sides: 6, bonus: 2 });
    });
    it('parses Mud Dweller 1d6 -3 (negative bonus)', () => {
      expect(barehandDamageFor('mud_dweller')).toEqual({ count: 1, sides: 6, bonus: -3 });
    });
    it('parses Aetherborn 1d6 -2', () => {
      expect(barehandDamageFor('aetherborn')).toEqual({ count: 1, sides: 6, bonus: -2 });
    });
    it('parses Architectural Sentinel 1d10 with hitGate=even', () => {
      expect(barehandDamageFor('architectural_sentinel')).toEqual({ count: 1, sides: 10, bonus: 0, hitGate: 'even' });
    });
    it('parses plain 1d6 for Reclaimer / Mud Golem / Unknowing Mass', () => {
      expect(barehandDamageFor('reclaimer')).toEqual({ count: 1, sides: 6, bonus: 0 });
      expect(barehandDamageFor('mud_golem')).toEqual({ count: 1, sides: 6, bonus: 0 });
      expect(barehandDamageFor('unknowing_mass')).toEqual({ count: 1, sides: 6, bonus: 0 });
    });
    it('falls back to 1d6 for unknown raceId', () => {
      expect(barehandDamageFor('does_not_exist')).toEqual({ count: 1, sides: 6, bonus: 0 });
      expect(barehandDamageFor(undefined)).toEqual({ count: 1, sides: 6, bonus: 0 });
    });
  });

  describe('racialStatBonusesFor', () => {
    it('Tartarian Giant gets +2 STR', () => {
      expect(racialStatBonusesFor('tartarian_giant')).toEqual({ strength: 2 });
    });
    it('Architectural Sentinel gets +2 STR +1 INT', () => {
      expect(racialStatBonusesFor('architectural_sentinel')).toEqual({ strength: 2, intelligence: 1 });
    });
    it('Aetherborn gets +1 CHA', () => {
      expect(racialStatBonusesFor('aetherborn')).toEqual({ charisma: 1 });
    });
    it('Unknowing Mass has no always-on bonuses', () => {
      expect(racialStatBonusesFor('unknowing_mass')).toEqual({});
    });
  });

  describe('detectACContexts + effectiveAC', () => {
    it('underground tag → underground + dark contexts detected', () => {
      const player = makePlayer({ raceId: 'mud_dweller', ac: 10 });
      const scene = {
        location: { tags: ['underground'], type: 'buried_city' as const },
        microMicroId: 'sealed_vault_floor_1',
      };
      const contexts = detectACContexts(player, scene);
      expect(contexts.has('underground')).toBe(true);
      expect(contexts.has('constructed_environment')).toBe(true);
    });
    it('Mud Dweller in underground scene → +1 AC', () => {
      const player = makePlayer({ raceId: 'mud_dweller', ac: 10 });
      const scene = {
        location: { tags: ['underground'], type: 'buried_city' as const },
        microMicroId: 'sealed_vault',
      };
      expect(effectiveAC(player, scene)).toBe(11);
    });
    it('Tartarian Giant in confined scene → -4 AC', () => {
      const player = makePlayer({ raceId: 'tartarian_giant', ac: 12 });
      const scene = {
        location: { tags: ['underground'], type: 'ruin' as const },
        microMicroId: 'confined_crawl_tunnel',
      };
      expect(effectiveAC(player, scene)).toBe(8);
    });
    it('Reclaimer in constructed environment → +1 AC', () => {
      const player = makePlayer({ raceId: 'reclaimer', ac: 10 });
      const scene = {
        location: { tags: [], type: 'ruin' as const },
        microMicroId: 'aboveground_courtyard',
      };
      expect(effectiveAC(player, scene)).toBe(11);
    });
    it('Mud Dweller on the surface (no tags) → no bonus, AC stays 10', () => {
      const player = makePlayer({ raceId: 'mud_dweller', ac: 10 });
      const scene = {
        location: { tags: [], type: 'region' as const },
        microMicroId: 'open_silt_flats',
      };
      expect(effectiveAC(player, scene)).toBe(10);
    });
    it('null scene → base AC unchanged', () => {
      const player = makePlayer({ raceId: 'tartarian_giant', ac: 12 });
      expect(effectiveAC(player, null)).toBe(12);
    });
  });
});
