// OTA-812 — feed/vendor polish.
//   (1) The same-channel debounce groups rapid world/system beats into ONE card but
//       now joins them with a PARAGRAPH BREAK, not two spaces — so a travel step's
//       stall line + wares blurb + walk + encounter read as distinct beats, not a
//       run-on wall.
//   (2) Recipes a vendor teaches are surfaced as buy buttons; the button target
//       (buyFromVendor(recipeResult)) learns the recipe and charges TC.

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
  Audio: {
    setAudioModeAsync: jest.fn(),
    Sound: class {
      static createAsync: (...args: unknown[]) => Promise<{ sound: { playAsync: () => Promise<void>; unloadAsync: () => Promise<void> } }> = jest.fn(async () => ({ sound: { playAsync: jest.fn(async () => {}), unloadAsync: jest.fn(async () => {}) } }));
    },
  },
}));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '0', applicationId: 'test' }));
jest.mock('expo-asset', () => ({ Asset: { fromModule: () => ({ downloadAsync: jest.fn(async () => {}), localUri: '' }) } }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => {}) }));
jest.mock('expo-constants', () => ({ default: { expoConfig: {} } }));
jest.mock('expo-font', () => ({ loadAsync: jest.fn(async () => {}) }));
jest.mock('expo-speech-recognition', () => ({}));
jest.mock('expo-updates', () => ({}));

import { useGameStore } from '../app/state/gameStore';
import { vendorRecipeOffers, vendorSeed } from '../app/engine/recipeDiscovery';
import { RECIPES } from '../app/engine/crafting';

beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

async function boot() {
  const store = useGameStore;
  await store.getState().hydrate();
  await store.getState().startNewGame({ name: 'Reader', raceId: 'unknowing_mass', factionId: 'reclaimers_guild' });
  store.getState().skipTutorial?.();
  return store;
}

describe('OTA-812 — feed beats read as paragraphs', () => {
  it('rapid world beats group into one card, joined by a blank line (not a run-on)', async () => {
    const store = await boot();
    store.getState().appendLog('world', 'A stall has been thrown up on the next stretch.');
    store.getState().appendLog('world', 'You walk east through open silt.');
    const log = store.getState().gameLog;
    const last = log[log.length - 1]!;
    expect(last.channel).toBe('world');
    expect(last.text).toContain('\n\n');                       // paragraph break, not "  "
    expect(last.text).not.toMatch(/stretch\.  You walk/);      // NOT the old two-space weld
  });
});

// Find any vendor-name seed that offers at least one recipe the fresh player lacks.
function findRecipeVendor(knownRecipes: string[]) {
  for (const name of ['Tellin Mak', 'Jorah', 'Halem', 'Yulka', 'Irma Ironhand', 'Mak', 'Seed7', 'Seed13', 'Seed29']) {
    const offers = vendorRecipeOffers(RECIPES, knownRecipes, vendorSeed(name))
      .filter((o) => !knownRecipes.includes(o.result));
    if (offers.length > 0) return { name, offer: offers[0]! };
  }
  return null;
}

describe('OTA-812 — vendor recipe buttons learn via buyFromVendor', () => {
  it('buying a recipe by result name learns it and charges TC', async () => {
    const store = await boot();
    const known = store.getState().player!.knownRecipes ?? [];
    const found = findRecipeVendor(known);
    expect(found).toBeTruthy();
    const { name, offer } = found!;
    store.setState((s) => ({
      currentScene: { ...s.currentScene!, enemies: [], vendor: { name, faction: 'reclaimers_guild', offers: [] } } as any,
      player: { ...s.player!, tc: offer.price + 500, corruption: 0 },
    }));
    const tcBefore = store.getState().player!.tc;
    store.getState().buyFromVendor(offer.result, 1); // what the LEARN button ultimately calls
    expect((store.getState().player!.knownRecipes ?? [])).toContain(offer.result);
    expect(store.getState().player!.tc).toBe(tcBefore - offer.price);
  });
});
