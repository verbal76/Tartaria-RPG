// OTA-416 — interrupted-death recovery. A crash DURING the death sequence can
// persist a save with hp<=0 but `dead` not yet committed; loading it dropped the
// player into the world (or the fight they just died in) at 0 HP. backfillPlayer
// now restores HP on any alive-but-zeroed load, and loadSlotIntoGame drops the
// stale combat scene + narrates a revival.

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('onnxruntime-react-native', () => ({
  InferenceSession: { create: jest.fn(async () => ({ run: jest.fn(async () => ({})) })) },
  Tensor: class { constructor(_t: string, _d: unknown, _s: unknown[]) { void _t; void _d; void _s; } },
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
import { getRaces, getFactions } from '../app/engine/character';

async function boot(name: string) {
  const store = useGameStore;
  await store.getState().hydrate();
  const race = getRaces()[0]!;
  const fac = getFactions()[0]!;
  await store.getState().startNewGame({ name, raceId: race.id, factionId: fac.id });
  store.getState().skipTutorial?.();
  return store;
}

describe('OTA-416 — interrupted-death recovery', () => {
  beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

  it('restores HP when an alive-but-0-HP save is loaded (no resume at 0 HP)', async () => {
    const store = await boot('Faller');
    const slotId = store.getState().activeSlotId!;
    expect(slotId).toBeTruthy();

    // Simulate the interrupted-death state: hp/stamina zeroed, but NOT flagged
    // dead (the crash hit before `dead=true` committed). Persist it.
    const p = store.getState().player!;
    store.setState({ player: { ...p, hp: 0, stamina: 0, dead: false } });
    await store.getState().persist();

    // Reload the slot — the resume path must NOT bring them back at 0 HP.
    await store.getState().loadSlotIntoGame(slotId);

    const revived = store.getState().player!;
    expect(revived.dead).not.toBe(true);
    expect(revived.hp).toBeGreaterThan(0);
    expect(revived.hp).toBe(revived.hpMax);
  });
});
