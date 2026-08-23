#!/usr/bin/env node
// ⚠⚠ FIXED-WINDOW SOURCE-PIN RATCHET.
//
// This project pins claims about how the code is wired by reading source files
// as TEXT and asserting near a landmark ("receipts"). The style is deliberate.
// Measuring "near" in BYTES is not:
//
//   const i = STORE.indexOf('const rvPool = ...');
//   expect(STORE.slice(i, i + 1200)).not.toContain('Math.random() < 0.04');
//
// Insert 1200 characters above that line and the forbidden text slides out of
// the window — and the test PASSES, having checked nothing. A negative pin that
// goes quiet is strictly worse than no pin: it reports safety it did not check.
//
// Positive pins ("X should be here") merely FAIL when they rot — noisy, never
// dangerous. So the two directions are counted and ratcheted separately, and
// the negative baseline is the one that matters.
//
// The fix at each site is test-utils/srcBlock.ts: `blockAt` walks braces
// for the real block, `between` takes two required landmarks, and `expectAbsent`
// demands a canary so an assert-absent cannot silently stop looking at its
// subject.
//
//   • count  >  baseline  → FAIL (a new fixed-window pin was added).
//   • count === baseline  → pass.
//   • count  <  baseline  → pass, and print a nudge to lower the baseline.
//
// Usage:  node scripts/check-slice-pins.mjs
//         node scripts/check-slice-pins.mjs --update-baseline

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const baselineFile = join(root, '.ci-slice-pins-baseline');
const testsDir = join(root, '__tests__');

// `SRC.slice(i, i + 1200)` — a window whose far edge is a literal byte count.
const FIXED_WINDOW = /\.slice\(\s*([A-Za-z_$][\w$.]*)\s*,\s*[A-Za-z_$][\w$.]*\s*\+\s*\d+\s*\)/;

function scan() {
  let positive = 0;
  const negatives = [];
  for (const name of readdirSync(testsDir)) {
    if (!/\.tsx?$/.test(name)) continue;
    const lines = readFileSync(join(testsDir, name), 'utf8').split('\n');
    lines.forEach((line, n) => {
      if (!FIXED_WINDOW.test(line)) return;
      // The assertion may sit on this line or a few below (`const block = ...`).
      const ctx = lines.slice(n, n + 4).join(' ');
      if (ctx.includes('.not.')) negatives.push(`${name}:${n + 1}`);
      else positive += 1;
    });
  }
  return { positive, negatives };
}

const { positive, negatives } = scan();
const count = negatives.length;

if (process.argv.includes('--update-baseline')) {
  writeFileSync(baselineFile, `${count}\n`);
  console.log(`[check-slice-pins] baseline written: ${count} negative fixed-window pins`);
  console.log(`[check-slice-pins] (positive fixed-window pins, untracked: ${positive})`);
  process.exit(0);
}

const baseline = existsSync(baselineFile)
  ? parseInt(readFileSync(baselineFile, 'utf8').trim(), 10)
  : 0;

if (count > baseline) {
  console.error(`[check-slice-pins] FAIL — negative fixed-window pins grew: ${count} > baseline ${baseline}.`);
  console.error('An "is absent" assertion inside a byte window goes SILENT when the code');
  console.error('between the anchor and the forbidden text grows. Use test-utils/srcBlock.ts:');
  console.error("  expectAbsent(blockAt(SRC, 'anchor'), 'forbidden', 'canary that must be there');");
  console.error('Offending sites:');
  for (const s of negatives) console.error(`  ${s}`);
  process.exit(1);
}

if (count < baseline) {
  console.log(`[check-slice-pins] negative fixed-window pins DROPPED: ${count} < baseline ${baseline}.`);
  console.log('Nice — lower the baseline: `node scripts/check-slice-pins.mjs --update-baseline`.');
  console.log(`  ⚠ This proves the SHAPE is gone, not that the claim is still right — a converted`);
  console.log(`    pin still needs its canary to be something that genuinely belongs in the block.`);
  process.exit(0);
}

console.log(`[check-slice-pins] OK — negative fixed-window pins at baseline (${baseline}). No growth.`);
console.log(`  ⚠ Positive fixed-window pins (${positive}) are NOT gated: they fail loudly when they`);
console.log('    rot, so they are noise debt rather than a silence risk. Convert opportunistically.');
