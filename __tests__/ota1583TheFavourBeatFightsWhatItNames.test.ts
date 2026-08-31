// ⚠⚠⚠ OTA-1583 — THE BEAT FIGHTS THE THING ITS OWN PROSE NAMES.
//
// THE MEASUREMENT. Fourteen hunts carry a mid-chain `boss` stage — the "favor"
// beat of the standard_7 template — and every one of them names a specific
// lesser creature in its own sentence: a Mud Wraith feeding on a dead boy, a
// Rust Lurker come to finish an injured apprentice, an Aetheric Raven flock
// picking over a Harpy's cache. Not one carried a `spawn`. A `boss` stage
// without one spawns `HuntDef.targetEnemyName` — the hunt's LEGENDARY apex — so
// all fourteen stood the Bog Dragon, the Sludge Behemoth, the Iron Titan up at
// stage 3 of 7. And because only the LAST boss freezes for the kill, the stage
// advanced on the spawn: the player could walk away from the apex and be on the
// next beat anyway.
//
// ⚠⚠ THIS IS OTA-1576's BUG, UNFIXED. 1576 found exactly this sentence on the
// two `false_summit` stages, gave those two a `spawn`, and stopped. The same
// sentence was true of fourteen more, and no prose pattern could ever have found
// them — the narration reads perfectly. The defect is STRUCTURAL: boss, not
// last, no spawn. That is now a hard check in check:missionclaims.
//
// ⚠⚠⚠ AND THE OWNER'S RULING ON WHAT SHOULD HAPPEN, verbatim: *"identify an
// appropriate someone derived from the existing catalogue based on the lore and
// narration of the mission and make them spawn in and draw first blood — sounds
// like an ambush to me."* First blood is literal: close range, the `surprised`
// penalty the rest of the game already uses, and one enemy volley before the
// player acts — through `runEnemyGroupCounters`, the same single volley every
// combat round runs.

import huntsData from '../app/data/quests/hunts.json';
import mysteriesData from '../app/data/quests/mysteries.json';
import storyData from '../app/data/quests/faction-storylines.json';
import enemiesData from '../app/data/enemies/enemies.json';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { blockAt } from '../test-utils/srcBlock';

const rows = <T>(d: unknown): T[] =>
  (Array.isArray(d) ? d : (Object.values(d as object).find(Array.isArray) ?? [])) as T[];

interface Stage {
  narration: string;
  checkKind?: string | null;
  stageType?: string;
  spawn?: { enemyName: string; count?: number; ambush?: boolean };
}
interface Mission { id: string; title: string; targetEnemyName?: string; stages?: Stage[] }

const HUNTS = rows<Mission>(huntsData);
const ALL: Array<[string, Mission]> = [
  ...HUNTS.map((m) => ['Hunt', m] as [string, Mission]),
  ...rows<Mission>(mysteriesData).map((m) => ['Mystery', m] as [string, Mission]),
  ...rows<Mission>(storyData).map((m) => ['Storyline', m] as [string, Mission]),
];
const ENEMY_NAMES = new Set(rows<{ name: string }>(enemiesData).map((e) => e.name));

const spawnStages = ALL.flatMap(([fam, m]) =>
  (m.stages ?? []).map((s, i) => ({ fam, m, s, i })).filter((x) => x.s.spawn),
);

