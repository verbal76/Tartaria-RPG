// OTA-1181 — THE REASON, NOT JUST THE VERDICT. And a "for good" that said itself three times.
//
// ⚠⚠ WHAT THE OWNER'S 2026-08-09 REPORT ON BUILD 1203 SETTLED, and it is the good news
// first: **OTA-1180's fix works end to end.**
//
//     Boot stage: qwen:failed              ← was falsely `qwen:done` one build ago
//     Narration engine: failed             ← the new line, correct
//     Last init attempt:  03:50:28.146Z
//     Last init success:  03:50:25.130Z    ← success now PRECEDES the attempt, i.e. the
//                                            attempt failed and wrote nothing. Exactly the
//                                            signature that was inverted before.
//
// ⚠⚠ AND WHAT IT COULD NOT ANSWER, WHICH IS THE POINT OF THIS OTA. Three reports in a row
// have now said the model does not load. Not one of them could say WHY — and `qwenError`
// has been sitting in the store the entire time, written by `bootQwen()` on every failure
// (`qwen.getLastError() ?? 'Qwen failed to initialize'`) and surfaced NOWHERE: not in the
// report, not in mlHealth, not in the log. Every theory about that failure has therefore
// been inference over an answer the app already had.
//
// ⚠ SECOND FIX — A PERMANENT MESSAGE THAT REPEATED. Same log:
//     03:53:17.845  qwen-watchdog: 3 memory warnings this session — STANDING DOWN for good.
//     03:53:52.943  qwen-watchdog: 5 memory warnings this session — STANDING DOWN for good.
//     03:53:57.963  qwen-watchdog: 6 memory warnings this session — STANDING DOWN for good.
// The BEHAVIOUR was correct — no reload followed any of them. But `rpMemoryQuietLogged` is
// reset by every memory warning, which is right for the 90-second quiet notice (each
// warning really does open a new window) and wrong for the permanent stand-down, whose
// entire claim is that it happens once. A line that says "for good" three times reads as a
// loop that is not happening, which is the worst thing a diagnostic log can do.

import fs from 'fs';
import path from 'path';
import { blockAt } from '../test-utils/srcBlock';

const STORE = fs.readFileSync(path.join(__dirname, '..', 'app/state/gameStore.ts'), 'utf8');
// ⚠⚠ OTA-1396 — THE FLAG AND THE MESSAGE NOW LIVE IN DIFFERENT FILES, and this suite is
// the one that had to say the most about it. Slice 5 of the store split moved the five
// memory-pressure latches — including `rpStandDownLogged`, which this OTA created — down
// into `app/diagnostics/runtimePressureWatch.ts`, because the freeze instruments and the
// qwen watchdog BOTH read and write them and shared mutable state cannot travel with
// either owner. The watchdog stayed in gameStore and reaches them through accessors.
//
// ⚠ SO EACH PIN BELOW MOVED TO WHICHEVER FILE OWNS ITS HALF, and the assertions got
// STRONGER rather than looser: the "re-arms one but not the other" claim used to compare
// two assignments sitting near each other in one file, and is now a comparison between a
// named reset function and a handler that provably does not call it.
const WATCH = fs.readFileSync(
  path.join(__dirname, '..', 'app/diagnostics/runtimePressureWatch.ts'), 'utf8',
);
// ⚠⚠ OTA-1397 — SLICE 6 MOVED THE OTHER OWNER, and the seam this OTA is about no
// longer touches gameStore at all. The watchdog — which reads the latches and
// prints both messages — is now `app/ai/qwenWatchdog.ts`. What OTA-1181 fixed was
// two messages with different lifetimes sharing one flag; that claim is now a
// claim about two leaves, and neither of them is the store.
const WATCHDOG = fs.readFileSync(
  path.join(__dirname, '..', 'app/ai/qwenWatchdog.ts'), 'utf8',
);
const ABOUT = fs.readFileSync(path.join(__dirname, '..', 'app/diagnostics/aboutSummary.ts'), 'utf8');

