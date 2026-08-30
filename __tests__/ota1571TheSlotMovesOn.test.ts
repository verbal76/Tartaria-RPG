/**
 * OTA-1571 — THE SLOT MOVES ON.
 *
 * ⚠⚠⚠ THIS IS OTA-1465'S BUG, ONE SLOT OVER. See sceneIntroRefusals for the full
 * account: twelve scene-intro fills for a single location, eight discarded,
 * 57.9s burned, and nothing else banked while it ran. 1465 fixed exactly this
 * shape in the item slot and its comment says why it matters — *"the waste was
 * the visible half; the blockage was the expensive one."* The scene slot picks
 * its target the same way and never got the guard.
 *
 * ⚠⚠ AND A DEBT PAID. During OTA-1567 I told the owner I would fix the crash
 * ledger's `(+306713ms)` and then shipped 1567 without doing it. That number is
 * `phaseAt - at` — how far into the ACTION the checkpoint landed — printed bare,
 * immediately after the phase name, where it reads as the checkpoint's own age.
 * Five minutes looked like a stall; it was an idle action string that had been
 * sitting there five minutes. Both numbers are now named out loud, and the
 * second one is the one 1567's `aliveAt` made possible: how long the process
 * outlived the checkpoint.
 */
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import { readFileSync } from 'fs';
import { join } from 'path';
import {
  crashLedgerSummary,
  _setCrashLedgerForTests,
  type CrashRecord,
} from '../app/diagnostics/crashLedger';
import {
  noteIntroFillMiss,
  noteIntroFillHit,
  introFillExhausted,
  introFillMissCount,
  INTRO_FILL_STRIKES,
  _resetIntroFillMissesForTest,
} from '../app/engine/sceneIntroRefusals';

const src = (p: string): string => readFileSync(join(__dirname, '..', p), 'utf8');

beforeEach(() => { _resetIntroFillMissesForTest(); });

describe('OTA-1571 — the scene-intro slot stops starving every other location', () => {
  const BOOT = src('app/state/slices/bootSlice.ts');
  const NARR = src('app/ai/narration.ts');

  it('⚠⚠⚠ A LOCATION THAT CANNOT BE WRITTEN GIVES UP THE SLOT', () => {
    expect(introFillExhausted('builders_survey_camp')).toBe(false);
    for (let i = 0; i < INTRO_FILL_STRIKES; i++) noteIntroFillMiss('builders_survey_camp');
    expect(introFillExhausted('builders_survey_camp')).toBe(true);
    // …and only that one. The whole point is that the others get their turn.
    expect(introFillExhausted('pilgrim_waycamp')).toBe(false);
  });

  it('⚠⚠⚠ THREE STRIKES, NOT ONE — his log shows a location succeed on the fifth try', () => {
    // The one place this deliberately differs from OTA-1465's item ledger. An
    // item description is a pure function of a name, so one refusal is decisive.
    // A scene intro's prompt carries world state that moves under it. One strike
    // would forbid the recovery his log actually shows; unlimited is what we had.
    expect(INTRO_FILL_STRIKES).toBe(3);
    noteIntroFillMiss('x');
    expect(introFillExhausted('x')).toBe(false);
    noteIntroFillMiss('x');
    expect(introFillExhausted('x')).toBe(false);
    noteIntroFillMiss('x');
    expect(introFillExhausted('x')).toBe(true);
  });

  it('⚠⚠⚠ A SUCCESS CLEARS THE COUNT, so a proven location is never retired', () => {
    // Mirrors clearSynthRefusal. Leaving the count standing would retire a
    // location on its next two unlucky rolls despite it having banked a line.
    noteIntroFillMiss('y'); noteIntroFillMiss('y');
    expect(introFillMissCount('y')).toBe(2);
    noteIntroFillHit('y');
    expect(introFillMissCount('y')).toBe(0);
    expect(introFillExhausted('y')).toBe(false);
  });

  it('⚠⚠ A PREEMPTED FILL IS NOT A STRIKE', () => {
    // It was cut off by the player acting, which says nothing about whether the
    // place can be written. Counting it would retire locations for the crime of
    // being visited at a busy moment — and his log has two preemptions in it.
    expect(NARR).toContain('if (!truncated) noteIntroFillMiss(forLoc?.id ?? scene.location.id);');
  });

  it('⚠⚠ the homework scan actually skips them — the ledger is wired, not just built', () => {
    expect(BOOT).toContain('&& !introFillExhausted(l.id));');
  });

  it('⚠⚠ a success is recorded on the banking path', () => {
    expect(NARR).toContain('noteIntroFillHit(forLoc?.id ?? scene.location.id);');
  });

  it('⚠ the arming line shows the strike, so a device log can watch it work', () => {
    expect(BOOT).toContain('(strike ${strikes + 1}/${INTRO_FILL_STRIKES})');
  });

  it('⚠ the ledger is bounded and session-only, like the one it is modelled on', () => {
    const LEDGER = src('app/engine/sceneIntroRefusals.ts');
    expect(LEDGER).toContain('const MAX_TRACKED = 256;');
    expect(LEDGER).not.toContain('AsyncStorage');
    // A blank id is never tracked — an unnamed location would otherwise collide
    // with every other unnamed one and retire them as a group.
    noteIntroFillMiss(''); noteIntroFillMiss(''); noteIntroFillMiss('');
    expect(introFillExhausted('')).toBe(false);
  });
});

