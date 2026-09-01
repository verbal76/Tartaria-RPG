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

// ⚠⚠⚠ OTA-1605 — ONE FIGHT ON THE FIELD.
//
// From the owner's crest log, played on 1604. He landed on the apex ground;
// the arrival scene spawned an AMBIENT pack (Swamp Crab + Mud Spirit); the
// OTA-1597 arm correctly held the Reaver back behind its live-hostiles guard
// — and then nothing ever re-checked, because the arm runs per ACTION and
// killing the last crab is not an action. Owner: "again I had to yell fight
// me, no popup when I landed, just a fight that was not the hint fight."
//
// And the 'fight me' itself ran advanceHunt through TWO doors in one action
// (the attack matcher and the per-action ground check): the full curtain —
// narration, 'closes the distance', stinger — printed TWICE, 283ms apart,
// the second summon handing the Reaver a fresh HP bar. A 5,038ms JS stall
// sat in that exact window. Two doors existed only since OTA-1601; the arm
// door always guarded on live hostiles, the verb door never had to.
//
// Fixes, both sides of one rule — one fight on the field at a time:
//   1. advanceHunt: a stage that freezes for a kill is a SILENT no-op while
//      any live hostile holds the field (you're already fighting).
//   2. resolveEnemyDefeat: when the last body drops, checkStandingGround
//      runs — so the mission fight rises exactly where the ambient one died.

import { useGameStore } from '../app/state/gameStore';
import { getRaces, getFactions } from '../app/engine/character';
import { findEnemyByName } from '../app/engine/encounter';
import { placedAt } from '../test-utils/placePlayer';
import { readFileSync } from 'fs';
import { join } from 'path';

jest.setTimeout(180000);

const store = useGameStore;
const get = () => store.getState();

async function settle(pred: () => boolean, deadlineMs = 5000) {
  const t0 = Date.now();
  while (!pred() && Date.now() - t0 < deadlineMs) {
    await new Promise((r) => setTimeout(r, 15));
  }
}

function seedCrest(stage: number) {
  const p = get().player!;
  store.setState({
    player: {
      ...p,
      ...placedAt('reavers_crest'),
      hubRoomId: null,
      stamina: 100,
      travelTarget: undefined,
      whisperCourse: null,
      inventory: [
        ...p.inventory.filter((i) => !/Ridge-Sign/.test(i.name)),
        { id: 't_sign', name: "Raider's Ridge-Sign", kind: 'misc', quantity: 1, tags: ['quest'] } as never,
      ],
      activeHunts: [{ id: 'hunt_servants_doubter', stage, tracked: true } as never],
    },
    activeBuildingId: null,
    pendingMissionStinger: null,
    pendingMissionBeat: null,
  });
  store.setState((s) => (s.currentScene ? {
    currentScene: {
      ...s.currentScene, enemies: [], enemyHps: [], activeEnemyIdx: 0, range: null,
      enemyStatuses: [], enemyKnockedOut: [], enemyAmbushUsed: [],
    },
  } : {}) as never);
}

function plantAmbient(name = 'Mud Boar') {
  const proto = findEnemyByName(name);
  if (!proto) throw new Error('test enemy not found');
  const enemy = JSON.parse(JSON.stringify(proto));
  const scene = get().currentScene!;
  store.setState({
    currentScene: {
      ...scene,
      enemies: [enemy],
      enemyHps: [enemy.hp],
      activeEnemyIdx: 0,
      range: 'close',
      enemyAmbushUsed: [false],
      enemyKnockedOut: [false],
      enemyStatuses: [[]],
    },
  });
  return enemy;
}

const stingerCount = () => get().gameLog.filter((e) => e.text.includes('Come, then')).length;

