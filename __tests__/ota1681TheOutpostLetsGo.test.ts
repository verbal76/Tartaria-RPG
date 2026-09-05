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
 * OTA-1681 — THE OUTPOST LETS GO (task #191).
 *
 * Three notations from the owner's 09-04 log, one root between two of them.
 *
 *   19:37  he tapped ENTER OUTPOST at Giant-Watch Shrine with a course plotted
 *          to the Mud Seas, walked into Tomb Vigil's entry room — and the travel
 *          row showed "→ MUD SEAS · STOP TRAVEL", not the rooms and EXIT: "I can
 *          only go to the very first room and then my only other options are go
 *          back to my auto route."
 *   19:39  he tapped → MUD SEAS from inside, walked east through open silt, and
 *          the minimap kept drawing the outpost: "my mini-map still shows me
 *          stuck in the outpost even though I'm not." Still true at 22:05.
 *
 * Root: since OTA-1669 the gate opens with a course still plotted, and two
 * things had never learned that. InputBox let the travel-row branch win over
 * the room row whenever a course existed, and continueTravel never dropped
 * `hubRoomId` on the way out — beginScene only drops it when the LOCATION
 * changes, and a step inside the same location's grid never does. OTA-993 put
 * "a course begins outside" at setTravelCourse and OTA-1595 at the whisper
 * course; this is the third door, same clear, same line.
 *
 * The 17:42 notation (ENTER OUTPOST at Tartarian Pilgrim Camp stepping into
 * nothing, six taps) was on OTA-1668 and is exactly what OTA-1669 fixed the
 * same evening; pinned here so the three stay accounted for.
 *
 * The owner's design, made real: landing never auto-enters (1606); ENTER gives
 * the whole outpost (rooms + EXIT, whatever course is plotted); EXIT puts you
 * back on the tile with the course intact, and the travel row returns.
 */

import { useGameStore } from '../app/state/gameStore';
import { getRaces, getFactions } from '../app/engine/character';
import { hubEntryRoomId } from '../app/engine/hub';
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

/**
 * A step can land on a new tile whose scene resets the log, so "was the line
 * said" is measured at appendLog itself rather than by reading the log after.
 */
async function linesSaidDuring(run: () => void | Promise<void>): Promise<string[]> {
  const said: string[] = [];
  const orig = get().appendLog;
  store.setState({
    appendLog: ((kind: never, text: string, ...rest: never[]) => {
      said.push(text);
      return (orig as (...a: unknown[]) => unknown)(kind, text, ...rest);
    }) as never,
  } as never);
  try {
    await run();
  } finally {
    store.setState({ appendLog: orig } as never);
  }
  return said;
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

describe('OTA-1681 — the outpost lets go', () => {
  beforeAll(async () => {
    console.log = () => {}; console.warn = () => {}; console.error = () => {};
    await store.getState().hydrate();
    await store.getState().startNewGame({ name: 'Wayfarer', raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
    store.getState().skipTutorial?.();
    await settle(() => !!store.getState().currentScene);
  });

  it('⚠⚠⚠ the gate opens with a course plotted, and the course survives the visit (OTA-1669 holds)', async () => {
    standOutside('tartarian_outskirts');
    get().setTravelCourse('great_tartary_plains');
    expect(get().player?.travelTarget?.locationId).toBe('great_tartary_plains');
    await get().submitPlayerAction('enter outpost');
    await settle(() => !!get().player?.hubRoomId);
    expect(get().player?.hubRoomId).toBeTruthy();
    expect(get().player?.travelTarget?.locationId).toBe('great_tartary_plains');
  });

  it('⚠⚠⚠ CONTINUING THE COURSE FROM INSIDE STEPS OUT FIRST — the room is dropped and the player is told', async () => {
    standOutside('tartarian_outskirts');
    get().setTravelCourse('great_tartary_plains');
    // As after the tap above: inside the entry room with the course still plotted.
    store.setState((s) => ({ player: { ...s.player!, hubRoomId: hubEntryRoomId() } } as never));
    expect(get().player?.hubRoomId).toBeTruthy();
    const said = await linesSaidDuring(() => get().continueTravel());
    expect(get().player?.hubRoomId ?? null).toBeNull();
    expect(said.some((t) => t.includes('You step out under open sky'))).toBe(true);
    // The step was taken — the course is being walked, not cancelled.
    expect(get().player?.travelTarget?.locationId).toBe('great_tartary_plains');
  });

  it('⚠⚠ a building interior lets go the same way', async () => {
    standOutside('tartarian_outskirts');
    get().setTravelCourse('great_tartary_plains');
    store.setState({ activeBuildingId: 'any_building' } as never);
    await get().continueTravel();
    expect(get().activeBuildingId ?? null).toBeNull();
  });

  it('outside, with no room to drop, the step is silent about doors', async () => {
    standOutside('tartarian_outskirts');
    get().setTravelCourse('great_tartary_plains');
    const said = await linesSaidDuring(() => get().continueTravel());
    expect(said.some((t) => t.includes('You step out under open sky'))).toBe(false);
  });
});

describe('OTA-1681 — source claims', () => {
  const ROOT = join(__dirname, '..');
  const STORE = readFileSync(join(ROOT, 'app', 'state', 'gameStore.ts'), 'utf8');
  const UI = readFileSync(join(ROOT, 'app', 'components', 'InputBox.tsx'), 'utf8');

  it('⚠⚠ continueTravel carries the same choke-point clear as the two course setters — three doors, one rule', () => {
    const at = STORE.indexOf('  continueTravel() {');
    const body = STORE.slice(at, STORE.indexOf('const targetId = player.travelTarget.locationId;', at));
    expect(body.includes('if (player.hubRoomId || get().activeBuildingId) {')).toBe(true);
    expect(body.includes("get().appendLog('world', 'You step out under open sky and take your bearings.');")).toBe(true);
    expect((STORE.match(/You step out under open sky and take your bearings\./g) ?? []).length).toBe(3);
  });

  it('⚠⚠ inside an outpost the room row wins, whatever course is plotted', () => {
    expect(UI.includes(') : travelTargetName && !hubRoom ? (')).toBe(true);
    expect(UI.includes(') : travelTargetName ? (')).toBe(false);
    // And the room branch still carries EXIT.
    const roomBranch = UI.slice(UI.indexOf(') : hubRoom ? ('), UI.indexOf(') : sceneBuilding ? ('));
    expect(roomBranch.includes("onSubmit('leave outpost')")).toBe(true);
  });

  it('the gate chip and the gate itself decide on ONE predicate — the 17:42 notation cannot recur as a disagreement', () => {
    expect(STORE.includes('const inHub = isHubLocation(location.id);')).toBe(true);
    expect(UI.includes('const onHubTileOutside = !hubRoomId && !activeBuildingId && onAnchorTile && isHubLocation(hubLocationId);')).toBe(true);
    // And OTA-1669's fix — the passing-through guard is gone from the entry decision.
    expect(STORE.includes('const freshOutpostVisit = inHub && !hubRoomId && !opts?.skipHubEntry')).toBe(true);
    expect(/freshOutpostVisit = [^\n]*passingThrough/.test(STORE)).toBe(false);
  });
});
