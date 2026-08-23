/**
 * OTA-1397 — SLICE 6: the Qwen watchdog leaves gameStore.
 *
 * The supervisor that keeps a ~400MB local model alive across a session: polls
 * Qwen's health, revives a context the OS reclaimed, backs off when reviving is
 * not working, refuses to revive while the device is asking for memory back, and
 * gives up entirely rather than allocate a phone to death. 268 lines and ten
 * mutable `let`s → `app/ai/qwenWatchdog.ts`.
 *
 * ⚠⚠ IT NEEDED NO DEPS OBJECT — THE FIRST SLICE OF WHICH THAT IS TRUE, and the
 * reason is the five slices before it. persist needed one helper handed in, the
 * AI lifecycle two, slot management six, boot six. This one needs zero: the
 * engine singleton went down in slice 2, the memory-pressure latches went down in
 * slice 5, `get`/`set` were always parameters, and everything else it touches
 * (AppState, Platform, the breadcrumb stamp) was already a leaf.
 *
 * That is what the earlier moves were buying. Each one that pushed a shared thing
 * DOWN made the next extraction smaller, and this is the first one where the
 * subtraction reached zero.
 *
 * ⚠⚠ AND SLICE 5'S HOOK IS WHY THIS IS NOT A CYCLE. The watchdog and the freeze
 * instruments share the memory-pressure latches. Slice 5 could have had the
 * pressure watch import the reload counter directly; instead gameStore injects it
 * as a getter. That decision is what lets the watchdog now import the latches
 * without the two leaves importing each other — and a cycle between two leaves is
 * worse than one through the store, because neither file looks like the guilty
 * party when a binding resolves to `undefined` on a device.
 *
 * ⚠ BEHAVIOUR IS PROVEN ELSEWHERE, as in every slice so far. qwenWatchdog,
 * ota1032, ota1084, ota1173, ota1175, ota1176, ota1181, ota1228 and ota1278
 * covered this code before it moved and cover it unchanged after.
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { blockAt } from '../test-utils/srcBlock';

const path = (...p: string[]) => join(__dirname, '..', ...p);
const src = (...p: string[]) => readFileSync(path(...p), 'utf8');

const store = src('app', 'state', 'gameStore.ts');
const watchdog = src('app', 'ai', 'qwenWatchdog.ts');
const watch = src('app', 'diagnostics', 'runtimePressureWatch.ts');

describe('OTA-1397 — the watchdog moved, whole', () => {
  it('⚠⚠ both functions live in the leaf, and neither is left behind', () => {
    // A duplicate would be worse than either arrangement: two supervisors both
    // scheduling ~400MB reloads on their own timers.
    for (const fn of ['runQwenHealthCheck', 'startQwenWatchdog']) {
      expect(watchdog).toMatch(new RegExp(`^export function ${fn}\\(`, 'm'));
      expect(store).not.toMatch(new RegExp(`^(export )?function ${fn}\\(`, 'm'));
    }
    expect(existsSync(path('app', 'ai', 'qwenWatchdog.ts'))).toBe(true);
  });

  it('⚠⚠ every mutable `let` travelled with it, because it had no choice', () => {
    // You cannot assign to an imported binding. Leaving any of these behind would
    // not have been a subtle bug — it would have failed to compile, which is the
    // property that makes this segmentation safe to keep doing.
    const MOVED = [
      'qwenWatchdogTimer',
      'qwenAppStateSub',
      'qwenForegroundSince',
      'qwenUnsettledLogged',
      'qwenReinitInFlightSince',
      'qwenReinitCeilingLogged',
      'qwenTrulyBackgrounded',
      'qwenReinitAttempts',
      'qwenBackoffLevel',
      'qwenHeldWhileBackgroundLogged',
    ];
    for (const name of MOVED) {
      expect(watchdog).toMatch(new RegExp(`^let ${name}\\b`, 'm'));
      expect(store).not.toMatch(new RegExp(`^let ${name}\\b`, 'm'));
    }
  });

  it('⚠ …and so did the six constants only it used', () => {
    for (const name of [
      'QWEN_FOREGROUND_SETTLE_MS',
      'QWEN_WATCHDOG_HEALTHY_MS',
      'QWEN_WATCHDOG_RECOVERING_MS',
      'QWEN_REINIT_HANG_MS',
      'QWEN_WATCHDOG_FREE_RETRIES',
      'QWEN_MAX_REINITS_PER_STRETCH',
    ]) {
      expect(watchdog).toMatch(new RegExp(`^const ${name}\\b`, 'm'));
      expect(store).not.toMatch(new RegExp(`^const ${name}\\b`, 'm'));
    }
  });

  it('⚠⚠ the two test handles moved WITH the variable they reach', () => {
    // `_qwenSetForegroundSince` writes `qwenForegroundSince` and
    // `_qwenForegroundSettled` reads it through the gate. Had they stayed in
    // gameStore they would have been assigning across a module boundary — the
    // compile error, again. ota1278 imports them from here now.
    for (const helper of ['_qwenSetForegroundSince', '_qwenForegroundSettled']) {
      expect(watchdog).toContain(`export function ${helper}(`);
      expect(store).not.toContain(`export function ${helper}(`);
    }
    expect(src('__tests__', 'ota1278WatchdogRespectsDebounce.test.ts'))
      .toContain("from '../app/ai/qwenWatchdog'");
  });
});

describe('OTA-1397 — no deps object, and what that measures', () => {
  it('⚠⚠ the module takes NOTHING from gameStore — no deps parameter exists', () => {
    // Every slice so far handed in between one and seven private helpers. The
    // absence of a deps object here is the headline result of this OTA.
    expect(watchdog).not.toMatch(/deps\./);
    expect(watchdog).toContain('NO DEPS OBJECT AT ALL, A FIRST');
  });

  it('⚠⚠ …and it imports NO VALUE from the store either', () => {
    // The rule every slice follows. A value import back would compile, pass a
    // one-sided unit test, and resolve to `undefined` on a device.
    for (const line of watchdog.split('\n')) {
      if (!/from\s+['"]\.\.\/state\/gameStore['"]/.test(line)) continue;
      expect(line.trim().startsWith('import type ')).toBe(true);
    }
  });

  it('⚠ the ONE flagged dep was dropped, for the third time in four slices', () => {
    // The dependency scan flagged `narrateViaArbiter`. Its only appearance in
    // these 268 lines is a comment noting narration reads `qwen.isReady()`
    // DIRECTLY and therefore does not go through the watchdog. A dep nothing
    // calls is a lie about coupling — same call as `arbiterAddress` (slice 3)
    // and `startRuntimePressureWatch` (slice 4).
    expect(watchdog).not.toMatch(/^import .*narrateViaArbiter/m);
    expect(watchdog).toContain('A dep\n * nothing calls is a lie about coupling');
  });

  it('⚠ everything it does import is a leaf that was already there', () => {
    for (const mod of [
      "from './engines'",                                // slice 2
      "from '../diagnostics/runtimePressureWatch'",      // slice 5
      "from '../engine/saveSystem'",
      "from 'react-native'",
    ]) {
      expect(watchdog).toContain(mod);
    }
  });
});

describe('OTA-1397 — the edge between the two leaves runs ONE WAY', () => {
  it('⚠⚠ the watchdog imports the latches; the pressure watch does NOT import back', () => {
    // This is the assertion that stops slice 5 and slice 6 from becoming a cycle.
    expect(watchdog).toMatch(/from\s+['"]\.\.\/diagnostics\/runtimePressureWatch['"]/);
    expect(watch).not.toMatch(/from\s+['"]\.\.\/ai\/qwenWatchdog['"]/);
  });

  it('⚠⚠ the counter crosses by INJECTION instead, and gameStore is the joiner', () => {
    // The pressure watch wants the reload count for its memory-warning line.
    // It declares a hook; gameStore supplies the watchdog's accessor. So the
    // traffic that would close the loop never becomes an import at all.
    expect(watch).toContain('qwenReinitAttempts: () => number;');
    expect(watchdog).toContain('export function qwenReinitAttemptCount(): number {');
    expect(store).toContain("import { startQwenWatchdog, qwenReinitAttemptCount } from '../ai/qwenWatchdog';");
    expect(store).toContain('{ qwenReinitAttempts: qwenReinitAttemptCount }');
  });

  it('⚠ it is handed across as the FUNCTION, not a value read at wiring time', () => {
    // A number captured when the watch starts would be zero for the whole
    // session, and the warning line's entire value is the count beside it.
    expect(store).not.toMatch(/qwenReinitAttempts:\s*qwenReinitAttemptCount\(\)/);
  });

  it('⚠ gameStore still declares neither body — it only wires the two together', () => {
    expect(store).toMatch(/^function startPressureWatchWithHooks\(/m);
    expect(store).toContain('...createAiLifecycleSlice(set, get, {');
  });
});

describe('OTA-1397 — nothing starts at import time', () => {
  it('⚠⚠ the poll and the subscription are created only inside the starter', () => {
    // Same check slice 5 had to make, and it has to be made every time something
    // with a live timer moves: WHEN a timer begins is behaviour, not bookkeeping.
    const assignments = [...watchdog.matchAll(/^(\s*)(qwenWatchdogTimer|qwenAppStateSub)\s*=/gm)]
      .map((m) => (m[1] ?? '').length);
    expect(assignments.length).toBeGreaterThan(0);
    for (const indent of assignments) expect(indent).toBeGreaterThan(0);
    expect(watchdog).toContain('WHY MOVING A LIVE TIMER AND A LIVE SUBSCRIPTION IS SAFE HERE');
  });

  it('⚠ the starter still tears down before it re-arms, so a re-hydrate cannot stack timers', () => {
    const i = watchdog.indexOf('export function startQwenWatchdog(');
    const block = blockAt(watchdog, 'export function startQwenWatchdog(');
    expect(block).toContain('clearTimeout(qwenWatchdogTimer);');
    expect(block).toContain('qwenAppStateSub.remove();');
  });

  it('⚠⚠ and the desktop guard is still the FIRST thing the starter does', () => {
    // OTA-1228 — on web there is no native context to revive, so it retried a
    // load that cannot succeed, forever, burying the bug report it was inside.
    const i = watchdog.indexOf('export function startQwenWatchdog(');
    const block = blockAt(watchdog, 'export function startQwenWatchdog(');
    expect(block.indexOf("Platform.OS === 'web'"))
      .toBeLessThan(block.indexOf('qwenWatchdogTimer !== null'));
  });
});

describe('OTA-1397 — six slices in', () => {
  it('gameStore is under 43,000 lines', () => {
    // 45,050 → 44,891 → 44,816 → 44,160 → 43,542 → 43,281 → here.
    expect(store.split('\n').length).toBeLessThan(43000);
  });

  it('⚠ the store-shape slices are unchanged — this move was of the other kind', () => {
    // Slices 1-4 moved store ACTIONS into app/state/slices/, keeping the same
    // object and the same 473 importers. Slices 5 and 6 moved module-level code
    // DOWN to leaves. Both shrink the file; only the first kind touches the
    // store's shape, and this one did not add a fifth slice file.
    const { sliceNames } = require('../test-utils/storeSource') as {
      sliceNames: () => string[];
    };
    expect(sliceNames()).toEqual([
      'aiLifecycleSlice.ts',
      'boardSlice.ts',
      'bootSlice.ts',
      'craftingSlice.ts',
      'inventorySlice.ts',
      'persistSlice.ts',
      'questSlice.ts',
      'slotSlice.ts',
      'vendorSlice.ts',
    ]);
  });
});
