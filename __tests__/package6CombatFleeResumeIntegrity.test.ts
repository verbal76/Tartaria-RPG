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
jest.mock('expo-asset', () => ({ Asset: { fromModule: () => ({ downloadAsync: jest.fn(async () => {}), localUri: '' }) } }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => {}) }));
jest.mock('expo-constants', () => ({ default: { expoConfig: {} } }));
jest.mock('expo-font', () => ({ loadAsync: jest.fn(async () => {}) }));
jest.mock('expo-speech-recognition', () => ({}));
jest.mock('expo-updates', () => ({}));

/**
 * PACKAGE 6 — COMBAT / FLEE / RESUME INTEGRITY.
 *
 * ⚠⚠⚠ WHAT THIS SUITE IS, AND WHY IT CARRIES NO OTA NUMBER. Package 6 audited
 * the authored-fight lifecycle end to end — materialization, combat identity,
 * victory, flee, resume, stage closure — and found NO player-facing production
 * defect. Nothing was repaired, so nothing was stamped; this file is the
 * measured contract written down so it cannot drift silently. `check:otastamp`
 * keys on `^ota(\d{3,4})` filenames, so an un-numbered suite is correctly
 * invisible to it and the live stamp stays where the last real repair left it.
 *
 * ⚠⚠ THE CORPUS IT GOVERNS, recomputed rather than remembered: 50 arcs / 281
 * stages carry 29 fight-bearing stages and 62 authored hostile bodies — hunt
 * 25, storyline 4, mystery 0. Twelve stand up one body and seventeen stand up
 * several. NONE is a final stage. Twenty grounds carry a fight and five of them
 * carry fights from more than one arc, Mud Seas widest with four.
 *
 * ⚠⚠⚠ THE ONE ASYMMETRY THIS SUITE DELIBERATELY PRESERVES. `missionFightUnderfoot`
 * walks only `activeHunts` and `armSpawnStagesAtArrival` skips every family but
 * hunt, so a HUNT fight is arrival-armed and keeps OTA-1688's partial-kill
 * ledger, while a STORYLINE fight is verb-armed and resets to its full authored
 * pack. That reads like an oversight and is not: measured end to end, the
 * storyline path freezes correctly, never pays victory it did not earn, stays
 * reachable by its own verb, and closes its beat exactly once. Two coherent
 * family contracts, not one contract and one bug. §E pins BOTH so neither can
 * be "normalised" into the other without this file going red and saying why.
 *
 * ⚠ AND A HARNESS ERROR WORTH KEEPING. The first probe run reported "restored
 * 0 bodies" and "the arrival arm chose nothing", which looked exactly like a
 * production defect. It was not: the arm gates on `stageRequirementMet`, which
 * counts only QUEST-TAGGED rows (`countObjectiveInPack` → `isQuestLockedItem`),
 * and the probe's synthetic items carried no tags. Caught by instrumenting
 * before classifying. Hence `questItem()` below — every fixture in this file
 * pays its stage's requirement the way the game does.
 */
import { useGameStore } from '../app/state/gameStore';
import { resolveStageEscortClear } from '../app/state/slices/questSlice';
import { getRaces, getFactions } from '../app/engine/character';
import { placedAt } from '../test-utils/placePlayer';
import { findHuntById } from '../app/engine/hunts';
import { findStorylineById } from '../app/engine/factionStorylines';
import { stageLocationId, stageRequirementMet } from '../app/engine/questStage';
import { huntAnchorId, contractAnchorId, resolvePosterLocation } from '../app/engine/contractMarkers';
import { noteMissionFlee, armSpawnStagesAtArrival } from '../app/state/stageArrival';
import { missionFightUnderfoot } from '../app/engine/missionTrace';
import { stageFled } from '../app/engine/deeds';
import { handlePlayerDeath } from '../app/state/combatResolution';
import type { PlayerCharacter } from '../app/engine/types';

jest.setTimeout(180_000);
const store = useGameStore;

/* ── fixtures ─────────────────────────────────────────────────────────────── */

