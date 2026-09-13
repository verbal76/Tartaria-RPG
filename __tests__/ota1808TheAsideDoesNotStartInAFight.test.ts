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
  documentDirectory: '/tmp/',
  cacheDirectory: '/tmp/',
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

// ⚠⚠⚠ OTA-1808 (Baker #9) — THE ASIDE DOES NOT START IN A FIGHT.
//
// THE WINDOW, deterministically measured at 1807 authority on the REAL
// native-ML lock, with the exact opts narration.ts passed:
//   admitted valid → held behind a live job → combat started while waiting
//   → released → ctx.completion CALLED. ~328 prompt tokens of prefill for a
//   musing the game had already decided it did not want.
//
// The door that can refuse it has existed since OTA-1368: inside the
// runExclusiveNativeMl callback, after the lock is ours, immediately before
// the native call, armed by `shouldAbort`. The ambient path never handed it a
// predicate, so it was inert there. This OTA hands it the combat muzzle from
// the top of maybeGenerateAmbientArbiter — the architecture's own statement
// that an aside must not BEGIN in a fight — asked again after the wait.
//
// ⚠ THIS IS NOT PREFILL INTERRUPTION. Once ctx.completion is entered nothing
// here changes; OTA-1368's per-token door and OTA-1123's preempt hook are
// untouched. This only declines to START work already known to be unwanted.

// ⚠⚠⚠ THE AMBIENT PATH'S OWN PREDICATE, CAPTURED. The behavioural tests above
// hand `rt.generate` a predicate of their own, which proves OTA-1368's DOOR
// works — it does not prove THIS path is wired to it. Mocking the engines
// singleton lets the suite read the `shouldAbort` narration actually passes and
// evaluate it against a real store, which is the only thing that fails when the
// repair is removed OR made overbroad.
let capturedOpts: Record<string, unknown> | null = null;
jest.mock('../app/ai/engines', () => ({
  qwen: {
    isReady: () => true,
    getModelId: () => 'test-qwen',
    stream: async (_m: unknown, _cb: unknown, opts: Record<string, unknown>) => {
      capturedOpts = opts;
      return 'The wind moves through the dark.';
    },
    generate: async (_m: unknown, opts: Record<string, unknown>) => {
      capturedOpts = opts;
      return 'The wind moves through the dark.';
    },
  },
  cognitive: {
    isReady: () => false,
    boot: async () => {},
    resume: async () => {},
    shutdown: async () => {},
    getModelInfo: () => ({ id: 'test-cog', name: 'test' }),
    inferTarget: async () => null,
  },
}));

import { LlamaRuntime } from '../app/ai/generation/LlamaRuntime';
import {
  runExclusiveNativeMl, _mlLockState,
  ML_PRIORITY_HOMEWORK, ML_PRIORITY_LLM, ML_PRIORITY_VOICE, ML_PRIORITY_COGNITION,
} from '../app/ai/nativeMlLock';
import { readFileSync } from 'fs';
import { join } from 'path';

const src = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');
const codeOnly = (s: string): string =>
  s.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
   .replace(/^([ \t]*)\/\/.*$/gm, (_m, p1) => p1);
const tick = () => new Promise((r) => setTimeout(r, 0));
const NARR = src('app/ai/narration.ts');

/** A runtime whose native context is a counter. The lock, the door and the
 *  telemetry are all the real ones — only llama.cpp is stood in for. */
function runtimeWithFakeCtx() {
  const calls = { completion: 0, stop: 0 };
  const rt = new LlamaRuntime();
  (rt as unknown as { context: unknown }).context = {
    completion: async (_p: unknown, onTok?: (e: { token: string }) => void) => {
      calls.completion += 1;
      onTok?.({ token: 'a' });
      onTok?.({ token: 'b' });
      return { text: 'ab', tokens_predicted: 2 };
    },
    stopCompletion: async () => { calls.stop += 1; },
  };
  return { rt, calls };
}

/** Occupy the one native lock with a live job, exactly as on device. */
function holdTheLock(priority = ML_PRIORITY_LLM) {
  let release!: () => void;
  const held = new Promise<void>((r) => { release = r; });
  const p = runExclusiveNativeMl(async () => { await held; return 'x'; }, priority);
  return { release, p };
}

beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

