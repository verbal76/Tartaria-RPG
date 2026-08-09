// OTA-1200 — COUNT THE LIVE MODEL CONTEXTS. AN INSTRUMENT, SHIPPED ALONE, ON PURPOSE.
//
// ⚠⚠ THE MEASUREMENT. Three JetsamEvent reports off the owner's iPhone XR (3GB), all
// three naming us:
//     "largestProcess" : "TartariaRealmsHAL"
//     "reason"         : "per-process-limit"
//     "rpages"         : 118454 / 121207   →  1.85–1.89 GB
// Every other process in those lists is 100–1,200 pages (2–19MB). `per-process-limit`
// means iOS killed us for blowing OUR OWN cap. The model is ~400MB of that; roughly 1.5GB
// has no owner yet.
//
// ⚠⚠ AND THE REASON THERE IS NO FIX IN THIS OTA. The rule the owner and I agreed after a
// day of building on inference: **measure the cause, or ship an instrument.** OTA-1195
// wrote that rule into its own source; OTA-1196 overrode it with a well-argued paragraph
// and built a reload loop — seven ~400MB allocations in forty seconds. The orphan-context
// theory below is the best candidate I have, and a candidate is not a number, so nothing
// here changes behaviour. The next device log makes it a number.
//
// WHAT THIS SUITE PINS, and it is deliberately weighted toward EXECUTION over reading:
//   1. The ledger's own arithmetic, including that live>1 shouts.
//   2. A REAL LlamaRuntime, driven against a fake llama.rn, produces the right counts —
//      including the dispose-mid-load case that is the entire hypothesis.
//   3. The routine empty dispose stays SILENT. An instrument that fires on every
//      backgrounding is one nobody reads by Thursday.
//   4. The instrument cannot break its host: a throwing sink is swallowed.
//   5. No import cycle — contextLedger is a leaf.

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('expo-file-system', () => ({
  documentDirectory: '/tmp/', cacheDirectory: '/tmp/',
  getInfoAsync: jest.fn(async () => ({ exists: true, size: 1 })),
  makeDirectoryAsync: jest.fn(async () => {}),
  readAsStringAsync: jest.fn(async () => ''),
  writeAsStringAsync: jest.fn(async () => {}),
  deleteAsync: jest.fn(async () => {}),
  downloadAsync: jest.fn(async () => ({ uri: '' })),
  EncodingType: { UTF8: 'utf8', Base64: 'base64' },
}));

import fs from 'fs';
import path from 'path';

import {
  setContextLedgerSink,
  noteContextOpened,
  noteContextReleased,
  noteDisposeFoundNothing,
  noteStragglerTornDown,
  contextLedger,
  contextLedgerSummary,
  _resetContextLedger,
  APPROX_CONTEXT_MB,
} from '../app/ai/generation/contextLedger';
import { LlamaRuntime, __setLlamaModuleForTests, type LlamaModule } from '../app/ai/generation/LlamaRuntime';

const SRC = (rel: string) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

/** Strips comment BLOCKS and whole-line `//` comments.
 *  ⚠ It does NOT strip trailing `//` — doing that would eat every `https://` in the file.
 *  Which is exactly why the source-scanning tests below assert on STRUCTURE (counts, and
 *  unique code lines) rather than on words appearing near other words. A prose-proximity
 *  regex in an earlier OTA matched its own trailing comment and passed for the wrong
 *  reason; that is not repeated here. */