describe('OTA-1571 — the crash ledger names its two numbers', () => {
  const REC = (bc: Record<string, unknown>): CrashRecord[] => [
    {
      id: 'a', ts: Date.now(), kind: 'native-death', stage: 'exploring',
      build: '293', version: '4.32.11',
      breadcrumb: bc,
    } as unknown as CrashRecord,
  ];

  afterEach(() => { _setCrashLedgerForTests(null); });

  it('⚠⚠⚠ THE BARE (+Nms) IS GONE — the owner’s +306713ms is labelled', () => {
    // His actual receipt shape: an idle action string five minutes old, which
    // the old label reported as if the checkpoint itself were five minutes
    // stale. It never was. The action was.
    _setCrashLedgerForTests(REC({
      at: 1_000_000, what: '(no action yet)', phase: 'rendered',
      phaseAt: 1_306_713, aliveAt: 1_306_900,
    }));
    const out = crashLedgerSummary();
    expect(out).toContain('306713ms into the action');
    expect(out).not.toContain('(+306713ms)');
  });

  it('⚠⚠⚠ AND THE NUMBER A READER ACTUALLY WANTS IS NOW THERE', () => {
    // How long the process outlived its last checkpoint. This is the field
    // OTA-1567's `aliveAt` was added for, and until now nothing printed it.
    _setCrashLedgerForTests(REC({
      at: 1_000, what: 'tap "attack"', phase: 'native:cognition:done',
      phaseAt: 3_000, aliveAt: 11_500,
    }));
    expect(crashLedgerSummary()).toContain('alive 8500ms after it');
  });

  it('⚠⚠ a pre-1567 record has no aliveAt and simply omits the clause', () => {
    // Every receipt already on his device is one of these. Printing a fabricated
    // 0 would be the same class of mistake this OTA is fixing.
    _setCrashLedgerForTests(REC({
      at: 1_000, what: 'tap "missions"', phase: 'rendered', phaseAt: 1_400,
    }));
    const out = crashLedgerSummary();
    expect(out).toContain('400ms into the action');
    expect(out).not.toContain('alive ');
  });

  it('⚠ the phase and its detail still lead the line — this relabelled, it did not rewrite', () => {
    _setCrashLedgerForTests(REC({
      at: 1_000, what: 'x', phase: 'native:voice', phaseDetail: 'q2',
      phaseAt: 1_050, aliveAt: 1_060,
    }));
    expect(crashLedgerSummary()).toContain('last checkpoint: native:voice [q2] · 50ms into the action');
  });
});