// ════════════════════════════════════════════════════════════════════
// A — the pre-repair race, preserved as a regression test
// ════════════════════════════════════════════════════════════════════
describe('OTA-1808 §A — the race, reproduced', () => {
  it('⚠⚠⚠ WITHOUT a predicate, obsolete optional work still enters ctx.completion', async () => {
    const { rt, calls } = runtimeWithFakeCtx();
    let inCombat = false;
    const lock = holdTheLock();
    await tick();
    const gen = rt.generate([{ role: 'user', content: 'x' }], {
      maxTokens: 32, job: 'ambient', homework: true,      // the pre-1808 opts
    });
    await tick();
    expect(calls.completion).toBe(0);                     // waiting, nothing started
    inCombat = true;                                      // the world moves on
    lock.release(); await lock.p; await tick(); await gen;
    expect(inCombat).toBe(true);
    expect(calls.completion).toBe(1);                     // THE DEFECT
  });
});

// ════════════════════════════════════════════════════════════════════
// B — obsolete while waiting → the native call is never made
// ════════════════════════════════════════════════════════════════════
describe('OTA-1808 §B — obsolete while waiting', () => {
  it('⚠⚠⚠ combat starts during the wait → ctx.completion is NOT called', async () => {
    const { rt, calls } = runtimeWithFakeCtx();
    let inCombat = false;
    const lock = holdTheLock();
    await tick();
    const gen = rt.generate([{ role: 'user', content: 'x' }], {
      maxTokens: 32, job: 'ambient', homework: true,
      shouldAbort: () => inCombat,
    });
    await tick();
    inCombat = true;
    lock.release(); await lock.p; await tick();
    const text = await gen;
    expect(calls.completion).toBe(0);
    expect(calls.stop).toBe(0);            // nothing to stop — nothing started
    expect(text).toBe('');
  });

  it('⚠⚠ the ambient path actually supplies the predicate, and it is the muzzle', () => {
    const code = codeOnly(NARR);
    // the call site hands the door a predicate
    expect(code).toContain("shouldAbort: () => (get().currentScene?.enemies?.length ?? 0) > 0");
    // ...and it is the SAME question the begin-time muzzle asks
    const fn = code.slice(code.indexOf('async function maybeGenerateAmbientArbiter('));
    expect(fn).toContain('scene.enemies.length > 0) return;');
  });

  it('⚠ both lanes are covered — the muzzle sits above the bankOnly split', () => {
    const code = codeOnly(NARR);
    const i = code.indexOf("shouldAbort: () => (get().currentScene?.enemies?.length ?? 0) > 0");
    const span = code.slice(i, i + 200);
    expect(span).toContain("job: opts?.bankOnly ? 'ambient_fill' : 'ambient'");
  });
});

// ════════════════════════════════════════════════════════════════════
// C — still-valid optional work is untouched
// ════════════════════════════════════════════════════════════════════
describe('OTA-1808 §C — valid optional work still runs', () => {
  it('⚠⚠⚠ no combat → ctx.completion IS called, exactly as before', async () => {
    const { rt, calls } = runtimeWithFakeCtx();
    const lock = holdTheLock();
    await tick();
    const gen = rt.generate([{ role: 'user', content: 'x' }], {
      maxTokens: 32, job: 'ambient', homework: true,
      shouldAbort: () => false,
    });
    await tick();
    lock.release(); await lock.p; await tick();
    const text = await gen;
    expect(calls.completion).toBe(1);
    expect(text).toBe('ab');
  });

  it('⚠⚠ the guard is not overbroad — it refuses ONLY while the predicate is true', async () => {
    const { rt, calls } = runtimeWithFakeCtx();
    let inCombat = true;
    const a = await rt.generate([{ role: 'user', content: 'x' }], {
      job: 'ambient', homework: true, shouldAbort: () => inCombat,
    });
    expect(a).toBe('');
    expect(calls.completion).toBe(0);
    inCombat = false;                                   // the fight ends
    const b = await rt.generate([{ role: 'user', content: 'x' }], {
      job: 'ambient', homework: true, shouldAbort: () => inCombat,
    });
    expect(b).toBe('ab');
    expect(calls.completion).toBe(1);                   // and the aside runs again
  });
});

