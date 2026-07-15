// OTA-1095 — a HUNT is a FACE-TO-FACE turn-in. The trophy must be shown in person to
// a paying agent (the posting faction's, or any vendor for a neutral hunt); there is
// no remote/courier close, and the Contracts-UI COMPLETE no longer pays from any tile
// (that was the B2 exploit). Mysteries/storylines/faction deeds are untouched.

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
import { HUNTS } from '../app/engine/hunts';

beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

async function boot() {
  const store = useGameStore;
  await store.getState().hydrate();
  await store.getState().startNewGame({ name: 'Hunter', raceId: 'unknowing_mass', factionId: 'reclaimers_guild' });
  store.getState().skipTutorial?.();
  return store;
}

// Arm a completed-but-unturned hunt (stage past the last, ready to hand in).
function armReadyHunt(store: ReturnType<typeof useGameStore>, vendor: { name: string; faction: string | null } | null) {
  const def = HUNTS[0]!;
  store.setState((s) => ({
    currentScene: { ...s.currentScene!, enemies: [], vendor } as any,
    player: {
      ...s.player!,
      tc: 100,
      activeHunts: [{ id: def.id, stage: def.stages.length, postedByFaction: def.factionId ?? null, acceptedAt: 0 }],
    },
  }));
  return def;
}

describe('OTA-1095 — hunts are a face-to-face turn-in', () => {
  it('the Contracts-UI COMPLETE is refused with NO agent present (closes the B2 remote-close)', async () => {
    const store = await boot();
    const def = armReadyHunt(store, null); // no vendor in scene
    const tcBefore = store.getState().player!.tc;
    store.getState().completeContractFromUI('hunt', def.id);
    // Still on the slate, nothing paid.
    expect((store.getState().player!.activeHunts ?? []).some((h) => h.id === def.id)).toBe(true);
    expect(store.getState().player!.tc).toBe(tcBefore);
  });

  it('the typed "send word" remote close is refused for a hunt', async () => {
    const store = await boot();
    const def = armReadyHunt(store, null);
    store.getState().turnInHunt(def.id, true); // remote courier
    expect((store.getState().player!.activeHunts ?? []).some((h) => h.id === def.id)).toBe(true);
  });

  it('handing in FACE TO FACE at the posting agent completes it and pays full', async () => {
    const store = await boot();
    const def = armReadyHunt(store, { name: 'Tellin Mak', faction: def0FactionFallback() });
    const tcBefore = store.getState().player!.tc;
    store.getState().completeContractFromUI('hunt', def.id);
    expect((store.getState().player!.activeHunts ?? []).some((h) => h.id === def.id)).toBe(false); // closed
    expect(store.getState().player!.tc).toBe(tcBefore + def.rewardTc);                              // full pay
  });
});

// The seed hunt's faction (so the in-scene agent matches); neutral hunts accept any.
function def0FactionFallback(): string | null {
  return HUNTS[0]!.factionId ?? null;
}
