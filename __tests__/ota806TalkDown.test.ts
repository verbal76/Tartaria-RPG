// OTA-806 — Talk down a fight. A diplomacy verb in combat is a real d20 + CHA
// contest that ENDS the encounter without a kill (distinct from fleeing — you keep
// the tile). Bosses refuse; failure costs the turn and draws the counter.
//   - pure helpers: DC scaling, boss block, verb/beast flavor
//   - store: high CHA persuade clears a weak beast fight; a boss refuses

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
import {
  talkDownDC, isTalkDownBlocked, isIntimidationVerb, isBeastPack,
} from '../app/engine/talkDown';
import type { Enemy } from '../app/engine/types';

beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

function beast(over: Partial<Enemy> = {}): Enemy {
  return {
    name: 'Ash Wolf', type: 'Beast', abilityPoint: '', attack: 'bite', damage: '1d4',
    hp: 8, rarity: 'Common', loot: [], ...over,
  };
}

describe('OTA-806 — talk-down helpers', () => {
  it('DC scales with count and the toughest tier', () => {
    expect(talkDownDC([beast()])).toBe(10);                              // lone Common
    expect(talkDownDC([beast(), beast()])).toBe(12);                     // +2 per extra
    expect(talkDownDC([beast({ rarity: 'Rare' })])).toBe(14);           // +2/tier ×2
    expect(talkDownDC([beast({ rarity: 'Rare' }), beast()])).toBe(16);  // toughest tier + extra
  });
  it('bosses refuse to parley', () => {
    expect(isTalkDownBlocked([beast()])).toBe(false);
    expect(isTalkDownBlocked([beast(), beast({ boss: true })])).toBe(true);
  });
  it('reads intimidation vs reasoned persuasion from the input', () => {
    expect(isIntimidationVerb('intimidate the wolf')).toBe(true);
    expect(isIntimidationVerb('threaten it')).toBe(true);
    expect(isIntimidationVerb('persuade the wolf to leave')).toBe(false);
  });
  it('a pack of animals is a beast pack; a Human in it is not', () => {
    expect(isBeastPack([beast(), beast()])).toBe(true);
    expect(isBeastPack([beast(), beast({ type: 'Human' })])).toBe(false);
  });
});

// NOTE — the in-combat talk-down STORE flow (single persuade/intimidate roll) was
// reshaped into the two-button PARLEY in OTA-808; that behavior is now covered by
// __tests__/ota808Parley.test.ts. The pure helpers above remain in use
// (isTalkDownBlocked still gates bosses out of a parley).
