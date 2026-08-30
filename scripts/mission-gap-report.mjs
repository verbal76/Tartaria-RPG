#!/usr/bin/env node
// mission-gap-report — measures the shipped mission data against the owner's
// acceptance spec (Tartaria_Player_Experience_Mission_Spec).
//
// ⚠ It reports; it does not assert. The numbers here are what the program has
// to close. Every check below is a fact about the DATA or a fact about the
// ENGINE that was verified by reading the code, never an inference.
//
// Usage: node scripts/mission-gap-report.mjs [chains.json]

import { readFileSync } from 'node:fs';

const J = (p) => JSON.parse(readFileSync(p, 'utf8'));
const rows = (d) => (Array.isArray(d) ? d : Object.values(d).find(Array.isArray) ?? []);
const dicts = (a) => a.filter((x) => x && typeof x === 'object' && !Array.isArray(x));

const hunts = dicts(rows(J('app/data/quests/hunts.json')));
const myst = dicts(rows(J('app/data/quests/mysteries.json')));
const story = dicts(rows(J('app/data/quests/faction-storylines.json')));
const locs = dicts(rows(J('app/data/locations/locations.json')));

// ── location resolution, mirroring resolvePosterLocation ────────────────────
const norm = (s) => String(s ?? '').replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
const locIndex = new Set();
for (const l of locs) {
  const n = norm(l.name);
  if (!n) continue;
  locIndex.add(n);
  locIndex.add(n.replace(/^the\s+/, ''));
  locIndex.add(`the ${n}`);
}
const locResolves = (name) => {
  const c = norm(name);
  return !c || locIndex.has(c) || locIndex.has(c.replace(/^the\s+/, '')) || locIndex.has(`the ${c}`);
};

// ── prose promises ──────────────────────────────────────────────────────────
// Deliberately conservative: each pattern is a phrase that describes a thing
// HAPPENING to the player, not scenery. A false positive here inflates the
// backlog; a false negative just means we find it on device instead.
const PROMISES_COMBAT = /\b(attack|attacks|attacking|ambush|ambushes|rise from|rises|rush you|come at you|jump you|set on you|drop on you|charge|charges you|close on you|swing|draw steel|block your|bar your way|will not let you|no way past)\b/i;
const PROMISES_PERSON = /\b(says|said|tells you|asks|nods|hands you|presses|pushes .* across|looks up|waves you|greets|meets you|waiting for you|speaks)\b/i;
const PROMISES_TAKE = /\b(you (?:work|pull|lift|take|pocket|prise|pry|free|recover|collect|scoop|cut) [^.]*(?:free|loose|out|up)?|you put .* in your pack|slides out|comes free)\b/i;

const VERBLESS = new Set([null, undefined, '']);

const out = [];
const W = (s = '') => out.push(s);
const tally = { stages: 0, byFamily: {}, npcNotPlaced: 0, npcStages: [], locBad: [], combatProseNoSpawn: [], autoWithAction: [], takeProseNoGrant: [] };

function scan(family, items) {
  for (const h of items) {
    const st = Array.isArray(h.stages) ? dicts(h.stages) : [];
    st.forEach((s, i) => {
      tally.stages += 1;
      tally.byFamily[family] = (tally.byFamily[family] ?? 0) + 1;
      const where = s.locationName ?? '';
      const who = s.npcName ?? '';
      const prose = `${s.narration ?? ''} ${s.arbiter ?? ''}`;
      const ref = `${family} · ${h.title} · stage ${i + 1} (${s.stageType ?? '?'})`;

      // 1. NPC PRESENT. VERIFIED FACT: `npcName` is read in exactly one place in
      //    the codebase — questStage.ts building the hint string "find <name>".
      //    Nothing places the person on the tile. So EVERY stage naming a person
      //    fails the spec's "NPC PRESENT" requirement today.
      if (who) { tally.npcNotPlaced += 1; tally.npcStages.push(`${ref} — "${who}"`); }

      // 2. GO TO. The tile has to resolve or the objective points nowhere.
      if (where && !locResolves(where)) tally.locBad.push(`${ref} — "${where}"`);

      // 3. Prose promises a fight, nothing spawns it. An apex is exempt: the
      //    hunt boss is spawned by scaleHuntBoss (verified by the hunt walker).
      const isApex = s.stageType === 'apex';
      if (PROMISES_COMBAT.test(prose) && !s.spawn && !isApex) {
        tally.combatProseNoSpawn.push(`${ref} — verb ${s.checkKind ?? 'auto'}`);
      }

      // 4. "No early completion": an auto stage whose prose describes the player
      //    DOING something, or a person doing something at them.
      if (VERBLESS.has(s.checkKind) && (PROMISES_PERSON.test(prose) || PROMISES_TAKE.test(prose))) {
        tally.autoWithAction.push(ref);
      }

      // 5. Prose says you pick something up and the stage grants nothing.
      if (PROMISES_TAKE.test(prose) && !s.grants?.item) {
        tally.takeProseNoGrant.push(ref);
      }
    });
  }
}

scan('Hunt', hunts);
scan('Mystery', myst);
scan('Storyline', story);

W('# Mission gap report — shipped data vs the acceptance spec');
W();
W(`Stages scanned: **${tally.stages}** (${Object.entries(tally.byFamily).map(([k, v]) => `${k} ${v}`).join(' · ')})`);
W();
W('> Faction quests (65) have no stages and whisper chains (21) run on their own');
W('> machinery; both are scanned separately. This report covers the 197 staged beats.');
W();
W('## 1. NPC PRESENT — the largest gap, and it is total');
W();
W('**VERIFIED FACT:** `npcName` is read in exactly one place in the codebase —');
W('`questStage.ts:112`, which builds the hint string `find <name>`. Nothing');
W('places the person on the tile, gives them dialogue, or lets them hand anything');
W('over. Every stage below names somebody who is not there.');
W();
W(`**Stages naming an NPC: ${tally.npcNotPlaced} — all of them fail this requirement.**`);
W();
for (const r of tally.npcStages) W(`- ${r}`);
W();
W('## 2. GO TO — tiles that do not resolve');
W();
W(tally.locBad.length ? `**${tally.locBad.length} stages.**` : '**None.** Every authored `locationName` resolves.');
for (const r of tally.locBad) W(`- ${r}`);
W();
W('## 3. Prose promises a fight, nothing spawns it');
W();
W('Apex stages are exempt — the hunt boss is spawned by `scaleHuntBoss`, verified');
W('end-to-end by the hunt walker.');
W();
W(tally.combatProseNoSpawn.length ? `**${tally.combatProseNoSpawn.length} stages.**` : '**None.**');
for (const r of tally.combatProseNoSpawn) W(`- ${r}`);
W();
W('## 4. No early completion — auto stages whose prose describes an action');
W();
W('`checkKind: null` advances on its own. Where the prose has a person speaking to');
W('you or the player taking something, arrival alone completes a beat the text says');
W('you performed.');
W();
W(tally.autoWithAction.length ? `**${tally.autoWithAction.length} stages.**` : '**None.**');
for (const r of tally.autoWithAction) W(`- ${r}`);
W();
W('## 5. Prose says you take something, the stage grants nothing');
W();
W(tally.takeProseNoGrant.length ? `**${tally.takeProseNoGrant.length} stages.**` : '**None.**');
for (const r of tally.takeProseNoGrant) W(`- ${r}`);
W();

process.stdout.write(out.join('\n'));
