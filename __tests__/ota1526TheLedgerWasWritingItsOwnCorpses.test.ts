/**
 * OTA-1526 — THE LEDGER WAS WRITING ITS OWN CORPSES.
 *
 * Task #81 was "the residue after the OTA-restart phantoms are removed": after
 * OTA-1521 cleared the crumb before `reloadAsync()`, some `PROCESS KILLED — no
 * JS ran` records were expected to survive as real native deaths. Mining every
 * assembled log in sentry-inbox for the 22 distinct records settled what they
 * are, and it is not memory pressure:
 *
 *   • 20 of 22 are dated within 30 SECONDS of a session boot marker; 15 within
 *     ONE second.
 *   • 9 sit INSIDE the session that filed them. 2026-08-27T01:34:40.055 is the
 *     clean one — session header at 01:34:39.511, "death" 544ms later, and the
 *     log keeps running for seconds afterwards with no new session header. That
 *     process did not die; it recorded itself.
 *   • 2026-08-24T23:58:42 is the same shape end to end: `OTA session start` at
 *     .251, PROCESS KILLED at .465, session header at .576 — a corpse 214ms old.
 *   • Three wear `last checkpoint: rendered (+0ms)` — created and killed inside
 *     one millisecond.
 *   • 19 of the 21 parseable records read `(no action yet) · room ? · screen ?`.
 *
 * ⚠⚠ THE MECHANISM. `hydrate()` read `@tartaria/lastBreadcrumb` with an await,
 * and the fresh process WRITES that same key from its own phase stamps —
 * ExplorationScreen's render checkpoint fires on every commit with no dep array
 * (OTA-1356). Whichever won decided what boot believed. Stamp wins: hydrate
 * reads back a crumb this process wrote milliseconds earlier, finds no orderly
 * exit on it, and promotes it to a fatal death. Survivor exists: the same stamp
 * overwrites it first, so a REAL death is re-dated to the boot and its
 * `what`/`room` replaced with `(no action yet) · room ?`. Both directions wrong,
 * one race.
 *
 * ⚠⚠ AND IT EXPLAINS THE HEADLINE THAT MADE #81 UNREADABLE — every record at
 * `stage rendered`. That was never a fact about where the app dies. It is the
 * signature of the writer that won the race.
 *
 * ⚠⚠⚠ THE ERROR CLASS: A READER AND A WRITER SHARING A KEY, WHERE THE READ IS
 * SUPPOSED TO MEAN "BEFORE THE WRITER EXISTED". The fix takes the read out of
 * the race instead of arguing about who should win it: the key's value at module
 * load IS the survivor, because this module is evaluated before any component
 * renders. Nothing about the writers changes, so nothing that was detectable
 * stops being detectable.
 *
 * ⚠ THE FIRST DRAFT OF THIS FIX WAS WRONG AND IS RECORDED HERE ON PURPOSE. It
 * deleted the `?? { what: '(no action yet)' }` fallback in stampBreadcrumbPhase
 * so a phase could not synthesise a crumb. That kills the same false records —
 * and blinds the instrument to a freeze with no action in flight, which is the
 * OTA-1357 case (death 1ms into the return to foreground), one of the three B9
 * freezes this entire chain exists for. Suppressing a false positive by buying a
 * blind spot over the one event the instrument was built to catch is the trade
 * OTA-1377 and OTA-1413 both refused. So does this.
 */
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
import {
  stampLiveBreadcrumb,
  stampBreadcrumbPhase,
  clearLiveBreadcrumb,
  readLiveBreadcrumb,
  readSurvivingBreadcrumb,
  _armSurvivorSnapshotForTest,
  _resetBreadcrumbMirrorForTest,
} from '../app/engine/saveSystem';
import { readFileSync } from 'fs';
import { join } from 'path';

const src = (...p: string[]): string => readFileSync(join(__dirname, '..', ...p), 'utf8');
const SAVE = src('app', 'engine', 'saveSystem.ts');
const BOOT = src('app', 'state', 'slices', 'bootSlice.ts');

const flush = () => new Promise((r) => setImmediate(r));

/** A process boundary: the mirror is gone, and the snapshot is re-taken from
 *  whatever the last session left on disk. */
async function newProcess(): Promise<void> {
  await flush();
  _resetBreadcrumbMirrorForTest();
  _armSurvivorSnapshotForTest();
  await flush();
}

beforeEach(async () => {
  _resetBreadcrumbMirrorForTest();
  await clearLiveBreadcrumb();
  _resetBreadcrumbMirrorForTest();
});

