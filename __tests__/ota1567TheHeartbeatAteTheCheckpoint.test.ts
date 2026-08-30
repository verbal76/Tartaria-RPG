/**
 * OTA-1567 — THE HEARTBEAT ATE THE CHECKPOINT.
 *
 * ⚠⚠⚠ FROM A SWEEP OF ALL 32 NATIVE-DEATH RECEIPTS the owner's devices have
 * filed since 2026-08-21. Three findings, and the first two are the same shape:
 * a number that has been reported confidently and wrongly for weeks, because
 * nothing ever compared it against what it was supposed to mean.
 *
 * ⚠⚠⚠ FINDING 1 — `rendered` IS A HEARTBEAT AND IT WAS OVERWRITING THE PHASE.
 * It is stamped from a `useEffect` with NO dependency array, so it fires after
 * every React commit of the exploration screen. It shared the `phase` field with
 * the real checkpoints, so `native:llm:start`, `ctx-open`, `parsed:attack` each
 * survived only until the next commit — milliseconds. The 500ms throttle never
 * protected them: it only applies when the PREVIOUS phase was also `rendered`,
 * so a real checkpoint was overwritten immediately and without delay.
 *
 * TWENTY-FIVE OF THE THIRTY-TWO receipts name `rendered` as the phase they died
 * in. That is not a fact about the app; it is the instrument answering "the
 * player was playing", which is true essentially always. The seven specific
 * phases on file are only the deaths that landed in a window where no commit
 * happened to run. An instrument built by OTA-1356 to answer "which phase did it
 * die in" has been answering "the exploration screen was mounted" for eleven
 * days.
 *
 * ⚠⚠⚠ FINDING 2 — `lastPhaseAgeMs` HAS NEVER ONCE CARRIED A REAL VALUE, in
 * either of its two eras, across all 32 receipts:
 *
 *   builds ≤1503 — `ts` was the ACTION'S START, so `ts − phaseAt` came out
 *     NEGATIVE whenever a phase stamped after the action began. Ten receipts,
 *     down to −2,639,101ms. An age cannot be negative.
 *   builds ≥1504 — OTA-1504 correctly redated the record to the last sign of
 *     life, which made `ts` BE `phaseAt`, so the subtraction became
 *     `phaseAt − phaseAt`. Twenty-two receipts, every one exactly 0.
 *
 * The split falls exactly at 1504: the highest build with a negative age is
 * 1503. The record was fixed and its reader was not — the quietest way an
 * instrument can fail, because it never threw, it just answered the same number
 * forever.
 *
 * ⚠⚠ FINDING 3 — 78% OF THE LEDGER IS AN IDLE PROCESS BEING RECLAIMED. Twenty-
 * five receipts read `rendered` + `(no action yet)`: the app sitting on a screen
 * with nothing in flight, killed by Android for being a ~400MB idle process.
 * OTA-1413 made exactly this argument for the teardown flavour — *"an instrument
 * that fires on every app-switch buries the one real event in noise"* — and
 * suppressed it. This is the same event one layer over.
 *
 * ⚠ AND A CORRECTION I OWE THE OWNER. I told him the three `tap "missions"` /
 * `tap "inventory"` deaths were "the first actual B9 signal" out of this ledger.
 * They are not: all three sit at phase `rendered`, which means the tap had
 * already completed and the app was idle when it died. They are the same OS
 * reclaim as the other twenty-five, with a stale action label attached. The
 * genuine signal is the SEVEN deaths at a `ctx-*` or `native:*` phase — the ones
 * with native ML work actually in flight.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import {
  stampBreadcrumbPhase,
  stampLiveBreadcrumb,
  _resetBreadcrumbMirrorForTest,
  readLiveBreadcrumb,
} from '../app/engine/saveSystem';
import { toSentryEvent } from '../app/diagnostics/sentryTransport';

const src = (p: string): string => readFileSync(join(__dirname, '..', p), 'utf8');

beforeEach(() => { _resetBreadcrumbMirrorForTest(); });

/** The transport's `extra` bag for a native death built from one crumb. */
const extraFor = (bc: Record<string, unknown>, ts: number): Record<string, unknown> =>
  (toSentryEvent({
    id: 't', kind: 'native-death', ts, stage: String(bc.phase ?? '?'),
    message: 'm', isFatal: true, build: 'b', version: 'v',
    breadcrumb: bc as never,
  } as never) as { extra: Record<string, unknown> }).extra;

