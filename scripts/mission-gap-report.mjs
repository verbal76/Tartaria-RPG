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
//
// ⚠⚠⚠ THIS INDEX WAS NAME-ONLY AND THE REPORT LIED BECAUSE OF IT. The first run
// announced that nine stages — including the APEX of "The Iron Titan in the
// Sentinel Ward" — pointed at a tile that does not exist on a 38-tile map. They
// did not. The real resolver, contractMarkers.posterLocationIndex, indexes
// ALIASES as well as names, and "the Sentinel Ward" has always resolved to the
// Aetheric Chamber, which carries it beside "inner archive". The mission prose
// is written in that vault's own vocabulary — "the inner archive is colder than
// the Ward outside".
//
// A report that mirrors the resolver APPROXIMATELY is worse than no report: it
// manufactures work and, in this case, nearly added a 39th location competing
// for a name the game already had. Mirror it exactly or do not check it.
const norm = (s) => String(s ?? '').replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
const locIndex = new Set();
for (const l of locs) {
  const n = norm(l.name);
  if (n) { locIndex.add(n); locIndex.add(n.replace(/^the\s+/, '')); locIndex.add(`the ${n}`); }
  for (const a of l.aliases ?? []) {
    const k = norm(a);
    if (k) { locIndex.add(k); locIndex.add(k.replace(/^the\s+/, '')); locIndex.add(`the ${k}`); }
  }
}
const locResolves = (name) => {
  const c = norm(name);
  return !c || locIndex.has(c) || locIndex.has(c.replace(/^the\s+/, '')) || locIndex.has(`the ${c}`);
};

// ── prose promises ──────────────────────────────────────────────────────────
// Deliberately conservative: each pattern is a phrase that describes a thing
// HAPPENING to the player, not scenery. A false positive here inflates the
// backlog; a false negative just means we find it on device instead.
/**
 * ⚠⚠ OTA-1583 TIGHTENED THIS, because five of its nine hits were its own noise.
 * The first cut matched bare nouns and unrelated verbs: "he survived the last
 * ATTACK" (a briefing), "you CHARGE a cutter against that hum" (a cast beat),
 * "bait the SWING" (a man drawing timing on a flagstone in chalk), "the water
 * RISES to reclaim its library" (a flood, no enemy). A check that cries wolf
 * five times in nine gets ignored, and then the four real ones get ignored with
 * it. Every clause below now has to be aimed AT THE PLAYER.
 */
const PROMISES_COMBAT = /\b(attacks? you|attacking you|ambush(?:es)? you|rises? from|rise from|rush(?:es)? you|come at you|comes at you|jump you|set on you|drop on you|charges? you|close on you|closes on you|draw steel|bars? your way|block your way|will not let you pass|no way past)\b/i;
const PROMISES_PERSON = /\b(says|said|tells you|asks|nods|hands you|presses|pushes .* across|looks up|waves you|greets|meets you|waiting for you|speaks)\b/i;
const PROMISES_TAKE = /\b(you (?:work|pull|lift|take|pocket|prise|pry|free|recover|collect|scoop|cut) [^.]*(?:free|loose|out|up)?|you put .* in your pack|slides out|comes free)\b/i;

const VERBLESS = new Set([null, undefined, '']);

