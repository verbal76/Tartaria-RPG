/**
 * OTA-1735 - THE INSTRUMENT WAS SWITCHED OFF FOR THE WINDOW IT WAS BUILT TO WATCH.
 *
 * ⚠⚠⚠ THE FINDING, and it is an instrument defect rather than a game defect.
 *
 * `startRuntimePressureWatch` - the memory-warning listener, the AppState listener
 * (which stamps the crumb on every background/foreground transition) and the
 * freeze clock - is started at the END of `bootQwen`. OTA-1493 deferred bootQwen
 * to the FIRST PLAYER ACTION.
 *
 * Every boot-time process kill in the owner's ledger reads `(no action yet)`.
 * So every one of them was recorded with the instrument not yet installed, and
 * the line "Memory warnings: none this session" on those records is not a
 * measurement - it is the absence of a listener. Ten records, ten times.
 *
 * ⚠⚠ AND THE STAGE NAME POINTED AT AN INNOCENT SUBSYSTEM. `boot:qwen:deferred`
 * was the last word on five death records. Arming the warm stores a closure and
 * returns; bootQwen is not called. Worse, it is the LAST stamp of a fully
 * successful boot - `audio:*`, `tts:*` and `boot:complete` are all stamped
 * SYNCHRONOUSLY while the mlhealth chain is still pending, so `qwen:deferred`
 * lands after them - and nothing writes again until the exploration screen's
 * heartbeat starts. It is an absorbing state: a death one second later and a
 * death five minutes later read identically, and both name Qwen.
 *
 * ⚠ WHAT THIS SUITE DOES NOT CLAIM. It does not claim a cause for the deaths.
 * The evidence cannot support one yet, which is precisely why this OTA ships
 * instrumentation and no behaviour change to the boot it is measuring.
 */
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
/* ⚠⚠⚠ THE SDK IS MOCKED, AND THAT IS NOT TIDINESS — IT IS A BUG THIS SUITE CAUSED.
 *  The first cut called the REAL `nativeSdkSawCrashLastRun`, which require()s the
 *  real `@sentry/react-native` into the jest WORKER. Module registries reset per
 *  file; the worker's globals do not. Six hundred files later
 *  ota1685TheNativeSideGivesItsVerdict, ota1492SentMeansArrived and
 *  ota1504TheBundleSurvivesTheKill — all of which mock the SDK — failed with
 *  `Expected true, Received null`, and all three passed on their own. Order-only,
 *  and reproducible with `-i --runTestsByPath ota1735 ota1685`.
 *  ⚠ Mocking it also makes the test STRONGER: all four decline paths can be driven
 *    deliberately instead of whatever the environment happens to answer. */
