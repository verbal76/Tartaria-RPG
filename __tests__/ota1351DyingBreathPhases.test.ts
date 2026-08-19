// ⚠⚠ OTA-1351 — THE DYING BREATH LEARNS PHASES (B9 instrumentation).
//
// The 2026-08-17 freeze receipt (Pixel 10 Pro XL, 23:47:25.954) proved the
// live breadcrumb's limit: `action "go west"` alone cannot tell "died
// processing that action" from "died half a minute later in background work",
// and the disk log's tail was dead either way. Both wedge-hunt replays of the
// exact route came back clean in JS, so the next freeze must name its own
// killer. The crumb now records the last CHECKPOINT reached:
//   received → parsed:<intent> → engine-done → rendered   (an action's life)
//   homework:<job> → homework-done                        (background model work)
// and the boot report prints it. Instrument first, then fix — the discipline
// runtimePressure.ts wrote down after the FIRST freeze.
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
import { readLiveBreadcrumb, stampLiveBreadcrumb, stampBreadcrumbPhase } from '../app/engine/saveSystem';
import { runtimePressureSummary, setLastBootBreadcrumb } from '../app/diagnostics/runtimePressure';
import { readFileSync } from 'fs';
import { join } from 'path';

jest.setTimeout(120_000);
beforeAll(() => { console.log = () => {}; console.warn = () => {}; });

describe('OTA-1351 — the dying breath learns phases', () => {
  it('⚠⚠ a real action leaves the crumb at engine-done, stamped after the action itself', async () => {
    const store = useGameStore;
    await store.getState().hydrate();
    await store.getState().startNewGame({ name: 'Canary', raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
    store.getState().skipTutorial?.();
    store.getState().submitPlayerAction('look around');
    await Promise.resolve(); // let the fire-and-forget write land in the mock
    const crumb = await readLiveBreadcrumb();
    expect(crumb).toBeTruthy();
    expect(crumb!.what).toContain('look around');
    expect(crumb!.phase).toBe('engine-done');
    expect(crumb!.phaseAt!).toBeGreaterThanOrEqual(crumb!.at);
  });

  it('⚠ a phase stamp with no prior action still writes a readable crumb', async () => {
    stampLiveBreadcrumb({ at: Date.now(), what: 'action "test"' });
    stampBreadcrumbPhase('homework:intro-fill', 'somewhere_id');
    await Promise.resolve();
    const crumb = await readLiveBreadcrumb();
    expect(crumb!.phase).toBe('homework:intro-fill');
    expect(crumb!.phaseDetail).toBe('somewhere_id');
  });

  it('⚠⚠ the boot report prints the checkpoint line the next freeze will be judged by', () => {
    setLastBootBreadcrumb({
      at: 1000, what: 'action "go west"', screen: 'exploration', room: 'outpost_central',
      phase: 'engine-done', phaseAt: 1234,
    });
    const text = runtimePressureSummary({
      memoryWarnings: 0, lastMemoryWarningAt: null, appStateTrail: [],
      lastVerdict: 'ok', worstFrameGapMs: 0, worstJsGapMs: 0, uiStalls: 0,
    });
    expect(text).toContain('Last checkpoint reached: engine-done (+234ms after it)');
    setLastBootBreadcrumb(null);
  });

  it('⚠ source locks: every exit path stamps engine-done; the screen stamps rendered; homework stamps itself', () => {
    const store = readFileSync(join(__dirname, '..', 'app', 'state', 'gameStore.ts'), 'utf8');
    // The try/finally wrap — engine-done must ride EVERY early return.
    expect(store).toContain("stampBreadcrumbPhase('engine-done'");
    expect(store).toContain('} finally {');
    expect(store).toContain("stampBreadcrumbPhase(`parsed:${parsed.intent}`)");
    expect(store).toContain("stampBreadcrumbPhase('homework:intro-fill', target.id)");
    expect(store).toContain("stampBreadcrumbPhase('homework:item-desc', key)");
    const screen = readFileSync(join(__dirname, '..', 'app', 'screens', 'ExplorationScreen.tsx'), 'utf8');
    expect(screen).toContain("useEffect(() => { stampBreadcrumbPhase('rendered'); });");
  });
});
