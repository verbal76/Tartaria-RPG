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

// ⚠⚠⚠ OTA-1627 — THE HOUR CAN BE WAITED FOR.
//
// The player-shaped walker, on three whisper chains (Petra, Dazak, Imogen):
// it walked the course, stood on the camp's tile, and the game said "This is
// Petra's spot — but the camp is cold. Petra works here after dark (8 pm to
// 2 am). Wait for the hour and look again." It waited the only way the game
// offered — `rest` — and was refused: "Your wind is full, your wounds are
// closed, and the Aether carries no shadow on you. Save the hours." `wait`
// printed "You hold still. Tartaria holds still longer." and moved the clock
// by nothing. The game told the player to wait for an hour and had no verb
// that passed one.

import { useGameStore } from '../app/state/gameStore';
import { getRaces, getFactions } from '../app/engine/character';
import { waitSpan, formatHour } from '../app/state/waitVerb';
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

/** Petra's camp, planted ON the tile the player stands on, at nine in the morning. */
function seedColdCamp(atHour = 9) {
  const chain = findChain(CHAIN)!;
  const p = { ...get().player!, ...placedAt('slack_flats'), hubRoomId: null };
  const days = Math.floor((p.hoursElapsed ?? 0) / 24);
  const hoursElapsed = days * 24 + atHour;
  const g = playerGridCell(p);
  store.setState({
    player: {
      ...p,
      hoursElapsed,
      activeWhispers: [{
        id: CHAIN, stage: 'planted', plantedAtHour: hoursElapsed,
        targetMapX: p.mapX ?? 0, targetMapY: p.mapY ?? 0,
        targetGridX: g.x, targetGridY: g.y, targetLocationId: p.currentLocationId,
        activeFromHour: chain.activeHours![0], activeToHour: chain.activeHours![1],
      }],
      completedWhisperIds: [],
    } as never,
    activeBuildingId: null,
    currentScene: { ...get().currentScene!, enemies: [], enemyHps: [], enemyKnockedOut: [], activeEnemyIdx: 0, range: null } as never,
  });
}

describe('OTA-1627 — the hour can be waited for', () => {
  it('the span reads the line: an hour, N hours, until dark, until morning', () => {
    expect(waitSpan('wait', 9)).toEqual({ hours: 1, label: 'an hour' });
    expect(waitSpan('wait 3 hours', 9)).toEqual({ hours: 3, label: '3 hours' });
    expect(waitSpan('wait until dark', 9)).toEqual({ hours: 11, label: 'until dark' });
    expect(waitSpan('wait for nightfall', 21)).toEqual({ hours: 23, label: 'until dark' });
    expect(waitSpan('wait until morning', 22)).toEqual({ hours: 8, label: 'until morning' });
    expect(waitSpan('wait 40 hours', 0).hours).toBe(24);
    // ⚠ The hour the cold line names. Dazak works 7 am to 7 pm; "until morning"
    // lands at six and the camp is still cold — so the line says 7 am, and 7 am parses.
    expect(waitSpan('wait until 7 am', 6)).toEqual({ hours: 1, label: 'until 7 am' });
    expect(waitSpan('wait until 8 pm', 9)).toEqual({ hours: 11, label: 'until 8 pm' });
    expect(waitSpan('wait till 19', 9)).toEqual({ hours: 10, label: 'until 7 pm' });
    expect(waitSpan('wait until 12 am', 20)).toEqual({ hours: 4, label: 'until 12 am' });
    expect(formatHour(0)).toBe('12 am');
    expect(formatHour(12)).toBe('12 pm');
  });

  describe('at the cold camp', () => {
    beforeAll(async () => {
      console.log = () => {}; console.warn = () => {}; console.error = () => {};
      await store.getState().hydrate();
      await store.getState().startNewGame({ name: 'Waiter', raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
      store.getState().skipTutorial?.();
      await settle(() => !!store.getState().currentScene);
    });

    it('⚠⚠⚠ THE WALKER\'S STAND, REPLAYED: "wait until dark" passes the hours and the camp wakes where you stand', async () => {
      seedColdCamp(9);
      expect(rec()?.stage).toBe('planted');
      const n0 = get().gameLog.length;
      await get().submitPlayerAction('wait until dark');
      await settle(() => rec()?.stage === 'met_yulka');
      expect(hourOfDay()).toBe(20);
      expect(rec()?.stage).toBe('met_yulka');
      const said = get().gameLog.slice(n0).map((e) => e.text).join('\n');
      expect(said).toMatch(/You wait until dark/);
      expect(said).toMatch(/Time passed: 11h/);
      expect(said).toContain(findChain(CHAIN)!.content.sighting);
    });

    it('⚠⚠ a bare "wait" is an hour, at full wind and closed wounds — no "save the hours"', async () => {
      seedColdCamp(9);
      const p = get().player!;
      store.setState({ player: { ...p, hp: p.hpMax, stamina: p.staminaMax ?? p.stamina, corruption: 0 } as never });
      const n0 = get().gameLog.length;
      await get().submitPlayerAction('wait');
      await new Promise((r) => setTimeout(r, 150));
      expect(hourOfDay()).toBe(10);
      const said = get().gameLog.slice(n0).map((e) => e.text).join('\n');
      expect(said).not.toMatch(/Save the hours/);
      expect(said).not.toMatch(/holds still longer/);
      expect(said).toMatch(/Time passed: 1h/);
      // Still cold at ten in the morning — and the line says which verb to type.
      expect(rec()?.stage).toBe('planted');
    });

    it('the cold-camp line names the verb', async () => {
      seedColdCamp(9);
      const n0 = get().gameLog.length;
      // Step off and back on: the arrival is the cold check.
      await get().submitPlayerAction('north');
      await get().submitPlayerAction('south');
      await new Promise((r) => setTimeout(r, 200));
      const said = get().gameLog.slice(n0).map((e) => e.text).join('\n');
      expect(said).toMatch(/the camp is cold/);
      // Petra works 8 pm to 2 am — the line names the hour, not a word that
      // can land early (Dazak's 7 am camp was still cold at "morning").
      expect(said).toMatch(/type 'wait until 8 pm'/);
    });

    it('in a fight, waiting is refused — the fight does not wait', async () => {
      seedColdCamp(9);
      const foe = { name: 'Gutter Rat', type: 'Beast', rarity: 'Common', hp: 40, damage: '1d4 piercing', abilityPoint: '+1', traits: [], loot: [] };
      store.setState({ currentScene: { ...get().currentScene!, enemies: [foe as never], enemyHps: [40], enemyKnockedOut: [false], activeEnemyIdx: 0, range: 'close', enemyStatuses: [[]], enemyAmbushUsed: [false] } as never });
      const h0 = get().player!.hoursElapsed ?? 0;
      const n0 = get().gameLog.length;
      await get().submitPlayerAction('wait');
      await new Promise((r) => setTimeout(r, 150));
      const said = get().gameLog.slice(n0).map((e) => e.text).join('\n');
      expect(said).toMatch(/Nothing here has agreed to that/);
      expect((get().player!.hoursElapsed ?? 0) - h0).toBeLessThan(1);
    });
  });

  it('source pin — the store hands the verb to runWait', () => {
    const src = readFileSync(join(__dirname, '../app/state/gameStore.ts'), 'utf8');
    expect(src).toContain("case 'wait':\n        (require('./waitVerb') as typeof import('./waitVerb')).runWait(get, set, trimmed);");
    expect(src).not.toContain('Tartaria holds still longer');
  });
});
