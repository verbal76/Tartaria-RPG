// OTA-1092 — Wandering NPCs. The open road occasionally puts a PERSON in front of
// you (not a vendor, not an animal) you can talk to. Greeting / persuading is a
// d20 + CHA check for a small payoff; one read per wanderer.
//   - pure helpers: deterministic build, reward tiers, fail line
//   - store: talking consumes the wanderer (one-shot); a strong talker gets a reward

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
  makeWanderer, rollWandererReward, wandererFailLine, WANDERER_TALK_DC,
} from '../app/engine/wanderers';

beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

describe('OTA-1092 — wanderer helpers', () => {
  it('makeWanderer is deterministic in its seed', () => {
    const a = makeWanderer(12345);
    const b = makeWanderer(12345);
    expect(a).toEqual(b);
    expect(a.name).toBeTruthy();
    expect(a.role).toMatch(/./);
    expect(a.greeting).toMatch(/./);
  });
  it('reward tiers: tip < coins < standing by the roll band', () => {
    const w = makeWanderer(1);
    expect(rollWandererReward(w, 0.1, 0.5).kind).toBe('tip');
    expect(rollWandererReward(w, 0.6, 0.5).kind).toBe('tc');
    const coin = rollWandererReward(w, 0.6, 0.9);
    expect(coin.amount).toBeGreaterThanOrEqual(6);
    expect(coin.amount).toBeLessThanOrEqual(15);
    expect(rollWandererReward(w, 0.95, 0.5).kind).toBe('standing');
  });
  it('fail line names the wanderer', () => {
    const w = makeWanderer(2);
    expect(wandererFailLine(w)).toContain(w.name);
  });
  it('DC is a real but forgiving check', () => {
    expect(WANDERER_TALK_DC).toBe(12);
  });
});

// NOTE — the wanderer TALK store flow was reshaped into the two-button PARLEY in
// OTA-1093; covered by __tests__/ota808Parley.test.ts. The pure helpers above remain.
