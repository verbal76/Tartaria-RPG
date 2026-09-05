// ⚠⚠⚠ OTA-1586 — WHAT THE SLATE HELD, AND WHY YOU CAME.
//
// The owner sent a complete 4,000-line 4.32.11 log with "mission is still
// broken", and the honest answer was: I cannot tell you which mission, because
// the log never says. Every tap, every die, every parse, every kilobyte of the
// save — and NOT ONE LINE about what contracts were on the slate. Eight parts,
// and the only mission evidence was three `ui: tap "missions"` entries and a
// bare travel course.
//
// His instruction: *"figure out a way to track the missions in every part, and
// find out how it actually starts. did you see where I set it active and
// autoroutes to it, then arrived on the tile. yeah that's me starting it."*
//
// ⚠⚠ AND FINDING OUT HOW IT STARTS FOUND THE DEFECT. Routing is not the problem:
// ROUTE TO and the stage's own ground agree on all 281 stages (pinned below).
// What happens at the END of the walk is the problem. OTA-1581's conversation
// card arms on the 114 stages that NAME A PERSON; every investigate / stealth /
// cast beat with nobody in it announces NOTHING on arrival. Nimari is his own
// case: four live stages anchor there and two of them want INVESTIGATE with no
// npcName, so he walked twenty hours to the tile the game routed him to and the
// game said nothing about why he had come.

import { missionTraceLines, missionArrivalLines } from '../app/engine/missionTrace';
import { HUNTS } from '../app/engine/hunts';
import { MYSTERIES } from '../app/engine/mysteries';
import { STORYLINES } from '../app/engine/factionStorylines';
import {
  huntStageAnchorId, contractStageAnchorId, huntAnchorId, contractAnchorId, resolvePosterLocation,
} from '../app/engine/contractMarkers';
import { stageLocationId } from '../app/engine/questStage';
import type { PlayerCharacter } from '../app/engine/types';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { placedAt } from '../test-utils/placePlayer';

const at = (loc: string, extra: Partial<PlayerCharacter> = {}): PlayerCharacter =>
  ({ ...placedAt(loc), inventory: [], ...extra } as unknown as PlayerCharacter);

describe('OTA-1586 — the slate is in the log now', () => {
  it('⚠⚠⚠ AN EMPTY SLATE SAYS SO — an absent line is not an answer', () => {
    // This is precisely what his log could not tell me. "No missions" and "the
    // log does not record missions" look identical in a file, and they are
    // completely different facts about a bug report.
    const lines = missionTraceLines(at('nimari'));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('missions: none active');
    expect(lines[0]).toContain('at=nimari');
  });

  it('⚠⚠⚠ AND A LIVE ONE CARRIES EVERY FACT THE INVESTIGATION NEEDED', () => {
    const p = at('varakush', {
      activeMysteries: [{ id: 'mystery_red_tower', stage: 0 }],
    } as Partial<PlayerCharacter>);
    const l = missionTraceLines(p).join('\n');
    expect(l).toContain('mystery:mystery_red_tower stage 0/');
    expect(l).toContain('[diplomacy]');
    expect(l).toContain('@varakush HERE');       // is he standing on it
    expect(l).toContain('npc="the Order scholar"'); // who should be here
    expect(l).toContain('gives=');                // what it hands over
  });

  it('⚠⚠ the wrong tile is visible at a glance, which is the whole point', () => {
    const p = at('nimari', {
      activeMysteries: [{ id: 'mystery_red_tower', stage: 0 }],
    } as Partial<PlayerCharacter>);
    const l = missionTraceLines(p).join('\n');
    expect(l).toContain('@varakush');
    expect(l).not.toContain('HERE');
    expect(l).toContain('at=nimari');
  });

  it('⚠⚠ a PAUSED contract is called out — it explains a dead tile better than anything', () => {
    const p = at('varakush', {
      activeMysteries: [{ id: 'mystery_red_tower', stage: 0, tracked: false }],
    } as Partial<PlayerCharacter>);
    expect(missionTraceLines(p).join('\n')).toContain('PAUSED');
  });

  it('⚠⚠ a missing pack item is marked, not merely listed', () => {
    // "I did the thing and nothing happened" is usually this.
    const p = at('cradle_of_dusk', {
      activeStorylines: [{ id: 'story_order_red_tower', stage: 2 }],
    } as Partial<PlayerCharacter>);
    expect(missionTraceLines(p).join('\n')).toContain('✗MISSING');
  });

  it('⚠ and a finished chain reads as finished, not as a dead tile', () => {
    const p = at('varakush', {
      activeMysteries: [{ id: 'mystery_red_tower', stage: 99 }],
    } as Partial<PlayerCharacter>);
    expect(missionTraceLines(p).join('\n')).toContain('ALL STAGES DONE, ready to turn in');
  });
});

