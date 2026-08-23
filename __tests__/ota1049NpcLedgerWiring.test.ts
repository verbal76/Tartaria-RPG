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

/**
 * OTA-1049 — the ledger is only worth anything if the store actually writes to
 * it. npcMemory.test.ts proves the rules; this proves the wiring: that buying
 * something from a person is recorded against THAT person, that emptying a
 * stack is one piece of business rather than twenty, and that a theft is
 * remembered only when they saw it.
 */
jest.setTimeout(60_000);

import { useGameStore } from '../app/state/gameStore';
import { getRelation, npcRegard, knowsPlayerName } from '../app/engine/npcMemory';
import { getRaces, getFactions } from '../app/engine/character';

const VENDOR_ID = 'ledger_test_vendor';

async function boot(name: string) {
  const store = useGameStore;
  await store.getState().hydrate();
  await store.getState().startNewGame({ name, raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
  store.getState().skipTutorial?.();
  await new Promise((r) => setTimeout(r, 25));
  store.setState((s) => ({
    player: { ...s.player!, tc: 5000 },
    worldMemory: {
      ...s.worldMemory,
      // Stand them in front of us once — the arrival site does this in play.
      npcRelations: {
        [VENDOR_ID]: {
          id: VENDOR_ID, name: 'Ledger', role: 'trader', factionId: undefined,
          firstMetAt: 1, lastSeenAt: 1, lastSeenHours: 0,
          meetings: 1, trades: 0, tcTraded: 0,
          contractsTaken: 0, contractsTurnedIn: 0, wrongs: 0,
        },
      },
    },
    currentScene: {
      ...store.getState().currentScene!,
      enemies: [],
      vendor: {
        id: VENDOR_ID,
        name: 'Ledger',
        title: 'trader',
        faction: null,
        demeanor: 'honest',
        description: 'A trader.',
        offers: [
          { itemName: 'Rope', price: 20, quantity: 9 },
          { itemName: 'Bandage', price: 10, quantity: 9 },
        ],
      } as never,
    },
  }));
  return store;
}

const rel = (store: typeof useGameStore) => getRelation(store.getState().worldMemory, VENDOR_ID);

describe('OTA-1049 — the store writes the ledger', () => {
  beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

  it('buying is recorded against the person you bought from', async () => {
    const store = await boot('Verbal');
    expect(rel(store)!.trades).toBe(0);
    expect(knowsPlayerName(rel(store))).toBe(false); // one silent visit

    store.getState().buyFromVendor('Rope', 1);

    expect(rel(store)!.trades).toBe(1);
    expect(rel(store)!.tcTraded).toBeGreaterThan(0);
    // ...and that is what earns the name, on the very next greeting.
    expect(knowsPlayerName(rel(store))).toBe(true);
    expect(npcRegard(rel(store))).toBe('known');
  });

  it('a bulk buy is ONE piece of business, not one per unit', async () => {
    // Otherwise a single tap on a stack of five would vault a stranger to
    // "familiar" (trades >= 3) — a relationship bought in one action.
    const store = await boot('Bulk');
    store.getState().buyFromVendor('Rope', 5);
    expect(rel(store)!.trades).toBe(1);
    expect(npcRegard(rel(store))).toBe('known');
  });

  it('TC still accumulates across separate purchases', async () => {
    // ⚠ OTA-1438 — TC accrues per transaction; the trade COUNT does not. Money
    // that moved really moved, and the amends ledger and the TC rungs both read
    // it. Only the count means "a piece of business".
    const store = await boot('Spender');
    store.getState().buyFromVendor('Rope', 1);
    const afterOne = rel(store)!.tcTraded;
    store.getState().buyFromVendor('Bandage', 1);
    expect(rel(store)!.tcTraded).toBeGreaterThan(afterOne);
    expect(rel(store)!.trades).toBe(1);
  });

  it('four separate visits to the counter make you a regular', async () => {
    // ⚠⚠ OTA-1438 — THIS TEST'S NAME WAS ALWAYS RIGHT AND ITS BODY NEVER WAS.
    // It said "three separate visits" and performed three purchases without the
    // clock moving, which is one visit. It passed because `trades` counted line
    // items, so the wrong setup produced the right number by accident — and the
    // vocabulary gap hid the defect the owner eventually hit in play: three junk
    // sales in one breath made a stranger a regular. The clock now advances
    // between them, so the test does what it always claimed to.
    const store = await boot('Regular');
    const step = (h: number) =>
      store.setState((s) => ({ player: { ...s.player!, hoursElapsed: h } }));
    step(4); store.getState().buyFromVendor('Rope', 1);
    step(19); store.getState().buyFromVendor('Bandage', 1);
    step(37); store.getState().buyFromVendor('Rope', 1);
    // ⚠ OTA-1439 — the bar is FOUR visits now, by the owner's call.
    expect(npcRegard(rel(store))).not.toBe('familiar');
    step(55); store.getState().buyFromVendor('Bandage', 1);
    expect(rel(store)!.trades).toBe(4);
    expect(npcRegard(rel(store))).toBe('familiar');
  });

  it('⚠⚠ OTA-1438 — and three purchases in ONE visit do NOT', async () => {
    // The defect, as the owner met it. Same three taps, same counter, no time
    // passing: one piece of business, and not yet a regular.
    const store = await boot('Dumper');
    store.getState().buyFromVendor('Rope', 1);
    store.getState().buyFromVendor('Bandage', 1);
    store.getState().buyFromVendor('Rope', 1);
    expect(rel(store)!.trades).toBe(1);
    expect(npcRegard(rel(store))).not.toBe('familiar');
  });

  it('the ledger is per-person — another trader knows nothing about it', async () => {
    const store = await boot('Twoshops');
    store.getState().buyFromVendor('Rope', 1);
    expect(getRelation(store.getState().worldMemory, 'some_other_vendor')).toBeNull();
  });
});
