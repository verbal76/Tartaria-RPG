/**
 * OTA-1447 — SOURCE PINS THAT CANNOT GO QUIET.
 *
 * Owner, on the long-held slice item: *"1 full, 2 might as well address them."*
 *
 * ⚠⚠ THE MEASURED PROBLEM. 169 tests pinned a claim about the code by reading a
 * source file as TEXT and asserting inside a BYTE window — `SRC.slice(i, i +
 * 1200)`. Split by direction, that is two very different debts:
 *
 *   • 151 POSITIVE pins ("X should be here"). When the code moves, the target
 *     slides out of the window and the test FAILS. Noisy — this project has
 *     retargeted a dozen — but it can never hide a defect.
 *
 *   • ⚠⚠ 18 NEGATIVE pins ("X must NOT be here"). When the code between the
 *     anchor and the forbidden text grows, the forbidden text slides OUT and the
 *     test PASSES, having checked nothing. It goes silent at exactly the moment
 *     it should scream — a test that reports safety it did not verify.
 *
 * All 18 are converted. This suite is the helper's own receipts: a safety net
 * with no tests is just a claim.
 */
import { blockAt, between, expectAbsent } from '../test-utils/srcBlock';

const SRC = [
  "function alpha(a) {",
  "  const label = 'a } brace in a string';",
  "  // a } brace in a comment",
  "  if (a) {",
  "    inner();",
  "  }",
  "  return label;",
  "}",
  "function beta() {",
  "  forbiddenCall();",
  "}",
].join('\n');

describe('OTA-1447 — the window follows the code, not a byte count', () => {
  it('⚠⚠ an anchor that OPENS a block gets its own body — and stops there', () => {
    const b = blockAt(SRC, 'function alpha(a) {');
    expect(b).toContain('return label;');
    // ⚠ THE WHOLE POINT: it must not run on into the next function. Walking with
    // the wrong rule here swallowed 1.7M characters of a real source file during
    // this conversion — a pin over the whole file proves nothing.
    expect(b).not.toContain('forbiddenCall');
    expect(b.trimEnd().endsWith('}')).toBe(true);
  });

  it('⚠⚠ an anchor INSIDE a block gets the rest of its enclosing block', () => {
    const b = blockAt(SRC, 'inner();');
    expect(b).toContain('inner();');
    expect(b).not.toContain('return label;'); // closes at the if-block's }
  });

  it('⚠⚠ braces inside strings and comments do not end the window', () => {
    // This codebase's narration is full of unbalanced braces; counting one would
    // end a window mid-sentence and quietly shrink every pin below it.
    const b = blockAt(SRC, 'const label =');
    expect(b).toContain('return label;');
  });

  it('⚠⚠ A SIGNATURE\'S TYPE BRACES ARE NOT ITS BODY', () => {
    // Both of these fooled the first cut of the walker: it closed on the first
    // balanced group and handed back the SIGNATURE, calling it the body. Three
    // converted pins failed on it — loudly, which is how it got fixed.
    const params = 'function f(opts?: { a?: string }) {\n  realBody();\n}';
    expect(blockAt(params, 'function f(')).toContain('realBody();');
    const ret = 'function g(x): Record<string, { weak: string[] }> {\n  realBody();\n}';
    expect(blockAt(ret, 'function g(')).toContain('realBody();');
  });

  it('⚠⚠ THE BODY IS THIS ANCHOR\'S, NOT THE BIGGEST ONE IN THE FILE', () => {
    // ⚠ The regression that matters most. "Longest balanced group" without a
    // bound scans to end-of-file, so a small `if` block would be abandoned in
    // favour of some unrelated 50k function further down — pinning the test to
    // the WRONG code while still looking healthy. A real negative pin
    // (ota1275RewarmDebounce) failed on exactly this and is why the bound exists.
    const src = [
      "if (status === 'background') {",
      '  shutdownNow();',
      '}',
      'function somethingMuchLargerLater() {',
      `  ${'filler();\n  '.repeat(60)}`,
      '  setTimeout(rewarm, 1000);',
      '}',
    ].join('\n');
    const b = blockAt(src, "if (status === 'background') {");
    expect(b).toContain('shutdownNow();');
    expect(b).not.toContain('setTimeout'); // the later, bigger block is not ours
    expect(b.length).toBeLessThan(80);
  });

  it('⚠⚠ A MISSING ANCHOR THROWS — it never returns a window from nowhere', () => {
    // `indexOf` returns -1 for a renamed landmark, and slice(-1, …) hands back
    // the END of the file: a second silent-pass door. It is closed.
    expect(() => blockAt(SRC, 'function gamma()')).toThrow(/anchor not found/);
  });

  it('⚠ between() requires BOTH landmarks', () => {
    expect(between(SRC, 'function alpha', 'return label;')).toContain('inner();');
    expect(() => between(SRC, 'function alpha', 'nope()')).toThrow(/anchor not found/);
  });
});

describe('OTA-1447 — expectAbsent cannot pass by looking away', () => {
  it('⚠⚠ THE DEFECT CLASS, DIRECTLY: no canary in the window means NO PASS', () => {
    // This is the failure the whole OTA exists to retire. If the window has
    // drifted off its subject, "the forbidden text is absent" is not evidence of
    // anything — so it fails instead of passing.
    expect(() => expectAbsent('unrelated text', 'forbidden', 'canary'))
      .toThrow(/no longer contains its canary/);
  });

  it('⚠⚠ a window that IS on its subject passes — and still catches the forbidden text', () => {
    expect(() => expectAbsent('canary here, nothing else', 'forbidden', 'canary')).not.toThrow();
    expect(() => expectAbsent('canary here and forbidden too', 'forbidden', 'canary'))
      .toThrow(/forbidden text is present/);
  });

  it('⚠ regexes work on both arguments', () => {
    expect(() => expectAbsent('canary 42', /forbid+en/, /canary \d+/)).not.toThrow();
    expect(() => expectAbsent('canary 42 forbidden', /forbid+en/, /canary \d+/)).toThrow();
  });
});

describe('OTA-1447 — the ratchet that keeps the shape from coming back', () => {
  const read = (...p: string[]) =>
    require('fs').readFileSync(require('path').join(__dirname, '..', ...p), 'utf8') as string;

  it('⚠⚠ ZERO negative fixed-window pins remain, and the baseline says so', () => {
    // The guard counts them; the baseline freezes the count. Both must agree
    // that the dangerous class is empty, or a new one can slip in unnoticed.
    expect(read('.ci-slice-pins-baseline').trim()).toBe('0');
  });

  it('⚠⚠ the guard is wired into the gate — an unrun check guards nothing', () => {
    const pkg = JSON.parse(read('package.json')) as { scripts: Record<string, string> };
    expect(pkg.scripts['check:slicepins']).toBe('node scripts/check-slice-pins.mjs');
  });

  it('⚠ the guard tracks the two directions separately, and gates the dangerous one', () => {
    const guard = read('scripts', 'check-slice-pins.mjs');
    expect(guard).toContain("if (ctx.includes('.not.')) negatives.push");
    expect(guard).toContain('count > baseline');
  });
});
