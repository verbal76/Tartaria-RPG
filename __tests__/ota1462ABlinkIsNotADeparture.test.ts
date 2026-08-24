/**
 * OTA-1462 — A BLINK IS NOT A DEPARTURE.
 *
 * ⚠⚠⚠ THE OWNER'S CRASH, AND THE MEASUREMENT THAT EXPLAINS IT.
 *
 *     "crash to home screen during flee, reopened game to still being in
 *      mid-fight, no character selection screen, just right back into the game"
 *
 * His 2026-08-23 device log carries five of these inside ninety seconds:
 *
 *     23:52:09.808  active → background     23:52:10.163  → active  (355ms)
 *     23:52:51.665  active → background     23:52:51.831  → active  (166ms)
 *     23:54:00.671  active → background     23:54:00.874  → active  (204ms)
 *     23:54:15.820  active → background     23:54:16.045  → active  (225ms)
 *     23:54:30.087  active → background     23:54:30.483  → active  (396ms)
 *
 * Nobody switches away and back in 204ms. Those are focus blips — a shade pull,
 * a keyboard, a system dialog — and each one ran the FULL background teardown:
 * free the ~425MB Qwen context, then rebuild it eight seconds later.
 *
 * ⚠⚠ THE PROOF THAT IT WAS PURE WASTE: `ctx: RELEASED` is stamped at :10.325,
 * :52.067, :01.021, :16.187 and :30.774 — every one AFTER its matching
 * `→ active`. The release was never protecting a backgrounded app from the
 * low-memory killer; it was freeing memory belonging to an app already back on
 * screen. Five ~425MB allocate/free cycles in ninety seconds, and at 23:54:46,
 * 126ms into a `flee`, the process was reaped.
 *
 * ⚠⚠⚠ AND THE SAME BLIP BLINDED THE FORENSICS BUILT TO CATCH THIS. All three
 * `native-death` records in his ledger read `doing: (no action yet)` — including
 * the one stamped mid-flee — because the blip's `clearLiveBreadcrumb()` erased
 * the crumb naming the live action, and the next render stamp rebuilt an empty
 * one. Five OTAs of crash forensics answering "nothing was happening" every time
 * something was.
 *
 * One cause. Both symptoms. These pins are on the BEHAVIOUR of the settle
 * window, not on the number: `1500` should be free to move, "a blip tears
 * nothing down and a real background still does" is the claim.
 */
// ⚠ The watchdog reaches the native ML engines through `engines.ts`, so this
// suite needs the same native stubs every store-touching suite carries. It
// asserts on scheduling and on source structure — no model is ever loaded.
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
      static createAsync: () => Promise<{ sound: { playAsync: () => void; unloadAsync: () => void } }> =
        jest.fn(async () => ({ sound: { playAsync: jest.fn(), unloadAsync: jest.fn() } }));
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

import { blockAt, between } from '../test-utils/srcBlock';
import {
  QWEN_BACKGROUND_SETTLE_MS,
  _qwenSetForegroundSince,
  _qwenForegroundSettled,
} from '../app/ai/qwenWatchdog';

const read = (...p: string[]) =>
  require('fs').readFileSync(require('path').join(__dirname, '..', ...p), 'utf8') as string;
const APP = read('App.tsx');
const WATCHDOG = read('app', 'ai', 'qwenWatchdog.ts');

/** ⚠ Comments stripped BEFORE anything else is decided. Two OTAs running, a
 *  scanner that read source as text tripped over an apostrophe in a comment
 *  (ota1459) and then over its own prose naming the symbol it forbade
 *  (check-voice-pools). The headers here quote the log timestamps and the words
 *  `shutdownQwen` and `clearLiveBreadcrumb` many times over; without this every
 *  assertion below would be reading its own documentation. */
const codeOnly = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const APP_CODE = codeOnly(APP);
const WATCHDOG_CODE = codeOnly(WATCHDOG);

