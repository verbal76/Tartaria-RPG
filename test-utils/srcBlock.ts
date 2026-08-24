// ⚠⚠ OTA-1447 — SOURCE PINS THAT CANNOT GO QUIET.
//
// A large family of this project's tests reads a source file as TEXT, finds a
// landmark, and asserts something about the code near it. That is a deliberate
// house style — the "receipts" pattern: a claim about how the code is wired,
// pinned where a future edit will trip over it. The pins are not the problem.
//
// ⚠⚠ THE WINDOW WAS THE PROBLEM. Every one of them measured "near" in BYTES:
// `SRC.slice(i, i + 1200)`. A byte count is a guess about code that has not
// been written yet, and it rots in two directions:
//
//   • A POSITIVE pin ("X should be here") whose target slides past the window
//     FAILS. Loud, harmless, and this project has retargeted a dozen of them.
//
//   • ⚠⚠ A NEGATIVE pin ("X must NOT be here") whose forbidden text slides past
//     the window PASSES — while checking nothing. It goes silent at exactly the
//     moment it should scream. That is the failure class this module exists to
//     make impossible, and it is the reason the owner green-lit the run.
//
// ⚠ THE FIX IS TO STOP GUESSING AND USE THE CODE'S OWN SHAPE. `blockAt` walks
// braces to find where the block actually ends, so the window is "this function"
// or "the rest of this branch" — the thing the byte count was always trying to
// approximate. It grows and shrinks WITH the code it pins, so a pin can no
// longer drift out of its own subject.
//
// ⚠ AND EVERY ANCHOR IS REQUIRED. `indexOf` returns -1 for a landmark someone
// renamed, and `slice(-1, ...)` quietly hands back a window from the END of the
// file — a second silent-pass door. Every helper here THROWS on a missing
// anchor, so a rename fails as a rename instead of as nothing at all.
//
// ⚠⚠ WHEN A BYTE WINDOW IS STILL THE RIGHT ANSWER — READ THIS BEFORE
// "FINISHING THE JOB". A handful of fixed windows survive ON PURPOSE, each
// marked at its site with "OTA-1447 KEPT A BYTE WINDOW HERE, deliberately".
// Converting them would make the pin WEAKER or WRONG, not stronger:
//
//   • The BLOCK IS NARROWER THAN THE CLAIM. An anchor inside an object literal
//     closes at that literal's `}` while the assertion is about code after it;
//     an `if (…) {` closes before the `} else {` the pin also means to cover.
//     A correct block boundary is still the wrong window for those claims.
//   • THE ANCHOR HAS NO BLOCK — a bare statement. blockAt throws rather than
//     guess, which is the design, and `between()` fits only when a genuine end
//     landmark exists.
//   • THE BLOCK IS ENORMOUS. Widening a NEGATIVE pin is always safe — more code
//     searched for a forbidden thing. Widening a POSITIVE pin LOOSENS it: "X
//     within 1600 bytes of the anchor" becomes "X somewhere in this 30,000-char
//     handler", and at the extreme (485,000 characters, measured on a real site
//     here) it proves nothing at all.
//
// Every survivor is positive, so it fails loudly rather than going silent, and
// the ratchet in scripts/check-slice-pins deliberately does not gate them.

/** Locate `anchor`, or throw naming the anchor that has gone missing. */
function requireIndex(src: string, anchor: string, from = 0): number {
  const at = src.indexOf(anchor, from);
  if (at < 0) {
    throw new Error(
      `srcBlock: anchor not found — ${JSON.stringify(anchor.slice(0, 80))}. ` +
      'The code it pinned was renamed or removed: re-anchor this test on what replaced it.',
    );
  }
  return at;
}

/**
 * ⚠ TWO SHAPES OF ANCHOR, AND GETTING THEM BACKWARDS IS THE ONE REAL TRAP.
 *
 *   • An anchor INSIDE a block (`const rvPool = rev.revenantPool();`) wants
 *     "the rest of my enclosing block" — walk until depth goes BELOW zero.
 *   • An anchor that OPENS a block (`export function logUiTap`, `case 'rest':
 *     {`) wants "my own body" — walk until depth RETURNS to zero.
 *
 * Run the second with the first's rule and the window never closes: depth at
 * top level never drops below zero, so it swallows the rest of the FILE. That
 * was measured at 1.7M characters on a real site during this conversion — a
 * positive pin over the whole file proves nothing at all. Hence the detection
 * below, and hence `mode` is overridable when a site knows better.
 */
