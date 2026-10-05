// OTA-1891 — harness only. A timer a suite armed may not fire after the suite is torn down.
//
// The incident: golem-line CI shard 2/4 failed `ota952ZeroGrip` with "Cannot read properties of
// undefined (reading 'OS')" — thrown by gameStore's 2.5 s vendor-warm timer, armed by ANOTHER suite
// (importSave), firing into a dead Jest environment and landing on whichever test was running. The
// repair is in jest.teardown.js (see the block there); this pins it so it cannot silently rot.

type Tracker = { clearLeaked: () => number; pending: () => number };
const tracker = (): Tracker => (globalThis as unknown as { __TARTARIA_TIMER_TRACKER__: Tracker }).__TARTARIA_TIMER_TRACKER__;
const real = (ms: number) => new Promise<void>((r) => { const h = setTimeout(r, ms); void h; });

describe('the per-suite timer tracker', () => {
  it('is installed for every suite', () => {
    expect(tracker()).toBeDefined();
    expect(typeof tracker().clearLeaked).toBe('function');
  });

  it('clears a timer that is still pending, so its callback can never fire later', async () => {
    let fired = false;
    setTimeout(() => { fired = true; }, 40);
    expect(tracker().pending()).toBeGreaterThan(0);
    expect(tracker().clearLeaked()).toBeGreaterThan(0);
    await real(120);
    expect(fired).toBe(false);
  });

  it('forgets a timer that already ran, and one its owner cleared — it never touches a live-by-design one', async () => {
    tracker().clearLeaked();
    const base = tracker().pending();
    let ran = 0;
    setTimeout(() => { ran += 1; }, 5);
    const owned = setTimeout(() => { ran += 100; }, 5);
    clearTimeout(owned);
    expect(tracker().pending()).toBe(base + 1);
    await real(60);
    expect(ran).toBe(1);
    expect(tracker().pending()).toBe(base);
  });

  it('clears a leaked interval too (the homework tick is one)', async () => {
    let ticks = 0;
    setInterval(() => { ticks += 1; }, 10);
    tracker().clearLeaked();
    await real(60);
    expect(ticks).toBe(0);
  });

  it('keeps the handle Node gave it (unref/ref still work)', () => {
    const h = setTimeout(() => {}, 1_000_000) as unknown as { unref?: () => unknown };
    expect(typeof h.unref).toBe('function');
    clearTimeout(h as unknown as ReturnType<typeof setTimeout>);
  });

  it('LAST TEST — arms a long timer on purpose and leaves it; the afterAll below proves the teardown cleared it', () => {
    setTimeout(() => { throw new Error('a leaked timer fired after the suite'); }, 2_500);
    expect(tracker().pending()).toBeGreaterThan(0);
  });
});

// The setup file's afterAll runs BEFORE this one (measured), so by here the leaked timer is gone.
afterAll(() => {
  expect(tracker().pending()).toBe(0);
});
