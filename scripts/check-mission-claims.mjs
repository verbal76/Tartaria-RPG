#!/usr/bin/env node
// ⚠⚠⚠ check:missionclaims — THE ANSWER TO "THIS IS THE THIRD TIME YOU HAD TO DO
// THIS."
//
// The owner, after the third mission-text pass: *"run a complete audit on all
// the missions, the text and the mission progress, and make sure the events
// actually happen and are not hidden under text."* Three audits found three sets
// of the same class of defect, because an audit is a snapshot and the data kept
// moving. A gate is not a snapshot.
//
// ⚠ WHAT BELONGS HERE AND WHAT DOES NOT. This asserts things that are TRUE OR
// FALSE about the shipped data, never things that are a matter of taste. The
// prose-quality questions live in `scripts/mission-gap-report.mjs`, which
// reports and asserts nothing. Anything here that cannot yet be zero is a
// RATCHET with a written baseline, in the shape check-slice-pins established:
// it may shrink, never grow.
//
// Usage:  node scripts/check-mission-claims.mjs
//         node scripts/check-mission-claims.mjs --update-baseline

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const baselineFile = join(root, '.ci-mission-claims-baseline');
const J = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));
const rows = (d) => (Array.isArray(d) ? d : Object.values(d).find(Array.isArray) ?? []);
const dicts = (a) => a.filter((x) => x && typeof x === 'object' && !Array.isArray(x));

const FAMILIES = [
  ['Hunt', 'app/data/quests/hunts.json'],
  ['Mystery', 'app/data/quests/mysteries.json'],
  ['Storyline', 'app/data/quests/faction-storylines.json'],
];

// ── the location resolver, mirrored EXACTLY ─────────────────────────────────
//
// ⚠⚠⚠ AN APPROXIMATE MIRROR IS WORSE THAN NO CHECK. The first run of the gap
// report indexed NAMES ONLY and duly announced that nine stages — including the
// apex of "The Iron Titan in the Sentinel Ward" — pointed at a tile that does not
// exist. They did not. `posterLocationIndex` indexes ALIASES too, and "the
// Sentinel Ward" has always resolved to the Aetheric Chamber, which carries it
// beside "inner archive". That false positive nearly added a 39th location
// competing for a name the game already had. Mirror it exactly or do not check.
const locs = dicts(rows(J('app/data/locations/locations.json')));
const norm = (s) => String(s ?? '').replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
const locIndex = new Set();
for (const l of locs) {
  for (const raw of [l.name, ...(l.aliases ?? [])]) {
    const k = norm(raw);
    if (!k) continue;
    locIndex.add(k);
    locIndex.add(k.replace(/^the\s+/, ''));
    locIndex.add(`the ${k}`);
  }
}
const locResolves = (name) => {
  const c = norm(name);
  return !c || locIndex.has(c) || locIndex.has(c.replace(/^the\s+/, '')) || locIndex.has(`the ${c}`);
};

// ── the roster ──────────────────────────────────────────────────────────────
const roster = (J('app/data/npcs/mission-roles.json').roles ?? []);
const roleKeys = new Set(roster.map((r) => String(r.role).trim().toLowerCase()));

// ── what the prose promises ─────────────────────────────────────────────────
// Deliberately the SAME pattern the gap report uses, so the two never disagree
// about what counts as "the text says there is a fight here".
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

const errors = [];
let fightProseNoSpawn = 0;
const namesUsed = new Set();

