#!/usr/bin/env node
// CANONICAL_WALKER_QUALIFIED_ID — deterministic apparatus-identity recomputation.
//
// Read-only. Hashes the exact, finite set of runtime files the qualified
// canonical Walker apparatus is built from (the manifest below — see the
// Guardian-qualification-freeze receipt in scratchpad/canonical-life-reports/
// for the full audit trail that produced this list) and prints an aggregate
// SHA-256 identity. Run this immediately before starting any canonical Life
// and compare its output to the CANONICAL_WALKER_QUALIFIED_ID recorded in
// the freeze receipt — if they differ, the apparatus has changed since
// qualification and that Life must NOT start.
//
// Deliberately excludes: qualification/regression test files (__tests__/
// canonical*.test.ts), qualification-framework-only modules never executed
// by a Life driver (qualificationHelpers.ts, qualify.ts,
// qualificationPredicates.ts), the isolated-Guardian test-setup-only fixture
// (guardianCombatIsolationFixture.ts — Life itself always travels for real),
// evidence/report artifacts, and cartography documentation. Those are real
// and valuable but are not part of what a Life driver actually executes.
//
// Usage: node scripts/canonicalWalkerQualifiedId.mjs [--json]

import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// The exact, finite qualified-apparatus manifest (relative to repo root).
// This is the transitive runtime import closure of bootFreshTutorialComplete()
// (test-utils/canonical/bootHelpers.ts) plus the modules a Life driver
// imports directly alongside it (combatLoop.ts, guardianApproachOptions.ts,
// artifactIdentity.ts) plus CanonicalWalker's one dependency outside
// test-utils/canonical/ (the base Walker chassis it subclasses).
export const QUALIFIED_MANIFEST = [
  'test-utils/canonical/CanonicalWalker.ts',
  'test-utils/canonical/actionExecutor.ts',
  'test-utils/canonical/artifactIdentity.ts',
  'test-utils/canonical/bootHelpers.ts',
  'test-utils/canonical/combatLoop.ts',
  'test-utils/canonical/decisionJournal.ts',
  'test-utils/canonical/dice.ts',
  'test-utils/canonical/guardianApproachOptions.ts',
  'test-utils/canonical/hostProfile.ts',
  'test-utils/canonical/logMirror.ts',
  'test-utils/canonical/playerView.ts',
  'test-utils/canonical/policy.ts',
  'test-utils/canonical/presentation.ts',
  'test-utils/canonical/qualification.ts',
  'test-utils/canonical/rngLedger.ts',
  'test-utils/canonical/snapshot.ts',
  'test-utils/canonical/storeDiffer.ts',
  'test-utils/canonical/virtualClock.ts',
  'test-utils/playerWalker.ts',
];

export function computeQualifiedId(repoRoot = REPO_ROOT) {
  const sorted = [...QUALIFIED_MANIFEST].sort();
  const manifest = sorted.map((relPath) => {
    const bytes = readFileSync(resolve(repoRoot, relPath));
    return { path: relPath, size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
  });
  const aggregateInput = manifest.map((m) => `${m.path}:${m.sha256}\n`).join('');
  const aggregate = `sha256:${createHash('sha256').update(aggregateInput, 'utf8').digest('hex')}`;
  return { manifest, aggregateInput, CANONICAL_WALKER_QUALIFIED_ID: aggregate };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = computeQualifiedId();
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    for (const m of result.manifest) console.log(`${m.sha256}  ${m.path}  (${m.size} bytes)`);
    console.log('');
    console.log(`CANONICAL_WALKER_QUALIFIED_ID = ${result.CANONICAL_WALKER_QUALIFIED_ID}`);
  }
}
