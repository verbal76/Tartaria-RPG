// ⚠⚠⚠ OTA-1615 — THE MISSION SPEAKS WHERE YOU STAND.
//
// Owner: "the hint was investigate to advance in the missions and it's getting
// annoying jumping back into the missions tab every time. I want to check to see
// what I have to do next. is there a way to call the mission that I'm in into a
// pop-up to see its status while I'm on the exploration screen? happy to just
// scroll through the mission and where I'm at."
//
// ⚠⚠ THE ANSWER WAS ALREADY COMPUTED — IT JUST WENT TO ME. Since OTA-1586 every
// log carries a `missions:` line per live contract with exactly this in it: the
// stage owed and how many there are, the verb that stage wants, the ground it
// happens on and whether the boots are on it, what the pack owes it, tracked or
// paused. `missionStatusCards` is that same reader shaped for the player, and
// this suite holds it to the trace's own discipline — it may not compute an
// answer of its own, because a status card that works out its own answer is
// telling the player about the card.

import { missionStatusCards, missionTraceLines } from '../app/engine/missionTrace';
import { HUNTS, findHuntById } from '../app/engine/hunts';
import { stageObjectiveAsk, stageLocationId } from '../app/engine/questStage';
import { huntAnchorId, resolvePosterLocation } from '../app/engine/contractMarkers';
import { placedAt } from '../test-utils/placePlayer';
import { readFileSync } from 'fs';
import { join } from 'path';

const src = (...p: string[]) => readFileSync(join(__dirname, '..', ...p), 'utf8');

/** A player carrying one hunt at a chosen stage, standing wherever we say. */
function playerWith(huntId: string, stage: number, at: string, opts: { tracked?: boolean } = {}) {
  return {
    // ⚠ placedAt, not a bare id: a fixture that names a location without the
    // coordinates that go with it is the shape OTA's fixture ratchet exists to
    // stop, and this reader is about WHERE the player is standing.
    ...placedAt(at),
    inventory: [],
    activeHunts: [{ id: huntId, stage, tracked: opts.tracked ?? true }],
    activeMysteries: [], activeStorylines: [], activeFactionQuests: [], activeQuests: [],
  } as never;
}

const DOUBTER = 'hunt_servants_doubter';

