// OTA-1521 — THE RESTART IS NOT A DEATH.
//
// ⚠⚠⚠ NEARLY HALF THE CRASH LEDGER WAS THE APP KILLING ITSELF ON PURPOSE.
// Task #81 has been chasing a "native death class" — `PROCESS KILLED — no JS ran`
// records, every one at stage `rendered`, blamed first on memory pressure from
// the diagnostics bundle (OTA-1516, which did not stop them) and next on the Qwen
// context lifecycle. Both were guesses. Mining every death record out of the
// owner's own logs settled it:
//
//   18 distinct deaths. EIGHT of them land within seconds of `reloadAsync()`:
//     4s · 4s · 5s · 5s · 6s · 7s · 18s · 103s after "ota: Restarting to apply…"
//
// Six of the eight inside seven seconds. That is not the OS reaping a process
// under memory pressure; that is `Updates.reloadAsync()` doing exactly what it
// was told, and the ledger recording it as a kill.
//
// ⚠⚠ WHY IT LOOKED LIKE A KILL. hydrate() promotes a SURVIVING liveness crumb
// into a `native-death`, on the sound reasoning that an orderly shutdown clears
// its own crumb. `reloadAsync()` tears the process down with no orderly JS exit
// and nothing on that path cleared the crumb — so every OTA apply minted a
// phantom corpse. `clearLiveBreadcrumb()` had callers on backgrounding and in
// boot, but never here.
//
// ⚠⚠⚠ THE ERROR CLASS: AN ORDERLY EXIT THAT DOES NOT ANNOUNCE ITSELF IS
// INDISTINGUISHABLE FROM A KILL. And a ledger full of phantom kills is worse
// than an empty one — it is why this hunt spent an OTA on memory pressure while
// 44% of its evidence was self-inflicted. The fix is one line at each of the two
// reload sites, before the process goes away.
//
// ⚠ WHAT THIS DOES NOT CLAIM. Ten deaths remain unexplained by the OTA path, and
// they are the real #81. This change does not fix them — it stops them being
// buried in noise, which is the precondition for finding them.

import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..');
const OTA = readFileSync(join(ROOT, 'app', 'updates', 'checkAndApplyOTA.ts'), 'utf8');
const SAVE = readFileSync(join(ROOT, 'app', 'engine', 'saveSystem.ts'), 'utf8');

function codeOnly(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
}

describe('OTA-1521 — every reload announces itself first', () => {
  it('⚠⚠⚠ BOTH reloadAsync SITES CLEAR THE CRUMB, AND CLEAR IT BEFORE THE RELOAD', () => {
    const code = codeOnly(OTA);
    const reloads = [...code.matchAll(/await Updates\.reloadAsync\(\)/g)];
    // Two sites: the boot-front skipTeardown path and the full teardown path.
    expect(reloads).toHaveLength(2);
    // ⚠ SUPERSEDED BY OTA-1587 — the helper now takes WHICH reload path it is
    // announcing ('boot-front' | 'mid-session'), because the handoff note it
    // leaves for the next life records it. The claim this test makes is
    // unchanged: two sites, both clearing, both before the reload.
    const clears = [...code.matchAll(/await markOrderlyExitForReload\('[a-z-]+'\)/g)];
    expect(clears).toHaveLength(2);
    // ⚠ ORDER IS THE WHOLE POINT. A clear that runs after the process is gone
    // is not a clear — and the process is gone the instant reloadAsync resolves.
    for (let i = 0; i < 2; i++) {
      const clearAt = clears[i]?.index;
      const reloadAt = reloads[i]?.index;
      expect(typeof clearAt).toBe('number');
      expect(typeof reloadAt).toBe('number');
      expect(clearAt as number).toBeLessThan(reloadAt as number);
    }
  });

  it('⚠⚠ THE CLEAR CAN NEVER BLOCK THE RESTART', () => {
    // A rejected AsyncStorage write must not strand the player on
    // "Restarting to apply…" forever. A missed clear costs one phantom death
    // record; a hung restart costs the session. The try/catch lives inside the
    // helper so BOTH call sites inherit it and neither can forget.
    const helper = OTA.slice(OTA.indexOf('async function markOrderlyExitForReload'));
    const body = helper.slice(0, helper.indexOf('\n}'));
    expect(body).toContain('try {');
    expect(body).toContain('} catch {');
    expect(body).toContain('await save.clearLiveBreadcrumb();');
  });

  it('⚠⚠⚠ AND saveSystem IS LOADED LAZILY — a top-level import broke two suites', () => {
    // Importing saveSystem at module scope drags AsyncStorage into this file's
    // graph. checkAndApplyOTA.test.ts and ota1041OtaTeardownParallel.test.ts both
    // keep this module deliberately light and stopped RUNNING outright — and the
    // boot path would have paid for a dependency it needs only when it is
    // actually restarting. The cost belongs at the call, not at every import.
    // ⚠ `require`, not `await import()` — this project's tsconfig rejects dynamic
    // import EXPRESSIONS (TS1323), while `typeof import(...)` is a type position
    // and stays legal, so the binding is lazy AND fully typed.
    expect(OTA).toContain("const save = require('../engine/saveSystem') as typeof import('../engine/saveSystem');");
    expect(OTA).not.toMatch(/^import \{ clearLiveBreadcrumb \}/m);
  });

  it('⚠⚠ and it is the REAL clear — the one that latches an orderly exit', () => {
    // clearLiveBreadcrumb drops both halves (disk key AND the in-memory mirror)
    // and calls noteOrderlyExit(), so the next boot reads a clean shutdown
    // rather than inventing a death from a crumb that was never really gone.
    expect(SAVE).toContain('export async function clearLiveBreadcrumb()');
    expect(SAVE).toContain('noteOrderlyExit();');
    expect(SAVE).toContain('_lastLiveCrumb = null;');
  });
});

describe('OTA-1521 — the measurement, kept where it can be checked', () => {
  it('⚠⚠⚠ the reason is written at BOTH call sites, with the numbers', () => {
    // If someone later deletes the clear as "redundant", the comment is what
    // tells them it cost eight phantom corpses and an OTA spent on the wrong
    // hypothesis. Prose that carries evidence is not decoration.
    // The numbers live on the helper the two sites share, so the reasoning
    // cannot drift out of sync between them.
    const helper = OTA.slice(0, OTA.indexOf('async function markOrderlyExitForReload'));
    expect(helper).toContain('OTA-1521');
    expect(helper).toContain('4s · 4s · 5s · 5s · 6s · 7s · 18s · 103s');
    expect(helper).toContain('an orderly exit that does not');
    // ⚠ SUPERSEDED BY OTA-1587 — same claim (two call sites), matched through
    // the path argument the helper now takes.
    expect([...OTA.matchAll(/await markOrderlyExitForReload\('[a-z-]+'\)/g)]).toHaveLength(2);
  });

  it('⚠ the boot-front path still skips teardown — this changes nothing else', () => {
    // The clear is additive. The skipTeardown short-circuit that exists because
    // no native handles are open at boot-front is untouched.
    const code = codeOnly(OTA);
    expect(code).toContain('if (skipTeardown) {');
    expect(code).toContain("disposeWithDeadline('shutdownQwen'");
  });
});
