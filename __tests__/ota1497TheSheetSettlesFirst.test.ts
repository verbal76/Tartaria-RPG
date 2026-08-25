// OTA-1497 — THE SHEET SETTLES BEFORE ITS ACTION CAN RAISE A POPUP.
//
// ⚠⚠⚠ THE OWNER, 2026-08-25: *"it froze and had to be force closed 4 times in a
// row … that was after the fixes."* And the evidence, from the fourth SEND LOG
// bundle (sentry-inbox/player-log_2026-08-25T02-07-26): twice in a row, the
// same three lines and then fifty seconds of appstate churn with not one
// ui: tap before a force-close —
//
//   [player] investigate bench
//   route: hook intercept (kind=thread, target="bench")
//   [world] ★ STORY THREAD (step 1) — …
//
// The tap came from INSIDE the take/salvage sheet. Its handler closed the
// sheet and submitted in the same tick, so the story-thread popup
// (pendingHookContinue → HookContinueModal) was told to PRESENT while the
// sheet's native <Modal> was still running its ~300ms dismissal. On iOS that
// present-during-dismiss wedges the window: JS stays alive (appstate and
// watchdog lines kept logging), the screen goes dead. The engine had done
// everything right — the thread even COMPLETED and paid out in session two —
// which is why the crash channel showed almost nothing: to the ledger this
// looked like an orderly background-then-exit.
//
// ⚠⚠ THE CLASS: any submit that leaves a CLOSING sheet and can synchronously
// raise a store-driven modal (story thread, whisper complete, summon refusal,
// story fork). The fix is WHEN, not WHAT: `submitAfterSheetSettles` defers the
// submit past the dismissal (SHEET_SETTLE_MS). Feed-chip and typed submits are
// untouched; a modal over a sheet that STAYS open is fine — it is only
// present-during-dismiss that wedges.

import { readFileSync } from 'fs';
import { join } from 'path';
import { between, blockAt } from '../test-utils/srcBlock';

const SRC = readFileSync(
  join(__dirname, '..', 'app', 'screens', 'ExplorationScreen.tsx'), 'utf8');

describe('OTA-1497 — the deferral exists and is real', () => {
  it('⚠⚠⚠ the helper defers the submit by SHEET_SETTLE_MS', () => {
    const body = blockAt(SRC, 'const submitAfterSheetSettles = (text: string, after?: () => void): void => {', { mode: 'opener' });
    expect(body).toMatch(/setTimeout\(\(\) => \{ submit\(text\); after\?\.\(\); \}, SHEET_SETTLE_MS\)/);
  });

  it('⚠⚠ the settle window clears an iOS modal dismissal with margin', () => {
    const m = /const SHEET_SETTLE_MS = (\d+);/.exec(SRC);
    expect(m).not.toBeNull();
    const ms = Number(m![1]);
    // The RN <Modal> fade runs ~300ms on iOS. Below that the wedge returns;
    // far above it the tap starts reading as lag.
    expect(ms).toBeGreaterThanOrEqual(350);
    expect(ms).toBeLessThanOrEqual(700);
  });
});

describe('OTA-1497 — every closing-sheet submit goes through the helper', () => {
  it('⚠⚠⚠ THE FREEZE PATH: the take-sheet lead investigate is deferred', () => {
    const span = between(SRC, 'onInvestigate={(noun) => {', 'leadNouns={leadNouns}');
    expect(span).toContain('setTakeOpen(false);');
    expect(span).toContain('submitAfterSheetSettles(`investigate ${noun}`)');
    expect(span).not.toMatch(/[^A-Za-z]submit\(`investigate/);
  });

  it('⚠⚠ the investigate sheet pick is deferred', () => {
    const span = between(SRC, "onSubmit={(target) => {\n          setSearchOpen(false);", 'INVESTIGATE ALL');
    expect(span).toContain('submitAfterSheetSettles(`investigate ${target}`)');
    expect(span).not.toMatch(/[^A-Za-z]submit\(`investigate \$\{target\}`\)/);
  });

  it('⚠⚠ the INVESTIGATE ALL sweep waits out the sheet before its FIRST step', () => {
    // The sweep loop paces itself between steps but used to fire step one in
    // the closing tick. Its abort checks live inside step(), so a player who
    // acts during the wait still cancels the sweep before its first line.
    expect(SRC).toContain('setTimeout(step, SHEET_SETTLE_MS);');
    // the synchronous kick is gone
    expect(SRC).not.toMatch(/^\s*step\(\);\s*$/m);
  });

  it('⚠⚠ tutorial takes, approach and climb follow the same rule', () => {
    expect(SRC).toContain("submitAfterSheetSettles('take cudgel')");
    expect(SRC).toContain('submitAfterSheetSettles(`take ${noun}`');
    expect(SRC).toContain('submitAfterSheetSettles(`approach ${target}`)');
    expect(SRC).toContain('submitAfterSheetSettles(`climb ${target}`)');
  });

  it('⚠⚠ the vest beat still equips right after its deferred grant', () => {
    // The one call site that did work AFTER its submit — the check rides the
    // helper's callback so it still reads the pack after the grant lands.
    const span = between(SRC, 'submitAfterSheetSettles(`take ${noun}`, () => {', 'takeAndWear(noun);');
    expect(span).toMatch(/equipItem\("Mud-Warden's Vest", 'chest'\)/);
  });

  it('⚠ the stays-open salvage path deliberately submits immediately', () => {
    // A modal presented over a sheet that remains PRESENTED does not wedge —
    // only present-during-dismiss does. The loot-list flow (sheet stays up so
    // the player can keep picking) is untouched; only the tutorial beat that
    // closes the sheet defers.
    const span = between(SRC, 'onSalvage={(noun) => {', 'onInvestigate={(noun) => {');
    expect(span).toContain('submit(`salvage ${noun}`);');
    expect(span).toContain('submitAfterSheetSettles(`salvage ${noun}`)');
  });

  it('⚠⚠ no closing-sheet handler is left with a same-tick submit', () => {
    // The pattern that froze the iPhone: a sheet setter to false with a bare
    // submit() in the next two code lines. Comments stripped so documentation
    // of the old bug cannot trip the scan.
    const code = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const bad = /set(?:Search|Take|Approach|Climb)Open\(false\);\s*\n(?:[^\n]*\n)?\s*submit\(/;
    expect(code).not.toMatch(bad);
  });
});
