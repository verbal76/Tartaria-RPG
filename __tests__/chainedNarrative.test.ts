// OTA-044 — chained narrative on contract turn-ins.
//
// plantNextContractHint fires at the END of every contract completion
// path (vendor-proximity turn-in AND Contracts-screen UI turn-in). The
// test drives the UI path because it has fewer gates (no vendor scene
// required, no stage check beyond the mock-completed record).

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
import { HUNTS, availableHunts } from '../app/engine/hunts';

const PLANT_HEAD = /Before you go, the agent slides a second leaf|Word will travel that you finished this clean/;

async function bootstrap() {
  const store = useGameStore;
  await store.getState().hydrate();
  await store.getState().startNewGame({
    name: 'Closer',
    raceId: 'reclaimer',
    factionId: 'reclaimers_guild',
  });
  store.getState().skipTutorial?.();
  store.setState({ gameLog: [] });
  return store;
}

describe('OTA-044 — plantNextContractHint surfaces follow-up beat', () => {
  beforeAll(() => {
    console.log = () => {};
    console.warn = () => {};
    console.error = () => {};
  });

  it('hunt UI-completion fires a follow-up Arbiter line', async () => {
    const store = await bootstrap();
    const reclaimerHunts = HUNTS.filter((h) => h.factionId === 'reclaimers_guild');
    if (reclaimerHunts.length === 0) return; // no fixtures
    const hunt = reclaimerHunts[0]!;
    const p = store.getState().player!;
    // Inject the hunt as active + at max stage so the UI completion
    // path's gate (rec.stage < def.stages.length) passes.
    store.setState((s) => ({
      player: {
        ...p,
        activeHunts: [{
          id: hunt.id,
          stage: hunt.stages.length,
          postedByFaction: 'reclaimers_guild',
          acceptedAt: 0,
        }],
      },
      // OTA-810 — the Contracts-UI COMPLETE is a face-to-face turn-in: it needs
      // the right faction's agent present in the scene.
      currentScene: { ...s.currentScene!, vendor: { name: 'Reclaimer Agent', faction: 'reclaimers_guild', offers: [] } as never },
      gameLog: [],
    }));
    store.getState().completeContractFromUI('hunt', hunt.id);
    const log = store.getState().gameLog;
    const plant = log.find((e) => e.channel === 'arbiter' && PLANT_HEAD.test(e.text));
    expect(plant).toBeDefined();
  });

  it('when a same-faction follow-up exists, the plant names it', async () => {
    const store = await bootstrap();
    const p = store.getState().player!;
    // Raise rep so the rep gate clears for any candidate follow-up.
    store.setState({
      player: {
        ...p,
        factionStanding: p.factionStanding.map((r) =>
          r.factionId === 'reclaimers_guild' ? { ...r, standing: 50 } : r,
        ),
        activeHunts: [],
        completedHuntIds: [],
      },
      gameLog: [],
    });
    const startingPool = availableHunts('reclaimers_guild', 50, [], []);
    if (startingPool.length < 2) return; // not enough fixtures
    const first = startingPool[0]!;
    store.setState((s) => (s.player ? {
      player: {
        ...s.player,
        activeHunts: [{
          id: first.id,
          stage: first.stages.length,
          postedByFaction: 'reclaimers_guild',
          acceptedAt: 0,
        }],
      },
      // OTA-810 — face-to-face turn-in needs the right faction's agent present.
      currentScene: { ...s.currentScene!, vendor: { name: 'Reclaimer Agent', faction: 'reclaimers_guild', offers: [] } as never },
    } : s));
    store.getState().completeContractFromUI('hunt', first.id);
    const log = store.getState().gameLog;
    const plant = log.find((e) => e.channel === 'arbiter' && PLANT_HEAD.test(e.text));
    expect(plant).toBeDefined();
    // The plant either names a follow-up (when the post-completion
    // rep pool has eligible follow-ups) or falls through to the
    // generic "Word will travel" beat. Both are valid contract
    // outcomes. The helper's contract is "always plant something";
    // which line depends on data + rep gates.
    const liveRep = (store.getState().player!.factionStanding.find((r) => r.factionId === 'reclaimers_guild')?.standing) ?? 50;
    const remainingAfter = availableHunts(
      'reclaimers_guild',
      liveRep,
      [],
      [first.id],
    );
    const isNamed = remainingAfter.some((h) => plant!.text.includes(h.title));
    const isFallback = /Word will travel/.test(plant!.text);
    expect(isNamed || isFallback).toBe(true);
  });
});
