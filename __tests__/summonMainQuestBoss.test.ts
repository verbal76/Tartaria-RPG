// engine_Dev — the SUMMON chip re-spawns the active main-quest KILL-step boss into
// the current scene (the data-driven replacement for the old built-in Core-Guardian
// SUMMON). The boss auto-spawns on arrival; this is the re-engage path after a
// death-revive / scene rebuild clears the field. Proves the store action's
// preconditions + scene mutation.

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
jest.mock('expo-speech-recognition', () => ({}));
jest.mock('expo-updates', () => ({}));

import { useGameStore } from '../app/state/gameStore';
import { setCustomMainQuestOverride, setCustomBossesOverride, clearAllOverrides } from '../app/engine/contentPack';

async function bootBase() {
  const store = useGameStore;
  await store.getState().hydrate();
  await store.getState().startNewGame({ name: 'Owner', raceId: 'mud_dweller', factionId: 'forgotten_order' });
  store.getState().skipTutorial?.();
  return store;
}

const WARDEN = [{ id: 'warden', name: 'The Warden', hp: 50, attack: 5, damage: '2d6', spawnCondition: 'main_quest' }];

describe('engine_Dev — summonMainQuestBoss', () => {
  beforeAll(() => { console.log = () => {}; console.warn = () => {}; });
  afterEach(() => clearAllOverrides());

  it('spawns the active kill-step boss when standing at its location with the field clear', async () => {
    const store = await bootBase();
    setCustomBossesOverride(WARDEN);
    setCustomMainQuestOverride({ title: 'X', steps: [{ id: 's1', action: 'kill', target: 'the warden', bossId: 'warden', locationId: 'test_loc' }] } as never);
    store.setState((s) => ({
      player: { ...s.player!, currentLocationId: 'test_loc', hubRoomId: 'room1', travelTarget: undefined },
      currentScene: { ...(s.currentScene as object), enemies: [], enemyHps: [], activeEnemyIdx: 0 } as never,
    }));
    expect((store.getState().currentScene?.enemies ?? []).length).toBe(0);
    const res = store.getState().summonMainQuestBoss();
    expect(res.ok).toBe(true);
    const enemies = store.getState().currentScene?.enemies ?? [];
    expect(enemies.some((e) => e.name === 'The Warden')).toBe(true);
  });

  it('returns already_present (no duplicate) when the boss is already in the scene', async () => {
    const store = await bootBase();
    setCustomBossesOverride(WARDEN);
    setCustomMainQuestOverride({ title: 'X', steps: [{ id: 's1', action: 'kill', bossId: 'warden', locationId: 'test_loc' }] } as never);
    store.setState((s) => ({
      player: { ...s.player!, currentLocationId: 'test_loc', hubRoomId: 'room1', travelTarget: undefined },
      currentScene: { ...(s.currentScene as object), enemies: [{ name: 'The Warden', hp: 50 }], enemyHps: [50], activeEnemyIdx: 0 } as never,
    }));
    const res = store.getState().summonMainQuestBoss();
    expect(res).toEqual({ ok: true, reason: 'already_present' });
    expect((store.getState().currentScene?.enemies ?? []).length).toBe(1);
  });

  it('refuses when the player is not standing at the kill-step location', async () => {
    const store = await bootBase();
    setCustomBossesOverride(WARDEN);
    setCustomMainQuestOverride({ title: 'X', steps: [{ id: 's1', action: 'kill', bossId: 'warden', locationId: 'test_loc' }] } as never);
    store.setState((s) => ({
      player: { ...s.player!, currentLocationId: 'somewhere_else', hubRoomId: 'room1', travelTarget: undefined },
      currentScene: { ...(s.currentScene as object), enemies: [], enemyHps: [], activeEnemyIdx: 0 } as never,
    }));
    const res = store.getState().summonMainQuestBoss();
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('no_quest_boss_here');
  });
});
