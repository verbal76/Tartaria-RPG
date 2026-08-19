// ⚠ OTA-1354 — CORNERING FREEZE #5's WINDOW (B9).
//
// The fifth freeze finally produced a checkpoint: `parsed:travel (+32ms)`,
// engine-done never reached — the same fingerprint as freeze #2 (`go west` at
// outpost_central, first entry to the R05 messhall both times). 400 fresh
// JS replays of that exact transition survive, so the killer needs something
// only the device has. The parsed→engine-done window covers more than the
// intent switch: it includes the SHARED post-action pipeline, notably the
// classifier dispatch whose synchronous prefix (tokenize + native tensor
// construction) runs inline on the JS thread with REAL onnxruntime on device
// and a harmless mock under jest. Three new stamps split the window:
//   parsed:<intent> → engine-switch-done → cognitive-dispatch →
//   cognitive-dispatched → engine-done
// The next freeze's crumb lands in exactly one gap and names the killer.
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

import { readFileSync } from 'fs';
import { join } from 'path';
import { useGameStore } from '../app/state/gameStore';
import { getRaces, getFactions } from '../app/engine/character';
import { readLiveBreadcrumb } from '../app/engine/saveSystem';

jest.setTimeout(120_000);
beforeAll(() => { console.log = () => {}; console.warn = () => {}; });

describe('OTA-1354 — the parsed→engine-done window is split', () => {
  it('⚠⚠ source lock: the three stamps sit in order — switch end, dispatch, dispatched', () => {
    const src = readFileSync(join(__dirname, '..', 'app', 'state', 'gameStore.ts'), 'utf8');
    const a = src.indexOf("stampBreadcrumbPhase('engine-switch-done');");
    const b = src.indexOf("stampBreadcrumbPhase('cognitive-dispatch');");
    const c = src.indexOf("stampBreadcrumbPhase('cognitive-dispatched');");
    expect(a).toBeGreaterThan(-1);
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b);
    // The dispatch stamp sits before the processInput call, the dispatched
    // stamp after its synchronous prefix returns.
    const call = src.indexOf('.processInput(trimmed, worldCtx)');
    expect(call).toBeGreaterThan(b);
    expect(c).toBeGreaterThan(call);
  });

  it('⚠ a real action still ends at engine-done (the sub-phases are passed through, not stuck)', async () => {
    const store = useGameStore;
    await store.getState().hydrate();
    await store.getState().startNewGame({ name: 'Corner', raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
    store.getState().skipTutorial?.();
    store.getState().submitPlayerAction('look around');
    await Promise.resolve();
    const crumb = await readLiveBreadcrumb();
    expect(crumb!.phase).toBe('engine-done');
  });
});