for (const [family, path] of FAMILIES) {
  for (const m of dicts(rows(J(path)))) {
    const stages = Array.isArray(m.stages) ? dicts(m.stages) : [];

    // ⚠⚠⚠ CHECK 1 — THE WEDGE. `firstActionableStage` (OTA-1582) walks past a
    // leading stage only when it has NO verb AND nobody in it, so a record now
    // starts ON a named opening beat. That is the whole point — but it means a
    // leading stage that names a person and carries NO verb is a chain that
    // nothing can move: no verb matches null, and the conversation card's
    // PROCEED is the only other door. Author one and the mission is dead on
    // accept, silently. This is the trap OTA-1582 created and it is why this
    // gate exists.
    let i = 0;
    while (i < stages.length && stages[i].checkKind === null && !stages[i].npcName) i += 1;
    if (i < stages.length && stages[i].checkKind === null && stages[i].npcName) {
      errors.push(
        `${family} ${m.id}: stage ${i} names "${stages[i].npcName}" and carries no checkKind. ` +
        'A freshly-accepted record STARTS there and no verb can ever pay it — the mission is ' +
        'unwinnable from accept. Give the stage a verb (diplomacy fits a meeting) or take the ' +
        'person out of it.',
      );
    }

    // ⚠⚠⚠ CHECK 1b — THE ONE THE PROSE REGEX COULD NEVER SEE, and the reason
    // OTA-1583 exists. A hunt `boss` stage with no `spawn` spawns
    // `HuntDef.targetEnemyName` — the hunt's LEGENDARY apex. That is right for
    // the last one and wrong for every other: fourteen hunts carried a mid-chain
    // boss stage whose own prose named a lesser creature (a Mud Wraith feeding
    // on a dead boy, a Rust Lurker at an injured apprentice, a Raven flock on a
    // Harpy's cache) and every one of them stood the apex up at stage 3 of 7
    // instead. Worse, only the LAST boss freezes for the kill, so the stage
    // advanced on the spawn and the player could walk away from it.
    //
    // No prose pattern can catch that — the sentence reads fine. The STRUCTURE
    // is the defect: boss + not-last + no spawn.
    if (family === 'Hunt') {
      let lastBoss = -1;
      stages.forEach((s, i) => { if (s.checkKind === 'boss') lastBoss = i; });
      stages.forEach((s, i) => {
        if (s.checkKind !== 'boss' || i === lastBoss || s.spawn) return;
        errors.push(
          `Hunt ${m.id} stage ${i}: a mid-chain \`boss\` stage with no \`spawn\` stands up ` +
          `"${m.targetEnemyName}" — this hunt's apex — at stage ${i} of ${stages.length - 1}. ` +
          'Author the creature the stage\'s own prose names, or make it the last boss.',
        );
      });
    }

    // ⚠⚠⚠ CHECK 1c — AN EPILOGUE HAS TO BE LAST. OTA-1584.
    //
    // A verbless stage that names a person is one of exactly two things, and the
    // position decides which. At the END it is an EPILOGUE — the mission's last
    // word, which the owner ruled is the turn-in's prose: "that sounds like a cue
    // for a remote turn in with prose, I'm ok with that." All fourteen shipped
    // ones are last.
    //
    // ANYWHERE ELSE it is neither: not a meeting (no verb can pay it, and the
    // conversation card is the only other door), not a turn-in (the chain
    // continues past it). It is a person consumed on the way through for no
    // reason — the exact defect OTA-1580's roster and OTA-1582's accept fix were
    // built to end, reintroduced in the middle of a chain.
    stages.forEach((s, i) => {
      if (s.checkKind !== null || !s.npcName || i === stages.length - 1) return;
      errors.push(
        `${family} ${m.id} stage ${i}: "${s.npcName}" stands in a verbless MID-CHAIN beat. ` +
        'No verb can pay it, so the chain walks past the person without meeting them. ' +
        'Give the stage a verb (it is a meeting) or move it to the end (it is the epilogue).',
      );
    });

    stages.forEach((s, idx) => {
      const ref = `${family} ${m.id} stage ${idx}`;

      // CHECK 2 — the objective has to point somewhere real.
      if (s.locationName && !locResolves(s.locationName)) {
        errors.push(`${ref}: locationName "${s.locationName}" resolves to no tile.`);
      }

      // CHECK 3 — a stage that names a POST must name one the roster holds.
      // ⚠ A name that is not a post is an authored individual (Old Mira,
      // Brother Ammon) and is fine; what is NOT fine is a role-SHAPED name the
      // roster has never heard of, because `personFor` would hand the card a
      // title-less stranger with no successor and no way to be killed.
      if (s.npcName) {
        namesUsed.add(String(s.npcName).trim().toLowerCase());
        const looksLikeAPost = /^(the|a)\s/i.test(String(s.npcName).trim());
        if (looksLikeAPost && !roleKeys.has(String(s.npcName).trim().toLowerCase())) {
          errors.push(
            `${ref}: "${s.npcName}" reads as a POST but mission-roles.json has no such role. ` +
            'Add it to the roster (with a name and two successors) or rename the stage to an ' +
            'individual.',
          );
        }
      }

      // RATCHET — the prose says somebody comes at you and nothing spawns.
      // ⚠ Apex stages are exempt: the hunt boss is spawned by scaleHuntBoss.
      const prose = `${s.narration ?? ''} ${s.arbiter ?? ''}`;
      if (PROMISES_COMBAT.test(prose) && !s.spawn && s.stageType !== 'apex') fightProseNoSpawn += 1;
    });
  }
}

// CHECK 4 — no orphan roles. A post nobody stands in is drift in the other
// direction: the roster grew a person the missions never ask for.
for (const r of roster) {
  if (!namesUsed.has(String(r.role).trim().toLowerCase())) {
    errors.push(`mission-roles.json: "${r.role}" is authored but no stage names it.`);
  }
}

