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

// ⚠⚠⚠ OTA-1619 — THE GATE COMES BACK WHEN YOU DO.
//
// Owner: *"there's definitely something going on with travel now."* And, typed
// into the feed mid-session at 00:34:02, his own diagnosis: *"so when I landed
// on this outpost tile that has the inner Outpost button — something you pushed
// I think at like 1612 OTA — it looks like that now kills an auto route if
// you're in one when you hit those tiles."*
//
// ⚠⚠ HE WAS RIGHT ABOUT THE TILE AND CLOSE ON THE OTA — it was OTA-1606, which
// stopped hub tiles from auto-entering their interior. That swap had been hiding
// a much older bug. From his 4.32.11 log, 00:38:31 onward:
//
//   [world] You set course for The Buried Cities. 2 tiles…
//   [world] You walk east… The Buried Cities lies further east — 1 tile
//   [ui]    tap "→ THE BURIED CITIES"
//   [world] You walk east… The Storm's Eye lies further east — 6 tiles
//
// Six tiles to The Storm's Eye is the reading FROM the Buried Cities cell. He
// was standing on the outpost — and the game said "open silt". No arrival line,
// no scene, no gate, no ENTER OUTPOST, and the mission whose stage anchors there
// never spoke. The night before, that same silence is what he reported as
// *"I also can't leave the tile."*
//
// ⚠ ONE CLAUSE, IN TWO PLACES. `stepDirection` computed arrival as "the new cell
// is a named location's canon cell AND that id isn't the one I'm already at" —
// but `currentLocationId` STICKS as you walk a location's open ground, so
// stepping back onto its anchor compared equal and produced nothing. arb103 had
// already found and written down exactly this ("ARRIVAL is standing on the
// target's canon cell, NOT currentLocationId equals the target") and fixed
// setTravelCourse and continueTravel with it — leaving the STEP, which is the
// path all of those courses actually walk on.

import { useGameStore } from '../app/state/gameStore';
import { getRaces, getFactions } from '../app/engine/character';
import { canonicalCellOf } from '../app/engine/worldMap';
import { placedAt } from '../test-utils/placePlayer';
import { readFileSync } from 'fs';
import { join } from 'path';

jest.setTimeout(180000);

const store = useGameStore;
const get = () => store.getState();
const src = (...p: string[]) => readFileSync(join(__dirname, '..', ...p), 'utf8');

async function settle(pred: () => boolean, deadlineMs = 5000) {
  const t0 = Date.now();
  while (!pred() && Date.now() - t0 < deadlineMs) {
    await new Promise((r) => setTimeout(r, 15));
  }
}

/** Standing on a named location's own canon cell, overland, blades down. */
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

const tail = (n = 30) => get().gameLog.slice(-n).map((e) => e.text);
// ⚠ HIS tile, and measured: The Buried Cities has open ground on all four sides
// two cells deep (canonicalLocationAtCell is null at ±1 and ±2 on both axes). A
// first draft used tartarian_outskirts, which has Raider's Ridge ONE cell east —
// so "step off into open ground" stepped onto a neighbour and the id changed for
// the wrong reason. The fixture must reproduce the id STICKING, or it proves nothing.
const OUTPOST = 'buried_cities';

