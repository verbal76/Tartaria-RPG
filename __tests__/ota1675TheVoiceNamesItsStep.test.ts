/**
 * OTA-1675 — THE VOICE NAMES ITS STEP.
 *
 * Task #180, kai's SM-S942U, OTA-1658, a cold 66-second life on the title
 * screen:
 *
 *   PROCESS KILLED — no JS ran · stage native:voice:done
 *   last checkpoint: native:voice:done [q0] · 66228ms into the action · alive 0ms after it
 *   Voice (TTS) guard: ⚠ VOICE CRASH detected on previous launch — last voice: kokoro:bf_emma
 *
 * `native:voice:done` is stamped the instant `model.forward` settles;
 * `markTTSDone` (which clears the guard) runs after playback. The process died
 * between the two — on the FIRST utterance the device ever played (the title
 * line `ReadyFlash` speaks when Kokoro comes online). Nothing native runs in
 * that window except what PiperTTSManager does with the samples: the WAV
 * encode, `Audio.Sound.createAsync` on a data: URI, the playback, the deferred
 * unload. OTA-1546 stamped the lock; nothing stamped these. Now the playback
 * path stamps its own checkpoints, each carrying the utterance's ordinal in
 * this life and its length, and the deferred unload yields to any native op
 * the lock is running so the instrument never overwrites a live suspect.
 */
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
// A Kokoro that loads, warms up, and returns 0.2 s of audio per forward.
jest.mock('react-native-executorch', () => ({
  TextToSpeechModule: {
    fromModelName: jest.fn(async () => ({
      forward: jest.fn(async () => new Float32Array(4410).fill(0.1)),
      delete: jest.fn(),
    })),
  },
  KOKORO_MEDIUM: 'kokoro-medium',
  KOKORO_VOICE_AF_HEART: 'af_heart', KOKORO_VOICE_AF_RIVER: 'af_river', KOKORO_VOICE_AF_SARAH: 'af_sarah',
  KOKORO_VOICE_AM_ADAM: 'am_adam', KOKORO_VOICE_AM_MICHAEL: 'am_michael',
  KOKORO_VOICE_BF_EMMA: 'bf_emma', KOKORO_VOICE_BM_DANIEL: 'bm_daniel',
}));
jest.mock('expo-file-system', () => ({
  documentDirectory: '/tmp/', cacheDirectory: '/tmp/',
  getInfoAsync: jest.fn(async () => ({ exists: false })),
  makeDirectoryAsync: jest.fn(async () => {}),
  readAsStringAsync: jest.fn(async () => ''),
  writeAsStringAsync: jest.fn(async () => {}),
  deleteAsync: jest.fn(async () => {}),
  downloadAsync: jest.fn(async () => ({ uri: '' })),
  getFreeDiskStorageAsync: jest.fn(async () => 0),
  EncodingType: { UTF8: 'utf8', Base64: 'base64' },
}));
jest.mock('expo-speech', () => ({ speak: jest.fn(), stop: jest.fn(), isSpeakingAsync: jest.fn(async () => false) }));
// The expo-av player: `finishes` decides whether didJustFinish ever fires, so
// one test can hold a sound open for stopAndClear to stop.
const av = { finishes: true, created: [] as Array<{ unloadAsync: jest.Mock; stopAsync: jest.Mock }> };
jest.mock('expo-av', () => ({
  Audio: {
    setAudioModeAsync: jest.fn(),
    Sound: class {
      static createAsync: jest.Mock = jest.fn(async () => {
        const sound = {
          playAsync: jest.fn(async () => {}),
          stopAsync: jest.fn(async () => {}),
          unloadAsync: jest.fn(async () => {}),
          setVolumeAsync: jest.fn(async () => {}),
          setOnPlaybackStatusUpdate: (cb: (s: { isLoaded: boolean; didJustFinish: boolean }) => void) => {
            if (av.finishes) setTimeout(() => cb({ isLoaded: true, didJustFinish: true }), 5);
          },
        };
        av.created.push(sound);
        return { sound };
      });
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

import { readFileSync } from 'fs';
import { join } from 'path';
import * as saveSystem from '../app/engine/saveSystem';
import { speak, stopAndClear } from '../app/voice/PiperTTSManager';
import { runExclusiveNativeMl, ML_PRIORITY_LLM, _mlLockState } from '../app/ai/nativeMlLock';

const src = (...p: string[]): string => readFileSync(join(__dirname, '..', ...p), 'utf8');
const codeOnly = (s: string) =>
  s.split('\n').filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*')).join('\n');

const until = async (test: () => boolean, ms: number): Promise<void> => {
  const deadline = Date.now() + ms;
  while (!test()) {
    if (Date.now() > deadline) throw new Error('timed out waiting');
    await new Promise((r) => setTimeout(r, 5));
  }
};
const after = (ms: number) => new Promise((r) => setTimeout(r, ms));

let stamps: jest.SpyInstance;
const phases = (): string[] => stamps.mock.calls.map((c) => String(c[0]));
const voicePhases = (): string[] => phases().filter((p) => p.startsWith('voice:') || p.startsWith('native:voice'));

beforeEach(() => {
  stamps = jest.spyOn(saveSystem, 'stampBreadcrumbPhase');
  av.finishes = true;
  av.created.length = 0;
});
afterEach(async () => {
  await stopAndClear();
  stamps.mockRestore();
});

describe('OTA-1675 — the voice names its step', () => {
  it('⚠⚠⚠ kai\'s window is stamped: load, warm-up, the line, then encode → create → started → done', async () => {
    speak('Choose your character.', undefined, 'system');
    await until(() => phases().includes('voice:play:done'), 4000);
    // The lock's own stamps come first — load (fromModelName), warm-up forward,
    // the real line — exactly what her ledger showed as its last checkpoint…
    const seen = voicePhases();
    expect(seen.slice(0, 6)).toEqual([
      'native:voice:start', 'native:voice:done',
      'native:voice:start', 'native:voice:done',
      'native:voice:start', 'native:voice:done',
    ]);
    // …and then the four the ledger could not show. A death between any two
    // of these now names its step instead of "the synth finished".
    expect(seen.slice(6)).toEqual([
      'voice:play:encode', 'voice:play:create', 'voice:play:started', 'voice:play:done',
    ]);
  });

  it('⚠⚠⚠ the detail says which utterance of this life, and how long — #1 on a fresh load is her shape', async () => {
    speak('Choose your character.', undefined, 'system');
    await until(() => phases().includes('voice:play:done'), 4000);
    const details = stamps.mock.calls.filter((c) => String(c[0]).startsWith('voice:play:')).map((c) => c[1]);
    // 4410 samples at 22050 Hz = 0.2 s. The ordinal is per JS life — the first
    // test in this file already played #1, so this is #2; what matters is that
    // every stamp of one utterance carries the same tag.
    expect(details.length).toBe(4);
    expect(new Set(details).size).toBe(1);
    expect(String(details[0])).toMatch(/^#\d+ 0\.2s$/);
  });

  it('⚠⚠ create is stamped BEFORE expo-av builds the player and started AFTER it resolves', async () => {
    const createAsync = (require('expo-av') as { Audio: { Sound: { createAsync: jest.Mock } } }).Audio.Sound.createAsync;
    const before = createAsync.mock.calls.length;
    speak('Choose your character.', undefined, 'system');
    await until(() => phases().includes('voice:play:create'), 4000);
    // At the moment `create` is stamped the player may not exist yet; by the
    // time `started` is stamped it must.
    await until(() => phases().includes('voice:play:started'), 4000);
    expect(createAsync.mock.calls.length).toBe(before + 1);
    const ps = phases();
    expect(ps.indexOf('voice:play:create')).toBeLessThan(ps.indexOf('voice:play:started'));
  });

  // A stamp of THIS utterance — an earlier test's 300 ms unload timer can fire
  // during a later test, so the tag is what ties a stamp to its line.
  const stampedFor = (phase: string, tag: string): boolean =>
    stamps.mock.calls.some((c) => c[0] === phase && c[1] === tag);
  const tagOf = (): string => String(stamps.mock.calls.find((c) => c[0] === 'voice:play:encode')![1]);

  it('⚠⚠ the deferred unload stamps when the lock is idle', async () => {
    speak('Choose your character.', undefined, 'system');
    await until(() => phases().includes('voice:play:done'), 4000);
    const tag = tagOf();
    const mine = av.created[av.created.length - 1]!;
    await until(() => stampedFor('voice:play:unload', tag), 2000);
    expect(mine.unloadAsync).toHaveBeenCalled();
  });

  it('⚠⚠⚠ …and YIELDS when a native op is running — the crumb of a live suspect is never overwritten', async () => {
    speak('Choose your character.', undefined, 'system');
    await until(() => phases().includes('voice:play:done'), 4000);
    const tag = tagOf();
    const mine = av.created[av.created.length - 1]!;
    // The unload timer is armed (300 ms). Take the lock for longer than that.
    const hold = runExclusiveNativeMl(() => after(700), ML_PRIORITY_LLM);
    await until(() => _mlLockState().running, 500);
    await until(() => mine.unloadAsync.mock.calls.length > 0, 2000);
    // The release itself happened — only the stamp yielded.
    expect(stampedFor('voice:play:unload', tag)).toBe(false);
    await hold;
  });

  it('⚠⚠ stopAndClear stamps voice:stop only when there is a live player to stop', async () => {
    await stopAndClear();
    expect(phases()).not.toContain('voice:stop');
    av.finishes = false; // hold the sound open
    speak('Choose your character.', undefined, 'system');
    await until(() => phases().includes('voice:play:started'), 4000);
    await stopAndClear();
    const ps = phases();
    expect(ps).toContain('voice:stop');
    expect(ps.indexOf('voice:play:started')).toBeLessThan(ps.indexOf('voice:stop'));
    expect(av.created[av.created.length - 1]!.stopAsync).toHaveBeenCalled();
  });
});

describe('OTA-1675 — the lock\'s `done` means the native op settled, not "the caller ran"', () => {
  it('⚠⚠⚠ THE MEASUREMENT: done is stamped before the caller\'s continuation runs', async () => {
    const order: string[] = [];
    const p = runExclusiveNativeMl(async () => { order.push('fn'); }, ML_PRIORITY_LLM);
    await p;
    order.push('caller');
    await new Promise((r) => setTimeout(r, 0));
    const doneAt = stamps.mock.calls.findIndex((c) => c[0] === 'native:llm:done');
    expect(doneAt).toBeGreaterThan(-1);
    // Pre-1675 the caller resumed first and any checkpoint it stamped was
    // overwritten by `native:llm:done` a microtask later.
    const callerStampedBeforeDone = stamps.mock.calls.slice(0, doneAt).some((c) => c[0] === 'caller-checkpoint');
    expect(callerStampedBeforeDone).toBe(false);
    expect(order).toEqual(['fn', 'caller']);
  });

  it('⚠⚠⚠ …so a checkpoint stamped by the caller now survives as the last one', async () => {
    await runExclusiveNativeMl(async () => undefined, ML_PRIORITY_LLM);
    saveSystem.stampBreadcrumbPhase('caller-checkpoint');
    await new Promise((r) => setTimeout(r, 0));
    const ps = phases();
    expect(ps.lastIndexOf('native:llm:done')).toBeLessThan(ps.lastIndexOf('caller-checkpoint'));
  });

  it('⚠⚠ a rejected op is stamped done too, and still rejects the caller', async () => {
    await expect(runExclusiveNativeMl(async () => { throw new Error('boom'); }, ML_PRIORITY_LLM)).rejects.toThrow('boom');
    expect(phases()).toContain('native:llm:done');
  });

  it('⚠ exclusivity is untouched — running clears only after the caller is resolved', () => {
    const lock = codeOnly(src('app', 'ai', 'nativeMlLock.ts'));
    const settle = lock.indexOf('(v) => { settle(); task.resolve(v); },');
    const clear = lock.indexOf('running = false;', settle);
    expect(settle).toBeGreaterThan(-1);
    expect(clear).toBeGreaterThan(settle);
    expect(lock.includes('(e) => { settle(); task.reject(e); },')).toBe(true);
  });
});

describe('OTA-1675 — the instrument is wired the way the lock\'s is', () => {
  const tts = src('app', 'voice', 'PiperTTSManager.ts');
  const code = codeOnly(tts);

  it('⚠⚠ create is stamped before createAsync and started after, in source order', () => {
    const create = code.indexOf("stampVoicePhase('play:create', utteranceTag);");
    const call = code.indexOf('await Audio.Sound.createAsync(');
    const started = code.indexOf("stampVoicePhase('play:started', utteranceTag);");
    expect(create).toBeGreaterThan(-1);
    expect(create).toBeLessThan(call);
    expect(call).toBeLessThan(started);
  });

  it('⚠⚠ done is stamped inside didJustFinish, before the deferred release is armed', () => {
    const done = code.indexOf("stampVoicePhase('play:done', utteranceTag);");
    const finish = code.indexOf('if (status.didJustFinish) {');
    const timer = code.indexOf('setTimeout(() => {', finish);
    expect(finish).toBeLessThan(done);
    expect(done).toBeLessThan(timer);
  });

  it('⚠⚠⚠ the unload stamp is gated on the lock being idle — the blind-spot rule in code', () => {
    expect(code.includes("if (!nativeMlSnapshot().running) stampVoicePhase('play:unload', utteranceTag);")).toBe(true);
  });

  it('⚠⚠ the stamp is lazy-required and wrapped, so a broken instrument cannot silence the voice', () => {
    const i = tts.indexOf('function stampVoicePhase');
    const fnEnd = tts.indexOf('\n}', i);
    const body = tts.slice(i, fnEnd);
    expect(body).toContain("require('../engine/saveSystem')");
    expect(body).toContain('catch');
    // No static import of saveSystem from the voice layer — the lock's own rule.
    expect(code).not.toMatch(/^import .* from '\.\.\/engine\/saveSystem'/m);
  });

  it('⚠ the ordinal is per life and the tag rides every playback stamp', () => {
    expect(code.includes('let utterancesThisLife = 0;')).toBe(true);
    expect(code.includes('utterancesThisLife += 1;')).toBe(true);
    const tagged = code.match(/stampVoicePhase\('play:[a-z]+', utteranceTag\)/g) ?? [];
    expect(tagged.length).toBe(5);
  });
});
