// OTA-1175 — THE FIX I SHIPPED THIS AFTERNOON WAS BUILDING A LOOP. THE INSTRUMENTS CAUGHT IT.
//
// First device log from OTA-1174, and it indicts OTA-1173 in its own words:
//
//   19:11:08.99  ⚠⚠ MEMORY WARNING #2 from the OS — app=active · qwen='loading' · reloads=3
//   19:11:09.03  memory: released the Qwen context (~400MB) in response to the warning
//   19:11:09.88  ⚠⚠ MEMORY WARNING #3 (0.9s since the last one) — qwen='idle' · reloads=3
//   19:11:10.58  qwen-watchdog: reinit #3 settled in 3575ms → status='idle'
//   19:11:12.02  qwen-watchdog: reinitializing (attempt #4)
//   19:11:12.41  ⚠⚠ MEMORY WARNING #4 (2.5s) — qwen='downloading' · reloads=4
//   19:11:17.87  ⚠⚠ MEMORY WARNING #5 (5.5s) — qwen='downloading' · reloads=5
//   19:11:27.77  ⚠⚠ MEMORY WARNING #6 (9.9s) — qwen='downloading' · reloads=6
//   19:11:47.63  ⚠⚠ MEMORY WARNING #7 (19.9s) — qwen='downloading' · reloads=7
//
// ⚠⚠ SEVEN ~400MB ALLOCATIONS IN FORTY SECONDS, AND OTA-1173's FIX WAS THE ENGINE.
// The loop: the watchdog kicks a load → iOS fires a memory warning → the OTA-1173 handler
// disposes the context to free memory → **the dispose marks the in-flight load STALE**
// (OTA-1084's lifecycleGen) → the load settles to `'idle'` → the watchdog sees not-ready
// and kicks another. Every single `reinit #N settled` line in that log reads `→
// status='idle'`, which is the loop's fingerprint.
//
// ⚠ FREEING MEMORY UNDER PRESSURE IS STILL RIGHT. Doing it with nothing to stop the
// reload was not. This is the interlock that was missing, not a reversal of OTA-1173.
//
// ⚠ AND WHAT WORKED IS WORTH RECORDING TOO: the OTA-1173 ceiling bounded it at 8 and the
// backoff ladder stretched the gap 10s → 20s → 40s, so it was never unbounded. Bounded
// thrash is still thrash — but the guards did what they were written to do, and without
// OTA-1172's instruments none of this would have been visible at all.

jest.setTimeout(30000);
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
type MockSound = { playAsync: () => Promise<void>; unloadAsync: () => Promise<void> };
jest.mock('expo-av', () => ({
  Audio: {
    setAudioModeAsync: jest.fn(),
    Sound: class {
      static createAsync: () => Promise<{ sound: MockSound }> = jest.fn(async () => ({
        sound: { playAsync: jest.fn(async () => {}), unloadAsync: jest.fn(async () => {}) },
      }));
    },
  },
}));

import * as fs from 'fs';
import * as path from 'path';
import { blockAt } from '../test-utils/srcBlock';
const read = (...p: string[]): string => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');
/** ⚠ OTA-1396 — SLICE 5 split this subsystem across two files, and this suite
 *  reads BOTH on purpose. The instruments (the memory-warning handler, the
 *  dispose, the quiet-window latch) moved to
 *  `app/diagnostics/runtimePressureWatch.ts`; the Qwen watchdog that CONSULTS
 *  them reads them through accessors. The interlock this suite pins is precisely
 *  the seam between the two, so a claim about it is a claim about both files.
 *  Concatenating them keeps every assertion honest without pretending the code
 *  is still in one place.
 *
 *  ⚠⚠ OTA-1397 — SLICE 6 MOVED THE OTHER HALF, AND gameStore IS NO LONGER PART
 *  OF THIS SEAM AT ALL. The watchdog left for `app/ai/qwenWatchdog.ts`, so what
 *  used to be "the store and a leaf it consults" is now two leaves, neither of
 *  which the store contributes a line to. The concatenation names them both;
 *  the assertions below did not change, which is the point. */
const STORE = read('app', 'ai', 'qwenWatchdog.ts')
  + '\n' + read('app', 'diagnostics', 'runtimePressureWatch.ts');

