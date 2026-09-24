jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('onnxruntime-react-native', () => ({
  InferenceSession: { create: jest.fn(async () => ({ run: jest.fn(async () => ({})) })) },
  Tensor: class { constructor(_t: string, _d: any, _s: any[]) {} },
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


// ⚠⚠⚠ OTA-1860 — THE ANSWER BELONGS TO THE CARD THAT ASKED. Package 4 of the
// mechanical-integrity program: when authored content names an NPC, does the player
// get the correct interactive object at the correct stage, and can that object pay
// ONLY the stage it belongs to?
//
// MOST OF IT WAS ALREADY TRUE, and §A/§B pin it: all 114 authored `npcName` stages
// resolve to a person (zero unresolved), the card key is stage-stamped
// (`family:missionId:stageIndex`) so two stages naming the same post are two
// conversations, the card is DERIVED fresh from the live record rather than held, and
// no authored card can offer FIGHT or PERSUADE because `stageHasFight` is `!!spawn`
// and zero npcName stages carry one.
//
// ⚠⚠ WHAT WAS NOT TRUE — THE ANSWER WAS NOT BOUND TO THE CARD. Of the 24 cells that
// host an authored npcName stage, EIGHTEEN host stages from more than one arc.
// `armedEncounter` returns the FIRST hit, which is correct for display — one card at a
// time — but `answerMissionEncounter` re-derived it on every call and the card is a
// Modal that stays mounted. Measured on varakush with two tracked hunts both armed at
// stage 0:
//
//   press 1 -> hunt_iron_titan 0 -> 1, and the card BECAME hunt_apparition_red_tower
//   press 2 -> hunt_apparition_red_tower 0 -> 1
//
// …and the same-tick pair did it with no re-render at all. The player pressed Envoy
// Tamsin's button twice and opened the Order archivist's beat, a conversation they
// never saw. The card now hands back the key it was rendered with and the store
// refuses a key that is no longer armed — the same "prove you still own this" sentence
// as the OTA-1703 stage stamp.
//
// ⚠ WHAT THIS FILE DELIBERATELY DOES NOT CLAIM. It does not require one card per cell:
// first-hit display is the design and §B asserts the shadowed arc stays payable by its
// typed verb. It does not re-test Package 2's requirement gate as a second inventory
// rule — §D asks the existing authority. It parses no prose.

import { useGameStore } from '../app/state/gameStore';
import { getRaces, getFactions } from '../app/engine/character';
import { stageLocationId } from '../app/engine/questStage';
import { findHuntById } from '../app/engine/hunts';
import { huntAnchorId, contractAnchorId, resolvePosterLocation } from '../app/engine/contractMarkers';
import { armedEncounter } from '../app/engine/missionEncounterArm';
import { choicesFor, freshEncounter } from '../app/engine/missionEncounter';
import { personFor, stageHasFight } from '../app/engine/missionRoles';
import { placedAt } from '../test-utils/placePlayer';
import { readFileSync } from 'fs';
import { join } from 'path';
import huntsRaw from '../app/data/quests/hunts.json';
import mysteriesRaw from '../app/data/quests/mysteries.json';
import storylinesRaw from '../app/data/quests/faction-storylines.json';

jest.setTimeout(180000);
const store = useGameStore;
const get = () => store.getState();

type S = { npcName?: string; spawn?: unknown; requires?: { item: string } };
const pick = (d: unknown): never[] => (Array.isArray(d) ? d : Object.values(d as object).find(Array.isArray)) as never;
const ARCS = [
  ...pick(huntsRaw).map((a) => ({ fam: 'hunt' as const, d: a as unknown as { id: string; stages: S[] } })),
  ...pick(mysteriesRaw).map((a) => ({ fam: 'mystery' as const, d: a as unknown as { id: string; stages: S[] } })),
  ...pick(storylinesRaw).map((a) => ({ fam: 'storyline' as const, d: a as unknown as { id: string; stages: S[] } })),
];
const npcRows = ARCS.flatMap(({ fam, d }) => {
  const anchor = (fam === 'hunt' ? huntAnchorId(d as never) : contractAnchorId(d as never)) as string;
  return d.stages.map((s, i) => ({ fam, arc: d.id, i, s })).filter((r) => r.s.npcName)
    .map((r) => ({ ...r, npc: r.s.npcName!, ground: stageLocationId(r.s as never, anchor, resolvePosterLocation) ?? '?' }));
});

/** ⚠ THE TWO ARCS THAT PROVED IT, pinned in DATA. Both open at varakush with an
 *  authored person and no requirement, so the collision is reachable from a fresh
 *  character holding nothing. A re-home or a rename has to come back through here. */
const COLLISION = { ground: 'varakush', A: 'hunt_iron_titan', B: 'hunt_apparition_red_tower', at: 0 } as const;

const settle = async (p: () => boolean, n = 200) => { for (let i = 0; i < n; i++) { if (p()) return; await new Promise((r) => setTimeout(r, 25)); } };
const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); await new Promise((r) => setTimeout(r, 30)); };

describe('OTA-1860 §A — the authored NPC corpus the card machinery has to serve', () => {
  it('⚠ the census the repair was measured against', () => {
    expect({ npcStages: npcRows.length, uniqueNames: new Set(npcRows.map((r) => r.npc)).size })
    // ⚠ 114 -> 120: ENDING batch 1's six epilogues each name a person. `uniqueNames`
    // is UNCHANGED at 61 — every one of them is someone the arc already established.
      .toEqual({ npcStages: 120, uniqueNames: 61 });
  });

  it('⚠⚠⚠ EVERY authored npcName resolves to a person — no card can name nobody', () => {
    const unresolved = [...new Set(npcRows.map((r) => r.npc))].filter((n) => !personFor(n, {}));
    expect(unresolved).toEqual([]);
  });

  it('⚠⚠ no authored card can offer FIGHT or PERSUADE — `stageHasFight` is `!!spawn`, and none carry one', () => {
    expect(npcRows.filter((r) => stageHasFight(r.s as never)).length).toBe(0);
    // …so the live surface is PROCEED (only when the pack satisfies the stage) and FLEE.
    const c = choicesFor(freshEncounter('k'), { hasFight: false, canPersuade: true });
    expect(c).toEqual(['proceed', 'flee']);
    expect(choicesFor(freshEncounter('k'), { hasFight: false, canPersuade: false })).toEqual(['flee']);
  });

  it('⚠⚠⚠ THE GROUNDS ARE CROWDED — most NPC cells host more than one arc', () => {
    const byGround: Record<string, Set<string>> = {};
    npcRows.forEach((r) => { (byGround[r.ground] ??= new Set()).add(r.arc); });
    const multi = Object.values(byGround).filter((v) => v.size > 1).length;
    // 18 of 24. This is why first-hit display needed the answer to carry a key.
    expect({ multi, total: Object.keys(byGround).length }).toEqual({ multi: 18, total: 24 });
  });

  it('⚠ and the collision this suite drives is still authored as measured', () => {
    for (const id of [COLLISION.A, COLLISION.B]) {
      const def = findHuntById(id)!;
      const st = def.stages[COLLISION.at] as S;
      expect({ id, npc: !!st.npcName, req: st.requires ?? null, spawn: st.spawn ?? null,
        ground: stageLocationId(st as never, huntAnchorId(def as never), resolvePosterLocation) })
        .toEqual({ id, npc: true, req: null, spawn: null, ground: COLLISION.ground });
    }
  });
});

describe('OTA-1860 §B — the card is the stage it says it is', () => {
  const stageOf = (id: string) => ((get().player?.activeHunts ?? [])
    .find((h) => (h as unknown as { id: string }).id === id) as unknown as { stage: number } | undefined)?.stage;

  beforeAll(async () => {
    console.log = () => {}; console.warn = () => {}; console.error = () => {};
    await get().hydrate();
    await get().startNewGame({ name: 'Carder', raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
    get().skipTutorial?.();
    await settle(() => !!get().currentScene);
  });

  /** Both colliding arcs tracked, both at their opening beat, boots on the shared cell. */
  const seat = () => {
    const def = findHuntById(COLLISION.A)!;
    const where = stageLocationId(def.stages[COLLISION.at] as never, huntAnchorId(def as never), resolvePosterLocation)!;
    const p = get().player!;
    store.setState(({
      player: { ...p, ...placedAt(where), hubRoomId: null, travelTarget: undefined, whisperCourse: null,
        activeMysteries: [], activeStorylines: [], missionEncounters: {},
        activeHunts: [{ id: COLLISION.A, stage: COLLISION.at, tracked: true },
                      { id: COLLISION.B, stage: COLLISION.at, tracked: true }] as never[] },
      activeBuildingId: null, gameLog: [] as never,
      currentScene: { ...(get().currentScene as unknown as Record<string, unknown>), enemies: [], enemyHps: [] } as never,
    }) as never);
  };

  it('⚠⚠ the card names the AUTHORED person and carries a stage-stamped key', () => {
    seat();
    const c = armedEncounter(get().player)!;
    const authored = (findHuntById(COLLISION.A)!.stages[COLLISION.at] as S).npcName!;
    expect(c.missionId).toBe(COLLISION.A);
    expect(c.stageIndex).toBe(COLLISION.at);
    expect(c.key).toBe(`hunt:${COLLISION.A}:${COLLISION.at}`);
    expect(c.person.name).toBe(personFor(authored, get().player!.roleKills)!.name);
  });

  it('⚠⚠⚠ ONE PRESS PAYS ONE ARC — and the second press of the SAME card pays nothing', async () => {
    seat();
    const pressed = armedEncounter(get().player)!.key;
    get().answerMissionEncounter('proceed', pressed);
    await flush();
    expect(stageOf(COLLISION.A)).toBe(COLLISION.at + 1);
    // The modal has not closed: the card underneath is now the OTHER arc's beat.
    expect(armedEncounter(get().player)?.missionId).toBe(COLLISION.B);
    // A second press still carries the key the player actually pressed. It must not land.
    get().answerMissionEncounter('proceed', pressed);
    await flush();
    expect(stageOf(COLLISION.B)).toBe(COLLISION.at);
  });

  it('⚠⚠⚠ SAME-TICK DOUBLE PRESS — two synchronous calls, one arc paid', async () => {
    seat();
    const pressed = armedEncounter(get().player)!.key;
    get().answerMissionEncounter('proceed', pressed);
    get().answerMissionEncounter('proceed', pressed);
    await flush();
    expect({ A: stageOf(COLLISION.A), B: stageOf(COLLISION.B) })
      .toEqual({ A: COLLISION.at + 1, B: COLLISION.at });
  });

  it('⚠⚠ THE SHADOWED ARC IS NOT STRANDED — the card yields to it once the first is paid', async () => {
    seat();
    get().answerMissionEncounter('proceed', armedEncounter(get().player)!.key);
    await flush();
    const now = armedEncounter(get().player)!;
    expect(now.missionId).toBe(COLLISION.B);
    // …and pressing ITS key pays it. One card at a time is the design, not a trap.
    get().answerMissionEncounter('proceed', now.key);
    await flush();
    expect(stageOf(COLLISION.B)).toBe(COLLISION.at + 1);
  });

  it('⚠⚠ A KEY FOR A STAGE THAT IS NO LONGER ARMED IS REFUSED', async () => {
    seat();
    get().answerMissionEncounter('proceed', `hunt:${COLLISION.A}:${COLLISION.at + 3}`);
    await flush();
    expect(stageOf(COLLISION.A)).toBe(COLLISION.at);
    get().answerMissionEncounter('proceed', 'mystery:not_a_real_arc:0');
    await flush();
    expect({ A: stageOf(COLLISION.A), B: stageOf(COLLISION.B) })
      .toEqual({ A: COLLISION.at, B: COLLISION.at });
  });

  it('⚠ AN UNKEYED CALL STILL WORKS — the guard is opt-in, so no other caller is broken', async () => {
    seat();
    get().answerMissionEncounter('proceed');
    await flush();
    expect(stageOf(COLLISION.A)).toBe(COLLISION.at + 1);
  });

  it('⚠⚠ CARD LIFETIME — after the beat is paid, its own key is no longer the armed one', async () => {
    seat();
    const old = armedEncounter(get().player)!.key;
    get().answerMissionEncounter('proceed', old);
    await flush();
    expect(armedEncounter(get().player)?.key).not.toBe(old);
  });
});

describe('OTA-1860 §C — the card hands its key back', () => {
  it('⚠⚠⚠ the press site carries the key it rendered, and the store checks it', () => {
    const CARD = readFileSync(join(__dirname, '..', 'app', 'components', 'MissionEncounterCard.tsx'), 'utf8');
    const GS = readFileSync(join(__dirname, '..', 'app', 'state', 'gameStore.ts'), 'utf8');
    expect(CARD).toContain('answer(c, armed.key)');
    expect(GS).toContain('if (key && key !== armed.key) return;');
  });
});