describe('OTA-1615 — the mission status card reader', () => {
  it('⚠⚠⚠ IT ANSWERS THE TWO QUESTIONS THE TAB JUMP WAS BEING SPENT ON', () => {
    const def = findHuntById(DOUBTER)!;
    const stage = 2;
    const st = def.stages[stage]!;
    const where = stageLocationId(st as never, huntAnchorId(def), resolvePosterLocation);
    const [card] = missionStatusCards(playerWith(DOUBTER, stage, where!));
    expect(card).toBeTruthy();
    // What to do next, and whether this is the place — the whole of his ask.
    // ⚠ OTA-1617 superseded the source: the card composes the OBJECT onto the
    // manner phrase now ("go quietly — come away with the …"), because "go
    // quietly" alone told him how the dice roll and never what he was there
    // for. Same claim, pointed at the function the card actually calls.
    expect(card!.ask).toBe(stageObjectiveAsk('hunt', st as never) || '');
    expect(card!.here).toBe(true);
    expect(card!.stageNo).toBe(stage + 1);
    expect(card!.stageTotal).toBe(def.stages.length);
  });

  it('⚠⚠⚠ …and says plainly when you are somewhere else, by NAME not by id', () => {
    const [card] = missionStatusCards(playerWith(DOUBTER, 2, 'tartarian_outskirts'));
    expect(card!.here).toBe(false);
    expect(card!.where.length).toBeGreaterThan(0);
    // A location id would be the log's dialect leaking at the player.
    expect(card!.where).not.toMatch(/_/);
  });

  it('⚠⚠ the whole job is scrollable, with a mark on where you are', () => {
    // "happy to just scroll through the mission and where I'm at" — every beat
    // is listed, and exactly one is current.
    const def = findHuntById(DOUBTER)!;
    const [card] = missionStatusCards(playerWith(DOUBTER, 3, 'tartarian_outskirts'));
    expect(card!.steps.length).toBe(def.stages.length);
    expect(card!.steps.filter((s) => s.state === 'current').length).toBe(1);
    expect(card!.steps[3]!.state).toBe('current');
    expect(card!.steps.slice(0, 3).every((s) => s.state === 'done')).toBe(true);
    expect(card!.steps.slice(4).every((s) => s.state === 'ahead')).toBe(true);
    // Every step says what it wants, never an empty row.
    expect(card!.steps.every((s) => s.ask.length > 0)).toBe(true);
  });

  it('⚠⚠ a PAUSED contract still shows — it is the best explanation of a dead tile', () => {
    const [card] = missionStatusCards(playerWith(DOUBTER, 2, 'tartarian_outskirts', { tracked: false }));
    expect(card).toBeTruthy();
    expect(card!.tracked).toBe(false);
  });

  it('⚠⚠ a finished chain reads as READY rather than pointing at a stage that is not there', () => {
    const def = findHuntById(DOUBTER)!;
    const [card] = missionStatusCards(playerWith(DOUBTER, def.stages.length, 'tartarian_outskirts'));
    expect(card!.ready).toBe(true);
    expect(card!.ask).toBe('');
  });

  it('⚠⚠ the one you are standing on sorts to the top, paused ones to the bottom', () => {
    const a = findHuntById(HUNTS[0]!.id)!;
    const stage = 0;
    const where = stageLocationId(a.stages[stage] as never, huntAnchorId(a), resolvePosterLocation);
    const p = {
      ...placedAt(where!),
      inventory: [],
      activeHunts: [
        { id: HUNTS[1]!.id, stage: 0, tracked: false },
        { id: HUNTS[2]!.id, stage: 0, tracked: true },
        { id: a.id, stage, tracked: true },
      ],
      activeMysteries: [], activeStorylines: [], activeFactionQuests: [], activeQuests: [],
    } as never;
    const cards = missionStatusCards(p);
    expect(cards[0]!.id).toBe(a.id);            // here
    expect(cards[cards.length - 1]!.tracked).toBe(false); // paused last
  });

  it('⚠ an empty slate is an answer, not an absent one', () => {
    expect(missionStatusCards({
      ...placedAt('tartarian_outskirts'), inventory: [],
      activeHunts: [], activeMysteries: [], activeStorylines: [],
    } as never)).toEqual([]);
    expect(missionStatusCards(null)).toEqual([]);
  });

  it('⚠⚠⚠ THE CARD AND THE LOG CANNOT DISAGREE — one reader, two audiences', () => {
    // The trace has been right in every log since 1586; the card is worth
    // nothing if it drifts from it. Same stage, same ground, same pack.
    const def = findHuntById(DOUBTER)!;
    const p = playerWith(DOUBTER, 2, 'tartarian_outskirts');
    const [card] = missionStatusCards(p);
    const trace = missionTraceLines(p).find((l) => l.includes(DOUBTER))!;
    expect(trace).toContain(`stage 2/${def.stages.length}`);
    expect(card!.stageNo).toBe(3);
    expect(card!.stageTotal).toBe(def.stages.length);
    // The trace prints HERE exactly when the card says here.
    expect(trace.includes(' HERE')).toBe(card!.here);
  });
});

describe('OTA-1615 — the button and the card are wired', () => {
  const EXPL = src('app', 'screens', 'ExplorationScreen.tsx');
  const CARD = src('app', 'components', 'MissionStatusCard.tsx');

  it('⚠⚠⚠ MISSIONS OPENS THE CARD instead of jumping to the tab', () => {
    expect(EXPL).toContain('setMissionCardOpen(true);');
    expect(EXPL).toContain('<MissionStatusCard');
  });

  it('⚠⚠ the full screen is still one tap away — nothing was taken away', () => {
    expect(CARD).toContain('OPEN CONTRACTS');
    expect(EXPL).toContain("onOpenContracts={() => { setMissionCardOpen(false); setScreen('contracts'); }}");
  });

  it('⚠⚠ the card scrolls and keeps its buttons — OTA-1614\'s rule, applied here too', () => {
    expect(CARD).toContain("maxHeight: '85%',");
    expect(CARD).toContain('scroll: { flexShrink: 1, flexGrow: 0 },');
    // Buttons after the scroll view, so a seven-beat hunt cannot push them off.
    // ⚠ Measured on the tail AFTER the scroll closes — searching the whole file
    // would match this component's own header prose, which is documentation and
    // proves nothing about the layout.
    const tail = CARD.slice(CARD.indexOf('</ScrollView>'));
    expect(tail).toContain('OPEN CONTRACTS');
    expect(tail).toContain('BACK TO THE WORLD');
  });

  it('⚠ the card computes nothing of its own — it renders the engine\'s answer', () => {
    // ⚠ OTA-1618 added the card MODEL to the same import (the row handlers take
    // one), which moved the line. Same import, same single source.
    expect(CARD).toContain("import { missionStatusCards, type MissionStatusCard as CardModel } from '../engine/missionTrace';");
    // No second opinion about where a stage happens or what it asks for.
    expect(CARD).not.toContain('stageLocationId');
    expect(CARD).not.toContain('payingIntent');
  });
});
