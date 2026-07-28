// OTA-671 — stumbling onto the Parley of Factions no longer silently commits you.
// handleBroker raises a pendingMissionOffer (announce + demands); ACCEPT commits the
// broker mission, DECLINE walks away and sets brokerOfferDeclined so ambient pokes
// don't re-pop the prompt. This exercises the accept/decline store actions directly.

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

async function freshGame() {
  const store = useGameStore;
  await store.getState().hydrate();
  const race = getRaces()[0]!;
  const fac = getFactions()[0]!;
  await store.getState().startNewGame({ name: 'Envoy', raceId: race.id, factionId: fac.id });
  store.getState().skipTutorial?.();
  return store;
}

const OFFER = {
  kind: 'broker' as const,
  factionA: 'reclaimers_guild',
  factionB: 'stone_builders',
  title: 'Broker an Alliance?',
  body: 'demands…',
};

describe('parley offer — accept / decline (OTA-671)', () => {
  beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

  it('ACCEPT commits the broker mission with the offered factions and clears the offer', async () => {
    const store = await freshGame();
    const p0 = store.getState().player!;
    // No mission yet; an offer is on screen (as handleBroker would have raised it).
    store.setState({ player: { ...p0, brokerMission: undefined, brokerOfferDeclined: false }, pendingMissionOffer: OFFER });

    store.getState().acceptMissionOffer();

    const after = store.getState();
    expect(after.pendingMissionOffer).toBeNull();
    expect(after.player!.brokerMission).toBeTruthy();
    expect(after.player!.brokerMission!.factionA).toBe('reclaimers_guild');
    expect(after.player!.brokerMission!.factionB).toBe('stone_builders');
    expect(after.player!.brokerMission!.done).toBeFalsy();
    expect(after.player!.brokerOfferDeclined).toBe(false);
  });

  it('DECLINE creates no mission and latches brokerOfferDeclined', async () => {
    const store = await freshGame();
    const p0 = store.getState().player!;
    store.setState({ player: { ...p0, brokerMission: undefined, brokerOfferDeclined: false }, pendingMissionOffer: OFFER });

    store.getState().declineMissionOffer();

    const after = store.getState();
    expect(after.pendingMissionOffer).toBeNull();
    expect(after.player!.brokerMission ?? null).toBeNull();
    expect(after.player!.brokerOfferDeclined).toBe(true);
  });

  it('accept with no pending offer is a safe no-op', async () => {
    const store = await freshGame();
    const p0 = store.getState().player!;
    store.setState({ player: { ...p0, brokerMission: undefined }, pendingMissionOffer: null });
    expect(() => store.getState().acceptMissionOffer()).not.toThrow();
    expect(store.getState().player!.brokerMission ?? null).toBeNull();
  });
});
