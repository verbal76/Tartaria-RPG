#!/usr/bin/env node
/**
 * OTA-1484 — THE GATE FOR PINS THAT QUOTE SOURCE INSTEAD OF STATING A CLAIM.
 *
 * ⚠⚠ EIGHT PINS BROKE THIS WEEK on rewordings, none on defects: ota1301,
 * ota1104, ota1466, ota1187 (found while fixing OTA-1467..1470), ota1159 ×2 and
 * ota931 (OTA-1476), ota1404 and ota1298 (OTA-1477/1479), and OTA-1481's own
 * first draft quoted a clamp it rewrote an hour later. Every one was found by a
 * fix, not by a gate. `check:slicepins` counts fixed-window slices and is blind
 * to this shape.
 *
 * TWO RULES, DIFFERENT TEETH:
 *
 *  1 ⚠⚠ BAN: a pin whose literal exists ONLY INSIDE A COMMENT of the source file
 *    it reads. There is no legitimate case — a comment is documentation, so the
 *    pin fails when the prose is reworded and passes when the behaviour the
 *    prose describes is deleted. Both failure directions are wrong. (`ota1468`
 *    quoting the Cantor SURVIVES this rule: that text is a string constant in
 *    CODE — quoting it IS the claim.)
 *
 *  2 ⚠ RATCHET: the total count of prose-shaped literals (≥ 3 words) pinned
 *    against source files may not grow. Some are legitimate (asserting the
 *    exact sentence a player is shown); each new one should have to displace an
 *    old one rather than pile on.
 *
 * WHAT THIS GATE CANNOT SEE, SAID PLAINLY (the OTA-1455 lesson — a silent
 * partial scan reads as a full one): pins via variables it cannot resolve to a
 * file, pins built with template strings, and pins in helper functions. The
 * scan prints its resolution counts so a collapse in coverage is visible.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const TESTS = path.join(ROOT, '__tests__');

/** ⚠ The ratchet baseline — the EXACT measured count at gate birth (2026-08-24,
 *  OTA-1483). Deliberately no headroom: a new prose pin must displace an old one
 *  or state its claim another way. Lower it as pins are converted; never raise
 *  it without an owner decision. */
const PROSE_PIN_BASELINE = 113;

/** Comments stripped — the same reader every scanning suite uses. */
const codeOnly = (s) => s
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .replace(/^\s*\/\/.*$/gm, '');

/**
 * ⚠ ALLOWLIST for rule 1, matched on (test file, literal prefix ≤ 80 chars) —
 * NOT on line numbers, which drift and turn an allowlist into a lie (the
 * OTA-1404 countdown lesson, applied to a gate). Two populations:
 *
 *  • A NEW entry is a claim that quoting this comment IS the test's subject.
 *    It requires a `why`. Adding one without a reason is how the gate becomes
 *    decoration.
 *
 *  • ⚠ THE GRANDFATHERED 32 (2026-08-24, gate's first run). Each belongs to a
 *    test that DECLARES documentation-keeping as its subject — ota1410's reads
 *    "the comment that justified the global lifetime is corrected, not deleted…
 *    the record is the point." Converting those to looser anchors would weaken
 *    what their authors deliberately pinned, so they are named here instead:
 *    the class is banned GOING FORWARD, each removal shows in a diff, and the
 *    list only ever shrinks. A grandfathered pin that breaks on a reword gets
 *    CONVERTED then, not re-quoted — delete its entry when it goes.
 */
