#!/usr/bin/env node
// Test-fixture typecheck RATCHET.
//
// The shipped app source is strict-clean and hard-gated by `tsc -p tsconfig.ci.json`
// (the "typecheck (source)" CI job). The __tests__ tree, however, carries a body of
// pre-existing fixture shape-drift — test objects built before a stat/field was added
// to the production types. Studio-quality process says: don't let that debt GROW
// silently (the exact failure the audit flagged — "201 errors rotting unnoticed with
// no CI gate"), but also don't block the pipeline on a risky 112-file rewrite.
//
// This ratchet runs the FULL project typecheck, counts the errors that live under
// __tests__, and compares that count to a committed baseline (.ci-typecheck-tests-baseline).
//   • count  >  baseline  → FAIL (a new test broke the types — fix it or it can't merge).
//   • count === baseline  → pass.
//   • count  <  baseline  → pass, and print a nudge to lower the baseline (debt shrank).
//
// So the debt is frozen at its current size and can only ratchet DOWN. New test code is
// held to the same strict bar as source; the legacy fixtures are grandfathered until
// someone cleans them.
//
// Usage:  node scripts/ci-typecheck-tests.mjs
//         node scripts/ci-typecheck-tests.mjs --update-baseline   (rewrite the baseline file)

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const baselineFile = join(root, '.ci-typecheck-tests-baseline');

function countTestErrors() {
  let out = '';
  try {
    // Full-project typecheck. tsc exits non-zero when there are errors; capture stdout.
    out = execSync('npx tsc --noEmit --pretty false', { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    out = `${e.stdout ?? ''}${e.stderr ?? ''}`;
  }
  // Count only diagnostics whose file path is under __tests__/.
  const lines = out.split('\n').filter((l) => /(^|[\/\\])__tests__[\/\\].*error TS\d+/.test(l));
  return { count: lines.length, sample: lines.slice(0, 8) };
}

const { count, sample } = countTestErrors();
const updating = process.argv.includes('--update-baseline');

if (updating) {
  writeFileSync(baselineFile, `${count}\n`);
  console.log(`[ci-typecheck-tests] baseline written: ${count}`);
  process.exit(0);
}

const baseline = existsSync(baselineFile) ? parseInt(readFileSync(baselineFile, 'utf8').trim(), 10) : 0;

if (count > baseline) {
  console.error(`[ci-typecheck-tests] FAIL — test typecheck errors grew: ${count} > baseline ${baseline}.`);
  console.error('New or edited test code must typecheck. Fix the fixture, or if you intentionally');
  console.error('reduced other debt, run `node scripts/ci-typecheck-tests.mjs --update-baseline`.');
  console.error('First offending lines:');
  for (const l of sample) console.error(`  ${l}`);
  process.exit(1);
}

if (count < baseline) {
  console.log(`[ci-typecheck-tests] test typecheck errors DROPPED: ${count} < baseline ${baseline}.`);
  console.log('Nice — lower the baseline: `node scripts/ci-typecheck-tests.mjs --update-baseline`.');
  process.exit(0);
}

console.log(`[ci-typecheck-tests] OK — test typecheck errors at baseline (${count}). No growth.`);
process.exit(0);
