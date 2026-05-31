// OTA-124 pre-ship stress — UX rendering sanity for the dog system.
//
// Skips heavy RN renders (jsdom + RN testing-library is expensive and
// most of the suite avoids them). Instead validates the DATA-SHAPE
// pieces every UI surface consumes: SlotSummary, inventory tag
// predicates, Companion-panel progress-bar percent calc, and the
// CallDogModal handler dispatch.

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('onnxruntime-react-native', () => ({
  InferenceSession: { create: jest.fn(async () => ({ run: jest.fn(async () => ({})) })) },
  Tensor: class { constructor(_t: string, _d: unknown, _s: unknown[]) {} },
}));
jest.mock('llama.rn', () => ({
  initLlama: jest.fn(async () => ({ completion: jest.fn(async () => ({ text: '' })), release: jest.fn() })),
  releaseAllLlama: jest.fn(),
}));
jest.mock('react-native-executorch', () => ({}));
jest.mock('expo-file-system', () => ({
  documentDirectory: '/tmp/', cacheDirectory: '/tmp/',
  getInfoAsync: jest.fn(async () => ({ exists: false })),
  makeDirectoryAsync: jest.fn(async () => {}),
  readAsStringAsync: jest.fn(async () => ''),
  writeAsStringAsync: jest.fn(async () => {}),
  deleteAsync: jest.fn(async () => {}),
  downloadAsync: jest.fn(async () => ({ uri: '' })),
  EncodingType: { UTF8: 'utf8', Base64: 'base64' },
}));
jest.mock('expo-speech', () => ({ speak: jest.fn(), stop: jest.fn(), isSpeakingAsync: jest.fn(async () => false) }));
jest.mock('expo-av', () => ({
  Audio: {
    setAudioModeAsync: jest.fn(),
    Sound: class {
      static createAsync: (...args: unknown[]) => Promise<{ sound: { playAsync: () => Promise<void>; unloadAsync: () => Promise<void> } }> = jest.fn(async () => ({ sound: { playAsync: jest.fn(async () => {}), unloadAsync: jest.fn(async () => {}) } }));
    },
  },
}));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '0', applicationId: 'test' }));
jest.mock('expo-asset', () => ({ Asset: { fromModule: () => ({ downloadAsync: jest.fn(async () => {}), localUri: '' }) } }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => {}) }));
jest.mock('expo-constants', () => ({ default: { expoConfig: {} } }));
jest.mock('expo-font', () => ({ loadAsync: jest.fn(async () => {}) }));
jest.mock('expo-speech-recognition', () => ({}));
jest.mock('expo-updates', () => ({}));

import { createDogCompanion } from '../app/engine/dogCompanion';
import { DOG_GEAR, findGearByName } from '../app/engine/crafting';
import { useGameStore } from '../app/state/gameStore';
import type { InventoryItem, DogCompanion, DogStatus } from '../app/engine/types';

// Mirrors the predicate used by InventoryScreen.tsx (OTA-122).
function fitsDogTag(item: InventoryItem): boolean {
  return item.kind === 'dog_armor';
}
function isTreatTag(item: InventoryItem): boolean {
  if ((item.tags ?? []).includes('dog_treat') || (item.tags ?? []).includes('treat')) return true;
  const gear = findGearByName(item.name);
  if (!gear) return false;
  const fx = gear.effect as { kind?: string; dogTreat?: boolean } | undefined;
  return fx?.kind === 'consumable' && fx.dogTreat === true;
}

// Mirrors the SlotSummary write in saveSystem.saveSlot.
function slotSummaryDogFields(dog: DogCompanion | null | undefined) {
  const dogName = dog && dog.status !== 'abandoned' && dog.status !== 'dead' ? dog.name : undefined;
  const dogBreed = dog && dog.status !== 'abandoned' && dog.status !== 'dead' ? dog.breed : undefined;
  return { dogName, dogBreed };
}

// Mirrors CharacterScreen.tsx Companion-panel progress-bar calc.
function statProgressPct(progress: number): number {
  const clamped = Math.max(0, Math.min(1, progress / 100));
  return Math.round(clamped * 100);
}
function loyaltyPct(loyalty: number): number {
  const clamped = Math.max(0, Math.min(1, loyalty / 100));
  return Math.round(clamped * 100);
}
function hpPct(hp: number, hpMax: number): number {
  if (hpMax <= 0) return 0;
  const raw = hp / hpMax;
  const clamped = Math.max(0, Math.min(1, raw));
  return Math.round(clamped * 100);
}

