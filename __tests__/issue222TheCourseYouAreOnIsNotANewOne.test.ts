// ISSUE #222 — LIVE CONTRADICTORY EVIDENCE, PHASES A-F.
//
// The owner's original report ("why did I have to accept the mission again")
// was investigated once already: the WhisperTalkSheet ACCEPT door cannot
// literally re-fire on an already-progressed record (proven — see the A-H
// matrix delivered earlier). Live device evidence then supplied the missing
// half: Jaffar was already mid-fetch on Tolvek's Quiver Rat contract, and
// BOTH the exploration travel row ("→ THE QUIVER RAT") and Tolvek's own bar
// ("TOLVEK — WHAT HE SAID" → AUTO ROUTE) remained live and pressable — by
// design, per OTA-1549/OTA-465, so the player can keep navigating a fetch leg
// across every stage transition without losing the thread. Neither of those
// doors can literally re-accept the mission (traced: the accept button only
// renders at stage 'met_yulka', and neither door ever calls handleWhisperAccept
// or writes WhisperRecord.stage). But `setWhisperCourse` — the action BOTH
// doors call — printed "You set out toward X" and overwrote player.whisperCourse
// UNCONDITIONALLY, even when that exact course was already armed. A player who
// had never lost an inch of progress watched the game announce a fresh
// departure for a mission already under way. That is hypothesis I: a
// presentation/re-entry defect, not a state regression, and it fully explains
// the report.
//
// This suite drives the REAL production door — useGameStore's own
// setWhisperCourse/continueWhisperCourse/handBackWhisperGoods/
// submitPlayerAction, on a real booted player with Tolvek's real chain data —
// through the exact live sequence: accepted, fetch under way, re-pressed
// AUTO ROUTE/SET COURSE repeatedly, and driven all the way to a single payout.
//
// ⚠ "You set out toward X" can land MERGED into a prior world-channel entry
// (gameStore's own 500ms same-channel debounce joins them with a paragraph
// break — see appendLog), so presence is checked as a SUBSTRING over the
// whole log, never as one entry's own text.
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
jest.mock('expo-av', () => ({
  Audio: { setAudioModeAsync: jest.fn(), Sound: class { static createAsync: any = jest.fn(async () => ({ sound: { playAsync: jest.fn(), unloadAsync: jest.fn() } })); } },
}));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '0', applicationId: 'test' }));
jest.mock('expo-asset', () => ({ Asset: { fromModule: () => ({ downloadAsync: jest.fn(async () => {}), localUri: '' }) } }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => {}) }));
jest.mock('expo-constants', () => ({ default: { expoConfig: {} } }));
jest.mock('expo-font', () => ({ loadAsync: jest.fn(async () => {}) }));
jest.mock('expo-speech-recognition', () => ({}));
jest.mock('expo-updates', () => ({}));

import { useGameStore } from '../app/state/gameStore';
import { getRaces, getFactions } from '../app/engine/character';
import { whisperRouteTarget, isSameWhisperCourse } from '../app/engine/whispers';
import type { WhisperRecord } from '../app/engine/types';

jest.setTimeout(30000);

