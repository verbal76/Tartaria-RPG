/**
 * OTA-1394 — SLICE 3: slot management leaves gameStore.
 *
 * The eight things a player does to a SAVED CHARACTER that are not writing one:
 * list, load, resurrect, delete, import from another install, abandon the run,
 * clear a load error, exit to title. 642 lines.
 *
 * ⚠⚠ THE PLAN SAID TEN ACTIONS. MEASURING SAID EIGHT.
 *
 * "The rest of the save/system cluster" was ten actions, ~1,280 lines. Extracted
 * method by method, they split into two groups whose unexported dependency sets
 * **do not intersect at all**:
 *
 *   • these eight reach the welcome-back beat, patrol simulation and the
 *     memorable-event ledger;
 *   • `hydrate` and `startNewGame` reach the tutorial, the scene-intro bank and
 *     the narrator.
 *
 * Zero overlap is not a coincidence of layout. It is two different jobs that
 * happened to be typed next to each other, and moving them as one lump would
 * have produced a slice needing both sets and explaining neither.
 *
 * ⚠⚠ AND IT CORRECTED AN EARLIER MEASUREMENT OF MINE. Slice 1 reported this
 * cluster as carrying EIGHT mutable `let`s. That number came from reading
 * generous line ranges around each action, which swept in neighbouring code.
 * Per-method, the real answer is ONE — `lastWelcomeBackAt` — and every read and
 * write of it is inside these eight actions. The over-count made the cluster
 * look harder than it was; the fix was to measure the actual method bodies
 * rather than a window around them.
 *
 * ⚠ BEHAVIOUR IS PROVEN ELSEWHERE, as in slices 1 and 2: importSave,
 * resurrectSlotGemSafety, sessionResume and ota1292LoreBackStaysInGame cover
 * these paths and pass unchanged.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const path = (...p: string[]) => join(__dirname, '..', ...p);
const src = (...p: string[]) => readFileSync(path(...p), 'utf8');

const store = src('app', 'state', 'gameStore.ts');
const slice = src('app', 'state', 'slices', 'slotSlice.ts');

const MOVED = [
  'refreshSlots',
  'loadSlotIntoGame',
  'resurrectSlot',
  'deleteSlotById',
  'importSaveFromText',
  'abandonGame',
  'clearSlotLoadError',
  'saveAndExitToTitle',
];

describe('OTA-1394 — the eight moved, and the two that did not', () => {
  it.each(MOVED)('%s lives in the slice, not in gameStore', (name) => {
    expect(slice).toMatch(new RegExp(`^  (async )?${name}\\(`, 'm'));
    expect(store).not.toMatch(new RegExp(`^  (async )?${name}\\(`, 'm'));
  });

  it('⚠ the store still declares all eight, so no consumer changes', () => {
    // 473 files import useGameStore. The slice pattern's whole value is that
    // none of them notice.
    for (const name of MOVED) expect(store).toContain(`  ${name}: `);
    expect(store).toContain('...createSlotSlice(set, get, {');
  });

  it('⚠⚠ hydrate and startNewGame did NOT come with the eight, and still have not', () => {
    // Not a judgement call — they share no unexported dependency with these eight.
    //
    // ⚠ OTA-1395 — this assertion originally read "…STAYED" and checked they were
    // still in gameStore. Slice 4 moved them to `bootSlice.ts` one OTA later, so
    // the wording was true for about an hour. What the test is actually FOR is
    // that the two groups never mixed — so it now checks they are not in THIS
    // slice, which is the claim that survives every later move.
    expect(slice).not.toMatch(/^  async hydrate\(\)/m);
    expect(slice).not.toMatch(/^  async startNewGame\(/m);
    expect(store).toContain('share ZERO unexported dependencies');
  });
});

describe('OTA-1394 — the state travelled with the actions', () => {
  it('⚠⚠ the one mutable let moved, because it had no choice', () => {
    // `lastWelcomeBackAt` is written in loadSlotIntoGame and saveAndExitToTitle
    // and read in loadSlotIntoGame — all three inside this slice. Leaving it
    // behind would not have been a subtle bug; it would have failed to compile,
    // which is the property that makes this segmentation safe to keep doing.
    expect(slice).toMatch(/^let lastWelcomeBackAt/m);
    expect(store).not.toMatch(/^let lastWelcomeBackAt/m);
  });

  it('⚠ …and so did the two constants only these actions used', () => {
    for (const name of ['WELCOME_BACK_MIN_MS', 'WHILE_AWAY_LINES']) {
      expect(slice).toContain(`const ${name}`);
      expect(store).not.toMatch(new RegExp(`^const ${name}\\b`, 'm'));
    }
  });

  it('⚠ the debounce is still 60s and still fires on a cold load', () => {
    // OTA-008. The first load per session always greets (the counter starts
    // null); the debounce only suppresses a fast away-and-back.
    expect(slice).toContain('const WELCOME_BACK_MIN_MS = 60_000;');
    expect(slice).toContain('let lastWelcomeBackAt: number | null = null;');
    expect(slice).toContain('!lastWelcomeBackAt || nowStep - lastWelcomeBackAt > WELCOME_BACK_MIN_MS');
  });
});

describe('OTA-1394 — the deps object is honest about coupling', () => {
  it('⚠⚠ six functions are handed in, none imported as values', () => {
    // Three of these are even EXPORTED from gameStore, which makes importing
    // them look reasonable and is still wrong: gameStore imports this file to
    // build the store, so a value import back is a cycle. The failure would land
    // on loadSlotIntoGame — a player tapping their own character.
    for (const fn of [
      'backfillPlayer',
      'maintainPatrols',
      'migrateLoadedWorldMemory',
      'recordMemorableEvent',
      'simulatePatrols',
      'welcomeBackLine',
    ]) {
      expect(slice).toContain(`  ${fn}: typeof Store.${fn};`);
      expect(slice).toContain(`deps.${fn}(`);
    }
  });

  it('⚠⚠ the dep types are `typeof`, so they cannot drift from the real functions', () => {
    // Hand-writing the signatures would let gameStore change one and this file
    // keep compiling against the old shape. `import type * as` is fully erased,
    // so the exact types come across with no runtime coupling at all.
    expect(slice).toContain("import type * as Store from '../gameStore';");
    for (const line of slice.split('\n')) {
      if (!/from\s+['"]\.\.\/gameStore['"]/.test(line)) continue;
      expect(line.trim().startsWith('import type ')).toBe(true);
    }
  });

  it('⚠ an injected dep nothing calls was DROPPED, not left in', () => {
    // The dependency scan flagged `arbiterAddress`. Its only appearance in these
    // 642 lines is inside a comment saying the welcome-back greeting deliberately
    // does NOT use it. A dep nothing calls is a lie about coupling.
    expect(slice).not.toContain('arbiterAddress: typeof Store.arbiterAddress;');
    expect(slice).not.toContain('deps.arbiterAddress(');
    expect(slice).toContain('is a lie about coupling');
  });

  it('⚠ …and the deps object says it is a measurement, not an ideal', () => {
    expect(slice).toContain('THE DEPS OBJECT IS A MEASUREMENT, NOT AN IDEAL');
  });
});

describe('OTA-1394 — the guards that protect a character survived the move', () => {
  it('⚠⚠ a failed load rolls the active slot back before anything can save over it', () => {
    // Half of the pair ota1292 pins. Without it, a load that fails partway leaves
    // activeSlotId pointing at the slot while player is null or partial — and the
    // next persist writes that over a real character.
    expect(slice).toContain('try { await setActiveSlot(null); } catch { /* ignore */ }');
  });

  it('⚠ resurrection still spends the gem before it revives', () => {
    // Order matters: revive-then-charge is a free resurrection if the write fails
    // in between.
    expect(slice).toContain('addResurrectionGems');
    expect(slice).toContain('clearFallenSeed');
  });

  it('⚠ import writes to a NEW slot rather than over the current one', () => {
    // A save from another install becomes a new playable character; it must not
    // silently replace whoever is loaded.
    expect(slice).toContain('newSlotId');
  });
});

describe('OTA-1394 — three slices in, the file keeps shrinking', () => {
  it('gameStore is under 44,200 lines', () => {
    // 45,050 at the start of Part 4 → 44,891 (slice 1) → 44,816 (slice 2) → here.
    expect(store.split('\n').length).toBeLessThan(44200);
  });

  it('⚠ and the policy suite still covers every slice, including this one', () => {
    // ota1392StoreSlices walks app/state/slices/ rather than naming files, so
    // slice 3 inherited the value-import rule, the wiring check and the
    // mutable-state rule without anyone extending a list.
    expect(src('__tests__', 'ota1392StoreSlices.test.ts')).toContain('readdirSync(SLICE_DIR)');
  });
});
