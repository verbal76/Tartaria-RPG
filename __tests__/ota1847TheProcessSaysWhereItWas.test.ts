/* ⚠⚠⚠ OTA-1847 — TARTARIA CALLED A BACKGROUNDED TITLE SCREEN A CRASH.
 *
 * A player opens the app, takes no action, leaves it on the title screen and
 * backgrounds it. Android (or iOS, or a force-stop, or a reboot, or an app
 * update) takes the process. The next boot filed a `native-death` at Sentry
 * `error`, grouped with genuine foreground native deaths, saying "Process
 * reclaimed" — a causal claim about the OS that nothing in Tartaria can make.
 *
 * TWO DEFECTS, AT DIFFERENT LAYERS, AND BOTH ARE REAL.
 *
 * ⚠⚠ D1 — THE ORDERLY-EXIT MARKER HAD NO OWNER UNTIL QWEN BOOTED.
 * `noteForegrounded()` / `noteOrderlyExit()` and the immediate background clear
 * lived in `startRuntimePressureWatch`, which `aiLifecycleSlice` starts at the
 * END of `bootQwen` — and since OTA-1493 `bootQwen` waits for the FIRST PLAYER
 * ACTION. On the title screen, before anyone had touched anything, nothing owned
 * the latch at all. That is why the signature correlates with
 * `aliveStage: 'qwen:deferred'`: Qwen's DEFERRAL is what left the marker
 * unowned. Qwen is not causally involved in any death, and this OTA does not
 * touch `bootQwen`, llama.rn, the model, the memory policy or the load timing.
 *
 * ⚠⚠ D2 — THE TRANSPORT HAD TWO RUNGS FOR A THREE-VALUED TRUTH.
 * `bootSlice` already computed `isFatal: false` for this case. `toSentryEvent`
 * mapped that to `error`, one notch under a JS fatal, and fingerprinted every
 * native death on `[kind, stage]` — so a title-screen disappearance and a
 * foreground crash shared one Sentry issue whenever both were last stamped at
 * the same phase. "6 events · 2 users" could not be read as six of anything.
 *
 * ⚠ AND THE INVARIANT THIS SUITE PROTECTS, WHICH THE REPAIR DOES NOT WEAKEN:
 * a previous process that disappeared while backgrounded CANNOT be identified
 * afterwards as OS reclaim, force-stop, reboot, update or developer kill from
 * the evidence Tartaria holds. The repair stops claiming otherwise; it does not
 * acquire the knowledge. No test here tries to prove that distinction, because
 * it is not provable.
 */
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
// ⚠ The classification tests drive the REAL `hydrate()`, which pulls the whole
// store — and with it the native ML import graph. These are the project's
// standard headless stubs; none of them is touched by this OTA.
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

import { readFileSync } from 'fs';
import { join } from 'path';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  _armSurvivorSnapshotForTest,
  _resetBreadcrumbMirrorForTest,
  clearLiveBreadcrumb,
  noteForegrounded,
  peekLiveBreadcrumb,
  stampAliveBeat,
  stampBreadcrumbPhase,
  stampLiveBreadcrumb,
  type LiveBreadcrumb,
} from '../app/engine/saveSystem';
import { toSentryEvent } from '../app/diagnostics/sentryTransport';
import { loadCrashLedger, type CrashRecord } from '../app/diagnostics/crashLedger';
import {
  ALIVE_BEAT_MS,
  _aliveBeatState,
  _resetAliveBeatForTest,
  setAliveBeatContext,
  startAliveBeat,
  stopAliveBeat,
} from '../app/diagnostics/aliveBeat';

jest.setTimeout(240000);

const ROOT = join(__dirname, '..');
const read = (...p: string[]): string => readFileSync(join(ROOT, ...p), 'utf8');
/** Absence claims grade CODE, never the comments that describe it. */
const codeOnly = (s: string): string =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

