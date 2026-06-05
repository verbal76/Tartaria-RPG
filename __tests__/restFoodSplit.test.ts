// arb37 — food / rest split. Eating heals HP (food → health, spammable to
// full); rest restores STAMINA only and never HP. This keeps food markets
// and food lore valuable: you top your health bar by eating, not sleeping.

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

jest.setTimeout(15000);

import { useGameStore } from '../app/state/gameStore';

const CLEAR_WEATHER = {
  id: 'clear', name: 'Clear Skies', description: 'A still, dry calm.',
  visibility: 10, travelPenalty: 0, corruptionChance: 0, tags: [] as string[],
};

async function boot() {
  const store = useGameStore;
  await store.getState().hydrate();
  await store.getState().startNewGame({ name: 'Eater', raceId: 'unknowing_mass', factionId: 'reclaimers_guild' });
  store.getState().skipTutorial?.();
  const scene = store.getState().currentScene!;
  store.setState({
    currentScene: {
      ...scene, weather: CLEAR_WEATHER, enemies: [], enemyHps: [],
      vendor: null, elevatedOn: null, hazard: null,
    },
  });
  return store;
}

describe('arb37 — food heals HP, rest restores stamina', () => {
  beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

  it('rest restores stamina but never HP', async () => {
    const store = await boot();
    const p = store.getState().player!;
    store.setState({ player: { ...p, hp: 10, hpMax: 30, stamina: 0, staminaMax: 10, corruption: 0 } });
    store.getState().submitPlayerAction('rest');
    const after = store.getState().player!;
    expect(after.stamina).toBeGreaterThan(0); // stamina recovered
    expect(after.hp).toBe(10);                 // HP untouched by rest
  });

  it('resting while wounded but full-stamina is refused and points you at food', async () => {
    const store = await boot();
    const p = store.getState().player!;
    store.setState({ player: { ...p, hp: 5, hpMax: 30, stamina: 10, staminaMax: 10, corruption: 0 } });
    const logLenBefore = store.getState().gameLog.length;
    store.getState().submitPlayerAction('rest');
    const after = store.getState().player!;
    expect(after.hp).toBe(5);       // not healed
    expect(after.stamina).toBe(10); // nothing to restore
    const newLogs = store.getState().gameLog.slice(logLenBefore).map((e) => e.text).join('\n');
    expect(newLogs).toMatch(/eat for that|knit wounds/i);
  });

  it('eating food heals HP', async () => {
    const store = await boot();
    const p = store.getState().player!;
    store.setState({
      player: {
        ...p, hp: 10, hpMax: 30, stamina: 10, staminaMax: 10,
        inventory: [
          ...p.inventory,
          { id: 'rations_test', name: 'Trail Rations', kind: 'consumable', rarity: 'Common', quantity: 3, tags: ['food'] },
        ],
      },
    });
    store.getState().submitPlayerAction('eat Trail Rations');
    const after = store.getState().player!;
    expect(after.hp).toBeGreaterThan(10); // food restored health
    expect(after.inventory.find((i) => i.name === 'Trail Rations')?.quantity).toBe(2);
  });

  it('food can be eaten repeatedly to top HP toward full', async () => {
    const store = await boot();
    const p = store.getState().player!;
    store.setState({
      player: {
        ...p, hp: 2, hpMax: 30, stamina: 10, staminaMax: 10,
        inventory: [
          ...p.inventory,
          { id: 'rations_spam', name: 'Trail Rations', kind: 'consumable', rarity: 'Common', quantity: 20, tags: ['food'] },
        ],
      },
    });
    for (let i = 0; i < 12; i++) store.getState().submitPlayerAction('eat Trail Rations');
    const after = store.getState().player!;
    expect(after.hp).toBe(after.hpMax); // reachable purely by eating
  });
});
