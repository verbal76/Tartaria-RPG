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
  makeDirectoryAsync: jest.fn(async () => {}), readAsStringAsync: jest.fn(async () => ''),
  writeAsStringAsync: jest.fn(async () => {}), deleteAsync: jest.fn(async () => {}),
  downloadAsync: jest.fn(async () => ({ uri: '' })), EncodingType: { UTF8: 'utf8', Base64: 'base64' },
}));
jest.mock('expo-speech', () => ({ speak: jest.fn(), stop: jest.fn(), isSpeakingAsync: jest.fn(async () => false) }));
jest.mock('expo-av', () => ({ Audio: { setAudioModeAsync: jest.fn(), Sound: class { static createAsync: () => Promise<unknown> = jest.fn(async () => ({ sound: { playAsync: jest.fn(), unloadAsync: jest.fn() } })); } } }));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '0', applicationId: 'test' }));
jest.mock('expo-asset', () => ({ Asset: { fromModule: () => ({ downloadAsync: jest.fn(async () => {}), localUri: '' }) } }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => {}) }));
jest.mock('expo-constants', () => ({ default: { expoConfig: {} } }));
jest.mock('expo-font', () => ({ loadAsync: jest.fn(async () => {}) }));
jest.mock('expo-speech-recognition', () => ({}));
jest.mock('expo-updates', () => ({}));

// ⚠⚠ OTA-1278 — THE WATCHDOG WAS WALKING STRAIGHT THROUGH OTA-1275's DEBOUNCE.
//
// From the owner's 4.29.199 log, and the ORDER is the proof — the watchdog fired
// 2ms BEFORE the appstate line it was reacting to:
//
//   14:45:26.813 qwen-watchdog: Qwen not ready (status='idle'); reinitializing
//   14:45:26.815 appstate: background → active
//   14:45:27.382 ctx: OPENED ≈425MB
//   14:45:29.898 qwen: re-warm cancelled (left the foreground first)
//
// Three ~425MB loads across three 3-second visits, with BOTH debounce cancels
// landing and neither preventing anything. App.tsx owns the re-warm policy; the
// watchdog owns recovery during play — and a rule enforced in one place only is
// not a rule. This is the ninth-plus time this project has paid for one
// decision living in two houses.
// ⚠ OTA-1397 — SLICE 6 MOVED BOTH HALVES OF THIS SUITE'S SUBJECT, and re-pointing
// them was not optional: the two test helpers below are the settle gate's only
// handles, and they had to travel with the `let` they read and write, or the
// module they left would have been assigning to an imported binding — a compile
// error, which is the property that makes this segmentation safe to keep doing.
// The watchdog now lives in `app/ai/qwenWatchdog.ts`; nothing about the gate or
// the 8s window changed.
import { _qwenSetForegroundSince, _qwenForegroundSettled } from '../app/ai/qwenWatchdog';
import { readFileSync } from 'fs';
import { join } from 'path';
import { blockAt } from '../test-utils/srcBlock';

const STORE = readFileSync(join(__dirname, '..', 'app', 'ai', 'qwenWatchdog.ts'), 'utf8');
const APP = readFileSync(join(__dirname, '..', 'App.tsx'), 'utf8');

const SETTLE = Number(/const QWEN_FOREGROUND_SETTLE_MS = ([\d_]+);/.exec(STORE)![1]!.replace(/_/g, ''));
const REWARM = Number(/const QWEN_REWARM_DELAY_MS = ([\d_]+);/.exec(APP)![1]!.replace(/_/g, ''));

afterEach(() => { _qwenSetForegroundSince(null); });

describe('OTA-1278 — one settle window, both doors', () => {
  it('⚠⚠ the watchdog gate and App.tsx debounce are the SAME length', () => {
    // If they drift, one door reopens what the other closed — which is exactly
    // the bug. Pinned so a future tweak to one fails until both move.
    expect(SETTLE).toBe(REWARM);
  });

  it('⚠⚠ THE OWNER\'S CASE: a 3-second visit does NOT permit a reinit', () => {
    _qwenSetForegroundSince(Date.now() - 3_000);   // his measured visit length
    expect(_qwenForegroundSettled()).toBe(false);
  });

  it('⚠⚠ ...and a settled foreground DOES — recovery during play still works', () => {
    // The watchdog exists so a model that dies mid-session comes back. Gating it
    // must not disable it.
    _qwenSetForegroundSince(Date.now() - (SETTLE + 1_000));
    expect(_qwenForegroundSettled()).toBe(true);
  });

  it('⚠ unknown foreground state reads as SETTLED — the gate is never the blocker', () => {
    // Headless/tests, or a boot before any AppState event. A gate that defaults
    // to "no" would strand narration on templates for reasons nobody could see.
    _qwenSetForegroundSince(null);
    expect(_qwenForegroundSettled()).toBe(true);
  });

  it('⚠⚠ backgrounding RESTARTS the clock — leaving is what makes a visit short', () => {
    const s = STORE.indexOf("if (next === 'background') {");
    const block = blockAt(STORE, "if (next === 'background') {");
    expect(block).toContain('qwenForegroundSince = null;');
  });

  it('⚠⚠ the gate sits at the REINIT door, not at the tick', () => {
    // The tick must still run (backoff reset, health check, dormancy logging);
    // the single thing it may no longer do is spend ~425MB too early.
    const i = STORE.indexOf('if (!qwenForegroundSettled()) {');
    expect(i).toBeGreaterThan(-1);
    expect(STORE.indexOf('qwenReinitAttempts += 1;', i)).toBeGreaterThan(i);
    // And it says so once, not every tick.
    expect(STORE).toContain('qwen-watchdog: holding reinit — foreground has not settled');
    expect(STORE).toContain('if (!qwenUnsettledLogged) {');
  });
});