const BOOT = read('app', 'state', 'slices', 'bootSlice.ts');
const BEAT = read('app', 'diagnostics', 'aliveBeat.ts');
const WATCH = read('app', 'diagnostics', 'runtimePressureWatch.ts');
const TRANSPORT = read('app', 'diagnostics', 'sentryTransport.ts');
const APP = read('App.tsx');

beforeEach(async () => {
  _resetBreadcrumbMirrorForTest();
  await clearLiveBreadcrumb();
  _resetBreadcrumbMirrorForTest();
  _resetAliveBeatForTest();
});
afterEach(() => { _resetAliveBeatForTest(); });

/** Build a Sentry event from a record shaped like one bootSlice would mint. */
const evt = (rec: Partial<CrashRecord>): Record<string, unknown> => toSentryEvent({
  id: 't', ts: 1_000_000, kind: 'native-death', stage: 'qwen:deferred',
  message: 'm', build: 'b', version: 'v', ...rec,
} as CrashRecord);
const levelOf = (e: Record<string, unknown>): unknown => e.level;
const fpOf = (e: Record<string, unknown>): unknown => e.fingerprint;

// ═══════════════════════════════════════════════════════════════════════════
// §1 — LIFECYCLE OWNERSHIP  (validation points 1–7)
// ═══════════════════════════════════════════════════════════════════════════

