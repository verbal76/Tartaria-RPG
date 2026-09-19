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

// ⚠⚠⚠ THE PLAYER-SHAPED WALKER, RUN OVER THE WHOLE CATALOGUE.
//
// Owner: *"continue with the new type of walker, make it as close to the way
// a player has to interact as possible."* See test-utils/playerWalker.ts for
// what "the way a player has to interact" means here — the real accept door
// at Halem's gate, SET COURSE and → DESTINATION tile by tile, the arrival
// line's own words typed back, cards answered with their buttons, the hand-in
// at the gate.
//
// ⚠ THIS IS A GATE NOW. The catalogue walked clean on 2026-09-02 after
// OTA-1625 → 1628 (50 missions, 18 faction quests, 21 whisper chains), so the
// env gate came off and the suite runs in the heavy CI set (reported, single
// worker — its name ends in Sim for that reason). Run it by hand the same way:
//
//     npx jest __tests__/playerWalkerSim.test.ts
//     PLAYER_WALKER_ONLY=hunt:hunt_servants_doubter npx jest …   (one mission)
//     PLAYER_WALKER_ONLY=faction | whisper | mystery | storyline   (one family)
//     PLAYER_WALKER_UPTO=whisper:nessa_fungus     (debt #54 — EXACT REPLAY: the
//         ordered prefix up to and including that scenario, so it meets the same
//         world the full run gave it — byte for byte, verified against a full
//         run. ONLY does NOT do this: it walks the same mission against a FRESH
//         world and legitimately takes another path.)
//     TARTARIA_TEST_SEED=0x1234abcd               (debt #54 — base seed override;
//         absent, the harness default 0x74617274 is unchanged)
//     PLAYER_WALKER_REPORT=/path/to/report.txt   (appends one block per mission)
//     PLAYER_WALKER_FEED=1                        (the whole feed on every report)
//     PLAYER_WALKER=0                             (skip it)
//
// Every mission is one `it`; it fails with the list of breaks the player would
// have hit, in the player's terms. A break here is an OTA, not a flake — the
// one intermittent seen so far (a mid-range approach that would not close on
// a road fight) prints the raw log with the debug channel so it can be read.

import { useGameStore, setHomeworkTick } from '../app/state/gameStore';
import { getRaces, getFactions } from '../app/engine/character';
import { ALL_MISSIONS, ALL_FACTION_QUESTS, ALL_WHISPER_CHAINS, playMission, playFactionQuest, playWhisperChain, formatReport, type WalkReport } from '../test-utils/playerWalker';
import { appendFileSync } from 'node:fs';

jest.setTimeout(900000);

const ON = process.env.PLAYER_WALKER !== '0';
const ONLY = process.env.PLAYER_WALKER_ONLY; // "family:id" or a family name
const REPORT = process.env.PLAYER_WALKER_REPORT;

/* ⚠⚠⚠ DEBT #54 — PLAYER_WALKER_UPTO IS THE EXACT REPLAY, AND ONLY IS NOT.
 *
 * `beforeAll` builds ONE world and every `it` inherits what the scenarios before
 * it left behind, so a scenario's walk is a function of its PREFIX, not just of
 * the seed. PLAYER_WALKER_ONLY runs that scenario against a fresh world — a
 * legitimate walk of the same mission, and a different walk from the one that
 * broke. Measured: nessa_fungus camps `1 east` in the full run and `1 west`
 * isolated, under the identical hardcoded seed.
 *
 * UPTO replays the ordered prefix up to and including the target, so the world
 * the target sees is the world it saw. It is the command `replayBlock()` prints.
 * ⚠ The order below must stay the REGISTRATION order of the three families —
 * missions, then faction quests, then whispers — or the prefix is not the
 * prefix. A mistyped target registers its own failing `it` rather than silently
 * walking zero scenarios, because a replay that walks nothing reads as green. */
const UPTO = process.env.PLAYER_WALKER_UPTO;
const ORDER: readonly string[] = [
  ...ALL_MISSIONS.map(({ family, def }) => `${family}:${def.id}`),
  ...ALL_FACTION_QUESTS.map((q) => `faction:${q.id}`),
  ...ALL_WHISPER_CHAINS.map((c) => `whisper:${c.id}`),
];
const UPTO_INDEX = UPTO ? ORDER.indexOf(UPTO) : -1;

function selected(key: string): boolean {
  if (UPTO) return UPTO_INDEX >= 0 && ORDER.indexOf(key) <= UPTO_INDEX;
  if (!ONLY) return true;
  const family = key.slice(0, key.indexOf(':'));
  return ONLY === family || ONLY === key;
}

const store = useGameStore;

// ⚠ DEBT #54 — polls, not milliseconds. See the long note on the same helper in
// test-utils/playerWalker.ts: a wait that gives up on the clock lets the CPU
// decide what the walker does next. Same poll budget, no clock.
const SETTLE_POLL_MS = 15;
async function settle(pred: () => boolean, deadlineMs = 5000) {
  const polls = Math.max(1, Math.ceil(deadlineMs / SETTLE_POLL_MS));
  for (let i = 0; i < polls && !pred(); i++) {
    await new Promise((r) => setTimeout(r, SETTLE_POLL_MS));
  }
}

const picked = ALL_MISSIONS.filter(({ family, def }) => selected(`${family}:${def.id}`));

