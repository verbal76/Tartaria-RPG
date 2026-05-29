// OTA-164 — regression lock for the hub-room roomKey alignment.
// Pre-fix, ExplorationScreen.tsx built 5 inline roomKeys without
// the @${hubRoomId} suffix that makeRoomKey appends for hub
// interiors. The modal UI read consumed-noun flags from
// "locId@mm@x,y" while the action handlers wrote them through
// "locId@mm@x,y@hubId" — so in any hub room (Reclaimers' Outpost
// The Gate / Square / Armory / Mess, etc.), every chip looked
// fresh in the modal even after consumption. The playtester
// reported tapping SALVAGE ALL once at The Gate, getting 4
// successful salvages, then 5 more taps each producing the same
// "Already worked over: ..." spam because the modal kept showing
// the consumed nouns as fresh chips.
//
// Fix: makeRoomKey exported from gameStore and used at all 5
// ExplorationScreen sites + 1 stale inline in gameStore. The hub
// suffix now lines up across UI reads and action writes.

jest.setTimeout(15000);

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
      static createAsync = jest.fn(async () => ({ sound: { playAsync: jest.fn(async () => {}), unloadAsync: jest.fn(async () => {}) } }));
    },
  },
}));

import { makeRoomKey } from '../app/state/gameStore';

describe('OTA-164 — makeRoomKey aligns hub vs non-hub keys', () => {
  it('non-hub call produces locId@mm@x,y (no trailing suffix)', () => {
    const k = makeRoomKey('tartarian_outskirts', null, 5, 7);
    expect(k).toBe('tartarian_outskirts@_@5,7');
  });

  it('hub call appends @${hubRoomId}', () => {
    const k = makeRoomKey('tartarian_outskirts', null, 5, 7, 'gate');
    expect(k).toBe('tartarian_outskirts@_@5,7@gate');
  });

  it('hub vs non-hub at same coords produce DIFFERENT keys', () => {
    const nonHub = makeRoomKey('tartarian_outskirts', null, 5, 7);
    const hub = makeRoomKey('tartarian_outskirts', null, 5, 7, 'gate');
    expect(nonHub).not.toBe(hub);
  });

  it('two different hub rooms at same coords produce DIFFERENT keys', () => {
    const gate = makeRoomKey('tartarian_outskirts', null, 5, 7, 'gate');
    const armory = makeRoomKey('tartarian_outskirts', null, 5, 7, 'armory');
    expect(gate).not.toBe(armory);
  });

  it('microMicroId is preserved in the key', () => {
    const k = makeRoomKey('drakova', 'central_chamber', 0, 0, 'throne');
    expect(k).toBe('drakova@central_chamber@0,0@throne');
  });

  it('null hubRoomId is treated as non-hub (no trailing suffix)', () => {
    const k = makeRoomKey('voronov', null, 1, 2, null);
    expect(k).toBe('voronov@_@1,2');
  });
});
