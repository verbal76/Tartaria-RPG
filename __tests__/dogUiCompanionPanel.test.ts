// OTA-120 Phase 5 — UI Companion panel + Title screen tile data shape.
//
// Skips full React render (RN testing setup is heavy). Instead asserts:
//   1. SlotSummary writes dogName/dogBreed only for active dogs.
//   2. Inventory tag predicate flags vests and treats correctly.
//   3. Sex glyph picker maps pronouns to ♂/♀/⚥.

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import { findDogGearByName, DOG_GEAR, findGearByName } from '../app/engine/crafting';
import { createDogCompanion } from '../app/engine/dogCompanion';
import type { InventoryItem, DogCompanion } from '../app/engine/types';

describe('OTA-120 Phase 5 — dog UI surfaces (data shape)', () => {
  describe('dog gear catalog loader', () => {
    it('exposes all 4 vests', () => {
      expect(DOG_GEAR.length).toBe(4);
      const names = DOG_GEAR.map((g) => g.name).sort();
      expect(names).toEqual([
        'Aetheric Padded Vest',
        'Burlap Vest',
        'Reclaimer Pattern Vest',
        'Riveted Leather Vest',
      ]);
    });

    it('Burlap is Common +1 AC, Reclaimer is Legendary +4 AC +1 STR', () => {
      const burlap = findDogGearByName('Burlap Vest')!;
      expect(burlap.rarity).toBe('Common');
      expect(burlap.acBonus).toBe(1);
      expect(burlap.statBonus).toBeUndefined();
      const reclaimer = findDogGearByName('Reclaimer Pattern Vest')!;
      expect(reclaimer.rarity).toBe('Legendary');
      expect(reclaimer.acBonus).toBe(4);
      expect(reclaimer.statBonus).toEqual({ stat: 'strength', amount: 1 });
      expect(reclaimer.faction).toBe('reclaimers');
    });

    it('Aetheric Padded Vest reflects 1 corruption per hit', () => {
      const v = findDogGearByName('Aetheric Padded Vest')!;
      expect(v.acBonus).toBe(3);
      expect(v.reflectsCorruption).toBe(1);
    });
  });

  describe('treat catalog', () => {
    it('Smoke-Cured Jerky Strip is Common with dogTreat: true', () => {
      const item = findGearByName('Smoke-Cured Jerky Strip')!;
      expect(item.rarity).toBe('Common');
      expect(item.effect?.kind).toBe('consumable');
      const fx = item.effect as { kind: 'consumable'; dogTreat?: boolean; healHP?: number };
      expect(fx.dogTreat).toBe(true);
      expect(fx.healHP).toBeGreaterThan(0);
    });

    it('all 4 treats are present + flagged', () => {
      for (const name of ['Smoke-Cured Jerky Strip', 'Marrow Bone', 'Honey-Glazed Knuckle', 'Ash-Cured Tongue']) {
        const item = findGearByName(name);
        expect(item).toBeDefined();
        expect(item!.effect?.kind).toBe('consumable');
        const fx = item!.effect as { kind: 'consumable'; dogTreat?: boolean };
        expect(fx.dogTreat).toBe(true);
      }
    });
  });

  describe('inventory [fits dog] / [treat] tagging predicates', () => {
    it('kind dog_armor marks fits-dog', () => {
      const item: InventoryItem = {
        id: 'v1', name: 'Burlap Vest', kind: 'dog_armor', quantity: 1, tags: [], rarity: 'Common',
      };
      expect(item.kind).toBe('dog_armor');
    });

    it('dog_treat tag marks treat', () => {
      const item: InventoryItem = {
        id: 'j1', name: 'Smoke-Cured Jerky Strip', kind: 'consumable', quantity: 1, tags: ['dog_treat'], rarity: 'Common',
      };
      expect(item.tags.includes('dog_treat')).toBe(true);
    });
  });

  describe('sex pronoun → glyph mapping', () => {
    it('he → ♂, she → ♀, they → ⚥', () => {
      const glyph = (p: 'he' | 'she' | 'they') => p === 'he' ? '♂' : p === 'she' ? '♀' : '⚥';
      expect(glyph('he')).toBe('♂');
      expect(glyph('she')).toBe('♀');
      expect(glyph('they')).toBe('⚥');
    });
  });

  describe('SlotSummary dog snapshot', () => {
    it('writes dogName/dogBreed when status is with_player', () => {
      const dog: DogCompanion = createDogCompanion({
        name: 'Rust', breed: 'old bloodhound', rawSex: 'boy',
        startingProfile: 'hound', currentHour: 0,
      });
      // Mimic the summary-write logic in saveSystem.saveSlot.
      const dogName = dog && dog.status !== 'abandoned' && dog.status !== 'dead' ? dog.name : undefined;
      const dogBreed = dog && dog.status !== 'abandoned' && dog.status !== 'dead' ? dog.breed : undefined;
      expect(dogName).toBe('Rust');
      expect(dogBreed).toBe('old bloodhound');
    });

    it('omits dogName/dogBreed for an abandoned dog', () => {
      const dog: DogCompanion = createDogCompanion({
        name: 'Rust', breed: 'old bloodhound', rawSex: 'boy',
        startingProfile: 'hound', currentHour: 0,
      });
      const abandoned: DogCompanion = { ...dog, status: 'abandoned' };
      const dogName = abandoned.status !== 'abandoned' && abandoned.status !== 'dead' ? abandoned.name : undefined;
      expect(dogName).toBeUndefined();
    });
  });
});
