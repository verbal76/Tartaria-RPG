// arb-fix (playtest) — an unlootable signature weapon (the Order's Hollow Edge) prints
// a long "you can't take it" paragraph when left on a body. Clearing two enforcers in
// one scene printed it twice back-to-back. The full reason should show once per scene;
// later leaves of the same weapon get a one-line acknowledgement instead.

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
import { getRaces, getFactions } from '../app/engine/character';
import { findEnemyByName } from '../app/engine/encounter';

const REASON = 'You crouch for the blade — the Hollow Edge, honed along the grip so only a trained Order hand can take it up. You leave it where it fell.';

function mkEnforcer() {
  const proto = findEnemyByName('Silt Serpent') ?? findEnemyByName('Mud Spider');
  const e = JSON.parse(JSON.stringify(proto));
  return {
    ...e,
    name: 'True Tartarians Patrol',
    type: 'Human',
    carries: { weapons: [], armor: [], tc: 0 },
    signatureWeapon: { name: 'Hollow Edge', reason: REASON },
  };
}

async function boot() {
  const store = useGameStore;
  await store.getState().hydrate();
  await store.getState().startNewGame({ name: 'Verbal', raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
  store.getState().skipTutorial?.();
  return store;
}

const reasonCount = () =>
  useGameStore.getState().gameLog.filter((e) => e.text === REASON).length;
const shortCount = () =>
  useGameStore.getState().gameLog.filter((e) => e.text.includes('the same locked grip as before')).length;

describe('signature-weapon leave line is deduped per scene', () => {
  beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

  it('full reason once, short nod on the second enforcer in the same scene', async () => {
    const store = await boot();
    const scene = store.getState().currentScene!;
    store.setState({
      currentScene: {
        ...scene,
        enemies: [mkEnforcer(), mkEnforcer()],
        enemyHps: [10, 10],
        activeEnemyIdx: 0,
        enemyKnockedOut: [true, true],
        enemyAmbushUsed: [false, false],
        signatureWeaponsExplained: undefined,
      },
    });

    store.getState().lootKnockedOutEnemy();
    expect(reasonCount()).toBe(1);
    expect(shortCount()).toBe(0);

    store.getState().lootKnockedOutEnemy();
    expect(reasonCount()).toBe(1);       // full paragraph did NOT repeat
    expect(shortCount()).toBe(1);        // short acknowledgement instead
  });
});
