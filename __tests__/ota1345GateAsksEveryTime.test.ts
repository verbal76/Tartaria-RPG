// ⚠ OTA-1345 — PUNCHLIST-BRAVO B6, DECIDED: THE GATE ASKS EVERY TIME.
//
// A tower's (or mission's) SET COURSE inside an outpost used to walk you out
// with no Yes/No — routeGreatClimb leaned on setTravelCourse's hub self-heal —
// while the plain SET COURSE asked (OTA-035). Two precedents, one dialog.
// Unified on ASKING: the ContractsScreen sends mission/climb routes through the
// same leave-the-outpost confirm, and the confirm carries the contract so
// accepting routes THE CONTRACT (single-active rules and all), not a bare
// course.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('onnxruntime-react-native', () => ({
  InferenceSession: { create: jest.fn(async () => ({ run: jest.fn(async () => ({})) })) },
  Tensor: class { constructor(_t: string, _d: unknown, _s: unknown[]) {} },
}));
jest.mock('llama.rn', () => ({ initLlama: jest.fn(async () => ({ completion: jest.fn(async () => ({ text: '' })), release: jest.fn() })), releaseAllLlama: jest.fn() }));
jest.mock('react-native-executorch', () => ({}));
jest.mock('expo-file-system', () => ({ documentDirectory: '/tmp/', cacheDirectory: '/tmp/', getInfoAsync: jest.fn(async () => ({ exists: false })), makeDirectoryAsync: jest.fn(async () => {}), readAsStringAsync: jest.fn(async () => ''), writeAsStringAsync: jest.fn(async () => {}), deleteAsync: jest.fn(async () => {}), downloadAsync: jest.fn(async () => ({ uri: '' })), EncodingType: { UTF8: 'utf8', Base64: 'base64' } }));
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
import { readFileSync } from 'fs';
import { join } from 'path';

jest.setTimeout(120_000);
beforeAll(() => { console.log = () => {}; console.warn = () => {}; });

async function bootInOutpost() {
  const store = useGameStore;
  await store.getState().hydrate();
  await store.getState().startNewGame({ name: 'Gatekeeper', raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
  store.getState().skipTutorial?.();
  store.setState((s) => ({
    player: { ...s.player!, hubRoomId: 'outpost_gate', stamina: 50, staminaMax: 50 } as never,
    worldMemory: { ...s.worldMemory, unlockedGreatClimbs: ['asgardar_spire'] },
  }));
  return store;
}

describe('OTA-1345 — mission and climb courses ask at the gate', () => {
  it('⚠⚠ a climb confirm carries the climbId: accepting walks out AND routes the tower', async () => {
    const store = await bootInOutpost();
    store.getState().requestTravelConfirm('grand_spire_of_asgardar', 'Grand Spire of Asgardar', { climbId: 'asgardar_spire' });
    expect(store.getState().pendingTravelConfirm?.climbId).toBe('asgardar_spire');
    // Still inside until the player says yes — that is the whole point of B6.
    expect(store.getState().player!.hubRoomId).toBe('outpost_gate');
    store.getState().confirmLeaveAndTravel();
    expect(store.getState().player!.hubRoomId).toBeNull();
    expect(store.getState().player!.routedClimbId).toBe('asgardar_spire');
  });

  it('⚠ cancelling stays inside and routes nothing', async () => {
    const store = await bootInOutpost();
    store.getState().requestTravelConfirm('grand_spire_of_asgardar', 'Grand Spire of Asgardar', { climbId: 'asgardar_spire' });
    store.getState().cancelTravelConfirm();
    expect(store.getState().player!.hubRoomId).toBe('outpost_gate');
    expect(store.getState().player!.routedClimbId ?? null).toBeNull();
    expect(store.getState().pendingTravelConfirm).toBeNull();
  });

  it('⚠ the ContractsScreen sends BOTH branches through the confirm when inside (source lock)', () => {
    const src = readFileSync(join(__dirname, '..', 'app', 'screens', 'ContractsScreen.tsx'), 'utf8');
    expect(src).toContain('requestTravelConfirm(id, name, { missionId });');
    expect(src).toContain('requestTravelConfirm(id, name, { climbId: pendingRoute.climbId });');
    // And the store's accept path routes the contract, not a bare course.
    const store = readFileSync(join(__dirname, '..', 'app', 'state', 'gameStore.ts'), 'utf8');
    expect(store).toContain('if (pending.missionId) {');
    expect(store).toContain('get().routeMission(pending.missionId);');
    expect(store).toContain('get().routeGreatClimb(pending.climbId);');
  });
});