describe('OTA-1567 — the heartbeat stops eating the checkpoint', () => {
  it('⚠⚠⚠ A RENDER NO LONGER ERASES THE CHECKPOINT BEFORE IT', async () => {
    // The whole finding in one assertion. Every native/ctx checkpoint used to
    // live until the next React commit — milliseconds — so the death record
    // almost always said `rendered` and the real phase was gone.
    stampLiveBreadcrumb({ at: Date.now(), what: 'action "attack"' });
    stampBreadcrumbPhase('native:llm:start', 'q2');
    stampBreadcrumbPhase('rendered');
    const bc = await readLiveBreadcrumb();
    expect(bc?.phase).toBe('native:llm:start');
    expect(bc?.phaseDetail).toBe('q2');
  });

  it('⚠⚠⚠ …BUT IT STILL MOVES THE LAST SIGN OF LIFE, which is its real job', () => {
    // Dating the death is what the heartbeat is FOR. Splitting the fields must
    // not cost that — OTA-1504 exists because a death dated at the action's
    // start was misreported by three-quarters of an hour.
    stampLiveBreadcrumb({ at: 1_000, what: 'action "attack"' });
    stampBreadcrumbPhase('native:llm:start');
    const afterPhase = extraFor({ at: 1_000, what: 'x', phase: 'native:llm:start', phaseAt: 5_000, aliveAt: 9_000 }, 9_000);
    expect(afterPhase.lastPhaseAgeMs).toBe(4_000);
  });

  it('⚠⚠ an idle process with no checkpoint is still given one, so it is not phaseless', () => {
    // OTA-1526's rule kept: an idle death is a death worth a record, and
    // blinding the instrument to it was the first draft of that fix and wrong.
    stampBreadcrumbPhase('rendered');
    // Nothing to protect, so `rendered` becomes the phase AND the heartbeat.
    const bag = extraFor({ at: 1, what: '(no action yet)', phase: 'rendered', phaseAt: 1, aliveAt: 1 }, 1);
    expect(bag.lastPhase).toBe('rendered');
  });

  it('⚠⚠ a checkpoint is a sign of life too, on screens the heartbeat never runs on', () => {
    // The heartbeat fires from ONE screen. A death during a long native call
    // anywhere else must be dated at its own last stamp, not at whenever the
    // exploration screen last happened to commit.
    expect(src('app/engine/saveSystem.ts'))
      .toContain('const next: LiveBreadcrumb = { ...base, phase, phaseAt: now, phaseDetail: detail, aliveAt: now };');
  });
});

describe('OTA-1567 — the age field finally means what its name says', () => {
  it('⚠⚠⚠ IT IS NEVER NEGATIVE, WHICH TEN RECEIPTS ON FILE ARE', () => {
    // Pre-1504 shape: the record dated at the action's start, the phase stamped
    // long after. `ts − phaseAt` went to −2,639,101ms on one of the owner's.
    const bag = extraFor({ at: 1_000, what: 'x', phase: 'rendered', phaseAt: 900_000, aliveAt: 900_000 }, 1_000);
    expect(bag.lastPhaseAgeMs).toBe(0);
    expect(bag.lastPhaseAgeMs as number).toBeGreaterThanOrEqual(0);
  });

  it('⚠⚠⚠ IT IS NOT STRUCTURALLY ZERO, WHICH TWENTY-TWO RECEIPTS ARE', () => {
    // Post-1504 shape: `ts` BECAME `phaseAt`, so the old reader computed
    // `phaseAt − phaseAt` forever. Reading the two genuinely different stamps is
    // what makes the number recoverable at all.
    const bag = extraFor({ at: 1_000, what: 'x', phase: 'ctx-open', phaseAt: 5_000, aliveAt: 61_000 }, 61_000);
    expect(bag.lastPhaseAgeMs).toBe(56_000);
  });

  it('⚠⚠⚠ AND IT ANSWERS THE QUESTION OTA-1356 BUILT IT TO ANSWER', () => {
    // Near zero indicts the checkpoint — the app died AT it. Large exonerates it
    // — the app went on living for a minute afterwards and something else did.
    const died_at_checkpoint = extraFor({ at: 1, what: 'x', phase: 'native:llm:start', phaseAt: 9_000, aliveAt: 9_000 }, 9_000);
    const lived_on = extraFor({ at: 1, what: 'x', phase: 'native:llm:start', phaseAt: 9_000, aliveAt: 70_000 }, 70_000);
    expect(died_at_checkpoint.lastPhaseAgeMs).toBe(0);
    expect(lived_on.lastPhaseAgeMs).toBe(61_000);
  });

  it('⚠⚠ the number bootSlice computed and threw into prose is now a FIELD', () => {
    // It works out how long the action had been standing, uses it to decide
    // whether to call the label stale, and then spends it on a sentence where
    // nothing can group, sort or alert on it.
    const bag = extraFor({ at: 1_000, what: 'action "attack"', phase: 'rendered', phaseAt: 4_000, aliveAt: 121_000 }, 121_000);
    expect(bag.actionAgeMs).toBe(120_000);
  });

  it('⚠ a crumb from before this OTA carries neither field rather than a wrong one', () => {
    // Every receipt already on disk lacks `aliveAt`. Undefined is the honest
    // answer for those; inventing one from `ts` is how the field got here.
    const bag = extraFor({ at: 1_000, what: 'x', phase: 'rendered', phaseAt: 4_000 }, 4_000);
    expect(bag.lastPhaseAgeMs).toBeUndefined();
    expect(bag.actionAgeMs).toBeUndefined();
  });
});