const COMMENT_PIN_ALLOW = [
  { file: 'ota1404CombatResolution.test.ts', lit: 'only in COMMENTS' },
  { file: 'ota1409ThreeFromThePlaySession.test.ts', lit: '"you pay what you have" is what the writing' },
  { file: 'ota1409ThreeFromThePlaySession.test.ts', lit: 'THE NARRATOR CALLING THE PLAYER BY ITS OWN JOB TITLE' },
  { file: 'ota1410CheckmarksBelongToOneVisit.test.ts', lit: 'OTA-1410 — RE-SCOPED' },
  { file: 'ota1410CheckmarksBelongToOneVisit.test.ts', lit: 'The fast-travel consumer does not exist' },
  { file: 'ota1410CheckmarksBelongToOneVisit.test.ts', lit: 'stopped meaning "unique" at OTA-1279' },
  { file: 'ota1411TheOutpostCorridorTax.test.ts', lit: 'Hub rooms have NO BANK' },
  { file: 'ota1411TheOutpostCorridorTax.test.ts', lit: 'NEAR-MISS KINDS ARE COERCED, NOT BINNED' },
  { file: 'ota1411TheOutpostCorridorTax.test.ts', lit: 'dictionary is the thing that is short' },
  { file: 'ota1412TheDogThatNeverGrew.test.ts', lit: 'Ember, 14 max HP, took 15 damage in one hit' },
  { file: 'ota1412TheDogThatNeverGrew.test.ts', lit: 'written in exactly one place' },
  { file: 'ota1413ReclaimIsNotACrash.test.ts', lit: 'A clear that leaves the thing it' },
  { file: 'ota1413ReclaimIsNotACrash.test.ts', lit: 'SET FROM THE LATCH, NEVER INHERITED' },
  { file: 'ota1413ReclaimIsNotACrash.test.ts', lit: 'WHAT THIS DOES NOT FIX, STATED PLAINLY' },
  { file: 'ota1413ReclaimIsNotACrash.test.ts', lit: 'OTA-1413 — CLOSED, AND BY EXACTLY THAT PRESCRIPTION' },
  { file: 'ota1413ReclaimIsNotACrash.test.ts', lit: 'the owner\'s ledger has one' },
  { file: 'ota1414OneStatOneJob.test.ts', lit: '// Train STR on hit.' },
  { file: 'ota1414OneStatOneJob.test.ts', lit: 'THIS IS A BALANCE CHANGE FOR HOUNDS' },
  { file: 'ota1414OneStatOneJob.test.ts', lit: 'THIS NO LONGER TRAINS, AND THE FEATURE STAYS' },
  { file: 'ota1414OneStatOneJob.test.ts', lit: 'premise that turned out to be false' },
  { file: 'ota1416PetTheDog.test.ts', lit: 'LEADS WITH THE WORD A PLAYER ACTUALLY USES' },
  { file: 'ota1420ADogIsRolledFor.test.ts', lit: 'A DOG IS ROLLED FOR, LIKE A PERSON' },
  { file: 'ota1420ADogIsRolledFor.test.ts', lit: 'THE MEAN IS THE OLD NUMBER, EXACTLY' },
  { file: 'ota1420ADogIsRolledFor.test.ts', lit: '2d4 AND NOT 2d6 OR 1d8' },
  { file: 'ota1424WeaponNounsAreAnAllowlist.test.ts', lit: 'THE GUARD IS AN ALLOWLIST NOW, BECAUSE A BLOCKLIST CANNOT WIN' },
  { file: 'ota1424WeaponNounsAreAnAllowlist.test.ts', lit: 'a blocklist is a' },
  { file: 'ota1424WeaponNounsAreAnAllowlist.test.ts', lit: 'SPLIT FIRST, THEN STRIP' },
  { file: 'ota1424WeaponNounsAreAnAllowlist.test.ts', lit: 'AND THE CATALOGUE ITSELF IS THE BIGGEST SOURCE' },
  { file: 'ota1424WeaponNounsAreAnAllowlist.test.ts', lit: '"X OF Y" NAMES THE X' },
  { file: 'ota1450BoardKnowsYourSize.test.ts', lit: 'A CARRY CAP WAS BUILT HERE AND THEN REMOVED' },
  { file: 'ota1460CognitionOutranksGeneration.test.ts', lit: 'priority only reorders the WAITING set' },
  { file: 'ota1476OnePowerReading.test.ts', lit: 'the Guardian curve this is kept in sync with' },
];

