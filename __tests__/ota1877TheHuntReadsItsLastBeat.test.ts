// OTA-1877 — THE HUNT READS ITS LAST BEAT.
//
// The engine-capability question Phase 2A left open: can a hunt carry an
// authored trailing `checkKind: null` epilogue after its final boss, and will
// the player ever read it?
//
// ⚠⚠⚠ NOTHING SHIPPED IS BROKEN TODAY. All 18 hunts end ON the final boss
// check (13 standard_7 at index 6, 5 bait_switch_5 at index 4) and ZERO carry a
// trailing non-check beat. The corpus invariant below pins exactly that, so the
// day someone authors one this suite says whether it works rather than hoping.
//
// THE TWO PROGRESSION PATHS, and only one of them ever consumed a trailing null:
//
//   questSlice.advanceHunt   non-final stages — has had the OTA-1219 consume
//                            loop for a year: it LOGS the narration and walks
//                            past every trailing `checkKind === null`.
//   defeatCredit             the final boss FREEZES for the kill, so advanceHunt
//                            never gets the chance. The kill credit is the only
//                            way out of the last stage.
//
// `nextActionableStage`'s own header (OTA-1583) already named this class in as
// many words — "the auto-consume loops, which live inside advance*, not in the
// kill path, never saw it" — and fixed the ESCORT clear. The hunt-boss credit
// forty lines below it in the same file kept writing `stage: stages.length`.
//
// REWARD IS NOT IN THIS PACKAGE, and the forensics are why: the kill pays
// nothing. It logs "return to a posting agent" and `turnInHunt` pays, gated on
// `record.stage < stages.length`. So `stage` is the turn-in eligibility gate and
// the bounty is owned entirely by the turn-in. Moving progression by one beat
// cannot move, duplicate or drop a payment, which is what lets this stay a
// progression-only repair.
import { act } from 'react';

// ⚠ ONE FIXTURE HUNT, INJECTED THROUGH THE REAL LOOKUP. No shipped hunt has a
// trailing epilogue, and authoring one here would be a content change. Both
// progression paths resolve their definition through `findHuntById`, so
// decorating that one function puts the fixture on the real production path
// rather than testing a hand-rolled copy of it. Every other hunt still answers
// from the shipped corpus.
const FIXTURE_ID = 'hunt_fixture_trailing_epilogue';
const FIXTURE_MULTI = 'hunt_fixture_two_trailing_beats';
const FIXTURE_THEN = 'hunt_fixture_beat_then_actionable';
const EPILOGUE_LINE =
  'The fixture beast cools in the reeds. You sit with it a while before the walk back.';
const ARBITER_LINE = 'The Arbiter says nothing, for once.';
const BEAT_A = 'First the noise stops, and that is the strangest part of it.';
const BEAT_B = 'Then the reeds stand back up, one at a time, as if nothing had passed.';
const BEAT_MID = 'You take the tooth, but the trail does not end with the body.';