// ⚠⚠⚠ CHECK 5 (OTA-1588) — EXACTLY ONE ANSWER TO "WHAT VERB PAYS A `boss`".
//
// `checkKind: 'boss'` is paid by ATTACK in a hunt, INVESTIGATE in a mystery and
// DIPLOMACY in a storyline. The engine knew that four times over, under a comment
// telling the next person to keep the copies in step by hand — and a fifth reader
// (OTA-1586's arrival line) did not read that comment, guessed "finish it", and
// shipped it onto the last actionable beat of all 15 mysteries and all 15
// storylines: thirty stages telling the player to end a fight that is not there.
//
// So the map lives once, in questStage.ts, and this fails the build if a second
// one appears. It matches the SHAPE of the bug rather than a spelling: any file
// but questStage that pairs the literal 'boss' with a verb literal on one line of
// CODE is reinventing the table. Comments are exempt and are meant to explain it.
const VERB_LITERALS = ['attack', 'investigate', 'diplomacy', 'stealth', 'cast', 'escape'];
const BOSS_MAP_WATCH = [
  'app/engine/missionTrace.ts',
  'app/engine/missionRoles.ts',
  'app/engine/missionEncounterArm.ts',
  'app/engine/hunts.ts',
  'app/engine/mysteries.ts',
  'app/engine/factionStorylines.ts',
  'app/state/gameStore.ts',
  'app/state/slices/questSlice.ts',
  'app/screens/ContractsScreen.tsx',
  'app/components/MissionEncounterCard.tsx',
];
for (const rel of BOSS_MAP_WATCH) {
  const abs = join(root, rel);
  if (!existsSync(abs)) continue;
  const code = readFileSync(abs, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*'))
    .join('\n');
  for (const line of code.split('\n')) {
    // Shape A — a checkKind comparison that also names a verb. This is the four
    // matchers' old form: `next.checkKind === 'boss' && intent === 'investigate'`.
    // ⚠ The `checkKind` requirement is not decoration: without it the enemy debug
    // line (`atk=${g('attack')} … ${e['boss'] ? ' BOSS' : ''}`) fires, and a check
    // that cries wolf is the thing OTA-1584 was about.
    const verb = VERB_LITERALS.find((v) => line.includes(`'${v}'`));
    if (line.includes("'boss'") && line.includes('checkKind') && verb) {
      errors.push(
        `${rel}: a line of code pairs checkKind 'boss' with '${verb}'. That is the family map, ` +
        'and it lives in app/engine/questStage.ts (payingIntent / stageVerbLabel / ' +
        'stageVerbAsk). Call it rather than copying it — see OTA-1588.',
      );
    }
    // Shape B — a lookup table KEYED by boss. This is OTA-1586's form, the one
    // that actually shipped wrong: `boss: 'finish it'` inside a verb→phrase map,
    // with no `checkKind` anywhere near it.
    if (/(^|[{,\s])boss\s*:\s*'/.test(line)) {
      errors.push(
        `${rel}: a table maps \`boss\` to a phrase of its own. A boss beat means a different ` +
        'verb in every family, so a single-entry table is wrong for two of the three. Use ' +
        'app/engine/questStage.ts (stageVerbLabel / stageVerbAsk) — see OTA-1588.',
      );
    }
  }
}

const baseline = existsSync(baselineFile)
  ? Number(readFileSync(baselineFile, 'utf8').trim()) || 0
  : fightProseNoSpawn;

if (process.argv.includes('--update-baseline')) {
  writeFileSync(baselineFile, `${fightProseNoSpawn}\n`);
  process.stdout.write(`check:missionclaims — baseline written: ${fightProseNoSpawn}\n`);
  process.exit(0);
}

for (const e of errors) process.stdout.write(`✗ ${e}\n`);

if (fightProseNoSpawn > baseline) {
  process.stdout.write(
    `✗ prose-promises-a-fight-with-no-spawn: ${fightProseNoSpawn} (baseline ${baseline}). ` +
    'A new stage says somebody comes at you and authored no `spawn`, so nothing does. ' +
    'Author the spawn, or reword the prose.\n',
  );
  process.exit(1);
}
if (errors.length > 0) process.exit(1);

const nudge = fightProseNoSpawn < baseline
  ? `  ↓ shrank from ${baseline} — lower the baseline: node scripts/check-mission-claims.mjs --update-baseline\n`
  : '';
process.stdout.write(
  `check:missionclaims — ok. fight-prose-without-spawn ${fightProseNoSpawn}/${baseline}.\n${nudge}`,
);
