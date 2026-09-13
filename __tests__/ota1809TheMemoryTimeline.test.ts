// ⚠⚠⚠ OTA-1809 (BAKER #3A) — THE MEMORY TIMELINE. OBSERVABILITY ONLY.
//
// Baker #3 is EXCESSIVE PROCESS MEMORY / iOS JETSAM PRESSURE: three jetsam
// reports off a 3 GB iPhone XR naming this process at ~1.85–1.89 GB with
// `per-process-limit`. #3A is forbidden from repairing ANY memory behaviour. Its
// only job is to make the physical Apple device an instrumented laboratory, so
// the next report can answer the one question every previous one has left open:
//
//   LARGE BUT STABLE · SPIKE THAT RECOVERS · RATCHET THAT SETTLES HIGHER ·
//   LIFECYCLE CHURN · TERMINAL PRESSURE — WHICH ONE IS THIS?
//
// ⚠ WHAT THIS SUITE PROTECTS, and the order matters: that the rows are RECORDED
// at the seams that matter, that the ring is BOUNDED, that a row can never
// retain the thing it measures, that an unavailable metric reads UNKNOWN rather
// than a fabricated zero, and — the half that is easiest to lose — that the
// existing memory-warning and AppState BEHAVIOUR is exactly what it was.
//
// ⚠⚠ THE UNKNOWN-NOT-ZERO TEST IS THE ONE THAT EARNS ITS KEEP. `heapMb` is the
// Hermes JS heap and NOT process RSS, which is not reachable from this runtime
// without a native dependency nobody authorised. A diagnostic that prints 0 MB
// where it means "could not measure" is how a wrong finding gets built — this
// codebase has done exactly that twice (OTA-1179's "released ~400MB" line that
// freed nothing, OTA-1259's impossible 64.7 ms/token). So `null`, everywhere,
// and a test that fails if it ever becomes a number.

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
jest.mock('expo-application', () => ({ nativeApplicationVersion: '0', applicationId: 'test' }));
jest.mock('expo-asset', () => ({ Asset: { fromModule: () => ({ downloadAsync: jest.fn(async () => {}), localUri: '' }) } }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => {}) }));
jest.mock('expo-constants', () => ({ default: { expoConfig: {} } }));
jest.mock('expo-font', () => ({ loadAsync: jest.fn(async () => {}) }));
jest.mock('expo-speech-recognition', () => ({}));
jest.mock('expo-updates', () => ({}));

import * as fs from 'fs';
import * as path from 'path';
import { AppState } from 'react-native';
import {
  MEMORY_TIMELINE_MAX,
  MEMORY_MARK_NOTE_MAX,
  MEMORY_MARK_HEAP_DELTA_MB,
  noteMemoryMark,
  noteMemoryMarkIfMoved,
  memoryTimeline,
  memoryTimelineSummary,
  setMemoryWarnCounter,
  _resetMemoryTimeline,
  type MemoryMark,
} from '../app/diagnostics/memoryTimeline';
import { APPROX_CONTEXT_MB } from '../app/ai/generation/contextLedger';

const ROOT = path.resolve(__dirname, '..');
const read = (p: string): string => fs.readFileSync(path.join(ROOT, p), 'utf8');

/** ⚠ Hermes is not present in the jest runtime, so the module's real
 *  `readHermesStats()` returns null here — which is exactly the platform-
 *  fallback case §D tests. To exercise the AVAILABLE path we install a fake
 *  `HermesInternal` with the same shape the engine exposes, and remove it
 *  again; nothing in the module is mocked. */
type HermesGlobal = { HermesInternal?: { getInstrumentedStats?: () => Record<string, unknown> } };
let heapBytes = 40 * 1048576;
function installFakeHermes(): void {
  (globalThis as HermesGlobal).HermesInternal = {
    getInstrumentedStats: () => ({ js_heapSize: heapBytes, js_gcTime: 120, js_numGCs: 4 }),
  };
}
function removeFakeHermes(): void { delete (globalThis as HermesGlobal).HermesInternal; }

