jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// ⚠⚠ OTA-1251 — THE PC BUILD'S FIRST RUN NEVER FINISHED. Owner: *"I think the
// arbiter first time setup has frozen, it did this before on my steam deck.
// it's been a few minutes and it's hanging at 51%."*
//
// It had not frozen for a few minutes. It was never going to finish, and 51%
// was a permanent number, not a slow one.
//
// ⚠ MEASURED BEFORE IT WAS FIXED — the same web bundle the owner installed,
// exported and driven headless in Chromium:
//     t=8s   {stage: "qwen:failed", kokoro: {"phase":"loading"}, exec: "true"}
//     t=20s  {stage: "qwen:failed", kokoro: {"phase":"loading"}, exec: "true"}
//     t=35s  {stage: "qwen:failed", kokoro: {"phase":"loading"}, exec: "true"}
// and the owner's own copied diagnostic from the desktop build agreed:
//     Platform: web · Boot stage: qwen:failed · Voice (TTS) guard: clean
//
// Three faults, all of them desktop-only, all of them held together by that
// one number:
//   1. Kokoro's executorch prewarm ran on web. `TextToSpeechModule.fromModelName`
//      EXISTS in a web bundle (measured: exec = "true"), so the old guard passed
//      — but the call behind it neither resolves NOR rejects, so the state
//      machine sat on 'loading' (0.92) with no error anyone could catch.
//   2. Qwen's watchdog re-tried a native module that cannot exist on desktop, on
//      a timer, forever — 16 lines of the owner's 4.4k-char bug report.
//   3. The bar's own arithmetic scored a FAILED engine as 0.1 ("barely begun")
//      when Kokoro's half had always scored a settled 'error' as 1.
//      (0.10 + 0.92) / 2 = 0.51, to the digit.
//
// ⚠⚠ MOBILE MUST BE UNTOUCHED. jest-expo runs the NATIVE platform, so every
// guard below is inert here by construction — which is exactly the regression
// this suite protects. The desktop fixes may not move the phone by one frame.
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  qwenBootShare, kokoroBootShare, modelBootPercent, modelsStillLoading,
} from '../app/ui/modelBootProgress';

const src = (...p: string[]): string => readFileSync(join(__dirname, '..', ...p), 'utf8');

