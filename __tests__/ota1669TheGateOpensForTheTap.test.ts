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

// OTA-1669 — THE GATE OPENS FOR THE TAP.
//
// Owner: *"I still can't enter an outpost and I don't know if it's a legitimate
// reason. I've pushed a log that has that in there."*
//
// ⚠⚠⚠ IT WAS NOT A LEGITIMATE REASON, AND HIS LOG SAID SO IN FIVE LINES:
//
//     [17:41:38.939] ui: tap "ENTER OUTPOST"
//     [17:41:38.940] [player] enter outpost
//     [17:41:38.940] [world] You cross to the gate and step through.
//     [17:41:38.941] scene: loc=pilgrim_waycamp hub=- arrival=n opening=n passing=y
//     [17:41:38.970] [world] You are at Tartarian Pilgrim Camp …   ← still outside
//
// — eight taps in thirteen seconds, because the line said it worked.
//
// ⚠⚠ `passing=y` IS THE WHOLE DIAGNOSIS. He had a course plotted to somewhere
// else (the mission trace on the very next line reads `travelTo=mud_seas`), so
// `passingThrough` was true, and `freshOutpostVisit` — which required
// `!passingThrough` — went false. The gate never opened.
//
// ⚠ THE GUARD WAS RIGHT WHEN IT WAS WRITTEN AND WAS ORPHANED BY OTA-1606. It
// existed so a multi-tile auto-travel would not dump the player inside every
// outpost it crossed — back when ARRIVAL opened the gate by itself. OTA-1606
// deleted that on the owner's own instruction ("i shouldn't automatically enter
// an outpost because i land on that tile, there should be an enter outpost
// button"). From that commit onward the only ways in are `enterHub` (the chip
// and the typed verb) and `isOpening` (the tutorial spawn) — both already
// required. So the guard stopped protecting anything and its only surviving
// effect was to block the deliberate act it was never aimed at.
//
// ⚠⚠⚠ AND THE SECOND HALF IS THE ONE THAT COST HIM THE EVENING. The verb printed
// "You cross to the gate and step through." BEFORE calling beginScene, and never
// looked at whether it worked. A player who reads a confirmation and does not
// move does not conclude "refused" — he concludes the button is broken, and taps
// it again. This is the claims-success-without-checking class, sitting on the
// one control that moves you between the two halves of the game.

import { readFileSync } from 'fs';
import { join } from 'path';
import { useGameStore } from '../app/state/gameStore';
import { isHubLocation } from '../app/engine/hub';
import { placedAt } from '../test-utils/placePlayer';

const ROOT = join(__dirname, '..');
const code = (s: string): string => s
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');
const STORE = code(readFileSync(join(ROOT, 'app', 'state', 'gameStore.ts'), 'utf8'));

/** Stand the player at a hub gate, exactly as he stood: on the anchor cell of a
 *  hub location, outside, with a live course to somewhere else. */
async function standAtGateWithACourse(opts: { withCourse: boolean }) {
  const store = useGameStore;
  await store.getState().hydrate();
  await store.getState().startNewGame({
    name: 'Verbal', raceId: 'mud_golem', factionId: 'eternal_dynasty',
  });
  store.getState().skipTutorial?.();
  // ⚠ The gate stands on the ANCHOR cell (OTA-1611), and `placedAt` derives that
  // cell rather than letting this fixture invent one — the OTA-1484 rule. A
  // first draft hand-typed coordinates, guessed wrong, and both entry tests
  // failed for a reason that had nothing to do with the defect under test.
  const place = () => placedAt('pilgrim_waycamp');
  store.setState((s) => (s.player ? {
    player: {
      ...s.player,
      ...place(),
      hubRoomId: null,
      // The real shape (engine/types PlayerCharacter.travelTarget) — a made-up
      // one typed `as never` collapsed the setState union and cost a gate.
      travelTarget: opts.withCourse
        ? { locationId: 'mud_seas', distanceRemaining: 3 }
        : undefined,
    },
  } : s));
  store.getState().beginScene({});
  // Back on the anchor, outside, and with nothing alive in front of him — the
  // truce refusal ("not with blades out") is a DIFFERENT and correct gate, and
  // a fixture that tripped it would prove nothing about this one.
  store.setState((s) => (s.player ? {
    player: { ...s.player, ...place(), hubRoomId: null },
    currentScene: s.currentScene ? { ...s.currentScene, enemies: [], enemyHps: [] } : s.currentScene,
    pendingRolls: null,
  } : s));
  return store;
}

