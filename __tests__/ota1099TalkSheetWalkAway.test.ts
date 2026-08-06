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

/**
 * OTA-1099 — THE TALK SHEET DOESN'T LOCK THE SCREEN, SO THE STORE MUST COVER
 * THE EXITS.
 *
 * The old TalkModal/ParleyModal were full-screen modals: while one was open,
 * nothing else was tappable, so no action could ever run with a conversation
 * half-open. The bottom sheets deliberately give that up — the feed and the
 * room chips stay live — which means a player can now act (tap a room chip,
 * a did-you-mean chip, anything that routes through submitPlayerAction)
 * mid-conversation. The store's contract: a REAL action walks away from the
 * conversation first, exactly as STOP TALKING / BACK OFF would; a silent
 * (LLM-internal) submission does not.
 */
jest.setTimeout(60_000);

import { useGameStore } from '../app/state/gameStore';

beforeAll(async () => {
  console.log = () => {}; console.warn = () => {}; console.error = () => {};
  await useGameStore.getState().hydrate();
  await useGameStore.getState().startNewGame({ name: 'Walker', raceId: 'reclaimer', factionId: 'reclaimers_guild' });
  useGameStore.getState().skipTutorial?.();
});

const scene = () => useGameStore.getState().currentScene!;
const openGritTalk = () => {
  useGameStore.setState({ pendingTalk: null, pendingParley: null, pendingRolls: null });
  useGameStore.setState({
    currentScene: {
      ...scene(), enemies: [], enemyHps: [], wanderer: null,
      vendor: { id: 'roadside_991', name: 'Grit Maalen', faction: null, title: 'Road Hawker', offers: [] } as never,
    },
  });
  useGameStore.getState().talkToNpc('Grit');
  expect(useGameStore.getState().pendingTalk).toBeTruthy();
};

describe('OTA-1099 — a real action walks away from the open conversation', () => {
  it('submitting an action while talking closes the talk, with the walk-away line', () => {
    openGritTalk();
    useGameStore.getState().submitPlayerAction('look around');
    expect(useGameStore.getState().pendingTalk).toBeNull();
    // ⚠ Search the whole log, not a slice from a length snapshot: the world-
    // channel 500ms debounce (HANDOFF #4) can MERGE the walk-away line into
    // the previous world card by mutating it, which a slice never sees.
    const all = useGameStore.getState().gameLog.map((e) => String(e.text)).join('\n');
    expect(all).toContain('You let the conversation go');
  });

  it('a silent (LLM-internal) submission does NOT count as walking away', () => {
    openGritTalk();
    useGameStore.getState().submitPlayerAction('look around', { silent: true });
    expect(useGameStore.getState().pendingTalk).toBeTruthy();
  });

  it('an open parley closes the same way', () => {
    useGameStore.setState({
      pendingTalk: null, pendingRolls: null,
      pendingParley: {
        targetName: 'a drifter', kind: 'human', temperament: 'wary',
        wisRevealed: false, topicsNpcId: null,
      } as never,
    });
    useGameStore.getState().submitPlayerAction('look around');
    expect(useGameStore.getState().pendingParley).toBeNull();
  });

  it('raising a topic does NOT close the conversation — the sheet stays up across asks', () => {
    // The owner's spec: the sheet persists until STOP TALKING. raiseTopic is
    // not submitPlayerAction; asking must never be mistaken for walking away.
    openGritTalk();
    const t = useGameStore.getState().pendingTalk!;
    useGameStore.getState().raiseTopic(t.topics[0]!.id);
    expect(useGameStore.getState().pendingTalk).toBeTruthy();
  });
});
