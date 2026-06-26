// engine_Dev — the dev crash-test kit (Verbal / Sasmooch) resolves against the
// ACTIVE catalogs. In built-in Tartaria it's the original hardcoded kit; in a
// re-skin it substitutes the pack's own consumables by role tag, so it never
// injects Tartaria item names ("improvised") into an uploaded game.

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
jest.mock('expo-av', () => ({ Audio: { setAudioModeAsync: jest.fn(), Sound: class { static createAsync = jest.fn(async () => ({ sound: { playAsync: jest.fn(), unloadAsync: jest.fn() } })); } } }));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '0', applicationId: 'test' }));
jest.mock('expo-asset', () => ({ Asset: { fromModule: () => ({ downloadAsync: jest.fn(), localUri: '' }) } }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn() }));
jest.mock('expo-constants', () => ({ default: { expoConfig: {} } }));
jest.mock('expo-font', () => ({ loadAsync: jest.fn() }));
jest.mock('expo-speech-recognition', () => ({}));
jest.mock('expo-updates', () => ({}));

import { buildDevGiftItems } from '../app/state/gameStore';
import { setTableOverride, clearAllOverrides } from '../app/engine/contentPack';

describe('engine_Dev — dev crash-test kit is content-agnostic', () => {
  afterEach(() => clearAllOverrides());

  it('built-in Tartaria yields the original hardcoded kit', () => {
    const gift = buildDevGiftItems();
    const byName = Object.fromEntries(gift.map((g) => [g.name, g.qty]));
    expect(byName['First Aid Kit']).toBe(10);
    expect(byName['Trail Rations']).toBe(20);
    expect(byName['Water Bottle']).toBe(1);
    expect(gift.length).toBe(5);
  });

  it('a re-skin substitutes the pack\'s own consumables — no Tartaria names', () => {
    // A minimal WWII-style consumables catalog covering the kit roles.
    setTableOverride('gear', [
      { name: 'Black-Market Medkit', kind: 'consumable', rarity: 'Uncommon', tags: ['consumable', 'medicine', 'medical'], description: 'x' },
      { name: 'C-Ration (Meat & Beans)', kind: 'consumable', rarity: 'Common', tags: ['food', 'us_military'], description: 'x' },
      { name: 'Canned Peaches', kind: 'consumable', rarity: 'Common', tags: ['food', 'morale'], description: 'x' },
      { name: 'D-Ration Bar', kind: 'consumable', rarity: 'Common', tags: ['food', 'sugar'], description: 'x' },
      { name: 'British Char (Tea Flask)', kind: 'consumable', rarity: 'Common', tags: ['drink', 'water'], description: 'x' },
    ]);
    // Also override materials so the built-in materials pool can't leak Tartaria names in.
    setTableOverride('materials', [{ name: 'Scrap Steel', rarity: 'Common', tags: ['material', 'metal'], description: 'x' }]);

    const gift = buildDevGiftItems();
    const TARTARIA = new Set(['First Aid Kit', 'Trail Rations', 'Smoke-Cured Jerky Strip', 'Bioluminescent Fungus', 'Water Bottle']);
    // None of the original Tartaria names appear...
    for (const g of gift) expect(TARTARIA.has(g.name)).toBe(false);
    // ...every gifted name is a real row in the uploaded gear catalog...
    const packNames = new Set(['Black-Market Medkit', 'C-Ration (Meat & Beans)', 'Canned Peaches', 'D-Ration Bar', 'British Char (Tea Flask)']);
    for (const g of gift) expect(packNames.has(g.name)).toBe(true);
    // ...the medicine + drink roles resolved to the right items...
    const byName = Object.fromEntries(gift.map((g) => [g.name, g.qty]));
    expect(byName['Black-Market Medkit']).toBe(10);   // healing role, qty preserved
    expect(byName['British Char (Tea Flask)']).toBe(1); // drink role, qty preserved
    // ...and picks are distinct (no duplicate gifts).
    expect(new Set(gift.map((g) => g.name)).size).toBe(gift.length);
  });
});
