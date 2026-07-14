// OTA-1086 — group-C store-level regressions:
//   C3 · defeating a boss stamps a post-boss grace window; while it holds,
//        beginScene suppresses arrival encounters (no ambush on outpost exit).
//   C1 · firing the Crucible with reserved-but-insufficient pieces OPENS the
//        picker (which surfaces material buckets) instead of dead-ending on a
//        refusal line.

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

import { useGameStore } from '../app/state/gameStore';
import type { InventoryItem } from '../app/engine/types';

beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

async function boot(name = 'Tester') {
  const store = useGameStore;
  await store.getState().hydrate();
  await store.getState().startNewGame({ name, raceId: 'unknowing_mass', factionId: 'reclaimers_guild' });
  store.getState().skipTutorial?.();
  return store;
}

describe('OTA-1086 C3 — post-boss grace window', () => {
  it('killing a boss stamps bossDefeatGraceUntilHours ahead of the clock', async () => {
    const store = await boot('Slayer');
    const p0 = store.getState().player!;
    // A minimal boss enemy in the active scene at 1 HP.
    const boss = { name: 'Test Tyrant', hp: 1, boss: true, type: 'construct', traits: [], attack: 'Strength 5', loot: [], rarity: 'Rare', tc: 0, aliases: [] } as any;
    store.setState({
      currentScene: {
        ...store.getState().currentScene!,
        enemies: [boss], enemyHps: [1], activeEnemyIdx: 0, range: 'close', enemyAmbushUsed: [false],
      },
      player: { ...p0, hoursElapsed: 100 },
    });
    store.getState().resolveEnemyDefeat();
    const after = store.getState().player!;
    expect((after.bossDefeatGraceUntilHours ?? 0)).toBeGreaterThan(100);
  });
});

describe('OTA-1086 C1 — Crucible with reserved-but-insufficient pieces opens the picker', () => {
  it('opens the picker instead of dead-ending on a refusal line', async () => {
    const store = await boot('Forger');
    const p0 = store.getState().player!;
    // Reserve ONE eligible inferred piece — below the 3-item gate, so the gate
    // fails. Pre-801 this refused; now it opens the picker (material buckets).
    const scrap: InventoryItem = {
      id: 'scrap1', name: 'Shrike Claw', kind: 'misc', rarity: 'Common', quantity: 1,
      tags: ['organic'], reservedForFusion: true,
    } as unknown as InventoryItem;
    store.setState({
      player: {
        ...p0,
        inventory: [...p0.inventory, scrap],
        hubRoomId: 'workshop',            // at an outpost Crucible
        macroVisitSeq: 2,                  // has left the spawn outpost
      },
    });
    expect(store.getState().fusionPickerOpen).toBeFalsy();
    await store.getState().fuseAtCrucible();
    expect(store.getState().fusionPickerOpen).toBe(true);
  });
});
