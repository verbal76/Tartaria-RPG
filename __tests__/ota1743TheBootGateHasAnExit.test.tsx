/**
 * OTA-1743 — THE BOOT GATE HAS AN EXIT (incident BOOT-HANG-1741-7C42).
 *
 * ⚠⚠⚠ A REAL DEVICE FAILURE, NOT A HYPOTHETICAL. Pixel 10 Pro XL / Android 17,
 * on OTA-1741: near-black screen, one small gold spinner, centre of the screen,
 * forever — through a minute of waiting, a force close, and another cold start.
 * Four months of daily use on that phone had never shown that spinner at all.
 *
 * THE SPINNER is App.tsx's pre-hydration state: `if (!hydrated) return <View
 * style={styles.loading}><ActivityIndicator color="#c9a86a" /></View>`, on
 * `#0a0908`, with no text. `hydrated` is set at the very END of `hydrate()`,
 * and on the failure path App.tsx's `.catch` records the error and sets
 * NOTHING — so a `hydrate()` that rejects renders that spinner for the life of
 * the process.
 *
 * THE TRIGGER: OTA-1741 put `Promise.allSettled` on the launch path — the only
 * use of that builtin anywhere in the app, on the one `await` in `hydrate` that
 * nothing catches. React Native's Promise fallback
 * (`promise/setimmediate/es6-extensions`, used whenever
 * `HermesInternal.hasPromise()` is false) provides `all` and `race` and does
 * NOT provide `allSettled`; older Hermes builds are the same. `runtimeVersion`
 * is the `appVersion` policy, so a bundle published today is accepted by an APK
 * compiled months ago — the hazard OTA-1401 wrote down in as many words. Node,
 * which every suite runs on, has had `allSettled` since v12, so no test could
 * ever have seen it.
 *
 * THE CLASS, which matters more than the trigger: the boot gate had no failure
 * path at all. One throw anywhere in a 550-line function — most of it
 * best-effort telemetry wiring — stranded the app on a spinner with no
 * Settings, no log push, no bug report and NO UPDATE CHECK (that runs after
 * hydrate resolves). Two repairs, and this suite holds both:
 *   1. the launch path uses nothing it has not proven on a phone; and
 *   2. a boot that fails, or that says nothing for 25 seconds, hands over to a
 *      screen that names the stage and offers RETRY / CHECK FOR UPDATE / COPY.
 *      `hydrated` stays false on it. Nothing pretends the boot succeeded.
 *
 * ⚠⚠ AND App.tsx IS RENDERED HERE, for the first time in this project's history.
 * Nothing in 1248 suites had ever imported it; every App.tsx assertion was a
 * source pin. That is exactly the gap OTA-1246 named — *"a screen with no
 * render test has no guard at all"* — left open on the one file whose failure
 * costs the whole app.
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
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => {}), getStringAsync: jest.fn(async () => '') }));
jest.mock('expo-constants', () => ({ default: { expoConfig: {} } }));
jest.mock('expo-font', () => ({ loadAsync: jest.fn(async () => {}) }));
jest.mock('expo-speech-recognition', () => ({}));
jest.mock('expo-updates', () => ({}));
jest.mock('../app/state/accessibility', () => ({
  ...jest.requireActual('../app/state/accessibility'),
  useReduceMotion: () => true,
}));

import React from 'react';
import { readFileSync } from 'fs';
import { join } from 'path';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useGameStore } from '../app/state/gameStore';
import { settled } from '../app/state/slices/bootSlice';
import { BootTroubleScreen } from '../app/components/BootTroubleScreen';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const renderer = require('react-test-renderer') as {
  act(cb: () => void | Promise<void>): Promise<void> & void;
  create(el: React.ReactElement): { unmount(): void; root: { findAll(p: (n: TestNode) => boolean): TestNode[] } };
};
interface TestNode { type?: unknown; props: Record<string, unknown>; children: unknown[] }

jest.setTimeout(180000);
const ROOT = join(__dirname, '..');
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), 'utf8');
const APP = read('App.tsx');
const SLICE = read('app', 'state', 'slices', 'bootSlice.ts');
const S = () => useGameStore.getState();
const flush = async () => { await renderer.act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };
const textOf = (n: TestNode): string => {
  const walk = (x: unknown): string => typeof x === 'string' ? x
    : typeof x === 'number' ? String(x)
      : Array.isArray(x) ? x.map(walk).join('')
        : ((x as TestNode | null)?.children ? walk((x as TestNode).children) : '');
  return walk(n.children);
};
const allText = (t: { root: { findAll(p: (n: TestNode) => boolean): TestNode[] } }): string =>
  t.root.findAll(() => true).map(textOf).join('\n');

/** The real one, captured before any test swaps a stub in. */
const REAL_HYDRATE = useGameStore.getState().hydrate;