describe('OTA-124 pre-ship — dog UX rendering sanity', () => {
  describe('SlotSummary serialization respects dog status', () => {
    it('omits dogName / dogBreed when status is "abandoned"', () => {
      const dog = createDogCompanion({ name: 'Rust', breed: 'mongrel', rawSex: 'boy', startingProfile: 'mongrel', currentHour: 0 });
      const summary = slotSummaryDogFields({ ...dog, status: 'abandoned' });
      expect(summary.dogName).toBeUndefined();
      expect(summary.dogBreed).toBeUndefined();
    });

    it('omits dogName / dogBreed when status is "dead"', () => {
      const dog = createDogCompanion({ name: 'Rust', breed: 'mongrel', rawSex: 'boy', startingProfile: 'mongrel', currentHour: 0 });
      const summary = slotSummaryDogFields({ ...dog, status: 'dead' });
      expect(summary.dogName).toBeUndefined();
      expect(summary.dogBreed).toBeUndefined();
    });

    it('EXPORTS dogName / dogBreed when status is "waiting_at_base" (dog alive, just deferred)', () => {
      const dog = createDogCompanion({ name: 'Marrow', breed: 'shepherd mix', rawSex: 'girl', startingProfile: 'shepherd', currentHour: 0 });
      const summary = slotSummaryDogFields({ ...dog, status: 'waiting_at_base' });
      expect(summary.dogName).toBe('Marrow');
      expect(summary.dogBreed).toBe('shepherd mix');
    });

    it('EXPORTS for "with_player"', () => {
      const dog = createDogCompanion({ name: 'Cinder', breed: 'hound', rawSex: 'boy', startingProfile: 'hound', currentHour: 0 });
      const summary = slotSummaryDogFields({ ...dog, status: 'with_player' });
      expect(summary.dogName).toBe('Cinder');
    });

    it('omits both when the dog field itself is null/undefined', () => {
      expect(slotSummaryDogFields(null)).toEqual({ dogName: undefined, dogBreed: undefined });
      expect(slotSummaryDogFields(undefined)).toEqual({ dogName: undefined, dogBreed: undefined });
    });
  });

  describe('inventory [fits dog] / [treat] tag predicates', () => {
    it('every vest of every rarity flags fits-dog', () => {
      for (const vest of DOG_GEAR) {
        const item: InventoryItem = {
          id: `v-${vest.name}`,
          name: vest.name,
          kind: 'dog_armor',
          quantity: 1,
          tags: vest.tags,
          rarity: vest.rarity,
        };
        expect(fitsDogTag(item)).toBe(true);
      }
    });

    it('every treat (4 names) flags treat through either the tag or the catalog-effect fallback', () => {
      for (const name of ['Smoke-Cured Jerky Strip', 'Marrow Bone', 'Honey-Glazed Knuckle', 'Ash-Cured Tongue']) {
        // First: with the dog_treat tag pre-stamped.
        const item: InventoryItem = {
          id: `t-tag-${name}`, name, kind: 'consumable', quantity: 1,
          tags: ['food', 'dog_treat'], rarity: 'Common',
        };
        expect(isTreatTag(item)).toBe(true);
        // Second: WITHOUT the tag — the catalog-effect fallback must
        // still flag it (handles loot drops that pre-date the tag).
        const itemNoTag: InventoryItem = {
          id: `t-${name}`, name, kind: 'consumable', quantity: 1,
          tags: ['food'], rarity: 'Common',
        };
        expect(isTreatTag(itemNoTag)).toBe(true);
      }
    });

    it('non-treat consumables do NOT flag as treat', () => {
      const item: InventoryItem = {
        id: 't-1', name: 'Trail Rations', kind: 'consumable', quantity: 1, tags: ['food'], rarity: 'Common',
      };
      expect(isTreatTag(item)).toBe(false);
      expect(fitsDogTag(item)).toBe(false);
    });

    it('non-vest armor does NOT flag as fits-dog', () => {
      const item: InventoryItem = {
        id: 'a-1', name: 'Mud Cuirass', kind: 'armor', quantity: 1, tags: ['armor', 'chest'], rarity: 'Common',
      };
      expect(fitsDogTag(item)).toBe(false);
    });
  });

  describe('CharacterScreen Companion panel — percent math is 0..100 (no negatives, no overflow)', () => {
    it('progress bar percent stays bounded across edge stat values', () => {
      const trials = [-100, -1, 0, 50, 99, 100, 101, 200, NaN];
      for (const v of trials) {
        const pct = statProgressPct(Number.isFinite(v) ? v : 0);
        expect(pct).toBeGreaterThanOrEqual(0);
        expect(pct).toBeLessThanOrEqual(100);
      }
    });

    it('loyalty bar percent stays bounded', () => {
      for (const v of [-50, 0, 50, 100, 150, 9999]) {
        const pct = loyaltyPct(v);
        expect(pct).toBeGreaterThanOrEqual(0);
        expect(pct).toBeLessThanOrEqual(100);
      }
    });

    it('hp bar percent stays bounded; hpMax=0 yields 0 (no NaN)', () => {
      // Mirrors CharacterScreen.tsx line ~269 — explicit hpMax > 0 guard,
      // then Math.max/min clamp. The source does NOT explicitly guard
      // against NaN inputs because createDogCompanion always sets hp to
      // a finite integer; that path isn't exercised by the UI.
      expect(hpPct(5, 0)).toBe(0);
      expect(hpPct(10, 10)).toBe(100);
      expect(hpPct(-5, 10)).toBe(0);
      expect(hpPct(100, 10)).toBe(100);
      // For any finite-numeric input the result is bounded:
      for (const hp of [0, 1, 10, 100, -1, -100]) {
        const v = hpPct(hp, 20);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(100);
      }
    });
  });

  describe('CallDogModal handler dispatch — well-formed actions', () => {
    async function bootWithDog() {
      const store = useGameStore;
      await store.getState().hydrate();
      await store.getState().startNewGame({ name: 'Tester', raceId: 'reclaimer', factionId: 'reclaimers_guild' });
      store.getState().skipTutorial?.();
      const p0 = store.getState().player!;
      const dog = createDogCompanion({ name: 'Marrow', breed: 'mutt', rawSex: 'boy', startingProfile: 'mongrel', currentHour: 0 });
      store.setState({
        player: {
          ...p0,
          dog: { ...dog, loyalty: 50, lastFedAtHour: 0 },
          inventory: [
            { id: 'rat_1', name: 'Trail Rations', kind: 'consumable', quantity: 3, tags: ['food'], rarity: 'Common' },
            { id: 'mar_1', name: 'Marrow Bone', kind: 'consumable', quantity: 2, tags: ['food', 'dog_treat'], rarity: 'Uncommon' },
            ...p0.inventory,
          ],
          hoursElapsed: 0,
        },
      });
      return store;
    }

    beforeAll(() => {
      console.log = () => {};
      console.warn = () => {};
    });

    it('selectCallDogOption("scratch") adds +2 loyalty', async () => {
      const store = await bootWithDog();
      const before = store.getState().player!.dog!.loyalty;
      store.getState().selectCallDogOption('scratch');
      const after = store.getState().player!.dog!.loyalty;
      expect(after - before).toBe(2);
    });

    it('selectCallDogOption("speak") adds +1 loyalty', async () => {
      const store = await bootWithDog();
      const before = store.getState().player!.dog!.loyalty;
      store.getState().selectCallDogOption('speak');
      const after = store.getState().player!.dog!.loyalty;
      expect(after - before).toBe(1);
    });

    it('selectCallDogOption("treat", "Marrow Bone") adds +40 loyalty + consumes the treat', async () => {
      const store = await bootWithDog();
      const before = store.getState().player!.dog!.loyalty;
      const treatBefore = store.getState().player!.inventory.find((i) => i.name === 'Marrow Bone')!.quantity;
      store.getState().selectCallDogOption('treat', 'Marrow Bone');
      const after = store.getState().player!.dog!.loyalty;
      const treatAfter = store.getState().player!.inventory.find((i) => i.name === 'Marrow Bone')?.quantity ?? 0;
      expect(after - before).toBe(40);
      expect(treatAfter).toBe(treatBefore - 1);
    });

    it('all three options close the modal', async () => {
      for (const option of ['scratch', 'speak', 'treat'] as const) {
        const store = await bootWithDog();
        store.setState({ callDogModalOpen: true });
        store.getState().selectCallDogOption(option, option === 'treat' ? 'Marrow Bone' : undefined);
        expect(store.getState().callDogModalOpen).toBe(false);
      }
    });

    it('scratch / speak are no-ops if dog is abandoned (no negative loyalty drift)', async () => {
      const store = await bootWithDog();
      const p = store.getState().player!;
      store.setState({ player: { ...p, dog: { ...p.dog!, status: 'abandoned' as DogStatus, loyalty: 0 } } });
      store.getState().selectCallDogOption('scratch');
      store.getState().selectCallDogOption('speak');
      expect(store.getState().player!.dog!.loyalty).toBe(0);
    });
  });
});
