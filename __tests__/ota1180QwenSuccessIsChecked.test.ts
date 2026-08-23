// OTA-1180 — A FAILED MODEL LOAD WAS BEING RECORDED AS AN INIT SUCCESS.
//
// ⚠⚠ MEASURED — owner's bug report, 2026-08-09, build `2026-08-09-1179`. The header claims
// a healthy init while every other signal in the same report says the model never loaded:
//
//     Boot stage: qwen:done
//     Last init success: 2026-08-09T03:28:28.017Z
//     Status: active (no crashes detected) · Crash count: 0
//     Model contexts — Opened: 0 · Released: 0 · Live now: 0     ← never loaded
//     ⚠⚠ MEMORY WARNING #1 — app=active · qwen='failed' …        ← never loaded
//     arbiter: template (reason=qwen-not-ready)                   ← never loaded
//
// THE CAUSE, and `bootQwen()` states it in its own comment: *"qwen.initialize() swallows
// errors and sets its own internal status to 'failed' rather than throwing"*. It then sets
// `qwenStatus: 'failed'` and RETURNS NORMALLY. App.tsx's `.then()` therefore ran on the
// failure path and called `setStage('qwen:done')` and `markMLInitSucceeded()`.
//
// ⚠⚠ AND IT IS NOT COSMETIC — THIS IS THE PART THAT MATTERS. `markMLInitSucceeded()`
// deliberately WIPES `KEY_CRASH_COUNT` and `KEY_DISABLED` (arb124's reasoning: a genuine
// success proves the device can load the model, so stale suspicion should be cleared).
// Calling it after a FAILED load resets the very guard that exists to bench Qwen after
// repeated failures. The counter can never reach its threshold of 2, so the protection is
// permanently defeated — and `Crash count: 0` in that report is the guard being wiped on
// every boot, not a healthy device.
//
// ⚠ THIRD INSTANCE OF THE SAME DEFECT IN THREE DAYS, and that is the pattern worth naming:
//   · OTA-1178 — `importSaveAsNewSlot` would have announced a character over a slot that
//     did not exist, because `saveSlot` never throws.
//   · OTA-1179 — the memory handler claimed "released ~400MB" whenever `dispose()`
//     resolved, whether or not anything was held.
//   · OTA-1180 — this one.
// Every one is a caller treating "the promise resolved" as "the work succeeded", against a
// callee that deliberately never rejects. ⚠ **A function that swallows its own errors
// needs its result CHECKED, not awaited.**

import fs from 'fs';
import path from 'path';
import { blockAt } from '../test-utils/srcBlock';

const APP = fs.readFileSync(path.join(__dirname, '..', 'App.tsx'), 'utf8');
/** ⚠ OTA-1393 — `bootQwen` MOVED OUT OF gameStore.ts, into
 *  `app/state/slices/aiLifecycleSlice.ts`, when the store split began. This pin
 *  follows it rather than being relaxed: a source pin loosened after a refactor
 *  stops pinning anything, and what this one holds down is that a failed model
 *  load resolves INTO STATE instead of throwing past App.tsx's guard. The body
 *  is character-for-character what it was; only its address changed. */
const STORE = fs.readFileSync(path.join(__dirname, '..', 'app/state/slices/aiLifecycleSlice.ts'), 'utf8');
const ABOUT = fs.readFileSync(path.join(__dirname, '..', 'app/diagnostics/aboutSummary.ts'), 'utf8');

/** Strips comment blocks and whole-line `//`. ⚠ Trailing `//` is deliberately NOT stripped
 *  (it would eat every `https://`), which is why the assertions below pin CODE EXPRESSIONS
 *  and COUNTS rather than words appearing near other words. */
