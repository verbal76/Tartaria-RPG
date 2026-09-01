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

// ⚠⚠⚠ OTA-1610 — THE FLEE IS HONORED.
//
// Owner: "I fled the fight at the end of the hunt of silence the doubter
// three times and it would just pop you on the tile. okay fine — and I typed
// investigate and ran right back into the fight."
//
// The escape roll PAID. The narration said he broke away. Then the OTA-1601
// per-action ground trigger — which exists to start the fight when you STEP
// ON the tile — read his next 'investigate' as standing on the ground and
// stood the Reaver right back up. A promise the very next action revoked.
//
// A successful flee now holds the arm on the fled CELL: the trigger stays
// down while the boots stay put, any cell change clears the hold (leave and
// return, and the tile is the trigger again), and the typed fight-verb still
// summons on purpose — deliberate re-engagement is the verb's job, not the
// investigate button's. Flee-in-place itself stays, per his "okay fine".

import { useGameStore } from '../app/state/gameStore';
import { getRaces, getFactions } from '../app/engine/character';
import { armSpawnStagesAtArrival } from '../app/state/stageArrival';
import { playerGridCell } from '../app/state/playerGrid';
import { placedAt } from '../test-utils/placePlayer';
import { readFileSync } from 'fs';
import { join } from 'path';

jest.setTimeout(180000);

const store = useGameStore;
const get = () => store.getState();
const setS = (fn: (s: ReturnType<typeof get>) => Partial<ReturnType<typeof get>>) => store.setState(fn as never);

async function settle(pred: () => boolean, deadlineMs = 5000) {
  const t0 = Date.now();
  while (!pred() && Date.now() - t0 < deadlineMs) {
    await new Promise((r) => setTimeout(r, 15));
  }
}

function seedCrest(stage = 4) {
  const p = get().player!;
  store.setState({
    player: {
      ...p,
      ...placedAt('reavers_crest'),
      hubRoomId: null, stamina: 100, hp: p.hpMax,
      travelTarget: undefined, whisperCourse: null,
      inventory: [
        ...p.inventory.filter((i) => !/Ridge-Sign/.test(i.name)),
        { id: 't_sign', name: "Raider's Ridge-Sign", kind: 'misc', quantity: 1, tags: ['quest'] } as never,
      ],
      activeHunts: [{ id: 'hunt_servants_doubter', stage, tracked: true } as never],
    },
    activeBuildingId: null,
    pendingMissionStinger: null,
    pendingMissionBeat: null,
    missionFleeHoldCell: null,
  });
  // ⚠ The ambient faction raid (maybeSpawnRaid, 30% per peaceful action) is a
  // DIFFERENT fight and not this suite's subject — a war party cresting the
  // rise after the flee is the world staying dangerous, not the arm breaking
  // its promise. Stamp the raid clock so the random roll can't flake the replay.
  setS((s) => ({ worldMemory: { ...s.worldMemory, lastRaidHour: get().player?.hoursElapsed ?? 0 } }));
  setS((s) => (s.currentScene ? {
    currentScene: {
      ...s.currentScene, enemies: [], enemyHps: [], activeEnemyIdx: 0, range: null,
      enemyStatuses: [], enemyKnockedOut: [], enemyAmbushUsed: [],
    },
  } : s));
}

function drainRolls(forcedD20 = 20) {
  let safety = 0;
  while (get().pendingRolls && safety++ < 30) {
    const pr = get().pendingRolls!;
    const step = pr.steps[pr.currentStep];
    if (!step) { get().cancelPendingRolls?.(); break; }
    const count = step.count ?? 1;
    const sides = step.sides ?? 6;
    get().resolveRollStep(Array.from({ length: count }, () => (sides === 20 ? forcedD20 : 1)));
  }
}

const liveEnemies = () => (get().currentScene?.enemies ?? []).filter((_, i) => (get().currentScene?.enemyHps?.[i] ?? 0) > 0);

describe('OTA-1610 — the flee is honored', () => {
  beforeAll(async () => {
    console.log = () => {}; console.warn = () => {}; console.error = () => {};
    await store.getState().hydrate();
    await store.getState().startNewGame({ name: 'Runner', raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
    store.getState().skipTutorial?.();
    await settle(() => !!store.getState().currentScene);
  });

  it('⚠⚠⚠ HIS THREE ATTEMPTS, REPLAYED: flee the Reaver, then INVESTIGATE — and stay fled', async () => {
    seedCrest(4);
    get().advanceHunt('hunt_servants_doubter'); // the apex stands up
    expect(liveEnemies().length).toBeGreaterThanOrEqual(1);
    await get().submitPlayerAction('flee');
    drainRolls(20); // a clean break — the escape roll pays
    await settle(() => liveEnemies().length === 0);
    expect(liveEnemies().length).toBe(0);
    expect(get().missionFleeHoldCell).toEqual(playerGridCell(get().player!)); // the hold is set
    // The exact action from his report — and the fight stays fled.
    await get().submitPlayerAction('investigate the mud');
    await new Promise((r) => setTimeout(r, 50));
    expect(liveEnemies().length).toBe(0);
    const rec = (get().player?.activeHunts ?? []).find((h) => h.id === 'hunt_servants_doubter');
    expect(rec?.stage).toBe(4); // still frozen, still his to finish — later
  });

  it('⚠⚠⚠ the typed FIGHT still summons — deliberate re-engagement is the verb\'s job', () => {
    seedCrest(4);
    store.setState({ missionFleeHoldCell: playerGridCell(get().player!) });
    get().advanceHunt('hunt_servants_doubter'); // the verb door, not the arm
    expect(liveEnemies().length).toBeGreaterThanOrEqual(1);
    expect(get().pendingMissionStinger?.line).toContain('Come, then');
  });

  it('⚠⚠ stepping OFF the cell clears the hold — leave and return, and the tile is the trigger again', () => {
    seedCrest(4);
    store.setState({ missionFleeHoldCell: playerGridCell(get().player!) });
    // On the fled cell: the arm holds.
    armSpawnStagesAtArrival(get as never, setS as never);
    expect(liveEnemies().length).toBe(0);
    // Boots move one tile: the hold clears (and nothing summons off-ground).
    const p = get().player!;
    store.setState({ player: { ...p, ...placedAt('raiders_ridge') } as never });
    armSpawnStagesAtArrival(get as never, setS as never);
    expect(get().missionFleeHoldCell).toBeNull();
    // Back on the crest: arrival is the summons once more.
    const p2 = get().player!;
    store.setState({ player: { ...p2, ...placedAt('reavers_crest') } as never });
    armSpawnStagesAtArrival(get as never, setS as never);
    expect(liveEnemies().length).toBeGreaterThanOrEqual(1);
  });

  it('⚠ the wiring is pinned — the flee site sets the hold, the arm honors it', () => {
    const GS = readFileSync(join(__dirname, '..', 'app', 'state', 'gameStore.ts'), 'utf8');
    expect(GS).toContain('set({ missionFleeHoldCell: playerGridCell(fledPl) });');
    const SA = readFileSync(join(__dirname, '..', 'app', 'state', 'stageArrival.ts'), 'utf8');
    expect(SA).toContain('const hold = get().missionFleeHoldCell;');
    expect(SA).toContain('if (now.x === hold.x && now.y === hold.y) return;');
  });
});