describe('OTA-1462 — the window itself', () => {
  it('⚠⚠⚠ THE TWO MODULES AGREE ON HOW LONG A BACKGROUND MUST LAST', () => {
    // App.tsx frees the memory; the watchdog decides when to rebuild it. They
    // latch on the same event and MUST use the same window — if the watchdog
    // believed a blip that App.tsx ignored, it would treat a still-live context
    // as a put-away-and-return and spend ~425MB reviving what was never gone.
    //
    // ⚠ The constant is duplicated because the import would be a module cycle
    // (watchdog is a leaf; App.tsx is the component root). This pin is the
    // entire justification for that duplication: change one without the other
    // and the suite fails instead of the defect quietly re-opening.
    const m = APP_CODE.match(/BACKGROUND_SETTLE_MS\s*=\s*([\d_]+)/);
    expect(m).not.toBeNull();
    const appWindow = Number(m![1]!.replace(/_/g, ''));
    expect({ appWindow, watchdog: QWEN_BACKGROUND_SETTLE_MS })
      .toEqual({ appWindow, watchdog: appWindow });
  });

  it('⚠⚠⚠ IT CLEARS EVERY BLIP IN THE OWNER\'S LOG, WITH REAL MARGIN', () => {
    // The five measured blips. If the window ever drops below the longest of
    // them, that blip starts tearing down ~425MB again — and the failure would
    // be invisible in every test that did not use his actual numbers.
    const MEASURED_BLIPS_MS = [355, 166, 204, 225, 396, 307];
    for (const blip of MEASURED_BLIPS_MS) {
      expect({ blip, cleared: blip < QWEN_BACKGROUND_SETTLE_MS })
        .toEqual({ blip, cleared: true });
    }
    // and not merely by a hair — the longest blip must have real headroom, or
    // one slower device puts us straight back where we started.
    expect(QWEN_BACKGROUND_SETTLE_MS).toBeGreaterThanOrEqual(Math.max(...MEASURED_BLIPS_MS) * 2);
  });

  it('⚠⚠⚠ …AND STILL RELEASES ON A REAL BACKGROUND — the jetsam fix survives', () => {
    // The other half, and the one that matters more: OTA-1452 exists because a
    // backgrounded app holding 425MB is what Android's low-memory killer reaps
    // first. Every genuine background in the same log is ≥7.7s. A window that
    // crept up past those would not be a debounce, it would be a decision to
    // hold the memory — the exact regression the earlier fix forbids.
    const MEASURED_REAL_BACKGROUNDS_MS = [7782, 9545, 9970, 47931, 5412];
    for (const real of MEASURED_REAL_BACKGROUNDS_MS) {
      expect({ real, tearsDown: real > QWEN_BACKGROUND_SETTLE_MS })
        .toEqual({ real, tearsDown: true });
    }
  });

  it('⚠⚠ the settle window is far SHORTER than the re-warm window', () => {
    // They are opposite risks and must not be tuned to the same number. Coming
    // back in costs 425MB, so it waits long (8s). Going out risks a kill, so it
    // waits only long enough to disbelieve a blip. Equal values would mean
    // somebody stopped thinking about which direction they were guarding.
    const m = APP_CODE.match(/QWEN_REWARM_DELAY_MS\s*=\s*([\d_]+)/);
    expect(m).not.toBeNull();
    const rewarm = Number(m![1]!.replace(/_/g, ''));
    expect(QWEN_BACKGROUND_SETTLE_MS).toBeLessThan(rewarm);
  });
});

