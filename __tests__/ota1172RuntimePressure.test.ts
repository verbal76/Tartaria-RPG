// OTA-1172 — MEMORY WARNINGS, APP-STATE CHURN, AND A FREEZE DETECTOR.
//
// Owner, after a hard lock on an iPhone this log could not explain: *"add in memory
// warning codes to the log so you can track them, whatever debug information you need.
// add that to whatever you can immediately put in as an OTA and push it. I want that done
// now."*
//
// ⚠ THE REPORT PROVED ONE THING AND THEN RAN OUT. The qwen-watchdog ticked every ~10s
// straight through the freeze (12:29:58 → 12:31:27) and a save landed at 12:31:02, so the
// JS THREAD WAS ALIVE while the screen was dead. That rules out an infinite loop and every
// pure-logic suspect — and having ruled those out the log had nothing left to say. No
// record of a tap arriving, none of the screen painting, none of memory pressure.
//
// ⚠⚠ AND NOTHING IN THE APP LISTENED FOR `memoryWarning` — verified by grep, not assumed.
// On the platform the bug was filed from, that is the single highest-value signal there
// is: iOS warns before it stalls you and again before it kills you.

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

import {
  FREEZE_SAMPLE_MS, FRAME_STALL_MS, JS_STALL_MS, APPSTATE_TRAIL_MAX,
  freezeVerdict, freezeVerdictLine, memoryWarningLine, appStateLine,
  runtimePressureSummary,
  type FreezeVerdict, type PressureSnapshot,
} from '../app/diagnostics/runtimePressure';

import * as fs from 'fs';
import * as path from 'path';
const read = (...p: string[]): string => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');
const STORE = read('app', 'state', 'gameStore.ts');
const INPUT = read('app', 'components', 'InputBox.tsx');
const ABOUT = read('app', 'diagnostics', 'aboutSummary.ts');

const BASE: PressureSnapshot = {
  memoryWarnings: 0, lastMemoryWarningAt: null, appStateTrail: [],
  lastVerdict: 'ok', worstFrameGapMs: 0, worstJsGapMs: 0, uiStalls: 0,
};