describe('OTA-1605 — one fight on the field', () => {
  beforeAll(async () => {
    console.log = () => {}; console.warn = () => {}; console.error = () => {};
    await store.getState().hydrate();
    await store.getState().startNewGame({ name: 'Fieldkeeper', raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
    store.getState().skipTutorial?.();
    await settle(() => !!store.getState().currentScene);
  });

  it('⚠⚠⚠ THE DOUBLE SUMMON IS DEAD — a second advance while the boss stands is a silent no-op', () => {
    seedCrest(4);
    const before = stingerCount();
    get().advanceHunt('hunt_servants_doubter'); // door one — the summons
    expect((get().currentScene?.enemies ?? []).length).toBe(1);
    expect(stingerCount()).toBe(before + 1);
    const logLen = get().gameLog.length;
    get().advanceHunt('hunt_servants_doubter'); // door two, 283ms later on device
    expect((get().currentScene?.enemies ?? []).length).toBe(1); // still ONE Reaver
    expect(stingerCount()).toBe(before + 1);                    // curtain printed ONCE
    expect(get().gameLog.length).toBe(logLen);                  // silent — no re-narration
  });

  it('⚠⚠⚠ AND NO FRESH HP BAR — re-summoning mid-fight cannot heal the boss', () => {
    seedCrest(4);
    get().advanceHunt('hunt_servants_doubter');
    store.setState((s) => ({ currentScene: { ...s.currentScene!, enemyHps: [5] } }));
    get().advanceHunt('hunt_servants_doubter');
    expect(get().currentScene?.enemyHps?.[0]).toBe(5); // wounded stays wounded
  });

  it('⚠⚠⚠ HIS LANDING, REPLAYED: ambient pack blocks the arm, and the kill that clears the field raises the Reaver', async () => {
    seedCrest(4);
    plantAmbient('Mud Boar');
    // The verb door during the ambient fight: silent no-op (you're fighting).
    const logLen = get().gameLog.length;
    get().advanceHunt('hunt_servants_doubter');
    expect(get().gameLog.length).toBe(logLen);
    expect((get().currentScene?.enemies ?? []).map((e) => e.name)).toEqual(['Mud Boar']);
    // The boar drops — the field clears — the ground gets one more look.
    store.setState((s) => ({ currentScene: { ...s.currentScene!, enemyHps: [0] } }));
    get().resolveEnemyDefeat();
    await settle(() => (get().currentScene?.enemies ?? []).some((e) => /Reaver/.test(e.name)));
    expect((get().currentScene?.enemies ?? []).some((e) => /Reaver/.test(e.name))).toBe(true);
    expect(get().pendingMissionStinger?.line).toContain('Come, then');
    const rec = (get().player?.activeHunts ?? []).find((h) => h.id === 'hunt_servants_doubter');
    expect(rec?.stage).toBe(4); // frozen for the kill, as ever
  });

  it('⚠⚠ a NON-freezing stage still advances mid-fight — the provoke verb keeps paying during its own battle', () => {
    // Stage 3 (attack_provoke at the ridge) has no spawn and is not the apex:
    // the one-fight guard must not eat legitimate mid-combat stage pays.
    const p = get().player!;
    store.setState({
      player: {
        ...p,
        ...placedAt('raiders_ridge'),
        hubRoomId: null, travelTarget: undefined, whisperCourse: null,
        inventory: [
          ...p.inventory.filter((i) => !/Spiral-Mark Stone|Ridge-Sign/.test(i.name)),
          { id: 't_stone', name: "Reaver's Spiral-Mark Stone", kind: 'misc', quantity: 1, tags: ['quest'] } as never,
        ],
        activeHunts: [{ id: 'hunt_servants_doubter', stage: 3, tracked: true } as never],
      },
      activeBuildingId: null,
    });
    plantAmbient('Mud Boar');
    get().advanceHunt('hunt_servants_doubter');
    const rec = (get().player?.activeHunts ?? []).find((h) => h.id === 'hunt_servants_doubter');
    expect(rec?.stage).toBe(4);
  });

  it('⚠ the wiring is pinned — the guard reads the field before the narration, and the defeat tail re-arms', () => {
    const QS = readFileSync(join(__dirname, '..', 'app', 'state', 'slices', 'questSlice.ts'), 'utf8');
    const guard = QS.indexOf('if (willFreezeForKill) {');
    const narr = QS.indexOf("get().appendLog('world', stageDef.narration);");
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(narr); // silent BEFORE the curtain, or the spam returns
    const GS = readFileSync(join(__dirname, '..', 'app', 'state', 'gameStore.ts'), 'utf8');
    const tail = GS.indexOf('// ⚠⚠⚠ OTA-1605 — THE CLEAR-FIELD RE-ARM.');
    expect(tail).toBeGreaterThan(-1);
    expect(GS.slice(tail, tail + 800)).toContain('if (!stillFighting) {');
    expect(GS.slice(tail, tail + 800)).toContain('checkStandingGround(get, set, grantStageItems);');
  });
});