beforeEach(() => {
  _resetMemoryTimeline();
  heapBytes = 40 * 1048576;
  removeFakeHermes();
});
afterEach(() => {
  removeFakeHermes();
  _resetMemoryTimeline();
});

// ───────────────────────────────────────────────────────────────────────────
describe('OTA-1809 §A — an event produces one compact record', () => {
  it('a mark records exactly one row, and it carries the event name', () => {
    noteMemoryMark('watch-start');
    const rows = memoryTimeline();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.event).toBe('watch-start');
  });

  it('a note rides along, and a long one is TRUNCATED rather than dropped', () => {
    noteMemoryMark('gen-settled', 'x'.repeat(200));
    const r = memoryTimeline()[0]!;
    expect(r.note).toBeDefined();
    expect(r.note!.length).toBeLessThanOrEqual(MEMORY_MARK_NOTE_MAX);
  });

  it('⚠ every correlation field #3A needs is on the row, and none is undefined', () => {
    installFakeHermes();
    noteMemoryMark('mem-warning');
    const r = memoryTimeline()[0]!;
    for (const k of ['at', 'event', 'heapMb', 'gcMs', 'gcN', 'ctxLive', 'ctxMb', 'app', 'lane', 'q', 'warns']) {
      expect(Object.prototype.hasOwnProperty.call(r, k)).toBe(true);
      expect((r as unknown as Record<string, unknown>)[k]).not.toBeUndefined();
    }
    // `kind` is nullable by design (nothing running), but must be PRESENT.
    expect(Object.prototype.hasOwnProperty.call(r, 'kind')).toBe(true);
  });

  it('the warning count comes from the watch that owns it, not a second counter', () => {
    let n = 0;
    setMemoryWarnCounter(() => n);
    noteMemoryMark('a');
    n = 3;
    noteMemoryMark('b');
    expect(memoryTimeline()[0]!.warns).toBe(0);
    expect(memoryTimeline()[1]!.warns).toBe(3);
    setMemoryWarnCounter(() => 0);
  });

  it('a throwing counter cannot break the mark — an instrument never breaks its host', () => {
    setMemoryWarnCounter(() => { throw new Error('boom'); });
    expect(() => noteMemoryMark('hostile')).not.toThrow();
    expect(memoryTimeline()).toHaveLength(1);
    expect(memoryTimeline()[0]!.warns).toBe(0);
    setMemoryWarnCounter(() => 0);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('OTA-1809 §B — the ring is bounded, and evicts the oldest', () => {
  it('⚠⚠ pushing far past the cap never grows the timeline past it', () => {
    for (let i = 0; i < MEMORY_TIMELINE_MAX * 5; i++) noteMemoryMark(`e${i}`);
    expect(memoryTimeline()).toHaveLength(MEMORY_TIMELINE_MAX);
  });

  it('⚠ eviction is OLDEST-FIRST and order is preserved — the tail is the evidence', () => {
    for (let i = 0; i < MEMORY_TIMELINE_MAX + 10; i++) noteMemoryMark(`e${i}`);
    const rows = memoryTimeline();
    expect(rows[0]!.event).toBe(`e${10}`);
    expect(rows[rows.length - 1]!.event).toBe(`e${MEMORY_TIMELINE_MAX + 9}`);
    // Monotonic in time, so a reader can trust the order without re-sorting.
    for (let i = 1; i < rows.length; i++) expect(rows[i]!.at).toBeGreaterThanOrEqual(rows[i - 1]!.at);
  });

  it('the cap is small enough to be a diagnostic and not a second memory problem', () => {
    expect(MEMORY_TIMELINE_MAX).toBeGreaterThanOrEqual(16);
    expect(MEMORY_TIMELINE_MAX).toBeLessThanOrEqual(128);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('OTA-1809 §C — a row can never retain the thing it measures', () => {
  it('⚠⚠⚠ every recorded value is a scalar — no object, array, or function survives', () => {
    installFakeHermes();
    noteMemoryMark('gen-settled', 'ambient_fill ok');
    const r = memoryTimeline()[0]! as unknown as Record<string, unknown>;
    for (const [k, v] of Object.entries(r)) {
      const t = typeof v;
      expect(['number', 'string', 'boolean'].includes(t) || v === null).toBe(true);
      expect(Array.isArray(v)).toBe(false);
      expect(t).not.toBe('function');
      expect(k.length).toBeGreaterThan(0);
    }
  });

  it('⚠ a FULL ring serialises small — the worst case is measured, not assumed', () => {
    installFakeHermes();
    for (let i = 0; i < MEMORY_TIMELINE_MAX * 2; i++) {
      noteMemoryMark(`event-${i}`, 'x'.repeat(MEMORY_MARK_NOTE_MAX * 3));
    }
    const bytes = JSON.stringify(memoryTimeline()).length;
    // Worst case: every row at max event + max note length. Well under 32 KB.
    expect(bytes).toBeLessThan(32_768);
    // …and the printed block is bounded by the same ring.
    expect(memoryTimelineSummary().length).toBeLessThan(32_768);
  });

  it('the schema has no field that could carry a prompt, a scene or a player', () => {
    noteMemoryMark('x');
    const keys = Object.keys(memoryTimeline()[0]!);
    for (const banned of ['prompt', 'messages', 'scene', 'player', 'inventory', 'text', 'log']) {
      expect(keys).not.toContain(banned);
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('OTA-1809 §D — an unavailable metric reads UNKNOWN, never a fake zero', () => {
  it('⚠⚠⚠ with no Hermes, heapMb/gcMs/gcN are null — NOT 0', () => {
    removeFakeHermes();
    noteMemoryMark('no-hermes');
    const r = memoryTimeline()[0]!;
    expect(r.heapMb).toBeNull();
    expect(r.gcMs).toBeNull();
    expect(r.gcN).toBeNull();
    // The rest of the row is still real — lifecycle state does not depend on Hermes.
    expect(typeof r.app).toBe('string');
    expect(typeof r.ctxLive).toBe('number');
  });

  it('with Hermes present the same fields are real numbers', () => {
    heapBytes = 73 * 1048576;
    installFakeHermes();
    noteMemoryMark('hermes');
    const r = memoryTimeline()[0]!;
    expect(r.heapMb).toBe(73);
    expect(r.gcMs).toBe(120);
    expect(r.gcN).toBe(4);
  });

  it('⚠ and the printed block SAYS so rather than printing a blank number', () => {
    removeFakeHermes();
    noteMemoryMark('no-hermes');
    const block = memoryTimelineSummary();
    expect(block).toContain('Memory timeline');
    expect(block).toMatch(/UNAVAILABLE/);
    expect(block).toContain('heap ?');
  });

  it('⚠ the block never calls the JS heap "memory" — the metric is named honestly', () => {
    installFakeHermes();
    noteMemoryMark('hermes');
    const block = memoryTimelineSummary();
    expect(block).toContain('HERMES JS HEAP');
    expect(block).toContain('not process memory');
    // The context figure is labelled an estimate wherever it appears.
    expect(block).toContain(`${APPROX_CONTEXT_MB}MB est`);
  });

  it('an empty session says it is empty rather than printing an invented baseline', () => {
    expect(memoryTimelineSummary()).toContain('(no marks this session)');
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('OTA-1809 §E/§F — the warning and AppState paths are OBSERVED, not changed', () => {
  // ⚠ The real watch, with the real handlers. `AppState.addEventListener` is
  // captured so the handlers can be invoked directly — this drives the shipped
  // code rather than asserting on its text.
  type Handler = (arg?: unknown) => void;
  let handlers: Record<string, Handler>;
  let lines: string[];
  let spy: jest.SpyInstance;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let watch: any;

  beforeEach(() => {
    handlers = {};
    lines = [];
    // ⚠ In this harness `AppState.currentState` is NOT a plain string, which is
    // exactly how the production `readAppState` hardening was found. Pinned to
    // 'active' so the transition tests below have a known starting state.
    Object.defineProperty(AppState, 'currentState', { value: 'active', configurable: true, writable: true });
    spy = jest.spyOn(AppState, 'addEventListener').mockImplementation(((ev: string, h: Handler) => {
      handlers[ev] = h;
      return { remove: () => { /* captured */ } };
    }) as never);
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    watch = require('../app/diagnostics/runtimePressureWatch');
    watch.clearMemoryPressureLatches();
    _resetMemoryTimeline();
    watch.startRuntimePressureWatch(
      () => ({ appendLog: (_c: string, t: string) => { lines.push(t); }, gameLog: [] }),
      () => { /* set is unused by the watch */ },
      { qwenReinitAttempts: () => 2 },
    );
  });

  afterEach(() => {
    try { watch.stopRuntimePressureWatch(); } catch { /* ignore */ }
    try { watch.clearMemoryPressureLatches(); } catch { /* ignore */ }
    spy.mockRestore();
  });

  it('§A/§E — starting the watch lays down a baseline row', () => {
    const evs = memoryTimeline().map((r) => r.event);
    expect(evs).toContain('watch-start');
  });

  it('⚠⚠⚠ §E — a memory warning still does everything it did, AND is now on the timeline', () => {
    expect(typeof handlers.memoryWarning).toBe('function');
    const before = watch.memoryWarningCount();
    handlers.memoryWarning!();
    // BEHAVIOUR UNCHANGED — the counter, the loud line, the quiet window.
    expect(watch.memoryWarningCount()).toBe(before + 1);
    expect(lines.some((l) => /MEMORY WARNING #\d+ from the OS/.test(l))).toBe(true);
    expect(lines.some((l) => /reloads=2/.test(l))).toBe(true);
    expect(watch.underMemoryPressure()).toBe(true);
    // OBSERVABILITY ADDED — and the row carries this warning's own ordinal.
    const warn = memoryTimeline().find((r) => r.event === 'mem-warning');
    expect(warn).toBeDefined();
    expect(warn!.warns).toBe(before + 1);
  });

  it('⚠ §E — the stand-down ladder still latches at the third warning, unchanged', () => {
    // ⚠ `rpMemoryWarnings` is a SESSION counter with no reset by design ("a
    // counter anything can zero reads clean right when it matters most"), and
    // clearMemoryPressureLatches deliberately does not touch it. So this asserts
    // the LADDER relative to where the session already is, rather than assuming
    // a fresh count — which is the shape of the ladder, not an accident of order.
    watch.clearMemoryPressureLatches();
    while (watch.memoryWarningCount() < 2) handlers.memoryWarning!();
    watch.clearMemoryPressureLatches();
    expect(watch.memoryWarningCount()).toBeGreaterThanOrEqual(2);
    expect(watch.qwenStoodDownForMemory()).toBe(false);
    handlers.memoryWarning!();                       // takes it to >= 3
    expect(watch.memoryWarningCount()).toBeGreaterThanOrEqual(3);
    expect(watch.qwenStoodDownForMemory()).toBe(true);
  });

  it('⚠⚠ §F — an AppState transition still logs and still trails, AND is now on the timeline', () => {
    expect(typeof handlers.change).toBe('function');
    handlers.change!('background');
    handlers.change!('active');
    // BEHAVIOUR UNCHANGED — one line per transition, the trail records both.
    expect(lines.some((l) => /^appstate: active → background/.test(l))).toBe(true);
    expect(lines.some((l) => /^appstate: background → active/.test(l))).toBe(true);
    expect(watch.runtimePressureSnapshot().appStateTrail.slice(-2)).toEqual(['background', 'active']);
    // OBSERVABILITY ADDED — and the note names the transition, not just the state.
    const marks = memoryTimeline().filter((r) => r.event === 'appstate');
    expect(marks.map((m) => m.note)).toEqual(['active→background', 'background→active']);
  });

  it('⚠ §F — a NON-transition is still ignored, so the timeline cannot be spammed', () => {
    handlers.change!('active');            // already active — the handler returns early
    expect(memoryTimeline().filter((r) => r.event === 'appstate')).toHaveLength(0);
  });

  it('§I — the watch still stops cleanly, so OTA-1798 is untouched', () => {
    expect(() => watch.stopRuntimePressureWatch()).not.toThrow();
    expect(watch.runtimePressureSnapshot().memoryWarnings).toBeGreaterThanOrEqual(0);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('OTA-1809 §H — recovery is a GATE, not a sampler, and adds no timer', () => {
  it('⚠⚠ with no Hermes the gate records nothing at all', () => {
    removeFakeHermes();
    expect(noteMemoryMarkIfMoved()).toBe(false);
    expect(memoryTimeline()).toHaveLength(0);
  });

  it('⚠⚠⚠ a heap that has not moved records NOTHING — this is what keeps it bounded', () => {
    installFakeHermes();
    noteMemoryMark('baseline');
    expect(memoryTimeline()).toHaveLength(1);
    for (let i = 0; i < 50; i++) expect(noteMemoryMarkIfMoved()).toBe(false);
    expect(memoryTimeline()).toHaveLength(1);
  });

  it('⚠ a heap that HAS moved records exactly one row, then re-arms at the new level', () => {
    installFakeHermes();
    noteMemoryMark('baseline');                      // 40MB
    heapBytes = (40 + MEMORY_MARK_HEAP_DELTA_MB) * 1048576;
    expect(noteMemoryMarkIfMoved()).toBe(true);
    expect(noteMemoryMarkIfMoved()).toBe(false);     // re-armed at the new level
    expect(memoryTimeline()).toHaveLength(2);
    expect(memoryTimeline()[1]!.event).toBe('heap-move');
  });

  it('⚠ it moves in BOTH directions — a recovery is as much evidence as a spike', () => {
    installFakeHermes();
    heapBytes = 200 * 1048576;
    noteMemoryMark('peak');
    heapBytes = (200 - MEMORY_MARK_HEAP_DELTA_MB) * 1048576;
    expect(noteMemoryMarkIfMoved()).toBe(true);
    expect(memoryTimeline()[1]!.heapMb).toBe(200 - MEMORY_MARK_HEAP_DELTA_MB);
  });

  it('⚠⚠⚠ the module creates NO timer of its own — #3A may not become a daemon', () => {
    const SRC = read('app/diagnostics/memoryTimeline.ts');
    expect(SRC).not.toMatch(/setInterval|setTimeout|requestAnimationFrame|InteractionManager/);
    // …and the one periodic caller rides the freeze sampler that already existed.
    const WATCH = read('app/diagnostics/runtimePressureWatch.ts');
    expect(WATCH).toContain('noteMemoryMarkIfMoved()');
    // Exactly one setTimeout in the watch — the OTA-1172 sampler. No second one.
    expect((WATCH.match(/setTimeout\(/g) ?? []).length).toBe(2); // schedule + reschedule
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('OTA-1809 §G — the existing Qwen telemetry is preserved, not replaced', () => {
  it('⚠ every field Baker #7 relies on still reaches the sink', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const tel = require('../app/ai/generation/qwenTelemetry');
    let got: Record<string, unknown> | null = null;
    tel.setQwenTelemetrySink((r: Record<string, unknown>) => { got = r; });
    tel.recordQwenCall({
      job: 'ambient_fill', totalMs: 900, waitMs: 120, chars: 40, outcome: 'ok', at: Date.now(),
      prefillMs: 400, decodeMs: 300, promptTokens: 353, outTokens: 31, cachedTokens: 384,
      stop: 'limit', promptChars: 1495, jsLateMs: 0, threads: 4,
    });
    tel.setQwenTelemetrySink(null);
    expect(got).not.toBeNull();
    const r = got! as Record<string, unknown>;
    for (const k of ['job', 'waitMs', 'prefillMs', 'decodeMs', 'promptTokens', 'outTokens', 'cachedTokens', 'promptChars']) {
      expect(r[k]).toBeDefined();
    }
    expect(r.job).toBe('ambient_fill');
    expect(r.promptTokens).toBe(353);
  });

  it('the settlement mark carries the job and the outcome, so the two logs join', () => {
    noteMemoryMark('gen-settled', 'ambient_fill ok');
    const r = memoryTimeline()[0]!;
    expect(r.event).toBe('gen-settled');
    expect(r.note).toBe('ambient_fill ok');
  });

  it('⚠ and bootSlice marks from the sinks that already fired — no new plumbing', () => {
    const BOOT = read('app/state/slices/bootSlice.ts');
    expect(BOOT).toContain("noteMemoryMark('gen-settled'");
    expect(BOOT).toContain("noteMemoryMark('ctx-event')");
    // The existing lines are untouched: the qwen⏱ line and the ledger line both stay.
    expect(BOOT).toContain('qwen⏱ ${r.job} ${r.outcome}');
    expect(BOOT).toContain("setContextLedgerSink((line) => {");
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('OTA-1809 §I — the timeline actually reaches the bug report, and stays bounded', () => {
  it('⚠⚠ buildBasicDeviceSummary LOADS and carries the block', () => {
    // OTA-1174's standing lesson: when an OTA adds an import, at least one test
    // must EXECUTE the importer. This one does.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { buildBasicDeviceSummary } = require('../app/diagnostics/aboutSummary');
    installFakeHermes();
    noteMemoryMark('watch-start');
    const out = buildBasicDeviceSummary();
    expect(typeof out).toBe('string');
    expect(out).toContain('Memory timeline');
    expect(out).toContain('watch-start');
    // The blocks it sits beside are still there — this OTA added, it did not replace.
    expect(out).toContain('Runtime pressure');
    expect(out).toContain('Model contexts');
  });

  it('⚠ an overfilled ring cannot make the report unbounded', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { buildBasicDeviceSummary } = require('../app/diagnostics/aboutSummary');
    installFakeHermes();
    const small = buildBasicDeviceSummary().length;
    for (let i = 0; i < MEMORY_TIMELINE_MAX * 20; i++) noteMemoryMark(`e${i}`, 'x'.repeat(40));
    const big = buildBasicDeviceSummary().length;
    expect(big - small).toBeLessThan(32_768);
    expect(memoryTimeline()).toHaveLength(MEMORY_TIMELINE_MAX);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('OTA-1809 — #3A changed NOTHING about memory management', () => {
  it('⚠⚠⚠ the timeline module disposes, frees, reloads and schedules NOTHING', () => {
    const SRC = read('app/diagnostics/memoryTimeline.ts');
    for (const forbidden of ['dispose(', 'release(', 'gc(', 'initLlama', 'bootQwen', 'setState(']) {
      expect(SRC).not.toContain(forbidden);
    }
  });

  it('⚠⚠ the memory-warning handler still disposes, and the quiet window is unchanged', () => {
    const WATCH = read('app/diagnostics/runtimePressureWatch.ts');
    expect(WATCH).toContain('MEMORY_PRESSURE_QUIET_MS = 90_000');
    expect(WATCH).toContain('MEMORY_WARNINGS_BEFORE_STANDDOWN = 3');
    expect(WATCH).toContain('rpMemoryPressureUntil = Date.now() + MEMORY_PRESSURE_QUIET_MS');
    expect(WATCH).toContain('.dispose()');
  });

  it('⚠⚠ Baker #9 and Baker #13 are untouched by this OTA', () => {
    expect(read('app/ai/narration.ts')).toContain('shouldAbort: () => (get().currentScene?.enemies?.length ?? 0) > 0');
    expect(read('app/state/humanActivity.ts')).toContain('export function noteHumanInteraction');
  });

  it('⚠ the stamp is this OTA or later, and never goes backwards', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { OTA_BUILD_ID } = require('../app/buildInfo');
    const n = Number(/^\d{4}-\d{2}-\d{2}-(\d+)-/.exec(OTA_BUILD_ID)?.[1]);
    expect(Number.isFinite(n)).toBe(true);
    expect(n).toBeGreaterThanOrEqual(1809);
    expect(OTA_BUILD_ID).not.toMatch(/-1808-|-1807-/);
  });
});

// A compile-time reminder that the exported row type is the schema under test.
const _schemaWitness: MemoryMark = {
  at: 0, event: 'x', heapMb: null, gcMs: null, gcN: null,
  ctxLive: 0, ctxMb: 0, app: 'active', lane: 'idle', kind: null, q: 0, warns: 0,
};
void _schemaWitness;
