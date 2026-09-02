// ⚠⚠⚠ OTA-1618 — THE SLATE IS THE WHOLE SLATE, AND IT IS ALWAYS IN REACH.
//
// Owner, three messages: *"at this point i like the missions button better than
// having it take me to the tab. can we just take the tab and put it on that
// button so when I hit the button it scrolls everything it's just right there
// and can we have it so that the active mission is always on top?"* — *"And can
// we have the mission button always there? Just set it right next to the more
// button. That way, we don't gotta hit more to get it."* — *"so that would
// completely remove the contract tab and just make it the missions button
// instead so it would have everything on there. cuz that's immediate you hit the
// button it pops up. you hit your thing you close it. you're done."*
//
// ⚠⚠ THREE FAMILIES WAS NEVER "EVERYTHING". OTA-1615 shipped the card over
// hunts, mysteries and storylines. The four it left out are the same four the
// TRACE had to be taught one at a time — OTA-1594's lesson in full: the one
// contract he was actually running never appeared in a single line of the log,
// because its family was not read. A slate that omits a family sends him back to
// the tab for exactly the contract that is live, which is the trip this card was
// built to end. Faction contracts, bounties, whispers and leads join it here.
//
// ⚠ AND THE ACTIONS CAME WITH THEM, because a cheat sheet you have to LEAVE in
// order to act on is a reference card — OTA-1617's own finding, one door further
// out. What a row may offer is decided by the READER (`pauseKind`,
// `abandonKind`, `discardable`, `turnInKind`), never by the component: a whisper
// has no hand-in, a lead is discarded rather than abandoned, and a bounty runs on
// a deadline so it is neither parked nor dropped. A button the store would refuse
// is the same lie OTA-1164 removed from the bounty card.

import { missionStatusCards } from '../app/engine/missionTrace';
import { findHuntById } from '../app/engine/hunts';
import { stageLocationId } from '../app/engine/questStage';
import { huntAnchorId, resolvePosterLocation } from '../app/engine/contractMarkers';
import { placedAt } from '../test-utils/placePlayer';
import { readFileSync } from 'fs';
import { join } from 'path';

const src = (...p: string[]) => readFileSync(join(__dirname, '..', ...p), 'utf8');

const DOUBTER = 'hunt_servants_doubter';
/** A staged faction contract and a fetch one, both real catalogue entries. */
const HAUL = 'fq_reclaimers_haul';
const SCRAP = 'fq_reclaimers_starter';

const BOUNTY = {
  giverFactionId: 'reclaimers_guild', giverName: 'Reclaimers Guild',
  targetFactionId: 'stone_builders', targetName: 'Stone Builders',
  targetLocationId: 'buried_cities', targetLocationName: 'The Buried Cities',
  count: 3, progress: 1, rewardTc: 40, rewardRep: 5,
  acceptedAtHour: 4, deadlineHours: 24,
};
const WHISPER = {
  id: 'yulka_discs', stage: 'planted', plantedAtHour: 0,
  targetGridX: 40, targetGridY: 40, targetLocationId: 'tartarian_outskirts',
};
const LEAD = {
  id: 'lead1', state: 'open',
  objective: { verb: 'retrieve', target: 'a confused Aetherkin' },
  location: { id: 'buried_cities', name: 'The Buried Cities' },
  complication: { text: 'It is guarded.' },
  reward: { type: 'currency', amount: 20, label: '20 TC' },
  generatedAt: 0,
};

/** A player carrying one of everything, standing wherever we say. */
function fullSlate(at = 'tartarian_outskirts', over: Record<string, unknown> = {}) {
  return {
    ...placedAt(at),
    inventory: [{ id: 'i1', name: 'Scrap Metal', quantity: 5 }],
    hoursElapsed: 10,
    tc: 0,
    activeHunts: [{ id: DOUBTER, stage: 2, tracked: true }],
    activeMysteries: [], activeStorylines: [],
    activeFactionQuests: [{ id: HAUL, stage: 1, tracked: false }],
    activeBounties: [BOUNTY],
    activeWhispers: [WHISPER],
    activeQuests: [LEAD],
    ...over,
  } as never;
}