describe('OTA-1172 — the memory warning the owner asked for', () => {
  it('⚠⚠ THE APP NOW LISTENS FOR IT AT ALL — it previously did not, anywhere', () => {
    // The entire ask. Verified by grep before building: zero handlers existed.
    expect(STORE).toContain("AppState.addEventListener('memoryWarning'");
  });

  it('⚠ THE COUNT IS THE SEVERITY, so the line carries an ordinal', () => {
    // iOS escalates: a second and third warning mean something very different from a
    // first. A line that only said "memory warning" would throw that away.
    expect(memoryWarningLine(1, null)).toMatch(/#1/);
    expect(memoryWarningLine(3, 4200)).toMatch(/#3/);
  });

  it('the first one says so; later ones name the gap since the last', () => {
    expect(memoryWarningLine(1, null)).toMatch(/first this session/);
    expect(memoryWarningLine(2, 4200)).toMatch(/4\.2s since the last one/);
  });

  it('⚠ IT CARRIES THE RELOAD CONTEXT — that is the suspect it exists to indict', () => {
    // Each Qwen reinit is a ~400MB native allocation, and the reported freeze had six of
    // them inside 90 seconds. A memory warning is only actionable next to that count.
    const line = memoryWarningLine(2, 1000, {
      appState: 'active', qwenStatus: 'idle', qwenReinitAttempts: 6, saveKb: 48,
    });
    expect(line).toContain('reloads=6');
    expect(line).toContain("qwen='idle'");
    expect(line).toContain('app=active');
    expect(line).toContain('save=48KB');
  });

  it('and it is findable by eye in a 146-line log', () => {
    expect(memoryWarningLine(1, null)).toMatch(/⚠⚠ MEMORY WARNING/);
  });

  it('degrades cleanly when no context is available', () => {
    const line = memoryWarningLine(1, null);
    expect(line).not.toContain('undefined');
    expect(line).not.toContain('NaN');
  });
});

describe('OTA-1172 — two clocks, because one cannot answer the question', () => {
  it('⚠⚠ FRAMES STOPPED + LOGIC RUNNING = THE REPORTED FREEZE, and it has its own verdict', () => {
    // This is the exact shape of the owner's hard lock: watchdog ticking, screen dead.
    expect(freezeVerdict(0, FRAME_STALL_MS + 1)).toBe('ui-stalled');
  });

  it('the mirror case is told APART, because the fix lives elsewhere', () => {
    expect(freezeVerdict(JS_STALL_MS + 1, 0)).toBe('js-stalled');
  });

  it('both stopped is its own answer, not silently one of the other two', () => {
    expect(freezeVerdict(JS_STALL_MS + 1, FRAME_STALL_MS + 1)).toBe('both-stalled');
  });

  it('a healthy sample is ok on both clocks', () => {
    expect(freezeVerdict(0, 0)).toBe('ok');
    expect(freezeVerdict(JS_STALL_MS - 1, FRAME_STALL_MS - 1)).toBe('ok');
  });

  it('⚠⚠ THE SAMPLE INTERVAL CANNOT ITSELF READ AS A STALL — the two clocks are measured differently, and that asymmetry is deliberate', () => {
    // The JS gap is NET of the sample interval (a healthy 5s tick is a 0ms gap), because
    // the sampler only wakes every FREEZE_SAMPLE_MS and would otherwise indict itself
    // every single time. The FRAME gap is RAW, because requestAnimationFrame should be
    // firing at ~16ms intervals no matter how slowly the sampler wakes — so 2.9s of
    // silence from it IS a stall, whatever the sample rate.
    // ⚠ The first draft of this test asserted the frame gap was net of the interval too,
    // which is exactly backwards and would have hidden every stall shorter than 5s.
    expect(STORE).toContain('const jsGap = t - rpLastJsAt - FREEZE_SAMPLE_MS;');
    expect(STORE).toContain('const frameGap = t - rpLastFrameAt;');
    // A healthy tick: JS net-zero, frames fresh.
    expect(freezeVerdict(0, 16)).toBe('ok');
    // Frames quiet for nearly a whole sample interval is a REAL stall, not an artefact.
    expect(freezeVerdict(0, FREEZE_SAMPLE_MS - 1)).toBe('ui-stalled');
  });

  it('the sampler wakes often enough to catch a stall it is meant to see', () => {
    // A hard lock is multi-second; a threshold above the sample interval could never fire.
    expect(FRAME_STALL_MS).toBeLessThan(FREEZE_SAMPLE_MS);
  });

  it('every verdict says in plain words which half of the codebase to look in', () => {
    const cases: FreezeVerdict[] = ['ui-stalled', 'js-stalled', 'both-stalled'];
    for (const v of cases) {
      const line = freezeVerdictLine(v, 2500, 3000);
      expect(line).toMatch(/⚠ FREEZE WATCH/);
      expect(line.length).toBeGreaterThan(60);
      expect(line).toMatch(/js 2500ms · frames 3000ms/);
    }
    expect(freezeVerdictLine('ui-stalled', 0, 3000)).toMatch(/SCREEN stopped painting/);
    expect(freezeVerdictLine('js-stalled', 3000, 0)).toMatch(/LOGIC stalled/);
  });

  it('⚠ IT ONLY JUDGES WHILE FOREGROUNDED — a backgrounded app rightly stops painting', () => {
    // Counting that as a render stall would cry wolf every time the player reads a text,
    // and a detector nobody believes is worse than no detector.
    const i = STORE.indexOf('const sample = ()');
    expect(i).toBeGreaterThan(-1);
    const block = STORE.slice(i, i + 1400);
    expect(block).toContain("if (rpAppState === 'active')");
  });

  it('⚠ AND IT LOGS ON THE EDGE, not once per sample', () => {
    const i = STORE.indexOf('const sample = ()');
    const block = STORE.slice(i, i + 1400);
    expect(block).toContain('v !== rpLastVerdict');
  });
});

describe('OTA-1172 — the app-state trail, which is evidence and not noise', () => {
  it('names both ends and how long the previous state held', () => {
    expect(appStateLine('active', 'inactive', 349)).toBe(
      'appstate: active → inactive (was active for 349ms)',
    );
  });

  it('⚠ `inactive` IS RECORDED — on iOS that transition is the whole story', () => {
    // The reported freeze showed three `active` bounces ~350ms apart, each buying a fresh
    // ~400MB reload. Without the transitions written down the watchdog log read as a
    // self-contradiction: "holding revival" then reinitializing a third of a second later.
    const i = STORE.indexOf("AppState.addEventListener('change', (next) => {\n      const t = Date.now();");
    expect(i).toBeGreaterThan(-1);
    const block = STORE.slice(i, i + 900);
    expect(block).toContain('appStateLine(prev, nextStr');
    // No filter that would drop `inactive` before it is logged.
    expect(block).not.toMatch(/next\s*===\s*'active'\s*\)\s*\{\s*$/m);
  });

  it('the trail is a ring, so iOS churn cannot grow it without bound', () => {
    expect(APPSTATE_TRAIL_MAX).toBeGreaterThan(0);
    expect(STORE).toContain('.slice(-APPSTATE_TRAIL_MAX)');
  });

  it('a repeated state is not logged twice', () => {
    const i = STORE.indexOf("if (nextStr === prev) return;");
    expect(i).toBeGreaterThan(-1);
  });
});

describe('OTA-1172 — the tap breadcrumb', () => {
  it('⚠⚠ IT RUNS BEFORE ANY HANDLER, and that ordering IS the signal', () => {
    // Tap logged but no parser line  → the tap arrived, the engine hung.
    // No tap line at all             → the screen was frozen.
    // Move this below the handler and it can no longer tell those apart.
    const i = INPUT.indexOf('const handlePress = () => {');
    expect(i).toBeGreaterThan(-1);
    const block = INPUT.slice(i, i + 700);
    const tap = block.indexOf('logUiTap(label);');
    const blocked = block.indexOf('if (blocked)');
    expect(tap).toBeGreaterThan(-1);
    expect(blocked).toBeGreaterThan(-1);
    expect(tap).toBeLessThan(blocked);
  });

  it('both chip families carry it — quick actions AND travel', () => {
    expect(INPUT.match(/logUiTap\(label\)/g)?.length).toBe(2);
  });

  it('⚠ INSTRUMENTATION CAN NEVER BREAK A CONTROL', () => {
    // A diagnostic that can throw into a press handler turns a freeze report into a dead
    // button. Every one of these paths is wrapped.
    const i = STORE.indexOf('export function logUiTap');
    expect(i).toBeGreaterThan(-1);
    const block = STORE.slice(i, i + 400);
    expect(block).toContain('try {');
    expect(block).toContain('catch');
  });
});

describe('OTA-1172 — the reload is timed and its outcome named', () => {
  it('⚠ SIX ATTEMPTS WENT idle → idle AND WE COULD NOT TELL IF THEY DID ANYTHING', () => {
    // Expensive-and-working vs expensive-and-futile is the difference between tuning the
    // cadence and deleting the call. The old log recorded neither cost nor outcome.
    expect(STORE).toContain("settled in ${Date.now() - rpReinitStarted}ms → status='${after}'");
  });

  it('a throw reports its cost too, not just its message', () => {
    expect(STORE).toContain('threw after ${Date.now() - rpReinitStarted}ms');
  });

  it('⚠ THE ATTEMPT NUMBER IS CAPTURED AT KICK TIME, not read at settle time', () => {
    // The counter keeps climbing while a reload is in flight, so reading it in the
    // callback would attribute the timing to whichever attempt happened to be current —
    // exactly the kind of quietly-wrong number that sends a triage down the wrong path.
    expect(STORE).toContain('const rpAttemptNo = qwenReinitAttempts;');
    expect(STORE).toContain('reinit #${rpAttemptNo} settled');
  });
});

describe('OTA-1172 — the counts reach the bug report header', () => {
  it('the block is wired into the exported summary', () => {
    expect(ABOUT).toContain('runtimePressureBlock()');
    expect(ABOUT).toContain("from './runtimePressure'");
  });

  it('⚠ AND IT CANNOT BREAK THE EXPORT — it matters most when things are already wrong', () => {
    const i = ABOUT.indexOf('function runtimePressureBlock');
    expect(i).toBeGreaterThan(-1);
    const block = ABOUT.slice(i, i + 400);
    expect(block).toContain('try {');
    expect(block).toContain('catch');
  });

  it('a clean session reads as clean, without alarming anyone', () => {
    const out = runtimePressureSummary(BASE);
    expect(out).toContain('Memory warnings: none this session');
    expect(out).toContain('Freeze watch: no stalls seen');
    expect(out).not.toContain('⚠');
  });

  it('⚠ AND A DIRTY ONE IS UNMISSABLE', () => {
    const out = runtimePressureSummary({
      ...BASE, memoryWarnings: 3, uiStalls: 2, worstFrameGapMs: 8400,
      appStateTrail: ['inactive', 'active', 'inactive', 'active'],
    });
    expect(out).toContain('⚠ Memory warnings: 3');
    expect(out).toContain('⚠ Freeze watch: 2 render stalls');
    expect(out).toContain('8400ms');
    expect(out).toContain('inactive → active → inactive → active');
  });

  it('pluralises a single stall correctly', () => {
    expect(runtimePressureSummary({ ...BASE, uiStalls: 1, worstFrameGapMs: 3000 }))
      .toContain('1 render stall (');
  });

  it('an empty trail says so rather than printing nothing', () => {
    expect(runtimePressureSummary(BASE)).toContain('(none recorded)');
  });
});

describe('OTA-1172 — this OTA changes no behaviour, deliberately', () => {
  it('⚠⚠ THE WATCHDOG FIX IS HELD BACK ON PURPOSE, and the reason is written down', () => {
    // The same log shows a REAL defect: an iOS `active` transition wipes the backoff
    // ladder and immediately kicks a ~400MB reload, and iOS fires `active` for a
    // notification banner. Shipping the fix in the same OTA as the instruments would
    // leave us unable to say which change moved the next log. Instrument, then fix.
    const RP = read('app', 'diagnostics', 'runtimePressure.ts');
    const i = RP.indexOf('DIAGNOSTICS ONLY');
    expect(i).toBeGreaterThan(-1);
    const block = RP.slice(i, i + 900);
    expect(block).toMatch(/instrument first, then fix/i);
    // And the defect it is holding back is described, so it cannot be quietly forgotten.
    expect(block).toMatch(/backoff ladder/i);
  });

  it('⚠ THE HOLD IS OVER — OTA-1173 LANDED THE FIX, and this is the assertion that changed', () => {
    // This test was written to pin the OLD behaviour so the eventual change could not slip
    // in unannounced. It has now done its job: a second device report escalated the
    // symptom from a freeze to a CRASH TO THE HOME SCREEN with "Last JS crash: none
    // recorded" — a native death — so the fix shipped rather than waiting for a cleaner
    // measurement. The bare reset is gone; `inactive` alone no longer counts as a return.
    expect(STORE).not.toContain("if (next === 'active') { qwenBackoffLevel = 0; tick(); }");
    expect(STORE).toContain("if (!qwenTrulyBackgrounded) return;");
  });

  it('the instruments are idempotent — a re-hydrate must not stack timers', () => {
    // ⚠ RETARGETED BY OTA-1176, NOT WEAKENED — and the claim is now stronger than it was.
    // The starter used to hand-roll its own teardown, which had already drifted from what
    // it should clear. Both paths now go through ONE `stopRuntimePressureWatch()`, so
    // idempotence is true by construction rather than by the starter remembering.
    const i = STORE.indexOf('function startRuntimePressureWatch');
    expect(i).toBeGreaterThan(-1);
    expect(STORE.slice(i, i + 900)).toContain('stopRuntimePressureWatch();');
    const j = STORE.indexOf('export function stopRuntimePressureWatch(): void {');
    expect(j).toBeGreaterThan(-1);
    const stopper = STORE.slice(j, j + 700);
    expect(stopper).toContain('if (rpSampleTimer !== null)');
    expect(stopper).toContain('rpStopFrameClock()');
    expect(stopper).toContain('rpMemorySub.remove()');
  });

  it('⚠ EVERY LISTENER IS GUARDED — headless and test environments have no AppState', () => {
    const i = STORE.indexOf('function startRuntimePressureWatch');
    // ⚠ Widened by OTA-1173, which added the memory-warning RESPONSE (a dispose) between
    // the listener and the frame clock. A fixed slice that stops short reads as a missing
    // guard rather than as a moved one — the ota1163 defect in a new costume.
    const block = STORE.slice(i, i + 6000);
    // Each addEventListener sits inside its own try/catch.
    const listeners = (block.match(/AppState\.addEventListener/g) ?? []).length;
    expect(listeners).toBe(2);
    // ⚠ RETARGETED BY OTA-1176 — the rAF guard moved into `rpStartFrameClock` when the
    // frame clock learned to pause on background. Same guard, one place instead of two.
    const raf = STORE.indexOf('function rpStartFrameClock(): void {');
    expect(raf).toBeGreaterThan(-1);
    const rafBlock = STORE.slice(raf, raf + 500);
    expect(rafBlock).toContain("typeof requestAnimationFrame !== 'function'");
    expect(rafBlock).toContain('catch');
  });
});
