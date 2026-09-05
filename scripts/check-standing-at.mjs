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
 * ⚠⚠ OTA-1480 — THE SECOND SHAPE, AND THE ONE THAT ACTUALLY HAPPENED TWICE.
 *
 * The patterns above forbid asking the question with the WRONG FIELD. They say
 * nothing about asking it with the right idea, hand-rolled — and that is what both
 * SUMMON chips did:
 *
 *     const stationedAtCapital = !player.travelTarget
 *       && (player.hubRoomId != null || (player.mapX === cx && player.mapY === cy));
 *
 * in ExplorationScreen AND in ContractsScreen, each under a comment reading
 * "Mirror isStationedAtNamedLocation" — which was private to gameStore, so both
 * screens knew they were duplicating a rule and had nowhere else to get it. A
 * predicate private to one file and needed by three is not private, it is copied.
 *
 * ⚠ AND THE COPIES USED THE WRONG COORDINATE. `mapX/mapY` is the RE-CENTERED
 * display frame; `playerGridCell` is the authoritative absolute cell (OTA-1398:
 * "ONE source of truth for where the player is"). Two coordinate systems, one
 * question. They agree only for as long as every write keeps them in step.
 *
 * So: a player-facing file may not test the map-centre anchor by hand. Use
 * `stationedAtNamedLocation(player)` from app/engine/standingAt.ts.
 */
const ANCHOR_PATTERNS = [
  /\.mapX\s*===\s*[\w.]*(?:WORLD_MAP_)?CENTER_?X/i,
  /\.mapY\s*===\s*[\w.]*(?:WORLD_MAP_)?CENTER_?Y/i,
  /\.mapX\s*===\s*cx\b/,
  /\.mapY\s*===\s*cy\b/,
];

/**
 * ⚠ ALLOWLIST, WITH A REASON EACH. An entry here is a claim that this particular
 * compare is asking "which place's rules apply", not "where is the player standing".
 * Adding one without a reason is how the gate becomes decoration.
 */
const ALLOW = [
  {
    file: 'app/screens/MapScreen.tsx',
    line: 662, // OTA-1700 moved it (the Atlas's travel rows took the tutorial lock)
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
/** ⚠ OTA-1480 — the anchor matcher gets its own known answers, fired at the exact
 *  two lines that were live in the tree before this OTA plus the fix that replaced
 *  them. A matcher that stops matching prints OK forever. */
const ANCHOR_SELF_TEST = [
  ['&& (player.hubRoomId != null || (player.mapX === cx && player.mapY === cy));', true],
  ['return p.mapX === WORLD_MAP_CENTER_X && p.mapY === WORLD_MAP_CENTER_Y;', true],
  ['const stationedAtCapital = stationedAtNamedLocation(player);', false],
  ['const fromX = player.mapX ?? WORLD_MAP_CENTER_X;', false],
  ['marker.mapX = player.mapX;', false],
];
for (const [line, expected] of ANCHOR_SELF_TEST) {
  const got = ANCHOR_PATTERNS.some((re) => re.test(line));
  if (got !== expected) {
    console.error('✗ check:standingat — ANCHOR SELF-TEST FAILED. Matcher is broken; real scan not run.');
    console.error(`    expected ${expected ? 'FLAGGED' : 'clean'}: ${line}`);
    process.exit(1);
  }
}
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
      const idHit = PATTERNS.some((re) => re.test(line));
      const anchorHit = ANCHOR_PATTERNS.some((re) => re.test(line));
      if (!idHit && !anchorHit) return;
      if (ALLOW.some((a) => rel === a.file && i + 1 === a.line)) return;
      hits.push({ rel, line: i + 1, src: t, kind: anchorHit ? 'anchor' : 'id' });
    });
  }
}

if (!scanned) {
  console.error('✗ check:standingat — scanned ZERO files. The walker is broken.');
  process.exit(1);
}

if (hits.length) {
  const ids = hits.filter((h) => h.kind === 'id');
  const anchors = hits.filter((h) => h.kind === 'anchor');
  console.error(`✗ check:standingat — ${hits.length} player-facing "am I here?" check(s) asking it the wrong way:`);
  for (const h of hits) console.error(`    [${h.kind}] ${h.rel}:${h.line}\n      ${h.src}`);
  console.error('');
  if (ids.length) {
    console.error('  [id] `currentLocationId` is the LAST NAMED PLACE, not a position — walking open');
    console.error('  ground between locations leaves it unchanged. Use standingAtLocation(player, id)');
    console.error('  from app/engine/standingAt.ts, or add an allowlist entry WITH A REASON if this');
    console.error('  compare really is asking "which place\'s rules apply to me".');
  }
  if (anchors.length) {
    console.error('  [anchor] A hand-rolled map-centre test. `mapX/mapY` is the RE-CENTERED display');
    console.error('  frame; the authoritative cell is playerGridCell (OTA-1398). Both SUMMON chips');
    console.error('  carried this copy under a comment saying "Mirror isStationedAtNamedLocation".');
    console.error('  Use stationedAtNamedLocation(player) from app/engine/standingAt.ts.');
  }
  process.exit(1);
}

console.log(`[check:standingat] OK — ${scanned} player-facing files, no id-compare and no hand-rolled anchor "am I here?" checks.`);