function walk(src: string, start: number, mode: 'inside' | 'opener'): string | null {
  let depth = 0;
  let opened = false;
  let i = start;
  while (i < src.length) {
    const c = src[i]!;
    const next = src[i + 1];
    // Line comment
    if (c === '/' && next === '/') {
      const nl = src.indexOf('\n', i);
      i = nl < 0 ? src.length : nl + 1;
      continue;
    }
    // Block comment
    if (c === '/' && next === '*') {
      const end = src.indexOf('*/', i + 2);
      i = end < 0 ? src.length : end + 2;
      continue;
    }
    // Strings and template literals — skipped wholesale, escapes honoured.
    // ⚠ This codebase's narration is FULL of unbalanced braces inside quotes;
    // counting them would end windows in the middle of a sentence.
    if (c === '"' || c === "'" || c === '`') {
      const quote = c;
      i += 1;
      while (i < src.length) {
        if (src[i] === '\\') { i += 2; continue; }
        if (src[i] === quote) { i += 1; break; }
        i += 1;
      }
      continue;
    }
    if (c === '{') { depth += 1; opened = true; i += 1; continue; }
    if (c === '}') {
      depth -= 1;
      if (mode === 'inside' && depth < 0) return src.slice(start, i + 1);
      if (mode === 'opener' && opened && depth === 0) return src.slice(start, i + 1);
      i += 1;
      continue;
    }
    i += 1;
  }
  return null; // never closed — not a real block under this rule
}

/**
 * ⚠⚠ WHICH `{` IS THE BODY? A signature is full of braces that are not it:
 *
 *   beginScene(opts?: { openingPrefix?: string })            ← a parameter type
 *   function backfill(x): Record<string, { weak: string[] }> ← a return type
 *
 * Closing on the first balanced group returns the SIGNATURE and calls it the
 * body — which is exactly how three converted pins failed during this run,
 * loudly and usefully. Parameter braces are ruled out by paren depth; a return
 * type's are not (they sit at paren depth 0 inside angle brackets, and telling
 * generics from comparison operators is not worth a parser here).
 *
 * ⚠⚠ THE RULE IS POSITION, NOT SIZE. The first cut here took the LONGEST
 * balanced group, reasoning that a body outweighs a type literal. It does — but
 * an unbounded "longest" scan runs to end-of-file and cheerfully picks some
 * unrelated function 50k away because it happens to be bigger, pinning a test to
 * the WRONG code while still looking healthy. A real negative pin
 * (ota1275RewarmDebounce) failed on exactly that, which is how it was caught.
 *
 * So: take the FIRST candidate `{` at paren depth 0 — except one sitting in a
 * TYPE position, which is what the preceding character tells us:
 *
 *   Record<string, { weak: string[] }> {   ← `,` before it: a type literal
 *   ) {                                    ← `)` before it: the body
 *   case 'rest': {                         ← `:` before it: a body
 *   ): { total: number } {                 ← `:` before it: a RETURN TYPE
 *
 * ⚠⚠ THE LAST TWO PAIR ON `:` AND MEAN OPPOSITE THINGS, which is what broke
 * eight assertions across four suites before it was pinned down. They are told
 * apart by what precedes the colon: a return type's colon follows the parameter
 * list's `)`, a case label's does not. Everything else is decided by the single
 * character before the brace, and the first survivor wins.
 */
const TYPE_POSITION = new Set([',', '<', '|', '&', '=']);

/** Is this `{` in a type position rather than opening a body? */
function inTypePosition(src: string, braceAt: number, floor: number): boolean {
  let k = braceAt - 1;
  while (k > floor && /\s/.test(src[k]!)) k -= 1;
  const prev = src[k]!;
  if (TYPE_POSITION.has(prev)) return true;
  if (prev !== ':') return false;
  // `:` — a return type's colon sits right after the parameter list's `)`;
  // a `case 'x':` label's does not.
  let j = k - 1;
  while (j > floor && /\s/.test(src[j]!)) j -= 1;
  return src[j] === ')';
}

function openerBody(src: string, start: number): string | null {
  let parens = 0;
  let i = start;
  const limit = src.length;
  while (i < limit) {
    const c = src[i]!;
    const next = src[i + 1];
    if (c === '/' && next === '/') { const nl = src.indexOf('\n', i); i = nl < 0 ? limit : nl + 1; continue; }
    if (c === '/' && next === '*') { const e = src.indexOf('*/', i + 2); i = e < 0 ? limit : e + 2; continue; }
    if (c === '"' || c === "'" || c === '`') {
      const q = c; i += 1;
      while (i < limit) { if (src[i] === '\\') { i += 2; continue; } if (src[i] === q) { i += 1; break; } i += 1; }
      continue;
    }
    if (c === '(') { parens += 1; i += 1; continue; }
    if (c === ')') { parens -= 1; i += 1; continue; }
    if (c === '{') {
      const group = walk(src, i, 'opener');
      // A brace inside the parameter list is never the body; nor is one in a
      // type position. Either way the whole group is skipped — nested braces
      // cannot be the body of the thing this anchor opened.
      if (parens <= 0 && group && !inTypePosition(src, i, start)) {
        return src.slice(start, i + group.length);
      }
      i += group ? group.length : 1;
      continue;
    }
    i += 1;
  }
  return null;
}

