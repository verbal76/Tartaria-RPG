#!/usr/bin/env node
// CONTENT REACHABILITY — can the player actually GET to the content we authored?
//
// ⚠⚠ WHY THIS EXISTS. Owner, 2026-08-09: *"every mechanical aspect of the game has to be
// able to be finished."* The completability audit in PUNCHLIST.md traces whether a loop
// PAYS OUT; this script answers the other half — whether the content is REACHABLE at all.
// Both can fail silently, and neither shows up in a unit test, because every individual
// piece is valid on its own. A collectible fragment tagged for a biome no location has is
// a perfectly well-formed record that can never drop.
//
// ⚠ WHAT THIS DELIBERATELY DOES **NOT** DO. It checks data-to-data references. It cannot
// tell you a quest-giver never spawns, or that a room is unreachable because of a gate in
// code — that is the P2 class of finding in PUNCHLIST.md, which took reading the spawn
// logic to see. A clean run here means "no dangling references", NOT "everything is
// reachable". Saying otherwise would make this the sort of green check that teaches people
// to stop looking, which this repo has already been burned by once (see OTA-1205 and the
// permanently-red iOS build).
//
// Usage:  node scripts/check-reachability.mjs
//         node scripts/check-reachability.mjs --verbose

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const verbose = process.argv.includes('--verbose');

function load(rel) {
  const p = join(root, rel);
  if (!existsSync(p)) return null;
  const d = JSON.parse(readFileSync(p, 'utf8'));
  if (Array.isArray(d)) return d;
  for (const v of Object.values(d)) if (Array.isArray(v)) return v;
  return null;
}

const failures = [];
const notes = [];
function fail(check, detail) { failures.push(`${check}: ${detail}`); }
function ok(check, detail) { notes.push(`  ✓ ${check} — ${detail}`); }

// ── 1. Collectible fragments must be droppable somewhere ────────────────────
// All four drop sites pass `currentScene.location.tags` into pickFragmentForBiome
// (gameStore.ts 14629 / 20297 / 28546 / 29320), so a fragment is reachable iff its
// biomeTags intersect some location's tags.
{
  const locs = load('app/data/locations/locations.json') ?? [];
  const worldTags = new Set();
  for (const l of locs) for (const t of l.tags ?? []) worldTags.add(String(t).toLowerCase());

  const stories = load('app/data/collectables/character_stories.json') ?? [];
  let total = 0; const unreachable = [];
  for (const s of stories) {
    for (const f of s.fragments ?? []) {
      total++;
      const tags = (f.biomeTags ?? []).map((t) => String(t).toLowerCase());
      if (!tags.length) { unreachable.push(`${f.id} (no biomeTags)`); continue; }
      if (!tags.some((t) => worldTags.has(t))) unreachable.push(`${f.id} (tags: ${tags.join(',')})`);
    }
  }
  if (unreachable.length) {
    fail('collectible fragments', `${unreachable.length}/${total} can never drop — no location carries their biome tags\n    ${unreachable.join('\n    ')}`);
  } else {
    ok('collectible fragments', `all ${total} match a real location's tags`);
  }
}

// ── 2. Quest reward items must exist in a catalog ───────────────────────────
// ⚠ THIS ONE FAILS SILENTLY IN THE GAME, which is why it is worth a gate.
// `lookupCraftedItem` (crafting.ts:230) NEVER returns null — an unknown name falls back to
// a tagless Common `misc`. So a typo'd reward still "works": the player finishes the quest
// and receives junk carrying the right name, with no stats and no error anywhere.
{
  const names = new Set();
  for (const f of ['materials', 'weapons', 'armor', 'gear', 'amulets', 'rings', 'exploration', 'dogGear']) {
    for (const it of load(`app/data/items/${f}.json`) ?? []) if (it?.name) names.add(it.name);
  }
  const missing = [];
  let checked = 0;
  for (const [rel, field] of [
    ['app/data/quests/mysteries.json', 'rewardItem'],
    ['app/data/quests/faction-storylines.json', 'rewardItem'],
  ]) {
    for (const r of load(rel) ?? []) {
      const v = r?.[field];
      if (!v) continue;
      checked++;
      if (!names.has(v)) missing.push(`${rel} ${r.id}: "${v}"`);
    }
  }
  if (missing.length) {
    fail('quest reward items', `${missing.length}/${checked} resolve to a tagless Common misc instead of the intended item\n    ${missing.join('\n    ')}`);
  } else {
    ok('quest reward items', `all ${checked} resolve against ${names.size} catalog names`);
  }
  // ⚠ NOT CHECKED HERE, on purpose: mystery `trophyName`. 17 of 18 are absent from the
  // catalogs and that is CORRECT — trophies are minted inline with explicit kind/rarity/
  // tags (gameStore.ts:26319) and never looked up. Flagging them would be a false alarm,
  // and a punch-list gate that cries wolf is one people learn to skip.
}

// ── 3. Quest factions must exist ────────────────────────────────────────────
{
  const fids = new Set((load('app/data/factions/factions.json') ?? []).map((f) => f?.id).filter(Boolean));
  const bad = [];
  let checked = 0;
  for (const rel of ['app/data/quests/mysteries.json', 'app/data/quests/faction-storylines.json', 'app/data/quests/faction-quests.json']) {
    for (const r of load(rel) ?? []) {
      if (!r?.factionId) continue;
      checked++;
      if (!fids.has(r.factionId)) bad.push(`${rel} ${r.id}: "${r.factionId}"`);
    }
  }
  if (bad.length) fail('quest factions', `${bad.length}/${checked} reference a faction that does not exist\n    ${bad.join('\n    ')}`);
  else ok('quest factions', `all ${checked} resolve against ${fids.size} factions`);
}

// ── 4. Every quest-giving faction needs a vendor to hand in to ──────────────
// ⚠ This is necessary, NOT sufficient — see PUNCHLIST P2. Six of these vendors exist but
// are only reachable through a 1-in-30 random roll, which this check CANNOT see. It is
// here to catch the outright-zero case.
{
  const vendors = load('app/data/npcs/vendors.json') ?? [];
  const haveVendor = new Set(vendors.map((v) => v?.faction).filter(Boolean));
  const questFactions = new Set();
  for (const rel of ['app/data/quests/mysteries.json', 'app/data/quests/faction-storylines.json', 'app/data/quests/faction-quests.json']) {
    for (const r of load(rel) ?? []) if (r?.factionId) questFactions.add(r.factionId);
  }
  const stranded = [...questFactions].filter((f) => !haveVendor.has(f));
  if (stranded.length) fail('turn-in vendors', `factions with quests but NO vendor at all: ${stranded.join(', ')}`);
  else ok('turn-in vendors', `all ${questFactions.size} quest factions have at least one vendor (see PUNCHLIST P2 — "at least one" is not the same as reachable)`);
}

// ── Report ──────────────────────────────────────────────────────────────────
if (verbose || failures.length) for (const n of notes) console.log(n);

if (failures.length) {
  console.error(`\n[check-reachability] FAIL — ${failures.length} check(s) found unreachable content.\n`);
  for (const f of failures) console.error(`  ✗ ${f}\n`);
  console.error('Authored content the player can never get to is the same defect as content');
  console.error('that was never written, and it is harder to notice. Fix the reference, or');
  console.error('record the exception in PUNCHLIST.md with the reason.\n');
  process.exit(1);
}

console.log(`[check-reachability] OK — ${notes.length} checks clean.`);
console.log('  ⚠ Data references only. This CANNOT see spawn-gated content (PUNCHLIST P2);');
console.log('    a clean run means "no dangling references", not "everything is reachable".');