describe('OTA-1175 — a memory warning now silences the watchdog', () => {
  it('⚠⚠ THE QUIET WINDOW EXISTS AT ALL — this is the whole regression', () => {
    expect(STORE).toContain('const MEMORY_PRESSURE_QUIET_MS = 90_000;');
    expect(STORE).toContain('let rpMemoryPressureUntil = 0;');
  });

  it('⚠⚠ THE FLAG IS SET *BEFORE* THE DISPOSE, and the ordering is the fix', () => {
    // The dispose marks any in-flight load stale, so the very next watchdog tick sees
    // 'idle'. Setting the flag after the dispose leaves a window in which exactly the
    // observed loop can restart — which is the bug, not a smaller version of it.
    const i = STORE.indexOf("AppState.addEventListener('memoryWarning'");
    expect(i).toBeGreaterThan(-1);
    // ⚠ OTA-1179 widened this window. The handler grew a long comment recording that its
    // old release line asserted an outcome it never checked, which pushed `.dispose()`
    // past the previous 4,000-char slice and made this test read -1 for "not found"
    // rather than for "out of order". The ORDERING CLAIM below is unchanged and is still
    // the whole point — only the window it is measured in moved.
    const block = STORE.slice(i, i + 9000);
    const flag = block.indexOf('rpMemoryPressureUntil = Date.now() + MEMORY_PRESSURE_QUIET_MS;');
    const dispose = block.indexOf('.dispose()');
    expect(flag).toBeGreaterThan(-1);
    expect(dispose).toBeGreaterThan(-1);
    expect(flag).toBeLessThan(dispose);
  });

  it('⚠ THE WATCHDOG ACTUALLY CHECKS IT, and refuses the reload', () => {
    expect(STORE).toContain('if (qwenStoodDownForMemory() || underMemoryPressure())');
    const i = STORE.indexOf('if (qwenStoodDownForMemory() || underMemoryPressure())');
    // Must RETURN, not fall through to the kick.
    // ⚠ WINDOW-FREE, and deliberately so. This was `blockAt(STORE, 'if (qwenStoodDownForMemory() || underMemoryPressure())')` and it is the
    // FIFTH fixed-size source slice to age this session — OTA-1181 restructured the two
    // stand-down messages onto separate branches and pushed `return false;` past the
    // magic number. The claim never changed; the window kept going stale, and a slice that
    // falls short reads as "the guard is gone" rather than "my window is too small".
    // Anchored on real landmarks instead: the refusal must come after the gate and BEFORE
    // the reload kick, which is the actual property.
    const ret = STORE.indexOf('return false;', i);
    const kick = STORE.indexOf('qwenReinitAttempts += 1;', i);
    expect(ret).toBeGreaterThan(i);
    expect(kick).toBeGreaterThan(ret);
  });

  it('⚠⚠ AND THE GATE SITS BEFORE THE KICK, not after it', () => {
    const gate = STORE.indexOf('if (qwenStoodDownForMemory() || underMemoryPressure())');
    const kick = STORE.indexOf('qwenReinitAttempts += 1;');
    expect(gate).toBeGreaterThan(-1);
    expect(kick).toBeGreaterThan(gate);
  });

  it('⚠ THREE WARNINGS AND IT STOPS ASKING FOR THE SESSION', () => {
    // A device that has refused three times is telling us something. The eighth ask is not
    // going to be the one it says yes to, and each ask is another 400MB spike.
    expect(STORE).toContain('const MEMORY_WARNINGS_BEFORE_STANDDOWN = 3;');
    expect(STORE).toContain('if (rpMemoryWarnings >= MEMORY_WARNINGS_BEFORE_STANDDOWN) rpQwenStoodDownForMemory = true;');
  });

  it('it says so once, in plain words, and then goes quiet', () => {
    expect(STORE).toContain('STANDING DOWN for good');
    expect(STORE).toContain('if (!memoryQuietAlreadyLogged())');
  });

  it('the quiet window outlasts the backoff ladder it has to override', () => {
    // The ladder reached ~40s in the observed log. A quiet window shorter than that would
    // be stepped straight over by the next rung.
    const m = /const MEMORY_PRESSURE_QUIET_MS = (\d+)_(\d+);/.exec(STORE);
    expect(m).not.toBeNull();
    const ms = parseInt(`${m![1]}${m![2]}`, 10);
    expect(ms).toBeGreaterThanOrEqual(60_000);
  });

  it('⚠ THE DISPOSE ITSELF IS NOT REVERTED — freeing under pressure is still right', () => {
    // This OTA adds an interlock; it does not undo OTA-1173. Handing memory back when the
    // OS asks is correct and stays.
    //
    // ⚠⚠ RETARGETED BY OTA-1179, AND THE NEW ASSERTION IS STRONGER THAN THE OLD ONE.
    // This used to pin the literal string "released the Qwen context (~400MB) in response
    // to the warning" — a line that turned out to be printed UNCONDITIONALLY, whether or
    // not anything was freed. The owner's 2026-08-09 report shows it five times with
    // `qwen='idle'`, i.e. five claims of ~400MB released when no model was loaded. Pinning
    // that string was pinning the defect. What actually matters here is that the DISPOSE
    // still happens under pressure, so that is what this now checks — plus that the
    // release claim is now conditional on a real release.
    const i = STORE.indexOf("AppState.addEventListener('memoryWarning'");
    expect(i).toBeGreaterThan(-1);
    const block = STORE.slice(i, i + 9000);
    expect(block).toContain('.dispose()');
    expect(block).toContain('const freed = contextLedger().released > before;');
  });

  it('and a re-hydrate clears the interlock rather than inheriting it', () => {
    const i = STORE.indexOf('function startQwenWatchdog');
    const block = blockAt(STORE, 'function startQwenWatchdog');
    // ⚠ OTA-1396 — the four latches are cleared by ONE call now. Clearing three
    // of four was always the bug waiting to happen, so they were given a single
    // owner in runtimePressureWatch.ts; the watchdog asks it to reset them.
    expect(block).toContain('clearMemoryPressureLatches();');
  });
});

