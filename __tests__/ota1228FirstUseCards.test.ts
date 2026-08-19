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

// OTA-1228 — FIRST-USE CARDS CATCH UP WITH THE FEATURE WAVE. The owner's audit ask:
// "we just added a lot of stuff, so let's make sure our first-time use pop-up cards
// are still good." Two real holes and two refreshes:
//   1. The Aetheric tab card predated the techniques entirely.
//   2. A FOUND Procedure Text (the zero-standing door) arrived with no instruction
//      and NO tap-action in the pack — the effect-gated USE button can't see an
//      item whose only action is reading it.
//   3./4. Vendor + Contracts cards gained the OTA-1224 host rules.
// ⚠ Every rewritten card carries a NEW id: dismissals are per-install, so edited
// copy under an old id is invisible to every tester who already dismissed it.
import { readFileSync } from 'fs';
import { join } from 'path';
import { AETHER_TECHNIQUES, techniqueTextName, isProcedureTextName } from '../app/engine/aetherTechniques';
import { useGameStore } from '../app/state/gameStore';
import { getRaces, getFactions } from '../app/engine/character';

jest.setTimeout(120000);

describe('OTA-1228 — one spelling of "is this a Procedure Text"', () => {
  it('recognises all four minted text names, and only them', () => {
    for (const t of AETHER_TECHNIQUES) {
      expect(isProcedureTextName(techniqueTextName(t))).toBe(true);
    }
    expect(isProcedureTextName('First Aid Kit')).toBe(false);
    expect(isProcedureTextName('Procedure Manual of Nothing')).toBe(false);
  });
});

describe('OTA-1228 — the Aetheric tab card tells the current truth', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { TAB_HINTS } = require('../app/screens/CraftingScreen') as typeof import('../app/screens/CraftingScreen');
  it('mentions the techniques, the texts, and still the disciplines', () => {
    const body = TAB_HINTS.aetheric.body;
    expect(body).toMatch(/Channel/);
    expect(body).toMatch(/Procedure Text/);
    expect(body).toMatch(/golem/); // the disciplines are still there, still named
  });
  it('⚠ carries a bumped id — edited copy under the old id is invisible to installs that dismissed it', () => {
    expect(TAB_HINTS.aetheric.id).toBe('crafting_tab_aetheric_v2');
    expect(TAB_HINTS.craft.id).toBeUndefined(); // unedited cards keep their ids
  });
});

describe('OTA-1228 — the refreshed screen cards carry new ids', () => {
  // ⚠ Narrow source pin, justified by the silent-no-op rule: reverting an id is
  // invisible at runtime (the card simply never shows again on tester installs).
  it('vendor and contracts render their v2 ids', () => {
    const vendor = readFileSync(join(__dirname, '..', 'app', 'screens', 'VendorScreen.tsx'), 'utf8');
    const contracts = readFileSync(join(__dirname, '..', 'app', 'screens', 'ContractsScreen.tsx'), 'utf8');
    expect(vendor).toContain('id="vendor_first_open_v2"');
    expect(contracts).toContain('id="contracts_first_open_v2"');
    const exploration = readFileSync(join(__dirname, '..', 'app', 'screens', 'ExplorationScreen.tsx'), 'utf8');
    expect(exploration).toContain('id="procedure_text_first"');
  });
});

describe('OTA-1228 — LIVE: the pack tap teaches, same as the typed read', () => {
  beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

  it('useInventoryItem on a held text learns the technique and consumes the text', async () => {
    const store = useGameStore;
    await store.getState().hydrate();
    await store.getState().startNewGame({ name: 'Reader', raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
    store.getState().skipTutorial?.();
    const tech = AETHER_TECHNIQUES[0]!;
    const textName = techniqueTextName(tech);
    const p = store.getState().player!;
    // INT high enough that the read is a clean teach, not a banked refusal.
    useGameStore.setState({
      player: {
        ...p,
        stats: { ...p.stats, intelligence: 18 },
        inventory: [...p.inventory, {
          id: 'txt_test', name: textName, kind: 'misc' as const, rarity: tech.tier,
          quantity: 1, tags: ['exploration', 'text', 'procedure', 'aether'],
        }],
      },
    });
    store.getState().useInventoryItem(textName);
    // The read path is async behind submitPlayerAction — poll, then judge.
    const t0 = Date.now();
    while (!(store.getState().player!.knownTechniques ?? []).includes(tech.id) && Date.now() - t0 < 4000) {
      await new Promise((r) => setTimeout(r, 15));
    }
    expect(store.getState().player!.knownTechniques ?? []).toContain(tech.id);
    expect(store.getState().player!.inventory.some((i) => i.name === textName && i.quantity > 0)).toBe(false);
  });
});