describe('OTA-1526 — a session cannot hand boot its own handwriting', () => {
  it('⚠⚠⚠ THE 01:34:40 SHAPE: a fresh process that stamps a phase leaves boot nothing', async () => {
    // The previous session exited cleanly, so the key is empty when this one
    // starts. Then this process renders and the OTA-1356 checkpoint fires.
    await newProcess();
    stampBreadcrumbPhase('rendered');
    await flush();
    // The live key now holds THIS session's crumb — that part is by design and
    // is what makes an idle kill visible later in the session.
    expect((await readLiveBreadcrumb())?.what).toBe('(no action yet)');
    // But boot is handed the survivor, and there was none. Pre-1526 this read
    // the line above and filed it as `PROCESS KILLED — no JS ran`.
    expect(await readSurvivingBreadcrumb()).toBeNull();
  });

  it('⚠⚠⚠ …and a REAL survivor is handed over WHOLE, not overwritten by the new boot', async () => {
    // Session A: the player attacks, the action is declared, phases decorate it,
    // and the process is killed mid-action. This is the one genuine record in
    // the owner's corpus (2026-08-25T22:13:33, at nimari).
    stampLiveBreadcrumb({
      at: 1_000,
      what: 'action "attack with the cantor\'s tuning fork"',
      screen: 'exploration',
      room: 'nimari',
    });
    stampBreadcrumbPhase('engine-done');
    await flush();
    const sessionA = await readLiveBreadcrumb();

    // Session B starts and its first render fires the checkpoint immediately —
    // the exact write that used to destroy the evidence above.
    await newProcess();
    stampBreadcrumbPhase('rendered');
    await flush();

    const survivor = await readSurvivingBreadcrumb();
    expect(survivor?.what).toBe('action "attack with the cantor\'s tuning fork"');
    expect(survivor?.room).toBe('nimari');
    expect(survivor?.phase).toBe('engine-done');
    // ⚠⚠ AND THE DATE SURVIVES TOO — the field the death is actually filed under.
    // `hydrate` dates the record at `phaseAt` (OTA-1504), so if session B's stamp
    // had won, the death would carry the BOOT's clock and be misdated to the
    // restart. Pinned against session A's own recorded stamp.
    //
    // ⚠ COMPARED BY IDENTITY, NOT BY CLOCK. The first draft asserted
    // `phaseAt < Date.now()` and went red in the full run when the whole test
    // executed inside a single millisecond — a true claim stated in a way that
    // depended on wall time passing. Session B's live crumb is checked as the
    // other half of the same fact: this process DID write one, and boot was
    // handed the other.
    expect(survivor?.phaseAt).toBe(sessionA?.phaseAt);
    const live = await readLiveBreadcrumb();
    expect(live?.what).toBe('(no action yet)');
    expect(live?.phase).toBe('rendered');
  });

  it('⚠⚠ the survivor is handed out ONCE — it is a fact about a boot, not a value', async () => {
    stampLiveBreadcrumb({ at: 1_000, what: 'action "go west"' });
    await newProcess();
    expect((await readSurvivingBreadcrumb())?.what).toBe('action "go west"');
    // A second hydrate in the same session must not mint a second corpse from
    // the same crumb. (crashLedger dedups on id too; this is the other half.)
    expect(await readSurvivingBreadcrumb()).toBeNull();
  });

  it('⚠ an empty disk at process start is a null survivor, not a throw', async () => {
    await clearLiveBreadcrumb();
    await newProcess();
    expect(await readSurvivingBreadcrumb()).toBeNull();
  });

  it('⚠ a corrupt survivor is ignored, never thrown — boot must not die on forensics', async () => {
    const mod = require('@react-native-async-storage/async-storage');
    const AS = mod.default ?? mod;
    await AS.setItem('@tartaria/lastBreadcrumb', '{not json');
    await newProcess();
    expect(await readSurvivingBreadcrumb()).toBeNull();
  });
});

