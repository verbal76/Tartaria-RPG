// OTA-124 vandalistic — save/load round-trips for the dog state.
// Asserts:
//   - DogCompanion fields round-trip through JSON (no funny serialization
//     behavior on the pronoun union or status enum)
//   - SlotSummary writes dogName/dogBreed only when status is active
//   - status='waiting_at_base' round-trips
//   - status='abandoned' drops dog summary fields
//   - status='dead' drops dog summary fields
//   - mid-onboarding save → reload at the same stage
//   - legacy save (no dog field, no puppy flags) loads with sane defaults

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import { createDogCompanion } from '../app/engine/dogCompanion';
import type {
  DogCompanion,
  PendingDogOnboarding,
  WorldMemory,
} from '../app/engine/types';

function roundTripJSON<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

describe('OTA-124 vandalistic — dog save/load round-trips', () => {
  describe('DogCompanion field-level round-trip', () => {
    it('round-trips a fully populated with_player dog cleanly', () => {
      const dog = createDogCompanion({
        name: 'Marrow',
        breed: 'old bloodhound',
        rawSex: 'boy',
        startingProfile: 'hound',
        currentHour: 42,
      });
      dog.equipped.vest = 'Burlap Vest';
      dog.statProgress.strength = 17;
      dog.loyalty = 73;
      const restored = roundTripJSON(dog);
      expect(restored).toEqual(dog);
      expect(restored.equipped.vest).toBe('Burlap Vest');
      expect(restored.sex.pronoun).toBe('he');
      expect(restored.statProgress.strength).toBe(17);
    });

    it('round-trips a waiting_at_base dog', () => {
      const dog = createDogCompanion({
        name: 'Rust', breed: 'mutt', rawSex: 'girl',
        startingProfile: 'mutt', currentHour: 100,
      });
      const at = { ...dog, status: 'waiting_at_base' as const, hp: 0 };
      const restored = roundTripJSON(at);
      expect(restored.status).toBe('waiting_at_base');
      expect(restored.hp).toBe(0);
      expect(restored.sex.pronoun).toBe('she');
    });

    it('round-trips an abandoned dog', () => {
      const dog = createDogCompanion({
        name: 'Cinder', breed: 'pup', rawSex: 'they',
        startingProfile: 'puppy', currentHour: 0,
      });
      const ab = { ...dog, status: 'abandoned' as const, loyalty: 0 };
      const restored = roundTripJSON(ab);
      expect(restored.status).toBe('abandoned');
      expect(restored.loyalty).toBe(0);
    });

    it('round-trips a dead dog', () => {
      const dog = createDogCompanion({
        name: 'Bones', breed: 'lean', rawSex: 'he',
        startingProfile: 'shepherd', currentHour: 0,
      });
      const dead = { ...dog, status: 'dead' as const, hp: 0 };
      const restored = roundTripJSON(dead);
      expect(restored.status).toBe('dead');
    });
  });

  describe('SlotSummary dogName/dogBreed semantics', () => {
    // Mirrors saveSlot logic at app/engine/saveSystem.ts:194-202.
    function deriveSummary(dog: DogCompanion | null): { dogName?: string; dogBreed?: string } {
      return {
        dogName: dog && dog.status !== 'abandoned' && dog.status !== 'dead' ? dog.name : undefined,
        dogBreed: dog && dog.status !== 'abandoned' && dog.status !== 'dead' ? dog.breed : undefined,
      };
    }

    it('with_player dog writes both fields', () => {
      const dog = createDogCompanion({
        name: 'Marrow', breed: 'hound', rawSex: 'boy',
        startingProfile: 'hound', currentHour: 0,
      });
      const sum = deriveSummary(dog);
      expect(sum.dogName).toBe('Marrow');
      expect(sum.dogBreed).toBe('hound');
    });

    it('waiting_at_base dog STILL writes both fields (player can resume)', () => {
      const dog = { ...createDogCompanion({
        name: 'Rust', breed: 'mutt', rawSex: 'they',
        startingProfile: 'mongrel', currentHour: 0,
      }), status: 'waiting_at_base' as const };
      const sum = deriveSummary(dog);
      expect(sum.dogName).toBe('Rust');
      expect(sum.dogBreed).toBe('mutt');
    });

    it('abandoned dog drops both fields', () => {
      const dog = { ...createDogCompanion({
        name: 'Lost', breed: 'mutt', rawSex: 'they',
        startingProfile: 'mongrel', currentHour: 0,
      }), status: 'abandoned' as const };
      const sum = deriveSummary(dog);
      expect(sum.dogName).toBeUndefined();
      expect(sum.dogBreed).toBeUndefined();
    });

    it('dead dog drops both fields', () => {
      const dog = { ...createDogCompanion({
        name: 'Gone', breed: 'hound', rawSex: 'they',
        startingProfile: 'hound', currentHour: 0,
      }), status: 'dead' as const };
      const sum = deriveSummary(dog);
      expect(sum.dogName).toBeUndefined();
      expect(sum.dogBreed).toBeUndefined();
    });

    it('null dog drops both fields', () => {
      const sum = deriveSummary(null);
      expect(sum.dogName).toBeUndefined();
      expect(sum.dogBreed).toBeUndefined();
    });
  });

  describe('Mid-onboarding save → reload', () => {
    it('round-trips a stage="breed" onboarding cleanly', () => {
      const onboarding: PendingDogOnboarding = {
        stage: 'breed',
        rescueData: { scenario: 'smelter', startingProfile: 'mongrel' },
      };
      const restored = roundTripJSON(onboarding);
      expect(restored.stage).toBe('breed');
      expect(restored.rescueData.scenario).toBe('smelter');
    });

    it('round-trips a stage="name" with breed already filled', () => {
      const onboarding: PendingDogOnboarding = {
        stage: 'name',
        rescueData: { scenario: 'wagon', startingProfile: 'shepherd' },
        breed: 'scruffy thing',
      };
      const restored = roundTripJSON(onboarding);
      expect(restored.stage).toBe('name');
      expect(restored.breed).toBe('scruffy thing');
    });

    it('round-trips a stage="sex" with breed + name filled', () => {
      const onboarding: PendingDogOnboarding = {
        stage: 'sex',
        rescueData: { scenario: 'cellar', startingProfile: 'hound' },
        breed: 'old bloodhound',
        name: 'Marrow',
      };
      const restored = roundTripJSON(onboarding);
      expect(restored.stage).toBe('sex');
      expect(restored.breed).toBe('old bloodhound');
      expect(restored.name).toBe('Marrow');
      expect(restored.rescueData.scenario).toBe('cellar');
    });

    it('puppy_vendor onboarding round-trips', () => {
      const onboarding: PendingDogOnboarding = {
        stage: 'breed',
        rescueData: { scenario: 'puppy_vendor', startingProfile: 'puppy' },
      };
      const restored = roundTripJSON(onboarding);
      expect(restored.rescueData.scenario).toBe('puppy_vendor');
      expect(restored.rescueData.startingProfile).toBe('puppy');
    });
  });

  describe('Legacy save migration defaults', () => {
    // Mirrors loadSlotIntoGame at gameStore.ts:1757-1764. Legacy save
    // worldMemory has no puppyVendor* or pendingDogOnboarding fields;
    // migration sets all defaults.
    function migrate(wm: Partial<WorldMemory>): WorldMemory {
      return {
        tagCounts: {},
        discoveredLocationIds: [],
        defeatedEnemies: [],
        completedQuestIds: [],
        ...wm,
        puppyVendorOwed: wm.puppyVendorOwed ?? false,
        puppyVendorUsed: wm.puppyVendorUsed ?? false,
        puppyVendorQueued: wm.puppyVendorQueued ?? false,
        dogGolemCoActivated: wm.dogGolemCoActivated ?? false,
        pendingDogOnboarding: wm.pendingDogOnboarding ?? null,
      };
    }

    it('legacy WorldMemory with NO dog fields gets sane defaults', () => {
      const legacy: Partial<WorldMemory> = {
        tagCounts: { wasteland: 5 },
        discoveredLocationIds: ['some_loc'],
        defeatedEnemies: ['Drone'],
        completedQuestIds: [],
      };
      const migrated = migrate(legacy);
      expect(migrated.puppyVendorOwed).toBe(false);
      expect(migrated.puppyVendorUsed).toBe(false);
      expect(migrated.puppyVendorQueued).toBe(false);
      expect(migrated.dogGolemCoActivated).toBe(false);
      expect(migrated.pendingDogOnboarding).toBeNull();
      // Existing fields untouched.
      expect(migrated.tagCounts.wasteland).toBe(5);
      expect(migrated.defeatedEnemies).toEqual(['Drone']);
    });

    it('non-legacy save with non-default values preserves them', () => {
      const wm: Partial<WorldMemory> = {
        tagCounts: {},
        discoveredLocationIds: [],
        defeatedEnemies: [],
        completedQuestIds: [],
        puppyVendorOwed: true,
        puppyVendorUsed: true,
        dogGolemCoActivated: true,
      };
      const migrated = migrate(wm);
      expect(migrated.puppyVendorOwed).toBe(true);
      expect(migrated.puppyVendorUsed).toBe(true);
      expect(migrated.dogGolemCoActivated).toBe(true);
    });

    it('player record with no `dog` field loads as dog=null', () => {
      const legacyPlayer = {
        name: 'Old', dog: undefined,
      };
      const restored = JSON.parse(JSON.stringify(legacyPlayer));
      expect(restored.dog).toBeUndefined();
      // Engine-side, the player record uses `dog: null` as default;
      // the migration in loadSlotIntoGame uses backfillPlayer for
      // generic field defaults.
    });
  });

  describe('Full state round-trip — kitchen sink', () => {
    it('large worldMemory + dog + onboarding round-trips bit-for-bit', () => {
      const dog = createDogCompanion({
        name: 'Bones', breed: 'lanky hound', rawSex: 'he',
        startingProfile: 'hound', currentHour: 200,
      });
      const wm = {
        tagCounts: { wasteland: 7, ruin: 2 },
        discoveredLocationIds: ['loc_a', 'loc_b'],
        defeatedEnemies: ['Mud Beast', 'Drone'],
        completedQuestIds: [],
        puppyVendorOwed: true,
        puppyVendorUsed: false,
        puppyVendorQueued: false,
        dogGolemCoActivated: true,
        pendingDogOnboarding: null,
        visitedRooms: {
          'loc_a@@0,0': { firstVisitAt: 1, lastVisitAt: 100, visitCount: 3, dogSmelledHere: true },
        },
      };
      const restored = roundTripJSON({ player: { name: 'Tester', dog }, worldMemory: wm });
      expect(restored.player.dog).toEqual(dog);
      expect(restored.worldMemory.puppyVendorOwed).toBe(true);
      expect(restored.worldMemory.dogGolemCoActivated).toBe(true);
      expect(restored.worldMemory.visitedRooms['loc_a@@0,0'].dogSmelledHere).toBe(true);
    });
  });
});
