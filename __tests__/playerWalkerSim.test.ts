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
//     PLAYER_WALKER_UPTO=whisper:nessa_fungus     (debt #54 — THE REPLAY: the
//         ordered prefix up to and including that scenario, so it meets the same
//         world the full run gave it. ONLY does NOT do this: it walks the same
//         mission against a FRESH world and legitimately takes another path.
//         The WORLD it reconstructs is exact — proven by execution in
//         walkerReplaySeed §W — and since debt #173 the WALK is too: the walker
//         runs on a harness clock that advances 1,500 ms per PLAYER ACTION from
//         a fixed origin, so production's elapsed-time gates still fire, still
//         hold and still expire, but measured against walker progress instead of
//         against how fast the box happened to be. Measured through this very
//         command: the prefix that used to give mud_titan 1,122 / 785 / 1,122
//         now gives 1,227 three times, once with every timer delay scaled 2.5x
//         — a run 2.2x longer, walking the same road. walkerReplaySeed §K.)
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

import { ALL_MISSIONS, ALL_FACTION_QUESTS, ALL_WHISPER_CHAINS, playMission, playFactionQuest, playWhisperChain, formatReport, buildWalkerWorld, uninstallWalkerClock, walkerSelection, type WalkReport } from '../test-utils/playerWalker';
import { appendFileSync } from 'node:fs';

jest.setTimeout(900000);

const ON = process.env.PLAYER_WALKER !== '0';
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
 *
 * ⚠⚠ SECOND PASS — THE SELECTION IS NO LONGER SPELLED OUT HERE, ON PURPOSE.
 * The order, the env var names and the prefix arithmetic used to live in this
 * file while `replayBlock()` composed its command from its own private copies
 * of the same strings in another one. Nothing executed the relationship, so
 * renaming the variable this file read would have left every assertion green
 * while the printed command silently ran the whole catalogue. Both halves now
 * come from `walkerSelection()`, which `walkerReplaySeed` §E calls with the env
 * parsed out of a printed replay command — so "the command selects the prefix"
 * is a test that runs rather than two greps that agree. */
const SELECTION = walkerSelection();
const SELECTED = new Set(SELECTION.keys);
const selected = (key: string): boolean => SELECTED.has(key);

const picked = ALL_MISSIONS.filter(({ family, def }) => selected(`${family}:${def.id}`));

(ON ? describe : describe.skip)('the player-shaped walker — every mission, from the surfaces', () => {
  const reports: WalkReport[] = [];

  // ⚠ A replay that silently walks NOTHING is worse than a failing replay: it
  // reads as green. If UPTO names a scenario that does not exist, say so.
  if (SELECTION.mode === 'prefix') {
    it('the PLAYER_WALKER_UPTO target resolves to a real scenario', () => {
      expect({ target: SELECTION.target, found: SELECTION.targetFound })
        .toEqual({ target: SELECTION.target, found: true });
    });
  }

  beforeAll(async () => {
    /* ⚠⚠⚠ DEBT #54 — THE WORLD IS BUILT BY A FUNCTION NOW, NOT BY THIS BLOCK.
     *
     * The three things that make the world reproducible — the re-seed BEFORE a
     * single draw, the homework interval disarmed after hydrate arms it, the two
     * settles counted in polls rather than milliseconds — used to be written out
     * here, which meant `walkerReplaySeed` could only assert them by READING THIS
     * TEXT. Source text cannot answer the question the debt asks: does replaying
     * it produce the same world?
     *
     * `buildWalkerWorld()` is that sequence, call for call, so the regression can
     * execute it — twice, with the RNG cursor shoved 250,000 draws sideways, under
     * a second seed, and once with the re-seed suppressed — and compare the worlds
     * that come back. The long notes on WHY each step is there live with the code,
     * in test-utils/playerWalker.ts. */
    console.log = () => {}; console.warn = () => {}; console.error = () => {};
    await buildWalkerWorld();
  });

  afterAll(() => {
    /* ⚠⚠ DEBT #173 — THE REAL CLOCK COMES BACK FIRST, and before anything that
     * could throw. `afterAll` runs whether the walk finished, broke or timed
     * out, so this is the one place that covers every failure path; leaving a
     * patched `Date.now` behind would hand the next suite in this worker a
     * clock that never moves. */
    uninstallWalkerClock();
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
