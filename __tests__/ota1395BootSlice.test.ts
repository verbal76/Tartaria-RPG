/**
 * OTA-1395 — SLICE 4: boot and birth leave gameStore.
 *
 * `hydrate()` (547 lines — everything the app does once at launch, before
 * anything is on screen) and `startNewGame()` (89 lines — a character is created
 * and a world is seeded).
 *
 * ⚠⚠ THE SLICE-3 PREDICTION HELD EXACTLY. Slice 3 split a ten-action cluster and
 * left these two behind on the grounds that the two groups shared ZERO
 * unexported dependencies. Re-measured here after the eight had gone: still
 * zero. These reach the scene-intro bank, the tutorial phase check and the
 * narrator; the eight took the welcome-back beat, patrol simulation and the
 * memorable-event ledger, and neither group has missed the other.
 *
 * ⚠ NO MUTABLE STATE AT ALL — the first slice of which that is true. Nothing had
 * to travel, so the compiler had nothing to refuse, which makes this the largest
 * move so far and mechanically the least dangerous.
 *
 * ⚠⚠ AND IT TURNED TWENTY-FOUR ASSERTIONS RED ACROSS TEN SUITES. Every one was a
 * source pin on something inside `hydrate` — the telemetry sinks, the ambient
 * contradiction wiring, the crash-ledger promotion, the dying-breath phases.
 * `hydrate` is the most source-pinned function in this codebase, which is worth
 * knowing on its own. The fix was neither hand-editing twenty-four assertions
 * (churn to repeat on every future slice) nor relaxing them (tests that pass and
 * pin nothing) but `test-utils/storeSource.ts`, which says what a pin
 * means now: a claim about the STORE, which is a store plus its slices.
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { storeSource, sliceNames } from '../test-utils/storeSource';

const path = (...p: string[]) => join(__dirname, '..', ...p);
const src = (...p: string[]) => readFileSync(path(...p), 'utf8');

const store = src('app', 'state', 'gameStore.ts');
const slice = src('app', 'state', 'slices', 'bootSlice.ts');

describe('OTA-1395 — boot and birth moved', () => {
  it.each(['hydrate', 'startNewGame'])('%s lives in the slice, not in gameStore', (name) => {
    expect(slice).toMatch(new RegExp(`^  async ${name}\\(`, 'm'));
    expect(store).not.toMatch(new RegExp(`^  async ${name}\\(`, 'm'));
  });

  it('⚠ the store still declares both, so no consumer changes', () => {
    expect(store).toContain('  hydrate: () => Promise<void>;');
    expect(store).toContain('  startNewGame: (input: CreateCharacterInput) => Promise<void>;');
    expect(store).toContain('...createBootSlice(set, get, {');
  });

  it('⚠⚠ this slice owns NO mutable state, and that is why it moved whole', () => {
    // Every earlier slice had to carry a `let` with it or fail to compile. This
    // one has none — so the largest move of the four was also the one the
    // compiler had the least to say about.
    expect(slice).not.toMatch(/^let /m);
    expect(slice).toContain('NO MUTABLE STATE AT ALL');
  });
});

describe('OTA-1395 — the boot order that a freeze investigation depends on', () => {
  it('⚠⚠ the surviving breadcrumb is READ and REPORTED before it is cleared', () => {
    // OTA-1276. If the clear ran first, a freeze that killed the last session
    // would leave no witness at the next boot — and the whole forensics chain
    // exists because that freeze is not reproducible on demand.
    const i = slice.indexOf('async hydrate() {');
    const end = slice.indexOf('forensics must never block a boot', i);
    expect(i).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(i);
    const block = slice.slice(i, end);
    expect(block.indexOf('await readLiveBreadcrumb()'))
      .toBeLessThan(block.indexOf('await clearLiveBreadcrumb()'));
  });

  it('⚠⚠ …and the native-death promotion still happens BETWEEN them', () => {
    // OTA-1380. A breadcrumb that survived a launch means the process died
    // mid-action; promoting it to a crash record has to happen while the
    // breadcrumb still exists.
    const i = slice.indexOf('async hydrate() {');
    const block = slice.slice(i, slice.indexOf('forensics must never block a boot', i));
    const read = block.indexOf('await readLiveBreadcrumb()');
    const promote = block.indexOf('crashLedger');
    const clear = block.indexOf('await clearLiveBreadcrumb()');
    expect(read).toBeLessThan(promote);
    expect(promote).toBeLessThan(clear);
  });
});

describe('OTA-1395 — seven private helpers handed in', () => {
  const DEPS = [
    'INTRO_BANK_PER_LOC',
    'inScriptedTutorialPhase',
    'introPrefetchCandidates',
    'narrateViaArbiter',
    'sceneIntroBank',
    'setHomeworkTick',
  ];

  it.each(DEPS)('%s is injected, not imported', (name) => {
    expect(slice).toContain(`  ${name}: typeof Store.${name};`);
    expect(slice).toContain(`deps.${name}`);
  });

  it('⚠⚠ the slice imports NO value from gameStore', () => {
    for (const line of slice.split('\n')) {
      if (!/from\s+['"]\.\.\/gameStore['"]/.test(line)) continue;
      expect(line.trim().startsWith('import type ')).toBe(true);
    }
  });

  it('⚠ sceneIntroBank is passed BY REFERENCE, because both sides write to it', () => {
    // It is a Map mutated in place, shared with the narration path. Copying it
    // would give the two halves separate banks and the bug would look like
    // "the intro sometimes repeats".
    //
    // ⚠ OTA-1398 — RE-POINTED. The narration path left gameStore for
    // `app/ai/narration.ts`, and the Map went with it: narration is the side
    // that FILLS the bank, so it is the owner. gameStore re-exports the name so
    // every existing importer is untouched, and the slice still receives the one
    // live Map rather than a copy — which is the whole claim here.
    expect(slice).toContain('shared Map mutated in place');
    expect(src('app', 'ai', 'narration.ts')).toMatch(/^export const sceneIntroBank/m);
    expect(store).not.toMatch(/^export const sceneIntroBank/m);
    expect(store).toContain("} from '../ai/narration';");
  });
});

describe('OTA-1395 — the source-pin fallout, and what it says', () => {
  it('⚠⚠ the storeSource helper exists and explains when NOT to use it', () => {
    // A helper that only made red tests green would be a way to hide a deletion.
    // This one is explicit that structural claims must still read one file.
    expect(existsSync(path('test-utils', 'storeSource.ts'))).toBe(true);
    const h = src('test-utils', 'storeSource.ts');
    expect(h).toContain('WHEN NOT TO USE IT');
    expect(h).toContain('cannot be used to hide a deletion'.toUpperCase());
  });

  it('⚠⚠ it reads the store AND every slice, discovered not listed', () => {
    // Listing slice files would rot at slice 5. It reads the directory, so the
    // next move needs no edit here.
    const h = src('test-utils', 'storeSource.ts');
    expect(h).toContain('readdirSync(SLICE_DIR)');
    const all = storeSource();
    for (const f of sliceNames()) {
      expect(all).toContain(src('app', 'state', 'slices', f).slice(0, 60));
    }
  });

  it('⚠ the structural suites still read ONE file, on purpose', () => {
    // ota1392 polices the store/slice boundary and ota1393 pins that the engines
    // are constructed exactly once. Both would be ERASED by a concatenation — a
    // literal present in any slice would satisfy a claim about a specific one.
    // ⚠ Checked as USE, not mention: ota1392's stale-pin guard names the helper
    // in order to exempt suites that use it, which is the opposite of using it.
    for (const f of ['ota1392StoreSlices.test.ts', 'ota1393AiEngines.test.ts']) {
      expect(src('__tests__', f)).not.toContain("from '../test-utils/storeSource'");
    }
  });

  it('⚠ and the seventh flagged dep was dropped, like slice 3\'s', () => {
    // `startRuntimePressureWatch` appears in these 636 lines only inside a
    // comment; the watcher is started by bootQwen, which is in slice 2.
    expect(slice).not.toContain('startRuntimePressureWatch: typeof');
    expect(slice).toContain('is a lie about coupling');
  });
});

describe('OTA-1395 — four slices in', () => {
  it('gameStore is under 43,600 lines', () => {
    // 45,050 → 44,891 → 44,816 → 44,160 → here.
    expect(store.split('\n').length).toBeLessThan(43600);
  });

  it('⚠ there are four slices, and the policy suite covers all of them', () => {
    expect(sliceNames()).toEqual([
      'aiLifecycleSlice.ts',
      'bootSlice.ts',
      'craftingSlice.ts',
      'inventorySlice.ts',
      'persistSlice.ts',
      'slotSlice.ts',
      'vendorSlice.ts',
    ]);
  });
});
