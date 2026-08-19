// OTA-1202 — THE MEMORY LINE SAYS WHAT IT ACTUALLY FREED. IT USED TO LIE, AND IT LIED TO ME.
//
// ⚠⚠ THE MEASUREMENT. Owner's bug report, 2026-08-09, on build 2026-08-09-1200. Five
// memory warnings, and EVERY ONE of them reports no model loaded:
//
//   02:50:45.915  ⚠⚠ MEMORY WARNING #1 from the OS — app=active · qwen='failed' · reloads=0
//   02:50:45.964  memory: released the Qwen context (~400MB) …
//   02:50:51.191  ⚠⚠ MEMORY WARNING #2 (5.3s) — qwen='idle' · reloads=0
//   02:50:51.237  memory: released the Qwen context (~400MB) …
//   02:50:51.281  ⚠⚠ MEMORY WARNING #3 (0.1s) — qwen='idle' · reloads=0
//   02:51:35.205  ⚠⚠ MEMORY WARNING #4 (43.9s) — qwen='idle' · reloads=0 · save=86KB
//   02:51:36.232  ⚠⚠ MEMORY WARNING #5 (1.0s) — qwen='idle' · reloads=0 · save=86KB
//
// `qwen='idle'`/`'failed'` means THERE WAS NO CONTEXT. Every one of those disposes freed
// zero bytes, and the log announced ~400MB each time, because the line was printed
// unconditionally the moment `dispose()` resolved — an outcome stated without ever being
// checked.
//
// ⚠⚠ AND I QUOTED THOSE LINES AS EVIDENCE. The OTA-1198 write-up cites
// "memory: released the Qwen context (~400MB)" as part of its reload-loop reconstruction.
// A diagnostic that asserts an outcome it never verified is worse than no diagnostic,
// because it gets read as measurement — the exact failure this week's gate exists to stop,
// living inside the instrumentation itself.
//
// ⚠ WHAT THE HONEST LINE BUYS. If the OS asks for memory back while we hold no model,
// then the model is not what it is asking about, and the search moves. That sentence is
// the most valuable output this investigation could have, and the old line was actively
// suppressing it.
//
// ⚠ SECOND CHANGE, AND IT IS AN INSTRUMENT, NOT A FIX. The warning line now also names the
// OTHER native model — the bundled Kokoro voice. That report reads `Kokoro state: ready`
// while every warning reads `qwen='idle'`, so the only large model we demonstrably held at
// those moments was the voice. TTSManager's own comment prices a voice swap at "~100 MB to
// the pool". ⚠ That is a LEAD, NOT A VERDICT — ~100MB does not explain a 1.9GB jetsam, and
// this field exists to make the next report settle it either way, not to argue a case.

import {
  memoryWarningLine,
  type MemoryWarningContext,
} from '../app/diagnostics/runtimePressure';

describe('OTA-1202 — the warning line names both native models', () => {
  test('the voice phase appears beside the qwen status', () => {
    const line = memoryWarningLine(1, null, {
      appState: 'active',
      qwenStatus: 'idle',
      kokoroPhase: 'ready',
      qwenReinitAttempts: 0,
    });
    expect(line).toContain("qwen='idle'");
    expect(line).toContain("voice='ready'");
    // ⚠ Adjacent, because the pair IS the question: which of our two native models was
    // actually up when the OS complained. Split apart it stops being one reading.
    expect(line.indexOf("voice='ready'") - line.indexOf("qwen='idle'")).toBeLessThan(30);
  });

  test('the owner report reconstructs exactly, now with the missing half', () => {
    // The line that would have been written for MEMORY WARNING #5.
    const line = memoryWarningLine(5, 1000, {
      appState: 'active',
      qwenStatus: 'idle',
      kokoroPhase: 'ready',
      qwenReinitAttempts: 0,
      saveKb: 86,
    });
    expect(line).toContain('MEMORY WARNING #5');
    expect(line).toContain('1.0s since the last one');
    expect(line).toContain("qwen='idle'");
    expect(line).toContain("voice='ready'");
    expect(line).toContain('save=86KB');
  });

  test('an absent voice phase is omitted, not printed as undefined', () => {
    const line = memoryWarningLine(1, null, { qwenStatus: 'ready' } as MemoryWarningContext);
    expect(line).not.toContain('voice=');
    expect(line).not.toContain('undefined');
  });

  test('the line still works with no context at all', () => {
    const line = memoryWarningLine(1, null, {});
    expect(line).toContain('MEMORY WARNING #1');
    expect(line).toContain('first this session');
    expect(line).not.toContain('undefined');
  });
});

describe('OTA-1202 — the release claim is conditional on an actual release', () => {
  // ⚠ Asserted on STRUCTURE, not on prose proximity. An earlier OTA in this codebase
  // shipped a regex that matched its own trailing comment and passed for the wrong
  // reason; these pin the code expressions themselves.
  const fs = require('fs') as typeof import('fs');
  const path = require('path') as typeof import('path');
  const src = fs.readFileSync(path.join(__dirname, '..', 'app/state/gameStore.ts'), 'utf8');

  test('the handler snapshots the release count before disposing', () => {
    expect(src).toContain('const before = contextLedger().released;');
  });

  test('the ~400MB claim is inside a branch, never unconditional', () => {
    // The old line was a bare appendLog after .then(). The new one must be selected by a
    // comparison, so there is exactly one `freed` computation gating it.
    expect(src).toContain('const freed = contextLedger().released > before;');
    expect(src).toMatch(/freed\s*\n?\s*\?/);
  });

  test('the nothing-freed branch says so, and points the search elsewhere', () => {
    expect(src).toContain('NOTHING TO RELEASE');
    expect(src).toContain('freed 0 bytes');
    // ⚠ THE SENTENCE THE INVESTIGATION NEEDED. Without it the reader is left to assume
    // the model was the problem, which is the assumption that cost a day.
    expect(src).toContain('The pressure is coming from something else');
  });

  test('the qwen status at the moment of the warning is carried into the message', () => {
    // Not re-read after the dispose — by then it is always 'idle' and would say nothing.
    expect(src).toContain('const statusAtWarning = qwenStatus');
    expect(src).toContain("qwen='${statusAtWarning}'");
  });

  test('the estimate is labelled as one wherever it is printed', () => {
    // ⚠ A ~425MB guess became a premise once already this week — stated once, then cited
    // as fact five times, and used to argue the phone should cope. It came back 4.5x low.
    // ⚠ Anchored on the CODE EXPRESSION, not on the prose. The first attempt matched
    // `memory: released the Qwen context` inside a comment quoting the OTA-1198 log and
    // read the wrong block entirely — the same non-unique-anchor trap this repo has hit
    // before. The interpolation below appears exactly once, in the line that ships.
    expect(src).toContain('(~${APPROX_CONTEXT_MB}MB est)');
    expect(src.match(/\(~\$\{APPROX_CONTEXT_MB\}MB est\)/g) ?? []).toHaveLength(1);
  });
});
