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
import { blockAt } from '../test-utils/srcBlock';

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
    // ⚠ MEMBERSHIP, not tail position. This pin read `|| sprinting)` at OTA-1358
    // and `|| sprinting || burnedRecently)` at OTA-1405, and broke both times the
    // gate grew a term (OTA-1411 appended `inOutpostRoom`). An assertion that
    // fails whenever the gate GROWS pins line shape rather than the rule. Third
    // tail-anchored pin to rot this session — read the expression, check the term.
    const gate = src.slice(src.indexOf('if (!qwen.isReady() ||'), src.indexOf('if (opts?.bankOnly) return;'));
    expect(gate).toContain('cooldownActive');
    expect(gate).toContain('sprinting');
    expect(gate).toContain('burnedRecently');
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
    expect(blockAt(src, '  beginScene(opts?: {')).toContain('notePlayerActionForSprint();');
  });

  // ⚠⚠⚠ REBUILT BY OTA-1460 — THE EIGHTH LABEL-SHAPED PIN IN THREE DAYS.
  //
  // The CLAIM here is load-bearing and unchanged: every native call the classifier
  // makes — session CREATE and INFERENCE alike — goes through the exclusivity lock.
  // That is the guarantee that stopped a reproducible process SIGSEGV from Qwen and
  // Kokoro running concurrently, and it must never quietly lapse.
  //
  // ⚠ But it asserted that by quoting the import line VERBATIM, priority constant
  // included. OTA-1460 moved the classifier off ML_PRIORITY_LLM onto a new rank —
  // because the owner's log caught a 100ms classification taking 4954ms behind a
  // generation — and a test about LOCK COVERAGE failed over a PRIORITY CHANGE.
  //
  // ⚠ WHICH RANK IT USES IS NOT THIS TEST'S BUSINESS. That is OTA-1460's claim and
  // it is pinned in ota1460CognitionOutranksGeneration, where the ordering
  // properties live. Two tests owning one fact is how they end up disagreeing.
  // This one owns COVERAGE: is anything native left outside the lock?
  it('⚠⚠ source lock: the classifier runs under the native-ML lock — create AND inference', () => {
    const src = readFileSync(join(__dirname, '..', 'app', 'ai', 'embedding', 'SemanticEmbeddingService.ts'), 'utf8');
    // It imports the lock at all.
    expect(src).toMatch(/import \{[^}]*runExclusiveNativeMl[^}]*\} from '\.\.\/nativeMlLock';/);
    // ⚠ EVERY session create is wrapped — both of them (model path and fallback path).
    const creates = src.match(/ort\.InferenceSession\.create\(/g) ?? [];
    expect(creates.length).toBeGreaterThanOrEqual(2);
    const wrappedCreates = src.match(/runExclusiveNativeMl\(\(\) => ort\.InferenceSession\.create\(/g) ?? [];
    expect(wrappedCreates.length).toBe(creates.length);
    // ⚠ And the inference itself is wrapped, with a priority argument of some kind —
    // the lock's own signature requires one; which one is OTA-1460's business.
    expect(src).toMatch(/runExclusiveNativeMl\(\(\) => session\.run\(feeds\), ML_PRIORITY_[A-Z]+\)/);
    // No bare native call remains outside the lock.
    expect(src).not.toContain('await this.session.run(feeds)');
    // ⚠⚠ THE CATCH-ALL: every runExclusiveNativeMl call passes a priority. A bare
    // two-arg call silently defaults, which is exactly the omission that made
    // OTA-1452's teardown sit below the voice and hold 425MB nine seconds too long.
    //
    // ⚠ BOUNDED SPANS, NOT A PAREN-STOPPING PATTERN — the mistake ota1152 wrote
    // down and I made anyway on the first draft of this line. The wrapped call is
    // itself a call, so a non-greedy `\)` terminates at `create(modelPath)` and
    // never reaches the priority argument, failing on correct code.
    let from = 0;
    for (;;) {
      const at = src.indexOf('runExclusiveNativeMl(', from);
      if (at === -1) break;
      expect(src.slice(at, at + 220)).toMatch(/ML_PRIORITY_[A-Z]+/);
      from = at + 1;
    }
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