describe('OTA-1526 — nothing that was detectable stops being detectable', () => {
  it('⚠⚠⚠ THE FALLBACK STAYS: a phase with nothing live still synthesises a crumb', () => {
    // This is the line the first draft deleted. Removing it would blind the
    // instrument to a freeze before the player's first action — OTA-1357's case.
    expect(SAVE).toContain("_lastLiveCrumb ?? { at: Date.now(), what: '(no action yet)' }");
  });

  it('⚠⚠ an idle kill with no action in flight is still a survivor', async () => {
    // Session A renders, the player does nothing for a while, the OS takes the
    // process. There is no action to name and the record says so — but it IS a
    // record, and boot still gets it.
    stampBreadcrumbPhase('rendered');
    await flush();
    await newProcess();
    const survivor = await readSurvivingBreadcrumb();
    expect(survivor?.what).toBe('(no action yet)');
    expect(survivor?.phase).toBe('rendered');
  });

  it('⚠⚠ OTA-1413 is intact: a crumb written after an orderly exit is still labelled', async () => {
    stampLiveBreadcrumb({ at: 1_000, what: '(no action yet)' });
    await clearLiveBreadcrumb();          // AppState background — orderly exit
    stampBreadcrumbPhase('ctx-release');  // Qwen teardown, after the clear
    stampBreadcrumbPhase('ctx-release-done');
    await newProcess();
    const survivor = await readSurvivingBreadcrumb();
    expect(survivor?.phase).toBe('ctx-release-done');
    expect(survivor?.afterOrderlyExit).toBe(true);
  });

  it('⚠⚠ OTA-1521 is intact: a reload clears the crumb, so boot finds no survivor', async () => {
    stampLiveBreadcrumb({ at: 1_000, what: 'action "go west"' });
    stampBreadcrumbPhase('rendered');
    await clearLiveBreadcrumb();          // markOrderlyExitForReload
    await newProcess();
    expect(await readSurvivingBreadcrumb()).toBeNull();
  });

  it('⚠ the live probe is untouched — the diagnostics screens still read NOW', async () => {
    // readLiveBreadcrumb is what About and the suites use to ask "what is on
    // disk at this moment". Only the boot promotion path takes the snapshot.
    stampLiveBreadcrumb({ at: 1_000, what: 'tap "inventory"', room: 'outpost_gate' });
    await flush();
    expect((await readLiveBreadcrumb())?.what).toBe('tap "inventory"');
    // …and it is still an exported live reader, not an alias of the snapshot.
    expect(SAVE).toContain('export async function readLiveBreadcrumb(): Promise<LiveBreadcrumb | null> {');
    expect(SAVE).toContain('const raw = await AsyncStorage.getItem(LAST_BREADCRUMB_KEY);');
  });
});

describe('OTA-1526 — the boot path reads the snapshot and only the snapshot', () => {
  it('⚠⚠⚠ hydrate takes the survivor, not the live key', () => {
    const i = BOOT.indexOf('async hydrate() {');
    const block = BOOT.slice(i, BOOT.indexOf('forensics must never block a boot', i));
    expect(block).toContain('await readSurvivingBreadcrumb()');
    // ⚠ COMMENTS STRIPPED FIRST — the OTA-1377 lesson, and this suite tripped on
    // it: the note above the fixed line NAMES the call it replaced, so a raw
    // search finds the old reader in prose and calls the fix undone.
    const code = block.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
    expect(code).not.toContain('await readLiveBreadcrumb()');
  });

  it('⚠⚠ …and the read still comes before the promotion, which still comes before the clear', () => {
    // The OTA-1276/1380 ordering, restated here because this OTA moved the read.
    const i = BOOT.indexOf('async hydrate() {');
    const block = BOOT.slice(i, BOOT.indexOf('forensics must never block a boot', i));
    const read = block.indexOf('await readSurvivingBreadcrumb()');
    const promote = block.indexOf("kind: 'native-death'");
    const clear = block.indexOf('await clearLiveBreadcrumb()');
    expect(read).toBeGreaterThan(-1);
    expect(read).toBeLessThan(promote);
    expect(promote).toBeLessThan(clear);
  });

  it('⚠⚠ the snapshot is taken at MODULE LOAD, which is the only moment it can be trusted', () => {
    // A lazily-taken snapshot is the bug again with more steps: by the time
    // something asks for it, the render checkpoint has already fired. It has to
    // be an initialiser on the module binding.
    expect(SAVE).toContain('let _survivorSnapshot: Promise<LiveBreadcrumb | null> | null = snapshotSurvivor();');
    // And it is declared AFTER the key it reads, or it would read undefined.
    expect(SAVE.indexOf("const LAST_BREADCRUMB_KEY"))
      .toBeLessThan(SAVE.indexOf('let _survivorSnapshot'));
  });

  it('⚠ the measurement that drove this is written down, not asserted', () => {
    // The two records that carry the proof on their face: one dated inside the
    // session that filed it, one 214ms after its own `OTA session start`.
    expect(SAVE).toContain('2026-08-27T01:34:40.055');
    expect(SAVE).toContain('2026-08-24T23:58:42');
    expect(BOOT).toContain('OTA-1526');
  });
});