describe('OTA-1847 §1 — the lifecycle marker is owned at app root', () => {
  it('1 · app root registers the lifecycle listener, independently of the pressure watch', () => {
    // The beat is started from App.tsx's own effect with no condition on it —
    // no Qwen, no first action, no platform gate.
    expect(codeOnly(APP)).toContain('startAliveBeat();');
    expect(codeOnly(APP)).toContain('setAliveBeatContext(');
    expect(codeOnly(BEAT)).toContain("AppState.addEventListener('change'");
    // and it is genuinely unconditional: no Platform gate in the whole module.
    expect(codeOnly(BEAT)).not.toContain('Platform.OS');
  });

  it('2 · the background transition persists the app state it left in', () => {
    setAliveBeatContext(() => 'title', () => 'boot:qwen:deferred', () => false);
    startAliveBeat();
    stampAliveBeat({ screen: 'title', appState: 'background', stage: 'boot:qwen:deferred', inGame: false });
    const c = peekLiveBreadcrumb()!;
    expect(c.appState).toBe('background');
    expect(c.screen).toBe('title');
    expect(c.inGame).toBe(false);
  });

  it('⚠⚠⚠ 3 · noteOrderlyExit still happens AFTER the transition work — OTA-1413 intact', () => {
    // The clear (which latches) is the LAST statement of the background branch,
    // and the final beat is stamped BEFORE it. Reaching the clear is still the
    // proof the transition completed; this OTA did not move it earlier.
    const i = codeOnly(BEAT).indexOf("} else if (timer !== null) {");
    const body = codeOnly(BEAT).slice(i, codeOnly(BEAT).indexOf('}) as unknown', i));
    expect(body.indexOf('beat();')).toBeLessThan(body.indexOf('clearLiveBreadcrumb()'));
    expect(body.trimEnd().endsWith("if (next === 'background') void clearLiveBreadcrumb();\n      }")
      || /clearLiveBreadcrumb\(\);\s*\}\s*$/.test(body.trimEnd())).toBe(true);
  });

  it('4 · the foreground release happens on `active`, before any foreground stamp', () => {
    const code = codeOnly(BEAT);
    const i = code.indexOf("if (next === 'active') {");
    const body = code.slice(i, code.indexOf('} else if', i));
    expect(body).toContain('noteForegrounded();');
    expect(body.indexOf('noteForegrounded();')).toBeLessThan(body.indexOf('beat();'));
  });

  it('⚠⚠⚠ 5 · the WHOLE pre-first-action background transition works with no pressure watch', () => {
    // The exact shape of the reported incident: Qwen deferred, so
    // `startRuntimePressureWatch` was never called and its AppState listener
    // does not exist. Nothing here starts it. The real listener the beat
    // registers is captured and driven, so this exercises the transition end to
    // end rather than calling the stamp by hand.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { AppState } = require('react-native') as typeof import('react-native');
    let handler: ((s: string) => void) | null = null;
    const spy = jest.spyOn(AppState, 'addEventListener').mockImplementation(((_e: string, cb: (s: string) => void) => {
      handler = cb;
      return { remove: () => {} };
    }) as never);
    try {
      setAliveBeatContext(() => 'title', () => 'boot:qwen:deferred', () => false);
      startAliveBeat();
      expect(_aliveBeatState().running).toBe(true);
      expect(handler).toBeTruthy();
      // the app goes to the background — and NOTHING else is listening
      handler!('background');
      const c = peekLiveBreadcrumb();
      // ⚠ the latch fired from this handler's own last statement: a crumb
      // written after it carries the orderly-exit fact, with no timer involved.
      stampBreadcrumbPhase('ctx-release-done');
      expect(peekLiveBreadcrumb()?.afterOrderlyExit).toBe(true);
      // and the beat's own final stamp named the state it left in
      expect(c === null || c.appState === 'background').toBe(true);
      // the return to the foreground releases it again, before any stamp
      handler!('active');
      stampBreadcrumbPhase('rendered');
      expect(peekLiveBreadcrumb()?.afterOrderlyExit).toBeUndefined();
    } finally {
      spy.mockRestore();
      stopAliveBeat();
    }
    // …and the beat has no Qwen in its import graph at all
    expect(codeOnly(BEAT)).not.toContain('bootQwen');
    expect(codeOnly(BEAT)).not.toContain('llama');
  });

  it('⚠⚠ 6 · the runtime-pressure watch no longer owns the latch — exactly one writer', () => {
    expect(codeOnly(WATCH)).not.toContain('noteForegrounded()');
    expect(codeOnly(WATCH)).not.toContain('clearLiveBreadcrumb()');
    expect(codeOnly(BEAT)).toContain('noteForegrounded();');
    expect(codeOnly(BEAT)).toContain('clearLiveBreadcrumb()');
  });

  it('7 · …and its real responsibility is untouched', () => {
    const code = codeOnly(WATCH);
    for (const kept of ['rpStartFrameClock', 'rpStopFrameClock', 'noteMemoryMark', 'stampBreadcrumbPhase(`appstate:']) {
      expect({ kept, present: code.includes(kept) }).toEqual({ kept, present: true });
    }
    expect(ALIVE_BEAT_MS).toBe(3_000); // the beat's own cadence is unchanged
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// §2 — BACKGROUND + TITLE + NO GAME  (8–14)
// ═══════════════════════════════════════════════════════════════════════════

/** Stage a survivor on disk, run the REAL boot promotion over it, and return
 *  only the records THIS boot minted.
 *
 *  ⚠ The tail, not the whole ledger. `crashLedger` keeps a module-level cache
 *  that survives a `removeItem`, and the ledger is append-only — so a suite that
 *  read `[0]` would be grading the first test's record in every later test. The
 *  first draft of this file did exactly that and "proved" several things about
 *  the wrong row. */
let bootSeq = 0;
async function bootOver(input: LiveBreadcrumb): Promise<CrashRecord[]> {
  // ⚠⚠ EVERY STAGED CRUMB GETS ITS OWN CLOCK. `recordCrash` dedupes on
  // `${ts}_${kind}`, and `ts` is the crumb's last sign of life — so two tests
  // staging the SAME shape would mint one record and the second would silently
  // read an empty tail and pass for the wrong reason. The offset preserves every
  // relative distance the fixtures encode (age since boot, staleness) and only
  // moves the whole crumb forward in time.
  const shift = ++bootSeq * 10_000_000;
  const crumb: LiveBreadcrumb = {
    ...input,
    at: input.at + shift,
    ...(input.phaseAt !== undefined ? { phaseAt: input.phaseAt + shift } : {}),
    ...(input.aliveAt !== undefined ? { aliveAt: input.aliveAt + shift } : {}),
    ...(input.bootAt !== undefined ? { bootAt: input.bootAt + shift } : {}),
  };
  // ⚠ Keyed on IDS, never on length. The ledger is capped and trims from the
  // front, so once it is full its length stops growing — a tail-by-length would
  // silently return nothing and every later test would pass on an empty array.
  const before = new Set((await loadCrashLedger()).map((r) => r.id));
  await AsyncStorage.setItem('@tartaria/lastBreadcrumb', JSON.stringify(crumb));
  _resetBreadcrumbMirrorForTest();
  _armSurvivorSnapshotForTest();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useGameStore } = require('../app/state/gameStore') as typeof import('../app/state/gameStore');
  await useGameStore.getState().hydrate();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { settleCrashWrites } = require('../app/diagnostics/crashLedger') as typeof import('../app/diagnostics/crashLedger');
  await settleCrashWrites();
  return (await loadCrashLedger()).filter((r) => !before.has(r.id) && r.kind === 'native-death');
}

const IDLE_CRUMB: LiveBreadcrumb = {
  at: 1_000_000, what: '(no action yet)', screen: 'title', appState: 'background',
  aliveStage: 'boot:qwen:deferred', inGame: false, phase: 'rendered',
  phaseAt: 1_003_000, aliveAt: 1_003_000, bootAt: 999_000,
};

describe('OTA-1847 §2 — backgrounded on the title screen, no game', () => {
  it('⚠⚠⚠ 8 · it is still RECORDED — suppressing it would buy a blind spot', async () => {
    const rows = await bootOver(IDLE_CRUMB);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.kind).toBe('native-death');
    expect(rows[0]!.impact).toBe('background-idle');
    expect(rows[0]!.isFatal).toBe(false);
  });

  it('⚠⚠⚠ 9 · Sentry level is info, not error', () => {
    expect(levelOf(evt({ isFatal: false, impact: 'background-idle' }))).toBe('info');
  });

  it('⚠⚠⚠ 10 · and it groups as [native-death, background-idle]', () => {
    expect(fpOf(evt({ isFatal: false, impact: 'background-idle' }))).toEqual(['native-death', 'background-idle']);
  });

  it('11 · the wording says the previous process DISAPPEARED', async () => {
    const [r] = await bootOver(IDLE_CRUMB);
    expect(r!.message).toContain('Previous process disappeared');
  });

  it('12 · …and that no game was in progress', async () => {
    const [r] = await bootOver(IDLE_CRUMB);
    expect(r!.message).toContain('no game was in progress');
    expect(r!.message).toContain('backgrounded on the title screen');
  });

  it('⚠⚠⚠ 13 · the wording does NOT claim the OS reclaimed anything', async () => {
    const [r] = await bootOver(IDLE_CRUMB);
    expect(r!.message.toLowerCase()).not.toContain('reclaim');
    // and no native-death message anywhere in the classifier still says it
    const block = codeOnly(BOOT).slice(codeOnly(BOOT).indexOf('message: bgIdle'), codeOnly(BOOT).indexOf('isFatal: !idle'));
    expect(block.toLowerCase()).not.toContain('reclaim');
  });

  it('14 · …and does not call it a crash', async () => {
    const [r] = await bootOver(IDLE_CRUMB);
    expect(r!.message.toLowerCase()).not.toContain('crash');
    expect(r!.message.toLowerCase()).not.toContain('died');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// §3 — BACKGROUND + ACTIVE GAME  (15–20)
// ═══════════════════════════════════════════════════════════════════════════

const ACTIVE_CRUMB: LiveBreadcrumb = {
  at: 1_000_000, what: 'action "attack"', room: 'voronov', screen: 'exploration',
  appState: 'background', inGame: true, phase: 'parsed:attack',
  phaseAt: 1_002_000, aliveAt: 1_004_000, bootAt: 900_000,
};

describe('OTA-1847 §3 — backgrounded with a game in progress', () => {
  it('⚠⚠⚠ 15 · it is recorded, and it is NOT the idle class', async () => {
    const rows = await bootOver(ACTIVE_CRUMB);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.impact).toBe('background-active');
  });

  it('⚠⚠⚠ 16 · Sentry level is warning — impact is possible, never proven', () => {
    expect(levelOf(evt({ isFatal: false, impact: 'background-active' }))).toBe('warning');
  });

  it('⚠⚠⚠ 17 · and it groups apart from the idle class', () => {
    expect(fpOf(evt({ impact: 'background-active' }))).toEqual(['native-death', 'background-active']);
    expect(fpOf(evt({ impact: 'background-active' }))).not.toEqual(fpOf(evt({ impact: 'background-idle' })));
  });

  it('18 · the wording says it disappeared while backgrounded during play', async () => {
    const [r] = await bootOver(ACTIVE_CRUMB);
    expect(r!.message).toContain('Previous process disappeared while backgrounded during play');
    expect(r!.message).toContain('attack');
  });

  it('19 · …and never says reclaimed', async () => {
    const [r] = await bootOver(ACTIVE_CRUMB);
    expect(r!.message.toLowerCase()).not.toContain('reclaim');
  });

  it('⚠⚠ 20 · …and is not asserted as a confirmed crash', async () => {
    const [r] = await bootOver(ACTIVE_CRUMB);
    expect(r!.message.toLowerCase()).not.toContain('crash');
    expect(r!.isFatal).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// §4 — FOREGROUND  (21–24)
// ═══════════════════════════════════════════════════════════════════════════

const FOREGROUND_CRUMB: LiveBreadcrumb = {
  at: 1_000_000, what: 'action "attack"', room: 'voronov', screen: 'exploration',
  appState: 'active', phase: 'native:llm:start',
  phaseAt: 1_002_000, aliveAt: 1_004_000, bootAt: 900_000,
};

describe('OTA-1847 §4 — a foreground disappearance is untouched', () => {
  it('⚠⚠⚠ 21 · it keeps the existing severity rule', async () => {
    const rows = await bootOver(FOREGROUND_CRUMB);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.impact).toBeUndefined();
    expect(rows[0]!.isFatal).toBe(true);
    expect(levelOf(evt({ isFatal: true }))).toBe('fatal');
  });

  it('⚠⚠⚠ 22 · …and the [kind, stage] fingerprint', () => {
    expect(fpOf(evt({ isFatal: true, stage: 'native:llm:start' }))).toEqual(['native-death', 'native:llm:start']);
  });

  it('23 · …and its stage/context data', async () => {
    const [r] = await bootOver(FOREGROUND_CRUMB);
    expect(r!.stage).toBe('native:llm:start');
    expect(r!.breadcrumb?.what).toContain('attack');
    const e = evt({ isFatal: true, breadcrumb: FOREGROUND_CRUMB as CrashRecord['breadcrumb'] });
    expect((e.extra as Record<string, unknown>).lastAction).toContain('attack');
  });

  it('⚠⚠ 24 · a missing active-game field does NOT downgrade a foreground death', async () => {
    const rows = await bootOver({ ...FOREGROUND_CRUMB, inGame: undefined, at: 4_000_000, phaseAt: 4_002_000, aliveAt: 4_004_000 });
    expect(rows[0]!.isFatal).toBe(true);
    expect(rows[0]!.impact).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// §5 — ORDERLY LIFECYCLE  (25–27)
// ═══════════════════════════════════════════════════════════════════════════

describe('OTA-1847 §5 — a clean lifecycle still produces nothing', () => {
  it('25 · an orderly exit records no native death', async () => {
    // ⚠ distinct stamps, so a dedupe on `id` cannot be what makes this pass
    const rows = await bootOver({ ...IDLE_CRUMB, at: 2_000_000, phaseAt: 2_003_000, aliveAt: 2_003_000, afterOrderlyExit: true });
    expect(rows).toHaveLength(0);
  });

  it('⚠⚠ 26 · an ordinary background → foreground cycle leaves no crumb to promote', async () => {
    stampLiveBreadcrumb({ at: Date.now(), what: 'tap "LOOK"', screen: 'exploration' });
    await clearLiveBreadcrumb();           // the background branch's last statement
    noteForegrounded();                    // …and the return to the foreground
    stampBreadcrumbPhase('rendered');
    expect(peekLiveBreadcrumb()?.afterOrderlyExit).toBeUndefined();
    const rows = await bootOver({ ...IDLE_CRUMB, at: 3_000_000, phaseAt: 3_003_000, aliveAt: 3_003_000, afterOrderlyExit: true });
    expect(rows).toHaveLength(0);
  });

  it('27 · repeated clean cycles stay clean — the latch is not sticky', async () => {
    for (let i = 0; i < 3; i++) {
      await clearLiveBreadcrumb();
      stampBreadcrumbPhase('ctx-release-done');
      expect(peekLiveBreadcrumb()?.afterOrderlyExit).toBe(true);
      noteForegrounded();
      stampBreadcrumbPhase('rendered');
      expect(peekLiveBreadcrumb()?.afterOrderlyExit).toBeUndefined();
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// §6 — LEGACY / MALFORMED  (28–33)
// ═══════════════════════════════════════════════════════════════════════════

describe('OTA-1847 §6 — old and broken state stays conservative', () => {
  it('⚠⚠⚠ 28 · a crumb with no appState is UNKNOWN — it keeps the old behaviour', async () => {
    const rows = await bootOver({ ...IDLE_CRUMB, appState: undefined, at: 5_000_000, phaseAt: 5_003_000, aliveAt: 5_003_000 });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.impact).toBeUndefined();          // no class invented
    expect(rows[0]!.isFatal).toBe(false);             // the pre-1847 idle rule
    expect(levelOf(evt({ isFatal: false }))).toBe('error');
  });

  it('⚠⚠⚠ 29 · a backgrounded crumb with no active-game answer is NOT downgraded to idle', async () => {
    // The whole §TITLE rule: a downgrade needs POSITIVE evidence on both halves.
    const rows = await bootOver({ ...IDLE_CRUMB, inGame: undefined, at: 6_000_000, phaseAt: 6_003_000, aliveAt: 6_003_000 });
    expect(rows[0]!.impact).toBeUndefined();
  });

  it('30 · a malformed crumb still fails safe — no record at all', async () => {
    const before = new Set((await loadCrashLedger()).map((r) => r.id));
    await AsyncStorage.setItem('@tartaria/lastBreadcrumb', '{"what":"no at field"}');
    _resetBreadcrumbMirrorForTest();
    _armSurvivorSnapshotForTest();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useGameStore } = require('../app/state/gameStore') as typeof import('../app/state/gameStore');
    await useGameStore.getState().hydrate();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { settleCrashWrites } = require('../app/diagnostics/crashLedger') as typeof import('../app/diagnostics/crashLedger');
    await settleCrashWrites();
    expect((await loadCrashLedger()).filter((r) => !before.has(r.id))).toHaveLength(0);
  });

  it('31 · a pre-1847 crumb needs no migration — it simply lacks the new fields', async () => {
    const legacy: LiveBreadcrumb = { at: 1_000_000, what: '(no action yet)', screen: 'title', phase: 'rendered', aliveAt: 1_001_000 };
    const rows = await bootOver(legacy);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.impact).toBeUndefined();
    expect(rows[0]!.isFatal).toBe(false);   // OTA-1741's title rule, unchanged
    // and nothing in the classifier defaults the new fields
    expect(codeOnly(BOOT)).not.toContain('inGame ?? false');
    expect(codeOnly(BOOT)).not.toContain("appState ?? 'background'");
  });

  it('32 · absent bootAt / afterOta stay omitted rather than invented', async () => {
    const rows = await bootOver({ ...IDLE_CRUMB, bootAt: undefined, afterOta: undefined, at: 7_000_000, phaseAt: 7_003_000, aliveAt: 7_003_000 });
    expect(rows[0]!.sinceBoot).toBeUndefined();
    expect(rows[0]!.launch?.afterOtaApply).toBeUndefined();
  });

  it('⚠⚠ 33 · a stale crumb from an older build gains no update/reclaim causality', async () => {
    const rows = await bootOver({ ...IDLE_CRUMB, at: 1, aliveAt: 2, bootAt: 0 });
    expect(rows[0]!.message.toLowerCase()).not.toContain('reclaim');
    expect(rows[0]!.message.toLowerCase()).not.toContain('update');
    // the record's build/version are THIS build's, stamped at emit time — the
    // classifier must not reason from that about what killed the old one.
    expect(codeOnly(BOOT)).not.toContain('OTA_BUILD_ID !==');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// §7 — THE FIREWALLS
// ═══════════════════════════════════════════════════════════════════════════

describe('OTA-1847 §7 — what this repair did not touch', () => {
  it('⚠⚠⚠ the Qwen stage is forensic context and never a severity signal', () => {
    // Same stage, two impacts, two levels — the stage moved nothing.
    expect(levelOf(evt({ stage: 'qwen:deferred', impact: 'background-idle' }))).toBe('info');
    expect(levelOf(evt({ stage: 'qwen:deferred', isFatal: true }))).toBe('fatal');
    expect(levelOf(evt({ stage: 'boot:qwen:loading', impact: 'background-idle' }))).toBe('info');
    // and the classifier never branches on it
    const code = codeOnly(BOOT);
    expect(code).not.toContain("aliveStage ===");
    expect(code).not.toContain("'qwen");
  });

  it('⚠⚠ the stage still travels, as context', () => {
    const e = evt({ stage: 'qwen:deferred', impact: 'background-idle' });
    expect((e.tags as Record<string, unknown>).stage).toBe('qwen:deferred');
    expect((e.tags as Record<string, unknown>).impact).toBe('background-idle');
  });

  it('⚠⚠⚠ no platform gate was introduced anywhere in the classification path', () => {
    for (const [name, src] of [['aliveBeat', BEAT], ['bootSlice', BOOT], ['sentryTransport', TRANSPORT]] as const) {
      expect({ name, gated: codeOnly(src).includes('Platform.OS') }).toEqual({ name, gated: false });
    }
  });

  it('⚠⚠ unrelated Sentry events keep the old mapping exactly', () => {
    // A JS fatal and a legacy non-fatal both fall through untouched.
    expect(levelOf(evt({ kind: 'js-fatal' as CrashRecord['kind'], isFatal: true }))).toBe('fatal');
    expect(levelOf(evt({ kind: 'js-fatal' as CrashRecord['kind'], isFatal: false }))).toBe('error');
    expect(fpOf(evt({ kind: 'js-fatal' as CrashRecord['kind'], stage: 'boot' }))).toEqual(['js-fatal', 'boot']);
    // …and a record with no impact carries no impact tag
    expect((evt({ isFatal: true }).tags as Record<string, unknown>).impact).toBeUndefined();
  });

  it('⚠ the reporting surfaces this OTA promised not to touch are untouched', () => {
    const about = codeOnly(read('app', 'screens', 'AboutScreen.tsx'));
    for (const kept of ['DIAGNOSTIC TOOLS', 'handleCopyLog', 'handleCopySave', 'handleImportSave', 'handleClearLog',
      'BUG_REPORT_MARK_KEY', 'FULL_LOG_MARK_KEY']) {
      expect({ kept, present: about.includes(kept) }).toEqual({ kept, present: true });
    }
  });
});
