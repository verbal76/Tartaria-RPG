#!/usr/bin/env node
/**
 * OTA-1482 — THE STAMP CANNOT FALL BEHIND THE WORK AGAIN.
 *
 * ⚠⚠ Owner, from the device: "I'm only on OTA 1469 and it says fully up to
 * date." Both halves were true: eleven OTAs (1470–1480) had published and
 * applied, but `OTA_BUILD_ID` in app/buildInfo.ts — the number the game
 * DISPLAYS, and the value the just-updated toast keys on — had not been stamped
 * since 1469. Green publish runs, delivered bundles, and a phone that looked
 * exactly like nothing ever arrived.
 *
 * One fact, two derivations, nothing tying them: the OTA number lived in the
 * commit title and in this constant. This gate is the tie. Every OTA creates an
 * `otaNNNN*.test.ts` suite in the same commit (the standing test rule), so the
 * HIGHEST suite number in __tests__/ is the repo's own record of the newest
 * OTA — and the stamp must name exactly that number.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

// ── self-test first — a matcher that stops matching prints OK forever ──────
{
  const pick = (name) => { const m = /^ota(\d{3,4})\D/.exec(name); return m ? Number(m[1]) : null; };
  if (pick('ota1482TheStamp.test.ts') !== 1482 || pick('ota931Guardian.test.ts') !== 931
      || pick('worldDirections.test.ts') !== null || pick('ota1481OneNegotiation.test.ts') !== 1481) {
    console.error('✗ check:otastamp — SELF-TEST FAILED: suite-number matcher broken.');
    process.exit(1);
  }
  const stamp = /OTA_BUILD_ID = '(\d{4}-\d{2}-\d{2})-(\d{3,4})-([a-z0-9-]+)'/;
  if (!stamp.test("OTA_BUILD_ID = '2026-08-24-1482-the-build-says-which-build-it-is';")) {
    console.error('✗ check:otastamp — SELF-TEST FAILED: stamp matcher broken.');
    process.exit(1);
  }
}

// ── the newest OTA, from the repo's own record ──────────────────────────────
let maxSuite = 0;
let suiteCount = 0;
for (const f of fs.readdirSync(path.join(ROOT, '__tests__'))) {
  const m = /^ota(\d{3,4})\D/.exec(f);
  if (!m) continue;
  suiteCount++;
  maxSuite = Math.max(maxSuite, Number(m[1]));
}
if (suiteCount < 100 || maxSuite < 1481) {
  console.error(`✗ check:otastamp — found only ${suiteCount} ota suites (max ${maxSuite}). The walker is broken.`);
  process.exit(1);
}

// ── the stamp, from the constant the game displays ──────────────────────────
const buildInfo = fs.readFileSync(path.join(ROOT, 'app', 'buildInfo.ts'), 'utf8');
const live = /^export const OTA_BUILD_ID = '(\d{4}-\d{2}-\d{2})-(\d{3,4})-([a-z0-9-]+)';/m.exec(buildInfo);
if (!live) {
  console.error('✗ check:otastamp — no live OTA_BUILD_ID export found in app/buildInfo.ts.');
  process.exit(1);
}
const stamped = Number(live[2]);

if (stamped !== maxSuite) {
  console.error(`✗ check:otastamp — OTA_BUILD_ID says ${stamped} but the newest suite is ota${maxSuite}.`);
  console.error("  The stamp is what the game DISPLAYS and what the just-updated toast keys on;");
  console.error('  a bundle shipped with a stale stamp looks exactly like no update arriving');
  console.error('  (that is how 1470–1480 went invisible). Bump OTA_BUILD_ID in the SAME commit');
  console.error('  that adds the ota suite, keeping the old line as a SUPERSEDED: comment.');
  process.exit(1);
}

console.log(`[check:otastamp] OK — stamp ${live[1]}-${stamped} matches newest suite ota${maxSuite} (${suiteCount} ota suites).`);