/** ⚠ A row the requirement gate actually counts. See the header. */
const questItem = (name: string, i: number) =>
  ({ id: `p6_${i}`, name, kind: 'misc', quantity: 1, tags: ['quest'] });

const huntGround = (id: string, i: number) => {
  const d = findHuntById(id)!;
  return stageLocationId(d.stages[i] as never, huntAnchorId(d), resolvePosterLocation);
};
const storyGround = (id: string, i: number) => {
  const d = findStorylineById(id)!;
  return stageLocationId(d.stages[i] as never, contractAnchorId(d as never), resolvePosterLocation);
};
const huntStage = (id: string) => store.getState().player!.activeHunts!.find((h) => h.id === id)?.stage;
const storyStage = (id: string) => store.getState().player!.activeStorylines!.find((h) => h.id === id)?.stage;
const scene = () => store.getState().currentScene;
const bodies = () => (scene()?.enemies ?? []).map((e, i) => ({
  name: e.name,
  key: (e as { stageKey?: string }).stageKey,
  hp: scene()!.enemyHps[i] ?? 0,
  ko: scene()!.enemyKnockedOut?.[i] ?? false,
}));
const liveBodies = () => bodies().filter((b) => b.hp > 0 && !b.ko);
const clearField = () =>
  store.setState((s) => ({ currentScene: { ...s.currentScene!, enemies: [], enemyHps: [], enemyKnockedOut: [] } }));

/** Drop body `i` through the REAL clear path, exactly as a killing blow does. */
const killAt = (i: number) => {
  const e = scene()!.enemies[i]!;
  store.setState((s) => ({
    currentScene: { ...s.currentScene!, enemyHps: s.currentScene!.enemyHps.map((h, j) => (j === i ? 0 : h)) },
  }));
  resolveStageEscortClear(store.getState, store.setState as never, store.getState().player!, e as never, i);
};
const killAll = () => { for (let i = 0; i < bodies().length; i++) if (bodies()[i]!.hp > 0) killAt(i); };

