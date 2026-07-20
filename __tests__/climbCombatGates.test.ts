// OTA-911 — combat affordances while on a climb: dodge and flee are refused
// (both hands on the rock; nowhere to run but down), and inventory/other verbs
// are unaffected. Great-climb entry needs the strap (legs) + a durable
// Reclaimer's Rope.

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

async function bootElevated() {
  const store = useGameStore;
  await store.getState().hydrate();
  await store.getState().startNewGame({ name: 'Cliffhanger', raceId: 'unknowing_mass', factionId: 'reclaimers_guild' });
  store.getState().skipTutorial?.();
  const p0 = store.getState().player!;
  // Put the player up a climb, mid-fight is not required for the dodge/flee gate.
  store.setState({
    currentScene: {
      ...store.getState().currentScene!,
      ambientNouns: ['tower'],
      elevatedOn: { noun: 'tower', tier: 2, totalTiers: 4 },
      enemies: [],
      enemyHps: [],
    },
    player: { ...p0, hp: 30, hpMax: 30, stamina: 8, staminaMax: 12 },
  });
  return store;
}

describe('OTA-911 — dodge / flee are off while elevated on a climb', () => {
  beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

  it('dodge is refused mid-climb, no stamina spent', async () => {
    const store = await bootElevated();
    const before = store.getState().player!.stamina;
    await store.getState().submitPlayerAction('dodge');
    const after = store.getState().player!;
    expect(after.stamina).toBe(before); // no roll, no cost
    // still no dodging stance applied
    expect((after.statusEffects ?? []).some((e) => e.kind === 'dodging')).toBe(false);
    const logs = store.getState().gameLog.map((e) => e.text).join('\n');
    expect(logs).toMatch(/can't dodge on the tower|no footing to weave/i);
  });

  it('flee is refused mid-climb', async () => {
    const store = await bootElevated();
    await store.getState().submitPlayerAction('flee');
    const logs = store.getState().gameLog.map((e) => e.text).join('\n');
    expect(logs).toMatch(/nowhere to run but straight down|hold your place/i);
  });

  it('on the ground the same verbs are NOT intercepted by the climb gate', async () => {
    const store = await bootElevated();
    // Drop to the ground.
    store.setState({ currentScene: { ...store.getState().currentScene!, elevatedOn: null } });
    await store.getState().submitPlayerAction('dodge');
    const logs = store.getState().gameLog.map((e) => e.text).join('\n');
    // The climb-specific refusal must NOT appear when grounded.
    expect(logs).not.toMatch(/can't dodge on the tower/i);
  });
});
