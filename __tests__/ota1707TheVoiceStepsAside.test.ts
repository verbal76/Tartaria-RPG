/**
 * OTA-1707 — THE VOICE STEPS ASIDE.
 *
 * Owner: "put in your best mixture of kokoro or no kokoro. give me your best
 * fix. but if that phone doesn't have full capability make it know to the user
 * somewhere."
 *
 * I held that one deliberately, because I had no measurement and any tier I
 * invented would have been a guess. His iPhone then supplied it (bundles
 * 03:01:49 / 03:15:06 / 03:16:01 on 2026-09-06, running OTA-1705):
 *
 *   memory: NOTHING TO RELEASE — no model was loaded (qwen='idle'), so this
 *     freed 0 bytes. The pressure is coming from something else.
 *
 *   crash ledger · stage voice:play:unload
 *   crash ledger · stage native:voice:start — alive 0ms after it
 *   Voice (TTS) guard: ⚠ VOICE CRASH detected on previous launch (1 total)
 *     — last voice: kokoro:am_michael
 *
 * So it was never co-residency. OTA-1704 took the narration model out of the
 * picture and the phone kept dying — on the VOICE. (The model, meanwhile,
 * loaded cleanly at 03:15:43, its first success since 23 August.)
 *
 * The guard for this already existed and was disarmed: OTA-463 wired a voice
 * auto-disable, OTA-464 pulled it because the breadcrumb could not tell a real
 * Kokoro crash from an OTA reload, a backgrounding or a swipe-away. Two of
 * those three have since been closed by other work — OTA-985 build-scopes the
 * count and drops the reload's crumb, arb126 clears the crumb on backgrounding
 * — which is what makes re-arming safe. The same count-but-never-stop shape as
 * OTA-1704, one subsystem over.
 */

const mockStore: Record<string, string> = {};
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    setItem: jest.fn(async (k: string, v: string) => { mockStore[k] = v; }),
    getItem: jest.fn(async (k: string) => (k in mockStore ? mockStore[k] : null)),
    removeItem: jest.fn(async (k: string) => { delete mockStore[k]; }),
  },
}));

import { readFileSync } from 'fs';
import { join } from 'path';
import { OTA_BUILD_ID } from '../app/buildInfo';

const src = (...p: string[]): string => readFileSync(join(__dirname, '..', ...p), 'utf8');

const K = {
  count: 'tartaria.ml.ttsCrashCount',
  build: 'tartaria.ml.ttsCrashCountBuild',
  inProgress: 'tartaria.ml.ttsInProgress',
  disabled: 'tartaria.ml.ttsDisabledByCrash',
};

interface Read { bundled: boolean; count: number; line: string | null; summary: string }

async function boot(): Promise<Read> {
  let out: Read | undefined;
  await jest.isolateModulesAsync(async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ml = require('../app/diagnostics/mlHealth');
    const h = await ml.loadMLHealth();
    out = {
      bundled: ml.shouldAttemptBundledTTS(),
      count: h.ttsCrashCount,
      line: ml.voiceCapabilityLine(),
      summary: ml.mlHealthSummary(),
    };
  });
  return out!;
}

const crumb = () => JSON.stringify({ label: 'kokoro:am_michael', at: new Date().toISOString() });

beforeEach(() => { for (const k of Object.keys(mockStore)) delete mockStore[k]; });

describe('OTA-1707 — one crash is noise, two on a build is a pattern', () => {
  it('a clean device keeps the bundled voice and is told nothing', async () => {
    const r = await boot();
    expect({ bundled: r.bundled, line: r.line }).toEqual({ bundled: true, line: null });
  });

  it('⚠ ONE voice crash still keeps Kokoro — OTA-464’s protection is preserved exactly', async () => {
    mockStore[K.build] = OTA_BUILD_ID;
    mockStore[K.inProgress] = crumb();
    const r = await boot();
    expect({ count: r.count, bundled: r.bundled, line: r.line }).toEqual({ count: 1, bundled: true, line: null });
  });

  it('⚠⚠ the SECOND crash on the same build stands the bundled voice down', async () => {
    mockStore[K.build] = OTA_BUILD_ID;
    mockStore[K.count] = '1';
    mockStore[K.inProgress] = crumb();
    const r = await boot();
    expect({ count: r.count, bundled: r.bundled }).toEqual({ count: 2, bundled: false });
    expect(r.line).toBeTruthy();
    expect(r.line!.includes("device's built-in voice")).toBe(true);
    expect(r.line!.includes('Nothing goes unspoken')).toBe(true);
  });

  it('⚠⚠ a NEW BUILD starts the voice fresh — the count is build-scoped, so a fix gets to prove itself', async () => {
    mockStore[K.build] = 'some-older-build';
    mockStore[K.count] = '9';
    const r = await boot();
    expect({ count: r.count, bundled: r.bundled, line: r.line }).toEqual({ count: 0, bundled: true, line: null });
  });

  it('no durable disable flag is ever written, so an OTA-463-era flag cannot strand a device', async () => {
    mockStore[K.disabled] = 'true';   // stale, from the reverted OTA-463
    mockStore[K.build] = OTA_BUILD_ID;
    mockStore[K.count] = '1';
    const r = await boot();
    expect(r.bundled).toBe(true);                    // the count decides, not the flag
    expect(mockStore[K.disabled]).toBeUndefined();   // and the legacy key is cleared
    // At the threshold the verdict flips without any flag being persisted.
    mockStore[K.count] = '2';
    const r2 = await boot();
    expect(r2.bundled).toBe(false);
    expect(mockStore[K.disabled]).toBeUndefined();
  });

  it('RELOAD AI clears the voice count too', async () => {
    mockStore[K.build] = OTA_BUILD_ID;
    mockStore[K.count] = '2';
    expect((await boot()).bundled).toBe(false);
    await jest.isolateModulesAsync(async () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const ml = require('../app/diagnostics/mlHealth');
      await ml.loadMLHealth();
      await ml.resetMLHealth();
    });
    expect(mockStore[K.count]).toBeUndefined();
    expect((await boot()).bundled).toBe(true);
  });
});

