// ⚠⚠⚠ OTA-1582 — THE GUY WHO GIVES YOU THE JOB.
//
// THE MEASUREMENT, and it is the largest single finding of the whole mission
// audit. All 50 staged missions — 18 hunts, 18 mysteries, 14 storylines — open
// on a stage that NAMES A PERSON at a hub: the Drakovan reeve closing his bounty
// book, the Order envoy sliding a sealed reliquary across the table, the
// physician grabbing your sleeve. All 50 of those stages were skipped at accept.
//
//   hunts       → `firstActionableHuntStage` walked past every leading
//                 `checkKind: null` stage… and then the same door overwrote its
//                 own answer with a literal `stage: 1` four lines later.
//   mysteries   → `{ ...mm, stage: 1 }`, a literal.
//   storylines  → `{ ...rec, stage: 1 }`, the same literal again.
//
// Three doors, three answers to one question, and the same outcome from all of
// them: the token appeared in the pack and the person who handed it over never
// existed. The owner asked it in exactly those words — *"I have to meet a guy to
// get a note, right?"* — and for every mission in the game, the answer was no.
//
// ⚠⚠ THE RULE: A STAGE THAT NAMES A PERSON IS A MEETING, AND A MEETING IS NEVER
// SKIPPED. Pure narration — no verb AND nobody in it — still auto-consumes, which
// is all the skip was ever for (OTA-1219: a beat no verb can match must not wedge
// a chain). The 50 opening beats now carry `diplomacy`, so both doors work: the
// conversation card's button, and the typed verb, through the same handler. That
// is OTA-1547's rule — *"the typed commands still work, the buttons route through
// the same handlers"* — applied to the other 50 conversations in the game.

import huntsData from '../app/data/quests/hunts.json';
import mysteriesData from '../app/data/quests/mysteries.json';
import storyData from '../app/data/quests/faction-storylines.json';
import { firstActionableStage } from '../app/engine/questStage';
import { firstActionableHuntStage } from '../app/engine/hunts';
import { armedEncounter } from '../app/engine/missionEncounterArm';
import { personFor } from '../app/engine/missionRoles';
import type { PlayerCharacter } from '../app/engine/types';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { placedAt } from '../test-utils/placePlayer';

const rows = <T>(d: unknown): T[] =>
  (Array.isArray(d) ? d : (Object.values(d as object).find(Array.isArray) ?? [])) as T[];

interface Stage { npcName?: string; checkKind?: string | null; locationName?: string }
interface Mission { id: string; title: string; stages?: Stage[] }

const HUNTS = rows<Mission>(huntsData);
const MYST = rows<Mission>(mysteriesData);
const STORY = rows<Mission>(storyData);
const ALL = [...HUNTS, ...MYST, ...STORY];

describe('OTA-1582 — every mission opens on somebody', () => {
  it('⚠⚠⚠ ALL 50 STAGED MISSIONS NAME A PERSON IN STAGE 0', () => {
    expect(ALL.length).toBe(50);
    const anonymous = ALL.filter((m) => !m.stages?.[0]?.npcName).map((m) => m.id);
    expect(anonymous).toEqual([]);
  });

  it('⚠⚠⚠ AND NOT ONE OF THEM IS SKIPPED ANY MORE', () => {
    // Before this OTA every one of these returned 1 (or worse — the hunt door
    // computed a value and then discarded it for a literal).
    for (const m of ALL) {
      expect({ at: m.id, start: firstActionableStage(m.stages as never) })
        .toEqual({ at: m.id, start: 0 });
    }
  });

  it('⚠⚠ the hunt-shaped wrapper is the same answer, not a second one', () => {
    // Two definitions of "where does a record start" is how the literal `1` got
    // in. `firstActionableHuntStage` now delegates.
    for (const h of HUNTS) {
      expect(firstActionableHuntStage(h as never)).toBe(firstActionableStage(h.stages as never));
    }
  });

  it('⚠⚠ PURE NARRATION IS STILL SKIPPED — that is what the skip was always for', () => {
    // OTA-1219's actual bug: a stage no verb can match wedges the chain forever.
    // Nobody in it, no verb → step over it, exactly as before.
    expect(firstActionableStage([
      { checkKind: null },
      { checkKind: null },
      { checkKind: 'investigate' },
    ])).toBe(2);
    // A person in it stops the walk even with no verb — and check:missionclaims
    // is what stops anyone AUTHORING that, because nothing could then advance it.
    expect(firstActionableStage([{ checkKind: null, npcName: 'the Order envoy' }])).toBe(0);
    // A verb stops it whether or not anybody is standing there.
    expect(firstActionableStage([{ checkKind: 'diplomacy' }])).toBe(0);
    expect(firstActionableStage(undefined)).toBe(0);
  });

  it('⚠⚠⚠ AND THE OPENING BEAT CARRIES A VERB, so the typed path works too', () => {
    // A meeting the card can open but no command can pay would be a button
    // masquerading as a system. `diplomacy` is matched by all three families'
    // advance matchers AND by stageAwaitsIntentHere, so TALK at the hub pays it.
    for (const m of ALL) {
      expect({ at: m.id, kind: m.stages![0]!.checkKind }).toEqual({ at: m.id, kind: 'diplomacy' });
    }
  });

  it('⚠⚠ every opening beat happens at a named place, and somebody real is in it', () => {
    for (const m of ALL) {
      const s = m.stages![0]!;
      expect({ at: m.id, where: !!s.locationName }).toEqual({ at: m.id, where: true });
      const who = personFor(s.npcName, {});
      expect({ at: m.id, named: !!who?.name }).toEqual({ at: m.id, named: true });
    }
  });
});