function codeOnly(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

describe('OTA-1181 — the report says WHY the model failed', () => {
  const code = codeOnly(ABOUT);

  test('qwenError is read and printed', () => {
    expect(code).toContain('st.qwenError');
    expect(code).toContain('Why: ${err}');
  });

  test("⚠ the reason only appears when the status is 'failed'", () => {
    // A stale error string under a `ready` engine would be worse than silence — it would
    // read as a live failure on a session that is working.
    expect(code).toContain("status === 'failed' && err");
  });

  test('an absent reason prints nothing rather than an empty label', () => {
    expect(code).toContain("? `\\n  Why: ${err}` : ''");
  });

  test('it still cannot break the export', () => {
    const i = code.indexOf('function contextLedgerBlock');
    // ⚠ Brace-matched rather than a fixed slice. Four assertions in this repo needed their
    // windows widened this session because a handler grew a comment and a magic-number
    // slice stopped reaching its target; a slice that falls short reads as "the code is
    // missing" rather than "my window is too small". Same claim, no magic number.
    let depth = 0; let end = i;
    for (let k = code.indexOf('{', i); k < code.length; k++) {
      if (code[k] === '{') depth++;
      else if (code[k] === '}') { depth--; if (depth === 0) { end = k; break; } }
    }
    const body = code.slice(i, end + 1);
    expect(body).toContain('catch');
    expect((body.match(/try \{/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });
});

describe('OTA-1181 — "for good" is said once', () => {
  // ⚠ OTA-1397 — `code` was gameStore; it is the watchdog now. The variable name
  // is left alone so the assertions read unchanged from the OTA that wrote them.
  const code = codeOnly(WATCHDOG);
  const watch = codeOnly(WATCH);

  test('the permanent message has its own flag', () => {
    // ⚠ The flag now lives with the other four latches; the message that reads it stays
    // in the watchdog, so this claim spans both files and is checked on both.
    expect(watch).toContain('let rpStandDownLogged = false;');
    expect(code).toContain('if (!standDownAlreadyLogged()) {');
  });

  test('⚠⚠ a memory warning re-arms the QUIET notice but NOT the stand-down', () => {
    // This is the whole fix. `rpMemoryQuietLogged = false` fires on every warning; if the
    // stand-down shared it, the permanent message repeats — which is what the device log
    // shows three times.
    // ⚠ Asserted by LOCATION, not by a total count. My first version expected 2 and got 3
    // because the declaration matches too — a magic total that is one refactor from being
    // wrong for a reason nobody will want to reread. What actually matters is WHERE each
    // reset lives, so that is what this checks.
    const clear = watch.indexOf('export function clearMemoryPressureLatches(): void {');
    expect(clear).toBeGreaterThan(-1);
    const clearBlock = watch.slice(clear, watch.indexOf('}', clear) + 1);
    // The full-reset path clears BOTH — a fresh session starts clean.
    expect(clearBlock).toContain('rpMemoryQuietLogged = false;');
    expect(clearBlock).toContain('rpStandDownLogged = false;');
    // ⚠ …and the watchdog restart is the caller, so "a fresh session starts clean" is
    // still a claim about the watchdog and not just about a function nobody invokes.
    expect(code).toContain('clearMemoryPressureLatches();');
  });

  test('⚠ the per-warning handler does not touch the stand-down flag', () => {
    const i = watch.indexOf("AppState.addEventListener('memoryWarning'");
    expect(i).toBeGreaterThan(-1);
    const handler = blockAt(watch, "AppState.addEventListener('memoryWarning'");
    expect(handler).toContain('rpMemoryQuietLogged = false;');
    expect(handler).not.toContain('rpStandDownLogged');
    // ⚠ AND IT CANNOT REACH IT BY THE BACK DOOR EITHER. The one-call reset would set the
    // stand-down flag too, so calling it here would reintroduce the exact bug this OTA
    // fixed — a permanent message re-armed by every warning.
    expect(handler).not.toContain('clearMemoryPressureLatches()');
  });

  test('the two messages are on separate branches, not one ternary', () => {
    // They had different lifetimes all along; sharing a ternary is what let them share a
    // flag without anyone noticing.
    expect(code).toContain('if (qwenStoodDownForMemory()) {');
    expect(code).toContain('} else if (!memoryQuietAlreadyLogged()) {');
    expect(code).toContain('STANDING DOWN for good');
    expect(code).toContain('holding reloads for ');
  });

  test('⚠ the behaviour is unchanged — the gate still refuses the reload', () => {
    // Only the logging was wrong. The interlock itself was doing its job in that log: no
    // reload followed any of the three messages.
    // ⚠ OTA-1396 — `Date.now() < rpMemoryPressureUntil` is now `underMemoryPressure()`,
    // which reads the same variable behind an accessor and takes `now` as an argument so
    // the comparison itself stayed in one place rather than being copied to a caller.
    expect(code).toContain('if (qwenStoodDownForMemory() || underMemoryPressure()) {');
    const i = code.indexOf('if (qwenStoodDownForMemory() || underMemoryPressure()) {');
    expect(code.slice(i, i + 1600)).toContain('return false;');
    expect(watch).toContain('return now < rpMemoryPressureUntil;');
  });
});
