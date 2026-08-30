#!/usr/bin/env node
// export-mission-sheet — dumps every mission, every stage and every line of its
// text into one Markdown sheet the owner can mark up outside the repo.
//
// ⚠ This is a REPORTING tool, not a gate. It reads the shipped data and prints
// it; it asserts nothing. The checklist the owner writes against it is what the
// gate will eventually enforce.
//
// Usage: node scripts/export-mission-sheet.mjs [chains.json] > MISSION_AUDIT.md

import { readFileSync } from 'node:fs';

const J = (p) => JSON.parse(readFileSync(p, 'utf8'));
const rows = (d) => {
  if (Array.isArray(d)) return d;
  for (const v of Object.values(d)) if (Array.isArray(v)) return v;
  return [];
};
const dicts = (a) => a.filter((x) => x && typeof x === 'object' && !Array.isArray(x));
const esc = (s) => (s === null || s === undefined ? '' : String(s).replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ').trim());
const cell = (s) => esc(s) || '—';

const hunts = dicts(rows(J('app/data/quests/hunts.json')));
const myst = dicts(rows(J('app/data/quests/mysteries.json')));
const story = dicts(rows(J('app/data/quests/faction-storylines.json')));
const fq = dicts(rows(J('app/data/quests/faction-quests.json')));
const chains = dicts(rows(J(process.argv[2] ?? 'chains.json')));

const out = [];
const W = (s = '') => out.push(s);

W('# Tartaria — Mission Text & Progression Audit Sheet');
W();
W('Generated from the shipped data. Every stage below is one block you can mark up.');
W();
W('The engine carries four structured bindings per stage. **Those are what the game');
W('enforces; the prose is what the player is told.** Where they disagree, the player');
W('is lied to — that is the whole class of bug this sheet exists to find.');
W();
W('| field | meaning |');
W('|---|---|');
W('| **Where** | `locationName` — the tile this stage is bound to. `—` means it falls back to the contract anchor. |');
W('| **Who** | `npcName` — the person standing there for this stage. `—` means nobody is authored. |');
W('| **Needs** | `requires` — must already be in the pack or the stage refuses to advance. |');
W('| **Gives** | `grants` — handed over when the stage advances. Created at grant time, so it need not exist in any catalog. |');
W('| **Verb** | `checkKind` — the action that resolves the stage. `auto` = pure narration, advances on its own. |');
W('| **Spawns** | `spawn` — a stage-authored enemy pack. `—` means no bodies, or (on an apex) the hunt boss. |');
W();
W('## How to mark this up');
W();
W('Write bullets under each stage\'s **Checklist**. Suggested shorthand:');
W();
W('- `MUST:` something that has to be true for the text to be honest');
W('- `MISSING:` the text promises it and the game does not have it');
W('- `MOVE:` wrong tile or wrong person');
W('- `REWORD:` the game is right and the text is wrong');
W('- `POPUP:` the interaction exists but is buried in prose and needs a visible button — the SPEAK TO YULKA treatment');
W();
W('---');
W();

const staged = [...hunts, ...myst, ...story];
const totalStages = staged.reduce((n, h) => n + (h.stages?.length ?? 0), 0);
W('## Contents');
W();
W(`- **Hunts** — ${hunts.length}`);
W(`- **Mysteries** — ${myst.length}`);
W(`- **Faction storylines** — ${story.length}`);
W(`- **Faction quests (single objective, no stages)** — ${fq.length}`);
W(`- **Whisper chains** — ${chains.length}`);
W(`- **Total staged beats** — ${totalStages}`);
W();
W('---');
W();

function emitStaged(heading, items) {
  W(`# ${heading}`);
  W();
  for (const h of items) {
    W(`## ${esc(h.title || h.id)}`);
    W();
    W(`- **id:** \`${esc(h.id)}\``);
    if (h.factionId) W(`- **faction:** \`${esc(h.factionId)}\``);
    if (h.targetLocationName) W(`- **poster sends you to:** ${esc(h.targetLocationName)}`);
    if (h.targetEnemyName) W(`- **target:** ${esc(h.targetEnemyName)}`);
    if (h.difficultyLabel) {
      W(`- **difficulty:** ${esc(h.difficultyLabel)} (tier ${h.difficultyTier}, rec HP ${h.recommendedHp}, rec weapon ${esc(h.recommendedWeaponRarity)})`);
    }
    const rw = [];
    if (h.rewardTc) rw.push(`${h.rewardTc} TC`);
    if (h.rewardRep) rw.push(`${h.rewardRep} rep`);
    if (h.rewardItem) rw.push(esc(h.rewardItem));
    if (h.trophyName) rw.push(`trophy: ${esc(h.trophyName)}`);
    if (rw.length) W(`- **reward:** ${rw.join(', ')}`);
    if (h.minRep !== undefined && h.minRep !== null) W(`- **min rep:** ${h.minRep}`);
    W();
    if (h.posterText) { W(`> **POSTER —** ${esc(h.posterText)}`); W(); }

    const st = Array.isArray(h.stages) ? dicts(h.stages) : [];
    st.forEach((s, i) => {
      const g = s.grants ?? {};
      const r = s.requires ?? {};
      const sp = s.spawn ?? null;
      W(`### Stage ${i + 1} — ${cell(s.stageType || '(untyped)')}`);
      W();
      W('| Where | Who | Needs | Gives | Verb | Spawns |');
      W('|---|---|---|---|---|---|');
      W(`| ${cell(s.locationName)} | ${cell(s.npcName)} | ${cell(r.item)} | ${cell(g.item)} | ${cell(s.checkKind) === '—' ? 'auto' : cell(s.checkKind)} | ${sp ? `${esc(sp.enemyName)} ×${sp.count ?? 1}` : '—'} |`);
      W();
      W('**Text:**');
      W();
      W(`> ${esc(s.narration)}`);
      W();
      if (s.arbiter) { W(`> **Arbiter —** ${esc(s.arbiter)}`); W(); }
      W('**Checklist:**');
      W();
      W('- ');
      W();
    });
    W('---');
    W();
  }
}

emitStaged('Hunts', hunts);
emitStaged('Mysteries', myst);
emitStaged('Faction Storylines', story);

W('# Faction Quests (single objective)');
W();
W('No stages — one objective, one reward. The prose still has to match the objective.');
W();
for (const q of fq) {
  W(`## ${esc(q.title || q.id)}`);
  W();
  W(`- **id:** \`${esc(q.id)}\` · **faction:** \`${esc(q.factionId)}\``);
  if (q.requirement !== undefined && q.requirement !== null) W(`- **requires rep:** ${q.requirement}`);
  if (q.objective) W(`- **objective:** \`${esc(q.objective.kind)}\` → ${cell(q.objective.target)}${q.objective.count ? ` ×${q.objective.count}` : ''}`);
  if (q.fetch) W(`- **fetch:** \`${esc(JSON.stringify(q.fetch))}\``);
  if (q.reward) W(`- **reward:** \`${esc(JSON.stringify(q.reward))}\``);
  W();
  if (q.description) { W(`> ${esc(q.description)}`); W(); }
  W('**Checklist:**');
  W();
  W('- ');
  W();
}
W('---');
W();

W('# Whisper Chains');
W();
W('These plant in a hub room, send you to a meet tile, and resolve there.');
W();
for (const c of chains) {
  const ct = c.content ?? {};
  W(`## ${esc(c.title || c.id)}`);
  W();
  W(`- **id:** \`${esc(c.id)}\``);
  W(`- **plants at:** ${(c.plantLocations ?? []).map((p) => `\`${esc(p)}\``).join(', ') || '—'} (chance ${c.plantChance})`);
  if (c.activeHours) W(`- **hours:** ${JSON.stringify(c.activeHours)}`);
  if (c.targetOffset) W(`- **meet tile offset:** dx ${JSON.stringify(c.targetOffset.dxRange)} · dy ${JSON.stringify(c.targetOffset.dyRange)}`);
  if (ct.npcName) W(`- **who you meet:** ${esc(ct.npcName)}`);
  if (ct.fetchEnemy) W(`- **fetch enemy:** ${esc(ct.fetchEnemy)}`);
  if (ct.reward) W(`- **reward:** \`${esc(JSON.stringify(ct.reward))}\``);
  const btns = [];
  if (ct.acceptBtnLabel) btns.push(`accept: \`${esc(ct.acceptBtnLabel)}\``);
  if (ct.buyBtnLabel) btns.push(`buy: \`${esc(ct.buyBtnLabel)}\``);
  if (btns.length) W(`- **visible buttons:** ${btns.join(' · ')}`);
  W();
  for (const line of c.plantLines ?? []) W(`> **PLANT —** ${esc(line)}`);
  W();
  const ORDER = ['pitch', 'brief', 'acceptLine', 'sighting', 'fetchSpawnLine', 'fetchRouteLabel',
    'meetRouteLabel', 'returnRouteLabel', 'recoverLine', 'returnLine', 'leaveLine',
    'emptyHandsLine', 'kicker', 'goodsShort', 'goodsLong', 'markNoun', 'stolen'];
  for (const k of ORDER) {
    const v = ct[k];
    if (typeof v === 'string' && v.trim()) W(`> **${k} —** ${esc(v)}`);
    else if (Array.isArray(v)) for (const x of v) if (typeof x === 'string') W(`> **${k} —** ${esc(x)}`);
  }
  for (const x of ct.completeLines ?? []) if (typeof x === 'string') W(`> **complete —** ${esc(x)}`);
  W();
  W('**Checklist:**');
  W();
  W('- ');
  W();
  W('---');
  W();
}

process.stdout.write(out.join('\n'));