describe('OTA-1707 — the fallback is the one arb54 already proved', () => {
  it('⚠⚠ the guard rides the existing error-state fallthrough, so the Arbiter never goes silent', () => {
    const mgr = src('app', 'voice', 'TTSManager.ts');
    // The bundled branch is entered only when the model is healthy AND the guard
    // is open; everything below it is the system-engine path that already existed.
    expect(mgr.includes("if (getKokoroState().phase !== 'error' && shouldAttemptBundledTTS()) {")).toBe(true);
    // The ~100MB warm is skipped too — the load is what has been killing it.
    expect(mgr.includes("initial.engine === 'bundled' && shouldAttemptBundledTTS()")).toBe(true);
    expect(mgr.includes("s.engine === 'bundled' && shouldAttemptBundledTTS()")).toBe(true);
    // And "is it speaking" asks the engine the line actually went out on.
    expect(mgr.includes("settings.engine === 'bundled' && shouldAttemptBundledTTS()")).toBe(true);
  });

  it('⚠⚠ the guard is reached LAZILY, so TTSManager does not drag AsyncStorage into every caller', () => {
    const mgr = src('app', 'voice', 'TTSManager.ts');
    // MEASURED: a top-level `import … from '../diagnostics/mlHealth'` here put
    // AsyncStorage in the module graph of everything that imports TTSManager, and
    // ttsLanguagePinnedEnglish went from passing to "test suite failed to run —
    // NativeModule: AsyncStorage is null" before executing a line.
    expect(mgr.includes("from '../diagnostics/mlHealth'")).toBe(false);
    expect(mgr.includes("require('../diagnostics/mlHealth')")).toBe(true);
    // And it fails OPEN — a diagnostics module that cannot load must never be the
    // reason the player loses the narrator.
    const fn = mgr.slice(mgr.indexOf('function shouldAttemptBundledTTS()'));
    const body = fn.slice(0, fn.indexOf('\n}'));
    expect(body.includes('return true;')).toBe(true);
  });

  it('the player is told where the voice announces itself, on the system channel', () => {
    const ctl = src('app', 'voice', 'TTSController.ts');
    expect(ctl.includes('const vc = ml.voiceCapabilityLine();')).toBe(true);
    expect(ctl.includes("useGameStore.getState().appendLog('system', vc);")).toBe(true);
    const at = ctl.indexOf('const vc = ml.voiceCapabilityLine();');
    expect(at).toBeGreaterThan(ctl.indexOf('logVoice(`voice: engine='));
  });

  it('the threshold and the derivation are where they say they are', () => {
    const ml = src('app', 'diagnostics', 'mlHealth.ts');
    expect(ml.includes('const MAX_TTS_CRASHES_BEFORE_DISABLE = 2;')).toBe(true);
    // ⚠ Derived AFTER the breadcrumb increment — see the note at that line. If it
    // moves back above, the crash that reaches the threshold is not acted on
    // until the next launch, which is one more freeze for the player.
    expect(ml.includes('ttsDisabledByCrash = ttsCrashCount >= MAX_TTS_CRASHES_BEFORE_DISABLE;')).toBe(true);
    expect(ml.indexOf('ttsDisabledByCrash = ttsCrashCount >= MAX_TTS_CRASHES_BEFORE_DISABLE;'))
      .toBeGreaterThan(ml.indexOf('ttsCrashCount += 1;'));
    expect(ml.includes('return !(cached?.ttsDisabledByCrash ?? false);')).toBe(true);
  });
});
