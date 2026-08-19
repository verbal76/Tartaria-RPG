// OTA-1204 — THE REASON, NOT JUST THE VERDICT. And a "for good" that said itself three times.
//
// ⚠⚠ WHAT THE OWNER'S 2026-08-09 REPORT ON BUILD 1203 SETTLED, and it is the good news
// first: **OTA-1203's fix works end to end.**
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

const STORE = fs.readFileSync(path.join(__dirname, '..', 'app/state/gameStore.ts'), 'utf8');
const ABOUT = fs.readFileSync(path.join(__dirname, '..', 'app/diagnostics/aboutSummary.ts'), 'utf8');

function codeOnly(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

describe('OTA-1204 — the report says WHY the model failed', () => {
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

describe('OTA-1204 — "for good" is said once', () => {
  const code = codeOnly(STORE);

  test('the permanent message has its own flag', () => {
    expect(code).toContain('let rpStandDownLogged = false;');
    expect(code).toContain('if (!rpStandDownLogged) {');
  });

  test('⚠⚠ a memory warning re-arms the QUIET notice but NOT the stand-down', () => {
    // This is the whole fix. `rpMemoryQuietLogged = false` fires on every warning; if the
    // stand-down shared it, the permanent message repeats — which is what the device log
    // shows three times.
    // ⚠ Asserted by LOCATION, not by a total count. My first version expected 2 and got 3
    // because the declaration matches too — a magic total that is one refactor from being
    // wrong for a reason nobody will want to reread. What actually matters is WHERE each
    // reset lives, so that is what this checks.
    const watchdog = code.indexOf('rpMemoryPressureUntil = 0;');
    expect(watchdog).toBeGreaterThan(-1);
    const restartBlock = code.slice(watchdog, watchdog + 300);
    // The watchdog restart clears BOTH — a fresh session starts clean.
    expect(restartBlock).toContain('rpMemoryQuietLogged = false;');
    expect(restartBlock).toContain('rpStandDownLogged = false;');
  });

  test('⚠ the per-warning handler does not touch the stand-down flag', () => {
    const i = code.indexOf("AppState.addEventListener('memoryWarning'");
    expect(i).toBeGreaterThan(-1);
    const handler = code.slice(i, i + 3000);
    expect(handler).toContain('rpMemoryQuietLogged = false;');
    expect(handler).not.toContain('rpStandDownLogged');
  });

  test('the two messages are on separate branches, not one ternary', () => {
    // They had different lifetimes all along; sharing a ternary is what let them share a
    // flag without anyone noticing.
    expect(code).toContain('if (rpQwenStoodDownForMemory) {');
    expect(code).toContain('} else if (!rpMemoryQuietLogged) {');
    expect(code).toContain('STANDING DOWN for good');
    expect(code).toContain('holding reloads for ');
  });

  test('⚠ the behaviour is unchanged — the gate still refuses the reload', () => {
    // Only the logging was wrong. The interlock itself was doing its job in that log: no
    // reload followed any of the three messages.
    expect(code).toContain('if (rpQwenStoodDownForMemory || Date.now() < rpMemoryPressureUntil)');
    const i = code.indexOf('if (rpQwenStoodDownForMemory || Date.now() < rpMemoryPressureUntil)');
    expect(code.slice(i, i + 1600)).toContain('return false;');
  });
});
