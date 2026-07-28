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
  Audio: { setAudioModeAsync: jest.fn(), Sound: class { static createAsync: any = jest.fn(async () => ({ sound: { playAsync: jest.fn(), unloadAsync: jest.fn() } })); } },
}));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '0', applicationId: 'test' }));
jest.mock('expo-asset', () => ({ Asset: { fromModule: () => ({ downloadAsync: jest.fn(async () => {}), localUri: '' }) } }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => {}) }));
jest.mock('expo-constants', () => ({ default: { expoConfig: {} } }));
jest.mock('expo-font', () => ({ loadAsync: jest.fn(async () => {}) }));
jest.mock('expo-speech-recognition', () => ({}));
jest.mock('expo-updates', () => ({}));

// OTA-1029 — THE GREEN LIE. The weapon quick-buttons and the enemy panel kept
// their own copies of the reach resolver, which missed the forge stamp
// (uniqueStats.reachClass) on fused weapons — a close-only fused Resonant
// Spike glowed green at mid range while the attack gate refused every swing.
// One resolver now: playerWeaponReach, exported from the store, read by both.
import * as fs from 'fs';
import * as path from 'path';
import { playerWeaponReach } from '../app/state/gameStore';
import { reachBandsFor } from '../app/engine/types';

const APP = path.join(__dirname, '..', 'app');
const read = (...p: string[]) => fs.readFileSync(path.join(APP, ...p), 'utf8');

const basePlayer = (over: Record<string, unknown> = {}) => ({
  name: 'Reach', raceId: 'reclaimer', hp: 10, hpMax: 10,
  stats: { strength: 5, dexterity: 5, intelligence: 11, wisdom: 5, charisma: 5, stealth: 5 },
  inventory: [], equipped: {},
  ...over,
}) as any;

describe('OTA-1029 — one reach resolver for the gate AND the highlight', () => {
  it('a fused close-only weapon (forge-stamped melee) reaches ONLY close — the mid-range green lie is dead', () => {
    const spike = { id: 'f1', name: 'Test Resonant Spike', kind: 'weapon', quantity: 1, tags: ['fused', 'aetheric'], uniqueStats: { reachClass: 'melee' } };
    const p = basePlayer({ inventory: [spike], equipped: { main: spike.name, mainId: spike.id } });
    const reach = playerWeaponReach(p, 'main');
    expect(reach.bands).toEqual(['close']);
    expect(reach.bands.includes('mid' as any)).toBe(false);
    expect(reach.label).toBe('Test Resonant Spike');
  });

  it('the forge stamp OUTRANKS name classification (stamped ranged on a melee-sounding name)', () => {
    const dart = { id: 'f2', name: 'Test Iron Spike', kind: 'weapon', quantity: 1, tags: ['fused'], uniqueStats: { reachClass: 'ranged' } };
    const p = basePlayer({ inventory: [dart], equipped: { main: dart.name, mainId: dart.id } });
    expect(playerWeaponReach(p, 'main').bands).toEqual(['distant', 'far', 'mid', 'close']);
  });

  it('the off slot resolves the OFF-hand weapon: a throwable in the off hand reads far/mid/close', () => {
    const shard = { id: 't1', name: 'Test Loose Shard', kind: 'gear', quantity: 2, tags: ['throwable'] };
    const p = basePlayer({ inventory: [shard], equipped: { off: shard.name, offId: shard.id } });
    expect(playerWeaponReach(p, 'off').bands).toEqual(reachBandsFor('throwable'));
  });

  it('an empty hand is bare hands — close only', () => {
    const reach = playerWeaponReach(basePlayer(), 'main');
    expect(reach.label).toBe('Bare hands');
    expect(reach.bands).toEqual(['close']);
  });
});

describe('OTA-1029 — category lock: no local reach derivations in the UI', () => {
  const inputBox = read('components', 'InputBox.tsx');
  const exploration = read('screens', 'ExplorationScreen.tsx');
  const store = read('state', 'gameStore.ts');

  it('the store EXPORTS the one resolver', () => {
    expect(store.includes('export function playerWeaponReach(')).toBe(true);
  });

  it('InputBox tones through playerWeaponReach — its local copy is gone', () => {
    expect(inputBox.includes('playerWeaponReach(')).toBe(true);
    expect(inputBox.includes('bandsReachRange')).toBe(false);
    expect(inputBox.includes('reachClassFor')).toBe(false);
  });

  it("ExplorationScreen's in-range flag reads playerWeaponReach — its local copy is gone", () => {
    expect(exploration.includes('playerWeaponReach(')).toBe(true);
    expect(exploration.includes('reachClassFor')).toBe(false);
  });
});