async function bootJaffar(name: string) {
  const store = useGameStore;
  await store.getState().hydrate();
  await store.getState().startNewGame({ name, raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
  store.getState().skipTutorial?.();
  return store;
}

/** Tolvek's own record, already accepted and under way — the LIVE state the
 *  owner described: "already progressing the Quiver Rat objective." Ten
 *  tiles out (not the authored 2-3) so a handful of AUTO ROUTE presses in one
 *  test can be counted without accidentally walking all the way there. */
function tolvekFetchRecord(p0: { mapX?: number; mapY?: number; currentLocationId: string }): WhisperRecord {
  return {
    id: 'tolvek_bolts',
    stage: 'fetch_in_progress',
    plantedAtHour: 0,
    targetMapX: p0.mapX ?? 0,
    targetMapY: p0.mapY ?? 0,
    targetLocationId: p0.currentLocationId,
    ctx: { thiefMapX: (p0.mapX ?? 0) - 10, thiefMapY: p0.mapY ?? 0 },
  };
}

/** Occurrences of the departure line anywhere in the log — an entry landing
 *  within the store's own 500ms same-channel debounce merges into a prior
 *  world entry's text rather than becoming its own, so this counts the
 *  substring across the whole transcript, not matching entries. */
const departureCount = (store: typeof useGameStore) =>
  store.getState().gameLog.map((l) => l.text).join('\n').split('You set out toward').length - 1;

beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

describe('ISSUE #222 — re-pressing AUTO ROUTE / SET COURSE on an already-armed Quiver Rat', () => {
  it('A. the FIRST press of SET COURSE legitimately announces the departure', async () => {
    const store = await bootJaffar('JaffarA');
    const p0 = store.getState().player!;
    store.setState({ player: { ...p0, whisperCourse: null, travelTarget: undefined, activeWhispers: [tolvekFetchRecord(p0)] } });
    const rec = store.getState().player!.activeWhispers!.find((w) => w.id === 'tolvek_bolts')!;
    const route = whisperRouteTarget(rec)!;
    expect(route.label).toBe('the Quiver Rat');
    const before = departureCount(store);

    store.getState().setWhisperCourse(route.gridX, route.gridY, route.label);

    expect(departureCount(store)).toBe(before + 1);
    expect(store.getState().player!.whisperCourse).toEqual({ gridX: route.gridX, gridY: route.gridY, label: route.label });
  });

  it('B. re-pressing the SAME AUTO ROUTE / SET COURSE while already under way does NOT re-announce a departure or re-plant/mutate the record', async () => {
    const store = await bootJaffar('JaffarB');
    const p0 = store.getState().player!;
    const rec0 = tolvekFetchRecord(p0);
    const route = whisperRouteTarget(rec0)!;
    // The LIVE state: already armed at this exact tile — the owner's
    // screenshot, not a fresh accept.
    store.setState({
      player: { ...p0, activeWhispers: [rec0], whisperCourse: { gridX: route.gridX, gridY: route.gridY, label: route.label }, travelTarget: undefined },
    });
    const before = store.getState().player!;
    const departuresBefore = departureCount(store);

    // Exactly what the touch trace captured: AUTO ROUTE / SET COURSE pressed
    // again on the identical target, three times in a row (the owner
    // observed repeated presses, not one).
    for (let i = 0; i < 3; i++) {
      store.getState().setWhisperCourse(route.gridX, route.gridY, route.label);
    }

    // No false "you set out" — the specific line the owner's own game-log
    // evidence showed printing while he was already en route.
    expect(departureCount(store)).toBe(departuresBefore);
    // The record itself is still the SAME single instance: not duplicated,
    // not re-planted, not reset to an offer stage. (A real step or two may
    // legitimately have happened — that's the travel row doing its job —
    // so only identity and stage are asserted, not that nothing moved.)
    const after = store.getState().player!;
    expect(after.activeWhispers).toHaveLength(1);
    const w = after.activeWhispers!.find((x) => x.id === 'tolvek_bolts')!;
    expect(w).toBeDefined();
    expect(['fetch_in_progress', 'fetch_active']).toContain(w.stage); // real progress, never a regression
    expect(w.stage).not.toBe('met_yulka'); // literal re-acceptance stays impossible
    expect(after.completedWhisperIds ?? []).not.toContain('tolvek_bolts');
    void before;
  });

  it('C. the underlying acceptance path is still a no-op at this stage (confirms the original forensics, not just the new fix)', async () => {
    const store = await bootJaffar('JaffarC');
    const p0 = store.getState().player!;
    store.setState({ player: { ...p0, activeWhispers: [tolvekFetchRecord(p0)] } });

    store.getState().submitPlayerAction('accept tolvek');

    const w = store.getState().player!.activeWhispers!.find((x) => x.id === 'tolvek_bolts')!;
    expect(w.stage).toBe('fetch_in_progress'); // unchanged — the typed accept door found nothing at met_yulka to act on.
  });

  it('D. a GENUINE change of destination (a real stage transition) still announces the departure — the fix does not silence legitimate re-routing', async () => {
    const store = await bootJaffar('JaffarD');
    const p0 = store.getState().player!;
    const fetchRec = tolvekFetchRecord(p0);
    const fetchRoute = whisperRouteTarget(fetchRec)!;
    store.setState({
      player: { ...p0, activeWhispers: [fetchRec], whisperCourse: { gridX: fetchRoute.gridX, gridY: fetchRoute.gridY, label: fetchRoute.label }, travelTarget: undefined },
    });

    // The rat is defeated; the chain moved on to the return leg, which routes
    // to a DIFFERENT tile (Tolvek's own fire, not the den) — and the chase
    // actually walked the player out to the den, so they are no longer
    // standing on Tolvek's own tile the way the fixture's spawn point is.
    const returnedRec: WhisperRecord = { ...fetchRec, stage: 'fetch_returned' };
    store.setState({
      player: { ...store.getState().player!, activeWhispers: [returnedRec], gridX: fetchRoute.gridX, gridY: fetchRoute.gridY },
    });
    const returnRoute = whisperRouteTarget(returnedRec)!;
    expect(returnRoute.label).toBe('Tolvek (return the sheaves)');
    expect(isSameWhisperCourse(store.getState().player!.whisperCourse, returnRoute.gridX, returnRoute.gridY)).toBe(false);
    const before = departureCount(store);

    store.getState().setWhisperCourse(returnRoute.gridX, returnRoute.gridY, returnRoute.label);

    expect(departureCount(store)).toBe(before + 1);
    expect(store.getState().player!.whisperCourse).toEqual({ gridX: returnRoute.gridX, gridY: returnRoute.gridY, label: returnRoute.label });
  });

  it('E. hammering AUTO ROUTE mid-fetch is still real, safe navigation (no false departures, no regression, no early/duplicate stage jump)', async () => {
    const store = await bootJaffar('JaffarE');
    const p0 = store.getState().player!;
    const fetchRec = tolvekFetchRecord(p0);
    const fetchRoute = whisperRouteTarget(fetchRec)!;
    store.setState({
      player: {
        ...p0, tc: 0,
        activeWhispers: [fetchRec],
        whisperCourse: { gridX: fetchRoute.gridX, gridY: fetchRoute.gridY, label: fetchRoute.label },
        travelTarget: undefined,
      },
    });
    const departuresBefore = departureCount(store);

    // Hammer the same button the owner's touch trace shows him hitting.
    // Ten tiles out, three presses can only ever be legitimate partial
    // progress — never an arrival, never a regression.
    for (let i = 0; i < 3; i++) {
      store.getState().setWhisperCourse(fetchRoute.gridX, fetchRoute.gridY, fetchRoute.label);
    }
    expect(departureCount(store)).toBe(departuresBefore); // no false re-departure, any of the three times
    expect(store.getState().player!.activeWhispers).toHaveLength(1);
    expect(store.getState().player!.activeWhispers![0]!.stage).toBe('fetch_in_progress'); // still mid-fetch, not advanced, not reset
  });

  it('F. the eventual reward still pays exactly once, even after repeated AUTO ROUTE presses earlier in the leg', async () => {
    const store = await bootJaffar('JaffarF');
    const p0 = store.getState().player!;
    const fetchRec = tolvekFetchRecord(p0);
    const fetchRoute = whisperRouteTarget(fetchRec)!;
    store.setState({
      player: {
        ...p0, tc: 0,
        activeWhispers: [fetchRec],
        whisperCourse: { gridX: fetchRoute.gridX, gridY: fetchRoute.gridY, label: fetchRoute.label },
        travelTarget: undefined,
      },
    });
    for (let i = 0; i < 3; i++) {
      store.getState().setWhisperCourse(fetchRoute.gridX, fetchRoute.gridY, fetchRoute.label);
    }

    // The rat is defeated off-screen (defeatCredit's own province, untouched
    // by this repair) and the chain reaches handback with the sheaves in hand.
    const midPlayer = store.getState().player!;
    store.setState({
      player: {
        ...midPlayer,
        activeWhispers: [{ ...fetchRec, stage: 'handback' }],
        inventory: [...midPlayer.inventory, { name: 'Stolen Bolt Sheaves', quantity: 3, tags: ['whisper', 'quest'] } as never],
      },
    });

    const turns1 = store.getState().handBackWhisperGoods();
    expect(turns1.length).toBeGreaterThan(0);
    const paidOnce = store.getState().player!;
    expect(paidOnce.tc).toBe(25);
    expect(paidOnce.inventory.find((i) => i.name === 'Bone Bolt')?.quantity).toBe(6);
    expect(paidOnce.completedWhisperIds ?? []).toContain('tolvek_bolts');
    expect(paidOnce.activeWhispers ?? []).toEqual([]);

    // A duplicate press of the SAME hand-back door (a stray double-tap or a
    // re-render firing it twice) finds nothing left to pay — reward stays single.
    const turns2 = store.getState().handBackWhisperGoods();
    expect(turns2).toEqual([]);
    const after = store.getState().player!;
    expect(after.tc).toBe(25);
    expect(after.inventory.find((i) => i.name === 'Bone Bolt')?.quantity).toBe(6);
  });
});