/** Anchors that look like they OPEN a block rather than sit inside one. */
const OPENS_A_BLOCK = /(?:\bfunction\b|=>\s*\{|\)\s*\{|\bcase\b[^:]*:\s*\{|\{\s*$)/;

/**
 * The block a source anchor names: its own body when the anchor opens one,
 * otherwise the rest of the block enclosing it. Brace-aware, so the window
 * grows and shrinks WITH the code it pins instead of guessing a byte count.
 *
 * Throws when the anchor is missing, and throws when neither rule closes a
 * block — silence is the one thing a source pin must never do.
 */
export function blockAt(
  src: string,
  anchor: string,
  opts?: { mode?: 'inside' | 'opener'; from?: number },
): string {
  const start = requireIndex(src, anchor, opts?.from ?? 0);
  const primary = opts?.mode ?? (OPENS_A_BLOCK.test(anchor) ? 'opener' : 'inside');
  const run = (mode: 'inside' | 'opener') =>
    mode === 'opener' ? openerBody(src, start) : walk(src, start, 'inside');
  const fallback = primary === 'inside' ? 'opener' : 'inside';
  const hit = run(primary) ?? (opts?.mode ? null : run(fallback));
  if (hit === null) {
    throw new Error(
      `srcBlock: no block closes after ${JSON.stringify(anchor.slice(0, 80))}. ` +
      'Pass an explicit mode, or pin the span with between() instead.',
    );
  }
  return hit;
}

/**
 * ⚠ OTA-1484 — THE CALL IS ITS OWN WINDOW. Two byte-window survivors (ota1186,
 * ota1358) pinned claims about a CALL'S ARGUMENTS — a paren group, which
 * blockAt's brace walker cannot see and a paren-stopping regex famously cannot
 * close (the wrapped call is itself a call, so a non-greedy `\)` stops at the
 * inner one; ota1358 wrote that lesson down and then kept a 220-byte guess
 * anyway). This walks the parens the way blockAt walks braces: comments and
 * strings skipped, depth counted, silence impossible.
 *
 * Anchor on the callee, open paren included (`hubRoomFor(`); the window is the
 * whole call expression through its own closing paren, however long the
 * arguments grow.
 */
export function callAt(src: string, anchor: string, opts?: { from?: number }): string {
  const start = requireIndex(src, anchor, opts?.from ?? 0);
  // The call's open paren: inside the anchor when the anchor carries it,
  // otherwise the next one — but NEAR, or this is not a call site at all.
  let i = src.indexOf('(', start);
  if (i < 0 || i > start + anchor.length + 40) {
    throw new Error(
      `srcBlock: no call opens at ${JSON.stringify(anchor.slice(0, 80))} — ` +
      'callAt pins a call expression; anchor it on the callee, open paren included.',
    );
  }
  let depth = 0;
  while (i < src.length) {
    const c = src[i]!;
    const next = src[i + 1];
    if (c === '/' && next === '/') { const nl = src.indexOf('\n', i); i = nl < 0 ? src.length : nl + 1; continue; }
    if (c === '/' && next === '*') { const e = src.indexOf('*/', i + 2); i = e < 0 ? src.length : e + 2; continue; }
    if (c === '"' || c === "'" || c === '`') {
      const q = c; i += 1;
      while (i < src.length) { if (src[i] === '\\') { i += 2; continue; } if (src[i] === q) { i += 1; break; } i += 1; }
      continue;
    }
    if (c === '(') { depth += 1; i += 1; continue; }
    if (c === ')') {
      depth -= 1;
      if (depth === 0) return src.slice(start, i + 1);
      i += 1;
      continue;
    }
    i += 1;
  }
  throw new Error(
    `srcBlock: the call at ${JSON.stringify(anchor.slice(0, 80))} never closes — ` +
    'unbalanced parens under the walker (or the anchor is not a call at all).',
  );
}

/**
 * The source between two REQUIRED landmarks — for pins whose subject is a span
 * with a real end ("between the check and the return"), rather than the rest of
 * a block. `to` is searched for after `from`, and both must exist.
 */
export function between(src: string, from: string, to: string): string {
  const start = requireIndex(src, from);
  const end = requireIndex(src, to, start + from.length);
  return src.slice(start, end + to.length);
}

/**
 * ⚠⚠ THE NEGATIVE PIN'S SAFETY BELT — an assert-absent that cannot go quiet.
 *
 * `canary` names something that MUST be inside the window. It is checked FIRST,
 * so if the window ever stops covering its subject the test fails on the canary
 * ("we are no longer looking at the right code") instead of passing on the
 * absence ("we looked at the wrong code and found nothing, so all is well").
 *
 * A negative pin without a canary is the exact defect this module was built to
 * retire, so the canary is a required argument rather than an option.
 */
export function expectAbsent(
  window: string,
  forbidden: string | RegExp,
  canary: string | RegExp,
): void {
  const hasCanary = typeof canary === 'string' ? window.includes(canary) : canary.test(window);
  if (!hasCanary) {
    throw new Error(
      `srcBlock: the window no longer contains its canary (${JSON.stringify(String(canary).slice(0, 80))}), ` +
      'so an "is absent" result would prove nothing. Re-anchor this pin.',
    );
  }
  const hasForbidden = typeof forbidden === 'string'
    ? window.includes(forbidden)
    : forbidden.test(window);
  if (hasForbidden) {
    throw new Error(
      `srcBlock: forbidden text is present in the window — ${JSON.stringify(String(forbidden).slice(0, 120))}`,
    );
  }
}
