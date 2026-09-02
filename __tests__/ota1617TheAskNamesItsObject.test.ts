// ⚠⚠⚠ OTA-1617 — THE ASK NAMES ITS OBJECT, AND THE WALK IS ON THE ROW.
//
// Owner, reading the new mission card: "temporal dispersion watch, next step is
// go quietly. to where?" — and: "the missions tab is great, but autoroute if the
// mission is available it should be on there too, listed in the mission it's
// for. I still had to go back to the open missions button to hit autoroute. the
// new way it works should be a lightly functional cheat sheet."
//
// TWO HALVES. The card's ground was right all along — that stage names The
// Buried Cities and the card printed it. What it could not tell him was what he
// was GOING there for, because every phrase in `VERB_ASK` names the CHECK and
// nothing else: "go quietly", "search this ground", "work the aether". They say
// how the dice roll. The answer was already in the stage's own bindings — it
// grants the Temporal Distortion Watch off a body in the eddy — and nothing
// read them. And a cheat sheet you have to LEAVE in order to act on is a
// reference card: SET COURSE now sits on the mission it belongs to.

import { missionStatusCards } from '../app/engine/missionTrace';
import { stageObjectiveAsk, stageVerbAsk } from '../app/engine/questStage';
import { placedAt } from '../test-utils/placePlayer';
import { readFileSync } from 'fs';
import { join } from 'path';

const src = (...p: string[]) => readFileSync(join(__dirname, '..', ...p), 'utf8');
const WATCH = 'mystery_temporal_watch';

function withMystery(id: string, stage: number, at = 'tartarian_outskirts') {
  return {
    ...placedAt(at), inventory: [],
    activeHunts: [], activeStorylines: [], activeFactionQuests: [], activeQuests: [],
    activeMysteries: [{ id, stage, tracked: true }],
  } as never;
}

describe('OTA-1617 — the ask names its object', () => {
  it('⚠⚠⚠ HIS QUESTION, ANSWERED: "go quietly" says what you come away with', () => {
    const [card] = missionStatusCards(withMystery(WATCH, 2));
    expect(card!.ask).toBe('go quietly — come away with the Temporal Distortion Watch');
    // The ground was never the missing half — it was right before this OTA.
    expect(card!.where).toBe('The Buried Cities');
  });

  it('⚠⚠ every beat of the job reads the same way, so the list is a cheat sheet', () => {
    const [card] = missionStatusCards(withMystery(WATCH, 2));
    expect(card!.steps.map((s) => s.ask)).toEqual([
      'talk it through with the Reclaimers Guild Speaker — come away with the Guild Eddy-Gauge',
      'search this ground — come away with the Eddy-Zone Reading',
      'go quietly — come away with the Temporal Distortion Watch',
      'search this ground with the Reclaimers Guild Speaker',
    ]);
  });

  it('⚠⚠ the object comes off the stage BINDINGS — no new prose was authored', () => {
    // npc, spawn and grants, each in its place; the seven manner phrases are
    // untouched underneath.
    expect(stageObjectiveAsk('hunt', { checkKind: 'stealth' } as never)).toBe('go quietly');
    expect(stageObjectiveAsk('hunt', {
      checkKind: 'stealth', grants: { item: 'Brass Key' },
    } as never)).toBe('go quietly — come away with the Brass Key');
    expect(stageObjectiveAsk('hunt', {
      checkKind: 'diplomacy', npcName: 'Garrin',
    } as never)).toBe('talk it through with Garrin');
    expect(stageObjectiveAsk('hunt', {
      checkKind: 'attack_provoke', spawn: { enemyName: 'Reaver', count: 3 },
    } as never)).toBe('force the issue — 3 × Reaver');
    // A count of one does not read as "1 ×".
    expect(stageObjectiveAsk('hunt', {
      checkKind: 'attack_provoke', spawn: { enemyName: 'Reaver' },
    } as never)).toBe('force the issue — Reaver');
  });

  it('⚠ the arrival line keeps the bare manner phrase — it composes its own clauses', () => {
    // stageVerbAsk is unchanged, deliberately: missionArrivalLines already
    // appends "— find X" and "(you still need Y)", and composing twice would
    // say everything twice on the one line the player reads while standing there.
    expect(stageVerbAsk('hunt', { checkKind: 'stealth' } as never)).toBe('go quietly');
    expect(stageVerbAsk('mystery', { checkKind: 'investigate' } as never)).toBe('search this ground');
  });

  it('⚠ a verbless beat still says so rather than inventing an action', () => {
    expect(stageObjectiveAsk('hunt', { checkKind: null } as never)).toBeNull();
    expect(stageObjectiveAsk('hunt', null)).toBeNull();
  });
});

// ⚠⚠ OTA-1620 RETIRED THE CARD, and with it the three component pins that stood
// here (SET COURSE on the row, the same two store actions, absent where it
// would lie). The owner rejected the card outright — *"I don't want the
// contract screen to be separate anymore"* — and the Contracts screen, which
// already carried its own SET COURSE per card (OTA-1589), is what MISSIONS
// opens now. The reader's routing fields are still held below, because the
// trace and the log read them.
describe('OTA-1617 — the destination on the row is the destination in the sentence', () => {
  it('⚠⚠ the reader still refuses a route where it would be a lie', () => {
    const TRACE = src('app', 'engine', 'missionTrace.ts');
    expect(TRACE).toContain("route: where && where !== player.currentLocationId ? toLocation(where) : null,");
    expect(TRACE).toContain('route: here ? null : toLocation(b.targetLocationId),');
  });

  it('⚠ the id it routes to is the id the line above it names', () => {
    // whereId rides on the card beside `where`, so the button and the sentence
    // cannot disagree about the destination.
    const [card] = missionStatusCards(withMystery(WATCH, 2));
    expect(card!.whereId).toBe('buried_cities');
    expect(card!.where).toBe('The Buried Cities');
    expect(card!.here).toBe(false);
  });

  it('⚠ standing on the ground reports here, and offers no walk to it', () => {
    const [card] = missionStatusCards(withMystery(WATCH, 2, 'buried_cities'));
    expect(card!.here).toBe(true);
  });
});
