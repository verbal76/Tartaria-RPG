// #1 fix — indoor "you move from room to room" leads were leaking onto the open
// road. Mid-journey the departure scene (a hub room) isn't rebuilt until the
// player arrives, so hubRoomId lingers and the wandering / look-around narration
// read as indoors while the player was walking cross-country. readsIndoorsForHooks
// now treats an active travel course as ON THE ROAD, regardless of the stale flag.


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


import { readsIndoorsForHooks } from '../app/state/gameStore';

describe('#1 — indoor hooks never fire on the open road', () => {
  it('reads indoors when genuinely in a hub room with no course set', () => {
    expect(readsIndoorsForHooks({ hubRoomId: 'room_hall', currentLocationId: 'outpost' })).toBe(true);
  });

  it('reads indoors when inside a building with no course set', () => {
    expect(readsIndoorsForHooks({ activeBuildingId: 'house_3', currentLocationId: 'city' })).toBe(true);
  });

  it('reads OUTDOORS when a travel course points at a different location, even with a stale hubRoomId', () => {
    expect(
      readsIndoorsForHooks({
        hubRoomId: 'room_hall',
        currentLocationId: 'asgardar',
        travelTarget: { locationId: 'drakova' },
      }),
    ).toBe(false);
  });

  it('reads OUTDOORS on an active whisper course, even with a stale hubRoomId', () => {
    expect(
      readsIndoorsForHooks({
        hubRoomId: 'room_hall',
        currentLocationId: 'asgardar',
        whisperCourse: { label: 'Yulka' },
      }),
    ).toBe(false);
  });

  it('still reads indoors when the travel target IS the current location (arrived / not underway)', () => {
    expect(
      readsIndoorsForHooks({
        hubRoomId: 'room_hall',
        currentLocationId: 'asgardar',
        travelTarget: { locationId: 'asgardar' },
      }),
    ).toBe(true);
  });

  it('reads outdoors on open ground with nothing set', () => {
    expect(readsIndoorsForHooks({ currentLocationId: 'wildtile' })).toBe(false);
    expect(readsIndoorsForHooks(null)).toBe(false);
  });
});
