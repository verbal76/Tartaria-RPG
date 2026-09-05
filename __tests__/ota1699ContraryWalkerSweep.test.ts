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

/**
 * OTA-1699 — EVERY HUNT WALKS THE FOUR ROADS (task #197, step 3 of the
 * Narrative Agency plan). The contrary walker's roadmap is read from each hunt
 * definition (huntRoadmap / huntNouns), so all eighteen hunts walk obedient,
 * premature, contrary and interrupted. This is a SWEEP — heavy CI, not the fast
 * run — and its one hard assertion per road is HANDLED: the hunt still finishes
 * with no break after every deviation. Every other grade is reported, and every
 * "no" is a line on the punch list (afterAll) that becomes a task.
 *
 *   PLAYER_WALKER_REPORT=/path   appends every report + the punch list
 *   CONTRARY_HUNTS=a,b            walk only these hunt ids
 */
import { useGameStore } from '../app/state/gameStore';
import { getRaces, getFactions } from '../app/engine/character';
import { HUNTS } from '../app/engine/hunts';
import { walkObedient, walkPremature, walkContrary, walkInterrupted, formatContrary, punchList, huntRoadmap, type ContraryReport, type MissionLike } from '../test-utils/contraryWalker';
import { appendFileSync } from 'node:fs';

jest.setTimeout(1_500_000);

const store = useGameStore;
const REPORT = process.env.PLAYER_WALKER_REPORT;
const ONLY = (process.env.CONTRARY_HUNTS ?? '').split(',').map((s: string) => s.trim()).filter(Boolean);
const reports: ContraryReport[] = [];

async function settle(pred: () => boolean, deadlineMs = 5000) {
  const t0 = Date.now();
  while (!pred() && Date.now() - t0 < deadlineMs) await new Promise((r) => setTimeout(r, 15));
}

function emit(r: ContraryReport) {
  reports.push(r);
  const text = formatContrary(r);
  if (REPORT) appendFileSync(REPORT, `${text}\n\n`);
  process.stdout.write(`${text}\n`);
}

describe('OTA-1699 — the roadmap is readable for every hunt', () => {
  it('every hunt has an apex, a first ask at stage 0, and an abandon point before the apex', () => {
    for (const h of HUNTS) {
      const m = huntRoadmap(h as unknown as MissionLike);
      expect({ id: h.id, apex: m.apex, firstAsk: m.firstAsk }).toEqual({ id: h.id, apex: h.stages.length - 1, firstAsk: 0 });
      expect(m.abandonAt).toBeGreaterThan(0);
      expect(m.abandonAt).toBeLessThan(m.apex);
      expect(m.apexName.endsWith(' (hunted)')).toBe(true);
    }
  });
});

describe('OTA-1699 — the contrary walker on every hunt', () => {
  beforeAll(async () => {
    console.log = () => {}; console.warn = () => {}; console.error = () => {};
    await store.getState().hydrate();
    await store.getState().startNewGame({ name: 'Contrary', raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
    store.getState().skipTutorial?.();
    await settle(() => !!store.getState().currentScene);
    let last = -1;
    await settle(() => { const n = store.getState().gameLog.length; const stable = n === last; last = n; return stable; }, 10000);
  });

  afterAll(() => {
    const list = punchList(reports);
    const text = `\n=== punch list (${list.length}) ===\n${list.map((l) => `  - ${l}`).join('\n')}\n`;
    if (REPORT) appendFileSync(REPORT, text);
    process.stdout.write(text);
  });

  for (const h of HUNTS) {
    if (ONLY.length && !ONLY.includes(h.id)) continue;
    const def = h as unknown as MissionLike;
    it(`⚠⚠ ${h.id} — four roads, every one finishes`, async () => {
      const outcomes: Record<string, string[]> = {};
      for (const [name, walk] of [['obedient', walkObedient], ['premature', walkPremature], ['contrary', walkContrary], ['interrupted', walkInterrupted]] as const) {
        const r = await walk(def);
        emit(r);
        outcomes[name] = r.finish?.breaks ?? ['no finish'];
      }
      expect(outcomes).toEqual({ obedient: [], premature: [], contrary: [], interrupted: [] });
    });
  }
});
