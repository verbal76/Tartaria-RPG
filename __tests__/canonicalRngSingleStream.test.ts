// P5 proof — exactly one RNG stream, no reseeding mid-run.
//
// Boots a character through CanonicalWalker (character creation + the real
// tutorial) with the RNG ledger attached from before the one intentional
// seed initialization, and proves: the reseed hook fires exactly once for
// the whole run, and the ledger's draw sequence is gapless and monotonic —
// no second stream, no silent restart.
//
// Run focused: npx jest __tests__/canonicalRngSingleStream.test.ts

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('onnxruntime-react-native', () => ({
  InferenceSession: { create: jest.fn(async () => ({ run: jest.fn(async () => ({})) })) },
  Tensor: class { constructor(_t: string, _d: unknown, _s: unknown[]) {} },
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
  Audio: {
    setAudioModeAsync: jest.fn(),
    Sound: class {
      static createAsync: () => Promise<{ sound: { playAsync: () => Promise<void>; unloadAsync: () => Promise<void> } }> =
        jest.fn(async () => ({ sound: { playAsync: jest.fn(async () => {}), unloadAsync: jest.fn(async () => {}) } }));
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

jest.setTimeout(60000);

import { useGameStore, setHomeworkTick } from '../app/state/gameStore';
import { CanonicalWalker } from '../test-utils/canonical/CanonicalWalker';
import { installCanonicalClock, uninstallCanonicalClock } from '../test-utils/canonical/virtualClock';
import { attachRngLedger, detachRngLedger, resetRngLedger, getRngLedger, rngDrawCount } from '../test-utils/canonical/rngLedger';

const store = useGameStore;
const get = () => store.getState();

async function worldSettle(pred: () => boolean, deadlineMs: number): Promise<void> {
  const pollMs = 15;
  const polls = Math.max(1, Math.ceil(deadlineMs / pollMs));
  for (let i = 0; i < polls && !pred(); i++) {
    await new Promise((r) => setTimeout(r, pollMs));
  }
}

// ⚠ SINGLE it(), DELIBERATELY. jest.teardown.js's own beforeEach fires the
// harness reseed before EVERY `it()` in this file (that per-test isolation
// is correct for the rest of the suite) — so a multi-`it()` layout here would
// make "the reseed fired once" strictly false for reasons that have nothing
// to do with the canonical run itself (jest's own test isolation, not a
// second product/harness reseed mid-walk). One it() is exactly what P1
// mandates for the canonical run's own host profile, and it is what makes
// this specific claim ("exactly one seed initialization, no per-action
// reseeding") meaningful to assert at all.
describe('P5 proof — exactly one RNG stream, no reseeding mid-run', () => {
  it('reseeds exactly once, draws a real gapless stream, and never reseeds again', async () => {
    installCanonicalClock();
    resetRngLedger();

    let reseedCalls = 0;
    const realReseed = (globalThis as { __TARTARIA_RESEED_RANDOM__?: () => void }).__TARTARIA_RESEED_RANDOM__;
    (globalThis as { __TARTARIA_RESEED_RANDOM__?: () => void }).__TARTARIA_RESEED_RANDOM__ = () => {
      reseedCalls += 1;
      realReseed?.();
    };

    try {
      // The ledger attaches BEFORE the one intentional seed init, so it
      // would see a second reseed as a draw-count anomaly if one ever
      // happened mid-run.
      attachRngLedger();
      (globalThis as { __TARTARIA_RESEED_RANDOM__?: () => void }).__TARTARIA_RESEED_RANDOM__?.();

      await get().hydrate();
      const walker = new CanonicalWalker();
      await walker.createCharacterLegitimately();
      await worldSettle(() => !!get().currentScene, 5000);
      setHomeworkTick(null);
      await walker.dismissStoryIntroLegitimately();
      await walker.playTutorialNormally();

      expect(reseedCalls).toBe(1);

      expect(rngDrawCount()).toBeGreaterThan(0);
      const ledger = getRngLedger();
      expect(ledger.length).toBe(rngDrawCount());
      for (let i = 0; i < ledger.length; i++) {
        expect(ledger[i]!.seq).toBe(i + 1);
      }
      for (const draw of ledger) {
        expect(draw.value).toBeGreaterThanOrEqual(0);
        expect(draw.value).toBeLessThan(1);
      }
    } finally {
      detachRngLedger();
      resetRngLedger();
      uninstallCanonicalClock();
    }
  });
});