jest.mock('../app/engine/hunts', () => {
  const real = jest.requireActual('../app/engine/hunts');
  const base = real.findHuntById('hunt_bog_dragon');
  const bossStage = base.stages[base.stages.length - 1];
  // ⚠ Every stage carries a resolvable `locationName` because the shipped schema
  // gate demands one ("the stage has no ground, so it cannot be routed to"). That
  // is also precisely what CASE I needs: a trailing beat WITH location metadata,
  // so "no bogus travel" is proven against a beat that could plausibly cause it.
  const boss = (n: string) => ({
    ...bossStage, checkKind: 'boss', narration: n, arbiter: null,
    spawn: undefined, grants: undefined, requires: undefined,
  });
  const beat = (narration: string, arbiter: string | null) => ({
    ...base.stages[0], checkKind: null, narration, arbiter,
    spawn: undefined, grants: undefined, requires: undefined, npcName: undefined,
  });
  const actionable = (n: string) => ({
    ...base.stages[1], checkKind: 'investigate', narration: n, arbiter: null,
    spawn: undefined, grants: undefined, requires: undefined,
  });
  const mk = (id: string, title: string, target: string, stages: unknown[]) => ({
    ...base, id, title, targetEnemyName: target, stages,
  });
  const fixtures: Record<string, unknown> = {
    // boss → one trailing beat
    [FIXTURE_ID]: mk(FIXTURE_ID, 'The Fixture Beast', 'Fixture Beast', [
      boss('The fixture beast turns on you.'),
      beat(EPILOGUE_LINE, ARBITER_LINE),
    ]),
    // boss → two consecutive trailing beats
    [FIXTURE_MULTI]: mk(FIXTURE_MULTI, 'The Twice-Told Fixture', 'Twofold Fixture', [
      boss('The twofold fixture rears.'),
      beat(BEAT_A, null),
      beat(BEAT_B, null),
    ]),
    // boss → trailing beat → ANOTHER ACTIONABLE REQUIREMENT. The schema permits
    // this (the gate forbids only `requires` on a null stage), so the helper must
    // stop here rather than completing the hunt.
    [FIXTURE_THEN]: mk(FIXTURE_THEN, 'The Fixture With More To Do', 'Halfway Fixture', [
      boss('The halfway fixture falls, too easily.'),
      beat(BEAT_MID, null),
      actionable('Whatever set it on you is still out there.'),
    ]),
  };
  return {
    ...real,
    findHuntById: (id: string) => (fixtures[id] ?? real.findHuntById(id)),
  };
});

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('onnxruntime-react-native', () => ({
  InferenceSession: { create: jest.fn(async () => ({ run: jest.fn(async () => ({})) })) },
  Tensor: class { constructor(_t: string, _d: unknown, _s: unknown[]) {} },
}));
jest.mock('llama.rn', () => ({
  initLlama: jest.fn(async () => ({ completion: jest.fn(async () => ({ text: '' })), release: jest.fn() })),
  releaseAllLlama: jest.fn(),
}));
jest.mock('react-native-executorch', () => ({}));
jest.mock('expo-file-system', () => ({
  documentDirectory: '/tmp/', cacheDirectory: '/tmp/',
  getInfoAsync: jest.fn(async () => ({ exists: false })),
  makeDirectoryAsync: jest.fn(async () => {}),
  readAsStringAsync: jest.fn(async () => ''),
  writeAsStringAsync: jest.fn(async () => {}),
  deleteAsync: jest.fn(async () => {}),
  downloadAsync: jest.fn(async () => ({ uri: '' })),
  EncodingType: { UTF8: 'utf8', Base64: 'base64' },
}));
jest.mock('expo-speech', () => ({ speak: jest.fn(), stop: jest.fn(), isSpeakingAsync: jest.fn(async () => false) }));
jest.mock('expo-av', () => ({ Audio: { setAudioModeAsync: jest.fn(), Sound: class { static createAsync: jest.Mock = jest.fn(async () => ({ sound: { playAsync: jest.fn(), unloadAsync: jest.fn() } })); } } }));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '0', applicationId: 'test' }));
jest.mock('expo-asset', () => ({
  Asset: { fromModule: () => ({ downloadAsync: jest.fn(async () => {}), localUri: '' }) },
}));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => {}) }));
jest.mock('expo-constants', () => ({ default: { expoConfig: {} } }));
jest.mock('expo-font', () => ({ loadAsync: jest.fn(async () => {}) }));
jest.mock('expo-speech-recognition', () => ({}));
jest.mock('expo-updates', () => ({}));

import { useGameStore } from '../app/state/gameStore';
import { findHuntById, HUNTS } from '../app/engine/hunts';
import type { PlayerCharacter, Enemy } from '../app/engine/types';
import { placedAt } from '../test-utils/placePlayer';

const store = useGameStore;

function lastBossIndexOf(def: { stages: ReadonlyArray<{ checkKind: string | null }> }): number {
  let last = -1;
  for (let i = 0; i < def.stages.length; i++) if (def.stages[i]!.checkKind === 'boss') last = i;
  return last;
}

/** A hunted body, named exactly as the credit path matches it. */
function huntedBody(targetName: string): Enemy {
  return {
    name: `${targetName} (hunted)`,
    hp: 1, maxHp: 1, attack: 1, defense: 0, power: 1,
    rarity: 'Common', biome: 'mud_seas', description: 'fixture',
    // ⚠ `loot` and `boss` are read unconditionally by the spoils roll; a body
    // without them crashes the defeat path before the hunt credit is reached,
    // which would have made this suite fail for the wrong reason.
    loot: [], boss: true, xp: 0, statuses: [],
  } as unknown as Enemy;
}