// ════════════════════════════════════════════════════════════════════
// D — required player-facing work is not suppressed
// ════════════════════════════════════════════════════════════════════
describe('OTA-1808 §D — required work is untouched', () => {
  it('⚠⚠⚠ a required (non-homework) completion with no predicate always runs', async () => {
    const { rt, calls } = runtimeWithFakeCtx();
    const text = await rt.generate([{ role: 'user', content: 'x' }], {
      job: 'narration:investigate', homework: false,
    });
    expect(calls.completion).toBe(1);
    expect(text).toBe('ab');
  });

  it('⚠⚠ the live narration path keeps its OWN epoch predicate, unchanged by 1808', () => {
    const code = codeOnly(NARR);
    expect(code).toContain('shouldAbort: opts?.bankOnly === true');
    expect(code).toContain('myEpoch !== arbiterGenerationEpoch');
  });

  it('⚠ 1808 added a predicate to exactly ONE call site', () => {
    const n = (codeOnly(NARR).match(/shouldAbort:/g) ?? []).length;
    expect(n).toBe(2);   // the pre-existing narration epoch one, plus ambient
  });
});

// ════════════════════════════════════════════════════════════════════
// E — decode/stop behaviour after a legitimate start is unchanged
// ════════════════════════════════════════════════════════════════════
describe('OTA-1808 §E — nothing about running work changed', () => {
  it('⚠⚠⚠ a job that goes obsolete DURING decode still stops the old way', async () => {
    const { rt, calls } = runtimeWithFakeCtx();
    let dead = false;
    const text = await rt.generate([{ role: 'user', content: 'x' }], {
      job: 'ambient', homework: true,
      shouldAbort: () => dead,
      onToken: () => { dead = true; },       // goes stale after the first token
    });
    expect(calls.completion).toBe(1);        // it legitimately started
    expect(calls.stop).toBe(1);              // and OTA-1368's per-token door fired
    expect(typeof text).toBe('string');
  });

  it('⚠ this OTA claims no prefill interruption — the door only declines to START', () => {
    const rtSrc = codeOnly(src('app/ai/generation/LlamaRuntime.ts'));
    // the admission door returns a settled empty result instead of calling
    expect(rtSrc).toContain("return Promise.resolve({ text: '', tokens_predicted: 0 }");
    // and it sits before the completion call
    expect(rtSrc.indexOf("tokens_predicted: 0 }")).toBeLessThan(rtSrc.indexOf('return ctx.completion'));
  });
});

// ════════════════════════════════════════════════════════════════════
// F / G — settlement and queue safety
// ════════════════════════════════════════════════════════════════════
describe('OTA-1808 §F/G — settlement, lock and queue safety', () => {
  it('⚠⚠⚠ an abandoned job settles: promise resolves, lock released, nothing running', async () => {
    const { rt } = runtimeWithFakeCtx();
    const text = await rt.generate([{ role: 'user', content: 'x' }], {
      job: 'ambient', homework: true, shouldAbort: () => true,
    });
    expect(text).toBe('');                  // resolved, not hung, not thrown
    await tick();
    expect(_mlLockState().running).toBe(false);
    // ⚠ `queued`, not `depth` — the lock state has no `depth` field, so the
    // assertion I first wrote read `undefined ?? 0` and checked nothing. The
    // typechecker caught it; the real claim is that nothing is left waiting.
    expect(_mlLockState().queued).toBe(0);
  });

  it('⚠⚠ an abandoned job does not block the next one — no stuck busy flag', async () => {
    const { rt, calls } = runtimeWithFakeCtx();
    await rt.generate([{ role: 'user', content: 'x' }], {
      job: 'ambient', homework: true, shouldAbort: () => true,
    });
    const after = await rt.generate([{ role: 'user', content: 'x' }], {
      job: 'ambient', homework: true, shouldAbort: () => false,
    });
    expect(after).toBe('ab');
    expect(calls.completion).toBe(1);
  });

  it('⚠⚠ exclusivity is untouched — the refusal happens INSIDE the lock', () => {
    const rtSrc = codeOnly(src('app/ai/generation/LlamaRuntime.ts'));
    const cb = rtSrc.slice(rtSrc.indexOf('await runExclusiveNativeMl('), rtSrc.indexOf('return ctx.completion'));
    expect(cb).toContain('if (wantsAbort())');   // the door is within the callback
  });

  it('⚠ no priority was changed by this OTA (Baker #8 untouched)', () => {
    expect(ML_PRIORITY_HOMEWORK).toBe(-1);
    expect(ML_PRIORITY_LLM).toBe(1);
    expect(ML_PRIORITY_COGNITION).toBe(1.5);
    expect(ML_PRIORITY_VOICE).toBe(2);
    expect(codeOnly(NARR)).not.toContain('ML_PRIORITY');
  });
});

