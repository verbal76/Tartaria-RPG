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

// OTA-1059 — ONE THING, ONE BULLET. Found by walking the owner's Iskan-Veil log
// line by line against the new victory card: the Core Guardian gear drop is a
// SINGLE reward line carrying both pieces with a ✦ between them —
//   "✦ Veilkeeper Blades taken from X. ✦ Grey Leather of Iskan-Veil taken from X."
// The card strips only a LEADING ✦, so that one landed as a single bullet with a
// stray marker sitting in the middle of it. Split on the marker instead.
import { useGameStore } from '../app/state/gameStore';

jest.setTimeout(60000);

describe('OTA-1059 — the victory card gives each reward its own bullet', () => {
  beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });
  beforeEach(() => { useGameStore.setState({ missionCompleteNotice: null }); });

  it('the Core Guardian gear line becomes TWO bullets, neither carrying a ✦', () => {
    useGameStore.getState().raiseBossVictoryNotice('Veilkeeper Inarra', [], [
      '✦ Veilkeeper Blades taken from Veilkeeper Inarra. ✦ Grey Leather of Iskan-Veil taken from Veilkeeper Inarra.',
    ]);
    const n = useGameStore.getState().missionCompleteNotice!;
    expect(n.rewards).toEqual([
      'Veilkeeper Blades taken from Veilkeeper Inarra.',
      'Grey Leather of Iskan-Veil taken from Veilkeeper Inarra.',
    ]);
    for (const r of n.rewards) expect(r).not.toMatch(/✦/);
  });

  it('an ordinary single reward is untouched — nothing to split on', () => {
    useGameStore.getState().raiseBossVictoryNotice('Some Boss', [], [
      '✦ Boss spoils: Beast Fang, Elemental Core.',
      '+48 TC pried from the dust.',
    ]);
    const n = useGameStore.getState().missionCompleteNotice!;
    expect(n.rewards).toEqual([
      'Boss spoils: Beast Fang, Elemental Core.',
      '+48 TC pried from the dust.',
    ]);
  });

  it('the doubled ✦✦ flourish is emphasis, not a separator — still ONE bullet', () => {
    useGameStore.getState().raiseBossVictoryNotice('Some Boss', [], [
      '✦✦ BEACON RIFLE (Legendary) — built from the five collector-arrays.',
    ]);
    const n = useGameStore.getState().missionCompleteNotice!;
    expect(n.rewards.length).toBe(1);
    expect(n.rewards[0]).toBe('BEACON RIFLE (Legendary) — built from the five collector-arrays.');
  });

  it('splitting cannot resurrect a duplicate the card already carries', () => {
    const st = useGameStore.getState();
    st.raiseBossVictoryNotice('Some Boss', [], ['✦ Veilkeeper Blades taken. ✦ Grey Leather taken.']);
    st.raiseBossVictoryNotice('Some Boss', [], ['✦ Grey Leather taken.']);
    const n = useGameStore.getState().missionCompleteNotice!;
    expect(n.rewards).toEqual(['Veilkeeper Blades taken.', 'Grey Leather taken.']);
  });

  it('a plain mission notice splits the same way — one choke point, one rule', () => {
    useGameStore.getState().announceMissionComplete(
      'Hunt', 'Sable Ridge Cull', '✦ Hunt complete — Sable Ridge Cull. ✦ +300 TC.',
    );
    const n = useGameStore.getState().missionCompleteNotice!;
    expect(n.rewards).toEqual(['Hunt complete — Sable Ridge Cull.', '+300 TC.']);
  });
});