describe('OTA-1583 — no stage stands up the apex four beats early', () => {
  it('⚠⚠⚠ EVERY MID-CHAIN HUNT BOSS STAGE NOW AUTHORS WHAT IT ACTUALLY FIGHTS', () => {
    // The structural defect, stated as the invariant. Fourteen violations before
    // this OTA; the gate keeps it at zero.
    const offenders: string[] = [];
    for (const h of HUNTS) {
      const stages = h.stages ?? [];
      let lastBoss = -1;
      stages.forEach((s, i) => { if (s.checkKind === 'boss') lastBoss = i; });
      stages.forEach((s, i) => {
        if (s.checkKind === 'boss' && i !== lastBoss && !s.spawn) offenders.push(`${h.id}#${i}`);
      });
    }
    expect(offenders).toEqual([]);
  });

  it('⚠⚠⚠ AND EVERY SPAWN NAMES A CREATURE THE CATALOGUE ACTUALLY HAS', () => {
    // Owner: "derived from the EXISTING catalogue." Where the prose invented one
    // — a "Bog Wraith", a "Mud Crab", "Drowned Reclaimers", "Wing-Things" — the
    // narration was reworded onto its nearest catalogued kin rather than the
    // catalogue being grown to match a passing noun.
    for (const { m, s, i } of spawnStages) {
      expect({ at: `${m.id}#${i}`, known: ENEMY_NAMES.has(s.spawn!.enemyName) })
        .toEqual({ at: `${m.id}#${i}`, known: true });
    }
    expect(spawnStages.length).toBeGreaterThanOrEqual(21);
  });

  it('⚠⚠ THE PROSE NAMES WHAT SPAWNS — that is the whole class of bug', () => {
    // A stage whose text says one creature and whose engine stands up another is
    // exactly what OTA-1576 was filed for.
    //
    // ⚠ ENGLISH PLURALS, not a bare `s` strip — this test's first cut flagged
    // "a flight of Mud Harpies" as silent about the Mud Harpy it spawns, which
    // is the check being wrong rather than the data. Singular, -s and -y→-ies
    // all count as the prose naming it.
    const namesIt = (prose: string, enemy: string): boolean =>
      prose.includes(enemy)
      || prose.includes(`${enemy}s`)
      || (enemy.endsWith('y') && prose.includes(`${enemy.slice(0, -1)}ies`));
    const silent = spawnStages
      .filter(({ s }) => !namesIt(s.narration, s.spawn!.enemyName))
      .map(({ m, i }) => `${m.id}#${i}`);
    // ⚠ OTA-1584 CLOSED THE LAST TWO. The OTA-1576 false summits named their
    // packs obliquely — "three of her daughters", "three of his sworn, jaw-marked
    // in the old sign" — good prose that a player could not connect to the name
    // in the combat log. Both now say the species out loud without losing the
    // voice, so this check is universal rather than universal-with-exceptions.
    expect(silent).toEqual([]);
  });

  it('⚠⚠⚠ AN AMBUSH IS ONLY AUTHORED WHERE THE PROSE SAYS THEY GOT THERE FIRST', () => {
    // Owner's ruling was "draw first blood", and first blood has to be earned by
    // the sentence: concealed cradles, a wall they walk out of, pillars that were
    // already waiting, something coming up under you. Where the player plainly
    // moves first — "it hesitates, deciding between you and him. You decide
    // first." — there is no ambush, and the Swamp Crab spawns like anything else.
    const crab = spawnStages.find((x) => x.m.id === 'hunt_sludge_behemoth' && x.i === 1);
    expect(crab?.s.spawn?.enemyName).toBe('Swamp Crab');
    expect(crab?.s.spawn?.ambush).toBeUndefined();
    expect(crab?.s.narration).toContain('You decide first');

    const wraiths = spawnStages.find((x) => x.m.id === 'hunt_mud_titan' && x.i === 3);
    expect(wraiths?.s.spawn).toEqual({ enemyName: 'Mud Wraith', count: 3, ambush: true });
    expect(wraiths?.s.narration).toContain('behind you');
  });

  it('⚠⚠ and the rewritten prose stops AT the fight instead of narrating the win', () => {
    // The old text said "You drive it off", "You clear them", "you put them down
    // until the water goes quiet" — an outcome the player had not earned, printed
    // before the pack even appeared. Same lie as a card promising a button that
    // is not there.
    const WON = /\byou (?:drive it off|clear them|clear it out|scatter them|put the thing down|put the Shade down)\b/i;
    const narrating = spawnStages.filter(({ s }) => WON.test(s.narration)).map(({ m, i }) => `${m.id}#${i}`);
    expect(narrating).toEqual([]);
  });
});