describe('OTA-1619 — the step arrives on the cell, not on a change of id', () => {
  beforeAll(async () => {
    console.log = () => {}; console.warn = () => {}; console.error = () => {};
    await store.getState().hydrate();
    await store.getState().startNewGame({ name: 'Wayfarer', raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
    store.getState().skipTutorial?.();
    await settle(() => !!store.getState().currentScene);
  });

  it('⚠⚠⚠ HIS SEQUENCE: step off the outpost tile and back, and the gate is there again', async () => {
    standOutside(OUTPOST);
    const cell = canonicalCellOf(OUTPOST);
    // One step east into open ground — the location id deliberately sticks.
    await get().stepDirection('east');
    expect(get().player?.currentLocationId).toBe(OUTPOST);
    expect(get().player?.gridX).toBe(cell.x + 1);
    // …and one step back west, onto the outpost's own cell.
    const before = get().gameLog.length;
    await get().stepDirection('west');
    await settle(() => get().gameLog.length > before + 1);
    expect(get().player?.gridX).toBe(cell.x);
    expect(get().player?.gridY).toBe(cell.y);
    // THE LINE HE NEVER GOT. Before this OTA the feed said "open silt" here.
    expect(tail(40).some((t) => t.includes('You arrive at'))).toBe(true);
    // And the door OTA-1606 promised is on offer again.
    expect(tail(40).some((t) => t.includes('ENTER OUTPOST'))).toBe(true);
  });

  it('⚠⚠⚠ A COURSE BACK TO THE GROUND YOU ARE ON COMPLETES — the auto-route is not killed', async () => {
    standOutside(OUTPOST);
    // Walk two tiles off, exactly as a detour would, then course back.
    await get().stepDirection('east');
    await get().stepDirection('east');
    expect(get().player?.currentLocationId).toBe(OUTPOST); // the id stuck
    get().setTravelCourse(OUTPOST);
    let safety = 0;
    while (get().player?.travelTarget && safety++ < 20) {
      await get().continueTravel();
    }
    const cell = canonicalCellOf(OUTPOST);
    expect(get().player?.gridX).toBe(cell.x);
    expect(get().player?.gridY).toBe(cell.y);
    // The course is spent, not stranded — the travel row goes away because the
    // walk ENDED, which is the half his log never reached.
    expect(get().player?.travelTarget ?? null).toBeNull();
    expect(tail(40).some((t) => t.includes('You arrive at'))).toBe(true);
  });

  it('⚠⚠ open ground is still open ground — a step that lands nowhere named says nothing', async () => {
    standOutside(OUTPOST);
    await get().stepDirection('east');
    const before = get().gameLog.length;
    await get().stepDirection('east'); // two tiles out; no named cell here
    const said = get().gameLog.slice(before).map((e) => e.text);
    expect(said.some((t) => t.includes('You arrive at'))).toBe(false);
  });

  it('⚠⚠ the two id comparisons are gone — removing one without the other changes nothing', () => {
    // Both halves gated the SAME fact: the predicate that builds `landedOn`, and
    // the branch that acts on it. This is a source pin because the defect is the
    // presence of the clause, not a value any fixture can produce.
    const GS = src('app', 'state', 'gameStore.ts');
    expect(GS).toContain('const arrival = canonHere && !isGridEventMarker ? canonHere : null;');
    expect(GS).not.toContain('canonHere.locationId !== player.currentLocationId');
    expect(GS).not.toContain('step.landedOn && step.landedOn.locationId !== player.currentLocationId');
    expect(GS).toContain('if (step.landedOn) {');
  });

  it('⚠ a grid-event marker cell is still NOT a place you arrive at', () => {
    // Whisper / contract "?" objectives are canonized at their tile so a course
    // can reach them, but they are not scenes. That exclusion is the one thing
    // the old predicate got right and this OTA keeps.
    const GS = src('app', 'state', 'gameStore.ts');
    expect(GS).toContain('const isGridEventMarker = !!canonHere');
    expect(GS).toContain('!isGridEventMarker');
  });

  it('⚠ re-arriving cannot farm the travel milestone — arb118 already guards it', () => {
    // Walking a tile out and back now counts as an arrival, so the milestone
    // gate matters: only a FIRST arrival at a place advances the counter.
    const GS = src('app', 'state', 'gameStore.ts');
    expect(GS).toContain('const firstArrival = !((get().worldMemory?.discoveredLocationIds ?? []).includes(locationId));');
    expect(GS).toContain('const newTravels = firstArrival ? prevMs.travelsCompleted + 1 : prevMs.travelsCompleted;');
  });
});
