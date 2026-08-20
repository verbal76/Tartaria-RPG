/**
 * OTA-1393 — SLICE 2: the AI engines move down, and their lifecycle follows.
 *
 * Two steps, and the order between them is the whole lesson.
 *
 * ⚠⚠ STEP ONE — THE SINGLETONS MOVED DOWN. `cognitive` and `qwen` were
 * constructed at module scope inside `gameStore.ts`, where they are referenced
 * 28 and 73 times. No slice could reach them: gameStore imports every slice, so
 * a slice importing a value back is a cycle, and a cycle resolves to `undefined`
 * for whichever module the bundler reaches second. `qwen.isReady is not a
 * function`, on a device, in a path a one-sided unit test never runs. They now
 * live in `app/ai/engines.ts`, a leaf both sides import — the same answer
 * `saveLimits.ts` gave for `MAX_LOG_IN_MEMORY` in slice 1.
 *
 * ⚠⚠ AND IT WAS ONLY SAFE BECAUSE THE CONSTRUCTORS DO NOTHING. Moving a
 * module-scope singleton changes WHEN it is constructed relative to everything
 * else. Checked before moving, not after: `QwenGenerativeEngine` has no
 * constructor at all, and `CognitiveOrchestrator`'s allocates four sub-objects
 * whose constructors were each read — no I/O, no native calls, no timers. Every
 * expensive thing sits behind an explicit `boot()` / `initialize()`. If any of
 * that had been false, the move would have shifted boot behaviour on a phone and
 * shown up as a crash report rather than a red suite.
 *
 * ⚠ STEP TWO — the five lifecycle actions followed into
 * `slices/aiLifecycleSlice.ts`. They could not have gone first.
 *
 * ⚠ BEHAVIOUR IS PROVEN ELSEWHERE, as in slice 1: qwenWatchdog,
 * ota1084QwenWatchdogBackoff, ota1105QwenTelemetry, ota1180QwenSuccessIsChecked,
 * mlHealthQwenRetry, mlHealthQwenFalseDisable, qwenForceReinit,
 * qwenCompletionGuard and ota1278WatchdogRespectsDebounce — 56 tests — covered
 * this code before the move and cover it unchanged after.
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const path = (...p: string[]) => join(__dirname, '..', ...p);
const src = (...p: string[]) => readFileSync(path(...p), 'utf8');

const store = src('app', 'state', 'gameStore.ts');
const engines = src('app', 'ai', 'engines.ts');
const slice = src('app', 'state', 'slices', 'aiLifecycleSlice.ts');

describe('OTA-1393 — the engines live in a leaf, and there is exactly one of each', () => {
  it('⚠⚠ app/ai/engines.ts is the ONLY place either engine is constructed', () => {
    // Two instances would mean two multi-hundred-MB model loads on a phone whose
    // signature crash is an out-of-memory kill. This is the assertion that keeps
    // "just import the class and new it up" from ever looking reasonable.
    expect(engines).toContain('export const cognitive = new CognitiveOrchestrator();');
    expect(engines).toContain('export const qwen = new QwenGenerativeEngine();');
    expect(store).not.toContain('new CognitiveOrchestrator()');
    expect(store).not.toContain('new QwenGenerativeEngine()');
    expect(slice).not.toContain('new CognitiveOrchestrator()');
    expect(slice).not.toContain('new QwenGenerativeEngine()');
  });

  it('⚠ both the store and the slice import them from that one place', () => {
    expect(store).toContain("import { cognitive, qwen } from '../ai/engines';");
    expect(slice).toContain("import { cognitive, qwen } from '../../ai/engines';");
  });

  it('⚠⚠ engines.ts records WHY the move was safe, with the check that made it so', () => {
    // The next person to touch this needs to know the constructors were read,
    // not assumed — because if one ever grows a side effect, the reasoning that
    // permitted this file stops holding.
    expect(engines).toContain('WHY MOVING THEM IS SAFE');
    expect(engines).toContain('has no constructor at all');
    expect(engines).toContain('All four were read: no I/O, no native calls, no');
  });

  it('⚠ engines.ts imports nothing from state — it is a leaf', () => {
    // A leaf that reached back into the store would be the same cycle wearing a
    // different name.
    expect(engines).not.toMatch(/from\s+['"].*state\//);
  });
});

describe('OTA-1393 — the five lifecycle actions moved, and one deliberately did not', () => {
  const MOVED = [
    'bootCognitive',
    'shutdownCognitive',
    'resumeCognitive',
    'bootQwen',
    'shutdownQwen',
  ];

  it.each(MOVED)('%s lives in the slice, not in gameStore', (name) => {
    expect(slice).toMatch(new RegExp(`^  async ${name}\\(\\)`, 'm'));
    expect(store).not.toMatch(new RegExp(`^  async ${name}\\(\\)`, 'm'));
  });

  it('⚠ the store still declares all five, so no consumer changes', () => {
    for (const name of MOVED) {
      expect(store).toContain(`  ${name}: () => Promise<void>;`);
    }
    expect(store).toContain('...createAiLifecycleSlice(set, get, { startQwenWatchdog, startRuntimePressureWatch }),');
  });

  it('⚠⚠ cancelGeneration STAYED, and the reason is written down', () => {
    // It reads as part of this family and is not. It mutates
    // `arbiterGenerationEpoch`, a `let` shared with the narration path — moving
    // it would strand that variable here (assigning to an imported binding is a
    // compile error) or steal it from narration. It travels with the narration
    // slice, where the epoch counter can move as one piece.
    expect(store).toMatch(/^  cancelGeneration\(\) \{/m);
    // ⚠ Checked as an IMPLEMENTATION, not as a word: the slice's header names
    // cancelGeneration precisely to say why it was left behind, and a blanket
    // not.toContain would forbid explaining the decision.
    expect(slice).not.toMatch(/^  cancelGeneration\(\)/m);
    expect(slice).toContain('WHY THESE FIVE AND NOT SIX');
    expect(store).toMatch(/^let arbiterGenerationEpoch/m);
    expect(store).toContain('it would strand that variable or steal it');
  });
});

describe('OTA-1393 — the watchdogs are handed in, not imported', () => {
  it('⚠⚠ the slice takes them as deps', () => {
    // Importing them from gameStore would compile and then call `undefined` the
    // first time an engine finished loading — on a phone, after a multi-minute
    // download, in the exact path nobody re-runs to reproduce.
    expect(slice).toContain('startQwenWatchdog: (get: () => GameStore, set: SetState) => void;');
    expect(slice).toContain('deps.startQwenWatchdog(get, set);');
    expect(slice).toContain('deps.startRuntimePressureWatch(get, set);');
  });

  it('⚠ and they are still defined in gameStore', () => {
    // ⚠ OTA-1395 — `startRuntimePressureWatch` picked up an `export` when slice 4
    // needed its TYPE (`typeof Store.fn`). The word matters here: it is exported
    // so a slice can be TYPED against it, not so a slice can IMPORT it — that is
    // still forbidden, and ota1392 enforces it directory-wide.
    expect(store).toMatch(/^(export )?function startQwenWatchdog\(/m);
    expect(store).toMatch(/^(export )?function startRuntimePressureWatch\(/m);
  });

  it('⚠⚠ the slice imports NO value from gameStore', () => {
    // The rule slice 1 established, restated for this file specifically. The
    // generic version in ota1392StoreSlices walks the whole slices/ directory.
    for (const line of slice.split('\n')) {
      if (!/from\s+['"]\.\.\/gameStore['"]/.test(line)) continue;
      expect(line.trim().startsWith('import type ')).toBe(true);
    }
  });
});

describe('OTA-1393 — the diagnostics that make a failed model load explainable', () => {
  it('⚠⚠ bootQwen still says WHY it failed, in the log', () => {
    // OTA-1182. The failure reason used to live only in the bug-report header,
    // which requires a player to get far enough to file one — and a tester who
    // never files is the common case. This is the single line that distinguishes
    // "narration engine missing" from "out of memory" from "out of disk", and it
    // ships with any report, including one about something else.
    expect(slice).toContain('qwen: LOAD FAILED —');
    expect(slice).toContain('qwen: LOAD THREW —');
  });

  it('⚠ …and the throwing path is still separate from the swallowing one', () => {
    // `initialize()` mostly swallows and sets its own status; a missing native
    // module throws outright, and that is the one answer no OTA can fix — it
    // means llama.rn is not in the installed build.
    expect(slice).toContain('if (qwen.isReady()) {');
    expect(slice).toContain('qwen.getLastError() ?? ');
  });

  it('⚠ the watchdog and the pressure instruments still start together', () => {
    // Same lifecycle, same teardown rules — starting one without the other is
    // how you get an instrument that reports on a thing nobody is nursing.
    const i = slice.indexOf('deps.startQwenWatchdog(get, set);');
    const j = slice.indexOf('deps.startRuntimePressureWatch(get, set);');
    expect(i).toBeGreaterThan(0);
    expect(j).toBeGreaterThan(i);
    expect(j - i).toBeLessThan(400);
  });
});

describe('OTA-1393 — the split is measurably progressing', () => {
  it('gameStore keeps shrinking', () => {
    // 45,050 at the start of Part 4; 44,891 after slice 1.
    expect(store.split('\n').length).toBeLessThan(44891);
  });

  it('⚠ there are now two slices, and the policy suite covers both automatically', () => {
    expect(existsSync(path('app', 'state', 'slices', 'persistSlice.ts'))).toBe(true);
    expect(existsSync(path('app', 'state', 'slices', 'aiLifecycleSlice.ts'))).toBe(true);
    // ota1392StoreSlices walks the directory rather than naming files, so slice 2
    // inherited every rule without anyone remembering to add it.
    expect(src('__tests__', 'ota1392StoreSlices.test.ts')).toContain('readdirSync(SLICE_DIR)');
  });
});
