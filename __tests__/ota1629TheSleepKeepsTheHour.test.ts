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

// ⚠⚠⚠ OTA-1629 — THE SLEEP KEEPS THE HOUR.
//
// Owner, on OTA-1627's cold camps: *"for the ones that make you wait, can we
// type wait until 'exact time' or sleep until 'exact time'"*. The first half
// already held — "wait until 7 am" parsed the clock. The second did not:
// "sleep until 7 am", "rest until dark", "sleep for 3 hours" all went to the
// rest verb, which was a fixed eight-hour camp and refused outright at full
// wind ("Save the hours"). A player who wrote the hour down got the default.
//
// `clockSpan` is the one reader of a named span, shared by wait and rest.
// When a rest-shaped line names the hours, the clock wins over the eight and
// over the full-wind refusal; the sleep still rolls its ambush, still heals
// and recovers as a camp does, and then looks at the ground again where the
// player lies so a camp whose hour has come wakes in place.

import { useGameStore } from '../app/state/gameStore';
import { getRaces, getFactions } from '../app/engine/character';
import { clockSpan, waitSpan } from '../app/state/waitVerb';
import { findChain } from '../app/engine/whispers';
import { placedAt } from '../test-utils/placePlayer';
import { playerGridCell } from '../app/state/playerGrid';
import { readFileSync } from 'fs';
import { join } from 'path';

jest.setTimeout(180000);
const store = useGameStore;
const get = () => store.getState();
async function settle(pred: () => boolean, ms = 4000) { const t0 = Date.now(); while (!pred() && Date.now() - t0 < ms) await new Promise((r) => setTimeout(r, 15)); }

const CHAIN = 'petra_dice';
const rec = () => (get().player?.activeWhispers ?? []).find((w) => w.id === CHAIN);
const hourOfDay = () => Math.floor((get().player?.hoursElapsed ?? 0) % 24);

/** Petra's camp on the tile the player stands on, at nine in the morning, the
 *  player whole: full wind, closed wounds, nothing to rest for but the hour. */
function seedColdCampWhole(atHour = 9) {
  const chain = findChain(CHAIN)!;
  const p = { ...get().player!, ...placedAt('slack_flats'), hubRoomId: null };
  const days = Math.floor((p.hoursElapsed ?? 0) / 24);
  const hoursElapsed = days * 24 + atHour;
  const g = playerGridCell(p);
  store.setState({
    player: {
      ...p,
      hoursElapsed, hp: p.hpMax, stamina: p.staminaMax ?? p.stamina, corruption: 0,
      activeWhispers: [{
        id: CHAIN, stage: 'planted', plantedAtHour: hoursElapsed,
        targetMapX: p.mapX ?? 0, targetMapY: p.mapY ?? 0, targetGridX: g.x, targetGridY: g.y,
        targetLocationId: p.currentLocationId, activeFromHour: chain.activeHours![0], activeToHour: chain.activeHours![1],
      }],
      completedWhisperIds: [],
    } as never,
    activeBuildingId: null,
    pendingMissionBeat: null, pendingMissionStinger: null, missionCloseQueue: [],
    currentScene: { ...get().currentScene!, enemies: [], enemyHps: [], enemyKnockedOut: [], activeEnemyIdx: 0, range: null } as never,
  });
}

describe('OTA-1629 — the sleep keeps the hour', () => {
  it('one reader of a named span, shared by wait and rest', () => {
    expect(clockSpan('sleep until 7 am', 6)).toEqual({ hours: 1, label: 'until 7 am' });
    expect(clockSpan('rest until dark', 9)).toEqual({ hours: 11, label: 'until dark' });
    expect(clockSpan('sleep for 3 hours', 9)).toEqual({ hours: 3, label: '3 hours' });
    expect(clockSpan('nap till 19', 9)).toEqual({ hours: 10, label: 'until 7 pm' });
    expect(clockSpan('rest', 9)).toBeNull();
    expect(clockSpan('sleep', 9)).toBeNull();
    expect(waitSpan('wait', 9)).toEqual({ hours: 1, label: 'an hour' });
  });

  describe('at the cold camp, whole', () => {
    beforeAll(async () => {
      console.log = () => {}; console.warn = () => {}; console.error = () => {};
      await store.getState().hydrate();
      await store.getState().startNewGame({ name: 'Sleeper', raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
      store.getState().skipTutorial?.();
      await settle(() => !!store.getState().currentScene);
    });

    it('⚠⚠⚠ THE OWNER\'S ASK: "sleep until 8 pm" at full wind is not refused, lands on the hour, and the camp wakes', async () => {
      seedColdCampWhole(9);
      const n0 = get().gameLog.length;
      await get().submitPlayerAction('sleep until 8 pm');
      await settle(() => rec()?.stage === 'met_yulka');
      const said = get().gameLog.slice(n0).map((e) => e.text).join('\n');
      expect(said).not.toMatch(/Save the hours/);
      expect(said).toMatch(/You rest for 11 hours/);
      expect(hourOfDay()).toBe(20);
      expect(rec()?.stage).toBe('met_yulka');
      expect(said).toContain(findChain(CHAIN)!.content.sighting);
    });

    it('⚠⚠ "rest until dark" is the same door, and the pop-up card comes with the camp', async () => {
      seedColdCampWhole(9);
      await get().submitPlayerAction('rest until dark');
      await settle(() => rec()?.stage === 'met_yulka');
      expect(hourOfDay()).toBe(20);
      expect(get().pendingMissionBeat?.title).toBe(findChain(CHAIN)!.title);
    });

    it('⚠⚠ "sleep for 3 hours" sleeps three, not eight', async () => {
      seedColdCampWhole(9);
      const n0 = get().gameLog.length;
      await get().submitPlayerAction('sleep for 3 hours');
      await new Promise((r) => setTimeout(r, 200));
      expect(hourOfDay()).toBe(12);
      const said = get().gameLog.slice(n0).map((e) => e.text).join('\n');
      expect(said).toMatch(/You rest for 3 hours/);
      expect(rec()?.stage).toBe('planted'); // noon: still cold, and correctly so
    });

    it('a bare "rest" at full wind is still refused — the default camp did not change', async () => {
      seedColdCampWhole(9);
      const n0 = get().gameLog.length;
      await get().submitPlayerAction('rest');
      await new Promise((r) => setTimeout(r, 150));
      expect(hourOfDay()).toBe(9);
      expect(get().gameLog.slice(n0).map((e) => e.text).join('\n')).toMatch(/Save the hours/);
    });
  });

  it('source pin — the rest case reads the named span through the one reader', () => {
    const src = readFileSync(join(__dirname, '../app/state/gameStore.ts'), 'utf8');
    expect(src).toContain("const named = WV().clockSpan(trimmed, Math.floor((player.hoursElapsed ?? 0) % 24));");
    expect(src).toContain('!named && stamRoom <= 0 &&');
    expect(src).toContain('const hours = named?.hours ?? 8;');
    const wv = readFileSync(join(__dirname, '../app/state/waitVerb.ts'), 'utf8');
    expect(wv).toContain("return clockSpan(raw, hourOfDay) ?? { hours: 1, label: 'an hour' };");
  });
});
