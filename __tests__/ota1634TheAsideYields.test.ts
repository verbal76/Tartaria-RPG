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
jest.mock('expo-av', () => ({ Audio: { setAudioModeAsync: jest.fn(), Sound: class { static createAsync: jest.Mock = jest.fn(async () => ({ sound: { playAsync: jest.fn(), unloadAsync: jest.fn() } })); } } }));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '0', applicationId: 'test' }));
jest.mock('expo-asset', () => ({ Asset: { fromModule: () => ({ downloadAsync: jest.fn(async () => {}), localUri: '' }) } }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => {}) }));
jest.mock('expo-constants', () => ({ default: { expoConfig: {} } }));
jest.mock('expo-font', () => ({ loadAsync: jest.fn(async () => {}) }));
jest.mock('expo-speech-recognition', () => ({}));
jest.mock('expo-updates', () => ({}));

// ⚠⚠⚠ OTA-1634 — THE ASIDE YIELDS.
//
// Owner, 2026-09-02 22:36:46, typed into the game: *"lag is back"*. His log,
// the minute before:
//
//   22:35:00  qwen⏱ ambient … (a live aside, LLM priority, uninterruptible)
//   22:35:13  ⚠ FREEZE WATCH: LOGIC stalled while frames kept coming (js 8025ms)
//   22:35:22  qwen⏱ ambient ok 22327ms
//   22:35:24  arbiter: ambient stale:combat-started→banked 24387ms
//   22:35:25  [cognitive] SEARCH  (23538ms)      ← a ~300 ms classifier call
//   22:35:26  [cognitive] REST    (24088ms)
//   22:35:27  [cognitive] neutral (10209ms) · (10617ms) · (11028ms)
//   22:35:30  qwen⏱ investigate_lore ok 26960ms wait 24099ms
//
// One native lock, one aside nobody was waiting on, and everything the player
// WAS waiting on queued behind it for 24 seconds — then the aside was stale.
// Two changes: the live aside runs as homework (below the voice, cut the instant
// the player acts or a real call arrives) and a cut aside is discarded; and the
// freeze-watch stall line now names the crumb before/after the quiet stretch
// and the native lane with its queue, so the next 8 s stall says what it sat in.

import {
  runExclusiveNativeMl, nativeMlSnapshot, _mlLockState,
  ML_PRIORITY_HOMEWORK, ML_PRIORITY_LLM, ML_PRIORITY_COGNITION,
} from '../app/ai/nativeMlLock';
import { notePlayerActionForSprint, _resetSprintForTest } from '../app/state/sprint';
import { stallContextLine } from '../app/diagnostics/runtimePressure';
import { stampBreadcrumbPhase, peekLiveBreadcrumb, _resetBreadcrumbMirrorForTest } from '../app/engine/saveSystem';
import { readFileSync } from 'fs';
import { join } from 'path';

const src = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');
const codeOnly = (s: string): string => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const tick = () => new Promise((r) => setTimeout(r, 0));

/** A job that holds the lock until released and records whether it was cut. */
function heldJob(priority: number, withHook = true) {
  let release!: () => void;
  const done = new Promise<void>((r) => { release = r; });
  const state = { cut: false, settled: false };
  const p = runExclusiveNativeMl(
    async () => { await done; return 'x'; },
    priority,
    withHook ? () => { state.cut = true; } : undefined,
  ).then(() => { state.settled = true; });
  return { state, release, p };
}

beforeEach(() => { _resetSprintForTest(); });

describe('OTA-1634 — the log arithmetic', () => {
  it('⚠⚠⚠ THE CLASSIFIER WAITED THE LENGTH OF THE ASIDE, plus its own queue', () => {
    // 24088 − 22327 = 1761 ms: the REST classification finished within two
    // seconds of the aside releasing the lock — it was the aside it waited for.
    expect(24088 - 22327).toBeLessThan(2500);
    // And the lore's own wait is the same number, from the other side.
    expect(Math.abs(24099 - 24088)).toBeLessThan(100);
  });
});

