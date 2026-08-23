#!/usr/bin/env node
/**
 * OTA-1458 — "AM I STANDING AT X?" HAS ONE ANSWER, AND THIS IS THE GATE THAT KEEPS IT.
 *
 * ⚠⚠⚠ THIS EXISTS BECAUSE THE SAME FACT HAS NOW HAD A READER LEFT BEHIND THREE TIMES.
 *
 *   OTA-1347   fixed the map MARKER to use the player's grid cell. Its comment quotes
 *              the owner's log: "six taps east from Iskan-Veil and the marker never
 *              moved, because free wandering changes the grid cell while
 *              currentLocationId still names the origin."
 *   bountyCourse.ts  wrote the rule down in prose: "am I standing on it is a GRID-CELL
 *              question (playerGridCell vs canonicalCellOf), not a currentLocationId
 *              string compare — you can be paces off a location in open ground and
 *              still read its id."
 *   MapScreen  compared the id anyway, in the TRAVEL TO list and in the map footer —
 *              so the marker moved correctly while the list beneath it insisted the
 *              player had never left, and refused to route them home.
 *
 * Knowledge written down twice, applied to one reader out of three. A comment cannot
 * enforce anything; this can.
 *
 * WHAT IT FORBIDS: comparing `currentLocationId` against a location id with === or !==
 * in the PLAYER-FACING surfaces, where the question being asked is always "is the
 * player standing here right now?".
 *
 * WHAT IT DOES NOT TOUCH: the engine and the store. `currentLocationId` is the correct
 * and only answer to "which place's rules apply to me" — weather, scene bank, sacred
 * ground, arrival narration, spawn tables. This gate is about a different question that
 * happens to have been asked with the same field.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

/** Player-facing surfaces only — see the header for why the engine is exempt. */
const SCAN_DIRS = ['app/screens', 'app/components'];
const EXTS = new Set(['.ts', '.tsx']);

/** An id compare against currentLocationId, either way round. */
const PATTERNS = [
  /currentLocationId\s*===/,
  /currentLocationId\s*!==/,
  /===\s*[A-Za-z_$][\w.?[\]'"$]*\.currentLocationId/,
  /!==\s*[A-Za-z_$][\w.?[\]'"$]*\.currentLocationId/,
];

/**
 * ⚠ ALLOWLIST, WITH A REASON EACH. An entry here is a claim that this particular
 * compare is asking "which place's rules apply", not "where is the player standing".
 * Adding one without a reason is how the gate becomes decoration.
 */
const ALLOW = [
  {
    file: 'app/screens/MapScreen.tsx',
    line: 646,
    // RESOLVING THE CURRENT LOCATION'S RECORD, not testing a position. This is the
    // "which place's rules apply to me" question — it looks up the row for the last
    // named place so the screen can read its name, tags and description. Nothing
    // player-visible claims "you are here" from it, and rewriting it to a grid
    // compare would return NOTHING while the player is between locations, which is
    // strictly worse than naming the place they last stood in.
    why: 'record lookup for the last named place, not an am-I-here test',
  },
];

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'node_modules') walk(p, out); }
    else if (EXTS.has(path.extname(e.name))) out.push(p);
  }
  return out;
}

// ⚠⚠⚠ SELF-TEST FIRST, ALWAYS. A gate whose matcher quietly stops matching prints
// "OK" forever, and "OK" from a broken instrument is worse than no instrument — the
// failure mode that produced OTA-1455's bogus 29/47 verb count. Fire the patterns at
// known answers before reporting on real code.
const SELF_TEST = [
  ['const isHere = player?.currentLocationId === p.id;', true],
  ['if (p.currentLocationId !== target) return null;', true],
  ['const isHere = standingAtLocation(player, p.id);', false],
  ['const name = getLocationById(player.currentLocationId).name;', false],
  ['weatherFor(player.currentLocationId)', false],
];
for (const [line, expected] of SELF_TEST) {
  const got = PATTERNS.some((re) => re.test(line));
  if (got !== expected) {
    console.error('✗ check:standingat — SELF-TEST FAILED. Matcher is broken; real scan not run.');
    console.error(`    expected ${expected ? 'FLAGGED' : 'clean'}: ${line}`);
    process.exit(1);
  }
}

const hits = [];
let scanned = 0;
for (const dir of SCAN_DIRS) {
  for (const file of walk(path.join(ROOT, dir))) {
    const rel = path.relative(ROOT, file);
    scanned++;
    fs.readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
      const t = line.trim();
      if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return;
      if (!PATTERNS.some((re) => re.test(line))) return;
      if (ALLOW.some((a) => rel === a.file && i + 1 === a.line)) return;
      hits.push({ rel, line: i + 1, src: t });
    });
  }
}

if (!scanned) {
  console.error('✗ check:standingat — scanned ZERO files. The walker is broken.');
  process.exit(1);
}

if (hits.length) {
  console.error(`✗ check:standingat — ${hits.length} player-facing "am I here?" compare(s) using currentLocationId:`);
  for (const h of hits) console.error(`    ${h.rel}:${h.line}\n      ${h.src}`);
  console.error('');
  console.error('  `currentLocationId` is the LAST NAMED PLACE, not a position — walking open');
  console.error('  ground between locations leaves it unchanged. Use standingAtLocation(player, id)');
  console.error('  from app/engine/standingAt.ts, or add an allowlist entry WITH A REASON if this');
  console.error('  compare really is asking "which place\'s rules apply to me".');
  process.exit(1);
}

console.log(`[check:standingat] OK — ${scanned} player-facing files, no id-compare "am I here?" checks.`);
