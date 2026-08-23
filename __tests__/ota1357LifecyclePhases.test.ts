// ⚠⚠ OTA-1357 — THE LIFECYCLE PATH GETS ITS OWN PHASE STAMPS (B9, third freeze).
//
// 2026-08-18 10:56:15.639, Pixel 10 Pro XL: the third freeze died mid-write of
// the appStateLine, within 1ms of a background→active transition — 10s after
// the native context was released on backgrounding, with the reinit watchdog
// holding. No action or homework was running, so the OTA-1356 stamps could only
// prove the negative. The lifecycle path the death walked now stamps itself:
//   appstate:<prev>→<next>            first thing in the pressure handler
//   ctx-open / ctx-open-done          bracketing the ~425MB native initLlama
//   ctx-release / ctx-release-done    bracketing the native free
//   qwen-reinit [attempt#N]           when the watchdog kicks a reload
// A surviving crumb inside any bracket incriminates that exact native call.
import { readFileSync } from 'fs';
import { join } from 'path';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import { stampLiveBreadcrumb, stampBreadcrumbPhase, readLiveBreadcrumb } from '../app/engine/saveSystem';

describe('OTA-1357 — lifecycle phase stamps', () => {
  it('⚠⚠ source lock: the appstate handler stamps BEFORE it logs (the third freeze died on that log line)', () => {
    // ⚠ OTA-1396 — TWO FILES NOW, BECAUSE THE TWO STAMPS ENDED UP IN DIFFERENT ONES.
    // Slice 5 moved the app-state listener down to `app/diagnostics/runtimePressureWatch.ts`
    // with the rest of the freeze instruments; the qwen reinit path stayed in the store
    // with the watchdog. Each stamp is pinned against the file that now holds it, which
    // keeps the ORDER claim — stamp before log — a claim about one real handler.
    const watch = readFileSync(
      join(__dirname, '..', 'app', 'diagnostics', 'runtimePressureWatch.ts'), 'utf8',
    );
    const stampAt = watch.indexOf('stampBreadcrumbPhase(`appstate:${prev}→${nextStr}`);');
    expect(stampAt).toBeGreaterThan(-1);
    const logAt = watch.indexOf('appendLog(\'debug\', appStateLine(prev, nextStr,', stampAt - 2000);
    expect(logAt).toBeGreaterThan(stampAt); // stamp first, log second
    // ⚠ OTA-1397 — and the reinit stamp moved too, one slice later, to
    // `app/ai/qwenWatchdog.ts`. Both stamps now sit in leaves; gameStore holds
    // neither. Two files, two claims, each read where it lives.
    const src = readFileSync(join(__dirname, '..', 'app', 'ai', 'qwenWatchdog.ts'), 'utf8');
    expect(src).toContain("stampBreadcrumbPhase('qwen-reinit', `attempt#${rpAttemptNo}`);");
  });

  it('⚠⚠ source lock: EVERY native open and free is BRACKETED — a crumb inside a bracket names the call', () => {
    // ⚠⚠⚠ REBUILT BY OTA-1452, AND THE REBUILD FOUND A REAL HOLE. The old version
    // checked two brackets by hand and located the release with
    // `src.indexOf('ctx.release()')` — the FIRST such call in the file. OTA-1452 added a
    // third native free (the straggler teardown, when a load lands after a dispose), which
    // sits earlier in the file than dispose() does, so that lookup silently started
    // pointing at a different call than the one it meant to check.
    //
    // ⚠⚠ AND THE THIRD FREE HAD NO CRUMB AT ALL, which is worse than the stale lookup: a
    // process dying inside it would leave `ctx-open` standing as the last checkpoint, and
    // `ctx-open` reads as "died inside initLlama". A crumb that names the WRONG native
    // call sends the next investigation at the wrong statement — the precise failure this
    // whole instrument exists to prevent. It is bracketed now, and the test enumerates
    // rather than hand-lists, so a fourth native call cannot be added un-bracketed.
    const src = readFileSync(join(__dirname, '..', 'app', 'ai', 'generation', 'LlamaRuntime.ts'), 'utf8');

    /** Every bracket the runtime must carry: the crumb pair, and the native call it names. */
    const BRACKETS: ReadonlyArray<{ phase: string; call: string }> = [
      { phase: 'ctx-open', call: 'mod.initLlama({' },
      { phase: 'ctx-release', call: 'ctx.release())' },        // dispose(), through the lock
      { phase: 'ctx-orphan-free', call: 'await ctx.release();' }, // the straggler teardown
    ];

    for (const { phase, call } of BRACKETS) {
      const start = src.indexOf(`stampBreadcrumbPhase('${phase}')`);
      const done = src.indexOf(`stampBreadcrumbPhase('${phase}-done')`);
      expect({ phase, hasStart: start > -1 }).toEqual({ phase, hasStart: true });
      expect({ phase, hasDone: done > -1 }).toEqual({ phase, hasDone: true });
      expect({ phase, ordered: done > start }).toEqual({ phase, ordered: true });
      // ⚠ The native call sits BETWEEN the two crumbs — searched from the opening stamp
      // rather than from the top of the file, so a same-named call elsewhere cannot be
      // mistaken for this one. That substitution is exactly what went wrong above.
      const callAt = src.indexOf(call, start);
      expect({ phase, callAfterStart: callAt > start }).toEqual({ phase, callAfterStart: true });
      expect({ phase, callBeforeDone: callAt < done }).toEqual({ phase, callBeforeDone: true });
    }

    // ⚠ AND NO NATIVE CALL IS LEFT OUT. Counted against the brackets, so adding a fourth
    // free without a crumb fails here instead of being discovered by a mystery crash.
    const natives = (src.match(/mod\.initLlama\(|\.release\(\)/g) ?? []).length;
    expect(natives).toBe(BRACKETS.length);
  });

  it('⚠ the new phase names round-trip through the crumb like any other', async () => {
    stampLiveBreadcrumb({ at: Date.now(), what: 'action "go west"' });
    stampBreadcrumbPhase('appstate:background→active');
    await Promise.resolve();
    let crumb = await readLiveBreadcrumb();
    expect(crumb!.phase).toBe('appstate:background→active');
    stampBreadcrumbPhase('ctx-release');
    await Promise.resolve();
    crumb = await readLiveBreadcrumb();
    expect(crumb!.phase).toBe('ctx-release');
    expect(crumb!.what).toContain('go west'); // the action context survives phase overwrites
  });
});
