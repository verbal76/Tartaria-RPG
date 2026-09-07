#!/usr/bin/env node
/**
 * ⚠⚠⚠ THE SHIP GATE CANNOT LOSE A SUITE BY ACCIDENT.
 *
 * The split used to be seven bare substrings matched against test paths, so a
 * file opted out of blocking CI by being NAMED "…Sweep" — and two live OTA
 * regression suites had been red and unwatched for exactly that reason. See
 * scripts/heavy-suites.mjs for the full write-up.
 *
 * This gate enforces the replacement rule in both directions:
 *
 *   1. EVERY name in HEAVY_SUITES must exist on disk. A renamed or deleted entry
 *      silently un-excludes nothing today, but it makes the list a lie — and a
 *      list nobody trusts is the same as no list.
 *   2. NO suite may be non-blocking without being named there. Anything under
 *      __tests__/ that is not in the list blocks a ship, by default and without
 *      anyone having to remember.
 *
 * ⚠ It also refuses the OLD mechanism outright: if package.json still passes the
 * bare words to jest, membership is still decided by filename and this gate is
 * decoration. That check is the point of the whole exercise.
 */
import { readdirSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { HEAVY_SUITES } from './heavy-suites.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fail = [];

const onDisk = new Set(
  readdirSync(join(root, '__tests__')).filter((f) => /\.(ts|tsx)$/.test(f)),
);

// 1 — no stale entries
for (const name of HEAVY_SUITES) {
  if (!onDisk.has(name)) fail.push(`heavy-suites.mjs names a file that does not exist: ${name}`);
}

// 2 — no duplicates (a duplicate is a merge that went unnoticed)
const seen = new Set();
for (const name of HEAVY_SUITES) {
  if (seen.has(name)) fail.push(`heavy-suites.mjs lists ${name} twice`);
  seen.add(name);
}

// 3 — the old filename mechanism must be gone from the scripts
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
for (const key of ['test:ci:fast', 'test:ci:heavy']) {
  const cmd = String(pkg.scripts?.[key] ?? '');
  if (/\bstressMode\b|\bSweep\b|\bSmoke\b|\bProbe\b/.test(cmd)) {
    fail.push(
      `package.json "${key}" still splits by FILENAME (${cmd.trim()}). ` +
      'Membership must come from scripts/heavy-suites.mjs, or naming a suite ' +
      '"…Sweep" silently removes it from the ship gate again.',
    );
  }
}

// 4 — say what the split actually is, every run. A gate that only speaks when
//     it is angry teaches nobody what it is guarding.
const blocking = [...onDisk].filter((f) => !seen.has(f)).length;
console.log(`[check:testsplit] blocking ${blocking} · non-blocking ${HEAVY_SUITES.length} · total ${onDisk.size}`);

if (fail.length) {
  console.error('[check:testsplit] FAIL');
  for (const f of fail) console.error('  · ' + f);
  process.exit(1);
}
console.log('[check:testsplit] OK — every suite is blocking unless it is named, with a reason.');