function codeOnly(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

describe('OTA-1180 — the premise: bootQwen resolves on failure', () => {
  test('bootQwen sets failed and returns rather than throwing', () => {
    // If this ever changes to a throw, the App.tsx guard becomes redundant rather than
    // wrong — but the guard must not be removed on the assumption that it did.
    const code = codeOnly(STORE);
    const i = code.indexOf('async bootQwen()');
    expect(i).toBeGreaterThan(0);
    const body = blockAt(code, 'async bootQwen()');
    expect(body).toContain("qwenStatus: 'failed'");
    // No rethrow anywhere in the body — the failure is swallowed into state.
    expect(body).not.toMatch(/\bthrow\b/);
  });
});

describe('OTA-1180 — App.tsx checks the outcome before recording success', () => {
  const code = codeOnly(APP);

  test('⚠⚠ NO bootQwen continuation records success without checking it', () => {
    // ⚠ THIS ASSERTION WAS RETARGETED AND IS NOW CORRECT RATHER THAN MERELY PASSING.
    // The first version counted `void bootQwen()` sites and expected 2. There are FOUR —
    // the crash-recovery path, the normal boot path, a fallback with only a `.catch`, and
    // an AppState-resume call. Only the first two record success, so only those two could
    // carry the defect; demanding a guard on all four would have been wrong, and demanding
    // it on a hardcoded two would go stale the moment a fifth appears.
    // What actually matters is the RULE: if a continuation marks success, it must have
    // checked. That is what this now tests, over every call site there is.
    const sites = [...code.matchAll(/void bootQwen\(\)/g)].map((m) => m.index ?? 0);
    expect(sites.length).toBeGreaterThanOrEqual(2);

    let marking = 0;
    for (const at of sites) {
      const cont = code.slice(at, at + 500);
      if (!cont.includes('markMLInitSucceeded')) continue;
      marking += 1;
      expect(cont).toContain("const ok = useGameStore.getState().qwenStatus === 'ready';");
      expect(cont).toContain('if (ok) void markMLInitSucceeded();');
    }
    // And at least one site really does record success, or the loop above proves nothing.
    expect(marking).toBeGreaterThanOrEqual(2);
  });

  test('⚠⚠ markMLInitSucceeded is CONDITIONAL — never called on a failed load', () => {
    const calls = code.match(/markMLInitSucceeded\(\)/g) ?? [];
    // Three total: two Qwen sites (now guarded) and the cognitive one. The cognitive call
    // is deliberately untouched — `bootCognitive` is a different contract and arb124's
    // "a real success clears stale suspicion" reasoning still holds there.
    expect(calls.length).toBeGreaterThanOrEqual(3);
    // ⚠ Every Qwen-side call sits behind the `ok` guard.
    const guarded = code.match(/if \(ok\) void markMLInitSucceeded\(\);/g) ?? [];
    expect(guarded).toHaveLength(2);
    // And no bare `void markMLInitSucceeded();` immediately after a qwen:done stage.
    expect(code).not.toMatch(/setStage\('qwen:done'\);\s*\n\s*void markMLInitSucceeded\(\);/);
  });

  test('the boot stage tells the truth too', () => {
    // `Boot stage: qwen:done` was itself a false claim in the owner's report. The stage is
    // the first thing read at triage, so it has to distinguish the two outcomes.
    const stages = code.match(/setStage\(ok \? 'qwen:done' : 'qwen:failed'\);/g) ?? [];
    expect(stages).toHaveLength(2);
  });

  test('⚠ the guard reads the STORE, not the resolved value', () => {
    // `bootQwen()` resolves to void — there is nothing in the promise to inspect. The
    // authoritative answer is the status it wrote.
    expect(code).toContain("useGameStore.getState().qwenStatus === 'ready'");
    expect(code).not.toMatch(/\.then\(\(\s*(ok|result|res)\s*\)\s*=>/);
  });
});

describe('OTA-1180 — the report block says whether the model loaded', () => {
  const code = codeOnly(ABOUT);

  test('the engine status sits with the context count', () => {
    // ⚠ Either number alone misleads. `Opened: 0` reads as "nothing wrong" unless you know
    // the engine believed it was ready; the owner had to be told to cross-reference a
    // memory-warning line forty entries down the log.
    expect(code).toContain('Narration engine:');
    // ⚠ RETARGETED BY OTA-1181, which destructured the read to also pull `qwenError`.
    // The claim is "the block reads the live engine status", not "it reads it on one line".
    expect(code).toContain('useGameStore.getState()');
    expect(code).toContain('st.qwenStatus');
  });

  test('and it cannot break the export', () => {
    // The bug report must never be the thing that fails when the app is already in trouble.
    const i = code.indexOf('function contextLedgerBlock');
    const body = blockAt(code, 'function contextLedgerBlock');
    // Its own inner guard, plus the outer one this block already had.
    expect((body.match(/try \{/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(body).toContain('catch');
  });
});
