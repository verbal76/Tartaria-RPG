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

// OTA-1010 — finishing a job is an EVENT, not a log line. Owner: "there needs to
// be a pop-up that hangs for a second to let you read that says that you
// completed a mission and give the name and the reward. I didn't even realize I
// completed the mission except for that the name of my escort was off the
// screen." On device a STORY THREAD paid out Trail Rations, Mud Essence and a
// Rare Golem Core — every word of it a feed line that scrolled away behind
// ambient chatter.
//
// The real problem was that "a mission completed" did not EXIST as a concept:
// seven separate sites hand-built a reward string and logged it. Fixing only the
// one the owner hit would leave six others just as missable, so this OTA creates
// the choke point and routes all seven through it. The source lock below is the
// part that keeps it true — an eighth completion site cannot log its way past.
import * as fs from 'fs';
import * as path from 'path';
import { useGameStore } from '../app/state/gameStore';

const STORE_SRC = fs.readFileSync(
  path.join(__dirname, '..', 'app', 'state', 'gameStore.ts'), 'utf8',
);

describe('OTA-1010 — a finished mission announces itself', () => {
  beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });
  beforeEach(() => { useGameStore.setState({ missionCompleteNotice: null }); });

  it('names the mission AND the reward, and holds until dismissed', () => {
    const st = useGameStore.getState();
    st.announceMissionComplete('Mystery', 'The Singing Stone of Ostragar', '✦ Mystery complete — The Singing Stone of Ostragar. +550 TC, +3 rep.');
    const n = useGameStore.getState().missionCompleteNotice!;
    expect(n).toBeTruthy();
    expect(n.kind).toBe('Mystery');
    expect(n.title).toBe('The Singing Stone of Ostragar');   // the NAME
    expect(n.rewards.join(' ')).toContain('+550 TC');        // the REWARD
    // Nothing auto-clears it: it is still there after the turn that raised it.
    expect(useGameStore.getState().missionCompleteNotice).toBeTruthy();
    useGameStore.getState().clearMissionCompleteNotice();
    expect(useGameStore.getState().missionCompleteNotice).toBeNull();
  });

  it('still writes the feed line — the log stays a complete record', () => {
    const before = useGameStore.getState().gameLog.length;
    useGameStore.getState().announceMissionComplete('Hunt', 'Sable Ridge Cull', '✦ Hunt complete — Sable Ridge Cull. +300 TC. Trophy recovered.');
    const added = useGameStore.getState().gameLog.slice(before);
    expect(added.some((e) => e.channel === 'reward' && /Hunt complete — Sable Ridge Cull/.test(e.text))).toBe(true);
  });

  it('one job, one popup: extra payouts merge instead of stacking', () => {
    // A story thread pays its finale AND a persistence bonus. Two popups fighting
    // each other is how the owner missed it in the first place.
    const st = useGameStore.getState();
    st.announceMissionComplete('Story thread', 'Bioluminescent Path', '✦ Trail Rations, Mud Essence.');
    st.announceMissionComplete('Story thread', 'Bioluminescent Path', '✦ For your persistence — Golem Core (Rare).');
    const n = useGameStore.getState().missionCompleteNotice!;
    expect(n.rewards.length).toBe(2);
    expect(n.title).toBe('Bioluminescent Path');
    expect(n.rewards.join(' ')).toContain('Golem Core');
    // The ✦ is the feed's marker, not the modal's — the modal draws its own.
    expect(n.rewards[0]!.startsWith('✦')).toBe(false);
  });

  it('a DIFFERENT job replaces the notice rather than merging into it', () => {
    const st = useGameStore.getState();
    st.announceMissionComplete('Hunt', 'Job A', '✦ Hunt complete — Job A. +10 TC.');
    st.announceMissionComplete('Mystery', 'Job B', '✦ Mystery complete — Job B. +20 TC.');
    const n = useGameStore.getState().missionCompleteNotice!;
    expect(n.title).toBe('Job B');
    expect(n.rewards.length).toBe(1);
  });

  it('CATEGORY LOCK: every completion path goes through the choke point', () => {
    // 7 call sites + 1 implementation. (The interface declaration uses a colon,
    // not a paren, so it is deliberately not counted here.)
    const calls = STORE_SRC.match(/announceMissionComplete\(/g) ?? [];
    expect(calls.length).toBe(8);
    // Every kind of job that can end is represented among them.
    for (const kind of ['Bounty', 'Contract', 'Hunt', 'Mystery', 'Storyline', 'Story thread']) {
      expect(STORE_SRC).toMatch(new RegExp(`announceMissionComplete\\(\\s*'${kind}'`));
    }
    // Two Hunt sites exist (board turn-in and pack turn-in); both must be wired.
    expect((STORE_SRC.match(/announceMissionComplete\(\s*'Hunt'/g) ?? []).length).toBe(2);
  });

  it('SOURCE LOCK: no completion may be logged straight to the feed again', () => {
    // The exact shape that made this invisible: a completion written directly
    // into the scrolling feed. Every one is now an announceMissionComplete call,
    // and this fails the build if a new one appears (one- or multi-line form).
    expect(STORE_SRC).not.toMatch(/appendLog\(\s*'reward',\s*`✦ [^`]*complete —/);
  });

  it('the modal is actually mounted, and holds rather than auto-dismissing', () => {
    const screen = fs.readFileSync(
      path.join(__dirname, '..', 'app', 'screens', 'ExplorationScreen.tsx'), 'utf8',
    );
    expect(screen).toContain('<MissionCompleteModal />');
    const modal = fs.readFileSync(
      path.join(__dirname, '..', 'app', 'components', 'MissionCompleteModal.tsx'), 'utf8',
    );
    // A dismiss button exists (holding, not a timed toast)...
    expect(modal).toContain('onPress={clear}');
    // ...and the only timer is a long safety valve, not a quick auto-hide.
    const ms = Number(/AUTO_CLOSE_MS = (\d+)/.exec(modal)?.[1] ?? 0);
    expect(ms).toBeGreaterThanOrEqual(8000);
  });
});
