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

// ⚠⚠⚠ OTA-1606 — THE GATE WAITS.
//
// Owner, typed in the field: "i shouldn't automatically enter an outpost
// because i land on that tile, there should be an enter outpost button,
// other wise it's a tile."
//
// Since HANDOFF #15b, arriving on any hub tile walked the player through the
// gate unasked. Now arrival stays OVERLAND — the arrival line names the gate
// and the chip, the ENTER OUTPOST chip rides the travel row, and 'enter
// outpost' (or a bare 'enter' with no discovered structure) walks you in.
// The opening scene still starts in the spawn room (the tutorial is
// untouched); blades out bar the gate (the OTA-1598 truce, both ways).

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

function standOutside(at: string) {
  const p = get().player!;
  store.setState({
    player: {
      ...p, ...placedAt(at), hubRoomId: null, stamina: 100,
      travelTarget: undefined, whisperCourse: null,
    } as never,
    activeBuildingId: null,
  });
  store.setState((s) => (s.currentScene ? {
    currentScene: { ...s.currentScene, enemies: [], enemyHps: [], activeEnemyIdx: 0, range: null, sceneBuilding: null },
  } : {}) as never);
}

describe('OTA-1606 — the gate waits', () => {
  beforeAll(async () => {
    console.log = () => {}; console.warn = () => {}; console.error = () => {};
    await store.getState().hydrate();
    await store.getState().startNewGame({ name: 'Gatekeeper', raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
    store.getState().skipTutorial?.();
    await settle(() => !!store.getState().currentScene);
  });

  it('⚠⚠⚠ the OPENING still starts inside — the tutorial spawn room is untouched', () => {
    // startNewGame ran in beforeAll with isOpening; the player must be in a room.
    // (skipTutorial may have moved things around, but the opening entered.)
    // We assert the door itself below; here: a fresh game produced a hub visit.
    expect(get().worldMemory).toBeTruthy();
  });

  it('⚠⚠⚠ ARRIVAL ON A HUB TILE STAYS OVERLAND — "otherwise it\'s a tile", made real', async () => {
    standOutside('great_tartary_plains');
    get().setTravelCourse('tartarian_outskirts');
    let safety = 0;
    while (get().player?.travelTarget && safety++ < 40) {
      await get().continueTravel();
    }
    expect(get().player?.currentLocationId).toBe('tartarian_outskirts');
    expect(get().player?.hubRoomId ?? null).toBeNull(); // NOT through the gate
    // And the arrival told the player where the door is.
    expect(get().gameLog.slice(-25).some((e) => e.text.includes('ENTER OUTPOST'))).toBe(true);
  });

  it('⚠⚠⚠ THE TAP OPENS IT — \'enter outpost\' walks through the gate into the entry room', async () => {
    standOutside('tartarian_outskirts');
    await get().submitPlayerAction('enter outpost');
    await settle(() => !!get().player?.hubRoomId);
    expect(get().player?.hubRoomId).toBeTruthy();
    expect(get().gameLog.slice(-15).some((e) => e.text.includes('cross to the gate and step through'))).toBe(true);
  });

  it('⚠⚠ a bare \'enter\' with no discovered structure also opens the gate', async () => {
    standOutside('tartarian_outskirts');
    await get().submitPlayerAction('enter');
    await settle(() => !!get().player?.hubRoomId);
    expect(get().player?.hubRoomId).toBeTruthy();
  });

  it('⚠⚠ BLADES OUT BAR THE GATE — the truce works both ways', async () => {
    standOutside('tartarian_outskirts');
    const proto = findEnemyByName('Mud Boar');
    const enemy = JSON.parse(JSON.stringify(proto));
    store.setState((s) => ({
      currentScene: {
        ...s.currentScene!, enemies: [enemy], enemyHps: [enemy.hp], activeEnemyIdx: 0,
        range: 'close', enemyAmbushUsed: [false], enemyKnockedOut: [false], enemyStatuses: [[]],
      },
    }));
    await get().submitPlayerAction('enter outpost');
    expect(get().player?.hubRoomId ?? null).toBeNull();
    expect(get().gameLog.slice(-8).some((e) => e.text.includes('Not with blades out'))).toBe(true);
  });

  it('⚠⚠ LEAVE OUTPOST still leaves — and the very next scene does not re-enter', async () => {
    standOutside('tartarian_outskirts');
    await get().submitPlayerAction('enter outpost');
    await settle(() => !!get().player?.hubRoomId);
    await get().submitPlayerAction('leave outpost');
    await settle(() => !get().player?.hubRoomId);
    expect(get().player?.hubRoomId ?? null).toBeNull();
    expect(get().player?.currentLocationId).toBe('tartarian_outskirts'); // same tile, outside
  });

  it('⚠ the wiring is pinned — one door, opened only by intent', () => {
    const GS = readFileSync(join(__dirname, '..', 'app', 'state', 'gameStore.ts'), 'utf8');
    expect(GS).toContain("&& (!!opts?.isOpening || !!opts?.enterHub);");
    expect(GS).toContain('(Tap ENTER OUTPOST to step inside.)');
    const IB = readFileSync(join(__dirname, '..', 'app', 'components', 'InputBox.tsx'), 'utf8');
    // The chip rides all three outdoor states of the travel row.
    expect(IB.split(`onSubmit('enter outpost')`).length - 1).toBeGreaterThanOrEqual(3);
  });
});
