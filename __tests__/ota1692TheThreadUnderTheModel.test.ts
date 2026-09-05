/**
 * OTA-1692 — THE THREAD UNDER THE MODEL. The owner's lag, measured: eleven of
 * thirteen freeze-watch stalls land within half a second after a Qwen
 * completion and run as long as its read/write phase. llama.rn runs the
 * completion on a native thread and nothing runs per token, so the JS thread
 * is starved under inference. Two halves: a heartbeat that measures the
 * starvation from inside the call (jsLateMs on the qwen⏱ line), and a lever —
 * homework runs on one thread, the player's narration keeps the loaded count.
 */
import fs from 'node:fs';
import path from 'node:path';
import { startJsHeartbeat, threadsForLane, HOMEWORK_THREADS, JS_HEARTBEAT_INTERVAL_MS } from '../app/ai/generation/jsHeartbeat';

const src = (...p: string[]) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');

describe('OTA-1692 — the heartbeat', () => {
  it('reads a starved thread as seconds late and a healthy one as near zero', async () => {
    // A healthy thread: three intervals of idle, nothing late.
    const calm = startJsHeartbeat(20);
    await new Promise((r) => setTimeout(r, 90));
    const calmRead = calm.stop();
    expect(calmRead.samples).toBeGreaterThanOrEqual(2);
    expect(calmRead.maxLateMs).toBeLessThan(60);
    // A starved thread: a synchronous 180ms busy loop after the timer is armed.
    const starved = startJsHeartbeat(20);
    const t0 = Date.now();
    while (Date.now() - t0 < 180) { /* burn the JS thread */ }
    await new Promise((r) => setTimeout(r, 30));
    const read = starved.stop();
    expect(read.maxLateMs).toBeGreaterThanOrEqual(120);
    // stop() is idempotent and returns the same reading.
    expect(starved.stop()).toEqual(read);
  });

  it('the clock is injectable and the default interval is a quarter second', () => {
    let t = 1000;
    const beat = startJsHeartbeat(100, () => t);
    t += 5;
    expect(beat.stop()).toEqual({ maxLateMs: 0, samples: 0 });
    expect(JS_HEARTBEAT_INTERVAL_MS).toBe(250);
  });
});

describe('OTA-1692 — the lane lever', () => {
  it('homework runs on one thread; the player keeps the loaded count; nothing below one', () => {
    expect(HOMEWORK_THREADS).toBe(1);
    expect(threadsForLane(2, true)).toBe(1);
    expect(threadsForLane(2, false)).toBe(2);
    expect(threadsForLane(2, undefined)).toBe(2);
    expect(threadsForLane(4, true)).toBe(1);
    expect(threadsForLane(1, false)).toBe(1);
    expect(threadsForLane(0, false)).toBe(1);
  });

  it('the runtime asks llama.rn for the lane count PER COMPLETION and measures the call it wraps', () => {
    const rt = src('app', 'ai', 'generation', 'LlamaRuntime.ts');
    expect(rt.includes('const telThreads = threadsForLane(this.threads, opts.homework);')).toBe(true);
    expect(rt.includes('this.threads = opts.threads ?? 4;')).toBe(true);
    expect(rt.includes('n_threads: telThreads,')).toBe(true);
    expect(rt.includes('const beat = startJsHeartbeat();')).toBe(true);
    expect(rt.includes(').finally(() => { telJsLateMs = beat.stop().maxLateMs; });')).toBe(true);
    // Both record sites carry both fields.
    expect(rt.split('jsLateMs: telJsLateMs,').length - 1).toBe(2);
    expect(rt.split('\n        threads: telThreads,').length - 1).toBe(2); // the record field, not the n_threads param
    // llama.rn 0.4.x really takes it per call.
    const native = src('node_modules', 'llama.rn', 'src', 'NativeRNLlama.ts');
    const params = native.slice(native.indexOf('export type NativeCompletionParams'));
    expect(params.includes('n_threads?: number')).toBe(true);
  });

  it('the qwen⏱ line carries js-late (from 250ms up) and the thread count', () => {
    const boot = src('app', 'state', 'slices', 'bootSlice.ts');
    expect(boot.includes("const starve = r.jsLateMs != null && r.jsLateMs >= 250 ? ` js-late ${r.jsLateMs}ms` : '';")).toBe(true);
    expect(boot.includes("const thr = r.threads != null ? ` thr${r.threads}` : '';")).toBe(true);
    expect(boot.includes('${sizes}${starve}${thr}${msPerTok}')).toBe(true);
    const tel = src('app', 'ai', 'generation', 'qwenTelemetry.ts');
    expect(tel.includes('jsLateMs?: number;')).toBe(true);
    expect(tel.includes('threads?: number;')).toBe(true);
  });
});
