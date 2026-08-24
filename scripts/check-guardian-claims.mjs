#!/usr/bin/env node
/**
 * OTA-1468 — A GUARDIAN MUST NOT INVENT THE PLAYER'S HISTORY.
 *
 * ⚠⚠⚠ WHAT THIS EXISTS BECAUSE OF. Two lines on the Voronov Cantor asserted how
 * far the player had got, as fixed strings, to every player at every point:
 *
 *   approachLine  "The Order has watched five Capitals fall to you"
 *   defeatLine    "...so. The last seat. The Order... is done."
 *
 * The owner's 2026-08-23 log has him hearing the first with ONE Core recovered,
 * and the second as his SECOND kill — a dying high priest declaring the Order
 * finished with seven Cores still out there.
 *
 * ⚠⚠ EIGHT OF THE NINE GUARDIANS WERE WRITTEN CORRECTLY. That is exactly why a
 * gate is worth more here than a fix: the rule was understood, followed almost
 * everywhere, and broken once — which is the profile of a defect that recurs
 * the next time somebody writes a Guardian at midnight. `coreGuardians.ts` says
 * in its own header that "the player's choice of order is preserved", and
 * nothing was checking.
 *
 * ⚠ WHAT IS FORBIDDEN IS A CLAIM, NOT A NUMBER. These lines count things all the
 * time and should: "three voices, then six, then one", "one chord, held",
 * "Sixty years I sat the watch". A Guardian's own history is theirs to state.
 * What they may not do is assert the PLAYER's progress except through a token
 * the engine substitutes — `{fallen}`, `{seat}`.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SRC = fs.readFileSync(path.join(ROOT, 'app/engine/coreGuardians.ts'), 'utf8');

/** The three authored line fields on a Guardian def. */
const LINE_FIELDS = ['approachLine', 'rebukeLine', 'defeatLine'];

/**
 * ⚠⚠ CLAIMS ABOUT THE PLAYER'S RUN. Each of these says something only the engine
 * can know. A line containing one MUST also contain a substitution token, or it
 * is asserting a fact it cannot possibly have.
 */
const CLAIM_PATTERNS = [
  { re: /\b(one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+(capitals?|cores?|seats?)\b/i,
    why: 'counts Capitals / Cores / seats' },
  { re: /\b(capitals?|cores?|seats?)\s+(have|has)\s+fallen\b/i, why: 'asserts what has fallen' },
  { re: /\bfall(en)?\s+to\s+you\b/i, why: 'asserts something fell to the player' },
  { re: /\b(the\s+)?last\s+(seat|capital|core|one)\b/i, why: 'claims this is the final one' },
  { re: /\b(first|only)\s+(seat|capital|core)\b/i, why: 'claims this is the first / only one' },
  { re: /\bthe\s+order\s+is\s+done\b/i, why: 'declares the Order finished' },
  { re: /\byour\s+(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth)\b/i,
    why: "numbers the player's attempt" },
];

/** Tokens the engine substitutes. A claim is allowed only alongside one. */
const TOKEN = /\{[a-zA-Z]+\}/;

/** ⚠ Comments stripped first. This file's own prose quotes the offending
 *  sentences, and so does the module's new header — a scanner that reads source
 *  as text and does not decide about comments FIRST reports its documentation as
 *  a defect. Two OTAs running have been bitten by exactly this. */
const codeOnly = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

// ⚠⚠⚠ SELF-TEST BEFORE ANYTHING REAL IS READ. A gate whose matcher quietly stops
// matching prints OK forever, and OK from a broken instrument is worse than no
// instrument. Fire the patterns at the two sentences that caused this OTA, and
// at prose that must NOT trip them.
const SELF_TEST = [
  ['The Order has watched five Capitals fall to you', true],
  ['...so. The last seat. The Order... is done.', true],
  ['A low chant rises out of nowhere — three voices, then six, then one.', false],
  ['Sixty years I sat the watch for the Giant who keeps this Core warm', false],
  ['one chord, held, the kind of sound that re-arranges the dust in your lungs', false],
  ['The Order has watched {fallen}', false],   // tokenised — allowed
];
for (const [text, shouldFlag] of SELF_TEST) {
  const hit = !TOKEN.test(text) && CLAIM_PATTERNS.some((p) => p.re.test(text));
  if (hit !== shouldFlag) {
    console.error('✗ check:guardianclaims — SELF-TEST FAILED. The matcher is broken;');
    console.error('  the real Guardian lines were NOT checked.');
    console.error(`    expected ${shouldFlag ? 'FLAGGED' : 'clean'}: ${text}`);
    process.exit(1);
  }
}

/** Pull every authored line, field by field. */
function linesFor(field) {
  const out = [];
  const re = new RegExp(`${field}:\\s*\\n?\\s*('(?:[^'\\\\]|\\\\.)*')`, 'g');
  let m;
  const code = codeOnly(SRC);
  while ((m = re.exec(code))) out.push(m[1].slice(1, -1));
  return out;
}

let failed = false;
let total = 0;
for (const field of LINE_FIELDS) {
  const lines = linesFor(field);
  // ⚠ An empty extraction is ALWAYS a failure, never a clean board. If the
  // regex stopped matching — a reformat, a template literal, a rename — this
  // gate would report every Guardian as fine while checking nothing.
  if (lines.length === 0) {
    console.error(`✗ check:guardianclaims — extracted ZERO ${field} entries. The extractor is broken.`);
    process.exit(1);
  }
  total += lines.length;
  for (const line of lines) {
    if (TOKEN.test(line)) continue;   // the engine fills this in
    for (const { re, why } of CLAIM_PATTERNS) {
      const hit = re.exec(line);
      if (!hit) continue;
      failed = true;
      console.error(`✗ ${field} — ${why}: "${hit[0]}"`);
      console.error(`    ${line.slice(0, 150)}…`);
    }
  }
}

if (failed) {
  console.error('');
  console.error('  A Guardian speaks to whoever walks in, in whatever order they chose.');
  console.error('  Difficulty scales by KILL COUNT, not by Capital — coreGuardians.ts says');
  console.error('  so in its own header — which means no line may assert how far along the');
  console.error('  player is unless the engine substitutes it. Use a token ({fallen},');
  console.error('  {seat}) and add the substitution to guardianApproachLine /');
  console.error('  guardianDefeatLine.');
  process.exit(1);
}

console.log(`[check:guardianclaims] OK — ${total} authored Guardian lines, none asserting the player's run.`);
