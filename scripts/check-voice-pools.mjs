#!/usr/bin/env node
/**
 * OTA-1461 — THE POOLS THAT FIRE CONSTANTLY MUST BE DEEP, AND DEEP MEANS VARIED.
 *
 * Owner: *"most of the 6,700 lines are single fire emission texts… what I'm
 * worried about is just the random things they say to describe the scene or put
 * some flavor in there. You're going to hear it all the time. It's like when your
 * friend asks you every time he sees you: hey man, what you up to?"*
 *
 * ⚠⚠⚠ TWO FAILURE MODES, AND MOST TOOLS ONLY CATCH THE FIRST.
 *
 *   1. TOO FEW LINES. The census off the owner's device log found four of the
 *      highest-frequency lines in the game with NO POOL AT ALL — one hardcoded
 *      sentence fired twenty-five times in a session. A floor catches this.
 *
 *   2. TOO FEW IDEAS. Forty rephrasings of one thought fail the owner's test
 *      exactly as hard as one line repeated forty times — he would still hear the
 *      same greeting every time. A floor CANNOT catch this, and a pool that
 *      passes the count while failing the ear is the worse outcome, because it
 *      looks solved. So there is a similarity check too.
 *
 * ⚠⚠ THE SIMILARITY MEASURE IS DELIBERATELY CRUDE, and that is a decision rather
 * than a shortcut. Jaccard overlap on content words catches the thing that
 * actually happens when someone pads a pool — the same sentence with two words
 * swapped. It does NOT understand meaning, so it cannot catch two genuinely
 * different sentences that land the same emotional beat. That limit is stated
 * here so nobody mistakes a green run for "the writing is good": this gate
 * measures VARIETY OF WORDING, and a human still has to judge variety of IDEA.
 *
 * ⚠ THE FLOORS ARE KEYED TO FIRE-RATE, NOT TO A MULTIPLIER. "Triple everything"
 * was the first plan and it is wrong on the data: tripling a pool of one is
 * three. What matters is how often a player hears it.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

/** Floors by how often the player hears it. Measured from the owner's own logs. */
const FLOOR_CONSTANT = 30;   // 10+ times an hour
const FLOOR_FREQUENT = 15;   // 2–10 times an hour
/** Two lines are "too alike" above this content-word overlap. */
const SIMILARITY_LIMIT = 0.6;
/** How many too-alike pairs a pool may carry before it fails. A couple of close
 *  cousins in forty lines is human; a dozen means someone padded it. */
const MAX_SIMILAR_PAIRS = 2;

/**
 * ⚠ THE REGISTRY. A pool here is a claim that the player hears it often enough to
 * need depth. Adding a line to this list is how a new hot pool gets protected;
 * the alternative — scanning every array in the codebase — would flag hundreds of
 * one-shot pools that were never the problem and train everyone to ignore it.
 */
const POOLS = [
  { name: 'UNRESOLVED_HOOK_LINES', floor: FLOOR_CONSTANT, why: '~25 fires/session — was 1 hardcoded line' },
  { name: 'DOG_SETTLE_LINES', floor: FLOOR_CONSTANT, why: 'every rest — owner rested 15× in 4 real minutes' },
  { name: 'TAKE_LINES', floor: FLOOR_CONSTANT, why: '~15 fires/session — was 1 line' },
  { name: 'FLEE_OPEN_LINES', floor: FLOOR_CONSTANT, why: '~9 fires/session — was 1 line' },
  { name: 'FLEE_INDOOR_LINES', floor: FLOOR_FREQUENT, why: 'the indoor half of the same beat' },
  // ⚠ OTA-1467 — the most repeated string in the game on the owner's own logs:
  // it fires on EVERY re-entry to EVERY tile, and he re-crosses ground
  // constantly. Was one sentence with a counter bolted on the end.
  { name: 'RETURN_AGAIN_LINES', floor: FLOOR_CONSTANT, why: 'every tile re-entry — was 1 line + "(visit N)"' },
  { name: 'RETURN_FAMILIAR_LINES', floor: FLOOR_FREQUENT, why: 'the well-trodden half of the same beat' },
];

const SRC = fs.readFileSync(path.join(ROOT, 'app/engine/voicePools.ts'), 'utf8');

/**
 * Pull the string literals out of one exported pool.
 *
 * ⚠⚠⚠ COMMENT LINES ARE STRIPPED FIRST, AND THE FIRST DRAFT DID NOT DO THAT.
 * The pools are grouped by angle with comments like `// the player's attention`
 * and `// the dog's own tiredness`. An apostrophe inside a comment opens a match
 * that runs to the next quote in the FILE, swallowing real lines and throwing
 * every match after it out of alignment — this reported 10 lines in a pool of 40
 * and would have demanded thirty more that already existed.
 *
 * ⚠ I WROTE A HELPER FOR EXACTLY THIS HAZARD ONE OTA EARLIER (ota1459's
 * `codeOnly`, after an assertion tripped over its own comment) AND DID NOT REUSE
 * IT HERE. Recorded because the lesson clearly did not take the first time: any
 * scanner that reads source as text must decide what to do about comments BEFORE
 * it decides anything else.
 */
