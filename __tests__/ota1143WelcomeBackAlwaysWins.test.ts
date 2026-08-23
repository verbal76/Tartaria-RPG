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
// OTA-1143 — WELCOME BACK ALWAYS WINS.
//
// Owner, from the device: "the arbiter fired 3 lines when I started back in
// the save file." Then: "roll out the welcome back always wins."
//
// Three separate load-time systems each fired one arbiter line and nobody
// owned the TOTAL: the OTA-046 while-away beat (when it drew an
// arbiter-channel line), the OTA-849 offline world-recap, and the arb164
// named greeting. Come back after a day away and the voice read all three
// back to back.
//
// The rule now: THE ARBITER SPEAKS EXACTLY ONCE AT LOAD — the named greeting.
//   - The while-away beat draws from the pool's WORLD-channel lines only
//     (the arbiter-channel entries stay authored in the pool, just not
//     load-fired).
//   - The offline recap no longer prints its own line; it sets a pending flag
//     that the greeting consumes, splicing the recap INSIDE the greeting's
//     quote as a follow-on sentence — one continuous spoken hello.
//   - "Welcome back, {name}" still leads, every time (arb164 non-negotiable).
import { welcomeBackLine } from '../app/state/gameStore';
import type { PlayerCharacter } from '../app/engine/types';
import { blockAt } from '../test-utils/srcBlock';

// eslint-disable-next-line @typescript-eslint/no-require-imports
// ⚠ OTA-1394 — THE WELCOME-BACK CALL SITE MOVED. `welcomeBackLine` itself is
// still composed in gameStore, but everything that DECIDES when to say it —
// loadSlotIntoGame, the offline-recap flag, the WHILE_AWAY_LINES pool and the
// 60s debounce — went to `app/state/slices/slotSlice.ts` with slice 3. These
// pins follow it rather than being relaxed: what they hold down is that the
// greeting always names the player, which the owner asked for by name.
const STORE: string = require('fs').readFileSync(
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('path').join(__dirname, '..', 'app', 'state', 'slices', 'slotSlice.ts'), 'utf8');

const player = { name: 'Verbal Kint' } as unknown as PlayerCharacter;

describe('OTA-1143 — the greeting composes', () => {
  it('always greets by name — said WHOLE when it is short (OTA-1441)', () => {
    // RETARGETED BY OTA-1441: the greeting used a bare first-token split, which
    // turned the owner's tester "Great Scott" into "Welcome back, Great." The
    // spokenName rule now says a name of ≤2 words and ≤16 chars whole — so
    // "Verbal Kint" is greeted as "Verbal Kint". What this test has always
    // guarded is unchanged: the greeting NAMES the player, every time.
    for (let i = 0; i < 30; i++) {
      expect(welcomeBackLine(player)).toContain('Welcome back, Verbal Kint.');
    }
  });

  it('a long styled name is still clipped to its first word', () => {
    const styled = { name: 'Verbal of the Tartarian Giants' } as unknown as PlayerCharacter;
    for (let i = 0; i < 30; i++) {
      expect(welcomeBackLine(styled)).toContain('Welcome back, Verbal.');
    }
  });

  it('falls back to "friend" when the character has no name', () => {
    expect(welcomeBackLine(null)).toContain('Welcome back, friend.');
    expect(welcomeBackLine({ name: '' } as unknown as PlayerCharacter)).toContain('Welcome back, friend.');
  });

  it('with the offline recap pending, the recap rides INSIDE the same quote', () => {
    for (let i = 0; i < 30; i++) {
      const line = welcomeBackLine(player, { offlineRecap: true });
      expect(line).toContain('Welcome back, Verbal Kint.');
      // The recap sentence sits before the closing quote — one continuous
      // Arbiter speech, so TTS reads a single hello.
      expect(line).toMatch(/The waste did not sleep while you were gone — blood was spilled and ground changed hands\. Read the World for the account\."$/);
      // Exactly one quoted speech — the recap did not open a second quote.
      expect((line.match(/"/g) ?? []).length).toBe(2);
    }
  });

  it('without the flag the greeting is unchanged — no recap tail', () => {
    for (let i = 0; i < 30; i++) {
      expect(welcomeBackLine(player)).not.toContain('Read the World');
    }
  });
});

describe('OTA-1143 — the load path fires ONE arbiter line', () => {
  it('the standalone offline-recap arbiter line is gone', () => {
    expect(STORE).not.toContain('`"While you were gone, the waste did not sleep," the Arbiter says.');
  });

  it('the recap block sets the pending flag the greeting consumes', () => {
    expect(STORE).toContain('offlineRecapPending = true;');
    expect(STORE).toContain('welcomeBackLine(get().player, { offlineRecap: offlineRecapPending })');
  });

  it('the while-away beat draws from world-channel lines only', () => {
    expect(STORE).toContain(`WHILE_AWAY_LINES.filter((l) => l.channel === 'world')`);
  });

  it('the arbiter-channel while-away lines stay authored in the pool', () => {
    // Not deleted — just not load-fired. A future surface can use them.
    const at = STORE.indexOf('const WHILE_AWAY_LINES');
    expect(at).toBeGreaterThan(0);
    expect(blockAt(STORE, 'const WHILE_AWAY_LINES')).toContain(`channel: 'arbiter'`);
  });
});
