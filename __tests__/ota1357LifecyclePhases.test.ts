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

  it('⚠⚠ source lock: the native open and free are BRACKETED — a crumb inside a bracket names the call', () => {
    const src = readFileSync(join(__dirname, '..', 'app', 'ai', 'generation', 'LlamaRuntime.ts'), 'utf8');
    const open = src.indexOf("stampBreadcrumbPhase('ctx-open')");
    const openDone = src.indexOf("stampBreadcrumbPhase('ctx-open-done')");
    const rel = src.indexOf("stampBreadcrumbPhase('ctx-release')");
    const relDone = src.indexOf("stampBreadcrumbPhase('ctx-release-done')");
    for (const at of [open, openDone, rel, relDone]) expect(at).toBeGreaterThan(-1);
    // open precedes its done; release precedes its done.
    expect(openDone).toBeGreaterThan(open);
    expect(relDone).toBeGreaterThan(rel);
    // The open stamp sits before the initLlama call, the release stamp before release().
    expect(src.indexOf('mod.initLlama({')).toBeGreaterThan(open);
    expect(src.indexOf('ctx.release()')).toBeGreaterThan(rel);
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
