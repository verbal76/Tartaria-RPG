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

// OTA-1035 — RUNTIME: does a boss kill actually raise ONE card with the story on
// it? The rest of this OTA's coverage is source-locked; this drives the real
// store through a real defeat, because the capture window is the part that
// could silently stop collecting (or, worse, never close).
import { useGameStore } from '../app/state/gameStore';
import { findEnemyByName } from '../app/engine/encounter';

jest.setTimeout(60000);

const seedDefeat = (boss: boolean) => {
  const store = useGameStore;
  const base = findEnemyByName('Black Cloak Agent')!;
  const enemy = { ...base, name: boss ? 'Veilkeeper Testarra' : 'Some Thug', boss };
  store.setState((s) => ({
    missionCompleteNotice: null,
    currentScene: s.currentScene
      ? {
          ...s.currentScene,
          enemies: [enemy],
          enemyHps: [0],
          enemyAmbushUsed: [false],
          activeEnemyIdx: 0,
          range: 'close' as const,
        }
      : s.currentScene,
  }));
  store.getState().resolveEnemyDefeat();
  return store.getState();
};

describe('OTA-1035 — the victory card, for real', () => {
  beforeAll(async () => {
    console.log = () => {}; console.warn = () => {}; console.error = () => {};
    await useGameStore.getState().hydrate();
    await useGameStore.getState().startNewGame({ name: 'Tester', raceId: 'mud_dweller', factionId: 'mud_monarchs' });
    useGameStore.getState().skipTutorial?.();
  });

  it('a BOSS kill raises one card, headed VICTORY and named for the boss', () => {
    const st = seedDefeat(true);
    const n = st.missionCompleteNotice;
    expect(n).toBeTruthy();
    expect(n!.heading).toBe('VICTORY');
    expect(n!.title).toBe('Veilkeeper Testarra');
    // The take is on it — at minimum the kill itself.
    expect(n!.rewards.join(' | ')).toMatch(/Veilkeeper Testarra defeated/);
    // No line carries the feed's ✦ marker; the card draws its own.
    for (const r of n!.rewards) expect(r.startsWith('✦')).toBe(false);
  });

  it('an ORDINARY kill raises nothing — a rat does not get a popup', () => {
    useGameStore.setState({ missionCompleteNotice: null });
    const st = seedDefeat(false);
    expect(st.missionCompleteNotice).toBeNull();
  });

  it('the window shuts: narration after the fight does not join the card', () => {
    seedDefeat(true);
    const before = useGameStore.getState().missionCompleteNotice!;
    const beforeLen = before.flavor!.length + before.rewards.length;
    // Exactly the shape of the canned post-kill Arbiter beat in the owner's log.
    useGameStore.getState().appendLog('arbiter', '"Make the next strike count for two," the Arbiter says.');
    useGameStore.getState().appendLog('reward', '✦ Something unrelated later.');
    const after = useGameStore.getState().missionCompleteNotice!;
    expect(after.flavor!.length + after.rewards.length).toBe(beforeLen);
  });

  it('a job finished in the same fight merges into the card, not over it', () => {
    seedDefeat(true);
    useGameStore.getState().announceMissionComplete('Hunt', 'Some Other Job', '✦ Hunt complete — Some Other Job. +300 TC.');
    const n = useGameStore.getState().missionCompleteNotice!;
    expect(n.heading).toBe('VICTORY');              // still the victory card
    expect(n.title).toBe('Veilkeeper Testarra');
    expect(n.rewards.join(' | ')).toMatch(/Some Other Job/);
  });

  it('the card holds until dismissed', () => {
    seedDefeat(true);
    expect(useGameStore.getState().missionCompleteNotice).toBeTruthy();
    useGameStore.getState().clearMissionCompleteNotice();
    expect(useGameStore.getState().missionCompleteNotice).toBeNull();
  });
});
