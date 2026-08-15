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
  Audio: { setAudioModeAsync: jest.fn(), Sound: class { static createAsync: any = jest.fn(async () => ({ sound: { playAsync: jest.fn(), unloadAsync: jest.fn() } })); } },
}));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '0', applicationId: 'test' }));
jest.mock('expo-asset', () => ({ Asset: { fromModule: () => ({ downloadAsync: jest.fn(async () => {}), localUri: '' }) } }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => {}) }));
jest.mock('expo-constants', () => ({ default: { expoConfig: {} } }));
jest.mock('expo-font', () => ({ loadAsync: jest.fn(async () => {}) }));
jest.mock('expo-speech-recognition', () => ({}));
jest.mock('expo-updates', () => ({}));

// OTA-1007 — THE POPUP THAT COULDN'T WAIT. The story-thread completion notice
// used to be raised the instant the terminal stage resolved, mounting the
// MissionCompleteModal on top of the thread modal the player was still
// reading. It is now STASHED on pendingHookContinue and raised only when the
// player taps COMPLETE (dismissHookContinue) on the final stage.
//
// OTA-1027 UPDATE — the held popup is retired entirely (owner: redundant next
// to the thread modal's own reward display; the modal now spotlights the
// payout in a YOUR REWARD strip). This suite now locks the popup-free flow:
// no mission-complete notice is raised at ANY point in a thread's life.
jest.setTimeout(30000);

import * as fs from 'fs';
import * as path from 'path';
import { useGameStore } from '../app/state/gameStore';
import type { Hook } from '../app/engine/hooks';

function footprintsHook(): Hook {
  return {
    id: 'complete_flow_prints',
    kind: 'footprints',
    nouns: ['footprints', 'prints', 'trail'],
    plantedLine: 'Boot prints cross the mud.',
    stage: 0,
    resolved: false,
  };
}

async function bootWithHook() {
  const store = useGameStore;
  await store.getState().hydrate();
  await store.getState().startNewGame({ name: 'Reader', raceId: 'unknowing_mass', factionId: 'reclaimers_guild' });
  store.getState().skipTutorial?.();
  const scene = store.getState().currentScene!;
  store.setState({
    currentScene: {
      ...scene,
      hooks: [footprintsHook()],
      ambientNouns: Array.from(new Set([...(scene.ambientNouns ?? []), 'footprints'])),
      enemies: [],
      vendor: null,
    },
    player: { ...store.getState().player!, stamina: 999, staminaMax: 999, hp: 99, hpMax: 99 },
    missionCompleteNotice: null,
  });
  return store;
}

describe('OTA-1007 — the completion popup waits for COMPLETE', () => {
  beforeAll(() => {
    console.log = () => {};
    console.warn = () => {};
    console.error = () => {};
  });

  it('no popup at ANY point: mid-thread, terminal stage, or the COMPLETE tap', async () => {
    const store = await bootWithHook();

    // Stage 1 (mid-thread): CONTINUE/ABANDON territory — nothing raised.
    store.getState().submitPlayerAction('investigate the footprints');
    let pending = store.getState().pendingHookContinue;
    expect(pending).not.toBeNull();
    expect(pending!.completed).toBe(false);
    expect(store.getState().missionCompleteNotice).toBeNull();

    // Terminal stage (grants items + TC): the payout rides the modal, no popup.
    store.getState().continueHook();
    pending = store.getState().pendingHookContinue;
    expect(pending).not.toBeNull();
    expect(pending!.completed).toBe(true);
    expect(pending!.stageHistory.some((st) => st.reward)).toBe(true); // the modal has the payout to spotlight
    expect(store.getState().missionCompleteNotice).toBeNull();

    // The COMPLETE tap: thread closes. Still no popup — the feed's ✦ line
    // and the modal's reward strip were the whole announcement.
    store.getState().dismissHookContinue();
    expect(store.getState().pendingHookContinue).toBeNull();
    expect(store.getState().missionCompleteNotice).toBeNull();
    const logs = store.getState().gameLog.map((e) => e.text).join('\n');
    expect(logs).toMatch(/✦ /);
  });

  it('a dismissal with no stash (mid-thread) raises nothing', async () => {
    const store = await bootWithHook();
    store.getState().submitPlayerAction('investigate the footprints');
    expect(store.getState().pendingHookContinue).not.toBeNull();
    store.getState().dismissHookContinue();                          // e.g. TRADE NOW mid-thread
    expect(store.getState().pendingHookContinue).toBeNull();
    expect(store.getState().missionCompleteNotice).toBeNull();
  });

  it('a stale CONTINUE on a resolved hook dismisses cleanly — still no popup', async () => {
    const store = await bootWithHook();
    store.getState().submitPlayerAction('investigate the footprints');
    store.getState().continueHook();                                 // terminal
    store.getState().continueHook();                                 // stale tap: hook resolved
    expect(store.getState().pendingHookContinue).toBeNull();
    expect(store.getState().missionCompleteNotice).toBeNull();       // no popup, by design
  });
});

describe('OTA-1007 — category lock: terminal stage shows COMPLETE alone', () => {
  const APP = path.join(__dirname, '..', 'app');
  const modal = fs.readFileSync(path.join(APP, 'components', 'HookContinueModal.tsx'), 'utf8');
  const store = fs.readFileSync(path.join(APP, 'state', 'gameStore.ts'), 'utf8');
  const screen = fs.readFileSync(path.join(APP, 'screens', 'ExplorationScreen.tsx'), 'utf8');

  it('the modal branches on completed: one COMPLETE button, scrim/back route through it', () => {
    expect(modal.includes('onComplete')).toBe(true);
    expect(modal.includes('COMPLETE ✦')).toBe(true);
    expect(modal.includes('{completed ? (')).toBe(true);
    expect(modal.includes('completed ? onComplete : onAbandon')).toBe(true);
  });

  it('the store never announces a story-thread popup at all', () => {
    expect(store.includes("announceMissionComplete('Story thread'")).toBe(false); // resolution-time popup gone
    expect(store.includes('completionNotice')).toBe(false);                       // OTA-1027: the stash is retired too
    expect(modal.includes('rewardStrip')).toBe(true);                             // the payout spotlight lives in-modal
  });

  it('the screen wires COMPLETE to dismissHookContinue', () => {
    expect(screen.includes('onComplete={dismissHookContinue}')).toBe(true);
  });
});
