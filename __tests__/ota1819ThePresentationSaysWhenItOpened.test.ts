jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import fs from 'fs';
import path from 'path';
import {
  noteStage, noteRootTouch, peekTouchPath, touchPathLines,
  _resetTouchPathForTest, _touchPathWriteState, loadPriorTouchPath,
  TOUCH_PATH_MAX_ENTRIES, TOUCH_PATH_MAX_FIELD,
} from '../app/diagnostics/touchPath';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SRC = fs.readFileSync(
  path.join(__dirname, '..', 'app', 'screens', 'ExplorationScreen.tsx'), 'utf8',
);

/* ⚠⚠⚠ OTA-1819 — THE SIGNAL THAT DOES NOT NEED A FINGER.
 *
 * Class H natural freeze #1: a complete T0→T5 chain, then 26.08 s in which the
 * owner pressed a visible button ~20 times and the touch path recorded NOTHING,
 * while JS stayed alive. T0, `content` and M0 are all touch-keyed, so in that
 * interval they are silent BY CONSTRUCTION. This suite holds the one record that
 * is written on a state change instead of a touch.
 *
 * ⚠ THE OBSERVER IS A REACT EFFECT IN ExplorationScreen. Level 1 below drives the
 * SAME edge algorithm the screen runs, against the REAL touchPath, so persistence
 * and ordering are measured rather than asserted. Level 2 pins the production
 * source so the algorithm cannot quietly leave the screen. */

type Slots = Record<'chapter' | 'fork' | 'hint', string | null>;
const EMPTY: Slots = { chapter: null, fork: null, hint: null };

/** The screen's edge emitter, transcribed. Level 2 pins that the screen still
 *  spells it this way, so a drift between the two fails rather than hides. */
function emit(prev: Slots | null, next: Slots): Slots {
  if (prev === null) return next; // seed — a screen mount is not a presentation mount
  for (const slot of ['chapter', 'fork', 'hint'] as const) {
    const was = prev[slot];
    const now = next[slot];
    if (was === now) continue;
    const tree = slot === 'hint' ? 'tree' : 'native';
    if (was !== null) noteStage(0, 'pres', { control: was, reason: `unmount:${tree}` });
    if (now !== null) noteStage(0, 'pres', { control: now, reason: `mount:${tree}` });
  }
  return next;
}

/** Drive a sequence of presentation states through the emitter. */
function run(states: Slots[]): void {
  let prev: Slots | null = null;
  for (const s of states) prev = emit(prev, s);
}

/** Only the lifecycle records — `pres` entries that belong to no interaction. */
function edges(): string[] {
  return peekTouchPath()
    .filter((e) => e.st === 'pres' && e.i === 0)
    .map((e) => `${e.r} ${e.c}`);
}

beforeEach(async () => {
  _resetTouchPathForTest();
  await AsyncStorage.clear();
});

