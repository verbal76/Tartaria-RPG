// ⚠⚠ OTA-1358 — THE SPRINT GATE + CLASSIFIER PARITY (built for the clicker crowd).
//
// Owner: "people will turn this into a speed run clicker." His fourth-freeze
// receipt priced that play style under the old rules: 14 generations wasted,
// 191 seconds of native compute in ~4.5 minutes, 9 of 10 scene intros
// discarded `cancelled:player-acted-again`, per-token cost degrading
// 1.8→31.1ms right up to the process death. Two defenses, both independent of
// which exact native call is the killer:
//   (1) SPRINT GATE — 3+ actions inside 4s means the player is sprinting; no
//       live narration and no bank fill STARTS (templates carry fast play, and
//       the device log shows `reason=sprinting` so the gate proves itself).
//   (2) CLASSIFIER PARITY — the one native ML engine outside the native-ML
//       lock joins it (inference AND session create), and its foreground
//       resume gets the same settled-foreground debounce the Qwen re-warm
//       earned in OTA-1287.
import { readFileSync } from 'fs';
import { join } from 'path';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('onnxruntime-react-native', () => ({
  InferenceSession: { create: jest.fn(async () => ({ run: jest.fn(async () => ({})) })) },
  Tensor: class { constructor(_t: string, _d: unknown, _s: unknown[]) {} },
}));
jest.mock('llama.rn', () => ({ initLlama: jest.fn(async () => ({ completion: jest.fn(async () => ({ text: '' })), release: jest.fn() })), releaseAllLlama: jest.fn() }));
jest.mock('react-native-executorch', () => ({}));
jest.mock('expo-file-system', () => ({ documentDirectory: '/tmp/', cacheDirectory: '/tmp/', getInfoAsync: jest.fn(async () => ({ exists: false })), makeDirectoryAsync: jest.fn(async () => {}), readAsStringAsync: jest.fn(async () => ''), writeAsStringAsync: jest.fn(async () => {}), deleteAsync: jest.fn(async () => {}), downloadAsync: jest.fn(async () => ({ uri: '' })), EncodingType: { UTF8: 'utf8', Base64: 'base64' } }));
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

// ⚠⚠ OTA-1398 — THE DETECTOR MOVED DOWN, AND THAT IS THE POINT OF THE MOVE. It is
// read by gameStore (the vendor-voice warm, the action pipeline) AND by the
// narration leaf (the sprint gate below), and it carries a mutable `let`, so it
// could not travel with either owner — assigning to an imported binding is a
// compile error. It went to `app/state/sprint.ts`, which neither owns.
import { notePlayerActionForSprint, playerIsSprinting, _resetSprintForTest } from '../app/state/sprint';

describe('OTA-1358 — the sprint gate and classifier parity', () => {
  beforeEach(() => _resetSprintForTest());

  it('⚠⚠ three actions inside the window is a sprint; a real pause ends it', () => {
    const t0 = 1_000_000;
    notePlayerActionForSprint(t0);
    notePlayerActionForSprint(t0 + 800);
    expect(playerIsSprinting(t0 + 900)).toBe(false); // two taps is just playing
    notePlayerActionForSprint(t0 + 1600);
    expect(playerIsSprinting(t0 + 1700)).toBe(true); // three in <4s is a sprint
    // One thoughtful pause and the Arbiter is back.
    expect(playerIsSprinting(t0 + 6000)).toBe(false);
  });

  it('⚠ a sustained clicker stays gated the whole run', () => {
    const t0 = 2_000_000;
    for (let i = 0; i < 40; i++) notePlayerActionForSprint(t0 + i * 700);
    expect(playerIsSprinting(t0 + 40 * 700)).toBe(true);
  });

  it('⚠⚠ source lock: the narrator gate exists, covers bank fills, and names itself in the log', () => {
    const src = readFileSync(join(__dirname, '..', 'app', 'state', 'gameStore.ts'), 'utf8')
      + '\n' + readFileSync(join(__dirname, '..', 'app', 'ai', 'narration.ts'), 'utf8');
    expect(src).toContain('const sprinting = playerIsSprinting();');
    // ⚠ OTA-1405 — the gate grew a term. `burnedRecently` is the evidence-driven
    // half: the sprint gate needs three actions to trip, so the FIRST generation
    // of a burst always starts, and only a discard can prove it was wasted.
    expect(src).toContain('|| cooldownActive || sprinting || burnedRecently)');
    expect(src).toContain("? 'sprinting'");
    expect(src).toContain("'burned-recently'");
    // ⚠⚠ OTA-1405 — AND IT IS FED FROM TWO DOORS, NOT ONE. This assertion used to
    // say "the same single door every action passes", and that premise was wrong:
    // `submitPlayerAction` is the door for TYPED and chip input only. Travelling,
    // entering a building and changing rooms are separate store actions, so a
    // player crossing the map by button was invisible to the detector — which is
    // why the owner's log shows thirteen scene intros started and nine of ten
    // discarded while the gate reported nothing. `beginScene` is the door every
    // scene intro is actually dispatched from.
    expect((src.match(/notePlayerActionForSprint\(\);/g) ?? []).length).toBeGreaterThanOrEqual(2);
    const bs = src.indexOf('  beginScene(opts?: {');
    expect(bs).toBeGreaterThan(-1);
    expect(src.slice(bs, bs + 2200)).toContain('notePlayerActionForSprint();');
  });

  it('⚠⚠ source lock: the classifier runs under the native-ML lock — create AND inference', () => {
    const src = readFileSync(join(__dirname, '..', 'app', 'ai', 'embedding', 'SemanticEmbeddingService.ts'), 'utf8');
    expect(src).toContain("import { runExclusiveNativeMl, ML_PRIORITY_LLM } from '../nativeMlLock';");
    expect(src).toContain('runExclusiveNativeMl(() => ort.InferenceSession.create(modelPath), ML_PRIORITY_LLM)');
    expect(src).toContain('runExclusiveNativeMl(() => session.run(feeds), ML_PRIORITY_LLM)');
    // No bare native call remains outside the lock.
    expect(src).not.toContain('await this.session.run(feeds)');
  });

  it('⚠ source lock: the classifier resume is debounced behind a settled foreground', () => {
    const src = readFileSync(join(__dirname, '..', 'App.tsx'), 'utf8');
    expect(src).toContain('const cognitiveResumeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);');
    expect(src).toContain('cognitiveResumeTimer.current = setTimeout(() => {');
    // The instant fire-on-every-active-twitch is gone: resumeCognitive is only
    // invoked inside the debounce timer now.
    const activeBranch = src.slice(src.indexOf("} else if (status === 'active') {"));
    const firstResume = activeBranch.indexOf('void resumeCognitive();');
    const timerAt = activeBranch.indexOf('cognitiveResumeTimer.current = setTimeout');
    expect(firstResume).toBeGreaterThan(timerAt); // the call sits inside the timer body
  });
});