describe('OTA-1462 — nothing destructive happens on the raw event', () => {
  /** The teardown body, as source, so each claim below is about what is INSIDE
   *  the deferred callback rather than about the file containing the words. */
  const armIdx = APP_CODE.indexOf('backgroundTeardownTimer.current = setTimeout');
  const teardownBody = (): string => {
    expect(armIdx).toBeGreaterThan(-1);
    // ⚠ OTA-1484 wave — the byte window (armIdx + 1400) is now the setTimeout
    // STATEMENT itself, bounded to where its callback closes: the claim is
    // about what sits inside the deferred callback, so the window is exactly
    // that callback, however it grows.
    return blockAt(APP_CODE, 'backgroundTeardownTimer.current = setTimeout', { mode: 'opener' });
  };

  it('⚠⚠⚠ THE ~425MB RELEASE IS INSIDE THE DEFERRED CALLBACK', () => {
    // The single most important structural fact. `shutdownQwen()` must appear
    // exactly once, and inside the timer — an immediate call left behind
    // anywhere else re-creates the churn no matter what the window says.
    const calls = APP_CODE.match(/void shutdownQwen\(\)/g) ?? [];
    expect(calls.length).toBe(1);
    expect(teardownBody()).toContain('void shutdownQwen()');
  });

  it('⚠⚠⚠ SO IS THE BREADCRUMB WIPE — the half that blinded the ledger', () => {
    // `doing: (no action yet)` on a death 126ms into a flee. The crumb must
    // survive a blip or the crash report keeps describing an idle app.
    const calls = APP_CODE.match(/void clearLiveBreadcrumb\(\)/g) ?? [];
    expect(calls.length).toBe(1);
    expect(teardownBody()).toContain('void clearLiveBreadcrumb()');
    expect(teardownBody()).toContain('void clearInFlightBreadcrumbs()');
  });

  it('⚠⚠⚠ THE PARK FLAG IS SET WITH THE TEARDOWN, NOT WITH THE EVENT', () => {
    // If `qwenParkedRef` latched on the raw `background`, a cancelled teardown
    // would leave the model marked parked while its context was never released
    // — and the `active` handler would then spend 425MB "restoring" a live
    // context. The flag means "we took it away", so it belongs where we do.
    const sets = APP_CODE.match(/qwenParkedRef\.current = true/g) ?? [];
    expect(sets.length).toBe(1);
    expect(teardownBody()).toContain('qwenParkedRef.current = true');
  });

  it('⚠⚠ but the SAVE is still immediate — a blip must never delay progress', () => {
    // persist() is cheap and idempotent, and a real kill can follow a blip with
    // no further warning. Deferring the save to "tidy up" the split would trade
    // a memory bug for a lost-progress bug, which is the worse of the two.
    const persistIdx = APP_CODE.indexOf('void useGameStore.getState().persist()');
    expect(persistIdx).toBeGreaterThan(-1);
    expect(persistIdx).toBeLessThan(armIdx);
  });

  it('⚠⚠⚠ AND A RETURN CANCELS IT — the disarm exists on the active path', () => {
    // Without this the timer fires anyway and the whole exercise is a 1.5s
    // postponement of the same churn rather than its removal.
    // ⚠ OTA-1484 wave — the branch's own body, not 500 guessed bytes.
    const activeBody = blockAt(APP_CODE, "} else if (status === 'active')", { mode: 'opener' });
    expect(activeBody).toContain('clearTimeout(backgroundTeardownTimer.current)');
    expect(activeBody).toContain('backgroundTeardownTimer.current = null');
  });

  it('⚠⚠ the timer is cleared on unmount, like every other timer beside it', () => {
    // A pending teardown outliving the AppState subscription fires against a
    // listener that is gone. The two neighbouring timers are already cleaned up
    // in that same return; this one must not be the exception.
    // ⚠ OTA-1484 wave — the rest of the unmount cleanup block, walked to its
    // real close ('inside' mode: a bare statement's window is its enclosing
    // block's remainder), not 700 guessed bytes.
    const cleanup = blockAt(APP_CODE, 'sub.remove();', { mode: 'inside' });
    expect(cleanup).toContain('backgroundTeardownTimer.current');
    expect(cleanup).toContain('clearTimeout(qwenRewarmTimer.current)');
  });

  it('⚠ arming is idempotent — a repeated background does not stack timers', () => {
    // Android can deliver `inactive` then `background`; two timers would mean
    // two teardowns, and the second would run after the app was back.
    expect(APP_CODE).toContain("status === 'background' && !backgroundTeardownTimer.current");
  });
});

describe('OTA-1462 — the watchdog observes the same window', () => {
  it('⚠⚠⚠ IT DOES NOT LATCH `trulyBackgrounded` ON THE RAW EVENT', () => {
    // The half a fix applied at one of two readers. The latch and the
    // foreground-clock reset must both sit behind the settle timer, or the
    // watchdog treats a blip as a put-away-and-return worth a fresh 425MB.
    // ⚠ OTA-1484 wave — the branch's own body.
    const bgBody = blockAt(WATCHDOG_CODE, "if (next === 'background')", { mode: 'opener' });
    expect(bgBody).toContain('qwenBackgroundSettleTimer = setTimeout');
    // both pieces of state moved inside — not just the flag
    const inside = bgBody.slice(bgBody.indexOf('setTimeout'));
    expect(inside).toContain('qwenTrulyBackgrounded = true');
    expect(inside).toContain('qwenForegroundSince = null');
  });

  it('⚠⚠⚠ AND A RETURN INSIDE THE WINDOW CANCELS THE LATCH', () => {
    const activeIdx = WATCHDOG_CODE.indexOf('if (qwenBackgroundSettleTimer !== null) {');
    expect(activeIdx).toBeGreaterThan(-1);
    expect(WATCHDOG_CODE).toContain('clearTimeout(qwenBackgroundSettleTimer)');
  });

  it('⚠⚠ the latch timer is cleared when the watchdog stops', () => {
    // ⚠ OTA-1484 wave — `between()`, not blockAt: the remove() sits inside an
    // `if (qwenAppStateSub) {…}` whose block closes BEFORE the timer clear, so
    // "rest of my block" is narrower than the claim (the srcBlock header's
    // documented case). The span runs from the unsubscribe to the clear itself,
    // and both landmarks are REQUIRED — a rename fails as a rename.
    const stopSpan = between(WATCHDOG_CODE, 'qwenAppStateSub.remove();', 'qwenBackgroundSettleTimer = null;');
    expect(stopSpan).toContain('clearTimeout(qwenBackgroundSettleTimer)');
  });

  it('⚠⚠ OTA-1278 IS UNDISTURBED — the foreground gate still works, both ways', () => {
    // Behavioural, on the real function, across the whole permutation space
    // that matters: unknown, just-returned, and long-settled. This OTA changed
    // WHEN the clock is reset, and must not have changed what it means.
    _qwenSetForegroundSince(null);
    expect(_qwenForegroundSettled()).toBe(true);   // headless / tests — never a blocker
    _qwenSetForegroundSince(Date.now());
    expect(_qwenForegroundSettled()).toBe(false);  // just back — do not spend 425MB
    _qwenSetForegroundSince(Date.now() - 60_000);
    expect(_qwenForegroundSettled()).toBe(true);   // genuinely settled — go ahead
    _qwenSetForegroundSince(null);
  });
});

