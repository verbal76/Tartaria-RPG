/**
 * OTA-1392 — SLICE 1 of the gameStore split, and the rules every later slice
 * has to follow.
 *
 * `gameStore.ts` was 45,050 lines, 76 exports, imported by 473 files, with one
 * `create<GameStore>(...)` call accounting for ~28,000 of them. `persist()` is
 * the first piece taken out.
 *
 * ⚠⚠ THE MEASUREMENT THAT SET THE SHAPE. Before cutting anything: the
 * save/system cluster is 2,144 lines referencing 48 module-level symbols, 40 of
 * them unexported — and **eight are mutable `let` variables**. You cannot assign
 * to an imported binding from another module, so a slice cannot leave its
 * mutable state behind, and must not steal state others share. The file does not
 * cut along "save / combat / items". It cuts along **who owns the mutable
 * state**, and `persist()` is the one clean island: its four `let`s and four
 * constants are referenced by nothing else in the file.
 *
 * ⚠⚠ THIS SUITE IS A POLICY, NOT A SNAPSHOT. Most of what follows walks
 * `app/state/slices/` and applies the rules to whatever is there, so slice 2
 * inherits them without anyone remembering to add a test. The one rule that
 * matters more than the rest:
 *
 *     A slice may take FROM the store. It may never reach back INTO it.
 *
 * A value import from gameStore inside a slice compiles, passes a unit test that
 * imports only one side, and then resolves to `undefined` at module-init on a
 * device — `makeRoomKey is not a function`, or a save log that silently stops
 * being capped. Nothing about that failure is visible in CI, which is exactly
 * why it is asserted here rather than trusted.
 *
 * ⚠ BEHAVIOUR IS PROVEN ELSEWHERE, ON PURPOSE. persistCoalescing,
 * persistIntegrityGuard, saveSizeWarning, logCapPersist, atomicSaveWrites and
 * ota1012PersistLeakRootCause — 22 tests — already covered this code before it
 * moved and cover it unchanged afterwards. That is the real proof the move was
 * faithful; re-testing the behaviour here would only assert it twice.
 */
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';

const path = (...p: string[]) => join(__dirname, '..', ...p);
const src = (...p: string[]) => readFileSync(path(...p), 'utf8');

const SLICE_DIR = path('app', 'state', 'slices');
const sliceFiles = existsSync(SLICE_DIR)
  ? readdirSync(SLICE_DIR).filter((f) => f.endsWith('.ts') && !f.endsWith('.d.ts'))
  : [];

const store = src('app', 'state', 'gameStore.ts');

