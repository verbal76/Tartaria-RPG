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
    expect(store).toContain("...createPersistSlice(set, get, { makeRoomKey }),");
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
   * ⚠⚠ THE MOVE BROKE TESTS, AND THAT WAS THE SYSTEM WORKING.
   *
   * Slice 1 broke `ota1292LoreBackStaysInGame`, which pins persist's
   * null-player and stub-player guards by reading `gameStore.ts` as TEXT — the
   * two lines that stop a navigation bug overwriting a real save with an empty
   * record. Slice 2 broke `ota1180QwenSuccessIsChecked` and
   * `ota1182AppleSignal` the same way.
   *
   * The tempting fix each time is to relax the assertion. That leaves a test
   * that passes and pins nothing. The right fix is to re-point it at the file
   * the code now lives in — which is what happened, three times.
   *
   * ⚠ SO THIS CHECK IS GENERIC, not a list. It reads every suite that loads
   * `gameStore.ts` as source, collects the literals it asserts against, and
   * fails on any literal that is NOT in gameStore but IS in a slice. That is
   * exactly the stale-pin condition, and it catches the next slice without
   * anyone remembering to extend a list.
   */
  const sliceBodies = sliceFiles.map((f) => src('app', 'state', 'slices', f));

  it('⚠⚠ no suite pins a slice internal against gameStore.ts', () => {
    const stale: string[] = [];
    for (const f of readdirSync(path('__tests__'))) {
      if (!/\.tsx?$/.test(f)) continue;
      const body = src('__tests__', f);
      if (!/['"]app\/state\/gameStore\.ts['"]|['"]gameStore\.ts['"]/.test(body)) continue;
      // Only look at suites that read gameStore and NOT a slice; one that reads
      // both has already been re-pointed and knows what it is doing.
      // ⚠ Matched on the bare word, because a test may build the path as
      // segments — src('app', 'state', 'slices', 'x.ts') — rather than as a
      // slash-joined string. Requiring a slash here produced five false
      // positives against the suite that documents the slices themselves.
      if (/\bslices\b/.test(body)) continue;
      // ⚠ OTA-1395 — nor a suite using `storeSource()`, which reads the store
      // AND its slices on purpose. Those pins are claims about the STORE, not
      // about a file, and the helper says so at length.
      if (/storeSource/.test(body)) continue;
      // ⚠ OTA-1399 — NEGATIVE ASSERTIONS ARE EXEMPT, and slice 8 is what found it.
      // `expect(x).not.toContain(lit)` means "this literal must NOT be here", so a
      // literal that is absent from gameStore and present in a slice is the test
      // PASSING, not a stale pin. ota1005 pins that the bandolier cap site does not
      // do a raw read; slice 8 moved a legitimately different use of that same line
      // into inventorySlice and the guard read it as rot. Skipping `.not.` keeps the
      // guard sharp instead of teaching people to ignore it.
      for (const m of body.matchAll(/(\.not)?\.toContain\(\s*(['"`])((?:\\.|(?!\2)[^\\])*)\2\s*\)/g)) {
        if (m[1]) continue;
        const needle = m[3];
        if (!needle || needle.length < 25) continue;   // short strings match everywhere
        if (store.includes(needle)) continue;          // still in gameStore — fine
        if (sliceBodies.some((b) => b.includes(needle))) stale.push(`${f}: ${needle.slice(0, 70)}`);
      }
    }
    expect(stale).toEqual([]);
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
