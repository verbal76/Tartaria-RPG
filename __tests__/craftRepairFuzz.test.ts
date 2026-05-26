// OTA-048 — craft / repair / recipe fuzz.
//
// Drive the craft + repair handlers with bad / weird / missing-fuel
// inputs. Asserts no throws, no negative inventory, no infinite TC.

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

const CRAFT_INPUTS = [
  // Real recipes (probably succeed without fuel — should fail-gracefully)
  'craft pulse scanner',
  'craft aetheric scanner',
  'craft mud scanner',
  // Bad / typo
  'craft pluse scanner',
  'craft aetherc',
  'craft',
  'craft   ',
  'craft xxxxx',
  'craft Excalibur',
  'craft a sword please',
  'craft 999999999',
  // Empty / weird
  'craft ""',
  'craft <>',
  'craft\n\n',
  'craft \\u0000',
  // Mass craft attempts
  'craft 50 pulse scanners',
  'craft aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
];

const REPAIR_INPUTS = [
  'repair sword',
  'repair the sword',
  'repair',
  'repair xxxxx',
  'repair pulse scanner',
  'repair a',
  'repair ' + 'x'.repeat(100),
];

async function bootstrap() {
  const store = useGameStore;
  await store.getState().hydrate();
  await store.getState().startNewGame({
    name: 'Crafter',
    raceId: 'reclaimer',
    factionId: 'reclaimers_guild',
  });
  store.getState().skipTutorial?.();
  return store;
}

describe('OTA-048 — craft / repair fuzz', () => {
  beforeAll(() => {
    console.log = () => {};
    console.warn = () => {};
    console.error = () => {};
  });

  it('craft inputs do not throw + do not leave player in a bad state', async () => {
    const store = await bootstrap();
    const before = store.getState().player!;
    const errors: { input: string; err: string }[] = [];
    for (const input of CRAFT_INPUTS) {
      try {
        store.getState().submitPlayerAction(input);
      } catch (e) {
        errors.push({ input, err: e instanceof Error ? e.message : String(e) });
      }
    }
    expect(errors).toEqual([]);
    const after = store.getState().player!;
    // Inventory may have changed (if any recipe succeeded) but should
    // never have negative quantities.
    for (const item of after.inventory) {
      expect(item.quantity).toBeGreaterThanOrEqual(0);
    }
    // TC never goes negative.
    expect(after.tc).toBeGreaterThanOrEqual(0);
    // HP / stamina shouldn't be touched by craft attempts.
    expect(after.hp).toBeGreaterThan(0);
    expect(after.name).toBe(before.name);
  });

  it('repair inputs do not throw', async () => {
    const store = await bootstrap();
    const errors: { input: string; err: string }[] = [];
    for (const input of REPAIR_INPUTS) {
      try {
        store.getState().submitPlayerAction(input);
      } catch (e) {
        errors.push({ input, err: e instanceof Error ? e.message : String(e) });
      }
    }
    expect(errors).toEqual([]);
  });

  it('all three new scanner recipes (OTA-033) are at least findable by the engine', async () => {
    // Sanity check that the recipes shipped — the actual craft success
    // depends on having the fuel, which a fresh character may not. We
    // just verify the parser RECOGNIZES the recipe name and either
    // crafts or emits a missing-fuel refusal (not an "unknown recipe").
    const store = await bootstrap();
    for (const name of ['Pulse Scanner', 'Aetheric Scanner', 'Mud Scanner']) {
      store.setState({ gameLog: [] });
      store.getState().submitPlayerAction(`craft ${name}`);
      const log = store.getState().gameLog.map((e) => e.text).join('\n').toLowerCase();
      const recognized = !log.includes('don\'t know how to craft') && !log.includes('not a recipe');
      expect(recognized).toBe(true);
    }
  });
});
