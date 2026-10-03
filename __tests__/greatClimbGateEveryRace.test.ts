// I-054 / Five Towers prerequisite — EVERY playable race can legitimately obtain the
// great-climb gate (Hardened Climbing Strap + Reclaimer's Rope). Before this, the
// strap was a tartarian_giant race-starter ONLY (never sold, crafted or dropped), so
// the other six races were refused at the ground by gameStore's `case 'climb'`
// great-climb entry check and the whole Skyreacher storyline was unreachable for them.
// The old audit test only checked the strap was catalogued, not that anyone could get it.

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
import { RACE_STARTER_EXPLORATION } from '../app/engine/character';
import vendorsData from '../app/data/npcs/vendors.json';
import recipesData from '../app/data/items/recipes.json';
import races from '../app/data/races/races.json';

const STRAP = 'Hardened Climbing Strap';
const ROPE = "Reclaimer's Rope";

const vendorOffers = new Map<string, number>(); // item -> cheapest price across real vendor stalls
for (const v of (vendorsData as { vendors: { offers?: { itemName: string; price: number }[] }[] }).vendors) {
  for (const o of v.offers ?? []) {
    const prev = vendorOffers.get(o.itemName);
    if (prev === undefined || o.price < prev) vendorOffers.set(o.itemName, o.price);
  }
}
const recipeResults = new Set<string>();
const recipeList: { result?: string; name?: string }[] = Array.isArray(recipesData) ? (recipesData as never) : ((recipesData as { recipes?: never[] }).recipes ?? []);
for (const r of recipeList) { if (r.result) recipeResults.add(r.result); }

const acquirableBy = (raceId: string, item: string): string[] => {
  const via: string[] = [];
  if ((RACE_STARTER_EXPLORATION[raceId] ?? []).includes(item)) via.push('race starter');
  if (vendorOffers.has(item)) via.push('vendor');
  if (recipeResults.has(item)) via.push('recipe');
  return via;
};

describe('Five Towers prerequisite — every playable race can obtain the great-climb gate', () => {
  it('the strap is acquirable by every race through a path other than another race\'s starter kit', () => {
    expect(vendorOffers.has(STRAP) || recipeResults.has(STRAP)).toBe(true);
    for (const race of races as { id: string }[]) {
      expect({ race: race.id, via: acquirableBy(race.id, STRAP).length > 0 }).toEqual({ race: race.id, via: true });
    }
  });

  it("the Reclaimer's Rope half of the gate is acquirable by every race too", () => {
    for (const race of races as { id: string }[]) {
      expect({ race: race.id, via: acquirableBy(race.id, ROPE).length > 0 }).toEqual({ race: race.id, via: true });
    }
  });

  it('the strap price is affordable next to the rope it is always bought with', () => {
    const strap = vendorOffers.get(STRAP)!;
    const rope = vendorOffers.get(ROPE)!;
    expect(strap).toBeGreaterThan(0);
    expect(strap).toBeLessThanOrEqual(rope * 2);
  });
});

describe('Five Towers prerequisite — a non-giant race really can buy the strap through the production door', () => {
  beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

  it('mud_golem (never a starter owner) buys the strap from a real stall offer with real TC', async () => {
    const store = useGameStore;
    await store.getState().hydrate();
    await store.getState().startNewGame({ name: 'Climber', raceId: 'mud_golem', factionId: 'reclaimers_guild' });
    store.getState().skipTutorial?.();
    const p0 = store.getState().player!;
    expect(p0.inventory.some((i) => i.name === STRAP)).toBe(false);
    const price = vendorOffers.get(STRAP)!;
    store.setState({
      player: { ...p0, tc: price + 10 },
      currentScene: {
        ...store.getState().currentScene!,
        vendor: { id: 'scrap_broker', name: 'Tellin Mak', title: 'broker', demeanor: 'honest', faction: 'reclaimers_guild', offers: [{ itemName: STRAP, price, quantity: 1 }] } as never,
      },
    });
    await store.getState().buyFromVendor(STRAP, 1);
    const after = store.getState().player!;
    expect(after.inventory.some((i) => i.name === STRAP)).toBe(true);
    expect(after.tc).toBeLessThan(price + 10); // a real purchase spent real TC (stall discounts may apply)
  });
});