describe('OTA-1462 — what a blip and a departure each cost, as arithmetic', () => {
  /**
   * ⚠⚠ A MODEL OF THE HANDLER, not the handler. It is exercised against the
   * owner's measured transitions, so the claim being checked is the one the log
   * disputes: "a blip costs nothing, a real background still releases."
   *
   * Written as a state machine rather than asserted off source text because the
   * defect was never a missing string — every symbol involved was already in
   * App.tsx, in the right file, spelled correctly, and firing at the wrong time.
   */
  const runSession = (transitions: readonly { to: 'background' | 'active'; afterMs: number }[]) => {
    let now = 0;
    let armedAt: number | null = null;
    let released = 0;
    let crumbsWiped = 0;
    const settle = () => {
      if (armedAt !== null && now - armedAt >= QWEN_BACKGROUND_SETTLE_MS) {
        released++; crumbsWiped++; armedAt = null;
      }
    };
    for (const t of transitions) {
      now += t.afterMs;
      settle();
      if (t.to === 'background') { if (armedAt === null) armedAt = now; } else { armedAt = null; }
    }
    now += 10_000; settle();
    return { released, crumbsWiped };
  };

  it('⚠⚠⚠ THE OWNER\'S NINETY SECONDS: FIVE BLIPS NOW COST ZERO RELEASES', () => {
    // Before this OTA that sequence produced five full ~425MB free/rebuild
    // cycles and the process was killed at the end of it.
    const blips = [355, 166, 204, 225, 396];
    const transitions: { to: 'background' | 'active'; afterMs: number }[] = [];
    for (const b of blips) {
      transitions.push({ to: 'background', afterMs: 15_000 });
      transitions.push({ to: 'active', afterMs: b });
    }
    expect(runSession(transitions)).toEqual({ released: 0, crumbsWiped: 0 });
  });

  it('⚠⚠⚠ AND THE FLEE BLIP SPECIFICALLY — 307ms, mid-action, wipes no crumb', () => {
    // 23:54:46.672 → 23:54:46.980. The crumb that said `action "flee"` has to
    // survive this, or the next boot reports `(no action yet)` again.
    expect(runSession([
      { to: 'background', afterMs: 7_539 },
      { to: 'active', afterMs: 307 },
    ])).toEqual({ released: 0, crumbsWiped: 0 });
  });

  it('⚠⚠⚠ A GENUINE PUT-AWAY STILL RELEASES — exactly once', () => {
    // 47.9s away, the longest real background in the log. Releasing zero times
    // here would be the memory-holding regression, which is worse than the
    // churn: it is what gets the process reaped while it is not even on screen.
    expect(runSession([
      { to: 'background', afterMs: 60_000 },
      { to: 'active', afterMs: 47_931 },
    ])).toEqual({ released: 1, crumbsWiped: 1 });
  });

  it('⚠⚠ a blip DURING a real background does not double-release', () => {
    // Once torn down, a later blip has nothing left to tear down. Two releases
    // for one departure would mean a second dispose on a freed context — the
    // orphan shape OTA-1177 filed as its leading unmeasured crash suspect.
    expect(runSession([
      { to: 'background', afterMs: 20_000 },
      { to: 'active', afterMs: 30_000 },
      { to: 'background', afterMs: 1_000 },
      { to: 'active', afterMs: 200 },
    ])).toEqual({ released: 1, crumbsWiped: 1 });
  });

  it('⚠⚠ a rapid blip storm still costs nothing, however long it runs', () => {
    // Twenty blips back to back — the shape of the owner's log-export workflow,
    // and the one that produced the crash. Any release here is a leak of the
    // fix, not of the memory.
    const transitions: { to: 'background' | 'active'; afterMs: number }[] = [];
    for (let i = 0; i < 20; i++) {
      transitions.push({ to: 'background', afterMs: 900 });
      transitions.push({ to: 'active', afterMs: 250 });
    }
    expect(runSession(transitions).released).toBe(0);
  });

  it('⚠ exactly-at-the-boundary resolves as a departure, not a blip', () => {
    // Stated so the boundary is a decision rather than an accident of `>` vs
    // `>=`. At or past the window we believe the background.
    expect(runSession([
      { to: 'background', afterMs: 5_000 },
      { to: 'active', afterMs: QWEN_BACKGROUND_SETTLE_MS },
    ])).toEqual({ released: 1, crumbsWiped: 1 });
  });
});
