// OTA-634 — the native-ML lock serializes Qwen + Kokoro so they never crash each
// other, and now prioritizes LLM narration over voice synth. These lock the three
// properties that matter: exclusivity (never two at once), priority ordering
// (LLM jumps the queue; FIFO within a priority), and no-wedge on rejection.

import { runExclusiveNativeMl, ML_PRIORITY_VOICE, ML_PRIORITY_LLM } from '../app/ai/nativeMlLock';

function defer<T = void>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}
const tick = () => new Promise((r) => setTimeout(r, 0));

describe('OTA-634 — priority native-ML lock', () => {
  it('runs LLM ahead of queued voice, FIFO within a priority, never overlapping', async () => {
    const order: string[] = [];
    let inFlight = 0;
    let maxInFlight = 0;
    const gateA = defer();

    const run = (label: string, priority: number, gate?: Promise<void>) =>
      runExclusiveNativeMl(async () => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        if (gate) await gate;
        order.push(label);
        inFlight -= 1;
      }, priority);

    // A is the op already running (it blocks on a gate). While it holds the lock,
    // queue B (voice), C (LLM), D (voice) — all arrive while A is in flight.
    const pA = run('A', ML_PRIORITY_VOICE, gateA.promise);
    const pB = run('B', ML_PRIORITY_VOICE);
    const pC = run('C', ML_PRIORITY_LLM);
    const pD = run('D', ML_PRIORITY_VOICE);
    await tick(); // let A actually start + block on its gate
    gateA.resolve();
    await Promise.all([pA, pB, pC, pD]);

    // A first (it was already running); then C jumps ahead (LLM priority); then
    // B before D (FIFO among the equal-priority voice ops).
    expect(order).toEqual(['A', 'C', 'B', 'D']);
    expect(maxInFlight).toBe(1); // exclusivity preserved
  });

  it('a rejected op does not wedge the chain — later ops still run', async () => {
    const results: string[] = [];
    const pBad = runExclusiveNativeMl(async () => { throw new Error('boom'); }).catch(() => results.push('bad-caught'));
    const pGood = runExclusiveNativeMl(async () => { results.push('good-ran'); });
    await Promise.all([pBad, pGood]);
    expect(results).toContain('bad-caught');
    expect(results).toContain('good-ran');
  });

  it('returns the op result to the caller', async () => {
    const v = await runExclusiveNativeMl(async () => 42);
    expect(v).toBe(42);
  });
});
