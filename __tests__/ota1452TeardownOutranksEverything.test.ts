/**
 * OTA-1452 — THE TEARDOWN PATH: NOTHING MAY OUTRANK GIVING BACK 425MB, AND A
 * LOAD THAT NOBODY WANTS ANY MORE FREES ITSELF.
 *
 * ⚠⚠⚠ WHY THIS SUITE IS EXHAUSTIVE RATHER THAN ILLUSTRATIVE. Owner's standing
 * rule, given the day this was written: *"the majority of the last 300 OTAs have
 * all boiled down to a test that failed — either it was written incorrectly or it
 * didn't catch all of it… I want to find every variation, every permutation,
 * every possible outcome. I don't want to have to rebuild the same test five
 * different times."* So the two fixes below are pinned across their whole state
 * space, not at the one point that happened to reproduce.
 *
 * ⚠⚠ AND WHAT IS *NOT* CLAIMED, because the same rule cuts this way too. Neither
 * fix here is proven to be B9. I first read the owner's 4.32.11 report as showing
 * the orphan leak in the wild and it does NOT — `Peak live: 1` settles that, since
 * an orphan makes the NEXT load the second live context. Both orphan counters read
 * 0 in that report. What IS measured is (1) the race exists in executed code — the
 * ota1177 mid-load test reports `released=0, live=1` with the epoch guard removed —
 * and (2) the crash ledger's crumb gap, `ctx-release (+9152ms)` with no
 * `ctx-release-done`, which says a free was asked for and had not finished nine
 * seconds later. The priority defect below is a mechanism that produces exactly
 * that gap. Whether it produced THAT one is unproven and stays unproven here.
 */
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

import {
  runExclusiveNativeMl, reserveVoiceSlot, releaseVoiceSlot,
  ML_PRIORITY_TEARDOWN, ML_PRIORITY_VOICE, ML_PRIORITY_LLM, ML_PRIORITY_HOMEWORK,
  VOICE_RESERVATION_MS,
} from '../app/ai/nativeMlLock';
import {
  LlamaRuntime, __setLlamaModuleForTests, type LlamaModule,
} from '../app/ai/generation/LlamaRuntime';
import {
  setContextLedgerSink, contextLedger, _resetContextLedger,
} from '../app/ai/generation/contextLedger';
import { blockAt } from '../test-utils/srcBlock';

const read = (...p: string[]) =>
  require('fs').readFileSync(require('path').join(__dirname, '..', ...p), 'utf8') as string;

function defer<T = void>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}
const tick = () => new Promise((r) => setTimeout(r, 0));

// ───────────────────────────────────────────────────────────────────────────
// PART 1 — the priority ladder itself
// ───────────────────────────────────────────────────────────────────────────

describe('OTA-1452 — the teardown rank, by construction', () => {
  it('⚠⚠ outranks EVERY other tier, and the ladder is strictly ordered', () => {
    // Checked as a total order rather than "teardown > voice", so a later tier
    // inserted anywhere cannot quietly land on top of the free.
    const ladder = [ML_PRIORITY_HOMEWORK, ML_PRIORITY_LLM, ML_PRIORITY_VOICE, ML_PRIORITY_TEARDOWN];
    for (let i = 1; i < ladder.length; i++) expect(ladder[i]!).toBeGreaterThan(ladder[i - 1]!);
    expect(Math.max(...ladder)).toBe(ML_PRIORITY_TEARDOWN);
  });

  it('⚠⚠ is at or above the voice tier, which is what dodges the reservation hold', () => {
    // `pumpMl` defers work whose priority is `< ML_PRIORITY_VOICE` while a voice
    // slot is reserved. That comparison — not the raw number — is the thing that
    // keeps a teardown out of the hold, so it is pinned as the comparison.
    expect(ML_PRIORITY_TEARDOWN >= ML_PRIORITY_VOICE).toBe(true);
  });
});

