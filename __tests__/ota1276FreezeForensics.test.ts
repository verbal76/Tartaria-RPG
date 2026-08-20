const mockStore: Record<string, string> = {};
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (k: string) => mockStore[k] ?? null),
    setItem: jest.fn(async (k: string, v: string) => { mockStore[k] = v; }),
    removeItem: jest.fn(async (k: string) => { delete mockStore[k]; }),
    multiRemove: jest.fn(async (ks: string[]) => { for (const k of ks) delete mockStore[k]; }),
    getAllKeys: jest.fn(async () => Object.keys(mockStore)),
  },
}));

// ⚠⚠ OTA-1276 — THE LOG CANNOT SHOW THE FREEZE, AND EVERY DIAGNOSIS THAT READ
// ITS LAST LINE AS THE FREEZE POINT — INCLUDING MINE — WAS STANDING ON SAND.
//
// The owner corrected the theory and his correction is the diagnosis. He froze
// mid-game, cycling outpost rooms scavenging — NOT while copying logs (that was
// the after-action report, which is all OTA-1275's thrash actually was). And on
// freeze #2 he gave the decisive detail:
//
//     "it froze every button ... but the text box in the middle was still
//      scrollable so touch input still worked."
//
// ⚠⚠ IN REACT NATIVE THAT IS A SIGNATURE, NOT A CURIOSITY. ScrollView scrolling
// is driven natively and survives a dead JS thread; `onPress` needs JS to run the
// handler. Buttons dead + scroll alive = **the JS thread is wedged**. The Android
// nav bar returning on swipe-up is a system gesture and proves nothing about JS.
//
// ⚠⚠ AND A WEDGED JS THREAD TAKES THE ENTIRE INSTRUMENT SUITE WITH IT:
//   · `appendLogToDisk` batches into `pendingLogLines` and drains on a PROMISE
//     CHAIN → never drains → **the last lines before a freeze never reach disk**.
//   · the freeze sampler is `setTimeout` → never fires.
//   · Clock A was believed to be "the NATIVE frame callback", but
//     `requestAnimationFrame` is a JS timer in RN (JSTimers.js:257) → also dead.
// So "Freeze watch: no stalls seen" printed straight through a hard freeze, and
// the disk log ended at the last successful FLUSH — which can be many actions
// before the wedge. **I read that cutoff as the freeze point and replayed the
// wrong scene.**
//
// THE INSTRUMENT: one tiny single-key write, issued when an action STARTS, never
// batched and never chained — it races ahead of the wedge instead of queueing
// behind it. Cleared on an orderly exit, so a breadcrumb that SURVIVES to the
// next boot means the process died while live: the swipe-kill after a freeze.
import {
  stampLiveBreadcrumb,
  readLiveBreadcrumb,
  clearLiveBreadcrumb,
} from '../app/engine/saveSystem';
import { readFileSync } from 'fs';
import { join } from 'path';

const src = (...p: string[]): string => readFileSync(join(__dirname, '..', ...p), 'utf8');
const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

beforeEach(() => { for (const k of Object.keys(mockStore)) delete mockStore[k]; });

describe('OTA-1276 — the breadcrumb outruns the wedge', () => {
  it('⚠⚠ it is written WITHOUT awaiting — an instrument may never block an action', async () => {
    // stampLiveBreadcrumb returns void on purpose: a breadcrumb that could stall
    // a tap would be a worse bug than the one it documents.
    const ret = stampLiveBreadcrumb({ at: 1_000, what: 'tap "take / salvage"', screen: 'exploration', room: 'outpost_relic_vault' });
    expect(ret).toBeUndefined();
    await flush();
    const back = await readLiveBreadcrumb();
    expect(back).toEqual({ at: 1_000, what: 'tap "take / salvage"', screen: 'exploration', room: 'outpost_relic_vault' });
  });

  it('⚠⚠ A SURVIVOR MEANS A HARD KILL: orderly exit clears it, a freeze does not', async () => {
    stampLiveBreadcrumb({ at: 2_000, what: 'action "go north"', screen: 'exploration', room: 'outpost_workshop' });
    await flush();
    // Orderly exit (background / save-and-quit) wipes it...
    await clearLiveBreadcrumb();
    expect(await readLiveBreadcrumb()).toBeNull();
    // ...so anything found at the NEXT boot was left by a session that never
    // got to exit — exactly the swipe-kill the owner performs after a freeze.
    stampLiveBreadcrumb({ at: 3_000, what: 'action "go north"', screen: 'exploration', room: 'outpost_relic_vault' });
    await flush();
    const survivor = await readLiveBreadcrumb();
    expect(survivor?.what).toBe('action "go north"');
    expect(survivor?.room).toBe('outpost_relic_vault');
  });

  it('⚠ a corrupt or half-written crumb is ignored, never thrown', async () => {
    mockStore['@tartaria/lastBreadcrumb'] = '{not json';
    expect(await readLiveBreadcrumb()).toBeNull();
    mockStore['@tartaria/lastBreadcrumb'] = JSON.stringify({ at: 'nope' });
    expect(await readLiveBreadcrumb()).toBeNull();
  });
});

