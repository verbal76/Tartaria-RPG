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
import { walkerControl } from '../test-utils/playerWalker';
import { appendFileSync } from 'node:fs';

// ⚠⚠ FOUR ROADS, EACH ABANDONED AT ROAD_MS — never the test as a whole. Jest's
// own timeout cannot stop a running road; it starts the next test over it, and
// two walkers on one store was the first sweep's five-hunt cascade. The test
// budget is wider than four abandoned roads so jest never gets there first.
const ROAD_MS = 20 * 60_000;
jest.setTimeout(4 * ROAD_MS + 10 * 60_000);

const store = useGameStore;
const REPORT = process.env.PLAYER_WALKER_REPORT;
const ONLY = (process.env.CONTRARY_HUNTS ?? '').split(',').map((s: string) => s.trim()).filter(Boolean);
const reports: ContraryReport[] = [];
const STALL_MS = 15 * 60_000;

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
        // ⚠ The first full sweep lost three 25-minute timeouts to roads that went
        // quiet (0% CPU, nothing written) and left no trace of WHERE. A stalled
        // road now writes the boots' position and the last feed lines to the report
        // while it is still stalled, so the next one can be read.
        const stall = setTimeout(() => {
          const st = store.getState();
          const p = st.player;
          const tail = st.gameLog.slice(-12).map((e) => `  | [${e.channel}] ${(e.text.split('\n')[0] ?? '').slice(0, 160)}`).join('\n');
          const text = `── STALLED · ${h.id} · ${name} ── ${STALL_MS / 60000} minutes without finishing. at=${p?.currentLocationId} map=${p?.mapX},${p?.mapY} room=${p?.hubRoomId ?? '-'} bldg=${st.activeBuildingId ?? '-'} course=${p?.travelTarget?.locationId ?? '-'} confirm=${st.pendingTravelConfirm ? 'yes' : '-'} rolls=${st.pendingRolls ? 'yes' : '-'} enemies=${st.currentScene?.enemies.length ?? 0} screen=${st.currentScreen} modals=${[st.pendingMissionStinger && 'stinger', st.pendingMissionBeat && 'beat', st.pendingTalk && 'talk', st.pendingParley && 'parley', st.pendingPayoff && 'payoff'].filter(Boolean).join(',') || 'none'}\n${tail}`;
          if (REPORT) appendFileSync(REPORT, `${text}\n\n`);
          process.stdout.write(`${text}\n`);
        }, STALL_MS);
        let giveUp: ReturnType<typeof setTimeout> | null = null;
        const deadline = new Promise<'abandoned'>((resolve) => { giveUp = setTimeout(() => resolve('abandoned'), ROAD_MS); });
        walkerControl.abort = false;
        const r = await Promise.race([walk(def).catch((e: unknown) => ({ error: String(e) })), deadline]);
        clearTimeout(stall);
        if (giveUp) clearTimeout(giveUp);
        if (r === 'abandoned') {
          // Flip the token, let the road throw itself out at its next tap, then
          // clear it for the next road. The store is one walker's again.
          walkerControl.abort = true;
          await new Promise((res) => setTimeout(res, 3000));
          walkerControl.abort = false;
          const text = `── ABANDONED · ${h.id} · ${name} ── gave up after ${ROAD_MS / 60000} minutes; the walker was thrown out at its next tap.`;
          if (REPORT) appendFileSync(REPORT, `${text}\n\n`);
          process.stdout.write(`${text}\n`);
          outcomes[name] = ['abandoned after 20 minutes'];
          continue;
        }
        if ('error' in r) {
          const text = `── THREW · ${h.id} · ${name} ── ${r.error}`;
          if (REPORT) appendFileSync(REPORT, `${text}\n\n`);
          process.stdout.write(`${text}\n`);
          outcomes[name] = [`threw: ${r.error}`];
          continue;
        }
        emit(r);
        outcomes[name] = r.finish?.breaks ?? ['no finish'];
      }
      expect(outcomes).toEqual({ obedient: [], premature: [], contrary: [], interrupted: [] });
    });
  }
});