// ════════════════════════════════════════════════════════════════════
// H — Baker #13 and #7 protection
// ════════════════════════════════════════════════════════════════════
describe('OTA-1808 §H — neighbouring Baker items are untouched', () => {
  it('⚠⚠⚠ Baker #13 (J1) is unchanged — no J2 through the back door', () => {
    const ha = codeOnly(src('app/state/humanActivity.ts'));
    expect(ha).toContain('lastPlayerActionAt');
    expect(ha).not.toContain('notePlayerActionForSprint');
    expect(ha).not.toContain('preemptHomeworkForPlayer');
    expect(ha).not.toContain('shouldAbort');
    // and the narration change did not reach into activity accounting
    expect(codeOnly(NARR)).not.toContain('noteHumanInteraction');
  });

  it('⚠⚠ Baker #7 untouched — no prompt, token or model-parameter change', () => {
    const code = codeOnly(NARR);
    const i = code.indexOf("shouldAbort: () => (get().currentScene?.enemies?.length ?? 0) > 0");
    const span = code.slice(i - 120, i + 200);
    expect(span).toContain('maxNewTokens: 32');   // the budget is the one it already had
    expect(span).not.toContain('temperature');
    expect(span).not.toContain('n_predict');
  });

  it('⚠ the stamp is this OTA or later, and never goes backwards', () => {
    // ⚠⚠⚠ RE-ANCHORED BY OTA-1809, AND THE HISTORY IS THE POINT. This asserted
    // `/^2026-09-12-1808-/` — a pin to ONE bundle, which every later OTA must
    // break by definition. That is the THIRD time this exact trap has been
    // authored into this repo: OTA-1807 repaired it in the 1806 suite, OTA-1808
    // repaired it in the 1807 suite, and then wrote it here in that same commit.
    // Recorded rather than quietly fixed, because the pattern is the lesson.
    // The durable form keeps the invariant the pin was reaching for — the stamp
    // advances and never regresses — without tying the repo to one build.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { OTA_BUILD_ID } = require('../app/buildInfo') as { OTA_BUILD_ID: string };
    const n = Number(/^\d{4}-\d{2}-\d{2}-(\d+)-/.exec(OTA_BUILD_ID)?.[1]);
    expect(Number.isFinite(n)).toBe(true);
    expect(n).toBeGreaterThanOrEqual(1808);
    expect(OTA_BUILD_ID).not.toMatch(/-1807-|-1806-/);
  });
});

// ════════════════════════════════════════════════════════════════════
// I — THE PRODUCTION PREDICATE ITSELF, evaluated against a real store
// ════════════════════════════════════════════════════════════════════
//
// This is the load-bearing half. NC-9a (predicate removed) and NC-9b
// (predicate replaced with `() => true`) must BOTH break it.
describe('OTA-1808 §I — the predicate the ambient path really passes', () => {
  async function armedGame() {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useGameStore } = require('../app/state/gameStore');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getRaces, getFactions } = require('../app/engine/character');
    await useGameStore.getState().hydrate();
    await useGameStore.getState().startNewGame({
      name: 'Aside', raceId: getRaces()[0].id, factionId: getFactions()[0].id,
    });
    useGameStore.getState().skipTutorial?.();
    useGameStore.setState({ lastPlayerActionAt: null, pendingRolls: null, isGenerating: false });
    return useGameStore;
  }

  it('⚠⚠⚠ narration hands the door a predicate, and it is the combat muzzle', async () => {
    const store = await armedGame();
    capturedOpts = null;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const narr = require('../app/ai/narration');
    narr._resetAmbientArmForTest?.();
    await narr.maybeGenerateAmbientArbiter(
      () => store.getState(),
      (p: unknown) => store.setState(p as never),
      { bankOnly: true },            // the fill lane needs no quiet/cooldown luck
    );
    // If the muzzles refused before generating there is nothing to assert on;
    // say so loudly rather than passing silently on an empty capture.
    expect(capturedOpts).not.toBeNull();
    const pred = (capturedOpts as unknown as { shouldAbort?: () => boolean }).shouldAbort;
    expect(typeof pred).toBe('function');

    // no enemies -> the aside is wanted -> the door must NOT refuse
    expect(pred!()).toBe(false);

    // an encounter spawns (exactly what happens during a long lock wait)
    const sc = store.getState().currentScene;
    store.setState({ currentScene: { ...sc, enemies: [{ name: 'Raider', hp: 5 }] } as never });
    expect(pred!()).toBe(true);      // -> the door refuses, ctx.completion never runs

    // and it recovers when the fight ends — not a one-way latch
    store.setState({ currentScene: { ...sc, enemies: [] } as never });
    expect(pred!()).toBe(false);
  });
});