async function boot(groundId: string, items: string[]): Promise<void> {
  await store.getState().startNewGame({ name: 'Six', raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
  store.setState((s) => ({
    player: {
      ...s.player!, ...placedAt(groundId), hubRoomId: null, hp: 9000, hpMax: 9000, dead: false,
      activeHunts: [], activeMysteries: [], activeStorylines: [],
      inventory: [...s.player!.inventory, ...items.map(questItem)],
    } as PlayerCharacter,
    activeBuildingId: null, missionFleeHoldCell: null,
  }));
}
const setHunts = (h: Array<{ id: string; stage: number }>) =>
  store.setState((s) => ({
    player: { ...s.player!, activeHunts: h.map((x) => ({ ...x, postedByFaction: null, acceptedAt: Date.now() })) } as PlayerCharacter,
  }));
const setStories = (h: Array<{ id: string; stage: number }>) =>
  store.setState((s) => ({
    player: { ...s.player!, activeStorylines: h.map((x) => ({ ...x, postedByFaction: null, acceptedAt: Date.now() })) } as PlayerCharacter,
  }));

/* The representatives, chosen once and reused, so the file reads as a contract
 * rather than as a tour. Each is REAL authored content. */
const SOLO = { id: 'hunt_sludge_behemoth', n: 1, item: 'Sealed Coordinate Tube', who: 'Swamp Crab' };
const PACK = { id: 'hunt_mud_harpy_cradle', n: 3, item: "Ferel's High-Spire Line", who: 'Aetheric Raven', count: 4 };
const OTHER = { id: 'hunt_mud_siren_queen', n: 1, item: "Drifter's South-Spire Poster", who: 'Mud Siren' };
const STORY = { id: 'story_reclaimer_highest_bidder', n: 4, item: 'The Strongbox', who: 'Black Cloak Agent', count: 3 };

/* ══ §A — THE CORPUS THE CONTRACT GOVERNS ════════════════════════════════════ */
describe('Package 6 §A — the authored fight corpus', () => {
  it('⚠⚠ 29 fight-bearing stages / 62 bodies, and none of them is a final stage', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const hunts = require('../app/data/quests/hunts.json');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const stories = require('../app/data/quests/faction-storylines.json');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mysteries = require('../app/data/quests/mysteries.json');
    const listOf = (j: unknown) => (Array.isArray(j) ? j : Object.values(j as object).find(Array.isArray)) as Array<{ stages: Array<Record<string, unknown>> }>;
    const fam = { hunt: listOf(hunts), storyline: listOf(stories), mystery: listOf(mysteries) };
    const arcs = [...fam.hunt, ...fam.storyline, ...fam.mystery];
    const stages = arcs.flatMap((a) => a.stages);
    // ⚠ ENDING batch 1 added six trailing `checkKind: null` epilogue beats.
    expect([arcs.length, stages.length]).toEqual([50, 287]);
    const fights = arcs.flatMap((a) => a.stages.map((s, i) => ({ s, i, last: i === a.stages.length - 1 })))
      .filter((x) => x.s.spawn);
    expect(fights.length).toBe(29);
    expect(fights.reduce((t, x) => t + ((x.s.spawn as { count?: number }).count ?? 1), 0)).toBe(62);
    // ⚠ Per family — the split that makes §E's two contracts necessary.
    const countIn = (list: typeof fam.hunt) => list.flatMap((a) => a.stages).filter((s) => s.spawn).length;
    expect([countIn(fam.hunt), countIn(fam.storyline), countIn(fam.mystery)]).toEqual([25, 4, 0]);
    // ⚠⚠ NO FIGHT IS A FINAL STAGE. Every authored fight has a beat after it, so
    // "the fight closed the arc" is never the shape any of this has to survive.
    expect(fights.filter((x) => x.last).length).toBe(0);
    // Every fight stage is paid up before it can arm — which is why the fixtures
    // above each carry a quest-tagged row.
    expect(fights.every((x) => !!x.s.requires)).toBe(true);
  });
});

/* ══ §B — VICTORY PAYS ONCE, AND ONLY THE STAGE THAT OWNS THE BODIES ═════════ */
describe('Package 6 §B — victory', () => {
  it('⚠⚠⚠ a single-hostile fight closes its stage exactly once, and a repeat clear pays nothing', async () => {
    const g = huntGround(SOLO.id, SOLO.n);
    await boot(g, [SOLO.item]);
    setHunts([{ id: SOLO.id, stage: SOLO.n }]);
    store.getState().advanceHunt(SOLO.id);
    expect(bodies().length).toBe(1);
    expect(bodies()[0]!.key).toBe(`hunt:${SOLO.id}:${SOLO.n}`);
    expect(huntStage(SOLO.id)).toBe(SOLO.n);           // freeze-for-kill: the spawn does not advance
    killAt(0);
    expect(huntStage(SOLO.id)).toBe(SOLO.n + 1);       // exactly one beat
    // ⚠ The same clear delivered again — a double-tap, a re-entrant callback —
    // must not buy a second beat.
    resolveStageEscortClear(
      store.getState, store.setState as never, store.getState().player!,
      { name: SOLO.who, stageKey: `hunt:${SOLO.id}:${SOLO.n}` } as never, 0,
    );
    expect(huntStage(SOLO.id)).toBe(SOLO.n + 1);
  });

  it('⚠⚠⚠ a pack does not close on a partial kill — only the last body closes it', async () => {
    const g = huntGround(PACK.id, PACK.n);
    await boot(g, [PACK.item]);
    setHunts([{ id: PACK.id, stage: PACK.n }]);
    store.getState().advanceHunt(PACK.id);
    expect(bodies().length).toBe(PACK.count);
    expect(bodies().every((b) => b.key === `hunt:${PACK.id}:${PACK.n}`)).toBe(true);
    for (let i = 0; i < PACK.count - 1; i++) {
      killAt(i);
      // ⚠ The stage holds while ANY of its own are still up. OTA-1578's rule.
      expect([i, huntStage(PACK.id)]).toEqual([i, PACK.n]);
    }
    killAt(PACK.count - 1);
    expect(huntStage(PACK.id)).toBe(PACK.n + 1);
  });

  it('⚠⚠ a same-ground successor is not materialised, paid or cleared by the victory before it', async () => {
    // hunt_mud_siren_queen 1 -> 2, both on Mud Seas: the one shape where "the
    // player is still standing there" could be mistaken for "the next beat too".
    const g = huntGround(OTHER.id, OTHER.n);
    expect(huntGround(OTHER.id, OTHER.n + 1)).toBe(g);   // genuinely the same ground
    await boot(g, [OTHER.item]);
    setHunts([{ id: OTHER.id, stage: OTHER.n }]);
    store.getState().advanceHunt(OTHER.id);
    killAll();
    expect(huntStage(OTHER.id)).toBe(OTHER.n + 1);
    clearField();
    armSpawnStagesAtArrival(store.getState, store.setState as never);
    expect(bodies().length).toBe(0);                     // N+1 has no fight of its own
    expect(huntStage(OTHER.id)).toBe(OTHER.n + 1);       // and standing here does not pay it
  });
});

/* ══ §C — FLEE IS NOT VICTORY, AND THE LEDGER KNOWS WHOSE FIGHT IT WAS ═══════ */
describe('Package 6 §C — flee', () => {
  it('⚠⚠⚠ fleeing a partly-cleared pack pays nothing and records who was still standing', async () => {
    const g = huntGround(PACK.id, PACK.n);
    await boot(g, [PACK.item]);
    setHunts([{ id: PACK.id, stage: PACK.n }]);
    store.getState().advanceHunt(PACK.id);
    killAt(0);
    killAt(1);
    expect(liveBodies().length).toBe(2);
    const fight = missionFightUnderfoot(store.getState().player);
    expect(fight?.missionId).toBe(PACK.id);
    expect(fight?.stage).toBe(PACK.n);
    expect(fight?.stageKey).toBe(`hunt:${PACK.id}:${PACK.n}`);
    noteMissionFlee(store.getState, store.setState as never, scene() as never);
    const deed = stageFled(store.getState().worldMemory, g, PACK.id, PACK.n);
    expect(deed?.kind).toBe('fled');
    expect(deed?.missionId).toBe(PACK.id);
    expect(deed?.stage).toBe(PACK.n);
    expect(deed?.who).toBe(PACK.who);
    expect(deed?.n).toBe(2);                              // the two left standing
    expect(huntStage(PACK.id)).toBe(PACK.n);              // ⚠ running is not winning
  });

  it('⚠⚠⚠ coming back stands up what you left, keyed to the same beat, and finishing pays once', async () => {
    const g = huntGround(PACK.id, PACK.n);
    await boot(g, [PACK.item]);
    setHunts([{ id: PACK.id, stage: PACK.n }]);
    store.getState().advanceHunt(PACK.id);
    killAt(0);
    noteMissionFlee(store.getState, store.setState as never, scene() as never);
    const standing = stageFled(store.getState().worldMemory, g, PACK.id, PACK.n)!.n!;
    clearField();
    armSpawnStagesAtArrival(store.getState, store.setState as never);
    // ⚠⚠ OTA-1688's contract, stated as arithmetic rather than remembered:
    //     restored = min(authored, standing-at-flee)
    expect(bodies().length).toBe(Math.min(PACK.count, standing));
    expect(bodies().every((b) => b.key === `hunt:${PACK.id}:${PACK.n}`)).toBe(true);
    killAll();
    expect(huntStage(PACK.id)).toBe(PACK.n + 1);
  });

  it('⚠⚠ flee / resume / flee / resume / victory — the beat is paid once at the end of it', async () => {
    const g = huntGround(PACK.id, PACK.n);
    await boot(g, [PACK.item]);
    setHunts([{ id: PACK.id, stage: PACK.n }]);
    store.getState().advanceHunt(PACK.id);
    const seen: number[] = [];
    for (let cycle = 0; cycle < 2; cycle++) {
      killAt(0);
      noteMissionFlee(store.getState, store.setState as never, scene() as never);
      seen.push(stageFled(store.getState().worldMemory, g, PACK.id, PACK.n)!.n!);
      clearField();
      armSpawnStagesAtArrival(store.getState, store.setState as never);
      expect([cycle, huntStage(PACK.id)]).toEqual([cycle, PACK.n]);   // never advanced by running
    }
    // ⚠ The pack shrinks as it is worn down and never grows back past its authored size.
    expect(seen).toEqual([3, 2]);
    expect(bodies().length).toBeLessThanOrEqual(PACK.count);
    killAll();
    expect(huntStage(PACK.id)).toBe(PACK.n + 1);
  });
});

/* ══ §D — SHARED GROUND: ONE PACK, ONE OWNER, ONE LEDGER ═════════════════════ */
describe('Package 6 §D — shared ground', () => {
  const g = () => huntGround(SOLO.id, SOLO.n);
  const both = async () => {
    await boot(g(), [SOLO.item, OTHER.item]);
    setHunts([{ id: SOLO.id, stage: SOLO.n }, { id: OTHER.id, stage: OTHER.n }]);
  };

  it('⚠⚠⚠ two eligible arcs share the ground; arrival arms ONE, and killing it credits only its owner', async () => {
    expect(huntGround(OTHER.id, OTHER.n)).toBe(g());     // genuinely the same ground
    await both();
    armSpawnStagesAtArrival(store.getState, store.setState as never);
    const owner = bodies()[0]!.key;
    expect(bodies().length).toBeGreaterThan(0);
    expect(bodies().every((b) => b.key === owner)).toBe(true);   // one pack, one key
    killAll();
    const advanced = [SOLO.id, OTHER.id].filter((id) => huntStage(id) !== (id === SOLO.id ? SOLO.n : OTHER.n));
    expect(advanced.length).toBe(1);                              // exactly one arc moved
    expect(owner!.startsWith(`hunt:${advanced[0]}:`)).toBe(true); // and it is the one that owned the bodies
    // ⚠ The other arc is not consumed, suppressed or stranded by its neighbour.
    clearField();
    armSpawnStagesAtArrival(store.getState, store.setState as never);
    expect(bodies().length).toBeGreaterThan(0);
    expect(bodies()[0]!.key).not.toBe(owner);
  });

  it('⚠⚠⚠ a flee from one arc does not touch the other, though they stand on the same ground', async () => {
    await both();
    store.getState().advanceHunt(SOLO.id);                        // A's fight specifically
    noteMissionFlee(store.getState, store.setState as never, scene() as never);
    // ⚠⚠ THE CLAIM: the ledger is keyed harder than the ground is.
    const mine = stageFled(store.getState().worldMemory, g(), SOLO.id, SOLO.n);
    const theirs = stageFled(store.getState().worldMemory, g(), OTHER.id, OTHER.n);
    expect(mine?.missionId).toBe(SOLO.id);
    expect(theirs).toBeNull();
    expect(huntStage(SOLO.id)).toBe(SOLO.n);
    expect(huntStage(OTHER.id)).toBe(OTHER.n);
    // B is still winnable, and winning it moves B alone.
    clearField();
    store.getState().advanceHunt(OTHER.id);
    expect(bodies().every((b) => b.key === `hunt:${OTHER.id}:${OTHER.n}`)).toBe(true);
    killAll();
    expect(huntStage(OTHER.id)).toBe(OTHER.n + 1);
    expect(huntStage(SOLO.id)).toBe(SOLO.n);
    expect(stageFled(store.getState().worldMemory, g(), SOLO.id, SOLO.n)?.missionId).toBe(SOLO.id);
  });

  it('⚠⚠⚠ a clear from a beat the record has already left cannot pay the beat it is on now', async () => {
    const g2 = huntGround(PACK.id, PACK.n);
    await boot(g2, [PACK.item, "Ferel's Daughter"]);
    setHunts([{ id: PACK.id, stage: PACK.n }]);
    store.getState().advanceHunt(PACK.id);
    const stale = { ...(scene()!.enemies[0]! as { name: string; stageKey?: string }) };
    expect(stale.stageKey).toBe(`hunt:${PACK.id}:${PACK.n}`);
    killAll();
    const now = huntStage(PACK.id)!;
    expect(now).toBe(PACK.n + 1);
    // ⚠ Deliver the OLD beat's clear against the NEW record. The stageKey is
    // re-derived from the record, so it no longer matches and nothing is paid.
    store.setState((s) => ({ currentScene: { ...s.currentScene!, enemies: [stale as never], enemyHps: [0], enemyKnockedOut: [false] } }));
    resolveStageEscortClear(store.getState, store.setState as never, store.getState().player!, stale as never, 0);
    expect(huntStage(PACK.id)).toBe(now);
  });
});

/* ══ §E — TWO FAMILIES, TWO CONTRACTS, BOTH DELIBERATE ═══════════════════════ */
describe('Package 6 §E — the hunt and storyline contracts are different on purpose', () => {
  it('⚠⚠⚠ a storyline fight freezes, resets whole on a deliberate re-arm, and closes exactly once', async () => {
    const g = storyGround(STORY.id, STORY.n);
    await boot(g, [STORY.item]);
    setStories([{ id: STORY.id, stage: STORY.n }]);
    expect(stageRequirementMet(findStorylineById(STORY.id)!.stages[STORY.n] as never, store.getState().player!.inventory)).toBe(true);
    store.getState().advanceStoryline(STORY.id);
    expect(bodies().length).toBe(STORY.count);
    expect(bodies().every((b) => b.key === `storyline:${STORY.id}:${STORY.n}`)).toBe(true);
    expect(storyStage(STORY.id)).toBe(STORY.n);            // the spawn does not advance the chapter
    killAt(0);
    expect(storyStage(STORY.id)).toBe(STORY.n);            // nor does a partial clear

    // ⚠⚠ THE FAMILY BOUNDARY, MEASURED. The hunt-only walk does not see this
    // fight, so no `fled` deed is written and the arrival arm stays shut. That
    // is the contract, not an omission: the beat is still frozen and still won.
    expect(missionFightUnderfoot(store.getState().player)).toBeNull();
    noteMissionFlee(store.getState, store.setState as never, scene() as never);
    expect(stageFled(store.getState().worldMemory, g, STORY.id, STORY.n)).toBeNull();
    expect(storyStage(STORY.id)).toBe(STORY.n);
    clearField();
    armSpawnStagesAtArrival(store.getState, store.setState as never);
    expect(bodies().length).toBe(0);                       // hunt-only arm: correctly inert here

    // ⚠ The player's own verb is the door, and it brings back the WHOLE pack.
    store.getState().advanceStoryline(STORY.id);
    expect(bodies().length).toBe(STORY.count);
    expect(bodies().every((b) => b.key === `storyline:${STORY.id}:${STORY.n}`)).toBe(true);
    killAll();
    expect(storyStage(STORY.id)).toBe(STORY.n + 1);
  });

  it('⚠⚠ the two contracts are both pinned, so neither can be quietly normalised into the other', async () => {
    // HUNT: ledger-backed, partial pack comes back.
    const gh = huntGround(PACK.id, PACK.n);
    await boot(gh, [PACK.item]);
    setHunts([{ id: PACK.id, stage: PACK.n }]);
    store.getState().advanceHunt(PACK.id);
    killAt(0);
    noteMissionFlee(store.getState, store.setState as never, scene() as never);
    expect(stageFled(store.getState().worldMemory, gh, PACK.id, PACK.n)).not.toBeNull();
    clearField();
    armSpawnStagesAtArrival(store.getState, store.setState as never);
    expect(bodies().length).toBeLessThan(PACK.count);      // worn down, and it stays worn down

    // STORYLINE: no ledger, whole pack comes back.
    const gs = storyGround(STORY.id, STORY.n);
    await boot(gs, [STORY.item]);
    setStories([{ id: STORY.id, stage: STORY.n }]);
    store.getState().advanceStoryline(STORY.id);
    killAt(0);
    noteMissionFlee(store.getState, store.setState as never, scene() as never);
    expect(stageFled(store.getState().worldMemory, gs, STORY.id, STORY.n)).toBeNull();
    clearField();
    store.getState().advanceStoryline(STORY.id);
    expect(bodies().length).toBe(STORY.count);             // whole again
  });
});

/* ══ §F — THE INTERRUPTIONS THAT ARE NOT THE PLAYER LEAVING ══════════════════ */
describe('Package 6 §F — interruption', () => {
  it('⚠⚠⚠ an unresolved fight survives save and load intact, and still closes its own beat once', async () => {
    // ⚠ CONTRACT A, read from the type and then measured: `SaveState.currentScene`
    // is persisted and restored as-is, so live hostiles are NOT ephemeral — their
    // hit points and their stage stamps both come back.
    const g = huntGround(PACK.id, PACK.n);
    await boot(g, [PACK.item]);
    setHunts([{ id: PACK.id, stage: PACK.n }]);
    store.getState().advanceHunt(PACK.id);
    killAt(0);
    const before = bodies();
    const slot = store.getState().activeSlotId!;
    await store.getState().persist();
    store.setState(() => ({ currentScene: null, player: null }));   // a cold boot
    await store.getState().loadSlotIntoGame(slot);
    expect(huntStage(PACK.id)).toBe(PACK.n);
    expect(bodies()).toEqual(before);                                // identity AND damage
    expect(liveBodies().every((b) => b.key === `hunt:${PACK.id}:${PACK.n}`)).toBe(true);
    killAll();
    expect(huntStage(PACK.id)).toBe(PACK.n + 1);
  });

  it('⚠⚠⚠ dying in an authored fight never counts as winning it', async () => {
    const g = huntGround(PACK.id, PACK.n);
    await boot(g, [PACK.item]);
    setHunts([{ id: PACK.id, stage: PACK.n }]);
    store.getState().advanceHunt(PACK.id);
    const standing = bodies();
    store.setState((s) => ({ player: { ...s.player!, hp: 0 } as PlayerCharacter }));
    handlePlayerDeath(store.getState, store.setState as never);
    // The run ends — that is the game's explicit design (the Fallen roll, and a
    // Resurrection Gem from the title screen). What must NOT happen is the fight
    // paying out on the way.
    expect(store.getState().player!.dead).toBe(true);
    expect(huntStage(PACK.id)).toBe(PACK.n);                         // the beat is still owed
    expect(bodies()).toEqual(standing);                              // nobody was credited as killed
    expect(store.getState().gameLog.some((e) => e.text.includes('The last of them is down'))).toBe(false);
  });
});

/* ══ §G — THE BELT THAT KEEPS FIGHTS OUT OF ROOMS ════════════════════════════ */
describe('Package 6 §G — roof and interior', () => {
  it('⚠⚠ an authored pack cannot be stood up indoors, and steps up the moment the ground is open', async () => {
    const g = huntGround(PACK.id, PACK.n);
    await boot(g, [PACK.item]);
    setHunts([{ id: PACK.id, stage: PACK.n }]);
    store.setState(() => ({ activeBuildingId: 'p6_interior' }));
    store.getState().advanceHunt(PACK.id);
    expect(bodies().length).toBe(0);                 // OTA-1598's belt
    expect(huntStage(PACK.id)).toBe(PACK.n);         // and the beat is not spent on the refusal
    store.setState(() => ({ activeBuildingId: null }));
    store.getState().advanceHunt(PACK.id);
    expect(bodies().length).toBe(PACK.count);
    expect(bodies().every((b) => b.key === `hunt:${PACK.id}:${PACK.n}`)).toBe(true);
    expect(huntStage(PACK.id)).toBe(PACK.n);
  });
});
