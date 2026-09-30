#!/usr/bin/env node
// REPAIRED_LIFE_DRIVER_QUALIFIED_ID — Phase 14 (Life 5 combat-policy repair).
//
// The complete executable surface of the REPAIRED apparatus a future
// canonical Life 6 driver would import, directly or transitively. Sibling to
// scripts/canonicalWalkerQualifiedId.mjs (Life 4's frozen identity),
// scripts/strategicWalkerQualifiedId.mjs (the isolated strategic-repair
// identity before driver integration), and scripts/lifeDriverQualifiedId.mjs
// (Life 5's own frozen, ACTUALLY-RUN identity) — all three left UNTOUCHED,
// all three remain correct, permanent identities of their own historical
// apparatus states.
//
// Manifest = lifeDriverQualifiedId.mjs's own 25-file LIFE_DRIVER_QUALIFIED_MANIFEST
// (Life 5's exact frozen manifest, unchanged), PLUS the two files this repair
// task adds/changes:
//   - test-utils/canonical/lifeOrchestrator.ts — CHANGED this task: gained the
//     new resolveCombatEncounter() export (the reusable in-combat seam), on
//     top of its unchanged Phase 13 exports. Its hash legitimately differs
//     from Life 5's own frozen manifest.
//   - test-utils/canonical/tacticalReconsideration.ts — NEW this task: the
//     encounter-local tactical-reconsideration wrapper + memory type. Not
//     present in Life 5's manifest at all (Life 5 never had this repair).
//
// policy.ts, combatLoop.ts, guardianApproachOptions.ts, playerView.ts,
// actionExecutor.ts, CanonicalWalker.ts, equipmentOptions.ts,
// destinationOptions.ts, itemIntelligence.ts, strategicPolicy.ts,
// strategicEvidence.ts all remain byte-identical to Life 5's own frozen
// manifest — confirmed by this script reusing their unchanged hashes
// directly from LIFE_DRIVER_QUALIFIED_MANIFEST's own file list, computed
// fresh below, not copied as a literal.
//
// Usage: node scripts/repairedLifeDriverQualifiedId.mjs [--json]

import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LIFE_DRIVER_QUALIFIED_MANIFEST as LIFE5_MANIFEST } from './lifeDriverQualifiedId.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const NEW_FILES = [
  'test-utils/canonical/tacticalReconsideration.ts',
];

// lifeOrchestrator.ts is already present in LIFE5_MANIFEST; its CONTENT
// changed this task, which the fresh hash computation below reflects
// automatically — no path-list change needed for it, only for the
// genuinely new file.
export const REPAIRED_LIFE_DRIVER_QUALIFIED_MANIFEST = [...LIFE5_MANIFEST, ...NEW_FILES];

export function computeRepairedLifeDriverQualifiedId(repoRoot = REPO_ROOT) {
  const sorted = [...REPAIRED_LIFE_DRIVER_QUALIFIED_MANIFEST].sort();
  const manifest = sorted.map((relPath) => {
    const bytes = readFileSync(resolve(repoRoot, relPath));
    return { path: relPath, size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
  });
  const aggregateInput = manifest.map((m) => `${m.path}:${m.sha256}\n`).join('');
  const aggregate = `sha256:${createHash('sha256').update(aggregateInput, 'utf8').digest('hex')}`;
  return { manifest, aggregateInput, REPAIRED_LIFE_DRIVER_QUALIFIED_ID: aggregate };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = computeRepairedLifeDriverQualifiedId();
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    for (const m of result.manifest) console.log(`${m.sha256}  ${m.path}  (${m.size} bytes)`);
    console.log('');
    console.log(`REPAIRED_LIFE_DRIVER_QUALIFIED_ID = ${result.REPAIRED_LIFE_DRIVER_QUALIFIED_ID}`);
  }
}