describe('OTA-1583 — one writer stands them up, in all three families', () => {
  const QUEST = readFileSync(join(__dirname, '..', 'app', 'state', 'slices', 'questSlice.ts'), 'utf8');
  const STORE = readFileSync(join(__dirname, '..', 'app', 'state', 'gameStore.ts'), 'utf8');
  const BIND = readFileSync(join(__dirname, '..', 'app', 'engine', 'questStage.ts'), 'utf8');

  it('⚠⚠⚠ `spawn` IS A SHARED BINDING NOW, not a hunt field', () => {
    // It was read in exactly one place — the hunt boss branch — so a storyline
    // whose prose says an Aetheric Ooze "bars the only stair" had nothing on the
    // stair. Same move P19 made for grants / requires / locationName / npcName.
    expect(BIND).toContain('spawn?: { enemyName: string; count?: number; ambush?: boolean };');
    expect(QUEST.match(/spawnStageEscort\(/g)?.length).toBe(4); // 1 definition + 3 call sites
  });

  it('⚠⚠⚠ AND A SPAWN WITHOUT A CLEAR WOULD BE A WEDGE, so the clear moved too', () => {
    // The escort clear was hunt-only. Extending the spawn to three families
    // without extending the clear would have bricked the very storyline this
    // OTA set out to fix — the chapter holding for a kill nothing watched for.
    // ⚠ OTA-1583 moved the escort clear OUT of gameStore and into questSlice —
    // ninety lines of contract-stage logic that happened to sit in the combat
    // path, and gameStore's shrink-only line ratchet is what forced the issue.
    const clear = blockAt(QUEST, 'export function resolveStageEscortClear(');
    expect(clear).toContain('activeMysteries');
    expect(clear).toContain('activeStorylines');
  });

  it('⚠⚠⚠ FIRST BLOOD REUSES THE ONE VOLLEY, and the one surprise penalty', () => {
    // OTA-1017 already made "the enemies went first" a real state. A second,
    // private way for enemies to hit the player is how two screens come to
    // disagree about what a round is.
    const helper = blockAt(QUEST, 'function spawnStageEscort(');
    expect(helper).toContain("range: ambush ? 'close' : 'mid'");
    expect(helper).toContain("kind: 'surprised'");
    expect(helper).toContain('deps.runEnemyGroupCounters(get, set, live)');
    // ⚠ The penalty lands BEFORE the volley or first blood is not first blood.
    expect(helper.indexOf("kind: 'surprised'")).toBeLessThan(helper.indexOf('deps.runEnemyGroupCounters'));
  });

  it('⚠⚠⚠ THE KILL PATH DOES NOT PARK YOU ON A STAGE NO VERB CAN PAY', () => {
    // The mystery/storyline walker caught this within the hour of the spawn
    // landing. The escort clear advanced with a bare `+ 1`, which was safe while
    // only hunts could spawn and no hunt had narration behind one.
    // `story_order_drowned_library` is exactly that shape — the Ooze on stage 4,
    // a pure-narration epilogue on 5 — so killing the Ooze parked the record ON
    // the epilogue, which no verb can pay and which the auto-consume loops (they
    // live inside `advance*`, not the kill path) never see. Chapter dead,
    // silently, on the very stage this OTA set out to fix.
    // ⚠ OTA-1583 moved the escort clear OUT of gameStore and into questSlice —
    // ninety lines of contract-stage logic that happened to sit in the combat
    // path, and gameStore's shrink-only line ratchet is what forced the issue.
    const clear = blockAt(QUEST, 'export function resolveStageEscortClear(');
    expect(clear).toContain('nextActionableStage(escortRec.def.stages, escortRec.rec.stage + 1)');
    expect(clear).not.toContain('const nextStage = escortRec.rec.stage + 1;');
    // ⚠ And every beat it walks past is still READ OUT — skipping a stage is not
    // a licence to swallow its words.
    expect(clear).toContain("get().appendLog('world', skipped.narration)");
  });

  it('⚠⚠⚠ A CHAIN THAT ENDS ON A KILL STILL SAYS IT IS OVER', () => {
    // `story_order_drowned_library` now closes on the Aetheric Ooze, and the
    // "complete in the field" notice lives in `advanceStoryline` — which the kill
    // path deliberately does not call. The walker caught it: the record reached
    // stages.length and the player was told nothing at all. A chapter ending in
    // silence is the same defect as a beat happening in silence, which is the
    // whole subject of this run of OTAs.
    // ⚠ OTA-1583 moved the escort clear OUT of gameStore and into questSlice —
    // ninety lines of contract-stage logic that happened to sit in the combat
    // path, and gameStore's shrink-only line ratchet is what forced the issue.
    const clear = blockAt(QUEST, 'export function resolveStageEscortClear(');
    expect(clear).toContain('Storyline complete in the field');
  });

  it('⚠⚠ the accept door and the kill path ask DIFFERENT questions, deliberately', () => {
    // Sharing one predicate traded one wedge for another, and the walker proved
    // it in minutes. At ACCEPT a named opening beat must never be skipped
    // (OTA-1582's whole subject). MID-CHAIN a verbless beat is an epilogue, and
    // the owner ruled on those fourteen: "that sounds like a cue for a remote
    // turn in with prose, I'm ok with that." So they are consumed and read out.
    const bind = readFileSync(join(__dirname, '..', 'app', 'engine', 'questStage.ts'), 'utf8');
    expect(blockAt(bind, 'export function firstActionableStage(')).toContain('!stages[i]!.npcName');
    // ⚠ The LOOP CONDITION, not the signature — `nextActionableStage` still
    // accepts npcName in its parameter type (it takes the same stage shape) and
    // must simply not skip on it.
    expect(blockAt(bind, 'export function nextActionableStage(')).not.toContain('!stages[i]!.npcName');
  });

  it('⚠ a peaceful advance still stands nobody up', () => {
    // OTA-1581's persuade-won and take-in-the-aftermath paths.
    expect(QUEST).toContain('const override = peaceful ? null : stageDef.spawn;');
  });
});

describe('OTA-1583 — the gate learned the structural check', () => {
  const GATE = readFileSync(join(__dirname, '..', 'scripts', 'check-mission-claims.mjs'), 'utf8');
  const BASE = readFileSync(join(__dirname, '..', '.ci-mission-claims-baseline'), 'utf8').trim();

  it('⚠⚠⚠ IT CHECKS THE SHAPE, because the sentence reads fine', () => {
    // Verified to fire by deleting hunt_bog_dragon#3's spawn.
    expect(GATE).toContain("s.checkKind !== 'boss' || i === lastBoss || s.spawn");
    expect(GATE).toContain("this hunt's apex");
  });

  it('⚠⚠ and the prose ratchet is at zero, having been cried-wolf at nine', () => {
    // Five of the original nine were the pattern's own noise — "he survived the
    // last ATTACK", "you CHARGE a cutter", "bait the SWING", "the water RISES".
    // A check that is wrong five times in nine gets ignored, and the four real
    // ones get ignored with it.
    expect(BASE).toBe('0');
    expect(GATE).toContain('has to be aimed AT THE PLAYER');
    expect(GATE).not.toContain('|attacking|ambush|ambushes|');
  });
});
