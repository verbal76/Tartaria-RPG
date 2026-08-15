// OTA-1188 — LIVE PROOF FOR P3. A courier hand-in resolves from the wilds, pays the
// runner's rate, and costs the hours.
//
// ⚠ The source-pinning suite proves the wiring exists. This proves a player standing in
// open country with a finished mystery can actually close it — and that hunts standing in
// the same spot still cannot.
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
jest.mock('expo-av', () => ({ Audio: { setAudioModeAsync: jest.fn(), Sound: class { static createAsync: jest.Mock = jest.fn(async () => ({ sound: { playAsync: jest.fn(), unloadAsync: jest.fn() } })); } } }));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '0', applicationId: 'test' }));
jest.mock('expo-asset', () => ({ Asset: { fromModule: () => ({ downloadAsync: jest.fn(async () => {}), localUri: '' }) } }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => {}) }));
jest.mock('expo-constants', () => ({ default: { expoConfig: {} } }));
jest.mock('expo-font', () => ({ loadAsync: jest.fn(async () => {}) }));
jest.mock('expo-speech-recognition', () => ({}));
jest.mock('expo-updates', () => ({}));

import { useGameStore } from '../app/state/gameStore';

import { MYSTERIES } from '../app/engine/mysteries';
import { HUNTS } from '../app/engine/hunts';
import { COURIER_PLAYER_SHARE, COURIER_DELAY_HOURS } from '../app/engine/contractBroker';

jest.setTimeout(120000);

async function inTheWilds(extra: Record<string, unknown>) {
  const store = useGameStore;
  const p = store.getState().player!;
  useGameStore.setState({
    player: { ...p, currentLocationId: 'asgardar', hubRoomId: undefined, ...extra },
  });
  return store.getState();
}

describe('OTA-1188 — the courier, live', () => {
  beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

  test('⚠⚠ a mystery closes by runner from open country, at the runner’s rate', async () => {
    const store = useGameStore;
    await store.getState().hydrate();
    await store.getState().startNewGame({ name: 'Courier Probe', raceId: 'tartarian_giant', factionId: 'mud_monarchs' });
    store.getState().skipTutorial?.();

    const m = MYSTERIES.find((x) => x.factionId && x.factionId !== 'mud_monarchs')!;
    await inTheWilds({
      activeMysteries: [{
        id: m.id, stage: m.stages.length, postedByFaction: m.factionId, acceptedAt: Date.now(),
      }],
    });
    // ⚠ Premise: nobody is here. If a vendor were present this would prove the vendor path.
    expect(store.getState().currentScene?.vendor ?? null).toBeNull();

    const before = store.getState().player!;
    const tcBefore = before.tc ?? 0;
    const hoursBefore = before.hoursElapsed ?? 0;

    store.getState().submitPlayerAction?.(`send word ${m.title}`);
    const after = store.getState().player!;

    expect(after.completedMysteryIds ?? []).toContain(m.id);
    expect((after.tc ?? 0) - tcBefore).toBe(Math.max(1, Math.round(m.rewardTc * COURIER_PLAYER_SHARE)));
    // ⚠ and the hours were actually charged — the cost is the whole point
    expect((after.hoursElapsed ?? 0) - hoursBefore).toBeGreaterThanOrEqual(COURIER_DELAY_HOURS);
  });

  test('⚠⚠ a HUNT in the same spot is still refused — OTA-810 holds', async () => {
    const store = useGameStore;
    await store.getState().hydrate();
    await store.getState().startNewGame({ name: 'Courier Probe 2', raceId: 'tartarian_giant', factionId: 'mud_monarchs' });
    store.getState().skipTutorial?.();

    const h = HUNTS.find((x) => x.factionId)!;
    await inTheWilds({
      activeHunts: [{
        id: h.id, stage: h.stages.length, postedByFaction: h.factionId, acceptedAt: Date.now(),
      }],
    });
    store.getState().submitPlayerAction?.(`send word ${h.title}`);
    expect(store.getState().player!.completedHuntIds ?? []).not.toContain(h.id);
  });

  test('⚠ walking it in still beats sending it — the ladder holds in play', async () => {
    const store = useGameStore;
    await store.getState().hydrate();
    await store.getState().startNewGame({ name: 'Courier Probe 3', raceId: 'tartarian_giant', factionId: 'mud_monarchs' });
    store.getState().skipTutorial?.();

    const m = MYSTERIES.find((x) => x.factionId && x.factionId !== 'mud_monarchs')!;
    await inTheWilds({
      activeMysteries: [{
        id: m.id, stage: m.stages.length, postedByFaction: m.factionId, acceptedAt: Date.now(),
      }],
    });
    const tcBefore = store.getState().player!.tc ?? 0;
    store.getState().submitPlayerAction?.(`send word ${m.title}`);
    const couriered = (store.getState().player!.tc ?? 0) - tcBefore;
    expect(couriered).toBeLessThan(m.rewardTc);
  });
});
