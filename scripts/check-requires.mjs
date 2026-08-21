#!/usr/bin/env node
/**
 * ⚠⚠ OTA-1415 — EVERY GATE PASSED AND NOTHING SHIPPED FOR TWENTY-ONE OTAs.
 *
 * The owner's golem phone sat on OTA-1393 while the trunk reached 1414. Not a
 * missing publish — the publish workflow RAN on every push and FAILED on every
 * push, and nobody looked, because a red Actions badge is not something you see
 * from inside the repo:
 *
 *   Unable to resolve module ../data/factions/factions.json
 *     from app/state/slices/slotSlice.ts
 *
 * `slotSlice.ts` was carved out of `gameStore.ts` at OTA-1392. gameStore lives
 * in `app/state/`, the slice lives in `app/state/slices/` — one level deeper —
 * and eleven `require()` calls came along still spelled `../`. Eleven modules
 * that resolved from the old home and resolve from nowhere in the new one.
 *
 * ⚠⚠ WHY NOTHING CAUGHT IT. This is the point of this file.
 *
 *   · tsc does not resolve a `require()` string. Several of these even carry a
 *     CORRECT type beside a wrong path —
 *       require('../diagnostics/crashLedger') as typeof import('../../diagnostics/crashLedger')
 *     — so the compiler checked the half that was right and never read the half
 *     that shipped.
 *   · eslint does not either, and every one of these sits under an
 *     `eslint-disable-next-line @typescript-eslint/no-require-imports`.
 *   · jest does not, because these are lazy requires inside cold paths —
 *     first-install seeding, a background item backfill, TTS teardown. No test
 *     walks them, and a test that did would resolve through jest's own resolver
 *     rather than Metro's.
 *
 * So the ONLY thing in the pipeline that knew was Metro, at bundle time, in
 * CI — which is exactly where the failure was invisible. Eight hundred and
 * seventy-two green tests, four green repo checks, and a bundle that could not
 * be built.
 *
 * ⚠ THE RULE THIS ENFORCES: a relative `require()` in app/** must resolve to a
 * file that exists. It is the cheapest possible stand-in for "Metro can bundle
 * this", it runs in under a second, and it fails in the gate rather than in a
 * workflow log nobody opens.
 *
 * ⚠ Static `import ... from '...'` is deliberately NOT checked here — tsc
 * already resolves those and would have caught this class instantly. What makes
 * `require()` dangerous is precisely that it is a string nothing type-checks.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname, normalize, extname } from 'node:path';

const ROOT = 'app';
const CODE = new Set(['.ts', '.tsx', '.js', '.jsx']);

/** Metro's resolution order for a bare relative specifier, near enough. */
const SUFFIXES = [
  '', '.ts', '.tsx', '.js', '.jsx', '.json', '.mjs', '.cjs',
  '.native.ts', '.native.tsx', '.native.js',
  '.android.ts', '.android.tsx', '.android.js',
  '.ios.ts', '.ios.tsx', '.ios.js',
  '.web.ts', '.web.tsx', '.web.js',
  '/index.ts', '/index.tsx', '/index.js', '/index.jsx', '/index.json',
];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (CODE.has(extname(name))) out.push(p);
  }
  return out;
}

/**
 * ⚠ Strip comments before scanning. Without this the checker reports the
 * repo's own changelog against itself: `buildInfo.ts` quotes historical
 * require paths in prose, and `gameStore.ts` carries an OTA-141 comment
 * explaining a require it DELETED. Both are records of the past, not code, and
 * flagging them would teach the reader to ignore this checker's output — which
 * is how an instrument stops working.
 */
function codeOnly(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1 + ' '.repeat(m.length - p1.length));
}

const SPEC = /require\(\s*['"](\.[^'"]+)['"]\s*\)/g;

let scanned = 0;
const bad = [];
for (const file of walk(ROOT)) {
  const raw = readFileSync(file, 'utf8');
  const src = codeOnly(raw);
  for (const m of src.matchAll(SPEC)) {
    scanned++;
    const spec = m[1];
    const base = normalize(join(dirname(file), spec));
    const ok = SUFFIXES.some((s) => {
      try { statSync(base + s); return true; } catch { return false; }
    });
    if (!ok) {
      const line = src.slice(0, m.index).split('\n').length;
      bad.push({ file, line, spec });
    }
  }
}

if (bad.length) {
  console.error(`[check-requires] ${bad.length} relative require() specifier(s) resolve to nothing.`);
  console.error('  Metro cannot bundle this. tsc, eslint and jest all pass anyway — see the');
  console.error('  header of scripts/check-requires.mjs for why.\n');
  for (const b of bad) console.error(`  ${b.file}:${b.line}  require('${b.spec}')`);
  console.error('\n  Most likely cause: a file moved between directories and a lazy require');
  console.error('  came with it un-rebased. Count the ../ against the new location.');
  process.exit(1);
}

console.log(`[check-requires] OK — ${scanned} relative require() specifiers all resolve.`);
console.log('  ⚠ This proves RESOLUTION only. It does not run Metro, so it cannot see a');
console.log('    module that exists but fails to parse, or a native module missing at runtime.');