describe('OTA-1276 — it is stamped at the doors a freeze happens behind', () => {
  it('⚠⚠ EVERY BUTTON TAP stamps one — the owner froze pressing room buttons', () => {
    const store = src('app', 'state', 'gameStore.ts');
    const i = store.indexOf('export function logUiTap(');
    expect(i).toBeGreaterThan(-1);
    const block = store.slice(i, i + 900);
    expect(block).toContain('stampLiveBreadcrumb({');
    expect(block).toContain('what: `tap "${label}"`');
    // The room is captured, because "which room was I entering" is the question.
    expect(block).toContain('hubRoomId');
  });

  it('⚠⚠ EVERY player action stamps one, at the single door they all pass', () => {
    const store = src('app', 'state', 'gameStore.ts');
    expect(store).toContain('what: `action "${trimmed.slice(0, 60)}"`');
  });

  it('⚠⚠ boot READS it before clearing, and says so in the log', () => {
    // ⚠ OTA-1395 — `hydrate` moved to `app/state/slices/bootSlice.ts` with slice
    // 4. Re-pointed, not relaxed: what this holds down is the ORDER — the
    // surviving breadcrumb is read and reported BEFORE it is cleared, so a
    // freeze that killed the last session still has a witness at the next boot.
    const store = src('app', 'state', 'slices', 'bootSlice.ts');
    // ⚠ OTA-1381 — the window is the try/catch, NOT a byte count. This read
    // `store.slice(i, i + 1400)`, and OTA-1380 adding the native-death promotion
    // between the read and the clear pushed `clearLiveBreadcrumb` past 1400 —
    // so the test failed while the invariant it guards was completely intact.
    // A magic-number window turns "somebody added a comment" into a red build
    // and teaches the next reader to distrust the suite. Anchored to the real
    // block, it fails only when the ORDER actually changes.
    const i = store.indexOf('async hydrate() {');
    const end = store.indexOf('forensics must never block a boot', i);
    expect(end).toBeGreaterThan(i);
    const block = store.slice(i, end);
    expect(block).toContain('await readLiveBreadcrumb()');
    expect(block).toContain('setLastBootBreadcrumb(crumb)');
    expect(block).toContain('freeze forensics: last boot ended mid-action');
    // Cleared AFTER it is read and reported — never before.
    expect(block.indexOf('await readLiveBreadcrumb()')).toBeLessThan(block.indexOf('await clearLiveBreadcrumb()'));
    // ⚠ And the OTA-1380 crash record lands between them: recorded before the
    // clear, so a failure clearing cannot cost the one crash class that has no
    // other evidence anywhere.
    expect(block.indexOf("kind: 'native-death'")).toBeGreaterThan(block.indexOf('await readLiveBreadcrumb()'));
    expect(block.indexOf("kind: 'native-death'")).toBeLessThan(block.indexOf('await clearLiveBreadcrumb()'));
  });

  it('⚠⚠ the orderly-exit clear is wired, or every boot would cry freeze', () => {
    const app = src('App.tsx');
    expect(app).toContain('void clearLiveBreadcrumb();');
    // It sits with the other orderly-exit breadcrumb wipe (arb126).
    const i = app.indexOf('void clearInFlightBreadcrumbs();');
    expect(i).toBeGreaterThan(-1);
    expect(app.slice(i, i + 400)).toContain('clearLiveBreadcrumb');
  });

  it('⚠⚠ the report SAYS the log tail is untrustworthy — the mistake I actually made', () => {
    // The whole point: next time, the summary must stop me (or anyone) from
    // reading the disk log's last line as the moment of the freeze.
    const rp = src('app', 'diagnostics', 'runtimePressure.ts');
    expect(rp).toContain('LAST BOOT DIED MID-ACTION');
    expect(rp).toContain('Last thing the app did:');
    expect(rp).toContain("The disk log's tail is UNRELIABLE");
  });
});

describe('OTA-1276 — why the existing detector could never have caught this', () => {
  it('⚠⚠ BOTH freeze clocks are JS-thread timers, so a wedge kills the detector too', () => {
    // ⚠ OTA-1396 — re-pointed, not relaxed: slice 5 moved both clocks out of gameStore
    // into `app/diagnostics/runtimePressureWatch.ts`. They are the same two timers, and
    // the point of this test is unchanged — it is why the detector could not have caught
    // the freeze it was built for, which is a fact about WHAT they are, not where.
    const store = src('app', 'diagnostics', 'runtimePressureWatch.ts');
    // Clock A: rAF — believed native, actually a JS timer in RN.
    expect(store).toContain('rpFrameRaf = requestAnimationFrame(frameTick)');
    // Clock B: setTimeout.
    expect(store).toContain('rpSampleTimer = setTimeout(sample, FREEZE_SAMPLE_MS);');
    // And the judge that compares them is inside that same setTimeout callback,
    // so a wedge silences the measurement AND the alarm at once. That is why
    // "no stalls seen" is printable through a hard freeze — it is not a lie,
    // it is a question nobody was awake to ask.
  });

  it('⚠ the batched disk log is the reason the tail goes missing', () => {
    const save = src('app', 'engine', 'saveSystem.ts');
    expect(save).toContain('let pendingLogLines: string[] = [];');
    expect(save).toContain('logWriteChain = logWriteChain.then(async () => {');
    // The breadcrumb deliberately does NOT ride that chain.
    const i = save.indexOf('export function stampLiveBreadcrumb(');
    const block = save.slice(i, i + 400);
    expect(block).not.toContain('logWriteChain');
    expect(block).not.toContain('pendingLogLines');
  });
});
