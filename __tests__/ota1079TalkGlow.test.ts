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
 * OTA-1079 — THE TALK GLOW MEANS "SOMETHING NEW TO HEAR".
 *
 * hasUnspokenTalk drives the TALK button's green state. The contract: it
 * answers with the SAME machinery the conversation itself uses (same person
 * match, same gate context, same spent-counter), so the light and the topic
 * list can never disagree — green while any gate-open topic has unread
 * lines, dark once the player has heard everything currently open, and
 * false for anyone the talk system itself cannot reach.
 */
jest.setTimeout(60_000);

import { useGameStore } from '../app/state/gameStore';

beforeAll(async () => {
  console.log = () => {}; console.warn = () => {}; console.error = () => {};
  await useGameStore.getState().hydrate();
  await useGameStore.getState().startNewGame({ name: 'Listener', raceId: 'reclaimer', factionId: 'reclaimers_guild' });
  useGameStore.getState().skipTutorial?.();
});

const scene = () => useGameStore.getState().currentScene!;
const putGrit = () => {
  useGameStore.setState({
    pendingTalk: null, pendingParley: null,
    currentScene: {
      ...scene(), enemies: [], enemyHps: [], wanderer: null,
      vendor: { id: 'roadside_991', name: 'Grit Maalen', faction: null, title: 'Road Hawker', offers: [] } as never,
    },
  });
};

describe('OTA-1079 — hasUnspokenTalk', () => {
  it('glows for a person with unheard dialogue', () => {
    putGrit();
    const wm = useGameStore.getState().worldMemory;
    useGameStore.setState({ worldMemory: { ...wm, talkedTopics: {} } });
    expect(useGameStore.getState().hasUnspokenTalk('Grit')).toBe(true);
  });

  it('⚠ goes DARK once every open topic is fully heard — via the real ask path', () => {
    putGrit();
    const wm = useGameStore.getState().worldMemory;
    useGameStore.setState({ worldMemory: { ...wm, talkedTopics: {} } });
    // Drain the conversation the way a player does: open it, raise every
    // topic until each reports spent. Gates can OPEN topics mid-conversation
    // only via state changes we are not making here, so this terminates.
    useGameStore.getState().talkToNpc('Grit');
    const t = useGameStore.getState().pendingTalk!;
    for (const topic of t.topics) {
      for (let i = 0; i < topic.lines.length; i++) {
        useGameStore.getState().raiseTopic(topic.id);
      }
    }
    useGameStore.getState().closeTalk();
    expect(useGameStore.getState().hasUnspokenTalk('Grit')).toBe(false);
  });

  it('false for somebody the talk system cannot reach', () => {
    putGrit();
    expect(useGameStore.getState().hasUnspokenTalk('Nobody Real')).toBe(false);
  });
});
