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

// OTA-1215 — THE BURST GUARD. The owner's device, within an hour of OTA-1213
// landing: INVESTIGATE ALL fired three `investigate <noun>` submits in one
// un-awaited loop, every submit's synchronous prefix matched the SAME hunt
// stage before the first queued advance landed, and the Bog Dragon hunt jumped
// THREE stages — the diplomacy beat skipped, the mid-hunt boss spawned into
// the marsh unannounced. One advance in flight per mission now; the burst's
// extras drop, and the next real action re-reads the fresh stage.
import { useGameStore } from '../app/state/gameStore';
import { getRaces, getFactions } from '../app/engine/character';
import { findHuntById } from '../app/engine/hunts';
import { huntStageAnchorId } from '../app/engine/contractMarkers';

jest.setTimeout(120000);

async function settle(pred: () => boolean, deadlineMs = 4000) {
  const t0 = Date.now();
  while (!pred() && Date.now() - t0 < deadlineMs) {
    await new Promise((r) => setTimeout(r, 15));
  }
}

describe("OTA-1215 — the owner's three-chip burst advances exactly ONE stage", () => {
  beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

  it('⚠⚠ an un-awaited INVESTIGATE ALL burst cannot double-fire a stage', async () => {
    const store = useGameStore;
    await store.getState().hydrate();
    await store.getState().startNewGame({ name: 'Burster', raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
    store.getState().skipTutorial?.();
    await settle(() => !!store.getState().currentScene);
    const def = findHuntById('hunt_bog_dragon')!;
    const p = store.getState().player!;
    useGameStore.setState({
      player: {
        ...p,
        // ⚠ P19 — the stage's OWN ground, not the contract's. Every hunt stage now names
        // a place; seeding the poster anchor lands the walker on the wrong tile.
        currentLocationId: huntStageAnchorId(def, 1),
        gridX: undefined, gridY: undefined, mapX: undefined, mapY: undefined,
        hubRoomId: null,
        activeHunts: [{ id: 'hunt_bog_dragon', stage: 1, tracked: true, postedByFaction: null, acceptedAt: 0 }],
      },
    });
    const scene = store.getState().currentScene!;
    useGameStore.setState({
      currentScene: { ...scene, enemies: [], hooks: [], ambientNouns: ['silt bank', 'shore', 'reeds'], displayedAmbientNouns: ['silt bank', 'shore', 'reeds'] },
    });
    // The device repro: the OTA-1183 INVESTIGATE ALL loop — one submit per
    // chip, no awaits between them.
    const nouns = ['silt bank', 'shore', 'reeds'];
    const burst = nouns.map((n) => store.getState().submitPlayerAction(`investigate ${n}`));
    await Promise.all(burst);
    await settle(() => (store.getState().player!.activeHunts?.[0]?.stage ?? 1) > 1);
    // Give any wrongly-queued extra advances every chance to land before judging.
    await new Promise((r) => setTimeout(r, 600));
    expect(store.getState().player!.activeHunts?.[0]?.stage).toBe(2);
  });
});
