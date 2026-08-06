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

// OTA-1060 — THE DOUBLE-DIAMOND PAYOFF GETS A CARD. Owner asked whether the ✦✦
// items read right on the awards popup. The text was fine — but the answer was
// that the ONE line written that way, the Beacon Rifle, could never reach a
// popup at all: it fires from a use-item path, nowhere near the boss-defeat
// capture window, so the payoff for all five great climbs (a Legendary weapon
// plus seven Legendary/Rare materials) announced itself exactly the way a mud
// cloth does. That is the failure OTA-1010 exists to prevent.
import * as fs from 'fs';
import * as path from 'path';
import { useGameStore } from '../app/state/gameStore';

jest.setTimeout(60000);
const STORE_SRC = fs.readFileSync(
  path.join(__dirname, '..', 'app', 'state', 'gameStore.ts'), 'utf8',
);

describe('OTA-1060 — a spotlight card works under any banner', () => {
  beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });
  beforeEach(() => { useGameStore.setState({ missionCompleteNotice: null }); });

  it('carries its own heading, story above the take', () => {
    useGameStore.getState().raiseSpotlightNotice(
      'BEACON RIFLE ASSEMBLED', 'Beacon Rifle (Legendary)',
      ['The whole thing wakes with a shriek of live current.'],
      ['Beacon Rifle (Legendary) — electrical bolt sheathed in acid.', 'Throne Shard ×2 (Legendary)'],
    );
    const n = useGameStore.getState().missionCompleteNotice!;
    expect(n.heading).toBe('BEACON RIFLE ASSEMBLED');
    expect(n.title).toBe('Beacon Rifle (Legendary)');
    expect(n.flavor).toEqual(['The whole thing wakes with a shriek of live current.']);
    expect(n.rewards.length).toBe(2);
  });

  it('the VICTORY card is just a spotlight with a different banner', () => {
    useGameStore.getState().raiseBossVictoryNotice('Veilkeeper Inarra', ['She slides down the wall.'], ['✦ +48 TC.']);
    const n = useGameStore.getState().missionCompleteNotice!;
    expect(n.heading).toBe('VICTORY');
    expect(n.title).toBe('Veilkeeper Inarra');
    expect(n.flavor).toEqual(['She slides down the wall.']);
    expect(n.rewards).toEqual(['+48 TC.']);
  });

  it('a spotlight is not clobbered by a job that finishes while it is up', () => {
    const st = useGameStore.getState();
    st.raiseSpotlightNotice('BEACON RIFLE ASSEMBLED', 'Beacon Rifle (Legendary)', ['x'], ['Beacon Rifle.']);
    st.announceMissionComplete('Hunt', 'Sable Ridge Cull', '✦ Hunt complete — Sable Ridge Cull. +300 TC.');
    const n = useGameStore.getState().missionCompleteNotice!;
    expect(n.heading).toBe('BEACON RIFLE ASSEMBLED');
    expect(n.rewards.join(' | ')).toMatch(/Sable Ridge Cull/);
  });
});

describe('OTA-1060 — SOURCE LOCKS', () => {
  it('the Beacon Rifle build raises the card, and the feed line still stands', () => {
    const start = STORE_SRC.indexOf('function assembleBeaconRifle(');
    const end = STORE_SRC.indexOf('/** ~18% of eligible roadside stalls');
    const body = STORE_SRC.slice(start, end);
    expect(body).toMatch(/raiseSpotlightNotice\(\s*\n\s*'BEACON RIFLE ASSEMBLED'/);
    // The log stays a complete record — the ✦✦ feed line is untouched.
    expect(body).toMatch(/appendLog\('reward', `✦✦ BEACON RIFLE \(Legendary\)/);
    // Every granted material is named on the card, not just the weapon.
    expect(body).toMatch(/\.\.\.mats\.map\(/);
  });

  it('raiseBossVictoryNotice delegates — one card implementation, not two', () => {
    const start = STORE_SRC.indexOf('raiseBossVictoryNotice(name, flavor, rewards) {');
    const body = STORE_SRC.slice(start, start + 220);
    expect(body).toMatch(/raiseSpotlightNotice\('VICTORY', name, flavor, rewards\)/);
  });

  it('✦✦ is emphasis, and the rifle is still the only line written that way', () => {
    // If a second double-diamond payout is ever authored it should get a card
    // too — this fails the build so that decision is made deliberately rather
    // than by copying the marker. Comment lines are excluded: several explain
    // the convention without being payouts.
    const emitters = STORE_SRC.split('\n')
      .filter((l) => l.includes('✦✦'))
      .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l));
    expect(emitters.length).toBe(1);
    expect(emitters[0]).toMatch(/BEACON RIFLE \(Legendary\)/);
  });
});
