
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

// OTA-808 — a climb FALL must wipe THIS climb's cleared-tier progress: you resume
// from the ground, not the tier you fell off (player ruling: "you shouldn't resume
// climb at the same level you fell from — start all the way over").

async function setupClimber() {
  const store = useGameStore;
  await store.getState().hydrate();
  await store.getState().startNewGame({ name: 'Faller', raceId: 'unknowing_mass', factionId: 'reclaimers_guild' });
  store.getState().skipTutorial?.();
  const p0 = store.getState().player!;
  const rope: InventoryItem = { id: 'rope_recl', name: "Reclaimer's Rope", kind: 'misc', quantity: 1, tags: ['utility', 'gate'] } as InventoryItem;
  store.setState({
    currentScene: { ...store.getState().currentScene!, ambientNouns: ['tower'], elevatedOn: null },
    player: {
      ...p0, hp: 120, hpMax: 120, stamina: 10, staminaMax: 10,
      inventory: [...p0.inventory.filter((i) => !/rope/i.test(i.name)), rope],
    },
  });
  return store;
}

const climbMarks = (store: typeof useGameStore): string[] => {
  const rooms = store.getState().worldMemory.visitedRooms ?? {};
  return Object.values(rooms).flatMap((r) => (r as { searchedAmbientNouns?: string[] }).searchedAmbientNouns ?? []);
};

describe('OTA-808 — a climb fall restarts the climb from the ground', () => {
  beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

  it('clears a tier, then a fall strips this climb progress marker', async () => {
    const store = await setupClimber();
    await store.getState().submitPlayerAction('climb tower');
    expect(store.getState().currentScene?.elevatedOn).not.toBeNull();
    expect(climbMarks(store).some((m) => m.startsWith('climbed:tower'))).toBe(true);

    // OTA-913 — a stamina shortfall no longer drops you; trigger a REAL fall (a rope worn
    // through to nothing) to exercise the OTA-828 climb-reset instead.
    store.setState({
      player: {
        ...store.getState().player!,
        inventory: store.getState().player!.inventory.map((i) =>
          i.name === "Reclaimer's Rope" ? { ...i, durability: { current: 0, max: 90 } } : i,
        ),
      },
    });
    await store.getState().submitPlayerAction('climb tower');

    expect(climbMarks(store).some((m) => m.startsWith('climbed:tower'))).toBe(false);
    expect(store.getState().currentScene?.elevatedOn).toBeNull();
    const logs = store.getState().gameLog.map((e) => e.text).join('\n');
    expect(logs).toMatch(/climbed again from the base/i);
  });
});
