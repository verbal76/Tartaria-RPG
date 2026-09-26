// I-005 / D-tutorial-scrap-plate-fragment-grants-nothing — production defect repair.
//
// The tutorial's 'scrap' beat narrated "✦ Plate Fragment x2 (Common). [salvaged]"
// and set tutorialPropsConsumed.chestPlate = true, but no grantItem/mergeOrPushItem
// call existed anywhere in that branch — and "Plate Fragment" does not exist
// anywhere in the item catalog (grepped app/, zero hits outside this one
// narration string). The tutorial told the player they received a reward that
// was never granted.
//
// The branch's own pre-existing comment says it "mirrors the salvage path's
// reward structure ... we don't need the random roll, just the verb teach" —
// so the intent was always a real, deterministic grant. The Broken Chest
// Plate tutorial prop (makeTutorialItem's 'chestPlate' case) is tagged
// 'metal' and its own description says it is "salvageable for the metal" —
// Scrap Metal is the real catalog material (app/data/items/materials.json)
// a metal-tagged scrap yields everywhere else in the game. Fix: grant 2x
// Scrap Metal via mergeOrPushItem and correct the reward line to match.
//
// This test drives the real production door: submitPlayerAction('scrap the
// chest plate') while the tutorial is on the 'scrap' beat.

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('onnxruntime-react-native', () => ({
  InferenceSession: { create: jest.fn(async () => ({ run: jest.fn(async () => ({})) })) },
  Tensor: class { constructor(_t: string, _d: unknown, _s: unknown[]) {} },
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
      static createAsync: () => Promise<{ sound: { playAsync: () => Promise<void>; unloadAsync: () => Promise<void> } }> =
        jest.fn(async () => ({ sound: { playAsync: jest.fn(async () => {}), unloadAsync: jest.fn(async () => {}) } }));
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
import { getRaces, getFactions } from '../app/engine/character';
import { TUTORIAL_STEPS } from '../app/components/tutorialSteps';

const store = useGameStore;
const get = () => store.getState();

async function standAtScrapBeat() {
  await get().hydrate();
  await get().startNewGame({ name: 'Walker', raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
  const scrapIdx = TUTORIAL_STEPS.findIndex((s) => s.id === 'scrap');
  expect(scrapIdx).toBeGreaterThanOrEqual(0);
  store.setState({ tutorialStep: scrapIdx });
}

describe('I-005 — the tutorial scrap beat actually grants what it narrates', () => {
  it('scrapping the chest plate grants 2 Scrap Metal, matching the reward line', async () => {
    await standAtScrapBeat();

    get().submitPlayerAction('scrap the chest plate');

    const scrap = get().player!.inventory.find((i) => i.name === 'Scrap Metal');
    expect(scrap).toBeDefined();
    expect(scrap!.quantity).toBe(2);
    expect(get().tutorialPropsConsumed.chestPlate).toBe(true);
  });

  it('merges onto an existing Scrap Metal stack rather than creating a duplicate row', async () => {
    await standAtScrapBeat();
    store.setState((s) => ({
      player: {
        ...s.player!,
        inventory: [...s.player!.inventory, {
          id: 'preexisting_scrap', name: 'Scrap Metal', kind: 'misc', rarity: 'Common', quantity: 3, tags: ['metal'],
        } as never],
      },
    }));

    get().submitPlayerAction('scrap the chest plate');

    const scrapRows = get().player!.inventory.filter((i) => i.name === 'Scrap Metal');
    expect(scrapRows.length).toBe(1);
    expect(scrapRows[0]!.quantity).toBe(5);
  });

  it('negative control: a non-scrap command on the scrap beat grants nothing', async () => {
    await standAtScrapBeat();

    get().submitPlayerAction('look around');

    const scrap = get().player!.inventory.find((i) => i.name === 'Scrap Metal');
    expect(scrap).toBeUndefined();
  });
});
