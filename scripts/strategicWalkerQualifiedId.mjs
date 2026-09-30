#!/usr/bin/env node
// STRATEGIC_WALKER_QUALIFIED_ID — deterministic apparatus-identity
// recomputation for the POST-STRATEGIC-REPAIR apparatus (the future Life 5
// runtime). Sibling to scripts/canonicalWalkerQualifiedId.mjs, which is left
// UNTOUCHED and continues to describe the Life 4 apparatus exactly as it
// was qualified and frozen — this script does not replace it, and the old
// CANONICAL_WALKER_QUALIFIED_ID remains the correct, permanent identity of
// that historical apparatus.
//
// The manifest below is the OLD 19-file manifest, byte-for-byte unchanged
// (none of those files were touched by the strategic repair), PLUS the 4
// new strategic-repair files this task added. Same deterministic aggregate
// algorithm as the original script (sort by relative path -> `${path}:
// ${sha256hex}\n` -> concatenate -> SHA-256 UTF-8 -> prefix `sha256:`).
//
// Usage: node scripts/strategicWalkerQualifiedId.mjs [--json]

import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { QUALIFIED_MANIFEST as OLD_MANIFEST } from './canonicalWalkerQualifiedId.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const NEW_STRATEGIC_FILES = [
  'test-utils/canonical/itemIntelligence.ts',
  'test-utils/canonical/equipmentOptions.ts',
  'test-utils/canonical/destinationOptions.ts',
  'test-utils/canonical/strategicPolicy.ts',
];

export const STRATEGIC_QUALIFIED_MANIFEST = [...OLD_MANIFEST, ...NEW_STRATEGIC_FILES];

export function computeStrategicQualifiedId(repoRoot = REPO_ROOT) {
  const sorted = [...STRATEGIC_QUALIFIED_MANIFEST].sort();
  const manifest = sorted.map((relPath) => {
    const bytes = readFileSync(resolve(repoRoot, relPath));
    return { path: relPath, size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
  });
  const aggregateInput = manifest.map((m) => `${m.path}:${m.sha256}\n`).join('');
  const aggregate = `sha256:${createHash('sha256').update(aggregateInput, 'utf8').digest('hex')}`;
  return { manifest, aggregateInput, STRATEGIC_WALKER_QUALIFIED_ID: aggregate };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = computeStrategicQualifiedId();
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    for (const m of result.manifest) console.log(`${m.sha256}  ${m.path}  (${m.size} bytes)`);
    console.log('');
    console.log(`STRATEGIC_WALKER_QUALIFIED_ID = ${result.STRATEGIC_WALKER_QUALIFIED_ID}`);
  }
}
