#!/usr/bin/env node
// LIFE_DRIVER_QUALIFIED_ID — deterministic apparatus-identity recomputation
// for the POST-DRIVER-INTEGRATION apparatus (the complete executable
// surface a future Life 5 would actually run). Sibling to
// scripts/canonicalWalkerQualifiedId.mjs (Life 4's frozen identity, left
// UNTOUCHED) and scripts/strategicWalkerQualifiedId.mjs (the isolated
// strategic-repair identity BEFORE driver integration, also left
// UNTOUCHED — both remain correct, permanent identities of their own
// historical apparatus states).
//
// Manifest = the strategic manifest's 19 unchanged original files, PLUS the
// 4 strategic-repair files (one of which — equipmentOptions.ts — changed
// this task: equippedName() was exported for the orchestrator's use, so its
// hash legitimately differs from the Phase 12 strategic receipt), PLUS the
// 2 new driver-integration files this task adds: lifeOrchestrator.ts (the
// reusable driver seam) and strategicEvidence.ts (the non-perturbing
// evidence sink). This is the COMPLETE executable surface — every file a
// future canonicalLife5.test.ts would import, directly or transitively,
// through this apparatus's own qualified modules.
//
// Usage: node scripts/lifeDriverQualifiedId.mjs [--json]

import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { QUALIFIED_MANIFEST as OLD_MANIFEST } from './canonicalWalkerQualifiedId.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const STRATEGIC_FILES = [
  'test-utils/canonical/itemIntelligence.ts',
  'test-utils/canonical/equipmentOptions.ts',
  'test-utils/canonical/destinationOptions.ts',
  'test-utils/canonical/strategicPolicy.ts',
];

const DRIVER_INTEGRATION_FILES = [
  'test-utils/canonical/lifeOrchestrator.ts',
  'test-utils/canonical/strategicEvidence.ts',
];

export const LIFE_DRIVER_QUALIFIED_MANIFEST = [...OLD_MANIFEST, ...STRATEGIC_FILES, ...DRIVER_INTEGRATION_FILES];

export function computeLifeDriverQualifiedId(repoRoot = REPO_ROOT) {
  const sorted = [...LIFE_DRIVER_QUALIFIED_MANIFEST].sort();
  const manifest = sorted.map((relPath) => {
    const bytes = readFileSync(resolve(repoRoot, relPath));
    return { path: relPath, size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
  });
  const aggregateInput = manifest.map((m) => `${m.path}:${m.sha256}\n`).join('');
  const aggregate = `sha256:${createHash('sha256').update(aggregateInput, 'utf8').digest('hex')}`;
  return { manifest, aggregateInput, LIFE_DRIVER_QUALIFIED_ID: aggregate };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = computeLifeDriverQualifiedId();
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    for (const m of result.manifest) console.log(`${m.sha256}  ${m.path}  (${m.size} bytes)`);
    console.log('');
    console.log(`LIFE_DRIVER_QUALIFIED_ID = ${result.LIFE_DRIVER_QUALIFIED_ID}`);
  }
}