describe('OTA-1582 — and the card is there when you arrive', () => {
  const playerAt = (locationId: string, extra: Partial<PlayerCharacter> = {}): PlayerCharacter =>
    ({ ...placedAt(locationId), inventory: [], ...extra } as unknown as PlayerCharacter);

  it('⚠⚠⚠ A FRESH RECORD AT STAGE 0 RAISES THE BRIEFING CARD ON THE HUB TILE', () => {
    // hunt_bog_dragon opens with the Drakovan reeve, in Drakova.
    const p = playerAt('drakova', { activeHunts: [{ id: 'hunt_bog_dragon', stage: 0 }] } as Partial<PlayerCharacter>);
    const armed = armedEncounter(p);
    expect(armed?.missionId).toBe('hunt_bog_dragon');
    expect(armed?.person.name).toBe('Reeve Halvard');
    expect(armed?.person.title).toBe('Drakovan Reeve');
    // Nobody is posted to stop you at a briefing — the button is the beat itself.
    expect(armed?.hasFight).toBe(false);
    expect(armed?.gives).toBe("Reeve's Brass Token");
  });

  it('⚠⚠ one for each family, so no door is left on the old behaviour', () => {
    const cases: Array<[string, string, keyof PlayerCharacter, string]> = [
      ['drakova', 'hunt_bog_dragon', 'activeHunts', 'Reeve Halvard'],
      ['varakush', 'mystery_red_tower', 'activeMysteries', 'Scholar Wend'],
      ['varakush', 'story_order_red_tower', 'activeStorylines', 'Vesryn'],
    ];
    for (const [where, id, key, who] of cases) {
      const p = playerAt(where, { [key]: [{ id, stage: 0 }] } as Partial<PlayerCharacter>);
      expect({ id, who: armedEncounter(p)?.person.name }).toEqual({ id, who });
    }
  });
});

describe('OTA-1582 — the accept doors', () => {
  const QUEST = readFileSync(join(__dirname, '..', 'app', 'state', 'slices', 'questSlice.ts'), 'utf8');

  it('⚠⚠⚠ NO DOOR WRITES A LITERAL STAGE ANY MORE', () => {
    // The bug in one line: three `stage: 1`s, one of them overwriting a correct
    // computation made four lines earlier.
    expect(QUEST).not.toContain('stage: 1 }');
    expect(QUEST.match(/QS_firstActionableStage\(/g)?.length).toBe(3);
  });

  it('⚠⚠ the opening narration is not printed twice', () => {
    // Stage 0 is no longer skipped, so `advance*` prints this narration when the
    // player answers the card. Printing it at accept as well would say the same
    // paragraph twice a few taps apart. The faction-quest door keeps its copy —
    // faction quests carry no stages and nothing else will ever print it.
    expect(QUEST.match(/appendLog\('world', stage0\.narration\)/g)?.length).toBe(1);
  });
});

describe('OTA-1582 — the gate that stops this coming back a fourth time', () => {
  const GATE = readFileSync(join(__dirname, '..', 'scripts', 'check-mission-claims.mjs'), 'utf8');
  const PKG = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8'));
  const CI = readFileSync(join(__dirname, '..', '.github', 'workflows', 'ci.yml'), 'utf8');

  it('⚠⚠⚠ IT IS WIRED, not just written', () => {
    // A gate nobody runs is a comment.
    expect(PKG.scripts['check:missionclaims']).toBe('node scripts/check-mission-claims.mjs');
    expect(CI).toContain('npm run check:missionclaims');
  });

  it('⚠⚠⚠ IT GUARDS THE TRAP THIS OTA CREATED', () => {
    // `firstActionableStage` now STOPS on a named stage. Author one with no verb
    // and the record starts there with nothing able to move it — unwinnable from
    // accept, silently. Verified to fire by nulling hunt_bog_dragon's stage 0.
    expect(GATE).toContain('and carries no checkKind');
    expect(GATE).toContain('unwinnable from accept');
  });

  it('⚠⚠ it mirrors the location resolver EXACTLY, aliases included', () => {
    // The lesson that cost a phantom 39th location: an approximate mirror
    // manufactures work. "the Sentinel Ward" resolves through an ALIAS.
    expect(GATE).toContain('l.aliases ?? []');
    expect(GATE).toContain('Mirror it exactly or do not check');
  });
});