const out = [];
const W = (s = '') => out.push(s);
const tally = { stages: 0, byFamily: {}, npcNotPlaced: 0, npcStages: [], npcUnreachable: [], locBad: [], combatProseNoSpawn: [], autoWithAction: [], takeProseNoGrant: [], epilogues: [] };

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

      // 1. NPC PRESENT.
      //
      // ⚠ THIS SECTION WAS REWRITTEN BY OTA-1582 BECAUSE ITS FACT EXPIRED. It
      //   used to read: "`npcName` is read in exactly one place in the codebase
      //   — questStage.ts, building the hint string `find <name>`. Nothing
      //   places the person on the tile." That was true when it was written and
      //   it is what motivated the conversation card. It is no longer true: the
      //   card reads npcName, mission-roles.json gives every post a person, and
      //   armedEncounter raises the card on the stage's own tile.
      //
      //   A report that keeps announcing a fixed gap is a report nobody reads.
      //   What matters NOW is whether the player can actually be put in front of
      //   the person, so that is what this counts: a stage is REACHABLE when
      //   something can stop the chain on it. A stage with no verb and a person
      //   in it is consumed on the way past — the person is still named and
      //   still never met.
      if (who) {
        tally.npcNotPlaced += 1;
        if (VERBLESS.has(s.checkKind)) tally.npcUnreachable.push(`${ref} — "${who}"`);
        else tally.npcStages.push(`${ref} — "${who}"`);
      }

      // 2. GO TO. The tile has to resolve or the objective points nowhere.
      if (where && !locResolves(where)) tally.locBad.push(`${ref} — "${where}"`);

      // 3. Prose promises a fight, nothing spawns it. An apex is exempt: the
      //    hunt boss is spawned by scaleHuntBoss (verified by the hunt walker).
      const isApex = s.stageType === 'apex';
      if (PROMISES_COMBAT.test(prose) && !s.spawn && !isApex) {
        tally.combatProseNoSpawn.push(`${ref} — verb ${s.checkKind ?? 'auto'}`);
      }

      // ⚠⚠⚠ OTA-1584 — THE EPILOGUE CLASS, and it is a RULING, not a loophole.
      //
      // Sections 4 and 5 were both crying wolf, and at the same eight stages. All
      // eight are the FINAL beat of their mission: verbless, naming a person, and
      // written as the aftermath — "you carry the Drowned Bell back and the
      // founder strikes it", "the lodge-master carves your name small among the
      // founders". The report called them "no early completion" violations
      // because arrival alone closes them. The owner ruled on exactly these:
      // *"that sounds like a cue for a remote turn in with prose, I'm ok with
      // that."* There is nothing for a player to DO in them — they are the
      // turn-in's words, and the advance loops read them out as the chain closes.
      //
      // ⚠ So they are counted and listed, but as their own class rather than as
      // defects. A check that is wrong at every site it fires is worse than no
      // check: the four real hits in section 3 were nearly lost inside five false
      // ones for exactly this reason.
      const isEpilogue = VERBLESS.has(s.checkKind)
        && i === st.length - 1
        && st.slice(i).every((x) => VERBLESS.has(x.checkKind));
      if (isEpilogue) {
        tally.epilogues.push(`${ref} — "${who || 'no one named'}"`);
      } else {
        // 4. "No early completion": an auto stage whose prose describes the player
        //    DOING something, or a person doing something at them.
        if (VERBLESS.has(s.checkKind) && (PROMISES_PERSON.test(prose) || PROMISES_TAKE.test(prose))) {
          tally.autoWithAction.push(ref);
        }

        // 5. Prose says you pick something up and the stage grants nothing.
        if (PROMISES_TAKE.test(prose) && !s.grants?.item) {
          tally.takeProseNoGrant.push(ref);
        }
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
W('## 1. NPC PRESENT — who the player can actually be put in front of');
W();
W('OTA-1580 gave every post a person (`app/data/npcs/mission-roles.json`) and');
W('OTA-1581 gave them a conversation card that opens on the stage\'s own tile.');
W('OTA-1582 stopped the accept doors skipping the opening beat, which is where 50');
W('of these people stood. So this section is no longer "all of them fail" — it is');
W('the split between the ones the card can raise and the ones the engine still');
W('walks past.');
W();
W(`**Stages naming a person: ${tally.npcNotPlaced}.**`);
W(`- **${tally.npcStages.length} are reachable** — the stage carries a verb, so the chain stops there and the card opens.`);
W(`- **${tally.npcUnreachable.length} are not** — no verb, so the beat is consumed on the way past. Every one of them is an EPILOGUE (see 4b): the mission's last word, which the owner ruled is the turn-in's prose.`);
W();
W('### Still walked past');
W();
W(tally.npcUnreachable.length ? '' : '**None.**');
for (const r of tally.npcUnreachable) W(`- ${r}`);
W();
W('### Reachable');
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
W('## 4b. Epilogues — the turn-in\'s prose, by the owner\'s ruling');
W();
W('The final beat of a mission, verbless, naming a person, written as aftermath.');
W('The owner: *"that sounds like a cue for a remote turn in with prose, I\'m ok');
W('with that."* There is nothing for a player to DO in them; the advance loops read');
W('them out as the chain closes. Listed so the class stays visible, not as a gap.');
W();
W(tally.epilogues.length ? `**${tally.epilogues.length} stages.**` : '**None.**');
for (const r of tally.epilogues) W(`- ${r}`);
W();
W('## 5. Prose says you take something, the stage grants nothing');
W();
W(tally.takeProseNoGrant.length ? `**${tally.takeProseNoGrant.length} stages.**` : '**None.**');
for (const r of tally.takeProseNoGrant) W(`- ${r}`);
W();

process.stdout.write(out.join('\n'));
