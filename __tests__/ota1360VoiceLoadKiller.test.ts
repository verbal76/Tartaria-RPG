// ⚠⚠ OTA-1360 — THE KILLER HAS A NAME: THE KOKORO VOICE LOAD (B9 root cause).
//
// The owner's Android bug report closed the case the sub-phase stamps were
// built to corner. Two tombstones, both com.hotatticgames.tartarprim, both
// SIGABRT on an executorch worker thread (RN_ET_Worker), both dying INSIDE
// `RnExecutorchInstaller::loadModel<Kokoro>` → `phonemis::phonemizer::Lexicon`
// (the phonemizer's dictionary build):
//   - tombstone_12 @ 07:37:38 — freeze #4's exact crash-to-home, uptime 2504s,
//     std::terminate out of the Lexicon constructor.
//   - tombstone_13 @ 09:05:21 — uptime 211s, abort message 'Scudo ERROR:
//     internal map failure (error desc=Out of memory)', logcat adds 'shadow
//     stack mprotect failed: Out of memory' — the process couldn't map thread
//     stacks anymore.
// Freeze #5 (11:11) has NO tombstone — just `am_kill … remove task`: the owner
// swiping away the wedged app, exactly the "input dead, scroll works" variant.
// Freezes #2 and #5 both fingerprint as FIRST entry into the messhall (R05 —
// tagged `vendor`, anchor NPC Halem the Trader): beginScene fired warmVoice
// synchronously inside the action pipeline, starting a hundreds-of-MB native
// load while the crumb still read `parsed:travel`. Under jest executorch is a
// mock, which is why 400 replays of that transition never died.
//
// Three defenses, pinned here:
//   (1) the Kokoro LOAD joins the native-ML lock (create AND run — same parity
//       the classifier got in OTA-1358);
//   (2) the vendor warm settles: one timer, latest scene wins, and at fire time
//       a sprint, a memory-pressure cooldown, or a changed scene cancels it;
//   (3) a vendor-load cooldown opens on any load failure AND on every OS
//       memoryWarning — the retry on a memory-tight device is the one that kills.
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

import {
  noteMemoryPressureForVoiceLoads,
  _vendorLoadCooldownForTest,
  _resetVendorLoadCooldownForTest,
} from '../app/voice/PiperTTSManager';

describe('OTA-1360 — the Kokoro voice load is contained', () => {
  beforeEach(() => _resetVendorLoadCooldownForTest());

  it('⚠⚠ source lock: fromModelName runs under the native-ML lock, at voice priority', () => {
    const src = readFileSync(join(__dirname, '..', 'app', 'voice', 'PiperTTSManager.ts'), 'utf8');
    expect(src).toContain('await runExclusiveNativeMl(() => exec.TextToSpeechModule.fromModelName(');
    expect(src).toContain('), ML_PRIORITY_VOICE);');
    // No bare load remains outside the lock.
    expect(src).not.toContain('await exec.TextToSpeechModule.fromModelName(');
  });

  it('⚠⚠ source lock: the vendor warm is a settle timer with sprint + pressure + still-here checks', () => {
    const src = readFileSync(join(__dirname, '..', 'app', 'state', 'gameStore.ts'), 'utf8');
    expect(src).toContain('const VENDOR_WARM_SETTLE_MS = 2_500;');
    expect(src).toContain('vendorWarmSettleTimer = setTimeout(() => {');
    const timerBody = src.slice(src.indexOf('vendorWarmSettleTimer = setTimeout(() => {'));
    const warmAt = timerBody.indexOf('void piper.warmVoice(nextVendorVoice);');
    expect(warmAt).toBeGreaterThan(-1);
    // Every guard sits BEFORE the warm, inside the timer body.
    for (const guard of [
      'if (playerIsSprinting()) return;',
      'if (Date.now() < rpMemoryPressureUntil) return;',
      'if (get().currentScene?.vendor?.voiceId !== nextVendorVoice) return;',
    ]) {
      const at = timerBody.indexOf(guard);
      expect(at).toBeGreaterThan(-1);
      expect(at).toBeLessThan(warmAt);
    }
    // The synchronous fire-inside-the-action-pipeline shape is gone.
    expect(src).not.toContain("if (typeof piper.warmVoice === 'function') void piper.warmVoice(nextVendorVoice);\n          } catch { /* same */ }\n        }\n      }\n    } catch");
  });

  it('⚠⚠ source lock: a load failure opens the cooldown, and non-sticky loads respect it', () => {
    const src = readFileSync(join(__dirname, '..', 'app', 'voice', 'PiperTTSManager.ts'), 'utf8');
    expect(src).toContain('if (!sticky && Date.now() < vendorLoadCooldownUntil) return null;');
    expect(src).toContain('vendorLoadCooldownUntil = Math.max(vendorLoadCooldownUntil, Date.now() + VENDOR_LOAD_COOLDOWN_MS);');
  });

  it('⚠ source lock: the memoryWarning listener tells the voice subsystem to stand down', () => {
    const src = readFileSync(join(__dirname, '..', 'app', 'state', 'gameStore.ts'), 'utf8');
    expect(src).toContain('p.noteMemoryPressureForVoiceLoads(MEMORY_PRESSURE_QUIET_MS);');
  });

  it('⚠ a memory warning opens a quiet window that only ever extends', () => {
    expect(_vendorLoadCooldownForTest()).toBe(0);
    noteMemoryPressureForVoiceLoads(90_000);
    const first = _vendorLoadCooldownForTest();
    expect(first).toBeGreaterThan(Date.now() + 80_000);
    // A shorter follow-up must not SHRINK the window.
    noteMemoryPressureForVoiceLoads(1_000);
    expect(_vendorLoadCooldownForTest()).toBe(first);
    // A longer one extends it.
    noteMemoryPressureForVoiceLoads(300_000);
    expect(_vendorLoadCooldownForTest()).toBeGreaterThan(first);
  });
});