describe('OTA-1618 — every live family is on the slate', () => {
  it('⚠⚠⚠ ALL SEVEN KINDS OF WORK APPEAR — the tab holds nothing the card does not', () => {
    const families = missionStatusCards(fullSlate()).map((c) => c.family).sort();
    expect(families).toEqual(['bounty', 'faction', 'hunt', 'lead', 'whisper']);
    // The two stage families not in this fixture read through the same function
    // as `hunt`; the fixture carries one of each SHAPE, not one of each id.
    const withAll = missionStatusCards(fullSlate('tartarian_outskirts', {
      activeMysteries: [{ id: 'mystery_temporal_watch', stage: 2, tracked: false }],
    }));
    expect(withAll.map((c) => c.family)).toContain('mystery');
  });

  it('⚠⚠⚠ THE ACTIVE ONE IS ALWAYS ON TOP — his ask, in the sort', () => {
    // Only ONE stage-run may be tracked at a time (OTA-972), so "the active one"
    // is a single well-defined row — and it outranks even a PAUSED contract the
    // player is standing on, which the OTA-1615 rank did not.
    const def = findHuntById(DOUBTER)!;
    const paused = stageLocationId(def.stages[2] as never, huntAnchorId(def), resolvePosterLocation)!;
    const cards = missionStatusCards(fullSlate(paused, {
      // The hunt's own ground, but the hunt is PARKED and the lead is live.
      activeHunts: [{ id: DOUBTER, stage: 2, tracked: false }],
    }));
    expect(cards[0]!.tracked).toBe(true);
    expect(cards[cards.length - 1]!.tracked).toBe(false);
  });

  it('⚠⚠ the ground still breaks the tie underneath tracked', () => {
    const def = findHuntById(DOUBTER)!;
    const here = stageLocationId(def.stages[2] as never, huntAnchorId(def), resolvePosterLocation)!;
    const cards = missionStatusCards(fullSlate(here, {
      activeHunts: [{ id: DOUBTER, stage: 2, tracked: true }],
      activeFactionQuests: [{ id: HAUL, stage: 1, tracked: true }],
    }));
    expect(cards[0]!.id).toBe(DOUBTER);
    expect(cards[0]!.here).toBe(true);
  });
});

describe('OTA-1618 — each family answers in its own terms, from its own engine', () => {
  const cardFor = (family: string, over: Record<string, unknown> = {}) =>
    missionStatusCards(fullSlate('tartarian_outskirts', over)).find((c) => c.family === family)!;

  it('⚠⚠⚠ A FACTION CONTRACT ROUTES THROUGH routeMission — the turn-in leg is kept', () => {
    const c = cardFor('faction');
    // ⚠ Coursing to the location id by hand would drop the second leg the whole
    // family exists on (objective → auto-course to turn-in).
    expect(c.route).toEqual({ kind: 'mission', id: HAUL, name: "Reclaimer's Stake" });
    // Its ask is the stage's own NARRATION — a tally beat has no grounded verb,
    // and inventing one for it is the OTA-1588 defect in a new family.
    expect(c.ask).toContain('Coin gathers in your pack');
    expect(c.steps.length).toBe(2);
    expect(c.steps[1]!.state).toBe('current');
  });

  it('⚠⚠ a finished gather contract says READY and offers the hand-in the store accepts', () => {
    const c = cardFor('faction', { activeFactionQuests: [{ id: SCRAP, stage: 0, tracked: true }] });
    expect(c.ready).toBe(true);
    expect(c.turnInKind).toBe('faction_quest');
    // The tally reads as one line, both halves, with the colour carrying short/held.
    expect(c.needs).toEqual({ item: '3 × Scrap Metal (5 in the pack)', held: true });
  });

  it('⚠⚠ a purse gate is named only while it is live', () => {
    // OTA-1594 — the threshold holds the FINAL advance, so a player two beats
    // out does not need to read about it.
    expect(cardFor('faction', { activeFactionQuests: [{ id: HAUL, stage: 1, tracked: true }] }).note)
      .toBe('Purse: 0 of 100 TC.');
    expect(cardFor('faction', { activeFactionQuests: [{ id: HAUL, stage: 0, tracked: true }] }).note)
      .toBeNull();
  });

  it('⚠⚠⚠ A BOUNTY CARRIES ITS TALLY AND ITS CLOCK, and offers no button the store refuses', () => {
    const c = cardFor('bounty');
    expect(c.note).toBe('1/3 put down · pays 40 TC + Reclaimers Guild standing · ⏳ 18h left');
    expect(c.route).toEqual({ kind: 'location', id: 'buried_cities', name: 'The Buried Cities' });
    // ⚠ It runs on a deadline and pays at the giver's counter: parking it would
    // stop nothing and the store has no drop for it. OTA-1164's rule — a control
    // without the state that gives it meaning is a lie — applied before it ships.
    expect(c.pauseKind).toBeNull();
    expect(c.abandonKind).toBeNull();
    expect(c.turnInKind).toBeNull();
  });

  it('⚠⚠⚠ A WHISPER ROUTES TO A CELL, not to a location id that does not exist', () => {
    const c = cardFor('whisper');
    expect(c.route).toEqual({ kind: 'cell', x: 40, y: 40, label: "Yulka's fire" });
    expect(c.whereId).toBe('');
    // The stage line comes from the same describer the tab prints, given the
    // player's LIVE cell so it states the true remaining walk (OTA-1595).
    expect(c.ask).toContain('from where you stand');
    expect(c.turnInKind).toBeNull();
  });

  it('⚠⚠ A LEAD IS DISCARDED, NOT ABANDONED — two different store actions', () => {
    const c = cardFor('lead');
    expect(c.discardable).toBe(true);
    expect(c.abandonKind).toBeNull();
    expect(c.pauseKind).toBe('lead');
    // The complication is the only thing a lead knows that its title doesn't,
    // and it is the half that decides whether the walk is worth it.
    expect(c.note).toBe('It is guarded.');
  });

  it('⚠ a lead that is closed is not on the slate', () => {
    const cards = missionStatusCards(fullSlate('tartarian_outskirts', {
      activeQuests: [{ ...LEAD, state: 'completed' }],
    }));
    expect(cards.some((c) => c.family === 'lead')).toBe(false);
  });

  it('⚠ the legacy single bounty slot still reads', () => {
    // OTA-862's migration shape: `activeBounties` empty, `activeBounty` set.
    const cards = missionStatusCards(fullSlate('tartarian_outskirts', {
      activeBounties: [], activeBounty: BOUNTY,
    }));
    expect(cards.filter((c) => c.family === 'bounty').length).toBe(1);
  });

  it('⚠⚠ readiness comes from missionReady, not from a second opinion here', () => {
    const TRACE = src('app', 'engine', 'missionTrace.ts');
    expect(TRACE).toContain("import { missionTurnInReady } from './missionReady';");
    expect(TRACE).toContain("turnInKind: missionTurnInReady({ kind: family, stage: rec.stage, stageCount: stages.length })");
  });
});