/** Seed a player standing over a downed hunted body with the hunt at `stage`. */
function seedAtKill(huntId: string, stage: number, targetName: string) {
  const base = store.getState().player;
  const player = {
    ...(base ?? ({} as PlayerCharacter)),
    name: 'Probe', hp: 40, maxHp: 40, tc: 100,
    // ⚠ OTA-1484's invariant: a LIVE player-state fixture spreads `placedAt`
    // instead of writing a bare id, so the authoritative cell and the visual
    // frame agree the way creation / travelTo / stepDirection leave them. This
    // suite asserts the ground does NOT move across a trailing beat, so an
    // inconsistent frame here would be measuring luck rather than the engine.
    ...placedAt('mud_seas'),
    activeHunts: [{ id: huntId, stage, tracked: true, postedByFaction: null, acceptedAt: 0 }],
    inventory: [], activeQuests: [],
  } as unknown as PlayerCharacter;
  const body = huntedBody(targetName);
  store.setState({
    player,
    currentScene: {
      ...(store.getState().currentScene ?? {}),
      enemies: [body], enemyHps: [0], activeEnemyIdx: 0, range: 'close',
      enemyAmbushUsed: [false], enemyKnockedOut: [false], enemyStatuses: [[]],
      enemyArmorShred: [0], enemyCorruptionStacks: [0], hooks: [],
    } as never,
    gameLog: [],
  });
  return body;
}

const logText = () => store.getState().gameLog.map((e) => e.text).join('\n');
const stageOf = (id: string) =>
  store.getState().player!.activeHunts?.find((h) => h.id === id)?.stage ?? -1;

describe('OTA-1877 §I — corpus invariant: what the shipped hunts actually look like', () => {
  it('18 shipped hunts, every one ending on its final boss check, zero trailing epilogues', () => {
    const shipped = HUNTS as ReadonlyArray<{ id: string; stages: ReadonlyArray<{ checkKind: string | null }> }>;
    expect(shipped.length).toBe(18);
    const withTrailing = shipped.filter((h) => lastBossIndexOf(h) !== h.stages.length - 1);
    // ⚠ The claim that matters for CASE A: for every shipped hunt the final boss
    // IS the last stage, so `lastBoss + 1` and `stages.length` are the same
    // number and the repair cannot change today's behaviour by arithmetic.
    expect(withTrailing.map((h) => h.id)).toEqual([]);
    for (const h of shipped) {
      expect(lastBossIndexOf(h) + 1).toBe(h.stages.length);
    }
    // And the two authored shapes are still the two the data says they are.
    const sizes = shipped.reduce<Record<number, number>>((acc, h) => {
      acc[h.stages.length] = (acc[h.stages.length] ?? 0) + 1;
      return acc;
    }, {});
    expect(sizes).toEqual({ 5: 5, 7: 13 });
  });

  it('the fixture is reachable through the real lookup and is shaped boss → trailing null', () => {
    const def = findHuntById(FIXTURE_ID)!;
    expect(def).toBeTruthy();
    expect(def.stages.map((s) => s.checkKind)).toEqual(['boss', null]);
    expect(lastBossIndexOf(def)).toBe(0);
    expect(def.stages.length).toBe(2);
    // Non-vacuity: the shipped corpus is untouched by the mock.
    expect(findHuntById('hunt_bog_dragon')!.stages.length).toBe(7);
  });
});

describe('OTA-1877 §B — the trailing beat is read out before the hunt completes', () => {
  it('⚠⚠⚠ boss kill consumes the authored epilogue exactly once, then reaches completion', async () => {
    const def = findHuntById(FIXTURE_ID)!;
    seedAtKill(FIXTURE_ID, 0, def.targetEnemyName);
    expect(stageOf(FIXTURE_ID)).toBe(0);

    await act(async () => {
      store.getState().resolveEnemyDefeat();
      await Promise.resolve();
    });

    // 1. Progression reached completion — the turn-in gate's own test.
    expect(stageOf(FIXTURE_ID)).toBe(def.stages.length);
    // 2. AND the authored beat was read out on the way. This is the assertion
    //    the old `stage: stages.length` jump could never satisfy.
    const text = logText();
    expect(text).toContain(EPILOGUE_LINE);
    expect(text).toContain(ARBITER_LINE);
    // 3. Exactly once.
    expect(text.split(EPILOGUE_LINE).length - 1).toBe(1);
    // 4. The kill still says what it always said.
    expect(text).toMatch(/slain\. Return to a posting agent/);
  });
});