describe('OTA-1669 — ⚠⚠⚠ a plotted course does not bar the gate', () => {
  it('the tile really is a hub — this test is not proving the wrong thing', () => {
    // If pilgrim_waycamp stopped being an outpost, every assertion below would
    // pass vacuously while the defect walked free.
    expect(isHubLocation('pilgrim_waycamp')).toBe(true);
  });

  it('⚠⚠⚠ ENTER OUTPOST works WITH a course set — his exact situation', async () => {
    const store = await standAtGateWithACourse({ withCourse: true });
    expect(store.getState().player?.travelTarget?.locationId).toBe('mud_seas');
    expect(store.getState().player?.hubRoomId).toBeFalsy();
    await store.getState().submitPlayerAction('enter outpost');
    expect(store.getState().player?.hubRoomId).toBeTruthy();
  });

  it('⚠ and the course SURVIVES the visit — entering is not cancelling', async () => {
    // Having somewhere to be is not a reason you cannot walk through a door you
    // are standing at, and walking through it must not throw away the plan.
    const store = await standAtGateWithACourse({ withCourse: true });
    await store.getState().submitPlayerAction('enter outpost');
    expect(store.getState().player?.travelTarget?.locationId).toBe('mud_seas');
  });

  it('it still works with no course at all (the path that was never broken)', async () => {
    const store = await standAtGateWithACourse({ withCourse: false });
    await store.getState().submitPlayerAction('enter outpost');
    expect(store.getState().player?.hubRoomId).toBeTruthy();
  });

  it('⚠⚠ the orphaned guard is gone from the predicate', () => {
    // Stated against the code as well as the behaviour: the behaviour test above
    // would also pass if someone "fixed" this by making passingThrough always
    // false, which would silently restore auto-entry on arrival — the thing
    // OTA-1606 was asked to remove.
    const pred = STORE.slice(
      STORE.indexOf('const freshOutpostVisit'),
      STORE.indexOf(';', STORE.indexOf('const freshOutpostVisit')),
    );
    expect(pred).not.toContain('passingThrough');
    // ⚠ AND THE TWO REAL DOORS ARE STILL THE ONLY DOORS. Arrival must not open
    // the gate by itself; that is the OTA-1606 ruling and this OTA must not
    // undo it while fixing the tap.
    expect(pred).toContain('opts?.isOpening');
    expect(pred).toContain('opts?.enterHub');
  });
});

describe('OTA-1669 — ⚠⚠⚠ the verb stops claiming a success it did not get', () => {
  it('⚠⚠ the walk-through is narrated where the entry is DECIDED, not by the verb', () => {
    // ⚠ MY FIRST FIX WAS WRONG IN THE OTHER DIRECTION, and ota970 #112 caught it.
    // Printing the line after beginScene made it honest but put it AFTER the
    // room's "Paths:" listing — the player read the room they were standing in
    // before being told they had walked through the door. So the line moved
    // inside the freshOutpostVisit branch: it cannot outrun the entry (it is
    // inside the branch that performs it) and cannot trail the scene (it is
    // emitted before the scene body paints).
    const branch = STORE.slice(
      STORE.indexOf('if (freshOutpostVisit) {'),
      STORE.indexOf('const hubRoom = inHub'),
    );
    expect(branch).toContain('cross to the gate and step through');
    // ⚠ Gated on enterHub, so the tutorial's opening spawn — which starts you
    // inside the room, never at a gate — does not narrate a walk nobody took.
    expect(branch).toContain('if (opts?.enterHub)');
    // And the verb no longer says it at all.
    const verb = STORE.slice(STORE.indexOf("get().beginScene({ enterHub: true })"), );
    expect(verb.slice(0, 700)).not.toContain('cross to the gate and step through');
    expect(verb.slice(0, 700)).toContain('const wentIn = !!get().player?.hubRoomId;');
  });

  it('⚠⚠ and a refusal SPEAKS — B15, on the button that matters most', async () => {
    // Drive the failure path directly: standing at the gate of a location that
    // is NOT a hub, the entry cannot take. What the player must never get is
    // silence, and must never get a confirmation.
    const store = useGameStore;
    await store.getState().hydrate();
    await store.getState().startNewGame({
      name: 'Verbal', raceId: 'mud_golem', factionId: 'eternal_dynasty',
    });
    store.getState().skipTutorial?.();
    const before = store.getState().gameLog.length;
    await store.getState().submitPlayerAction('enter outpost');
    const said = store.getState().gameLog.slice(before).map((l) => l.text).join('\n');
    expect(said.length).toBeGreaterThan(0);
    // Whatever it says, it must not be the confirmation, because he did not move.
    if (!store.getState().player?.hubRoomId) {
      expect(said).not.toContain('cross to the gate and step through');
    }
  });
});