function codeOnly(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

let lines: string[] = [];
beforeEach(() => {
  _resetContextLedger();
  lines = [];
  setContextLedgerSink((l) => { lines.push(l); });
});
afterEach(() => {
  setContextLedgerSink(null);
  _resetContextLedger();
});

describe('OTA-1200 — the ledger arithmetic', () => {
  test('a clean open/release cycle nets to zero live', () => {
    noteContextOpened();
    expect(contextLedger().live).toBe(1);
    noteContextReleased();
    const l = contextLedger();
    expect(l.live).toBe(0);
    expect(l.opened).toBe(1);
    expect(l.released).toBe(1);
  });

  test('peakLive remembers the worst moment after everything is released', () => {
    noteContextOpened();
    noteContextOpened();
    noteContextOpened();
    noteContextReleased();
    noteContextReleased();
    noteContextReleased();
    const l = contextLedger();
    // ⚠ THE POINT OF PEAK. A report pulled after the pressure passed would read live=0 and
    // look innocent. The jetsam happened at the peak, not at the end.
    expect(l.live).toBe(0);
    expect(l.peakLive).toBe(3);
  });

  test('a second live context shouts, and one does not', () => {
    noteContextOpened();
    expect(lines.filter((l) => l.includes('LIVE CONTEXTS AT ONCE'))).toHaveLength(0);
    noteContextOpened();
    const shout = lines.filter((l) => l.includes('LIVE CONTEXTS AT ONCE'));
    expect(shout).toHaveLength(1);
    expect(shout[0]).toContain('2 LIVE CONTEXTS');
    // The estimate is carried so a human can compare the count against a jetsam report
    // without doing the multiplication.
    expect(shout[0]).toContain(String(2 * APPROX_CONTEXT_MB));
  });

  test('the estimate is labelled as an estimate everywhere it is printed', () => {
    // ⚠ THIS CONSTANT ONCE BECAME A PREMISE. A ~425MB guess was stated once and then cited
    // as fact in five later messages, and used to argue the phone should cope. The
    // measurement came back 4.5x higher. Every place it surfaces says `est`.
    noteContextOpened();
    noteContextOpened();
    for (const l of lines.filter((x) => x.includes(String(APPROX_CONTEXT_MB)) || x.includes('MB'))) {
      expect(l).toMatch(/est/);
    }
    expect(contextLedgerSummary()).toMatch(/est/);
  });

  test('dispose-found-nothing counts and names itself as a possible orphan', () => {
    noteDisposeFoundNothing('load-in-flight');
    const l = contextLedger();
    expect(l.disposeFoundNothing).toBe(1);
    expect(lines[0]).toContain('DISPOSE FOUND NOTHING');
    expect(lines[0]).toContain('load-in-flight');
    expect(lines[0]).toContain('orphaned');
  });

  test('stragglers torn down are counted separately from orphans', () => {
    noteStragglerTornDown();
    noteDisposeFoundNothing('load-in-flight');
    const l = contextLedger();
    // ⚠ The two must never be conflated: one is the guard WORKING, the other is the leak.
    // If orphans climb while stragglers stay at 0, the guard is not running.
    expect(l.stragglersTornDown).toBe(1);
    expect(l.disposeFoundNothing).toBe(1);
  });
});

describe('OTA-1200 — the summary block', () => {
  test('reads flat and unalarming on a healthy session', () => {
    noteContextOpened();
    noteContextReleased();
    const s = contextLedgerSummary();
    expect(s).toContain('Live now: 0');
    expect(s).not.toContain('⚠');
    // A clean session must say so plainly. Nobody should have to interpret it.
    expect(s).not.toContain('orphan');
  });

  test('surfaces the two bad states when they exist', () => {
    noteContextOpened();
    noteContextOpened();
    noteDisposeFoundNothing('load-in-flight');
    const s = contextLedgerSummary();
    expect(s).toContain('⚠⚠ Live now: 2');
    expect(s).toContain('Disposes that freed nothing: 1');
    expect(s).toContain('Peak live: 2');
  });

  test('the bug report includes the block, and behind its own guard', () => {
    // The exporter must never be the thing that fails when the app is already in trouble.
    const src = SRC('app/diagnostics/aboutSummary.ts');
    expect(src).toContain('contextLedgerBlock()');
    const body = src.slice(src.indexOf('function contextLedgerBlock'), src.indexOf('function contextLedgerBlock') + 400);
    expect(body).toContain('try {');
    expect(body).toContain('catch');
  });
});

describe('OTA-1200 — a real LlamaRuntime, driven', () => {
  /** A fake llama.rn whose load can be held open, so a dispose can be landed mid-flight —
   *  the exact race the whole hypothesis is about. */
  function fakeModule(): { mod: LlamaModule; releaseCount: () => number; settle: () => void } {
    let released = 0;
    let release: (() => void) | null = null;
    const gate = new Promise<void>((r) => { release = r; });
    let hold = false;
    const mod = {
      initLlama: jest.fn(async () => {
        if (hold) await gate;
        return {
          completion: jest.fn(async () => ({ text: '', tokens_predicted: 0 })),
          release: jest.fn(async () => { released += 1; }),
        };
      }),
      releaseAllLlama: jest.fn(async () => {}),
    } as unknown as LlamaModule;
    return {
      mod,
      releaseCount: () => released,
      settle: () => { release?.(); },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...({ setHold: (v: boolean) => { hold = v; } } as any),
    };
  }

  test('a normal load/dispose cycle counts one open and one release', async () => {
    const f = fakeModule();
    __setLlamaModuleForTests(f.mod);
    const rt = new LlamaRuntime();
    await rt.initialize({ modelPath: '/tmp/model.gguf' });
    expect(contextLedger().opened).toBe(1);
    expect(contextLedger().live).toBe(1);
    await rt.dispose();
    const l = contextLedger();
    expect(l.released).toBe(1);
    expect(l.live).toBe(0);
    // And it genuinely released the native side, not just the counter.
    expect(f.releaseCount()).toBe(1);
    expect(l.disposeFoundNothing).toBe(0);
  });

  test('⚠⚠ a dispose landing MID-LOAD frees nothing, and says so — the hypothesis, executed', async () => {
    const f = fakeModule() as ReturnType<typeof fakeModule> & { setHold: (v: boolean) => void };
    f.setHold(true);
    __setLlamaModuleForTests(f.mod);
    const rt = new LlamaRuntime();

    // Start the load and DO NOT await it: this is the window where `this.context` is still
    // null while a ~400MB allocation is already under way.
    const loading = rt.initialize({ modelPath: '/tmp/model.gguf' });
    await Promise.resolve();

    await rt.dispose();
    expect(contextLedger().disposeFoundNothing).toBe(1);
    expect(lines.some((l) => l.includes('DISPOSE FOUND NOTHING'))).toBe(true);
    // Nothing was freed, and the fake proves it — release() was never reached.
    expect(f.releaseCount()).toBe(0);

    // Now let the load land. It opens a context that the dispose already gave up on.
    f.settle();
    await loading;
    const l = contextLedger();
    expect(l.opened).toBe(1);
    expect(l.released).toBe(0);
    // ⚠ live=1 with nobody having asked for it. THIS is the shape we are looking for in
    // the device log — and whether it happens on the owner's phone is still unmeasured.
    expect(l.live).toBe(1);
  });

  test('the routine empty dispose stays SILENT', async () => {
    // App.tsx disposes on every backgrounding whether or not Qwen was ever up, and a
    // double dispose is normal. If these logged, the real event would be buried.
    const f = fakeModule();
    __setLlamaModuleForTests(f.mod);
    const rt = new LlamaRuntime();

    await rt.dispose();                 // never loaded
    expect(contextLedger().disposeFoundNothing).toBe(0);
    expect(lines).toHaveLength(0);

    await rt.initialize({ modelPath: '/tmp/model.gguf' });
    await rt.dispose();
    await rt.dispose();                 // second dispose — already empty
    expect(contextLedger().disposeFoundNothing).toBe(0);
    expect(lines.filter((l) => l.includes('DISPOSE FOUND NOTHING'))).toHaveLength(0);
  });

  test('a load that THROWS does not inflate the count', async () => {
    const mod = {
      initLlama: jest.fn(async () => { throw new Error('native load failed'); }),
      releaseAllLlama: jest.fn(async () => {}),
    } as unknown as LlamaModule;
    __setLlamaModuleForTests(mod);
    const rt = new LlamaRuntime();
    await expect(rt.initialize({ modelPath: '/tmp/model.gguf' })).rejects.toThrow('native load failed');
    // Nothing was allocated, so nothing is counted. A counter that over-reports would send
    // the next investigation somewhere there is no bug.
    expect(contextLedger().opened).toBe(0);
    expect(contextLedger().live).toBe(0);
    // ⚠ AND the in-flight flag must have cleared despite the throw, or every later empty
    // dispose would masquerade as an orphan forever.
    await rt.dispose();
    expect(contextLedger().disposeFoundNothing).toBe(0);
  });
});

describe('OTA-1200 — the instrument cannot break its host', () => {
  test('a throwing sink is swallowed on every entry point', () => {
    setContextLedgerSink(() => { throw new Error('sink exploded'); });
    expect(() => noteContextOpened()).not.toThrow();
    expect(() => noteContextOpened()).not.toThrow();   // the live>1 path emits twice
    expect(() => noteContextReleased()).not.toThrow();
    expect(() => noteDisposeFoundNothing('x')).not.toThrow();
    expect(() => noteStragglerTornDown()).not.toThrow();
    // The counts are still correct — only the printing failed.
    expect(contextLedger().opened).toBe(2);
  });

  test('with no sink installed at all, the counters still work', () => {
    setContextLedgerSink(null);
    noteContextOpened();
    expect(contextLedger().live).toBe(1);
  });
});

describe('OTA-1200 — structure', () => {
  test('contextLedger is a leaf: it imports nothing', () => {
    // ⚠ LOAD-BEARING. LlamaRuntime imports this; the store imports LlamaRuntime. Any
    // import here — the store above all — is a cycle, and a cycle in a module that runs at
    // boot is a blank screen, not a warning.
    const src = codeOnly(SRC('app/ai/generation/contextLedger.ts'));
    expect(src).not.toMatch(/^\s*import\s/m);
    expect(src).not.toMatch(/require\(/);
  });

  test('the in-flight flag is cleared in a finally, not after the await', () => {
    // Structure, not prose: exactly one assignment sets it true and exactly one clears it,
    // and the clear is attached to the load promise so a throw cannot strand it.
    const src = codeOnly(SRC('app/ai/generation/LlamaRuntime.ts'));
    expect(src.match(/this\.loadInFlight = true/g) ?? []).toHaveLength(1);
    expect(src.match(/this\.loadInFlight = false/g) ?? []).toHaveLength(1);
    expect(src).toMatch(/\.finally\(\(\) => \{ this\.loadInFlight = false; \}\)/);
  });

  test('the empty-dispose log is gated on the flag, not fired unconditionally', () => {
    const src = codeOnly(SRC('app/ai/generation/LlamaRuntime.ts'));
    expect(src).toMatch(/if \(this\.loadInFlight\) noteDisposeFoundNothing\('load-in-flight'\)/);
    // Exactly one call site — a second, ungated one would restore the noise problem.
    expect(src.match(/noteDisposeFoundNothing\(/g) ?? []).toHaveLength(1);
  });

  test('the straggler guard is counted where it tears down', () => {
    const src = codeOnly(SRC('app/ai/generation/QwenGenerativeEngine.ts'));
    const i = src.indexOf('noteStragglerTornDown()');
    expect(i).toBeGreaterThan(0);
    // It sits in the stale-generation branch, immediately before the teardown it reports.
    expect(src.slice(i, i + 120)).toContain('runtime.dispose()');
  });

  test('the sink is installed in hydrate, before anything can load a context', () => {
    const src = codeOnly(SRC('app/state/gameStore.ts'));
    expect(src.match(/setContextLedgerSink\(/g) ?? []).toHaveLength(1);
    // ⚠ In hydrate() beside the other two sinks — NOT in startRuntimePressureWatch. A sink
    // armed after the first load would miss the race it exists to catch.
    const h = src.indexOf('async hydrate()');
    const install = src.indexOf('setContextLedgerSink(');
    expect(h).toBeGreaterThan(0);
    expect(install).toBeGreaterThan(h);
    expect(install - h).toBeLessThan(4000);
  });

  test('OTA-1200 changes no behaviour — the instrument is additive only', () => {
    // ⚠⚠ THE RULE, ENFORCED ON ITSELF. This OTA ships an instrument because the cause is
    // not measured. If a future edit adds a fix in here, this test is where it gets
    // caught, and the fix belongs in its own OTA with the measurement quoted.
    const src = codeOnly(SRC('app/ai/generation/LlamaRuntime.ts'));
    // dispose() still returns early on an empty context — no attempt to "fix" the orphan.
    expect(src).toMatch(/if \(!ctx\) \{/);
    expect(src).toMatch(/^\s*return;\s*$/m);
    // And nothing here awaits or cancels an in-flight load, which is what a fix would do.
    expect(src).not.toMatch(/await this\.loadInFlight/);
  });
});
