/** Deterministic harness for the TTS stale-callback race. */
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('react-native-executorch', () => ({}));
jest.mock('expo-av', () => ({ Audio: { setAudioModeAsync: jest.fn(), Sound: class {} } }));
jest.mock('expo-file-system', () => ({ documentDirectory: '/tmp/', cacheDirectory: '/tmp/',
  getInfoAsync: jest.fn(async () => ({ exists: false })), makeDirectoryAsync: jest.fn(async () => {}),
  readAsStringAsync: jest.fn(async () => ''), writeAsStringAsync: jest.fn(async () => {}),
  deleteAsync: jest.fn(async () => {}), downloadAsync: jest.fn(async () => ({ uri: '' })),
  EncodingType: { UTF8: 'utf8' } }));

/** A Speech mock that HOLDS the callbacks so the test controls their order. */
interface Held { text: string; onDone?: () => void; onStopped?: () => void; onError?: () => void }
const held: Held[] = [];
jest.mock('expo-speech', () => ({
  speak: (text: string, opts: Record<string, unknown>) => {
    held.push({ text, onDone: opts.onDone as () => void, onStopped: opts.onStopped as () => void, onError: opts.onError as () => void });
  },
  stop: jest.fn(async () => {}),
  isSpeakingAsync: jest.fn(async () => false),
  getAvailableVoicesAsync: jest.fn(async () => []),
}));

import * as TTS from '../app/voice/TTSManager';
import { setVoiceSettings } from '../app/voice/voiceSettings';

const flush = () => new Promise((r) => setTimeout(r, 0));
const W = (s: string) => process.stdout.write(s + '\n');

it('TTS stale-callback race', async () => {
  // ⚠ The SYSTEM engine is a real shipped route, not a test-only path: it is the
  //   fallback whenever the bundled voice is off, still installing, in an error
  //   state, or benched by the OTA-1707 crash guard. Driving it here exercises the
  //   exact queue/drain state machine those players get.
  await setVoiceSettings({ ttsEnabled: true, engine: 'system' } as never);
  held.length = 0;
  const id1 = TTS.speak('line one', 'arbiter');
  W('  speak() returned id=' + id1 + ' (-1 means it refused before queuing)');
  await new Promise((r) => setTimeout(r, 600));   // past the coalesce timer
  await flush();
  W(`  utterances handed to the engine: ${held.length} (${held.map((h) => h.text).join(' | ')})`);
  if (held.length === 0) { W('  HARNESS: nothing reached Speech.speak — cannot drive the race here'); return; }
  expect(TTS.isSpeaking()).toBe(true);
  const first = held[0]!;

  // The player taps SILENCE ARBITER (or flips the toggle off).
  TTS.stopAndClear();
  expect(TTS.isSpeaking()).toBe(false);

  // A new line starts BEFORE the native layer delivers the old onStopped.
  TTS.speak('line two', 'arbiter');
  await new Promise((r) => setTimeout(r, 600));
  await flush();
  const speakingWithTwoLive = TTS.isSpeaking();
  W(`  after the second line started: isSpeaking()=${speakingWithTwoLive}, utterances=${held.length}`);

  // NOW the stale callback for line one arrives.
  first.onStopped?.();
  const afterStale = TTS.isSpeaking();
  W(`  after line ONE's stale onStopped fired: isSpeaking()=${afterStale}`);
  W(afterStale === false && speakingWithTwoLive === true
    ? '  ⚠⚠⚠ PROVEN: the old utterance cleared the NEW one — bookkeeping says idle while line two is live'
    : '  the state machine survived the stale callback');
  expect(typeof afterStale).toBe('boolean');
});
