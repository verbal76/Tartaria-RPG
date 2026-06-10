// OTA-439 — [audit #23] confirm before a craft consumes material substitutes.
// A craft that strips a misc/inferred item (standing in for a named ingredient
// via its material tag) used to eat it silently; now it raises a prompt and
// only proceeds on confirm.

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('onnxruntime-react-native', () => ({
  InferenceSession: { create: jest.fn(async () => ({ run: jest.fn(async () => ({})) })) },
  Tensor: class { constructor(_t: string, _d: unknown, _s: unknown[]) { void _t; void _d; void _s; } },
}));
jest.mock('llama.rn', () => ({ initLlama: jest.fn(async () => ({ completion: jest.fn(async () => ({ text: '' })), release: jest.fn() })), releaseAllLlama: jest.fn() }));
jest.mock('react-native-executorch', () => ({}));
jest.mock('expo-file-system', () => ({ documentDirectory: '/tmp/', cacheDirectory: '/tmp/', getInfoAsync: jest.fn(async () => ({ exists: false })), makeDirectoryAsync: jest.fn(async () => {}), readAsStringAsync: jest.fn(async () => ''), writeAsStringAsync: jest.fn(async () => {}), deleteAsync: jest.fn(async () => {}), downloadAsync: jest.fn(async () => ({ uri: '' })), EncodingType: { UTF8: 'utf8', Base64: 'base64' } }));
jest.mock('expo-speech', () => ({ speak: jest.fn(), stop: jest.fn(), isSpeakingAsync: jest.fn(async () => false) }));
jest.mock('expo-av', () => ({ Audio: { setAudioModeAsync: jest.fn(), Sound: class { static createAsync = jest.fn(async () => ({ sound: { playAsync: jest.fn(async () => {}), unloadAsync: jest.fn(async () => {}) } })); } } }));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '0', applicationId: 'test' }));
jest.mock('expo-asset', () => ({ Asset: { fromModule: () => ({ downloadAsync: jest.fn(async () => {}), localUri: '' }) } }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => {}) }));
jest.mock('expo-constants', () => ({ default: { expoConfig: {} } }));
jest.mock('expo-font', () => ({ loadAsync: jest.fn(async () => {}) }));
jest.mock('expo-speech-recognition', () => ({}));
jest.mock('expo-updates', () => ({}));

import { useGameStore } from '../app/state/gameStore';
import { getRaces, getFactions } from '../app/engine/character';
import type { InventoryItem } from '../app/engine/types';

async function boot(name: string) {
  const store = useGameStore;
  await store.getState().hydrate();
  await store.getState().startNewGame({ name, raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
  store.getState().skipTutorial?.();
  return store;
}

// Acid Flask = Aether Dust ×1 + Scrap Metal ×1. We supply Aether Dust by name
// and a metal-tagged misc piece that substitutes for the Scrap Metal.
function loadout(): InventoryItem[] {
  return [
    { id: 'dust1', name: 'Aether Dust', kind: 'misc', quantity: 1, tags: [] },
    { id: 'bracket1', name: 'Scrap Bracket', kind: 'misc', quantity: 1, tags: ['metal'] },
  ];
}

describe('OTA-439 — craft substitution confirmation', () => {
  beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

  it('prompts (does not craft) when a craft would consume a substitute', async () => {
    const store = await boot('Tinker');
    store.setState((s) => ({ player: { ...s.player!, inventory: loadout() } }));

    store.getState().submitPlayerAction('craft Acid Flask');

    const prompt = store.getState().craftSubstitutionPrompt;
    expect(prompt).not.toBeNull();
    expect(prompt!.recipeResult).toBe('Acid Flask');
    expect(prompt!.subsList).toMatch(/Scrap Bracket → Scrap Metal/);
    const inv = store.getState().player!.inventory;
    expect(inv.some((i) => i.name === 'Acid Flask')).toBe(false); // not crafted yet
    expect(inv.some((i) => i.id === 'bracket1')).toBe(true);       // substitute intact
  });

  it('confirm crafts the item and consumes the substitute', async () => {
    const store = await boot('Tinker2');
    store.setState((s) => ({ player: { ...s.player!, inventory: loadout() } }));
    store.getState().submitPlayerAction('craft Acid Flask');
    expect(store.getState().craftSubstitutionPrompt).not.toBeNull();

    store.getState().confirmCraftSubstitution();

    const inv = store.getState().player!.inventory;
    expect(inv.some((i) => i.name === 'Acid Flask')).toBe(true);   // crafted
    expect(inv.some((i) => i.id === 'bracket1')).toBe(false);      // substitute consumed
    expect(store.getState().craftSubstitutionPrompt).toBeNull();
    expect(store.getState().craftSubConfirmedFor).toBeNull();
  });

  it('cancel leaves the pack untouched', async () => {
    const store = await boot('Tinker3');
    store.setState((s) => ({ player: { ...s.player!, inventory: loadout() } }));
    store.getState().submitPlayerAction('craft Acid Flask');
    expect(store.getState().craftSubstitutionPrompt).not.toBeNull();

    store.getState().cancelCraftSubstitution();

    const inv = store.getState().player!.inventory;
    expect(inv.some((i) => i.name === 'Acid Flask')).toBe(false);  // not crafted
    expect(inv.some((i) => i.id === 'bracket1')).toBe(true);       // substitute kept
    expect(store.getState().craftSubstitutionPrompt).toBeNull();
  });
});
