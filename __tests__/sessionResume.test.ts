// OTA-046 — persistent change between sessions.
//
// On slot-load, if the player's lastSessionEndedAt is ≥6 hours old,
// loadSlotIntoGame fires one beat from WHILE_AWAY_LINES between the
// world cue and the Arbiter welcome. If the gap is <6 hours, no beat.

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
import { saveSlot } from '../app/engine/saveSystem';

const AWAY_CUES = /chewed on something|came back to me|patient.*wasn't quiet|Word travelled|wind has shifted|Reclaimers have passed|Mud Monarch heralds left|Whispers carried|trader changed routes|Forgotten Order pilgrim|standing-board|Aetheric grid hum/;

async function bootstrapAndSave() {
  const store = useGameStore;
  await store.getState().hydrate();
  await store.getState().startNewGame({
    name: 'Resumer',
    raceId: 'reclaimer',
    factionId: 'reclaimers_guild',
  });
  store.getState().skipTutorial?.();
  await store.getState().persist();
  return store;
}

describe('OTA-046 — while-you-were-away beat on slot-load', () => {
  beforeAll(() => {
    console.log = () => {};
    console.warn = () => {};
    console.error = () => {};
  });

  it('persist() stamps lastSessionEndedAt on the player snapshot', async () => {
    const store = await bootstrapAndSave();
    const p = store.getState().player!;
    expect(p.lastSessionEndedAt).toBeGreaterThan(0);
    // Should be very recent (within a few seconds).
    expect(Date.now() - (p.lastSessionEndedAt ?? 0)).toBeLessThan(5000);
  });

  it('load with lastSessionEndedAt 8h ago fires a while-away beat', async () => {
    const store = await bootstrapAndSave();
    const slotId = store.getState().activeSlotId;
    if (!slotId) return;
    // Move the player's last-end into the past by 8 hours and re-save.
    const eightHoursAgo = Date.now() - 8 * 60 * 60 * 1000;
    store.setState((s) => (s.player ? { player: { ...s.player, lastSessionEndedAt: eightHoursAgo } } : s));
    // Directly write the doctored player via the slot save fn so persist's
    // auto-stamp doesn't clobber lastSessionEndedAt back to "now."
    await saveSlot(slotId, {
      version: 1,
      savedAt: Date.now(),
      player: { ...store.getState().player!, lastSessionEndedAt: eightHoursAgo },
      worldMemory: store.getState().worldMemory,
      gameLog: [],
      currentScreen: 'exploration',
      currentScene: store.getState().currentScene ?? undefined,
      wastelandStepsSinceEncounter: 0,
    });
    // Now load — should fire a while-away beat.
    store.setState({ gameLog: [] });
    await store.getState().loadSlotIntoGame(slotId);
    const log = store.getState().gameLog;
    const away = log.find((e) => AWAY_CUES.test(e.text));
    expect(away).toBeDefined();
  });

  it('load with lastSessionEndedAt 1h ago does NOT fire a while-away beat', async () => {
    const store = await bootstrapAndSave();
    const slotId = store.getState().activeSlotId;
    if (!slotId) return;
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    await saveSlot(slotId, {
      version: 1,
      savedAt: Date.now(),
      player: { ...store.getState().player!, lastSessionEndedAt: oneHourAgo },
      worldMemory: store.getState().worldMemory,
      gameLog: [],
      currentScreen: 'exploration',
      currentScene: store.getState().currentScene ?? undefined,
      wastelandStepsSinceEncounter: 0,
    });
    store.setState({ gameLog: [] });
    await store.getState().loadSlotIntoGame(slotId);
    const log = store.getState().gameLog;
    const away = log.find((e) => AWAY_CUES.test(e.text));
    expect(away).toBeUndefined();
  });
});

describe('OTA-623 — resuming a save never carries a stale mid-tutorial state', () => {
  beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

  it('loadSlotIntoGame clears a stale tutorialStep (the SKIP-pill-on-resume bug)', async () => {
    const store = await bootstrapAndSave();
    const slotId = store.getState().activeSlotId;
    if (!slotId) return;
    // Simulate the precondition: the store is left mid-tutorial (the stale step
    // the old saveAndExit failed to clear). On resume it must be wiped.
    store.setState({ tutorialStep: 3, awaitingTutorialName: false, tutorialExploreChosen: false });
    await store.getState().loadSlotIntoGame(slotId);
    expect(store.getState().tutorialStep).toBeNull();
    expect(store.getState().currentScreen).toBe('exploration');
  });

  it('saveAndExitToTitle clears the tutorial state on the way out', async () => {
    const store = useGameStore;
    await store.getState().hydrate();
    await store.getState().startNewGame({ name: 'MidTut', raceId: 'reclaimer', factionId: 'reclaimers_guild' });
    // startNewGame arms the tutorial; simulate being part-way through it.
    store.setState({ tutorialStep: 3 });
    await store.getState().saveAndExitToTitle();
    expect(store.getState().tutorialStep).toBeNull();
    expect(store.getState().currentScreen).toBe('title');
  });
});
