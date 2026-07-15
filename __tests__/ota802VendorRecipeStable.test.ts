// arb-fix (OTA-802) — buying a recipe from a vendor rerolled/restocked the whole recipe
// list, so a player could buy recipes until broke (device log: Road Hawker). Cause:
// vendorRecipeOffers drew its window from the UNKNOWN pool, so learning one shrank the
// pool and slid a NEW recipe into view. The menu is now a FIXED seeded slice of the FULL
// discoverable pool; learning one just drops it (the rest keep their identity), and once
// the whole menu is learned there's nothing left — no reroll.

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
  makeDirectoryAsync: jest.fn(async () => {}), readAsStringAsync: jest.fn(async () => ''),
  writeAsStringAsync: jest.fn(async () => {}), deleteAsync: jest.fn(async () => {}),
  downloadAsync: jest.fn(async () => ({ uri: '' })), EncodingType: { UTF8: 'utf8', Base64: 'base64' },
}));
jest.mock('expo-speech', () => ({ speak: jest.fn(), stop: jest.fn(), isSpeakingAsync: jest.fn(async () => false) }));
jest.mock('expo-av', () => ({
  Audio: { setAudioModeAsync: jest.fn(), Sound: class { static createAsync = jest.fn(async () => ({ sound: { playAsync: jest.fn(async () => {}), unloadAsync: jest.fn(async () => {}) } })); } },
}));

import { vendorRecipeOffers, vendorSeed, allDiscoverableRecipes } from '../app/engine/recipeDiscovery';
import { RECIPES } from '../app/engine/crafting';

const seed = vendorSeed('Road Hawker');

describe('OTA-802 — vendor recipe menu is stable (no reroll on purchase)', () => {
  it('learning one offered recipe drops ONLY that one — the rest keep their identity', () => {
    const menu0 = vendorRecipeOffers(RECIPES, [], seed);
    expect(menu0.length).toBeGreaterThan(1);                       // a multi-recipe menu to test against
    const bought = menu0[0]!.result;

    const menu1 = vendorRecipeOffers(RECIPES, [bought], seed);
    // Exactly one fewer, the bought one gone...
    expect(menu1.length).toBe(menu0.length - 1);
    expect(menu1.map((o) => o.result)).not.toContain(bought);
    // ...and NO new recipe slid in — every remaining offer was already in the menu.
    const menu0Set = new Set(menu0.map((o) => o.result));
    for (const o of menu1) expect(menu0Set.has(o.result)).toBe(true);
    // The other originals are still exactly there.
    expect(menu1.map((o) => o.result)).toEqual(menu0.slice(1).map((o) => o.result));
  });

  it('once the whole menu is learned, the vendor offers nothing (bounded supply)', () => {
    const menu0 = vendorRecipeOffers(RECIPES, [], seed);
    const learnedAll = menu0.map((o) => o.result);
    expect(vendorRecipeOffers(RECIPES, learnedAll, seed)).toHaveLength(0);
  });

  it('the menu slice is fixed by seed over the FULL pool (independent of known)', () => {
    // Learning recipes OUTSIDE this vendor's menu must not change what it offers.
    const menu0 = vendorRecipeOffers(RECIPES, [], seed);
    const offered = new Set(menu0.map((o) => o.result));
    const someOthers = allDiscoverableRecipes(RECIPES).filter((r) => !offered.has(r)).slice(0, 5);
    const menuAfterUnrelated = vendorRecipeOffers(RECIPES, someOthers, seed);
    expect(menuAfterUnrelated.map((o) => o.result)).toEqual(menu0.map((o) => o.result));
  });
});