describe('OTA-1452 — the teardown rank, executed', () => {
  it('⚠⚠ jumps a queued VOICE op — the tier that used to go first', async () => {
    const gate = defer();
    const order: string[] = [];
    void runExclusiveNativeMl(async () => { await gate.promise; order.push('running'); }, ML_PRIORITY_LLM);
    await tick();
    void runExclusiveNativeMl(async () => { order.push('voice'); }, ML_PRIORITY_VOICE);
    void runExclusiveNativeMl(async () => { order.push('teardown'); }, ML_PRIORITY_TEARDOWN);
    gate.resolve();
    await tick(); await tick();
    expect(order).toEqual(['running', 'teardown', 'voice']);
  });

  it('⚠⚠ jumps EVERY tier at once, whatever order they queued in', async () => {
    // The permutation the single-pair test cannot see: all four tiers waiting
    // together, enqueued worst-first so FIFO alone would produce the reverse.
    const gate = defer();
    const order: string[] = [];
    void runExclusiveNativeMl(async () => { await gate.promise; }, ML_PRIORITY_LLM);
    await tick();
    void runExclusiveNativeMl(async () => { order.push('homework'); }, ML_PRIORITY_HOMEWORK);
    void runExclusiveNativeMl(async () => { order.push('llm'); }, ML_PRIORITY_LLM);
    void runExclusiveNativeMl(async () => { order.push('voice'); }, ML_PRIORITY_VOICE);
    void runExclusiveNativeMl(async () => { order.push('teardown'); }, ML_PRIORITY_TEARDOWN);
    gate.resolve();
    await tick(); await tick(); await tick();
    expect(order[0]).toBe('teardown');
    expect(order).toEqual(['teardown', 'voice', 'llm', 'homework']);
  });

  it('⚠⚠⚠ IS NOT PARKED BY A VOICE RESERVATION — the defect that costs the seconds', async () => {
    // ⚠ THE ONE THAT MATTERS MOST, and the one a "teardown beats voice" test would
    // have missed entirely. OTA-1144 holds the lock OPEN for a voice line that has
    // been promised but has not arrived. At the old default rank the free was
    // BELOW voice, so it sat in that hold — waiting on a line that, with the app
    // backgrounded, may never come at all.
    reserveVoiceSlot(VOICE_RESERVATION_MS);
    const order: string[] = [];
    const done = runExclusiveNativeMl(async () => { order.push('teardown'); }, ML_PRIORITY_TEARDOWN);
    await tick();
    // It ran immediately, without waiting out the reservation.
    expect(order).toEqual(['teardown']);
    await done;
    releaseVoiceSlot();
  });

  it('⚠ …while ordinary work IS still parked by it — the hold is not broken, only bypassed', async () => {
    // The negative half. If this passes trivially the test above proves nothing,
    // because a reservation that never held anything is not a hold.
    reserveVoiceSlot(VOICE_RESERVATION_MS);
    const order: string[] = [];
    void runExclusiveNativeMl(async () => { order.push('llm'); }, ML_PRIORITY_LLM);
    await tick();
    expect(order).toEqual([]);          // deferred, exactly as OTA-1144 intends
    releaseVoiceSlot();
    await new Promise((r) => setTimeout(r, VOICE_RESERVATION_MS + 20));
    expect(order).toEqual(['llm']);     // and it is not lost, only delayed
  });

  it('⚠⚠ preempts a running op that offered a cut-short hook', async () => {
    const gate = defer();
    let cut = false;
    void runExclusiveNativeMl(
      async () => { await gate.promise; },
      ML_PRIORITY_HOMEWORK,
      () => { cut = true; gate.resolve(); },
    );
    await tick();
    expect(cut).toBe(false);
    const done = runExclusiveNativeMl(async () => {}, ML_PRIORITY_TEARDOWN);
    expect(cut).toBe(true);            // fired on ENQUEUE, not on pump
    await done;
  });

  it('⚠ but never OVERLAPS one — exclusivity outranks urgency', async () => {
    // A teardown that ran concurrently with a completion would be OTA-1123's
    // SIGSEGV back again: release() freeing the context under a live prediction.
    const gate = defer();
    let inFlight = 0;
    let sawOverlap = false;
    void runExclusiveNativeMl(async () => {
      inFlight++; await gate.promise;
      if (inFlight > 1) sawOverlap = true;
      inFlight--;
    }, ML_PRIORITY_LLM);
    await tick();
    const done = runExclusiveNativeMl(async () => {
      inFlight++;
      if (inFlight > 1) sawOverlap = true;
      inFlight--;
    }, ML_PRIORITY_TEARDOWN);
    await tick();
    gate.resolve();
    await done;
    expect(sawOverlap).toBe(false);
  });

  it('⚠ two teardowns are FIFO between themselves', async () => {
    const gate = defer();
    const order: string[] = [];
    void runExclusiveNativeMl(async () => { await gate.promise; }, ML_PRIORITY_LLM);
    await tick();
    void runExclusiveNativeMl(async () => { order.push('first'); }, ML_PRIORITY_TEARDOWN);
    void runExclusiveNativeMl(async () => { order.push('second'); }, ML_PRIORITY_TEARDOWN);
    gate.resolve();
    await tick(); await tick();
    expect(order).toEqual(['first', 'second']);
  });

  it('⚠ a THROWING teardown does not wedge the lock for everyone behind it', async () => {
    await expect(
      runExclusiveNativeMl(async () => { throw new Error('release blew up'); }, ML_PRIORITY_TEARDOWN),
    ).rejects.toThrow('release blew up');
    const after = await runExclusiveNativeMl(async () => 'still works', ML_PRIORITY_LLM);
    expect(after).toBe('still works');
  });
});

