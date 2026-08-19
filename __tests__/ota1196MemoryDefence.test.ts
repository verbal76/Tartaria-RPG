// OTA-1196 — STOP ASKING iOS FOR MEMORY IT HAS ALREADY REFUSED.
//
// Second device report, and the symptom ESCALATED. Owner: *"On the last run through I hit
// investigate and the game crashed to home screen. On this run… I went to the mission
// board and accepted all the missions and then set the location auto route to the nearest
// Guardian, and when I went back to the main screen it was completely frozen again. I had
// to hard stop the app."*
//
// ⚠⚠ THE CRASH IS THE MORE DIAGNOSTIC OF THE TWO, and the log dates it to the second:
//     12:46:27.037  qwen-watchdog: Qwen not ready (status='failed'); reinitializing (#2)
//     12:46:27.931  player: investigate the floor
//     12:46:28.008  cognitive neutral (70ms)
//     [nothing — the voice engine re-inits at 12:46:38, i.e. a fresh app launch]
// The bug report says `Last JS crash: none recorded`. A crash to the home screen with NO
// JS error captured is a NATIVE death, and on iOS the overwhelmingly common native death
// is the OS reclaiming a process that asked for too much too fast — which is exactly what
// a ~400MB context load racing an inference looks like.
//
// ⚠ AND THE PREVIOUS OTA'S HOLD IS OVER. OTA-1195 deliberately shipped instruments only,
// so the next log would measure the bug untouched. That reasoning is overtaken: this
// report arrived still on 1194 (the instruments were never running), and the symptom went
// from a freeze to a lost session. Sitting on a plausible mitigation for methodological
// purity while the owner loses runs is the wrong trade.

jest.setTimeout(30000);
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
  makeDirectoryAsync: jest.fn(async () => {}), readAsStringAsync: jest.fn(async () => ''),
  writeAsStringAsync: jest.fn(async () => {}), deleteAsync: jest.fn(async () => {}),
  downloadAsync: jest.fn(async () => ({ uri: '' })), EncodingType: { UTF8: 'utf8', Base64: 'base64' },
}));
jest.mock('expo-speech', () => ({ speak: jest.fn(), stop: jest.fn(), isSpeakingAsync: jest.fn(async () => false) }));
type MockSound = { playAsync: () => Promise<void>; unloadAsync: () => Promise<void> };
jest.mock('expo-av', () => ({
  Audio: {
    setAudioModeAsync: jest.fn(),
    Sound: class {
      static createAsync: () => Promise<{ sound: MockSound }> = jest.fn(async () => ({
        sound: { playAsync: jest.fn(async () => {}), unloadAsync: jest.fn(async () => {}) },
      }));
    },
  },
}));

import * as fs from 'fs';
import * as path from 'path';
const read = (...p: string[]): string => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');
const STORE = read('app', 'state', 'gameStore.ts');
const RUNTIME = read('app', 'ai', 'generation', 'LlamaRuntime.ts');

/** Strip comment blocks before asserting on code. ⚠ This file describes the very calls it
 *  forbids, so a raw match would flag the explanation as the violation — the trap that
 *  bit five times in one session before the rule got written down. */
const codeOnly = (src: string): string => src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