describe('OTA-1634 — the aside is homework, and homework yields', () => {
  it('⚠⚠⚠ THE LIVE ASIDE IS HOMEWORK — one flag, both paths, label kept', () => {
    const n = src('app/ai/narration.ts');
    expect(n).toContain("job: opts?.bankOnly ? 'ambient_fill' : 'ambient', homework: true },");
    // and the runtime maps homework to the lane below everything
    const rt = codeOnly(src('app/ai/generation/LlamaRuntime.ts'));
    expect(rt).toContain('opts.homework ? ML_PRIORITY_HOMEWORK : ML_PRIORITY_LLM');
    expect(ML_PRIORITY_HOMEWORK).toBeLessThan(ML_PRIORITY_LLM);
  });

  it('⚠⚠⚠ A PLAYER ACTION CUTS IT — the lane the aside now sits in', async () => {
    const job = heldJob(ML_PRIORITY_HOMEWORK);
    await tick();
    expect(_mlLockState().running).toBe(true);
    notePlayerActionForSprint();
    expect(job.state.cut).toBe(true);
    job.release();
    await job.p;
  });

  it('⚠⚠⚠ A CLASSIFIER CALL CUTS IT — cognition outranks the aside on enqueue', async () => {
    const aside = heldJob(ML_PRIORITY_HOMEWORK);
    await tick();
    const cog = heldJob(ML_PRIORITY_COGNITION);
    expect(aside.state.cut).toBe(true);
    aside.release();
    await aside.p;
    await tick();
    cog.release();
    await cog.p;
  });

  it('⚠⚠ a CUT aside is discarded, never spoken half-written', () => {
    const n = src('app/ai/narration.ts');
    const fn = n.slice(n.indexOf('async function maybeGenerateAmbientArbiter('));
    const cut = fn.indexOf("noteQwenDiscarded('ambient:preempted')");
    expect(cut).toBeGreaterThan(-1);
    // before the stale check and before anything appends to the arbiter channel
    expect(cut).toBeLessThan(fn.indexOf('const staleReason = ambientStaleReason(get, stamp);'));
    expect(fn.slice(0, cut)).toContain('if (lastQwenCallPreempted()) {');
    // the fill path is exempt on purpose (OTA-1258 keeps a preempted fill's text)
    expect(fn.indexOf('if (opts?.bankOnly) {')).toBeLessThan(cut);
  });
});

describe('OTA-1634 — the stall line names what the app was doing', () => {
  it('⚠⚠⚠ THE NATIVE LOCK REPORTS ITS LANE AND QUEUE', async () => {
    expect(nativeMlSnapshot()).toEqual({ running: false, lane: 'idle', queued: 0 });
    const a = heldJob(ML_PRIORITY_LLM);
    await tick();
    expect(nativeMlSnapshot()).toEqual({ running: true, lane: 'llm', queued: 0 });
    const b = heldJob(ML_PRIORITY_COGNITION, false);
    expect(nativeMlSnapshot()).toEqual({ running: true, lane: 'llm', queued: 1 });
    a.release();
    await a.p;
    await tick();
    expect(nativeMlSnapshot()).toEqual({ running: true, lane: 'cognition', queued: 0 });
    b.release();
    await b.p;
    await tick();
    expect(nativeMlSnapshot()).toEqual({ running: false, lane: 'idle', queued: 0 });
  });

  it('⚠⚠⚠ THE LIVE CRUMB CAN BE READ IN PLACE', () => {
    _resetBreadcrumbMirrorForTest();
    expect(peekLiveBreadcrumb()).toBeNull();
    stampBreadcrumbPhase('parsed:attack');
    expect(peekLiveBreadcrumb()?.phase).toBe('parsed:attack');
    _resetBreadcrumbMirrorForTest();
  });

  it('⚠⚠⚠ THE LINE, EXACTLY — his 8 s stall would have read like this', () => {
    const line = stallContextLine(
      { phase: 'engine-done', phaseAt: 1_000, what: 'action "rest"' },
      { phase: 'native:llm:done', phaseAt: 9_000, what: 'action "rest"' },
      { running: true, lane: 'llm', queued: 3 },
      10_000,
    );
    expect(line).toBe('crumb before: engine-done +9000ms → now: native:llm:done +1000ms · doing: action "rest" · native: llm running · q3');
  });

  it('⚠⚠ it never lies about what it does not have', () => {
    expect(stallContextLine(null, null, { running: false, lane: 'idle', queued: 0 }, 5))
      .toBe('crumb before: (no crumb) → now: (no crumb) · doing: (no action yet) · native: idle');
    expect(stallContextLine({ what: 'action "flee"' }, null, { running: false, lane: 'idle', queued: 2 }, 5))
      .toBe('crumb before: (no phase) ? → now: (no crumb) · doing: action "flee" · native: idle · q2');
  });

  it('⚠⚠ the watch samples the crumb every tick and prints the pair on the edge', () => {
    const w = codeOnly(src('app/diagnostics/runtimePressureWatch.ts'));
    expect(w).toContain('crumbNow = peekLiveBreadcrumb();');
    expect(w).toContain('stallContextLine(crumbAtLastSample, crumbNow, nativeMlSnapshot(), t)');
    expect(w).toContain('crumbAtLastSample = crumbNow;');
    // the context rides on the SAME line as the verdict — one grep finds both
    expect(w).toContain('`${freezeVerdictLine(v, Math.max(0, jsGap), frameGap)}${ctx}`');
  });
});