describe('OTA-1877 §A — a hunt whose boss is truly final is untouched', () => {
  it('a shipped-shape hunt with no trailing beat completes exactly as before, logging no epilogue', async () => {
    const def = findHuntById('hunt_bog_dragon')!;
    const lastBoss = lastBossIndexOf(def);
    expect(lastBoss).toBe(def.stages.length - 1);
    seedAtKill('hunt_bog_dragon', lastBoss, def.targetEnemyName);

    await act(async () => {
      store.getState().resolveEnemyDefeat();
      await Promise.resolve();
    });

    expect(stageOf('hunt_bog_dragon')).toBe(def.stages.length);
    expect(logText()).toMatch(/slain\. Return to a posting agent/);
    // No trailing stage exists, so nothing extra may be narrated.
    expect(logText()).not.toContain(EPILOGUE_LINE);
  });
});

describe('OTA-1877 §E — a repeated matching defeat does not read the beat twice', () => {
  it('⚠⚠ second credit after the boundary is already crossed changes nothing', async () => {
    const def = findHuntById(FIXTURE_ID)!;
    seedAtKill(FIXTURE_ID, 0, def.targetEnemyName);

    await act(async () => {
      store.getState().resolveEnemyDefeat();
      await Promise.resolve();
    });
    const stageAfterFirst = stageOf(FIXTURE_ID);
    const firstCount = logText().split(EPILOGUE_LINE).length - 1;
    expect(stageAfterFirst).toBe(def.stages.length);
    expect(firstCount).toBe(1);

    // A respawned copy of the same hunted target goes down again.
    store.setState({
      currentScene: {
        ...store.getState().currentScene!,
        enemies: [huntedBody(def.targetEnemyName)], enemyHps: [0], activeEnemyIdx: 0,
        enemyAmbushUsed: [false], enemyKnockedOut: [false], enemyStatuses: [[]],
        enemyArmorShred: [0], enemyCorruptionStacks: [0],
      } as never,
    });
    await act(async () => {
      store.getState().resolveEnemyDefeat();
      await Promise.resolve();
    });

    // Progression did not move backward and the beat was not re-read.
    expect(stageOf(FIXTURE_ID)).toBe(stageAfterFirst);
    expect(logText().split(EPILOGUE_LINE).length - 1).toBe(1);
  });
});

describe('OTA-1877 §C — consecutive trailing beats, both read, in order', () => {
  it('⚠⚠ two trailing nulls are each read exactly once, A before B, then the hunt completes', async () => {
    const def = findHuntById(FIXTURE_MULTI)!;
    seedAtKill(FIXTURE_MULTI, 0, def.targetEnemyName);

    await act(async () => { store.getState().resolveEnemyDefeat(); await Promise.resolve(); });

    const text = logText();
    expect(text).toContain(BEAT_A);
    expect(text).toContain(BEAT_B);
    expect(text.split(BEAT_A).length - 1).toBe(1);
    expect(text.split(BEAT_B).length - 1).toBe(1);
    // Order is the authored order, not whichever the loop happened to reach.
    expect(text.indexOf(BEAT_A)).toBeLessThan(text.indexOf(BEAT_B));
    expect(stageOf(FIXTURE_MULTI)).toBe(def.stages.length);

    // And a repeated defeat re-reads neither.
    store.setState({ currentScene: { ...store.getState().currentScene!, enemies: [huntedBody(def.targetEnemyName)], enemyHps: [0], activeEnemyIdx: 0, enemyAmbushUsed: [false], enemyKnockedOut: [false], enemyStatuses: [[]], enemyArmorShred: [0], enemyCorruptionStacks: [0] } as never });
    await act(async () => { store.getState().resolveEnemyDefeat(); await Promise.resolve(); });
    expect(logText().split(BEAT_A).length - 1).toBe(1);
    expect(logText().split(BEAT_B).length - 1).toBe(1);
    expect(stageOf(FIXTURE_MULTI)).toBe(def.stages.length);
  });
});