const mockSentry: { init: jest.Mock; captureEvent: jest.Mock; crashedLastRun?: unknown } = {
  init: jest.fn(), captureEvent: jest.fn(),
};
jest.mock('@sentry/react-native', () => mockSentry, { virtual: true });
jest.mock('expo-speech', () => ({ speak: jest.fn(), stop: jest.fn(), isSpeakingAsync: jest.fn(async () => false) }));
jest.mock('expo-av', () => ({
  Audio: {
    setAudioModeAsync: jest.fn(),
    Sound: class {
      static createAsync: () => Promise<{ sound: { playAsync: () => void; unloadAsync: () => void } }> =
        jest.fn(async () => ({ sound: { playAsync: jest.fn(), unloadAsync: jest.fn() } }));
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
// ⚠ Reduce-motion is a real shipped path and it stops RN Animated loops from
// outliving Jest's teardown ("_bezier is not a function" as the graph unloads).
jest.mock('../app/state/accessibility', () => ({
  ...jest.requireActual('../app/state/accessibility'),
  useReduceMotion: () => true,
}));

// ⚠⚠ OTA-1255 — THE OTHER FOUR SCREENS HAD NEVER BEEN RENDERED BY A TEST.

import { readFileSync } from 'fs';
import { join } from 'path';
import { between, expectAbsent } from '../test-utils/srcBlock';
import {
  armQwenWarm, fireQwenWarmOnPlayerAction, qwenWarmReleased,
  _resetDeferredQwenWarmForTests,
} from '../app/ai/deferredQwenWarm';
import { peekLiveBreadcrumb, stampBreadcrumbPhase } from '../app/engine/saveSystem';
import { nativeSdkSawCrashLastRun, nativeSdkVerdictReason, _resetSentryTransportForTests } from '../app/diagnostics/sentryTransport';

const W = (s: string) => process.stdout.write(s + '\n');
const APP = readFileSync(join(__dirname, '..', 'App.tsx'), 'utf8');
const STORE = readFileSync(join(__dirname, '..', 'app', 'state', 'gameStore.ts'), 'utf8');
const WATCH = readFileSync(join(__dirname, '..', 'app', 'diagnostics', 'runtimePressureWatch.ts'), 'utf8');
const LIFECYCLE = readFileSync(join(__dirname, '..', 'app', 'state', 'slices', 'aiLifecycleSlice.ts'), 'utf8');

// ═══ 1. THE DEFECT: the instrument was gated behind a player action ════════

describe('OTA-1735 - the pressure watch is armed by the boot, not by bootQwen', () => {
  it('⚠⚠⚠ THE OLD GATING IS REAL: bootQwen still starts it, and bootQwen is deferred', () => {
    // The defect is not that bootQwen starts it — that call stays, and is correct
    // for a re-hydrate. The defect was that this was the ONLY caller.
    expect(LIFECYCLE).toContain('deps.startRuntimePressureWatch(get, set)');
    // ⚠ That the warm gates bootQwen on a player action is asserted by BEHAVIOUR in
    //   the next describe (arm → nothing runs → fire → it runs), not by quoting a
    //   declaration here: check:quotedpins is right that a pinned sentence passes
    //   when the behaviour is deleted.
    W('  bootQwen still starts the watch (correct for re-hydrate); it is no longer the only caller');
  });

  it('⚠⚠⚠ THE BOOT NOW ARMS IT, AND BEFORE hydrate — which is where the OTA apply lives', () => {
    const armAt = APP.indexOf('startBootPressureWatch()');
    const hydrateAt = APP.indexOf("setStage('hydrate:start')");
    expect(armAt).toBeGreaterThan(-1);
    expect(hydrateAt).toBeGreaterThan(-1);
    // ⚠ The ORDER is the whole point: the OTA check + apply happen inside the
    //   hydrate chain, and the reload-target boot is the case under investigation.
    expect(armAt).toBeLessThan(hydrateAt);
    W('  App.tsx arms the watch before hydrate:start — the apply and the reload are covered');
  });

  it('⚠⚠ ONE WATCH, NOT TWO — the boot calls the same wrapper the AI lifecycle is handed', () => {
    // A second implementation is the failure mode this codebase keeps naming.
    expect(STORE).toContain('startRuntimePressureWatch: startPressureWatchWithHooks');
    const action = between(STORE, 'startBootPressureWatch() {', '},');
    expect(action).toContain('startPressureWatchWithHooks(get, set)');
    // and nothing in the new action reaches for the raw starter or its own hooks
    expectAbsent(action, 'startRuntimePressureWatchRaw', 'startPressureWatchWithHooks');
  });

  it('⚠⚠ RESTARTING IS SAFE, AND DOES NOT ERASE WHAT THE BOOT SAW', () => {
    // Idempotence: the starter stops itself first, so bootQwen restarting it later
    // replaces the subscriptions rather than stacking a second set.
    const starter = between(WATCH, 'export function startRuntimePressureWatch(', 'const now = Date.now();');
    expect(starter).toContain('stopRuntimePressureWatch();');
    // ⚠ And the counters are NOT reset by a restart — a memory warning seen during
    //   boot has to survive into the session report or arming early buys nothing.
    // ⚠ Window bounded by the NEXT declaration, not by a brace — the first `}`
    //   closes an inner `if` and the canary caught that on the first run.
    const stop = between(WATCH, 'export function stopRuntimePressureWatch', 'export function startRuntimePressureWatch');
    expectAbsent(stop, 'rpMemoryWarnings = 0', 'rpMemorySub');
    expectAbsent(starter, 'rpMemoryWarnings = 0', 'stopRuntimePressureWatch');
    expectAbsent(starter, 'rpAppStateTrail = []', 'stopRuntimePressureWatch');
    W('  restart replaces subscriptions; memory-warning count and app-state trail survive');
  });
});

// ═══ 2. THE STAGE NAME STOPS NAMING QWEN ══════════════════════════════════

describe('OTA-1735 - boot:qwen:deferred was an absorbing state pointing at the wrong subsystem', () => {
  beforeEach(() => { _resetDeferredQwenWarmForTests(); });

  it('⚠⚠⚠ ARMING RUNS NOTHING — the warm is a stored closure, so Qwen has done nothing', () => {
    let ran = 0;
    armQwenWarm(() => { ran += 1; });
    expect(ran).toBe(0);
    expect(qwenWarmReleased()).toBe(false);
    fireQwenWarmOnPlayerAction();
    expect(ran).toBe(1);
    // and only once, however many actions follow
    fireQwenWarmOnPlayerAction();
    fireQwenWarmOnPlayerAction();
    expect(ran).toBe(1);
  });

  it('⚠⚠⚠ ARMING NOW STAMPS THE TRUTH: idle, awaiting the first action', () => {
    stampBreadcrumbPhase('boot:qwen:deferred');
    expect(peekLiveBreadcrumb()?.phase).toBe('boot:qwen:deferred');
    armQwenWarm(() => { /* not run */ });
    // ⚠ The record a death would now carry names the STATE (idle, waiting for the
    //   player) instead of a subsystem that has not been called.
    expect(peekLiveBreadcrumb()?.phase).toBe('boot:idle:awaiting-first-action');
    W(`  crumb after arming: ${String(peekLiveBreadcrumb()?.phase)}`);
  });

  it('⚠⚠⚠ WHY IT WAS THE LAST WORD: the boot stamps its tail SYNCHRONOUSLY, before the ML chain', () => {
    // This is the structural claim the whole misreading rests on, so it is pinned
    // against the source rather than asserted in prose.
    const window = between(APP, "setStage('mlhealth:load');", "setStage('audio:start');");
    // canary: we are looking at the mlhealth kick-off
    expect(window).toContain('loadMLHealth()');
    // ⚠ NOT awaited — so audio:start, tts:start and boot:complete all run first,
    //   and mlhealth:done → cognitive:* → qwen:deferred land AFTER boot:complete.
    expectAbsent(window, 'await loadMLHealth', 'loadMLHealth()');
    expect(window).toContain('void loadMLHealth()');
    const order = ["setStage('mlhealth:load')", "setStage('audio:start')", "setStage('tts:start')", "setStage('boot:complete')"];
    const idx = order.map((o) => APP.indexOf(o));
    expect(idx.every((v) => v > -1)).toBe(true);
    for (let i = 1; i < idx.length; i++) expect(idx[i]!).toBeGreaterThan(idx[i - 1]!);
    W('  sync tail: mlhealth:load → audio:start → tts:start → boot:complete, all before the ML chain resolves');
  });

  it('⚠⚠⚠ "alive 0ms after it" PROVES NOTHING at boot — nothing advances the clock', () => {
    // ⚠ This is the trap that nearly produced a wrong root cause. Five records read
    //   `alive 0ms after it`, which looks like "the process froze the instant the
    //   checkpoint landed". It is not: `aliveAt` only moves when SOMETHING CALLS the
    //   stamper, and between the boot's last stamp and the exploration screen's
    //   first heartbeat, nothing does. So the death is undated — it could be 1ms or
    //   5 minutes later, and the record cannot tell them apart.
    //
    // ⚠ Pinned as BEHAVIOUR, not as the comment that says so (check:quotedpins was
    //   right to reject that): stamp, read the clock, let real time pass with no
    //   caller, read it again.
    stampBreadcrumbPhase('boot:idle:awaiting-first-action');
    const first = peekLiveBreadcrumb();
    expect(first?.phase).toBe('boot:idle:awaiting-first-action');
    const aliveThen = first?.aliveAt;
    expect(typeof aliveThen).toBe('number');
    const spin = Date.now() + 25;
    while (Date.now() < spin) { /* real elapsed time, no stamper called */ }
    const later = peekLiveBreadcrumb();
    expect(later?.aliveAt).toBe(aliveThen);       // the clock did not move
    expect(later?.phase).toBe('boot:idle:awaiting-first-action');
    W(`  25ms of real time passed with no caller; aliveAt unchanged at ${String(aliveThen)}`);
  });
});

// ═══ 3. THE VERDICT THAT HAS BEEN SILENT TEN TIMES ════════════════════════

describe('OTA-1735 - the native-SDK verdict says why it has no opinion', () => {
  it('⚠⚠ the four ways it can decline are no longer one value', () => {
    const src = readFileSync(join(__dirname, '..', 'app', 'diagnostics', 'sentryTransport.ts'), 'utf8');
    const fn = between(src, 'export async function nativeSdkSawCrashLastRun()', 'export function installSentryIfAvailable');
    for (const reason of ['sdk-absent', 'not-a-function', 'non-boolean', 'threw', 'answered ']) {
      expect(fn).toContain(reason);
    }
  });

  describe('each decline path is driven and named', () => {
    beforeEach(() => { _resetSentryTransportForTests(); delete mockSentry.crashedLastRun; });

    it('⚠⚠ ANSWERED — a real boolean is passed through, and said so', async () => {
      mockSentry.crashedLastRun = jest.fn(async () => true);
      expect(await nativeSdkSawCrashLastRun()).toBe(true);
      expect(nativeSdkVerdictReason()).toBe('answered true');
      _resetSentryTransportForTests();
      mockSentry.crashedLastRun = jest.fn(async () => false);
      // ⚠ `false` is the finding that matters most: the SDK was up and saw NO
      //   crash, which means the OS took the process rather than a signal killing it.
      expect(await nativeSdkSawCrashLastRun()).toBe(false);
      expect(nativeSdkVerdictReason()).toBe('answered false');
    });

    it('⚠⚠ NOT-A-FUNCTION — the SDK is present but has no such method', async () => {
      expect(await nativeSdkSawCrashLastRun()).toBeNull();
      expect(nativeSdkVerdictReason()).toMatch(/^not-a-function/);
    });

    it('⚠⚠⚠ NON-BOOLEAN — the native side has not resolved the last run yet', async () => {
      // This is the timing answer, and it is the one the ten silent records are
      // most likely to have been: a null/undefined from a native SDK still starting.
      mockSentry.crashedLastRun = jest.fn(async () => undefined);
      expect(await nativeSdkSawCrashLastRun()).toBeNull();
      expect(nativeSdkVerdictReason()).toMatch(/^non-boolean \(undefined\)/);
    });

    it('⚠⚠ THREW — the error is carried, not swallowed into the same null', async () => {
      mockSentry.crashedLastRun = jest.fn(async () => { throw new Error('native not ready'); });
      expect(await nativeSdkSawCrashLastRun()).toBeNull();
      expect(nativeSdkVerdictReason()).toBe('threw (native not ready)');
    });

    it('⚠ and all four are DIFFERENT sentences — the defect was one null for four causes', async () => {
      const seen: string[] = [];
      _resetSentryTransportForTests(); await nativeSdkSawCrashLastRun(); seen.push(nativeSdkVerdictReason());
      _resetSentryTransportForTests(); mockSentry.crashedLastRun = jest.fn(async () => undefined);
      await nativeSdkSawCrashLastRun(); seen.push(nativeSdkVerdictReason());
      _resetSentryTransportForTests(); mockSentry.crashedLastRun = jest.fn(async () => { throw new Error('x'); });
      await nativeSdkSawCrashLastRun(); seen.push(nativeSdkVerdictReason());
      _resetSentryTransportForTests(); mockSentry.crashedLastRun = jest.fn(async () => true);
      await nativeSdkSawCrashLastRun(); seen.push(nativeSdkVerdictReason());
      W(`  four causes, four sentences:\n    ${seen.join('\n    ')}`);
      expect(new Set(seen).size).toBe(4);
    });
  });

  it('⚠ the boot writes it to the log, so the next device cycle carries it', () => {
    expect(APP).toContain('nativeSdkVerdictReason()');
    expect(APP).toContain('native-sdk verdict:');
  });
});
