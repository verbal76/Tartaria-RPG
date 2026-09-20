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

// ⚠⚠⚠ OTA-1598 — THE FIGHT WAITS OUTSIDE THE GATE.
//
// From the owner's 00:14 session ON 1597 (bundle mthxaxji3kq3) — the Doubter
// finally fired at the door, he cleared the pack, the hunt auto-routed him to
// stage 3 at Tartarian Outskirts ... which is a HUB TILE, so arrival walked him
// straight through the gate of Reclaimers' Outpost. He saw it before we did:
//
//   [player] if this takes place in a reclaimer's Outpost and that's where the
//            next mission phase is and we have a rule against being attacked
//            in an outpost
//   [player] is that killing the mission?
//
// Nearly the opposite: the verb matcher gates on the location id and combat
// only, so an attack typed under the roof would ADVANCE stage 3 and the next
// one would stand the scaled apex boss up INSIDE the outpost room — the truce
// broken by the mission system itself. The sweep found the class: hunt fight
// stages standing on hub tiles across the catalog.
//
// The rule now, at the one writer every path uses (verb, card, arrival arm):
// a hunt stage that draws blades (boss / attack_provoke / authored spawn)
// refuses under a roof and points at the door. OTA-1597 keys standing on the
// canon cell, so stepping out the gate keeps the boots on the stage's ground
// and the same verb pays honestly right outside.

import { useGameStore } from '../app/state/gameStore';
import { resolveStageEscortClear } from '../app/state/slices/questSlice';
import { missionArrivalLines } from '../app/engine/missionTrace';
import { getRaces, getFactions } from '../app/engine/character';
import { HUNTS } from '../app/engine/hunts';
import { stageLocationId } from '../app/engine/questStage';
import { huntAnchorId, resolvePosterLocation } from '../app/engine/contractMarkers';
import { isHubLocation } from '../app/engine/hub';
import { placedAt } from '../test-utils/placePlayer';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

jest.setTimeout(180000);

const store = useGameStore;
const get = () => store.getState();
const set = (fn: (s: ReturnType<typeof get>) => Partial<ReturnType<typeof get>>) => store.setState(fn as never);

async function settle(pred: () => boolean, deadlineMs = 5000) {
  const t0 = Date.now();
  while (!pred() && Date.now() - t0 < deadlineMs) {
    await new Promise((r) => setTimeout(r, 15));
  }
}

const TRUCE = 'the outpost holds its truce';

function doubterStage(): number | undefined {
  return (get().player?.activeHunts ?? []).find((h) => h.id === 'hunt_servants_doubter')?.stage;
}

/** His exact next state: stage 3 "force the issue" at the Outskirts, walked
 *  through the gate by arrival's auto-enter, Spiral-Mark Stone in the pack. */
function seedDoubterAtStageThree(opts: { indoors: boolean }) {
  const p = get().player!;
  store.setState({
    player: {
      ...p,
      ...placedAt('tartarian_outskirts'),
      hubRoomId: opts.indoors ? 'outpost_gate' : null,
      stamina: 100,
      travelTarget: undefined,
      whisperCourse: null,
      inventory: [
        ...p.inventory.filter((i) => !/Spiral-Mark Stone|Ridge-Sign/.test(i.name)),
        { id: 'test_spiral', name: "Reaver's Spiral-Mark Stone", kind: 'misc', quantity: 1, tags: ['quest'] } as never,
      ],
      activeHunts: [{ id: 'hunt_servants_doubter', stage: 3, tracked: true } as never],
    },
    activeBuildingId: null,
  });
  set((s) => (s.currentScene ? {
    currentScene: { ...s.currentScene, enemies: [], enemyHps: [], activeEnemyIdx: 0, range: null },
  } : s));
}