describe('OTA-1251 — the desktop first run settles instead of hanging at 51%', () => {
  it('⚠⚠ THE BUG, REPRODUCED IN ARITHMETIC: the old scoring lands on exactly 51%', () => {
    // The old rule, restated: a failed Qwen scored 0.1 instead of 1.
    const oldQwenShare = 0.1;              // qwenStatus === 'failed' fell through
    const wedgedKokoroShare = 0.92;        // kokoro phase 'loading', forever
    expect(Math.round(((oldQwenShare + wedgedKokoroShare) / 2) * 100)).toBe(51);
  });

  it('⚠⚠ SETTLED IS SETTLED — failed and skipped now score a full share, like ready', () => {
    for (const s of ['ready', 'failed', 'skipped'] as const) {
      expect(qwenBootShare(s, 0)).toBe(1);
    }
    // ...and the same rule Kokoro always had.
    expect(kokoroBootShare({ phase: 'ready' })).toBe(1);
    expect(kokoroBootShare({ phase: 'error', message: 'x' })).toBe(1);
  });

  it('⚠ work genuinely in flight still scores less than done', () => {
    expect(qwenBootShare('downloading', 0.4)).toBe(0.4);
    expect(qwenBootShare('loading', 0)).toBeLessThan(1);
    expect(qwenBootShare('idle', 0)).toBeLessThan(0.5);
    expect(kokoroBootShare({ phase: 'downloading', fraction: 0.4 })).toBe(0.4);
    // A garbage fraction can never push the bar past full or below empty.
    expect(qwenBootShare('downloading', 5)).toBe(1);
    expect(qwenBootShare('downloading', NaN)).toBe(0);
    expect(qwenBootShare('downloading', -2)).toBe(0);
  });

  it('⚠⚠ THE FIX, ON THE OWNER\'S EXACT STATE: qwen failed + kokoro idle → no bar at all', () => {
    // This is what the desktop build now reports. Qwen fails in ~15ms (correct:
    // llama.rn is native, the Arbiter narrates from templates) and Kokoro never
    // starts, because prewarm stands down on web.
    expect(modelsStillLoading('failed', { phase: 'idle' })).toBe(false);
    // And had it somehow still been on screen, it would read 55%, not 51% —
    // the half that HAS finished is now counted as finished.
    expect(modelBootPercent('failed', 0, { phase: 'idle' })).toBe(55);
  });

  it('⚠ a real first-install download on a phone still reads as progress', () => {
    expect(modelsStillLoading('downloading', { phase: 'idle' })).toBe(true);
    expect(modelBootPercent('downloading', 0.5, { phase: 'downloading', fraction: 0.5 })).toBe(50);
    expect(modelBootPercent('ready', 1, { phase: 'ready' })).toBe(100);
  });

  it('⚠⚠ THE FREEZE ITSELF: the executorch voice prewarm stands down on desktop', () => {
    const ptm = src('app', 'voice', 'PiperTTSManager.ts');
    // Both entry points guarded — the boot prewarm AND the lazy per-voice load.
    // One un-guarded executorch call is all it takes to re-wedge 'loading'.
    const prewarm = ptm.slice(ptm.indexOf('export async function prewarmKokoro'));
    expect(prewarm.slice(0, 3000)).toContain("Platform.OS === 'web'");
    const ensure = ptm.slice(ptm.indexOf('async function ensureLoaded'));
    expect(ensure.slice(0, 2500)).toContain("Platform.OS === 'web'");
    // ⚠ The guard must come BEFORE the phase ever moves to 'loading' — that is
    // the whole failure: a promise that never settles cannot be recovered from
    // after the fact.
    const web = ensure.indexOf("Platform.OS === 'web'");
    const loading = ensure.indexOf("setKokoroState({ phase: 'loading' })");
    expect(web).toBeGreaterThan(-1);
    expect(loading).toBeGreaterThan(web);
  });

  it('⚠⚠ the desktop voice route stays OPEN — standing down must not mean silence', () => {
    // speak() falls through to the system engine only when the phase is 'error'.
    // The guard deliberately leaves it on 'idle', so the ONNX (kokoro-js) desktop
    // path is still reached. Faking 'ready' or setting 'error' would both break it.
    const ptm = src('app', 'voice', 'PiperTTSManager.ts');
    const prewarm = ptm.slice(ptm.indexOf('export async function prewarmKokoro'), ptm.indexOf('export function isSpeaking'));
    expect(prewarm).not.toContain("phase: 'error'");
    expect(prewarm).not.toContain("phase: 'ready'");
  });

  it('⚠⚠ the Qwen watchdog does not chase a native module that cannot exist on desktop', () => {
    const store = src('app', 'state', 'gameStore.ts');
    const wd = store.slice(store.indexOf('function startQwenWatchdog'));
    const guard = wd.indexOf("Platform.OS === 'web'");
    const firstWork = wd.indexOf('qwenWatchdogTimer !== null');
    expect(guard).toBeGreaterThan(-1);
    expect(firstWork).toBeGreaterThan(guard); // stands down before it schedules anything
    // Platform must be a real top-level import, not a lazy require inside a branch.
    expect(store).toMatch(/import \{[^}]*\bPlatform\b[^}]*\} from 'react-native'/);
  });

  it('⚠⚠ the soft-keyboard popup never mounts on a machine with no soft keyboard', () => {
    // Owner: "i should just be able to type in the existing text bar, not have
    // it create a new one." The bar positions in device-pixel space OUTSIDE the
    // centred column by design, so on desktop it spanned the whole window.
    const bar = src('app', 'components', 'KeyboardInputBar.tsx');
    const body = bar.slice(bar.indexOf('export function KeyboardInputBar'));
    const web = body.indexOf("Platform.OS === 'web'");
    const screenGate = body.indexOf("screen !== 'exploration'");
    expect(web).toBeGreaterThan(-1);
    expect(screenGate).toBeGreaterThan(web); // the very first gate
  });

  it('⚠ the PC build says which build it is', () => {
    // Owner: "this says Tartaria Build, that's HAL — this should be Steam Beta
    // Build." Application.applicationId is empty on desktop ("App ID: (unknown)"
    // in the owner's diagnostic), so every id test fell through to the base label.
    const title = src('app', 'screens', 'TitleScreen.tsx');
    expect(title).toContain('STEAM BETA BUILD');
    const steam = title.indexOf("const isSteam = Platform.OS === 'web'");
    const arb = title.indexOf("appId.endsWith('.arbiters')");
    expect(steam).toBeGreaterThan(-1);
    expect(arb).toBeGreaterThan(steam); // platform decided first
    // The other four lines keep their names.
    for (const line of ['ARBITER BUILD', 'GOLEM BUILD', 'ENGINE BUILD', 'TARTARIA BUILD']) {
      expect(title).toContain(line);
    }
  });

  it('⚠⚠ the bar math is no longer inline JSX — untestable math is how this shipped', () => {
    const title = src('app', 'screens', 'TitleScreen.tsx');
    expect(title).toContain('modelBootPercent(qwenStatus, qwenFraction, kokoroPhase)');
    expect(title).toContain('modelsStillLoading(qwenStatus, kokoroPhase)');
    // No second copy of the scoring left behind to drift.
    expect(title).not.toMatch(/qwenStatus === 'loading' \? 0\.92/);
  });
});
