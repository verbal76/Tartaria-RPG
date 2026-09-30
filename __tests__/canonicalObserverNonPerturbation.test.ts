// P5 proof — observer non-perturbation.
//
// Runs the IDENTICAL deterministic walk (character creation through the
// real tutorial) TWICE, from a fully fresh module registry each time (same
// base seed, same production code) — once with every P2 telemetry channel
// attached (RNG ledger, store differ, log mirror), once with none attached
// — and proves the two runs produce IDENTICAL final player state, RNG draw
// count, RNG draw VALUE sequence, virtual clock, and production gameplay
// logs. Telemetry ON vs OFF must not change a single bit of what the game
// actually did.
//
// A private, test-local RNG recorder (NOT test-utils/canonical/rngLedger.ts)
// is installed as the innermost Math.random wrapper in BOTH runs, before any
// P2 telemetry attaches — so it captures the same ground-truth draw sequence
// either way, uncontaminated by whether the real ledger is also attached on
// top of it.
//
// Run focused: npx jest __tests__/canonicalObserverNonPerturbation.test.ts

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

jest.setTimeout(120000);

import { createHash } from 'crypto';

interface RunResult {
  finalStateHash: string;
  drawCount: number;
  drawSequence: number[];
  finalVirtualClock: number | null;
  gameLog: string[];
}

/** A test-local, ground-truth RNG recorder — installed BEFORE any P2
 *  telemetry, in both runs, so it sees the identical underlying stream
 *  regardless of whether the real rngLedger also attaches on top of it. */
function installGroundTruthRecorder(): { values: number[]; uninstall: () => void } {
  const values: number[] = [];
  const real = Math.random;
  Math.random = () => {
    const v = real();
    values.push(v);
    return v;
  };
  return { values, uninstall: () => { Math.random = real; } };
}

async function worldSettle(pred: () => boolean, deadlineMs: number): Promise<void> {
  const pollMs = 15;
  const polls = Math.max(1, Math.ceil(deadlineMs / pollMs));
  for (let i = 0; i < polls && !pred(); i++) {
    await new Promise((r) => setTimeout(r, pollMs));
  }
}

async function runOnce(withTelemetry: boolean): Promise<RunResult> {
  jest.resetModules();
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { useGameStore, setHomeworkTick } = require('../app/state/gameStore') as typeof import('../app/state/gameStore');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { CanonicalWalker } = require('../test-utils/canonical/CanonicalWalker') as typeof import('../test-utils/canonical/CanonicalWalker');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const virtualClock = require('../test-utils/canonical/virtualClock') as typeof import('../test-utils/canonical/virtualClock');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const rngLedger = require('../test-utils/canonical/rngLedger') as typeof import('../test-utils/canonical/rngLedger');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const storeDiffer = require('../test-utils/canonical/storeDiffer') as typeof import('../test-utils/canonical/storeDiffer');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const logMirror = require('../test-utils/canonical/logMirror') as typeof import('../test-utils/canonical/logMirror');

  const get = () => useGameStore.getState();

  virtualClock.installCanonicalClock();

  // Ground-truth recorder installed FIRST, before the one intentional reseed
  // and before any P2 telemetry — identical position in both runs.
  const recorder = installGroundTruthRecorder();

  (globalThis as { __TARTARIA_RESEED_RANDOM__?: () => void }).__TARTARIA_RESEED_RANDOM__?.();

  if (withTelemetry) {
    rngLedger.attachRngLedger();
    storeDiffer.attachStoreDiffer(useGameStore);
    logMirror.setLogMirrorActionSeq(0);
  }

  const walker = new CanonicalWalker();
  await walker.createCharacterLegitimately();
  await worldSettle(() => !!get().currentScene, 5000);
  setHomeworkTick(null);
  await walker.dismissStoryIntroLegitimately();
  await walker.playTutorialNormally();

  if (withTelemetry) {
    logMirror.syncLogMirror(get().gameLog as unknown as ReadonlyArray<{ channel: string; text: string }>);
    // Internal consistency: the real ledger's own count must match the
    // ground-truth recorder's count exactly (same stream, same wrapper
    // chain), independent of the cross-run comparison below.
    expect(rngLedger.rngDrawCount()).toBe(recorder.values.length);
  }

  const player = get().player;
  const hashInput = JSON.stringify({
    name: player?.name, raceId: player?.raceId, factionId: player?.factionId,
    hp: player?.hp, hpMax: player?.hpMax, stamina: player?.stamina,
    stats: player?.stats, inventory: player?.inventory, equipped: player?.equipped,
    gridX: player?.gridX, gridY: player?.gridY, currentLocationId: player?.currentLocationId,
    travelTarget: player?.travelTarget, tutorialPropsConsumed: (get() as unknown as { tutorialPropsConsumed: unknown }).tutorialPropsConsumed,
  });
  const finalStateHash = createHash('sha256').update(hashInput).digest('hex');
  const finalVirtualClock = virtualClock.dateVirtualized() ? Date.now() : null;
  const gameLog = (get().gameLog as unknown as ReadonlyArray<{ channel: string; text: string }>).map((e) => `${e.channel}:${e.text}`);

  if (withTelemetry) {
    rngLedger.detachRngLedger();
    storeDiffer.detachStoreDiffer();
  }
  recorder.uninstall();
  virtualClock.uninstallCanonicalClock();

  return { finalStateHash, drawCount: recorder.values.length, drawSequence: recorder.values, finalVirtualClock, gameLog };
}

describe('P5 proof — observer non-perturbation (telemetry ON vs OFF)', () => {
  it('produces identical final state hash, RNG draw count/sequence, virtual clock, and gameplay logs either way', async () => {
    const withoutTelemetry = await runOnce(false);
    const withTelemetry = await runOnce(true);

    expect(withTelemetry.drawCount).toBeGreaterThan(0);
    expect(withTelemetry.drawCount).toBe(withoutTelemetry.drawCount);
    expect(withTelemetry.drawSequence).toEqual(withoutTelemetry.drawSequence);
    expect(withTelemetry.finalVirtualClock).toBe(withoutTelemetry.finalVirtualClock);
    expect(withTelemetry.gameLog).toEqual(withoutTelemetry.gameLog);
    expect(withTelemetry.finalStateHash).toBe(withoutTelemetry.finalStateHash);
  });
});