(ON ? describe : describe.skip)('the player-shaped walker — every mission, from the surfaces', () => {
  const reports: WalkReport[] = [];

  // ⚠ A replay that silently walks NOTHING is worse than a failing replay: it
  // reads as green. If UPTO names a scenario that does not exist, say so.
  if (UPTO) {
    it('the PLAYER_WALKER_UPTO target resolves to a real scenario', () => {
      expect({ target: UPTO, found: UPTO_INDEX >= 0 }).toEqual({ target: UPTO, found: true });
    });
  }

  beforeAll(async () => {
    /* ⚠⚠⚠ DEBT #54 — THE WORLD MUST START FROM THE SEED, NOT FROM THE BYTE LAYOUT.
     *
     * OTA-1831 moved the per-test reseed into a `beforeEach` so a test's dice no
     * longer depended on how many times the loaded modules happened to draw at
     * import. It closed that hole for TESTS. `beforeAll` runs BEFORE any
     * `beforeEach`, so the world built here kept drawing from wherever module
     * import left the cursor — and that position is a function of the source-map
     * shape of the loaded files, which OTA-1831 measured shifting by ~4,000
     * draws on an edit that rolled nothing.
     *
     * ⚠ MEASURED, and it is why this line exists. Replaying `hunt:hunt_bog_dragon`
     * under the identical seed gave 1,250 taps before this pass and 1,180 after
     * three harness files were edited — the same stages, the same grounds, the
     * same cards, a different world underneath them. Two repeats of the same
     * command gave 1,180 and 1,180, so the walk was never flaky; it was ANCHORED
     * TO THE TREE'S BYTES instead of to the seed, which is the thing that makes a
     * replay token worthless the moment anybody edits anything.
     *
     * One line, and the world becomes a function of the seed alone. */
    (globalThis as { __TARTARIA_RESEED_RANDOM__?: () => void }).__TARTARIA_RESEED_RANDOM__?.();
    console.log = () => {}; console.warn = () => {}; console.error = () => {};
    await store.getState().hydrate();
    await store.getState().startNewGame({ name: 'Thumb', raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
    store.getState().skipTutorial?.();
    await settle(() => !!store.getState().currentScene);
    /* ⚠⚠⚠ DEBT #54 — AND THE WORLD MUST NOT ADVANCE ON THE WALL CLOCK EITHER.
     *
     * `hydrate()` installs the homework tick, which arms a 5-second setInterval
     * in gameStore. Over an 18-minute catalogue walk that fires ~200 times, and
     * WHERE each firing lands between two taps is a function of how long the
     * machine took, not of the seed. That is a third input to the walk that no
     * replay token can carry.
     *
     * ⚠ MEASURED, twice, on this tree. Replaying the prefix
     * `PLAYER_WALKER_UPTO=hunt:hunt_servants_doubter` reproduced the full run's
     * FIRST scenario byte for byte and then drifted: mud_titan 785 taps in the
     * full run against 1,060 in the replay. The only structural difference
     * between the two processes is the extra `it` above — so a single short test
     * shifted the interval's phase enough to move ticks across tap boundaries.
     * Suppressing just that `it` made five scenarios byte-identical again, and
     * disarming the interval made the with-`it` and without-`it` runs identical
     * on their own. Two repeats of any one command were always bit-stable, so
     * this was never flakiness — it was the clock leaking into the world.
     *
     * ⚠ NOTHING IS WEAKENED BY THIS. Homework is background progress while the
     * player is idle; this suite asserts mission walks, never homework. The
     * product keeps its timer — this is the same disarm jest.teardown.js already
     * performs through the same exported door, moved to where the walk begins,
     * and the suites that DO test homework drive it by hand through
     * `_homeworkTickForTest()`. No probability, no product code, is touched. */
    setHomeworkTick(null);
    let last = -1;
    await settle(() => {
      const n = store.getState().gameLog.length;
      const stable = n === last;
      last = n;
      return stable;
    }, 10000);
  });

  afterAll(() => {
    const ok = reports.filter((r) => r.outcome === 'complete').length;
    const summary = `\n=== player walker: ${ok}/${reports.length} complete without a break ===\n`;
    if (REPORT) appendFileSync(REPORT, summary);
    process.stdout.write(summary);
  });

  for (const { family, def } of picked) {
    it(`${family}:${def.id} — ${def.title}`, async () => {
      const r = await playMission(family, def);
      reports.push(r);
      const text = formatReport(r);
      if (REPORT) appendFileSync(REPORT, `${text}\n\n`);
      process.stdout.write(`${text}\n`);
      expect(r.breaks).toEqual([]);
    });
  }

  // The fourth family: the 18 staged faction quests, played by their objective sentence.
  const pickedFq = ALL_FACTION_QUESTS.filter((q) => selected(`faction:${q.id}`));
  for (const def of pickedFq) {
    it(`faction:${def.id} — ${def.title}`, async () => {
      const r = await playFactionQuest(def);
      reports.push(r);
      const text = formatReport(r);
      if (REPORT) appendFileSync(REPORT, `${text}\n\n`);
      process.stdout.write(`${text}\n`);
      expect(r.breaks).toEqual([]);
    });
  }

  // The fifth family: the 21 whisper chains, overheard in an outpost room and
  // followed from the WHISPERS panel line — camp, answer, mark, hand-over.
  const pickedWh = ALL_WHISPER_CHAINS.filter((c) => selected(`whisper:${c.id}`));
  for (const chain of pickedWh) {
    it(`whisper:${chain.id} — ${chain.title}`, async () => {
      const r = await playWhisperChain(chain);
      reports.push(r);
      const text = formatReport(r);
      if (REPORT) appendFileSync(REPORT, `${text}\n\n`);
      process.stdout.write(`${text}\n`);
      expect(r.breaks).toEqual([]);
    });
  }
});
