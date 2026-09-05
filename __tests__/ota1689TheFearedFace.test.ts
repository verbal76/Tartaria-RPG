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
 * OTA-1689 — THE FEARED FACE. Step-4 mundane reader; the narrative-agency
 * audit's hole 8: a "Dreaded" player was priced and greeted like anyone else.
 * npcRegard reads the ledger with one person; menace is a reputation with
 * everyone; the two never met. Two readers on the tier the portrait shows:
 * the counter pads the buy price (Feared +5%, Dreaded +10%), shown AND
 * charged through one helper; and the greeting gets one extra beat, never
 * over a wronged counter's own line.
 */
import fs from 'node:fs';
import path from 'node:path';
import { useGameStore } from '../app/state/gameStore';
import { menacePriceMult, menaceGreetingBeat, menaceTier, MENACE_PRICE_FEARED, MENACE_PRICE_DREADED } from '../app/engine/menace';
import { finalBuyPrice, strangerBuyPrice } from '../app/engine/vendorPricing';

jest.setTimeout(120000);

const src = (...p: string[]) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');

describe('OTA-1689 — the two readers', () => {
  it('the price factor follows the portrait tier: nothing below Feared, +5% Feared, +10% Dreaded', () => {
    expect([menaceTier(0), menacePriceMult(0)]).toEqual(['Unremarkable', 1]);
    expect([menaceTier(20), menacePriceMult(20)]).toEqual(['Noticed', 1]);
    expect([menaceTier(35), menacePriceMult(35)]).toEqual(['Feared', MENACE_PRICE_FEARED]);
    expect([menaceTier(69.9), menacePriceMult(69.9)]).toEqual(['Feared', 1.05]);
    expect([menaceTier(70), menacePriceMult(70)]).toEqual(['Dreaded', MENACE_PRICE_DREADED]);
    expect(menacePriceMult(100)).toBe(1.1);
  });

  it('finalBuyPrice carries the factor; an absent one is byte-identical; a stranger never pays it', () => {
    const base = { corruptionMult: 1, buyDiscount: 0, tideMult: 1, warBuyMult: 1, regardMult: 1, pressureTideMult: 1 };
    expect(finalBuyPrice(100, base)).toBe(100);
    expect(finalBuyPrice(100, { ...base, menaceMult: 1 })).toBe(100);
    expect(finalBuyPrice(100, { ...base, menaceMult: MENACE_PRICE_FEARED })).toBe(105);
    expect(finalBuyPrice(100, { ...base, menaceMult: MENACE_PRICE_DREADED })).toBe(110);
    expect(finalBuyPrice(37, { ...base, menaceMult: 1.1 })).toBe(41); // ceil(40.7)
    // The "friend's price" line compares against a stranger — who has no menace —
    // and prints only when it saved coin, so fear never reads as a discount.
    expect(strangerBuyPrice(100, { ...base, menaceMult: 1.1 })).toBe(100);
  });

  it('the greeting beat: null below Feared, one line at Feared, another at Dreaded, silent over a wronged counter', () => {
    expect(menaceGreetingBeat(0, 'Tarek', 'stranger')).toBeNull();
    expect(menaceGreetingBeat(30, 'Tarek', 'known')).toBeNull();
    expect(menaceGreetingBeat(40, 'Tarek', 'known')).toBe('Tarek keeps the counter between you. Word of how you get your way has come this far.');
    expect(menaceGreetingBeat(80, 'Tarek', 'trusted')).toBe('Tarek does not quite meet your eye. "Whatever you want. Just say it." The prices on the board have already crept up for a face like yours.');
    expect(menaceGreetingBeat(80, 'Tarek', 'wronged')).toBeNull();
    expect(menaceGreetingBeat(80, 'Tarek')).not.toBeNull();
  });

  it('shown equals charged: both price paths carry menaceMult, and both greeting doors carry the beat', () => {
    const screen = src('app', 'screens', 'VendorScreen.tsx');
    const shown = screen.match(/finalBuyPrice\(o\.price, \{([^}]*)\}/)?.[1] ?? '';
    expect(shown.includes('menaceMult: vendorMenaceMult')).toBe(true);
    expect(screen.includes('menacePriceMult(decayedMenace(player.menace ?? 0, player.menaceUpdatedHour ?? 0, player.hoursElapsed ?? 0))')).toBe(true);
    const slice = src('app', 'state', 'slices', 'vendorSlice.ts');
    const charged = slice.match(/const priceParts = \{([^}]*)\}/)?.[1] ?? '';
    expect(charged.includes('menaceMult')).toBe(true);
    expect(slice.includes('const menaceMult = menacePriceMult(decayedMenace(player.menace ?? 0, player.menaceUpdatedHour ?? 0, player.hoursElapsed ?? 0));')).toBe(true);
    const store = src('app', 'state', 'gameStore.ts');
    expect(store.split('menaceGreetingBeat(decayedMenace(').length - 1).toBe(2);
    expect(store.includes('vendor.name, npcRegard(rel)); if (mb) get().appendLog(\'world\', mb); }')).toBe(true);
    expect(store.split('\n').length).toBeLessThan(37000);
  });
});

describe('OTA-1689 — the counter charges it', () => {
  const store = useGameStore;
  const get = () => store.getState();

  beforeAll(async () => {
    console.log = () => {}; console.warn = () => {}; console.error = () => {};
    await get().hydrate();
    await get().startNewGame({ name: 'Feared', raceId: 'unknowing_mass', factionId: 'reclaimers_guild' });
    get().skipTutorial?.();
  });

  function seedCounter(menace: number) {
    const p0 = get().player!;
    store.setState({
      currentScene: {
        ...get().currentScene!,
        vendor: { id: 'menace_test_vendor', name: 'Ostra the Fence', offers: [{ itemName: 'Plain Whetstone', price: 100 }], greeting: '"Wares."' } as never,
        enemies: [], enemyHps: [],
      } as never,
      // Every other factor neutral: no corruption, no vendor faction (no rapport,
      // no tide), no patrols (no war heat), a stranger's regard, hour 0 (no
      // pressure tide) — so the price is the board price times the menace factor.
      player: { ...p0, tc: 1000, corruption: 0, hoursElapsed: 0, menace, menaceUpdatedHour: 0, completedFactionQuestIds: [] } as never,
      worldMemory: { ...get().worldMemory, patrols: [], npcRelations: {} } as never,
    });
  }

  it('an Unremarkable face pays the board price; a Dreaded one pays ten percent over it', () => {
    seedCounter(0);
    const tc0 = get().player!.tc;
    get().buyFromVendor('Plain Whetstone', 1);
    const plain = tc0 - get().player!.tc;
    expect(plain).toBe(100);
    seedCounter(80);
    const tc1 = get().player!.tc;
    get().buyFromVendor('Plain Whetstone', 1);
    expect(tc1 - get().player!.tc).toBe(110);
    // The receipt says what was paid, and no "friend's price" line pretends fear saved anything.
    const tail = get().gameLog.slice(-6).map((e) => e.text).join('\n');
    expect(tail.includes('for 110 TC')).toBe(true);
    expect(tail.includes('stayed in your pouch')).toBe(false);
  });
});