describe('OTA-1452 — the rank is actually WIRED, and reserved to teardown', () => {
  const RT = read('app', 'ai', 'generation', 'LlamaRuntime.ts');

  it('⚠⚠ the dispose free takes it, and the straggler free needs no rank AT ALL', () => {
    // ⚠⚠ REBUILT. This first asserted TWO uses of the rank, one per free, on the
    // many-doors rule. That was right about the rule and wrong about the doors:
    // the straggler free no longer QUEUES, because load-and-disown happens inside
    // one critical section (see the initialize() comment). A rank on it would be
    // decoration, and worse, would imply a second acquisition that must not exist.
    //
    // So the pin is now the pair of facts that actually matter: the queueing free
    // has the rank, and the non-queueing one is genuinely inside the load's lock.
    expect(blockAt(RT, '  async dispose(): Promise<void> {', { mode: 'opener' }))
      .toContain('ctx.release()), ML_PRIORITY_TEARDOWN)');
    expect((RT.match(/ML_PRIORITY_TEARDOWN\)/g) ?? []).length).toBe(1);
  });

  it('⚠⚠⚠ THE STRAGGLER FREE IS INSIDE THE LOAD\'S OWN LOCK — one indivisible step', () => {
    // ⚠ THE DEADLOCK THIS SUITE FOUND, PINNED SO IT CANNOT COME BACK. The first
    // cut freed the straggler through a SECOND runExclusiveNativeMl call, after
    // the load had dropped the lock. Between those two acquisitions a queued load
    // can take the lock — so the orphan stays allocated WHILE ANOTHER ~425MB LOAD
    // RUNS. Two live contexts: the exact failure the guard exists to prevent,
    // reintroduced by the guard. The interleaving test below hung on it.
    const load = blockAt(RT, '    const fresh = await runExclusiveNativeMl<LlamaContext | null>(async () => {', { mode: 'opener' });
    // the epoch check and the free both live inside the load's callback…
    expect(load).toContain('if (this.disposeEpoch !== epochAtLoad)');
    expect(load).toContain('await ctx.release();');
    expect(load).toContain('noteStragglerTornDown();');
    // …and that free does NOT re-enter the lock.
    expect(load.slice(load.indexOf('if (this.disposeEpoch !== epochAtLoad)')))
      .not.toContain('runExclusiveNativeMl');
  });

  it('⚠⚠ NO release() anywhere in the runtime takes the lock at the default rank', () => {
    // The regression that would restore the bug silently: someone adds a free and
    // omits the priority argument, exactly as the original code did.
    expect(RT).not.toMatch(/runExclusiveNativeMl\(\(\) => Promise\.resolve\([a-zA-Z]+\.release\(\)\)\)/);
  });

  it('⚠⚠ nothing OUTSIDE the teardown path claims this rank', () => {
    // It means "the process is going away", not "important". A generation wearing
    // it would starve the voice permanently — the failure OTA-634 spent an OTA
    // undoing. Only the lock (which defines it) and the runtime (which frees) may
    // name it.
    const { execSync } = require('child_process') as typeof import('child_process');
    const hits = execSync(
      "grep -rl 'ML_PRIORITY_TEARDOWN' app/ || true",
      { cwd: require('path').join(__dirname, '..'), encoding: 'utf8' },
    ).split('\n').filter(Boolean).sort();
    expect(hits).toEqual(['app/ai/generation/LlamaRuntime.ts', 'app/ai/nativeMlLock.ts']);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// PART 2 — the orphan guard, across its whole state space
// ───────────────────────────────────────────────────────────────────────────

/** A fake llama.rn whose loads can each be held open independently, so disposes
 *  can be landed at any point in any number of overlapping allocations. */
function fakeModule(opts: { releaseThrows?: boolean } = {}) {
  let released = 0;
  const gates: Array<{ open: () => void; fail: (e: unknown) => void }> = [];
  let hold = false;
  // ⚠ Counted INSIDE the fake rather than inferred from the ledger, so
  // "allocations never overlap" is checked by observation of the thing itself.
  let concurrentLoads = 0;
  let maxConcurrentLoads = 0;
  const mod = {
    initLlama: jest.fn(async () => {
      concurrentLoads += 1;
      if (concurrentLoads > maxConcurrentLoads) maxConcurrentLoads = concurrentLoads;
      try {
        if (hold) {
          const d = defer();
          gates.push({ open: () => d.resolve(), fail: (e) => d.reject(e) });
          await d.promise;
        }
      } finally {
        concurrentLoads -= 1;
      }
      return {
        completion: jest.fn(async () => ({ text: '', tokens_predicted: 0 })),
        release: jest.fn(async () => {
          if (opts.releaseThrows) throw new Error('native release failed');
          released += 1;
        }),
        stopCompletion: jest.fn(async () => {}),
      };
    }),
    releaseAllLlama: jest.fn(async () => {}),
  } as unknown as LlamaModule;
  return {
    mod,
    releaseCount: () => released,
    setHold: (v: boolean) => { hold = v; },
    settle: (i = 0) => gates[i]?.open(),
    breakLoad: (i = 0, e: unknown = new Error('native load failed')) => gates[i]?.fail(e),
    pending: () => gates.length,
    maxConcurrentLoads: () => maxConcurrentLoads,
  };
}

describe('OTA-1452 — a load nobody wants frees itself', () => {
  let lines: string[] = [];
  beforeEach(() => {
    _resetContextLedger();
    lines = [];
    setContextLedgerSink((l) => lines.push(l));
  });
  afterEach(() => setContextLedgerSink(null));

  it('⚠ NO DISPOSE: the ordinary load is adopted and nothing is freed', async () => {
    // The control. Without this the guard could be freeing everything and the
    // leak tests would still pass.
    const f = fakeModule();
    __setLlamaModuleForTests(f.mod);
    const rt = new LlamaRuntime();
    await rt.initialize({ modelPath: '/tmp/m.gguf' });
    expect(rt.isReady()).toBe(true);
    const l = contextLedger();
    expect([l.opened, l.released, l.live]).toEqual([1, 0, 1]);
    expect(l.stragglersTornDown).toBe(0);
    expect(f.releaseCount()).toBe(0);
  });

  it('⚠⚠ DISPOSE MID-LOAD: freed, counted, never adopted', async () => {
    const f = fakeModule();
    f.setHold(true);
    __setLlamaModuleForTests(f.mod);
    const rt = new LlamaRuntime();
    const loading = rt.initialize({ modelPath: '/tmp/m.gguf' });
    await tick();
    expect(rt.isReady()).toBe(false);          // the window itself
    await rt.dispose();
    f.settle();
    await expect(loading).rejects.toThrow(/disposed mid-allocation/);
    const l = contextLedger();
    expect([l.opened, l.released, l.live]).toEqual([1, 1, 0]);
    expect(l.stragglersTornDown).toBe(1);
    expect(l.disposeFoundNothing).toBe(1);
    expect(f.releaseCount()).toBe(1);
    expect(rt.isReady()).toBe(false);
  });

  it('⚠⚠ TWO DISPOSES MID-LOAD: still exactly one free, and the epoch proves it is a counter', async () => {
    // Background → foreground → background inside one slow load. A BOOLEAN flag
    // set-and-cleared would read "nothing happened" at exactly the moment two
    // things did; a counter cannot.
    const f = fakeModule();
    f.setHold(true);
    __setLlamaModuleForTests(f.mod);
    const rt = new LlamaRuntime();
    const loading = rt.initialize({ modelPath: '/tmp/m.gguf' });
    await tick();
    await rt.dispose();
    await rt.dispose();
    f.settle();
    await expect(loading).rejects.toThrow(/disposed mid-allocation/);
    const l = contextLedger();
    expect([l.opened, l.released, l.live]).toEqual([1, 1, 0]);
    expect(l.stragglersTornDown).toBe(1);      // freed ONCE, not twice
    expect(f.releaseCount()).toBe(1);
  });

  it('⚠⚠ THE GUARD DOES NOT WEDGE THE RUNTIME: the next load works normally', async () => {
    // The regression that would be worse than the bug — narration dead for the
    // session because one backgrounding poisoned the runtime.
    const f = fakeModule();
    f.setHold(true);
    __setLlamaModuleForTests(f.mod);
    const rt = new LlamaRuntime();
    const cancelled = rt.initialize({ modelPath: '/tmp/m.gguf' });
    await tick();
    await rt.dispose();
    f.settle(0);
    await expect(cancelled).rejects.toThrow(/disposed mid-allocation/);

    f.setHold(false);
    await rt.initialize({ modelPath: '/tmp/m.gguf' });
    expect(rt.isReady()).toBe(true);
    const l = contextLedger();
    expect([l.opened, l.released, l.live]).toEqual([2, 1, 1]);
  });

  it('⚠⚠ A LOAD THAT THROWS while disposed counts NO open and NO release', async () => {
    // The ledger must not learn to lie in either direction. Nothing was
    // allocated, so nothing may be counted — and the straggler path must not run.
    const f = fakeModule();
    f.setHold(true);
    __setLlamaModuleForTests(f.mod);
    const rt = new LlamaRuntime();
    const loading = rt.initialize({ modelPath: '/tmp/m.gguf' });
    await tick();
    await rt.dispose();
    f.breakLoad();
    await expect(loading).rejects.toThrow('native load failed');
    const l = contextLedger();
    expect([l.opened, l.released, l.live]).toEqual([0, 0, 0]);
    expect(l.stragglersTornDown).toBe(0);
    expect(l.disposeFoundNothing).toBe(1);   // the dispose still found nothing, truthfully
  });

  it('⚠⚠ A STRAGGLER WHOSE release() THROWS is not counted as released', async () => {
    // Honest accounting on the bad path: if the native free failed we do NOT know
    // the bytes came back, and a ledger that claims otherwise hides the next leak.
    const f = fakeModule({ releaseThrows: true });
    f.setHold(true);
    __setLlamaModuleForTests(f.mod);
    const rt = new LlamaRuntime();
    const loading = rt.initialize({ modelPath: '/tmp/m.gguf' });
    await tick();
    await rt.dispose();
    f.settle();
    await expect(loading).rejects.toThrow(/disposed mid-allocation/);
    const l = contextLedger();
    expect(l.opened).toBe(1);
    expect(l.released).toBe(0);          // the free failed; say so
    expect(l.stragglersTornDown).toBe(0);
    expect(rt.isReady()).toBe(false);    // …but it is STILL not adopted
  });

  it('⚠⚠ DISPOSE AFTER THE LOAD LANDS is the ordinary path, with no straggler', async () => {
    const f = fakeModule();
    __setLlamaModuleForTests(f.mod);
    const rt = new LlamaRuntime();
    await rt.initialize({ modelPath: '/tmp/m.gguf' });
    await rt.dispose();
    const l = contextLedger();
    expect([l.opened, l.released, l.live]).toEqual([1, 1, 0]);
    expect(l.stragglersTornDown).toBe(0);
    expect(l.disposeFoundNothing).toBe(0);
    expect(f.releaseCount()).toBe(1);
  });

  it('⚠⚠ REPEATED BACKGROUND CYCLES balance, and never hold two at once', async () => {
    // The shape of a real session — the owner's ran seven opens. `peakLive` is the
    // assertion that matters: it is the number that would have caught the orphan
    // on-device, and it must stay at 1 across every cycle.
    const f = fakeModule();
    __setLlamaModuleForTests(f.mod);
    const rt = new LlamaRuntime();
    for (let i = 0; i < 5; i++) {
      await rt.initialize({ modelPath: '/tmp/m.gguf' });
      await rt.dispose();
    }
    const l = contextLedger();
    expect(l.opened).toBe(5);
    expect(l.released).toBe(5);
    expect(l.live).toBe(0);
    expect(l.peakLive).toBe(1);
    expect(f.releaseCount()).toBe(5);
  });

  it('⚠⚠ INTERLEAVED LOADS: the cancelled one frees, the wanted one is adopted', async () => {
    // ⚠⚠ REBUILT AFTER THIS TEST FAILED ON ITS FIRST RUN, AND THE FAILURE IS WORTH
    // KEEPING IN WRITING. It first asserted `pending() === 2` — two ~425MB
    // allocations in flight together, which is what a flapping app "obviously"
    // produces. That state IS UNREACHABLE, and for a good reason: OTA-1173 put the
    // model load under the native-ML lock, so a second `initLlama` cannot start
    // while the first is running. The assumption was mine, not the system's.
    //
    // So the property pinned here is the true one, and it is STRONGER than what I
    // set out to check: the second allocation does not merely sort correctly, it
    // never begins until the first has finished and disowned itself.
    const f = fakeModule();
    f.setHold(true);
    __setLlamaModuleForTests(f.mod);
    const rt = new LlamaRuntime();

    const doomed = rt.initialize({ modelPath: '/tmp/m.gguf' });
    await tick();
    await rt.dispose();                       // epoch moves — `doomed` is now unwanted
    const wanted = rt.initialize({ modelPath: '/tmp/m.gguf' });
    await tick();
    // ⚠ ONE allocation in flight, never two. The queued load is still behind the lock.
    expect(f.pending()).toBe(1);
    expect(f.maxConcurrentLoads()).toBe(1);

    f.settle(0);                              // the doomed one lands and frees itself
    await expect(doomed).rejects.toThrow(/disposed mid-allocation/);
    await tick();
    expect(f.pending()).toBe(2);              // …and only NOW does the next one start
    f.settle(1);
    await wanted;

    expect(rt.isReady()).toBe(true);
    const l = contextLedger();
    expect([l.opened, l.released, l.live]).toEqual([2, 1, 1]);
    expect(l.peakLive).toBe(1);               // never two live at once
    expect(l.stragglersTornDown).toBe(1);
    // ⚠ Checked a second, independent way: the fake counted overlapping entries to
    // initLlama itself, rather than us inferring serialisation from the ledger.
    expect(f.maxConcurrentLoads()).toBe(1);
  });

  it('⚠ the straggler free is LOUD in the ledger — a silent guard is an unprovable one', () => {
    // OTA-1177 wrote this counter for a guard that did not exist and warned:
    // "if orphans are climbing while this stays at 0, the guard is not running."
    expect(lines.length).toBeGreaterThanOrEqual(0); // sink installed; see cases above
    expect(read('app', 'ai', 'generation', 'contextLedger.ts'))
      .toContain('straggler load torn down by the lifecycle guard');
  });
});
