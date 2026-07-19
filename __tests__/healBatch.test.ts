// OTA-693 — batch-heal ("Use Max"). The no-waste count = the most of a fixed-heal
// item that fit under the target's missing HP; the store action applies them in one
// shot, clamping to the gap (no overheal) and spending exactly that many.

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('onnxruntime-react-native', () => ({
  InferenceSession: { create: jest.fn(async () => ({ run: jest.fn(async () => ({})) })) },
  Tensor: class { constructor(_t: string, _d: any, _s: any[]) {} },
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

import { healBatchCount } from '../app/engine/healBatch';
import { useGameStore } from '../app/state/gameStore';
import { getRaces, getFactions } from '../app/engine/character';
import type { InventoryItem, DogCompanion } from '../app/engine/types';

describe('healBatchCount (OTA-693)', () => {
  it('uses only what fits under max — no overheal (the player example)', () => {
    // gap 55, heal 6/item, 11 carried → floor(55/6)=9 (54, no waste); the 10th would overheal.
    expect(healBatchCount(6, 55, 11)).toBe(9);
  });
  it('uses the whole stack when even all of it stays under max', () => {
    expect(healBatchCount(5, 100, 8)).toBe(8);
  });
  it('nothing when already full', () => {
    expect(healBatchCount(25, 0, 8)).toBe(0);
  });
  it('variable/unknown heal (perItem<=0) falls back to whole stack', () => {
    expect(healBatchCount(0, 30, 4)).toBe(4);
  });
  it('exact multiple lands on max with no waste', () => {
    expect(healBatchCount(5, 55, 20)).toBe(11); // 11*5 = 55 exactly
  });
});

const firstAidKit = (id: string, qty: number): InventoryItem =>
  ({ id, name: 'First Aid Kit', kind: 'consumable', quantity: qty, rarity: 'Uncommon', tags: ['healing', 'crafted'] } as InventoryItem);

const mkDog = (hp: number): DogCompanion =>
  ({ id: 'd', name: 'Rocky', breed: 'x', sex: { raw: 'm', pronoun: 'he' }, startingProfile: 'mongrel', hp, hpMax: 40, stats: { strength: 10, dexterity: 10, intelligence: 10 }, statProgress: { strength: 0, dexterity: 0, intelligence: 0 }, loyalty: 50, lastFedAtHour: 0, equipped: { vest: null }, status: 'with_player' } as DogCompanion);

async function freshGame() {
  const store = useGameStore;
  await store.getState().hydrate();
  await store.getState().startNewGame({ name: 'Medic', raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
  store.getState().skipTutorial?.();
  return store;
}

describe('useHealBatch store action (OTA-693)', () => {
  beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

  it('SELF: applies N kits at once, clamped to missing HP, spends N', async () => {
    const store = await freshGame();
    const p = store.getState().player!;
    // First Aid Kit heals 25. Set hp 30/ (hpMax). gap = hpMax-30.
    store.setState({ player: { ...p, hp: 30, inventory: [...p.inventory, firstAidKit('fak', 5)] } });
    const maxHp = store.getState().player!.hpMax;
    const gap = maxHp - 30;
    const n = healBatchCount(25, gap, 5);

    store.getState().useHealBatch('First Aid Kit', 'self', n);

    const after = store.getState().player!;
    expect(after.hp).toBeLessThanOrEqual(maxHp);      // never overheals
    expect(after.hp).toBe(Math.min(maxHp, 30 + 25 * n));
    const kit = after.inventory.find((i) => i.id === 'fak');
    expect((kit?.quantity ?? 0)).toBe(5 - n);          // spent exactly n
  });

  it('DOG: feeds N kits at once, clamped to the dog\'s missing HP', async () => {
    const store = await freshGame();
    const p = store.getState().player!;
    store.setState({ player: { ...p, dog: mkDog(10), inventory: [...p.inventory, firstAidKit('fak', 3)] } });
    // dog gap 30, heal 25/kit → floor(30/25)=1... use whole stack instead? n from helper:
    const n = healBatchCount(25, 30, 3); // = 1
    store.getState().useHealBatch('First Aid Kit', 'dog', Math.max(1, n));

    const dog = store.getState().player!.dog!;
    expect(dog.hp).toBeLessThanOrEqual(dog.hpMax);
    expect(dog.hp).toBeGreaterThan(10);
  });

  it('never overheals even if asked for too many', async () => {
    const store = await freshGame();
    const p = store.getState().player!;
    store.setState({ player: { ...p, hp: p.hpMax - 10, inventory: [...p.inventory, firstAidKit('fak', 9)] } });
    store.getState().useHealBatch('First Aid Kit', 'self', 9); // 9*25 way over the 10 gap
    expect(store.getState().player!.hp).toBe(p.hpMax);       // capped, not over
  });

  it('HEAL TO FULL: ceil(gap/perItem) kits reach exactly max, last kit clamped', async () => {
    // #4 — the "Heal to full" button uses ceil(gap / perItem). When the gap is not a
    // multiple of the per-kit heal, the no-waste (floor) count stops short; the ceil
    // count tops off in one tap, the last kit's surplus clamped at hpMax.
    const store = await freshGame();
    const p = store.getState().player!;
    const maxHp = p.hpMax;
    const gap = 55; // not a multiple of 25
    store.setState({ player: { ...p, hp: maxHp - gap, inventory: [...p.inventory, firstAidKit('fak', 5)] } });
    const noWaste = healBatchCount(25, gap, 5);           // floor(55/25) = 2 → stops at -5 short
    const toFull = Math.min(5, Math.ceil(gap / 25));       // ceil(55/25) = 3 → reaches full
    expect(noWaste).toBe(2);
    expect(toFull).toBe(3);

    store.getState().useHealBatch('First Aid Kit', 'self', toFull);
    const after = store.getState().player!;
    expect(after.hp).toBe(maxHp);                          // exactly full, not over
    expect(after.inventory.find((i) => i.id === 'fak')?.quantity).toBe(2); // spent 3
  });
});