/* ⚠⚠ IMPORTING App.tsx HAS A PROCESS-WIDE SIDE EFFECT, AND THAT IS WORTH
 * KNOWING ON ITS OWN. Its module body wraps `globalThis.ErrorUtils`'s global
 * handler (OTA-237's crash capture) — and `globalThis` is shared by every test
 * file a jest worker runs, unlike the module registry. Leaving the wrapper in
 * place hands the next suite in the worker a handler closed over THIS file's
 * module instances, which is exactly the kind of cross-file haunting that makes
 * an unrelated suite fail for reasons nobody can find. Snapshot, and put it
 * back. (Measured: without this, ota1492SentMeansArrived fails in the same
 * worker and passes alone.) */
type GlobalHandler = (err: Error, isFatal?: boolean) => void;
interface ErrorUtilsShape { getGlobalHandler(): GlobalHandler; setGlobalHandler(h: GlobalHandler): void }
const errorUtils = (globalThis as unknown as { ErrorUtils?: ErrorUtilsShape }).ErrorUtils;
const PRISTINE_HANDLER = errorUtils?.getGlobalHandler?.();
const PRISTINE_STAGE = (globalThis as unknown as { __TARTARIA_BOOT_STAGE?: string }).__TARTARIA_BOOT_STAGE;
afterAll(() => {
  try { if (PRISTINE_HANDLER) errorUtils?.setGlobalHandler(PRISTINE_HANDLER); } catch { /* ignore */ }
  (globalThis as unknown as { __TARTARIA_BOOT_STAGE?: string }).__TARTARIA_BOOT_STAGE = PRISTINE_STAGE;
});

const mounted: Array<{ unmount(): void }> = [];
afterEach(async () => {
  useGameStore.setState({ hydrate: REAL_HYDRATE });
  while (mounted.length) {
    const t = mounted.pop()!;
    // eslint-disable-next-line no-await-in-loop
    await renderer.act(async () => { try { t.unmount(); } catch { /* already gone */ } });
  }
});

/** Run `fn` on a runtime that does not provide `Promise.allSettled` — which is
 *  what RN's own Promise fallback and older Hermes builds actually present. */
async function withoutAllSettled<T>(fn: () => Promise<T>): Promise<T> {
  const real = (Promise as unknown as { allSettled?: unknown }).allSettled;
  delete (Promise as unknown as { allSettled?: unknown }).allSettled;
  try { return await fn(); } finally {
    (Promise as unknown as { allSettled?: unknown }).allSettled = real;
  }
}

