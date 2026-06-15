// OTA 23-010 — Verifies the consumable-use narration picks the
// right verb. Playtest report: "you USE a first aid kit, you don't
// EAT it." Before this OTA all consumables were narrated as "You
// consume one X" — bland and wrong for non-food items.

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

async function setupConsumable(itemName: string) {
  const store = useGameStore;
  await store.getState().hydrate();
  await store.getState().startNewGame({ name: 'Eater', raceId: 'unknowing_mass', factionId: 'reclaimers_guild' });
  store.getState().skipTutorial?.();
  const p0 = store.getState().player!;
  // Strip any items that fuzzy-match the test target — Reclaimer
  // starter inventory includes Field Crafter's Kit which 'kit'
  // resolves to before First Aid Kit.
  const target = itemName.toLowerCase();
  const cleaned = p0.inventory.filter((i) => {
    const lc = i.name.toLowerCase();
    if (lc === target) return false;
    if (/kit$/.test(target) && /kit$/.test(lc)) return false;
    return true;
  });
  store.setState({
    player: {
      ...p0,
      hp: 5, hpMax: 30,
      inventory: [
        ...cleaned,
        { id: `cn_${itemName}`, name: itemName, kind: 'consumable', quantity: 1, tags: ['food'] },
      ],
    },
  });
  return store;
}

describe('OTA 23-010 — consumable narration picks the right verb', () => {
  beforeAll(() => {
    console.log = () => {};
    console.warn = () => {};
    console.error = () => {};
  });

  it('"eat first aid kit" narrates "you apply" (not "consume" / "eat")', async () => {
    const store = await setupConsumable('First Aid Kit');
    store.getState().submitPlayerAction('eat first aid kit');
    const logs = store.getState().gameLog.map((e) => e.text).join('\n');
    expect(logs).toMatch(/You apply the First Aid Kit/);
    expect(logs).not.toMatch(/You consume one First Aid Kit/);
  });

  it('"eat trail rations" still narrates "you eat" — food is food', async () => {
    const store = await setupConsumable('Trail Rations');
    store.getState().submitPlayerAction('eat trail rations');
    const logs = store.getState().gameLog.map((e) => e.text).join('\n');
    expect(logs).toMatch(/You eat the Trail Rations/);
  });

  it('"eat purification vial" reads as "you drink"', async () => {
    const store = await setupConsumable('Purification Vial');
    store.getState().submitPlayerAction('eat purification vial');
    const logs = store.getState().gameLog.map((e) => e.text).join('\n');
    expect(logs).toMatch(/You drink the Purification Vial/);
  });

  it('"use first aid kit" (use_relic path) still narrates "you use one"', async () => {
    // The OTA 002 use_relic path is unchanged — that narration
    // already reads correctly. Just confirming the dual path works.
    const store = await setupConsumable('First Aid Kit');
    store.getState().submitPlayerAction('use first aid kit');
    const logs = store.getState().gameLog.map((e) => e.text).join('\n');
    expect(logs).toMatch(/You use one First Aid Kit/);
  });
});

describe('OTA-618 — a max-HP-capped consumable heal reads as "topped off"', () => {
  beforeAll(() => {
    console.log = () => {};
    console.warn = () => {};
    console.error = () => {};
  });

  it('use Trail Rations with plenty of room heals the full +6 (no "topped off")', async () => {
    // setupConsumable leaves hp 5 / hpMax 30 → 25 room, so the fixed 6 lands whole.
    const store = await setupConsumable('Trail Rations');
    store.getState().submitPlayerAction('use trail rations');
    const logs = store.getState().gameLog.map((e) => e.text).join('\n');
    expect(logs).toMatch(/\+6 HP/);
    expect(logs).not.toMatch(/topped off/);
  });

  it('use Trail Rations near max caps the gain and labels it "topped off" (not a random roll)', async () => {
    const store = await setupConsumable('Trail Rations');
    store.setState((s) => ({ player: { ...s.player!, hp: s.player!.hpMax - 3 } })); // only 3 room
    store.getState().submitPlayerAction('use trail rations');
    const logs = store.getState().gameLog.map((e) => e.text).join('\n');
    expect(logs).toMatch(/\+3 HP \(topped off\)/);
  });
});