describe('OTA-1176 — the instrument stops when nobody is looking', () => {
  it('⚠⚠ OTA-1172 SHIPPED A STARTER WITH NO STOPPER — two listeners, a timer, an rAF loop', () => {
    // Owner's RN/Hermes checklist, item 2: "subscriptions, intervals, or event listeners
    // that never get cleared." That one was mine, from the same afternoon.
    expect(STORE).toContain('export function stopRuntimePressureWatch(): void {');
    const i = STORE.indexOf('export function stopRuntimePressureWatch(): void {');
    const block = STORE.slice(i, i + 700);
    expect(block).toContain('clearTimeout(rpSampleTimer)');
    expect(block).toContain('rpStopFrameClock()');
    expect(block).toContain('rpMemorySub.remove()');
    expect(block).toContain('rpAppStateSub.remove()');
  });

  it('⚠ THE STARTER REUSES THE STOPPER, so the two cannot drift', () => {
    // The hand-rolled teardown inside the starter already differed from what it should
    // have cleared. One implementation, used by both paths.
    // ⚠ OTA-1396 — anchored on `export function`, which only the real starter
    // has. This suite concatenates two files, so a bare `function …(` matched a
    // COMMENT in the other one and windowed the wrong body.
    const i = STORE.indexOf('export function startRuntimePressureWatch(');
    expect(i).toBeGreaterThan(-1);
    const block = STORE.slice(i, i + 900);
    expect(block).toContain('stopRuntimePressureWatch();');
  });

  it('⚠⚠ THE FRAME CLOCK PAUSES WHEN THE APP IS NOT FOREGROUNDED', () => {
    // The detector only JUDGES while foregrounded, so 60 wakeups a second in the
    // background were being thrown away — and a backgrounded app doing steady work is what
    // iOS reclaims first. The instrument was making the thing it measures slightly worse.
    expect(STORE).toContain('rpStartFrameClock();');
    expect(STORE).toContain('rpStopFrameClock();');
    const i = STORE.indexOf("if (nextStr === 'active') {");
    expect(i).toBeGreaterThan(-1);
    const block = STORE.slice(i, i + 500);
    expect(block).toContain('rpStartFrameClock();');
    expect(block).toContain('} else {');
    expect(block).toContain('rpStopFrameClock();');
  });

  it('⚠ AND TWO LOOPS CAN NEVER STACK — the starter is guarded', () => {
    const i = STORE.indexOf('function rpStartFrameClock(): void {');
    expect(i).toBeGreaterThan(-1);
    expect(STORE.slice(i, i + 260)).toContain('if (rpFrameRaf !== null) return;');
  });
});

describe('OTA-1175 — what the log also settled, on the record', () => {
  it('⚠⚠ THE DEVICE READS CHANNEL `preview`, NOT `hal2001` — measured, not assumed', () => {
    // `ota: boot check — enabled=true channel=preview rt=2.4.1` — the OTA-1174 telemetry
    // answered this on its first run. app.json carries `expo-channel-name: hal2001`, but
    // the production iOS TestFlight build is stamped `preview` by the eas.json production
    // profile, exactly as the workflow's own OTA-303 note warns.
    // ⚠ THAT MATTERS: the `preview` (ios) publish is the workflow's BEST-EFFORT line
    // (optional=true), so it can fail while the run still goes green. The only channel
    // that reaches this device is the one whose failure is invisible.
    // Recorded here because it is the kind of fact that gets re-derived wrongly at 2am.
    expect(true).toBe(true);
  });

  it('⚠ THE HEADER BLOCK REPORTS THE *CURRENT* SESSION, and that read as a contradiction', () => {
    // The pasted report said `Memory warnings: none this session` while the log carried
    // SEVEN — because the app had been relaunched, and the snapshot is per-session while
    // the log survives. Not a bug, but it is a trap for whoever reads the next one:
    // ⚠ TRUST THE LOG OVER THE HEADER when the two disagree about a past session.
    expect(STORE).toContain('memoryWarnings: rpMemoryWarnings');
  });
});
