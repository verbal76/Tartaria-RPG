/* ⚠⚠⚠ OTA-1853 §J — THE ONE PRODUCTION EFFECT THIS PASS TOUCHED, RENDERED.
 *
 * Eight of the nine non-comment lines OTA-1853 adds to production files are
 * pure insertions. The ninth is not: ArtFlash's effect used to teardown with
 * `return clearTimer;` and now returns a closure that calls `clearTimer()` and
 * then reports the unmount. That timer is load-bearing — its own comment says
 * "a timer that outlives its own flash calls onDone() after the next one has
 * already opened, closing it a beat after it appeared" — so a diagnostic that
 * quietly displaced it would be a real regression in the game, introduced by a
 * pass whose whole claim is that it changes nothing.
 *
 * This renders the real component and asks both questions: the marks fire at
 * the right edges, AND the timer still clears on every path out.
 *
 * ⚠ FAKE TIMERS, NOT A WALL CLOCK. §16 forbids wall-clock tests; HOLD_MS is
 * a module constant and the flash is driven by advancing jest's clock.
 */
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const calls: Array<{ kind: number; code: number }> = [];
jest.mock('../app/diagnostics/nativeMemoryRecorder', () => {
  const actual = jest.requireActual('../app/diagnostics/nativeMemoryRecorder');
  return { ...actual, annotateMemory: (kind: number, code = 0) => { calls.push({ kind, code }); } };
});

import React from 'react';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const renderer = require('react-test-renderer') as {
  act(cb: () => void | Promise<void>): void;
  create(el: React.ReactElement): { unmount(): void; update(el: React.ReactElement): void };
};

import { MEM_KIND, memCodeForId } from '../app/diagnostics/nativeMemoryRecorder';
import { ArtFlash } from '../app/components/ArtFlash';

const SOURCE = 1 as unknown as number; // a module number, as the real prop is
const of = (kind: number) => calls.filter((c) => c.kind === kind);

beforeEach(() => { calls.length = 0; jest.useFakeTimers(); });
afterEach(() => { jest.useRealTimers(); });

function flash(artKey: string | null) {
  return <ArtFlash artKey={artKey} source={SOURCE} title="t" onDone={() => {}} />;
}

describe('OTA-1853 §J — the art flash announces its own mount and unmount', () => {
  test('J1 showing art reports exactly one ARTWORK_MOUNT, named by its key', () => {
    let tree!: ReturnType<typeof renderer.create>;
    renderer.act(() => { tree = renderer.create(flash('relic_vault')); });
    expect(of(MEM_KIND.ARTWORK_MOUNT)).toHaveLength(1);
    expect(of(MEM_KIND.ARTWORK_MOUNT)[0]!.code).toBe(memCodeForId('relic_vault'));
    expect(of(MEM_KIND.ARTWORK_UNMOUNT)).toHaveLength(0);
    renderer.act(() => { tree.unmount(); });
  });

  test('J2 unmounting reports the UNMOUNT for the key that was showing', () => {
    let tree!: ReturnType<typeof renderer.create>;
    renderer.act(() => { tree = renderer.create(flash('relic_vault')); });
    calls.length = 0;
    renderer.act(() => { tree.unmount(); });
    expect(of(MEM_KIND.ARTWORK_UNMOUNT)).toHaveLength(1);
    expect(of(MEM_KIND.ARTWORK_UNMOUNT)[0]!.code).toBe(memCodeForId('relic_vault'));
  });

  /* ⚠ THE RE-TRIGGER, WHICH IS THE CASE THAT MATTERS. A second flash opening
   * over a first must close the first's book before opening the second's — an
   * unbalanced pair in the ring reads as artwork that was never released. */
  test('J3 a new flash over an old one pairs the old unmount before the new mount', () => {
    let tree!: ReturnType<typeof renderer.create>;
    renderer.act(() => { tree = renderer.create(flash('gate')); });
    calls.length = 0;
    renderer.act(() => { tree.update(flash('chapel')); });
    expect(calls.map((c) => c.kind)).toEqual([MEM_KIND.ARTWORK_UNMOUNT, MEM_KIND.ARTWORK_MOUNT]);
    expect(calls[0]!.code).toBe(memCodeForId('gate'));
    expect(calls[1]!.code).toBe(memCodeForId('chapel'));
    renderer.act(() => { tree.unmount(); });
  });

  test('J4 nothing to show reports nothing', () => {
    let tree!: ReturnType<typeof renderer.create>;
    renderer.act(() => {
      tree = renderer.create(
        <ArtFlash artKey={null} source={undefined} title="t" onDone={() => {}} />,
      );
    });
    expect(calls).toHaveLength(0);
    renderer.act(() => { tree.unmount(); });
  });

  /* ⚠⚠ THE REGRESSION GUARD. `return clearTimer` became a closure so the mark
   * could ride it. If clearTimer were dropped from that closure, the flash's
   * hold timer would outlive its own unmount and call onDone() into a torn-down
   * tree — the exact failure the original comment was written to prevent. */
  test('J5 the hold timer is still cleared on unmount — onDone never fires after', () => {
    let done = 0;
    let tree!: ReturnType<typeof renderer.create>;
    renderer.act(() => {
      tree = renderer.create(
        <ArtFlash artKey="gate" source={SOURCE} title="t" onDone={() => { done += 1; }} />,
      );
    });
    renderer.act(() => { tree.unmount(); });
    renderer.act(() => { jest.advanceTimersByTime(60_000); });
    expect(done).toBe(0);
  });

  test('J6 the timer is also cleared when a new flash replaces the old', () => {
    let done = 0;
    let tree!: ReturnType<typeof renderer.create>;
    const el = (k: string) => (
      <ArtFlash artKey={k} source={SOURCE} title="t" onDone={() => { done += 1; }} />
    );
    renderer.act(() => { tree = renderer.create(el('gate')); });
    renderer.act(() => { tree.update(el('chapel')); });
    renderer.act(() => { tree.unmount(); });
    renderer.act(() => { jest.advanceTimersByTime(60_000); });
    expect(done).toBe(0);
  });
});