describe('OTA-1586 — arriving on the tile finally says why', () => {
  it('⚠⚠⚠ HIS NIMARI CASE: an investigate stage with nobody in it now speaks', () => {
    // mystery_ashen_codex stage 1 is INVESTIGATE at Nimari and names no one, so
    // OTA-1581's card cannot arm on it. Before this OTA, arriving said nothing
    // at all — which is exactly the twenty-hour walk he described.
    const p = at('nimari', {
      activeMysteries: [{ id: 'mystery_ashen_codex', stage: 1 }],
    } as Partial<PlayerCharacter>);
    const lines = missionArrivalLines(p);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('this is the place');
    expect(lines[0]).toContain('search this ground');
  });

  it('⚠⚠ it fires for a person-stage too — the card is the interaction, this is the receipt', () => {
    const p = at('varakush', {
      activeMysteries: [{ id: 'mystery_red_tower', stage: 0 }],
    } as Partial<PlayerCharacter>);
    expect(missionArrivalLines(p)[0]).toContain('find the Order scholar');
  });

  it('⚠⚠ and it stays quiet where it should — wrong tile, paused, or nothing live', () => {
    expect(missionArrivalLines(at('nimari'))).toEqual([]);
    expect(missionArrivalLines(at('nimari', {
      activeMysteries: [{ id: 'mystery_red_tower', stage: 0 }],
    } as Partial<PlayerCharacter>))).toEqual([]);
    expect(missionArrivalLines(at('varakush', {
      activeMysteries: [{ id: 'mystery_red_tower', stage: 0, tracked: false }],
    } as Partial<PlayerCharacter>))).toEqual([]);
  });

  it('⚠ a stage still owed an item says so rather than sending them at a wall', () => {
    const p = at('cradle_of_dusk', {
      activeStorylines: [{ id: 'story_order_red_tower', stage: 2 }],
    } as Partial<PlayerCharacter>);
    expect(missionArrivalLines(p)[0]).toContain('you still need First Fragment');
  });
});

describe('OTA-1586 — how it actually starts: the route is not the problem', () => {
  it('⚠⚠⚠ ROUTE TO AND THE STAGE AGREE ON ALL 281 STAGES', () => {
    // The first suspicion was that OTA-1582 (records now start at stage 0, the
    // giver's hub) had left ROUTE TO aiming at the contract's far anchor. It has
    // not: the atlas pin and the route button both walk with the stage. Measured
    // rather than assumed, and pinned so it stays true.
    const bad: string[] = [];
    for (const d of HUNTS) {
      d.stages.forEach((s, i) => {
        const route = huntStageAnchorId(d as never, i);
        const stage = stageLocationId(s, huntAnchorId(d as never), resolvePosterLocation);
        if (route !== stage) bad.push(`hunt ${d.id}#${i}`);
      });
    }
    for (const d of [...MYSTERIES, ...STORYLINES]) {
      d.stages.forEach((s, i) => {
        const route = contractStageAnchorId(d as never, i);
        const stage = stageLocationId(s, contractAnchorId(d as never), resolvePosterLocation);
        if (route !== stage) bad.push(`${d.id}#${i}`);
      });
    }
    expect(bad).toEqual([]);
  });
});

describe('OTA-1586 — it is wired where a log will actually see it', () => {
  const STORE = readFileSync(join(__dirname, '..', 'app', 'state', 'gameStore.ts'), 'utf8');
  const SLOT = readFileSync(join(__dirname, '..', 'app', 'state', 'slices', 'slotSlice.ts'), 'utf8');

  it('⚠⚠⚠ ON EVERY ARRIVAL, and under the session seam', () => {
    // "Every part" is the requirement. Arrival covers a session that moves; the
    // seam covers one that loads in and reads the contracts screen without
    // moving, which no arrival line would ever catch.
    expect(STORE).toContain("for (const l of missionTraceLines(get().player)) get().appendLog('debug', l);");
    expect(STORE).toContain("for (const l of missionArrivalLines(get().player, get().worldMemory)) get().appendLog('world', l);");
    expect(SLOT).toContain('mt.missionTraceLines(get().player)');
  });

  it('⚠ the trace is a reader — it decides nothing', () => {
    const TRACE = readFileSync(join(__dirname, '..', 'app', 'engine', 'missionTrace.ts'), 'utf8');
    // Same resolvers the engine uses. A diagnostic that computes its own answer
    // tells you about the diagnostic.
    expect(TRACE).toContain('stageLocationId');
    expect(TRACE).toContain('resolvePosterLocation');
    expect(TRACE).toContain('stageRequirementMet');
  });
});
