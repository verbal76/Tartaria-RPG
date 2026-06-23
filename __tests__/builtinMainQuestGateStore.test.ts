// engine_Dev — store-level proof that the built-in (Tartaria) main quest + Core
// Guardians are gated DEAD whenever a data-driven quest exists. Boots the real
// store and exercises the public guardian-summon action + the phase machine.

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
  Audio: { setAudioModeAsync: jest.fn(), Sound: class { static createAsync: (...args: unknown[]) => Promise<{ sound: { playAsync: () => Promise<void>; unloadAsync: () => Promise<void> } }> = jest.fn(async () => ({ sound: { playAsync: jest.fn(async () => {}), unloadAsync: jest.fn(async () => {}) } })); } },
}));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '0', applicationId: 'test' }));
jest.mock('expo-asset', () => ({ Asset: { fromModule: () => ({ downloadAsync: jest.fn(async () => {}), localUri: '' }) } }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => {}) }));
jest.mock('expo-constants', () => ({ default: { expoConfig: {} } }));
jest.mock('expo-font', () => ({ loadAsync: jest.fn(async () => {}) }));
jest.mock('expo-speech-recognition', () => ({}));
jest.mock('expo-updates', () => ({}));

import { useGameStore } from '../app/state/gameStore';
import { setCustomMainQuestOverride, clearAllOverrides, hasAnyMainQuest } from '../app/engine/contentPack';

async function boot() {
  const store = useGameStore;
  await store.getState().hydrate();
  await store.getState().startNewGame({ name: 'Owner', raceId: 'mud_dweller', factionId: 'forgotten_order' });
  store.getState().skipTutorial?.();
  return store;
}

describe('engine_Dev — built-in main quest gated dead at runtime (store-level)', () => {
  afterEach(() => clearAllOverrides());

  it('WITHOUT a data-driven quest, the built-in path is still live (fixture state)', async () => {
    const store = await boot();
    expect(hasAnyMainQuest()).toBe(false);
    // Not at a capital → the built-in refuses for the LOCATION reason, not the gate.
    const res = store.getState().summonCoreGuardian();
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('not_at_capital');
  });

  it('WITH a custom quest loaded, the Core-Guardian summon is gated OFF', async () => {
    const store = await boot();
    setCustomMainQuestOverride({ title: 'X', steps: [{ id: 's1', action: 'reach', locationId: 'home' }] } as never);
    expect(hasAnyMainQuest()).toBe(true);
    const res = store.getState().summonCoreGuardian();
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('no_builtin_quest'); // the GATE refused, before any location check
  });

  it('WITH a data-driven quest, the phase machine never advances + no guardian is in scene', async () => {
    const store = await boot();
    setCustomMainQuestOverride({ title: 'X', steps: [{ id: 's1', action: 'kill', target: 'a boss', bossId: 'b' }] } as never);
    const phaseBefore = store.getState().player?.mainQuest?.phase;
    // Drive a bunch of ordinary actions; the built-in phase machine must not move.
    for (let i = 0; i < 8; i++) store.getState().submitPlayerAction('look around');
    expect(store.getState().player?.mainQuest?.phase).toBe(phaseBefore);
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const cg = require('../app/engine/coreGuardians') as typeof import('../app/engine/coreGuardians');
    const sceneEnemies = store.getState().currentScene?.enemies ?? [];
    expect(sceneEnemies.some((e) => cg.isCoreGuardian(e))).toBe(false);
  });
});