describe('OTA-1567 — an idle reclaim is recorded, but is not a crash', () => {
  const BOOT = src('app/state/slices/bootSlice.ts');

  it('⚠⚠⚠ THE IDLE SIGNATURE IS NAMED, AND IT IS 78% OF THE LEDGER', () => {
    expect(BOOT).toContain("const idle = crumb.phase === 'rendered' && crumb.what === '(no action yet)';");
    expect(BOOT).toContain('isFatal: !idle,');
  });

  it('⚠⚠⚠ IT IS STILL RECORDED — the blind spot is the trade nobody takes', () => {
    // OTA-1377 and OTA-1413 both drew this line explicitly: suppressing a false
    // positive is worth doing, buying it with a blind spot is not. There is one
    // recordCrash call and the idle path goes through it.
    expect(BOOT.match(/recordCrash\(/g)?.length).toBe(1);
    expect(BOOT).toContain('Process reclaimed while idle at a rendered screen');
  });

  it('⚠⚠ the record is dated at aliveAt, not at whichever stamp survived', () => {
    expect(BOOT).toContain('const lastAlive = crumb.aliveAt ?? crumb.phaseAt ?? crumb.at;');
  });

  it('⚠ a real mid-action death is still fatal, which is the point of the split', () => {
    // The seven deaths at a `ctx-*` or `native:*` phase are the signal this
    // whole change exists to stop burying.
    expect(BOOT).toContain('Process died with no orderly exit while: ${crumb.what}');
  });
});

describe('OTA-1567 — the one live lead is the shape the instrument would not describe', () => {
  it('⚠⚠⚠ QUEUE DEPTH IS STAMPED ON `done` AS WELL AS `start`', () => {
    // The ledger's only two `native:*` deaths — 2026-08-29 and 2026-08-30, both
    // `native:cognition:done` — carry an EMPTY detail, because depth was only
    // ever recorded on `start`. nativeMlLock's own note promises the opposite:
    // "a death with q3 backed up is a different fact from a death on an idle
    // queue". The next receipt of this shape will finally be able to say which.
    const LOCK = src('app/ai/nativeMlLock.ts');
    expect(LOCK).toContain('stampBreadcrumbPhase(`native:${cls}:${tag}`, `q${queued}`);');
    expect(LOCK).not.toContain("tag === 'start' ? `q${queued}` : undefined");
  });

  it('⚠⚠ and a detail survives the heartbeat now, or the depth would be erased anyway', () => {
    // Worth pinning together: stamping the depth is pointless if the next React
    // commit wipes the phase that carries it. The two halves of this OTA are one
    // fix.
    stampLiveBreadcrumb({ at: Date.now(), what: 'action "look"' });
    stampBreadcrumbPhase('native:cognition:done', 'q3');
    stampBreadcrumbPhase('rendered');
    stampBreadcrumbPhase('rendered');
    const bag = extraFor(
      { at: 1, what: 'x', phase: 'native:cognition:done', phaseDetail: 'q3', phaseAt: 100, aliveAt: 900 },
      900,
    );
    expect(bag.lastPhaseDetail).toBe('q3');
    expect(bag.lastPhaseAgeMs).toBe(800);
  });
});