describe('OTA-1598 — the truce holds, and the mission survives it', () => {
  beforeAll(async () => {
    console.log = () => {}; console.warn = () => {}; console.error = () => {};
    await store.getState().hydrate();
    await store.getState().startNewGame({ name: 'Gatewalker', raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
    store.getState().skipTutorial?.();
    await settle(() => !!store.getState().currentScene);
  });

  it('⚠⚠⚠ UNDER THE ROOF — the fight-stage advance refuses and points at the door', () => {
    seedDoubterAtStageThree({ indoors: true });
    get().advanceHunt('hunt_servants_doubter');
    expect(doubterStage()).toBe(3); // did not move
    expect((get().currentScene?.enemies ?? []).length).toBe(0); // nothing stood up indoors
    const lines = get().gameLog.slice(-4).map((e) => e.text).join('\n');
    expect(lines).toContain(TRUCE);
    expect(lines).toContain('LEAVE OUTPOST');
  });

  it('⚠⚠⚠ and the TYPED VERB in the outpost routes to the real ground — no advance, no apex in the gate room', async () => {
    // ⚠ OTA-1599 SUPERSEDE — stage 3's ground is no longer this hub tile at all
    // (the bone is set: it moved to Raider's Ridge, one tile north). So the verb
    // typed in the outpost now draws the ground-mismatch routing line instead of
    // the truce refusal — the truce guard behind it stays as the belt.
    seedDoubterAtStageThree({ indoors: true });
    await get().submitPlayerAction('attack');
    await settle(() => get().gameLog.slice(-8).some((e) => e.text.includes('points elsewhere')));
    expect(get().gameLog.slice(-8).some((e) => e.text.includes('points elsewhere'))).toBe(true);
    expect(doubterStage()).toBe(3);
    expect((get().currentScene?.enemies ?? []).length).toBe(0);
  });

  /* ⚠⚠⚠ PACKAGE A SUPERSEDE — THIS CASE USED TO ASSERT THE DEFECT.
   *
   * It read "the verb pays" as "stage 3 closes on the press", which was true
   * and was the bug: stage 3's own prose says *"Two more Tartarian Raiders
   * strike from cover at the half-mile mark"*, and the stage carried no
   * `spawn`, so the player typed `provoke it` at empty ground, read a
   * description of an ambush, took the Ridge-Sign and walked on. The story
   * audit traced that path through `advanceHunt` — `override = stageDef.spawn`
   * is `undefined`, `spawnStageEscort` returns false at its first line, and
   * `checkKind !== 'boss'` keeps the boss branch shut — and filed it as one of
   * nine PROVEN runtime mismatches.
   *
   * Package A authored the two raiders the sentence names. The truce half of
   * this suite is untouched and still the point: under the roof, nothing
   * stands up and the door is named. What changes is what happens OUTSIDE —
   * the beat now costs what it says it costs. */
  it('⚠⚠⚠ OUT THE GATE — same cell, roof gone: the two raiders the sentence names stand up, and the stage holds for them', () => {
    seedDoubterAtStageThree({ indoors: false });
    get().advanceHunt('hunt_servants_doubter');
    const up = get().currentScene?.enemies ?? [];
    expect(up.map((e) => e.name)).toEqual(['Tartarian Raider', 'Tartarian Raider']);
    expect(doubterStage()).toBe(3); // frozen for the kill — the fight owns the advance
  });

  /* ⚠ THE SIGN LANDS ON THE FIRE, NOT ON THE CLEAR, and that is the shared
   * close block's long-standing behaviour rather than anything Package A did:
   * `grantStageItems` runs in advanceHunt's P19 block, above the spawn. The
   * beat still costs what it says — the RECORD does not move until the last
   * body is down — so the player cannot take the sign and be on the next beat. */
  it('⚠⚠⚠ and clearing them advances ONCE and leaves the apex to stand up next', () => {
    seedDoubterAtStageThree({ indoors: false });
    get().advanceHunt('hunt_servants_doubter');
    expect((get().player?.inventory ?? []).some((i) => i.name === "Raider's Ridge-Sign")).toBe(true);
    const scene = get().currentScene!;
    // Drop the pack the way the real kill path does: every body of this stage's
    // key at 0 hp, then the clear that resolveEnemyDefeat routes through.
    set((s) => ({ currentScene: { ...s.currentScene!, enemyHps: scene.enemies.map(() => 0) } }));
    resolveStageEscortClear(store.getState, store.setState as never, get().player!, scene.enemies[0]!, 0);
    expect(doubterStage()).toBe(4);
    get().advanceHunt('hunt_servants_doubter'); // stage 4 — the apex boss
    const apex = get().currentScene?.enemies ?? [];
    expect(apex.length).toBe(1);
    expect(apex[0]!.name).toContain('Tartarian Reaver'); // scaleHuntBoss marks it "(hunted)"
    expect(doubterStage()).toBe(4); // frozen for the kill
  });

  // ⚠ OTA-1599 SUPERSEDE — the positive "Outside the walls" slate test is gone
  // with the state that produced it: no hunt fight-stage stands on a hub tile
  // any more (ota1599 holds that as the ratchet), so no live line can carry the
  // clause. The clause code stays in missionTrace as the belt for any future
  // spawn authored onto a hub ground.

  it('⚠ and open-country fight stages carry no such clause', () => {
    const p = get().player!;
    store.setState({
      player: {
        ...p,
        ...placedAt('great_tartary_plains'),
        hubRoomId: null,
        activeHunts: [{ id: 'hunt_servants_doubter', stage: 1, tracked: true } as never],
      },
    });
    const lines = missionArrivalLines(get().player).join('\n');
    expect(lines).toContain('Silence the Doubter');
    expect(lines).not.toContain('Outside the walls');
  });
});

describe('OTA-1598 — the class, measured and guarded', () => {
  it('⚠⚠ NO hunt fight-stage stands on a hub tile — the bone is set (OTA-1599 ratchet)', () => {
    // OTA-1598 measured five (mud_titan#3, servants_doubter#3+4,
    // mud_siren_drakova#5+6). OTA-1599 moved every one onto authored open
    // ground beside its outpost — owner: "make all of these missions have
    // nothing to do with an outpost or any other inside place that would
    // involve combat." This list stays EMPTY forever; a new authored fight on
    // a hub tile lands here by name and fails the build.
    const onHubGround: string[] = [];
    for (const h of HUNTS) {
      (h.stages ?? []).forEach((st, i) => {
        const draws = st.checkKind === 'boss' || st.checkKind === 'attack_provoke' || !!st.spawn;
        if (!draws) return;
        const ground = stageLocationId(st as never, huntAnchorId(h as never), resolvePosterLocation);
        if (isHubLocation(ground)) onHubGround.push(`${h.id}#${i}[${st.checkKind}]@${ground}`);
      });
    }
    expect(onHubGround).toEqual([]);
  });

  it('⚠⚠ the guard sits at the one writer, ahead of the narration', () => {
    const QSL = readFileSync(join(__dirname, '..', 'app', 'state', 'slices', 'questSlice.ts'), 'utf8');
    const guard = QSL.indexOf('!peaceful && drawsBlades && (player.hubRoomId || get().activeBuildingId)');
    const narrate = QSL.indexOf("appendLog('world', stageDef.narration)");
    expect(guard).toBeGreaterThan(-1);
    expect(narrate).toBeGreaterThan(guard); // refuse BEFORE the stage narrates itself
  });

  it('⚠ the belt: spawnStageEscort never writes bodies under a roof', () => {
    const QSL = readFileSync(join(__dirname, '..', 'app', 'state', 'slices', 'questSlice.ts'), 'utf8');
    const fn = QSL.indexOf('function spawnStageEscort(');
    const belt = QSL.indexOf('if (get().player?.hubRoomId || get().activeBuildingId) return false;', fn);
    const write = QSL.indexOf('enemies: escort.map((e) => ({ ...e, stageKey })),', fn); // OTA-1703 — the bodies carry the stage's key
    expect(belt).toBeGreaterThan(fn);
    expect(write).toBeGreaterThan(belt);
  });
});