describe('OTA-1392 — the rule every slice must follow', () => {
  it('there is at least one slice, or this suite is asserting nothing', () => {
    expect(sliceFiles.length).toBeGreaterThan(0);
  });

  it.each(sliceFiles)('%s imports NO VALUE from gameStore', (f) => {
    // ⚠⚠ THE LOAD-BEARING ASSERTION. gameStore imports the slice to build the
    // store; a value import back the other way is a cycle, and a cycle resolves
    // to `undefined` for whichever module the bundler reaches second. It does not
    // throw at import time — it throws later, on a device, in a code path a unit
    // test that imports one side never reaches.
    const body = src('app', 'state', 'slices', f);
    for (const line of body.split('\n')) {
      if (!/from\s+['"]\.\.\/gameStore['"]/.test(line)) continue;
      // `import type { ... }` is erased at compile time and is fine.
      expect(line.trim().startsWith('import type ')).toBe(true);
    }
  });

  it.each(sliceFiles)('%s is actually spread into the store', (f) => {
    // A slice file nobody wires in is dead code that still looks like progress.
    const body = src('app', 'state', 'slices', f);
    const factory = /export const (create\w+Slice)/.exec(body)?.[1];
    expect(factory).toBeTruthy();
    expect(store).toContain(`...${factory}(set, get`);
    expect(store).toContain(`from './slices/${f.replace(/\.ts$/, '')}'`);
  });

  it.each(sliceFiles)('%s carries its own mutable state', (f) => {
    // The whole reason the split follows state ownership. If a slice declares a
    // `let`, that name must not also be declared at module scope in gameStore —
    // two independent copies of one guard is worse than either arrangement.
    const body = src('app', 'state', 'slices', f);
    const lets = [...body.matchAll(/^let\s+([A-Za-z_$][\w$]*)/gm)].map((m) => m[1]);
    for (const name of lets) {
      expect(store).not.toMatch(new RegExp(`^let\\s+${name}\\b`, 'm'));
    }
  });
});

describe('OTA-1392 — persist moved whole, and its state went with it', () => {
  const slice = src('app', 'state', 'slices', 'persistSlice.ts');

  it('⚠⚠ the store still exposes persist with the same contract', () => {
    // 473 files import useGameStore. The point of the slice pattern is that not
    // one of them changes: same key, same name, same type on the same object.
    expect(store).toContain('  persist: () => Promise<boolean>;');
    expect(store).toContain('...createPersistSlice(set, get, { makeRoomKey, noteSaveKb }),');
  });

  it('⚠⚠ all four pieces of persist state left gameStore', () => {
    for (const name of [
      'persistInFlight',
      'persistTrailingQueued',
      'persistSizeSampleCounter',
      'saveSizeWarnedThisSession',
    ]) {
      expect(slice).toMatch(new RegExp(`^let\\s+${name}\\b`, 'm'));
      expect(store).not.toMatch(new RegExp(`^let\\s+${name}\\b`, 'm'));
    }
  });

  it('⚠ …and so did the constants only it used', () => {
    for (const name of [
      'PERSIST_SIZE_SAMPLE_EVERY',
      'SAVE_SIZE_WARN_FRACTION',
      'SAVE_SIZE_CLEAR_FRACTION',
    ]) {
      expect(slice).toContain(`const ${name} =`);
      expect(store).not.toMatch(new RegExp(`^const\\s+${name}\\b`, 'm'));
    }
  });

  it('⚠⚠ the three guards that make persist safe are intact, word for word', () => {
    // This function protects the save file. Each of these was written after a
    // specific failure; a move that quietly dropped one would look like a clean
    // refactor and cost somebody their character.
    // OTA-627 — concurrency coalescing (the AsyncStorage write storm / ANR).
    expect(slice).toContain('if (persistInFlight) {');
    expect(slice).toContain('persistTrailingQueued = true;');
    // The null-player guard (saves that lost the character record).
    expect(slice).toContain('if (!player) return false;');
    // OTA-368 — structural integrity (refuse to overwrite with a stub record).
    expect(slice).toContain('if (!player.name || !player.raceId || !player.stats) {');
    expect(slice).toContain('left intact');
  });

  it('⚠ the drain cap survived — it is the anti-livelock valve', () => {
    expect(slice).toContain('while (persistTrailingQueued && drained < 64)');
  });
});

describe('OTA-1392 — the shared constant moved DOWN, not sideways', () => {
  it('⚠⚠ MAX_LOG_IN_MEMORY lives in a leaf both sides import', () => {
    // It is used by the moved persist path AND by eight places still in
    // gameStore. Leaving it in gameStore would have forced the slice to import a
    // value from it — the cycle above. Moving it down to a module neither owns
    // is the general answer whenever a slice and the store share a value.
    expect(existsSync(path('app', 'state', 'saveLimits.ts'))).toBe(true);
    expect(src('app', 'state', 'saveLimits.ts')).toContain('export const MAX_LOG_IN_MEMORY = 500;');
    expect(store).toContain("import { MAX_LOG_IN_MEMORY } from './saveLimits';");
    expect(src('app', 'state', 'slices', 'persistSlice.ts'))
      .toContain("import { MAX_LOG_IN_MEMORY } from '../saveLimits';");
  });

  it('⚠⚠ and it is declared in exactly ONE place', () => {
    // Two copies would drift, and the drift would be invisible: the store would
    // keep 500 lines in memory while the save wrote a different number of them.
    expect(store).not.toMatch(/^const MAX_LOG_IN_MEMORY\b/m);
  });

  it('⚠ the cost of getting this wrong is written down where it happened', () => {
    // `gameLog.slice(-undefined)` returns the WHOLE array. An uncapped save that
    // grows forever, with nothing thrown and nothing logged.
    const limits = src('app', 'state', 'saveLimits.ts');
    expect(limits).toContain('slice(-undefined)');
    expect(limits).toContain('quietly stop being capped');
  });
});

describe('OTA-1392 — source pins follow the code they pin', () => {
  /**
   * ⚠⚠ THE MOVE BROKE A TEST, AND THAT WAS THE SYSTEM WORKING.
   *
   * `ota1292LoreBackStaysInGame` pins persist's null-player and stub-player
   * guards by reading `gameStore.ts` as text — those two lines are what stops a
   * navigation bug overwriting a real save with an empty record. When persist
   * moved, the pin pointed at a file that no longer contained it and went red.
   *
   * The tempting fix is to relax the assertion. That would leave a test that
   * passes and pins nothing. The right fix is to re-point it, which is what
   * happened — and this check makes the same mistake loud for every later slice.
   */
  const persistInternals = [
    'if (!player) return false;',
    'if (!player.name || !player.raceId || !player.stats) {',
    'while (persistTrailingQueued && drained < 64)',
  ];

  it('⚠⚠ no suite still pins a persist internal against gameStore.ts', () => {
    const offenders: string[] = [];
    for (const f of readdirSync(path('__tests__'))) {
      if (!/\.tsx?$/.test(f)) continue;
      const body = src('__tests__', f);
      // only suites that read gameStore's source can be wrong in this way
      if (!/['"]gameStore\.ts['"]/.test(body)) continue;
      for (const needle of persistInternals) {
        // the assertion and the gameStore read have to be about each other; a
        // suite that reads BOTH files and asserts the needle against the slice
        // is fine, so require the needle to appear without persistSlice nearby
        if (body.includes(needle) && !/persistSlice\.ts/.test(body)) {
          offenders.push(`${f}: ${needle}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe('OTA-1392 — what the move bought', () => {
  it('gameStore is smaller, and measurably so', () => {
    // Not a vanity metric: the reason this file is hard to work in is that no
    // one part of it can be read alone. Every line that leaves is a line that
    // now has a smaller neighbourhood.
    expect(store.split('\n').length).toBeLessThan(45050);
  });

  it('⚠ persist state is now resettable between tests, which it never was', () => {
    // The one capability the move adds. Inside gameStore this state was module
    // scope with no handle on it, so a suite that tripped the size warning
    // silently suppressed it for every later suite in the same worker.
    const slice = src('app', 'state', 'slices', 'persistSlice.ts');
    expect(slice).toContain('export function _resetPersistStateForTest()');
    expect(slice).toContain('export function _persistStateForTest()');
  });

  it('⚠⚠ the move changed no behaviour, and says which suites prove it', () => {
    // A refactor that also edits is a refactor you cannot review. The header
    // names the six existing suites that covered this code before and after.
    const slice = src('app', 'state', 'slices', 'persistSlice.ts');
    expect(slice).toContain('WHAT DID NOT CHANGE');
    expect(slice).toContain('does not improve it');
  });
});