describe('OTA-1819 §1 — the edges the screen emits', () => {
  it('case 1 — ordinary combat, no capital transition: the hint may open, no chapter, no fork', () => {
    run([EMPTY, { ...EMPTY, hint: 'hint:combat_readout' }]);
    expect(edges()).toEqual(['mount:tree hint:combat_readout']);
    expect(edges().some((e) => e.includes('chapter:'))).toBe(false);
    expect(edges().some((e) => e.includes('fork:'))).toBe(false);
  });

  it('case 2 — first-capital transition without combat: chapter/fork move, no hint', () => {
    run([
      EMPTY,
      { ...EMPTY, chapter: 'chapter:revelation' },
      EMPTY,
      { ...EMPTY, fork: 'fork:revelation_road' },
      EMPTY,
    ]);
    expect(edges()).toEqual([
      'mount:native chapter:revelation',
      'unmount:native chapter:revelation',
      'mount:native fork:revelation_road',
      'unmount:native fork:revelation_road',
    ]);
    expect(edges().some((e) => e.includes('hint:'))).toBe(false);
  });

  it('case 3 — revisited capital, fork already answered: nothing remounts', () => {
    // The predicates simply never leave null, so there is nothing to record.
    run([EMPTY, EMPTY, EMPTY]);
    expect(edges()).toEqual([]);
  });

  it('case 4 — the healthy full sequence, in order', () => {
    run([
      EMPTY,
      { ...EMPTY, chapter: 'chapter:revelation' },
      EMPTY,
      { ...EMPTY, fork: 'fork:revelation_road' },
      EMPTY,
      { ...EMPTY, hint: 'hint:combat_readout' },
    ]);
    expect(edges()).toEqual([
      'mount:native chapter:revelation',
      'unmount:native chapter:revelation',
      'mount:native fork:revelation_road',
      'unmount:native fork:revelation_road',
      'mount:tree hint:combat_readout',
    ]);
  });

  it('case 5 — a direct identity swap closes the old one FIRST', () => {
    run([
      EMPTY,
      { ...EMPTY, fork: 'fork:one' },
      { ...EMPTY, fork: 'fork:two' },
    ]);
    expect(edges()).toEqual([
      'mount:native fork:one',
      'unmount:native fork:one',
      'mount:native fork:two',
    ]);
    // ⚠ ORDER IS THE CLAIM: the trace must never read as two forks open at once.
    expect(edges().indexOf('unmount:native fork:one'))
      .toBeLessThan(edges().indexOf('mount:native fork:two'));
  });

  it('case 6 — an unrelated modal/search/gather emits NO lifecycle identity', () => {
    run([EMPTY]);
    noteRootTouch('modal');            // a Search/Gather/Climb style M0
    const t = noteRootTouch('root');
    noteStage(t, 'in', { control: 'quick:flee 43%' });
    expect(edges()).toEqual([]);
    // and the ordinary touch stages are untouched by any of this
    expect(peekTouchPath().filter((e) => e.st === 'modal')).toHaveLength(1);
    expect(peekTouchPath().filter((e) => e.st === 'in')).toHaveLength(1);
  });

  it('an ordinary rerender with unchanged state emits nothing', () => {
    const s: Slots = { ...EMPTY, hint: 'hint:combat_readout' };
    run([EMPTY, s, { ...s }, { ...s }, { ...s }]);
    expect(edges()).toEqual(['mount:tree hint:combat_readout']);
  });

  it('the screen mounting onto an ALREADY-OPEN card claims no mount, and leaving claims no unmount', () => {
    // seed with the card already up: the first observation is the seed
    run([{ ...EMPTY, chapter: 'chapter:revelation' }]);
    expect(edges()).toEqual([]);
    // and nothing is emitted on teardown — there is no cleanup that writes
    expect(SRC).not.toMatch(/return\s*\(\)\s*=>\s*\{[^}]*noteStage\(0,\s*'pres'/);
  });
});

describe('OTA-1819 §2 — persistence that does not wait for a finger', () => {
  it('⚠ THE WHOLE POINT — a lifecycle edge persists with NO touch before or after it', async () => {
    run([EMPTY, { ...EMPTY, chapter: 'chapter:revelation' }]);
    // Nothing else happens. No T0, no T1, no flush, no further edge.
    await Promise.resolve();
    await Promise.resolve();
    const raw = await AsyncStorage.getItem('@tartaria/touchPath');
    expect(raw).not.toBeNull();
    expect(raw).toContain('chapter:revelation');
    expect(raw).toContain('mount:native');
  });

  it('the write goes through the EXISTING coalesced path — no second architecture', () => {
    run([EMPTY, { ...EMPTY, fork: 'fork:one' }]);
    const st = _touchPathWriteState();
    expect(typeof st.writing).toBe('boolean');
    expect(typeof st.dirty).toBe('boolean');
    // one storage key, the touch path's own
    expect(SRC).not.toContain('AsyncStorage');
    expect(SRC).not.toContain('setInterval');
  });

  it('chronological order survives the round trip, interleaved with touches', async () => {
    let prev: Slots | null = null;
    prev = emit(prev, EMPTY);
    prev = emit(prev, { ...EMPTY, chapter: 'chapter:revelation' });
    const t = noteRootTouch('root');
    noteStage(t, 'in', { control: 'quick:flee 43%' });
    emit(prev, EMPTY);
    const seqs = peekTouchPath().map((e) => e.s);
    expect([...seqs].sort((a, b) => a - b)).toEqual(seqs);
    const line = touchPathLines(peekTouchPath()).join('\n');
    expect(line.indexOf('mount:native')).toBeLessThan(line.indexOf('unmount:native'));
  });

  it('records stay bounded — the ring never grows past its cap', () => {
    let prev: Slots | null = emit(null, EMPTY);
    for (let i = 0; i < 60; i++) prev = emit(prev, { ...EMPTY, fork: `fork:f${i}` });
    expect(peekTouchPath().length).toBeLessThanOrEqual(TOUCH_PATH_MAX_ENTRIES);
  });

  it('every identity and edge fits the bounded field, so nothing is clipped into ambiguity', () => {
    for (const id of ['chapter:revelation', 'fork:revelation_road', 'hint:combat_readout']) {
      expect(id.length).toBeLessThanOrEqual(TOUCH_PATH_MAX_FIELD);
    }
    for (const r of ['mount:native', 'unmount:native', 'mount:tree', 'unmount:tree']) {
      expect(r.length).toBeLessThanOrEqual(TOUCH_PATH_MAX_FIELD);
    }
  });
});

describe('OTA-1819 §3 — case 7, the process boundary', () => {
  it('a mount with no unmount before death CANNOT read as one instance spanning two boots', async () => {
    // old process: the fork opens and the process dies with it still open
    run([EMPTY, { ...EMPTY, fork: 'fork:one' }]);
    await Promise.resolve(); await Promise.resolve();
    // new process
    _resetTouchPathForTest();
    const prior = await loadPriorTouchPath();
    expect(prior).not.toBeNull();
    expect(prior!.some((e) => e.c === 'fork:one' && e.r === 'mount:native')).toBe(true);
    // the same id opens again in THIS boot
    run([EMPTY, { ...EMPTY, fork: 'fork:one' }]);
    // ⚠ THE TWO RECORDS LIVE IN DIFFERENT ARRAYS. `priorTouchPath` and the live
    // ring are separate by construction and the report prints them under separate
    // headings, so no reader can join them into one continuous native instance.
    expect(peekTouchPath()).not.toBe(prior);
    expect(peekTouchPath().some((e) => e.c === 'fork:one')).toBe(true);
    const liveSeq = peekTouchPath().map((e) => e.s);
    expect(Math.min(...liveSeq)).toBe(1); // this boot's sequence restarts at 1
  });
});

describe('OTA-1819 §4 — the observer is in the screen, and it is passive', () => {
  it('the screen emits both edges for all three slots', () => {
    expect(SRC).toContain("reason: `unmount:${tree}`");
    expect(SRC).toContain("reason: `mount:${tree}`");
    expect(SRC).toContain("chapter:${chapterPhase}");
    expect(SRC).toContain("fork:${forkId}");
    expect(SRC).toContain("'hint:combat_readout'");
  });

  it('the old identity closes before the new one opens, in source order', () => {
    const un = SRC.indexOf("if (was !== null) noteStage(0, 'pres'");
    const mo = SRC.indexOf("if (now !== null) noteStage(0, 'pres'");
    expect(un).toBeGreaterThan(-1);
    expect(mo).toBeGreaterThan(un);
  });

  it('the seed returns before emitting anything', () => {
    expect(SRC).toMatch(/if \(prev === null\) return; \/\/ seed/);
  });

  it('it reads the store and never writes it, and calls no presentation setter', () => {
    const whole = SRC.slice(SRC.indexOf('OTA-1819'), SRC.indexOf('Build one view per enemy'));
    expect(whole).toContain('useGameStore((s) => s.chapterCard?.phase');
    expect(whole).toContain('useGameStore((s) => s.pendingFork?.id');
    /* ⚠ CODE LINES ONLY. The block's own prose says "no pointerEvents, no layout",
     * and a substring scan over the comment would fail on the very words that
     * promise the opposite. The claim is about what the code DOES. */
    const block = whole.split('\n')
      .filter((l) => !/^\s*(\*|\/\*|\/\/)/.test(l))
      .join('\n');
    for (const forbidden of [
      'dismissChapterCard', 'answerFork', 'setScreen', 'useGameStore.setState',
      'pointerEvents', 'zIndex', 'onStartShouldSetResponder', 'setTimeout', 'AsyncStorage',
    ]) {
      expect(block).not.toContain(forbidden);
    }
  });

  it('it is one effect with exactly the three predicates as deps', () => {
    expect(SRC).toContain('}, [chapterPhase, forkId, screenTeaching]);');
  });

  it('OTA-1813/1818 stay intact — the root and region observers are untouched', () => {
    expect(SRC).toContain("noteRootTouch('root'); return false;");
    expect(SRC).toContain("noteContentTouch('feed'); return false;");
    expect(SRC).toContain("noteContentTouch('controls'); return false;");
  });

  it('the presentation token is unchanged — this job did not widen it', () => {
    expect(SRC).toContain("return on.length ? on.join('+') : 'none';");
  });
});
