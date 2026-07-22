// Closes the last OTA-338 thread: "Dog death/abandon WRITE — verify on a live
// save." dogSaveBrickRepro PLANTS post-death dog states and reloads them; what
// it does NOT exercise is the REAL write path — the actual tickDogStatus death /
// abandon transition on the live store, persisted through the real (now atomic,
// OTA-344) persist(), then cold-reloaded through loadSlotIntoGame. This drives
// that end-to-end so the only remaining step is a courtesy live-device confirm.

jest.setTimeout(20000);
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
  Audio: { setAudioModeAsync: jest.fn(), Sound: class { static createAsync = jest.fn(async () => ({ sound: { playAsync: jest.fn(async () => {}), unloadAsync: jest.fn(async () => {}) } })); } },
}));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '0', applicationId: 'test' }));
jest.mock('expo-asset', () => ({ Asset: { fromModule: () => ({ downloadAsync: jest.fn(async () => {}), localUri: '' }) } }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => {}) }));
jest.mock('expo-constants', () => ({ default: { expoConfig: {} } }));
jest.mock('expo-font', () => ({ loadAsync: jest.fn(async () => {}) }));
jest.mock('expo-speech-recognition', () => ({}));
jest.mock('expo-updates', () => ({}));

import { useGameStore, tickDogStatus, DOG_BLEED_OUT_HOURS } from '../app/state/gameStore';
import { loadSlot } from '../app/engine/saveSystem';
import type { DogCompanion } from '../app/engine/types';

async function bootBase() {
  const store = useGameStore;
  await store.getState().hydrate();
  await store.getState().startNewGame({ name: 'Verbal', raceId: 'mud_dweller', factionId: 'forgotten_order' });
  store.getState().skipTutorial?.();
  return store;
}

function mkDog(over: Partial<DogCompanion> = {}): DogCompanion {
  return {
    id: 'd', name: 'Rocky', breed: 'mutt',
    sex: { raw: 'male', pronoun: 'he' },
    startingProfile: 'mongrel',
    hp: 12, hpMax: 12,
    stats: { strength: 10, dexterity: 10, intelligence: 10 },
    statProgress: { strength: 0, dexterity: 0, intelligence: 0 },
    loyalty: 80, lastFedAtHour: 0,
    equipped: { vest: null },
    status: 'with_player',
    ...over,
  };
}

describe('dog death/abandon WRITE survives a cold reload (338 close-out)', () => {
  beforeAll(() => { console.log = () => {}; console.warn = () => {}; });

  it('a REAL bleed-out death persists a save that cold-reloads clean with status dead', async () => {
    const store = await bootBase();
    const slotId = store.getState().activeSlotId!;
    // A downed, benched dog past the bleed-out window.
    store.setState((s) => ({
      player: { ...s.player!, hoursElapsed: DOG_BLEED_OUT_HOURS, dogRevivedOta915: true, dog: mkDog({ status: 'waiting_at_base', hp: 0, downedAtHour: 0 }) },
    }));

    // Drive the REAL death write path (sets status 'dead' + persists).
    tickDogStatus(store.getState, store.setState);
    expect(store.getState().player!.dog!.status).toBe('dead');

    // Guarantee the write flushed, then confirm it actually hit disk.
    await store.getState().persist();
    const onDisk = await loadSlot(slotId);
    expect(onDisk?.player?.dog?.status).toBe('dead');

    // Cold reload through the real boot path — must not throw / brick.
    let threw = false;
    let err: string | undefined;
    try { await store.getState().loadSlotIntoGame(slotId); }
    catch (e) { threw = true; err = e instanceof Error ? e.message : String(e); }
    const s = store.getState();
    expect({ threw, err, present: !!s.player, loadError: s.slotLoadError ?? null })
      .toEqual({ threw: false, err: undefined, present: true, loadError: null });
    expect(s.player!.dog!.status).toBe('dead');
  });

  it('a REAL loyalty-0 abandon persists a save that cold-reloads clean with status abandoned', async () => {
    const store = await bootBase();
    const slotId = store.getState().activeSlotId!;
    store.setState((s) => ({
      player: { ...s.player!, hoursElapsed: 100, dogRevivedOta915: true, dog: mkDog({ status: 'with_player', hp: 12, loyalty: 0 }) },
    }));

    tickDogStatus(store.getState, store.setState);
    expect(store.getState().player!.dog!.status).toBe('abandoned');

    await store.getState().persist();
    const onDisk = await loadSlot(slotId);
    expect(onDisk?.player?.dog?.status).toBe('abandoned');

    let threw = false;
    try { await store.getState().loadSlotIntoGame(slotId); } catch { threw = true; }
    const s = store.getState();
    expect({ threw, present: !!s.player, loadError: s.slotLoadError ?? null })
      .toEqual({ threw: false, present: true, loadError: null });
    expect(s.player!.dog!.status).toBe('abandoned');
  });
});