function poolLines(name) {
  const at = SRC.indexOf(`export const ${name}`);
  if (at === -1) return null;
  const end = SRC.indexOf(']);', at);
  if (end === -1) return null;
  const body = SRC.slice(at, end)
    .split('\n')
    .filter((l) => !l.trim().startsWith('//'))
    .join('\n');
  const found = (body.match(/'(?:[^'\\]|\\.)*'/g) ?? [])
    .map((s) => s.slice(1, -1))
    .filter((s) => s.length > 20);
  // ⚠⚠ CROSS-CHECK, BY A SECOND METHOD. Count the lines that LOOK like pool
  // entries (`  '…',`) and require the parser to agree. Two ways of counting that
  // disagree means the parser is wrong, and a parser that silently undercounts a
  // content pool sends someone off to write thirty lines that already exist.
  const naive = (body.match(/^\s+'/gm) ?? []).length;
  if (found.length !== naive) {
    console.error(`✗ check:voicepools — PARSER FAULT on ${name}: extracted ${found.length}`);
    console.error(`  but ${naive} lines look like entries. The extractor disagrees with itself.`);
    process.exit(1);
  }
  return found;
}

const STOP = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'of', 'to', 'in', 'it', 'is', 'was', 'you',
  'your', 'that', 'this', 'with', 'at', 'on', 'for', 'as', 'not', 'no', 'has', 'have',
  'had', 'be', 'been', 'are', 'from', 'by', 'into', 'out', 'up', 'down', 'then', 'than',
  'they', 'them', 'their', 'its', 'do', 'does', 'did', 'so', 'if', 'what', 'which',
]);
const words = (s) => new Set(
  s.toLowerCase().replace(/\{[^}]*\}/g, ' ').replace(/[^a-z\s]/g, ' ')
    .split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w)),
);
function similarity(a, b) {
  const A = words(a); const B = words(b);
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const w of A) if (B.has(w)) inter++;
  return inter / (A.size + B.size - inter);
}

// ⚠⚠⚠ SELF-TEST FIRST. A gate whose measure quietly stops measuring prints "OK"
// forever, and "OK" from a broken instrument is worse than no instrument — the
// failure that produced OTA-1455's bogus 29/47 verb count. Fire the similarity
// function at known answers before reporting on real content.
const SELF_TEST = [
  ['You take the vest from where it lay.', 'You take the helm from where it lay.', true],
  ['You take the vest from where it lay.', 'Rain starts somewhere in the small hours.', false],
  ['The thread you were following waits where you left it.',
   'The thread you were following sits where you left it.', true],
  ['Your lungs are burning by the time you dare look back.',
   'A tail thumps twice against the mud and stops.', false],
];
for (const [a, b, shouldBeAlike] of SELF_TEST) {
  const alike = similarity(a, b) >= SIMILARITY_LIMIT;
  if (alike !== shouldBeAlike) {
    console.error('✗ check:voicepools — SELF-TEST FAILED. The similarity measure is broken;');
    console.error('  the real pools were NOT checked.');
    console.error(`    expected ${shouldBeAlike ? 'ALIKE' : 'different'} (got ${similarity(a, b).toFixed(2)}):`);
    console.error(`      A: ${a}`);
    console.error(`      B: ${b}`);
    process.exit(1);
  }
}

let failed = false;
const report = [];
for (const pool of POOLS) {
  const lines = poolLines(pool.name);
  if (lines === null) {
    console.error(`✗ check:voicepools — pool ${pool.name} not found in app/engine/voicePools.ts.`);
    console.error('  Either it was renamed (update the registry) or the extractor broke.');
    process.exit(1);
  }
  // ⚠ An empty extraction is ALWAYS a failure, never a pass. A regex that stops
  // matching would otherwise report every pool as fine.
  if (lines.length === 0) {
    console.error(`✗ check:voicepools — extracted ZERO lines from ${pool.name}. The extractor is broken.`);
    process.exit(1);
  }

  const dupes = lines.length - new Set(lines).size;
  const similar = [];
  for (let i = 0; i < lines.length; i++) {
    for (let j = i + 1; j < lines.length; j++) {
      const sim = similarity(lines[i], lines[j]);
      if (sim >= SIMILARITY_LIMIT) similar.push([sim, lines[i], lines[j]]);
    }
  }

  const short = lines.length < pool.floor;
  const bad = short || dupes > 0 || similar.length > MAX_SIMILAR_PAIRS;
  if (bad) failed = true;
  report.push({ pool, count: lines.length, dupes, similar, short });
}

for (const r of report) {
  const tag = r.short ? '✗' : r.dupes > 0 || r.similar.length > MAX_SIMILAR_PAIRS ? '✗' : '✓';
  console.log(`${tag} ${String(r.count).padStart(3)}/${String(r.pool.floor).padEnd(3)} ${r.pool.name.padEnd(24)} ${r.pool.why}`);
  if (r.short) console.log(`      ⚠ below floor — the player hears this too often for ${r.count} line(s).`);
  if (r.dupes > 0) console.log(`      ⚠ ${r.dupes} exact duplicate line(s).`);
  if (r.similar.length > MAX_SIMILAR_PAIRS) {
    console.log(`      ⚠ ${r.similar.length} pairs too alike (limit ${MAX_SIMILAR_PAIRS}). Worst:`);
    for (const [sim, a, b] of r.similar.sort((x, y) => y[0] - x[0]).slice(0, 3)) {
      console.log(`         ${sim.toFixed(2)}  "${a.slice(0, 58)}…"`);
      console.log(`               "${b.slice(0, 58)}…"`);
    }
  }
}

if (failed) {
  console.error('');
  console.error('  A pool the player hears ten times an hour needs DEPTH and VARIETY.');
  console.error('  Depth is the count; variety is not rephrasing one thought. Group new');
  console.error('  lines by ANGLE — the object, the body, the weather, the silence, time —');
  console.error('  the way app/engine/voicePools.ts and the overland travel pool do.');
  process.exit(1);
}

const total = report.reduce((n, r) => n + r.count, 0);
console.log(`[check:voicepools] OK — ${report.length} hot pools, ${total} lines, none below floor, none too alike.`);
console.log('  ⚠ This measures variety of WORDING. Variety of IDEA is still a human judgement.');
