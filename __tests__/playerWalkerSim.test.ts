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
//     PLAYER_WALKER_REPORT=/path/to/report.txt   (appends one block per mission)
//     PLAYER_WALKER_FEED=1                        (the whole feed on every report)
//     PLAYER_WALKER=0                             (skip it)
//
// Every mission is one `it`; it fails with the list of breaks the player would
// have hit, in the player's terms. A break here is an OTA, not a flake — the
// one intermittent seen so far (a mid-range approach that would not close on
// a road fight) prints the raw log with the debug channel so it can be read.

import { useGameStore } from '../app/state/gameStore';
import { getRaces, getFactions } from '../app/engine/character';
import { ALL_MISSIONS, ALL_FACTION_QUESTS, ALL_WHISPER_CHAINS, playMission, playFactionQuest, playWhisperChain, formatReport, type WalkReport } from '../test-utils/playerWalker';
import { appendFileSync } from 'node:fs';

jest.setTimeout(900000);

const ON = process.env.PLAYER_WALKER !== '0';
const ONLY = process.env.PLAYER_WALKER_ONLY; // "family:id" or a family name
const REPORT = process.env.PLAYER_WALKER_REPORT;

const store = useGameStore;

async function settle(pred: () => boolean, deadlineMs = 5000) {
  const t0 = Date.now();
  while (!pred() && Date.now() - t0 < deadlineMs) {
    await new Promise((r) => setTimeout(r, 15));
  }
}

const picked = ALL_MISSIONS.filter(({ family, def }) => {
  if (!ONLY) return true;
  return ONLY === family || ONLY === `${family}:${def.id}`;
});

(ON ? describe : describe.skip)('the player-shaped walker — every mission, from the surfaces', () => {
  const reports: WalkReport[] = [];

  beforeAll(async () => {
    console.log = () => {}; console.warn = () => {}; console.error = () => {};
    await store.getState().hydrate();
    await store.getState().startNewGame({ name: 'Thumb', raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
    store.getState().skipTutorial?.();
    await settle(() => !!store.getState().currentScene);
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
  const pickedFq = ALL_FACTION_QUESTS.filter((q) => !ONLY || ONLY === 'faction' || ONLY === `faction:${q.id}`);
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
  const pickedWh = ALL_WHISPER_CHAINS.filter((c) => !ONLY || ONLY === 'whisper' || ONLY === `whisper:${c.id}`);
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