// ── resolve test-file → (variable → source file) ────────────────────────────
function sourceVarsOf(src) {
  const vars = new Map();
  // const X = read('app', 'state', 'gameStore.ts')  /  codeOnly(read(...))
  const reRead = /const\s+(\w+)\s*(?::[^=]+)?=\s*(?:codeOnly\()?\s*read(?:FileSync)?\s*\(([^;]*?)\)\s*[;,)]/g;
  let m;
  while ((m = reRead.exec(src))) {
    const parts = [...m[2].matchAll(/['"`]([^'"`]+)['"`]/g)].map((a) => a[1])
      .filter((p) => p !== 'utf8' && !p.includes('__dirname'));
    const i = parts.indexOf('app');
    if (i >= 0) vars.set(m[1], path.join(...parts.slice(i)));
  }
  // const Y = codeOnly(X) — alias to X's file
  const reAlias = /const\s+(\w+)\s*=\s*codeOnly\((\w+)\)/g;
  while ((m = reAlias.exec(src))) {
    if (vars.has(m[2])) vars.set(m[1], vars.get(m[2]));
  }
  return vars;
}

// ── the scan ────────────────────────────────────────────────────────────────
const srcCache = new Map();
const loadSrc = (rel) => {
  if (!srcCache.has(rel)) {
    try { srcCache.set(rel, fs.readFileSync(path.join(ROOT, rel), 'utf8')); }
    catch { srcCache.set(rel, null); }
  }
  return srcCache.get(rel);
};

const unescape = (lit) => lit
  .replace(/\\n/g, '\n').replace(/\\t/g, '\t')
  .replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\`/g, '`')
  .replace(/\\\\/g, '\\');

function scan() {
  const offenders = [];
  let prosePins = 0;
  let resolvedVars = 0;
  let filesWithReads = 0;
  let scanned = 0;
  for (const f of fs.readdirSync(TESTS).filter((x) => x.endsWith('.test.ts'))) {
    const src = fs.readFileSync(path.join(TESTS, f), 'utf8');
    scanned++;
    const vars = sourceVarsOf(src);
    if (vars.size === 0) continue;
    filesWithReads++;
    resolvedVars += vars.size;
    const alt = [...vars.keys()].join('|');
    // ⚠ THE SELF-TEST-PAIR EXEMPTION. A scanning suite proves its comment
    // stripper works by asserting the same literal IS in the raw file and is
    // NOT in the code-only view:
    //     expect(RAW).toContain('SOME HEADER');
    //     expect(CODE).not.toContain('SOME HEADER');
    // The positive half looks exactly like a comment pin, but the pair as a
    // whole is an instrument check — this gate's own first run flagged two of
    // them (ota1476, ota1479). A literal that appears in a not.toContain in the
    // same file is exempt.
    const negated = new Set();
    const reNeg = new RegExp(
      String.raw`\.not\.toContain\(\s*(['"\`])((?:\\.|(?!\1).)*)\1\s*\)`,
      'g',
    );
    let nm;
    while ((nm = reNeg.exec(src))) negated.add(unescape(nm[2]));
    const re = new RegExp(
      String.raw`expect\(\s*(${alt})(?:\.[\w().]+)?\s*\)\s*\.toContain\(\s*(['"\`])((?:\\.|(?!\2).)*)\2\s*\)`,
      'g',
    );
    let m;
    while ((m = re.exec(src))) {
      const lit = unescape(m[3]);
      if (lit.trim().split(/\s+/).length < 3) continue; // identifiers & fragments — fine
      // ⚠ CODE IS NOT PROSE. `'lastSeen !== OTA_BUILD_ID'` has three whitespace
      // tokens and is exactly the kind of pin this gate WANTS (a claim stated
      // against code). A literal carrying code punctuation is code-shaped and
      // exempt from the prose ratchet — the ratchet's subject is sentences.
      if (/[(){};]|=>|[!=]==|\?\?|\?\./.test(lit)) continue;
      prosePins++;
      const rel = vars.get(m[1]);
      const target = loadSrc(rel);
      if (!target) continue;
      if (target.includes(lit) && !codeOnly(target).includes(lit)) {
        if (negated.has(lit)) continue; // self-test pair — see above
        const line = src.slice(0, m.index).split('\n').length;
        if (COMMENT_PIN_ALLOW.some((a) => a.file === f && a.lit === lit.slice(0, 80))) continue;
        offenders.push({ test: f, line, source: rel, lit: lit.slice(0, 80) });
      }
    }
  }
  return { offenders, prosePins, resolvedVars, filesWithReads, scanned };
}

// ── self-test first, always ─────────────────────────────────────────────────
{
  const fakeTest = `
const STORE = read('app', 'state', 'fake.ts');
const CODE = codeOnly(STORE);
expect(STORE).toContain('only lives in a comment here');
expect(STORE).toContain('const answer = 42');
expect(STORE).toContain('x');
`;
  const vars = sourceVarsOf(fakeTest);
  if (vars.get('STORE') !== path.join('app', 'state', 'fake.ts') || vars.get('CODE') !== vars.get('STORE')) {
    console.error('✗ check:quotedpins — SELF-TEST FAILED: variable resolution broken.');
    process.exit(1);
  }
  // The prose/code shape rule, proven on known answers before it filters anything.
  const codeShaped = /[(){};]|=>|[!=]==|\?\?|\?\./;
  if (codeShaped.test('lastSeen !== OTA_BUILD_ID') !== true
      || codeShaped.test('the board is bare today') !== false
      || codeShaped.test('wearEquippedItem(item)') !== true) {
    console.error('✗ check:quotedpins — SELF-TEST FAILED: prose/code shape rule broken.');
    process.exit(1);
  }
  const fakeSource = `// only lives in a comment here\nconst answer = 42;\n`;
  const commentOnly = fakeSource.includes('only lives in a comment here')
    && !codeOnly(fakeSource).includes('only lives in a comment here');
  const codePin = fakeSource.includes('const answer = 42')
    && !codeOnly(fakeSource).includes('const answer = 42');
  if (!commentOnly || codePin) {
    console.error('✗ check:quotedpins — SELF-TEST FAILED: comment detection broken.');
    process.exit(1);
  }
}

const { offenders, prosePins, resolvedVars, filesWithReads, scanned } = scan();

if (scanned === 0 || filesWithReads === 0) {
  console.error('✗ check:quotedpins — scanned nothing. The walker or resolver is broken.');
  process.exit(1);
}

if (offenders.length > 0) {
  console.error(`✗ check:quotedpins — ${offenders.length} pin(s) quote text that exists ONLY in a comment of the file they read:`);
  for (const o of offenders) console.error(`    ${o.test}:${o.line} → ${o.source}\n      "${o.lit}"`);
  console.error('');
  console.error('  A comment is documentation: this pin fails when the prose is reworded and');
  console.error('  passes when the behaviour it describes is deleted. State the claim against');
  console.error('  CODE or against BEHAVIOUR instead — or, if quoting the comment genuinely IS');
  console.error('  the test\'s subject, add an allowlist entry WITH A REASON.');
  process.exit(1);
}

if (prosePins > PROSE_PIN_BASELINE) {
  console.error(`✗ check:quotedpins — prose-shaped source pins grew: ${prosePins} > baseline ${PROSE_PIN_BASELINE}.`);
  console.error('  Convert an old quoted pin to a claim before adding a new one (or lower the');
  console.error('  baseline after converting — it only ever moves DOWN).');
  process.exit(1);
}

console.log(`[check:quotedpins] OK — ${scanned} test files, ${filesWithReads} read app/ source (${resolvedVars} vars resolved), ${prosePins}/${PROSE_PIN_BASELINE} prose pins, 0 comment-only.`);