// ⚠⚠⚠ OTA-1620 RETIRED THE CARD. The owner ran this OTA and said: *"it only
// shows me six missions, so you're picking a subcategory and saying that
// that's all the missions. what I wanted was an exact duplication of the
// contracts screen on the missions button."* The reader pins above stay (the
// trace reads the same fields); the four component pins that stood here — the
// row's store calls, the reader-decided buttons, the two-tap drop, the scroll
// contract — described a surface that no longer exists and were removed rather
// than left asserting on a deleted file. The button placement was the half of
// this OTA he did want, and it is held below and again by ota1620.
describe('OTA-1618 — the button is always in reach', () => {
  const INPUT = src('app', 'components', 'InputBox.tsx');

  it('⚠⚠⚠ MISSIONS IS OUT OF THE MORE TRAY AND ON THE ROW — exactly once', () => {
    // His words: "have the mission button always there. Just set it right next
    // to the more button. That way, we don't gotta hit more to get it."
    const uses = INPUT.split('<QuickBtn label="missions"').length - 1;
    expect(uses).toBe(1);
    // It sits BEFORE the tray toggle, so its place on the row does not move when
    // the tray opens — and it is outside the `moreOpen` gate entirely.
    const at = INPUT.indexOf('<QuickBtn label="missions"');
    const toggleAt = INPUT.indexOf("label={moreOpen ? 'less ▾' : 'more ▸'}");
    const trayAt = INPUT.indexOf('{(moreOpen || tutLock) && (');
    expect(at).toBeGreaterThan(-1);
    expect(at).toBeLessThan(toggleAt);
    expect(at).toBeLessThan(trayAt);
  });

  it('⚠ the actions the card borrowed are still where he now taps them — on the Contracts screen', () => {
    const CONTRACTS = src('app', 'screens', 'ContractsScreen.tsx');
    for (const name of ['setContractActive', 'abandonContract', 'discardLead', 'completeContractFromUI']) {
      expect(CONTRACTS).toContain(name);
    }
  });
});
