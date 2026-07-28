#!/usr/bin/env node
// OTA-1025 — regenerate the catalog-name snapshot. Run this in the SAME commit as
// any content OTA that adds/renames/removes item names. The companion lock
// test fails the build if a snapshot name disappears from the catalogs
// without a LEGACY_ITEM_RENAMES migration entry (HANDOFF §3a rename policy).
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const files = ['weapons', 'armor', 'gear', 'exploration', 'materials', 'amulets', 'rings', 'dogGear', 'runecasters'];
const names = new Set();
for (const f of files) {
  const d = JSON.parse(readFileSync(join(root, 'app', 'data', 'items', `${f}.json`), 'utf8'));
  const rows = Array.isArray(d) ? d : (Object.values(d).find((v) => Array.isArray(v)) ?? []);
  for (const r of rows) if (r && typeof r.name === 'string') names.add(r.name);
}
const out = Array.from(names).sort();
writeFileSync(join(root, 'app', 'data', 'items', 'catalog-names.snapshot.json'), JSON.stringify(out, null, 2) + '\n');
console.log(`catalog-name snapshot: ${out.length} names`);