describe('OTA-1877 §D — a trailing beat followed by more work does NOT complete the hunt', () => {
  it('⚠⚠⚠ the beat is read, progression stops at the next actionable stage, turn-in stays refused', async () => {
    const def = findHuntById(FIXTURE_THEN)!;
    expect(def.stages.map((s) => s.checkKind)).toEqual(['boss', null, 'investigate']);
    seedAtKill(FIXTURE_THEN, 0, def.targetEnemyName);

    await act(async () => { store.getState().resolveEnemyDefeat(); await Promise.resolve(); });

    // The beat was read out...
    expect(logText()).toContain(BEAT_MID);
    expect(logText().split(BEAT_MID).length - 1).toBe(1);
    // ...and progression STOPPED on the actionable stage, not at the end. This is
    // the assertion that separates "read consecutive nulls until the next
    // requirement" from "read some prose and finish the hunt".
    expect(stageOf(FIXTURE_THEN)).toBe(2);
    expect(stageOf(FIXTURE_THEN)).not.toBe(def.stages.length);
    // So the hunt is NOT turn-in eligible — the gate is stage < stages.length.
    expect(stageOf(FIXTURE_THEN) < def.stages.length).toBe(true);

    // A repeated defeat of the already-credited boss cannot cross again.
    store.setState({ currentScene: { ...store.getState().currentScene!, enemies: [huntedBody(def.targetEnemyName)], enemyHps: [0], activeEnemyIdx: 0, enemyAmbushUsed: [false], enemyKnockedOut: [false], enemyStatuses: [[]], enemyArmorShred: [0], enemyCorruptionStacks: [0] } as never });
    await act(async () => { store.getState().resolveEnemyDefeat(); await Promise.resolve(); });
    expect(stageOf(FIXTURE_THEN)).toBe(2);
    expect(logText().split(BEAT_MID).length - 1).toBe(1);
  });
});

describe('OTA-1877 §I — a trailing beat with ground does not send the player anywhere', () => {
  it('⚠ read-out sets no course, no route, and does not move the player', async () => {
    const def = findHuntById(FIXTURE_ID)!;
    // The beat carries a real locationName (the schema requires one), which is the
    // metadata that could plausibly be mistaken for a destination.
    expect(def.stages[1]!.locationName).toBeTruthy();
    seedAtKill(FIXTURE_ID, 0, def.targetEnemyName);
    const whereBefore = store.getState().player!.currentLocationId;

    await act(async () => { store.getState().resolveEnemyDefeat(); await Promise.resolve(); });

    const p = store.getState().player!;
    expect(p.currentLocationId).toBe(whereBefore);
    expect(p.travelTarget ?? null).toBeNull();
    expect((p as unknown as { routedTo?: unknown }).routedTo ?? null).toBeNull();
    expect((p as unknown as { travelTo?: unknown }).travelTo ?? null).toBeNull();
  });
});

describe('OTA-1877 §F/§G — the bounty is the turn-in`s, and the boundary survives a reload', () => {
  it('⚠⚠⚠ kill pays no bounty; hunt state persists; the credited boundary cannot be re-crossed', async () => {
    const def = findHuntById(FIXTURE_ID)!;
    const bounty = (def as unknown as { rewardTc: number }).rewardTc;
    expect(bounty).toBeGreaterThan(0);
    seedAtKill(FIXTURE_ID, 0, def.targetEnemyName);
    const tcBefore = store.getState().player!.tc;

    await act(async () => { store.getState().resolveEnemyDefeat(); await Promise.resolve(); });

    // §F — the kill did NOT pay the bounty. Ordinary combat spoils may move tc
    // (existing combat mechanics, deliberately not suppressed here), so the claim
    // is specifically that the BOUNTY was not paid, not that tc never moved.
    const tcAfterKill = store.getState().player!.tc;
    expect(tcAfterKill - tcBefore).toBeLessThan(bounty);
    expect(stageOf(FIXTURE_ID)).toBe(def.stages.length);

    // §G — what PERSISTENCE actually stores here is the hunt RECORD (player
    // .activeHunts), which is what the turn-in gate reads. The game log is a
    // separate concern with its own lifetime, so this asserts the hunt-state
    // contract and does not claim the narration itself is persisted.
    await act(async () => { await store.getState().persist(); });
    const persistedStage = store.getState().player!.activeHunts!.find((h) => h.id === FIXTURE_ID)!.stage;
    expect(persistedStage).toBe(def.stages.length);

    // The boss boundary cannot be credited again after that, so no reload can
    // resurrect the requirement or re-read the beat.
    const beatsBefore = logText().split(EPILOGUE_LINE).length - 1;
    store.setState({ currentScene: { ...store.getState().currentScene!, enemies: [huntedBody(def.targetEnemyName)], enemyHps: [0], activeEnemyIdx: 0, enemyAmbushUsed: [false], enemyKnockedOut: [false], enemyStatuses: [[]], enemyArmorShred: [0], enemyCorruptionStacks: [0] } as never });
    await act(async () => { store.getState().resolveEnemyDefeat(); await Promise.resolve(); });
    expect(store.getState().player!.activeHunts!.find((h) => h.id === FIXTURE_ID)!.stage).toBe(def.stages.length);
    expect(logText().split(EPILOGUE_LINE).length - 1).toBe(beatsBefore);
  });
});