describe('OTA-1196 — the model load finally takes the native-ML lock', () => {
  it('⚠⚠ THE BIGGEST ALLOCATION IN THE APP WAS THE ONE CALL GOING IN UNSERIALIZED', () => {
    // Completion took the lock (OTA-459's Tensor G5 SIGSEGV). Release took it (OTA-1146).
    // The ~400MB context LOAD — larger than either — did not.
    const code = codeOnly(RUNTIME);
    expect(code).toContain('runExclusiveNativeMl(() => mod.initLlama(');
    // The bare unserialized call must be gone, not merely wrapped somewhere nearby.
    expect(code).not.toMatch(/=\s*await\s+mod\.initLlama\(/);
  });

  it('⚠ IT LOADS AT LLM PRIORITY, so a voice line still outranks a reload', () => {
    // The player hears the Arbiter on time and the reload waits its turn. Loading ABOVE
    // voice would trade a crash for a stutter on every line.
    const i = codeOnly(RUNTIME).indexOf('runExclusiveNativeMl(() => mod.initLlama(');
    expect(i).toBeGreaterThan(-1);
    expect(codeOnly(RUNTIME).slice(i, i + 1200)).toContain('ML_PRIORITY_LLM');
  });

  it('all three native entry points are serialized now — load, completion, release', () => {
    const code = codeOnly(RUNTIME);
    expect((code.match(/runExclusiveNativeMl\(/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });
});

describe('OTA-1196 — a memory warning is ANSWERED, not just written down', () => {
  it('⚠⚠ OTA-1195 LOGGED IT AND DID NOTHING — that was only half a fix', () => {
    // iOS raises this precisely so an app can hand memory back BEFORE the OS takes the
    // process instead. We hold a ~400MB context and we have a dispose() for it.
    const i = STORE.indexOf('AppState.addEventListener(\'memoryWarning\'');
    expect(i).toBeGreaterThan(-1);
    const block = STORE.slice(i, i + 9000);
    expect(block).toContain('.dispose()');
  });

  it('the release is reported, so a log shows the app defended itself', () => {
    // ⚠⚠ RETARGETED BY OTA-1202, AND THE NEW CLAIM IS STRONGER. This pinned the literal
    // "released the Qwen context (~400MB) in response to the warning" — which turned out
    // to be printed UNCONDITIONALLY, whether or not anything was freed. The owner's
    // 2026-08-09 report shows it five times with `qwen='idle'`: five reports of ~400MB
    // released while no model was loaded. The old assertion was pinning the bug.
    // "The app defended itself" is only worth logging when it is TRUE, so what this
    // checks now is that the claim is gated on an actual release.
    expect(STORE).toContain('const freed = contextLedger().released > before;');
    expect(STORE).toContain('(~${APPROX_CONTEXT_MB}MB est)');
    // And the honest alternative exists for when nothing was held.
    expect(STORE).toContain('NOTHING TO RELEASE');
  });

  it('⚠ A FAILED RELEASE CANNOT ESCALATE A WARNING INTO A CRASH', () => {
    const i = STORE.indexOf('AppState.addEventListener(\'memoryWarning\'');
    const block = STORE.slice(i, i + 9000);
    expect(block).toContain('a failed release must never escalate a memory warning into a crash');
    expect(block).toMatch(/\.catch\(/);
  });

  it('⚠ AND THE WATCHDOG IS NOT SUPPRESSED — release under pressure, recover after it', () => {
    // Disposing without letting the watchdog bring Qwen back would turn one memory
    // warning into permanently template-only narration for the rest of the session.
    const i = STORE.indexOf('AppState.addEventListener(\'memoryWarning\'');
    const block = STORE.slice(i, i + 9000);
    expect(block).toMatch(/watchdog is deliberately NOT suppressed/i);
  });
});

describe('OTA-1196 — an iOS twitch no longer buys a 400MB reload', () => {
  it('⚠⚠ THE HELD DEFECT IS FIXED — `inactive` alone is not a return to the app', () => {
    // iOS bounces active → inactive → active for a notification banner, a Control Center
    // pull, or a peek at the app switcher. Android does not. The freeze log caught it
    // three times, each pair ~350ms apart, each buying a fresh reload.
    const code = codeOnly(STORE);
    expect(code).not.toContain("if (next === 'active') { qwenBackoffLevel = 0; tick(); }");
    // ⚠ OTA-1287 widened this handler (foreground-settle clock restart rode in);
    // the RULE is unchanged: only a genuine `background` sets the flag.
    expect(code).toMatch(/if \(next === 'background'\) \{[\s\S]{0,300}?qwenTrulyBackgrounded = true;/);
    expect(code).toContain("if (next !== 'active') return;");
    expect(code).toContain('if (!qwenTrulyBackgrounded) return;');
  });

  it('a real background→active round trip still gets its fast retry', () => {
    // The OTA-1107 behaviour that was RIGHT is preserved: the player is genuinely back, so
    // the first retry should be immediate.
    const i = codeOnly(STORE).indexOf('qwenTrulyBackgrounded = false;\n      qwenBackoffLevel = 0;');
    expect(i).toBeGreaterThan(-1);
    expect(codeOnly(STORE).slice(i, i + 400)).toContain('tick();');
  });

  it('⚠ THE FLAG IS ONLY SET BY A GENUINE `background`, never by `inactive`', () => {
    // ⚠ SIXTH VARIANT OF THE SAME TRAP, and the lesson is now written down properly.
    // The first draft scanned for `inactive` near the assignment — and matched the TRAILING
    // comment `// 'inactive' alone is a twitch`. `codeOnly` strips comment BLOCKS and
    // LINE-START `//`, but a trailing `//` on a code line survives it, and stripping those
    // blindly would eat every `https://` in the file. So do not pattern-match prose
    // proximity at all: assert the STRUCTURE instead. The flag is set exactly once, and
    // that one site is the `background` branch.
    const assigns = STORE.match(/qwenTrulyBackgrounded = true/g) ?? [];
    expect(assigns.length).toBe(1);
    expect(STORE).toMatch(/if \(next === 'background'\) \{[\s\S]{0,300}?qwenTrulyBackgrounded = true;/);
  });
});

describe('OTA-1196 — the reloads have a ceiling now', () => {
  it('⚠⚠ QWEN OFF BEATS THE APP DEAD, and the ladder never stopped on its own', () => {
    // The backoff spreads retries out but never ends them, so a device that simply cannot
    // hold the context retries forever — each attempt another allocation spike, on the
    // platform whose answer to that is to kill the process.
    expect(STORE).toContain('const QWEN_MAX_REINITS_PER_STRETCH = 8;');
    expect(STORE).toContain('if (qwenReinitAttempts >= QWEN_MAX_REINITS_PER_STRETCH)');
  });

  it('it says so once, plainly, and then goes quiet', () => {
    expect(STORE).toContain('STANDING DOWN');
    expect(STORE).toContain('if (!qwenReinitCeilingLogged)');
  });

  it('⚠ THE CEILING LIFTS ON A REAL PUT-AWAY-AND-RETURN, not on a twitch', () => {
    // A genuine background is both the player asking for a fresh start AND the moment iOS
    // has actually reclaimed what it needed. Resetting on a notification banner would
    // restore the exact loop this removes.
    // ⚠ Anchored on the LISTENER's unique line. `qwenTrulyBackgrounded = false` also
    // appears in the watchdog's restart reset, which sorts earlier in the file — a bare
    // indexOf found that one and read the wrong block.
    const i = STORE.indexOf('if (!qwenTrulyBackgrounded) return;');
    expect(i).toBeGreaterThan(-1);
    const block = STORE.slice(i, i + 700);
    expect(block).toContain('qwenReinitAttempts = 0;');
    expect(block).toContain('qwenReinitCeilingLogged = false;');
    expect(block).toContain('qwenBackoffLevel = 0;');
  });

  it('and a re-hydrate starts clean rather than inheriting the last run refusals', () => {
    const i = STORE.indexOf('function startQwenWatchdog');
    const block = STORE.slice(i, i + 1400);
    expect(block).toContain('qwenReinitCeilingLogged = false;');
    expect(block).toContain('qwenTrulyBackgrounded = false;');
  });

  it('the ceiling sits AFTER the foreground guard, so a backgrounded app never burns one', () => {
    const code = codeOnly(STORE);
    const guard = code.indexOf('qwenHeldWhileBackgroundLogged = false;\n      ');
    const ceiling = code.indexOf('if (qwenReinitAttempts >= QWEN_MAX_REINITS_PER_STRETCH)');
    const kick = code.indexOf('qwenReinitAttempts += 1;');
    expect(guard).toBeGreaterThan(-1);
    expect(ceiling).toBeGreaterThan(guard);
    expect(kick).toBeGreaterThan(ceiling);
  });
});

describe('OTA-1196 — what this OTA does NOT claim', () => {
  it('⚠⚠ THE CAUSE IS A HYPOTHESIS, AND THE FILE SAYS SO RATHER THAN ASSERTING IT', () => {
    // No memory warning has yet been OBSERVED — the instruments that would record one
    // shipped in OTA-1195 and the reporting device was still on 1194. Every fix here is
    // defensible on its own terms (an unserialized 400MB load is wrong regardless), but
    // "this is why it crashed" is not yet proven and must not be written as though it is.
    const i = RUNTIME.indexOf('THE MODEL LOAD NOW TAKES THE NATIVE-ML LOCK');
    expect(i).toBeGreaterThan(-1);
    const block = RUNTIME.slice(i, i + 1800);
    expect(block).toMatch(/overwhelmingly common/i); // hedged, not asserted
    expect(block).toMatch(/none recorded/);          // and the evidence is cited
  });

  it('the instruments from OTA-1195 are untouched, so the next log still measures', () => {
    expect(STORE).toContain("AppState.addEventListener('memoryWarning'");
    expect(STORE).toContain('freezeVerdictLine(');
    expect(STORE).toContain('export function logUiTap');
  });
});
