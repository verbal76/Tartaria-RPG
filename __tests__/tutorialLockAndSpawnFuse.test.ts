// arb108 — outpost tutorial lockdown + spawn-outpost fuse gate.
//  (1) During the outpost tutorial (name … explore_or_leave, pre-choice),
//      typed commands that aren't the beat's instructed verb are refused
//      (the button equivalents buzz). "fuse" used to execute mid-tutorial.
//  (2) The outpost Crucible (fuseAtCrucible / useVendorCrucible) is dead in
//      the SPAWN outpost — it only fires once the player has left to another
//      named location and returned (macroVisitSeq ≥ 1).

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

import { useGameStore } from '../app/state/gameStore';
import { TUTORIAL_STEPS } from '../app/components/tutorialSteps';

const beatIdx = (id: string) => TUTORIAL_STEPS.findIndex((s) => s.id === id);
const logText = () => useGameStore.getState().gameLog.map((e) => e.text).join('\n');

async function boot() {
  const store = useGameStore;
  await store.getState().hydrate();
  await store.getState().startNewGame({ name: 'Tester', raceId: 'reclaimer', factionId: 'reclaimers_guild' });
  return store;
}

describe('arb108 — outpost tutorial lockdown (typed commands)', () => {
  it('refuses a non-instructed typed command (fuse) during the cudgel beat', () => {
    const store = useGameStore;
    const p = store.getState().player!;
    store.setState({
      player: { ...p, hubRoomId: 'outpost_gate', macroVisitSeq: 0 },
      tutorialStep: beatIdx('cudgel'),
      tutorialExploreChosen: false,
      awaitingTutorialName: false,
      gameLog: [],
    });
    store.getState().submitPlayerAction('fuse');
    // Refused by the lockdown — never reaches the fuse routing / gate.
    expect(logText()).toMatch(/Not yet/i);
    expect(logText()).not.toMatch(/Need at least 3|first-timers/i);
  });

  it('lets the leave command through at the explore_or_leave beat', () => {
    const store = useGameStore;
    const p = store.getState().player!;
    store.setState({
      player: { ...p, hubRoomId: 'outpost_gate', macroVisitSeq: 0 },
      tutorialStep: beatIdx('explore_or_leave'),
      tutorialExploreChosen: false,
      gameLog: [],
    });
    store.getState().submitPlayerAction('leave outpost');
    // The leave is the beat's allowed action — it must NOT be refused.
    expect(logText()).not.toMatch(/Not yet/i);
  });

  beforeAll(async () => { await boot(); });
});

describe('arb108 — spawn-outpost fuse gate (macroVisitSeq)', () => {
  beforeAll(async () => { await boot(); });

  it('refuses the outpost Crucible in the spawn outpost (never left, seq 0)', async () => {
    const store = useGameStore;
    const p = store.getState().player!;
    store.setState({
      player: { ...p, hubRoomId: 'outpost_gate', macroVisitSeq: 0, fusionPending: false },
      tutorialStep: null,
      gameLog: [],
    });
    await store.getState().fuseAtCrucible();
    expect(logText()).toMatch(/first-timers/i);
    // Did NOT get to the input gate.
    expect(logText()).not.toMatch(/Need at least 3/i);
    expect(store.getState().player!.fusionPending).toBe(false);
  });

  it('allows the outpost Crucible once the player has left and returned (seq ≥ 1)', async () => {
    const store = useGameStore;
    const p = store.getState().player!;
    store.setState({
      player: { ...p, hubRoomId: 'outpost_gate', macroVisitSeq: 2, fusionPending: false, inventory: [] },
      tutorialStep: null,
      gameLog: [],
    });
    await store.getState().fuseAtCrucible();
    // Past the spawn gate → hits the input gate (no reserved items).
    expect(logText()).not.toMatch(/first-timers/i);
    expect(logText()).toMatch(/Need at least 3|Crucible hums, then cools/i);
  });
});