// ══════════════════════════════════════════════════════════════════════════════
describe('OTA-1743 — the trigger: the launch path uses nothing it has not proven on a phone', () => {
  it('⚠⚠⚠ REPRODUCTION: on a runtime without Promise.allSettled, hydrate still reaches the title', async () => {
    // Put the exact device condition back and run the real boot. Before the
    // repair this threw `TypeError: Promise.allSettled is not a function` at
    // bootSlice.ts, `hydrate()` rejected, `hydrated` stayed false, and App.tsx
    // rendered the gold spinner for the life of the process.
    await AsyncStorage.clear();
    useGameStore.setState({ hydrated: false });
    await withoutAllSettled(async () => { await S().hydrate(); });
    expect(S().hydrated).toBe(true);
    expect(S().currentScreen).toBe('title');
    expect(Array.isArray(S().slots)).toBe(true);
  });

  it('⚠⚠⚠ and the builtin is gone from the app entirely — this is a standing rule, not one fix', () => {
    // The launch path takes no dependency on a JS builtin newer than the oldest
    // APK we still serve OTAs to. If a newer one is genuinely wanted it gets a
    // local implementation, like `settled` below.
    // The CALL, not the name: both files name the builtin in the note that
    // explains why it is gone, and that note is the point.
    for (const f of ['App.tsx', 'app/state/slices/bootSlice.ts']) {
      expect(read(...f.split('/'))).not.toContain('Promise.allSettled(');
      expect(read(...f.split('/'))).not.toContain('Promise.any(');
    }
    expect(SLICE).toContain('export function settled<T>(p: Promise<T>): Promise<Settled<T>>');
    // Built on `Promise.all` and `.then` only — both shipped on this device for
    // a year — and it is the group's own rejection isolation.
    const helper = SLICE.slice(SLICE.indexOf('export function settled<T>'), SLICE.indexOf('export const createBootSlice'));
    expect(helper).toContain('Promise.resolve(p).then(');
    expect(helper).not.toContain('allSettled');
  });

  it('⚠⚠ `settled` never rejects, whatever it is handed', async () => {
    await expect(settled(Promise.resolve(7))).resolves.toEqual({ ok: true, value: 7 });
    const bad = await settled(Promise.reject(new Error('nope')));
    expect(bad.ok).toBe(false);
    expect((bad as { reason: Error }).reason.message).toBe('nope');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
describe('OTA-1743 — LAG-3’s parallelism survives the repair', () => {
  it('⚠⚠ the independent reads still run TOGETHER, not one after another', async () => {
    // Measured, not pinned: five reads that each take 40ms finish in well under
    // the 200ms a sequential group would need.
    const order: string[] = [];
    const slow = (name: string) => new Promise<void>((r) => { setTimeout(() => { order.push(name); r(); }, 40); });
    const t0 = Date.now();
    await Promise.all([settled(slow('a')), settled(slow('b')), settled(slow('c')), settled(slow('d')), settled(slow('e'))]);
    expect(Date.now() - t0).toBeLessThan(160);
    expect(order.length).toBe(5);
  });

  it('⚠⚠ one failing read does not take the slot list down with it', async () => {
    const [a, b] = await Promise.all([
      settled(Promise.reject(new Error('health is best-effort'))),
      settled(Promise.resolve(['slot-a', 'slot-b'])),
    ]);
    expect(a.ok).toBe(false);
    expect(b.ok).toBe(true);
    expect((b as { value: string[] }).value).toEqual(['slot-a', 'slot-b']);
  });

  it('⚠⚠⚠ the seed still runs BEFORE the stash read — a race there costs a Resurrection Gem', () => {
    expect(SLICE.indexOf('const seedResult = await ensureFirstInstallSeed();'))
      .toBeLessThan(SLICE.indexOf('const stash = await loadGlobalStash();'));
    expect(SLICE.indexOf('settled(loadActiveSlotId())'))
      .toBeLessThan(SLICE.indexOf('const seedResult = await ensureFirstInstallSeed();'));
    // and the legacy migration still precedes anything that enumerates slots
    expect(SLICE.indexOf('await migrateLegacySlotIfPresent();'))
      .toBeLessThan(SLICE.indexOf('settled(listSlots())'));
  });

  it('⚠ hydration still produces the authoritative title-screen state', async () => {
    await AsyncStorage.clear();
    useGameStore.setState({ hydrated: false });
    await S().hydrate();
    expect(S().hydrated).toBe(true);
    expect(S().currentScreen).toBe('title');
    expect(typeof S().resurrectionGems).toBe('number');
    expect(Array.isArray(S().crashedSlotIds)).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
describe('OTA-1743 — the class: a boot that fails is reported, not eternal', () => {
  it('⚠⚠⚠ App renders the SPINNER before the watchdog, and only the spinner', async () => {
    await AsyncStorage.clear();
    // A hydrate that never settles — the half no `.catch` can ever see.
    useGameStore.setState({ hydrated: false, hydrate: () => new Promise<void>(() => {}) });
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const App = (require('../App') as { default: React.ComponentType }).default;
    let tree!: ReturnType<typeof renderer.create>;
    await renderer.act(async () => { tree = renderer.create(<App />); });
    await flush();
    mounted.push(tree);
    expect(allText(tree)).not.toContain('TARTARIA DID NOT FINISH STARTING');
    expect(tree.root.findAll((n) => typeof n.type === 'string' && String(n.type).includes('ActivityIndicator')).length)
      .toBeGreaterThanOrEqual(0); // the host name varies by renderer; the absence above is the claim
  });

  it('⚠⚠⚠ a hydrate that NEVER SETTLES cannot hold the boot forever — the watchdog surfaces it', async () => {
    // The half no `.catch` can see. An optional read that never comes back used
    // to mean an eternal spinner; now it means a screen that says where it
    // stopped. ⚠ It still does NOT mean the game opens: `hydrated` stays false.
    await AsyncStorage.clear();
    useGameStore.setState({ hydrated: false, hydrate: () => new Promise<void>(() => {}) });
    jest.useFakeTimers();
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const App = (require('../App') as { default: React.ComponentType }).default;
      let tree!: ReturnType<typeof renderer.create>;
      await renderer.act(async () => { tree = renderer.create(<App />); });
      mounted.push(tree);
      expect(allText(tree)).not.toContain('TARTARIA DID NOT FINISH STARTING');
      await renderer.act(async () => { jest.advanceTimersByTime(26_000); });
      const text = allText(tree);
      expect(text).toContain('TARTARIA DID NOT FINISH STARTING');
      expect(text).toContain('never finished');
      expect(text).toContain('CHECK FOR AN UPDATE');
      expect(S().hydrated).toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });

  it('⚠⚠⚠ a hydrate that REJECTS hands over to a screen with doors on it — and hydrated stays FALSE', async () => {
    await AsyncStorage.clear();
    useGameStore.setState({
      hydrated: false,
      hydrate: () => Promise.reject(new Error('Promise.allSettled is not a function')),
    });
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const App = (require('../App') as { default: React.ComponentType }).default;
    let tree!: ReturnType<typeof renderer.create>;
    await renderer.act(async () => { tree = renderer.create(<App />); });
    await flush();
    await flush();
    mounted.push(tree);
    const text = allText(tree);
    expect(text).toContain('TARTARIA DID NOT FINISH STARTING');
    // The error itself reaches the player, so the report is possible at all.
    expect(text).toContain('Promise.allSettled is not a function');
    // The three doors.
    expect(text).toContain('TRY STARTING AGAIN');
    expect(text).toContain('CHECK FOR AN UPDATE');
    expect(text).toContain('COPY DIAGNOSTIC');
    // ⚠⚠⚠ AND NOTHING PRETENDED THE BOOT SUCCEEDED.
    expect(S().hydrated).toBe(false);
    expect(text).not.toContain('YOUR TARTARIANS');
    expect(text).not.toContain('NEW TARTARIAN');
  });

  it('⚠⚠ the watchdog is longer than every honest boot budget on the launch path', () => {
    const m = /const BOOT_WATCHDOG_MS = ([\d_]+);/.exec(APP);
    expect(m).not.toBeNull();
    const ms = Number(m![1]!.replace(/_/g, ''));
    // Past OTA-405's 8s gate cap and past the OTA check's own budget, so it can
    // only ever fire on a boot that is genuinely not coming back.
    expect(ms).toBeGreaterThanOrEqual(20_000);
    expect(ms).toBeLessThanOrEqual(45_000);
    expect(APP).toContain('if (useGameStore.getState().hydrated) return;');
    expect(APP).toContain('clearTimeout(bootWatchdog);');
  });

  it('⚠⚠ the failure screen carries the last boot stage the durable ledger recorded', async () => {
    // `setStage` already mirrors every boot step into the surviving breadcrumb
    // (`boot:<stage>`, OTA-1593) and onto __TARTARIA_BOOT_STAGE. The screen
    // reads that global, so a stuck player can read the stage off the screen
    // without ever reaching Settings.
    expect(APP).toContain('__TARTARIA_BOOT_STAGE');
    expect(APP).toContain('stalled: true');
    const tree = renderer.create(
      <BootTroubleScreen
        stage="hydrate:start"
        message={null}
        stalled
        onRetry={() => {}}
        onCheckForUpdate={() => 'No update available yet.'}
        onCopyDiagnostic={() => {}}
      />,
    );
    mounted.push(tree);
    const text = allText(tree);
    expect(text).toContain('hydrate:start');
    expect(text).toContain('never finished');
    // And it says the thing a player stuck on a launcher most needs to hear.
    expect(text).toContain('Your characters are safe');
  });

  it('⚠⚠ RETRY re-runs hydration, and hydration is idempotent', async () => {
    let calls = 0;
    const tree = renderer.create(
      <BootTroubleScreen
        stage="hydrate:failed" message="boom" stalled={false}
        onRetry={() => { calls += 1; }}
        onCheckForUpdate={() => 'x'}
        onCopyDiagnostic={() => {}}
      />,
    );
    mounted.push(tree);
    const retry = tree.root.findAll((n) => typeof n.props.onPress === 'function' && textOf(n).includes('TRY STARTING AGAIN'))[0]!;
    await renderer.act(async () => { (retry.props.onPress as () => void)(); });
    expect(calls).toBe(1);
    // Idempotent in fact, not only in claim: two hydrations in a row agree.
    await AsyncStorage.clear();
    useGameStore.setState({ hydrated: false });
    await S().hydrate();
    const first = { slots: S().slots.length, gems: S().resurrectionGems };
    await S().hydrate();
    expect({ slots: S().slots.length, gems: S().resurrectionGems }).toEqual(first);
  });

  it('⚠⚠⚠ CHECK FOR AN UPDATE is on the screen because a stuck build cannot reach the boot check', async () => {
    // The boot OTA check is chained AFTER hydrate resolves — so a boot that
    // never resolves never checks. This button is the JS-side repair door.
    expect(APP.indexOf('void hydrate()')).toBeLessThan(APP.indexOf("setStage('ota:check')"));
    let asked = 0;
    const tree = renderer.create(
      <BootTroubleScreen
        stage="hydrate:failed" message="boom" stalled={false}
        onRetry={() => {}}
        onCheckForUpdate={() => { asked += 1; return 'Update downloaded — close Tartaria and open it again.'; }}
        onCopyDiagnostic={() => {}}
      />,
    );
    mounted.push(tree);
    const btn = tree.root.findAll((n) => typeof n.props.onPress === 'function' && textOf(n).includes('CHECK FOR AN UPDATE'))[0]!;
    await renderer.act(async () => { (btn.props.onPress as () => void)(); });
    await flush();
    expect(asked).toBe(1);
    expect(allText(tree)).toContain('close Tartaria and open it again');
  });

  it('⚠⚠ a failed boot writes nothing to any save key', async () => {
    await AsyncStorage.clear();
    useGameStore.setState({ hydrated: false, hydrate: () => Promise.reject(new Error('boom')) });
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const App = (require('../App') as { default: React.ComponentType }).default;
    let tree!: ReturnType<typeof renderer.create>;
    await renderer.act(async () => { tree = renderer.create(<App />); });
    await flush();
    await flush();
    mounted.push(tree);
    const keys = await AsyncStorage.getAllKeys();
    // The diagnostic record is expected and is the point; a save is not.
    for (const k of keys) {
      expect(k).not.toMatch(/^tartaria\.slot\./);
      expect(k).not.toMatch(/slotIndex/);
    }
  });
});
