#!/usr/bin/env node
// ⚠⚠ P19 — THE STAGE VALIDATOR. Owner, on the hunts: *"all of the hunts are broken cuz
// there's multiple stages in each one where you have no idea what you're supposed to do,
// where you're supposed to go or what you're supposed to have."*
//
// A hunt stage is only playable if four things hold, and none of them were ever checked:
//
//   1. Its `locationName` RESOLVES to a real, routable place (name or alias in the atlas).
//      A stage naming a place that doesn't exist routes nowhere and refuses forever.
//   2. Every `requires` is GRANTED by an earlier stage of the same hunt. Otherwise the
//      gate can never open — the exact failure the owner hit ("who's sister? what book?").
//   3. Nothing is granted twice under the same name inside one hunt (a mission item that
//      arrives twice is a duplication bug wearing a story hat).
//   4. The stage's verb is one the button bar actually has.
//
// ⚠ RATCHET: every stage of every hunt now names its own ground, so this REQUIRES it.
// The whole catalogue was brought to 116/116 in one pass; letting a new hunt ship without
// it would put back the exact hole the pass just closed. A hunt with a placeless stage
// fails the build.
import { readFileSync } from 'node:fs';

const hunts = JSON.parse(readFileSync('app/data/quests/hunts.json', 'utf8')).hunts;
const mysteries = JSON.parse(readFileSync('app/data/quests/mysteries.json', 'utf8')).mysteries;
const rawLoc = JSON.parse(readFileSync('app/data/locations/locations.json', 'utf8'));
const locs = Array.isArray(rawLoc) ? rawLoc : rawLoc.locations;

// Same index the engine builds in contractMarkers.posterLocationIndex().
const atlas = new Set();
for (const l of locs) {
  atlas.add(l.name.toLowerCase());
  for (const a of l.aliases ?? []) atlas.add(a.toLowerCase());
}
// resolvePosterLocation strips a trailing parenthetical and a leading article.
const resolvable = (name) => {
  const bare = String(name).replace(/\s*\([^)]*\)\s*$/, '').trim().toLowerCase();
  return atlas.has(bare) || atlas.has(bare.replace(/^the\s+/, ''));
};

const VERBS = new Set([null, 'investigate', 'stealth', 'diplomacy', 'escape', 'cast', 'attack_provoke', 'boss']);

const errors = [];
let bound = 0, total = 0, routed = 0;

// ⚠ Both families, one rule. Mysteries had it WORSE than the hunts: their matcher checked
// the verb and nothing else — no location test at all — so all 18 could be walked end to
// end from a single tile. Same validator, same ratchet, so neither family can drift back.
for (const h of [...hunts, ...mysteries]) {
  const granted = new Set();
  // ⚠ A null stage is auto-consumed by the engine, so a `requires` on one is a gate nothing
  // ever evaluates. It may GRANT (the consume loop hands it over); it may not DEMAND.
  h.stages.forEach((s, i) => {
    total++;
    const at = `${h.id} stage ${i}`;
    if ((s.checkKind ?? null) === null && s.requires) {
      errors.push(`${at}: a null (auto-consumed) stage cannot carry \`requires\` — nothing evaluates it`);
    }
    if (!VERBS.has(s.checkKind ?? null)) errors.push(`${at}: unknown checkKind ${JSON.stringify(s.checkKind)}`);
    if (!s.locationName) {
      errors.push(`${at}: no locationName — the stage has no ground, so it cannot be routed to or refused from`);
    } else {
      routed++;
      if (!resolvable(s.locationName)) errors.push(`${at}: locationName "${s.locationName}" does not resolve to any atlas location or alias`);
    }
    if (s.requires) {
      const want = s.requires.item;
      if (!granted.has(want)) errors.push(`${at}: requires "${want}", which no earlier stage of ${h.id} grants`);
    }
    if (s.grants) {
      const give = s.grants.item;
      if (granted.has(give)) errors.push(`${at}: grants "${give}" a second time in the same hunt`);
      granted.add(give);
    }
    if (s.grants || s.requires || s.locationName || s.npcName) bound++;
  });
}

if (errors.length) {
  console.error('[check-hunt-stages] FAILED — ' + errors.length + ' unplayable stage(s):');
  for (const e of errors) console.error('  ✗ ' + e);
  process.exit(1);
}
console.log(`[check-hunt-stages] OK — ${hunts.length} hunts + ${mysteries.length} mysteries, ${total} stages, ${bound} bound, ${routed} carry their own ground.`);
console.log('  ⚠ Data only. It proves every stage names real ground and every `requires` has an');
console.log('    earlier `grants`. It CANNOT prove the ground is reachable from where the player');
console.log('    stands — the walker suite does that.');
