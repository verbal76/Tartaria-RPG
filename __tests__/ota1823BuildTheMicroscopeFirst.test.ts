/**
 * OTA-1823 / BUILD 190 — THE NATIVE MEMORY FLIGHT RECORDER.
 *
 * ⚠⚠⚠ THIS SUITE WAS FIRST WRITTEN AS `build190…`, OUTSIDE THE OTA NUMBERING,
 * AND THAT WAS WRONG. The reasoning was that Build 190 is a NATIVE build — a
 * native module cannot travel in a JS bundle — so it should carry no OTA stamp,
 * exactly as the iOS privacy-string commit (3412edd4) carried none.
 *
 * ⚠⚠ THE PRECEDENT DOES NOT APPLY, AND THE DIFFERENCE IS ONE LINE OF ci.yml.
 * 3412edd4 published NOTHING, because every path it touched — `app.json`,
 * `__tests__/*` — sits in ci.yml's publish-ignore list. This work touches
 * `app/**`, which does not, so the push DOES dispatch the publisher and a real
 * bundle reaches Golem. A bundle that ships has to say which bundle it is, and
 * that is OTA-1482's entire finding: eleven OTAs published and applied while
 * the stamp sat at 1469 and the owner's phone read "fully up to date".
 *
 * So the JS half is OTA-1823 and the native binary is Build 190. They are two
 * halves of one change and NEITHER SUBSTITUTES FOR THE OTHER — the TS facade is
 * an inert no-op until a binary carrying the native module runs it, which is
 * exactly what §2 of this suite proves.
 *
 * ⚠⚠⚠ WHAT IS BEING TESTED, AND WHAT DELIBERATELY IS NOT.
 * The Swift cannot run here — this is a Linux container with no Xcode and no
 * simulator — so nothing below claims to have executed a Mach read. What CAN be
 * tested, and is, is everything the division of labour put in TypeScript:
 *   · the event vocabulary, which is what makes a stored integer mean something
 *   · the DERIVED SEMANTICS, which is where every judgement call lives
 *   · the report, including whether it tells the truth about its own absence
 *   · the facade's behaviour when there is no native module at all
 * Section 7 then reads the Swift as TEXT, and only for claims a reader cannot
 * make by eye: fixed capacities, and the absence of the techniques the brief
 * excluded. Those are scope ratchets, not string-matching for its own sake —
 * each one fails if a future edit reintroduces an excluded technique.
 */

import fs from 'fs';
import path from 'path';

import {
  AVAILABLE_LOW_MB,
  MEM_ELEVATED_MB,
  MEM_HIGH_MB,
  MEM_KIND,
  MEM_SEVERE_MB,
  RATCHET_MIN_STEPS,
  RATCHET_STEP_MB,
  REPORT_EVENT_ROWS,
  REPORT_SAMPLE_ROWS,
  _resetMemoryFlightCache,
  _setNativeMemoryModuleForTest,
  annotateMemory,
  beginMemoryBurst,
  cachedMemoryFlight,
  deriveMemoryFacts,
  memKindName,
  memoryFlightBlock,
  memoryFlightSummary,
  memoryHeartbeat,
  nativeMemoryAvailable,
  primeMemoryFlight,
  processMinusHermesGapMb,
  readMemoryFlight,
  startNativeMemoryRecorder,
  stopNativeMemoryRecorder,
} from '../app/diagnostics/nativeMemoryRecorder';

const MB = 1024 * 1024;

/**
 * ⚠⚠ CODE ONLY, COMMENTS REMOVED — AND THE FIRST RUN OF THIS SUITE IS WHY IT
 * EXISTS. Sections 7.9 and 8.7 forbid the locked llama knobs by name, and they
 * both failed on their first run against source that does not touch a single
 * one of them: the matches were in the ⚠ blocks PROMISING not to touch them.
 * A scope ratchet that fires on the sentence explaining the scope is worse than
 * useless — it would push the next author to delete the explanation to get the
 * suite green. So the ratchet reads code, and the prose is free to name what it
 * is refusing to do.
 */
function codeOnly(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !l.trim().startsWith('//'))
    .map((l) => l.replace(/\/\/.*$/, ''))
    .join('\n');
}

/** Build a sample row. Footprint in MB for readability; stored as bytes. */
function sample(
  tSec: number,
  footprintMb: number,
  extra: Partial<{
    residentMb: number; residentPeakMb: number; availableMb: number;
    phase: number; thermal: number; flags: number;
  }> = {},
) {
  return {
    seq: tSec,
    t: tSec * 1000,
    footprint: footprintMb * MB,
    resident: (extra.residentMb ?? footprintMb) * MB,
    residentPeak: (extra.residentPeakMb ?? footprintMb) * MB,
    available: (extra.availableMb ?? 0) * MB,
    mallocInUse: 0,
    mallocAllocated: 0,
    mallocBlocks: 0,
    phase: extra.phase ?? 1,
    thermal: extra.thermal ?? 0,
    flags: extra.flags ?? 0,
  };
}

/** A trace from a list of MB values, one sample a second. */
const trace = (mbs: number[]) => mbs.map((mb, i) => sample(i, mb));

beforeEach(() => {
  _setNativeMemoryModuleForTest(null);
  _resetMemoryFlightCache();
});

afterAll(() => {
  _setNativeMemoryModuleForTest(undefined);
  _resetMemoryFlightCache();
});

// ─────────────────────────────────────────────────────────────────────────────
describe('§1 the event vocabulary', () => {
  const values = Object.values(MEM_KIND) as number[];

  it('1.1 assigns every kind a distinct code — a collision would silently merge two facts', () => {
    expect(new Set(values).size).toBe(values.length);
  });

  it('1.2 keeps every app kind below the native 60000 range', () => {
    // Native owns 60000+ (TMEventKind). An app kind that strayed into that
    // range would be printed under a native name and misread as an OS event.
    for (const v of values) expect(v).toBeLessThan(60000);
  });

  it('1.3 keeps every kind inside the 16-bit field the native side stores', () => {
    for (const v of values) {
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(65535);
    }
  });

  it('1.4 names every app kind — no kind in the table prints as a bare number', () => {
    for (const [name, code] of Object.entries(MEM_KIND)) {
      expect(memKindName(code as number)).toBe(name);
    }
  });

  it('1.5 names the native-owned kinds too, so an OS event is never a bare number', () => {
    expect(memKindName(60002)).toBe('MEMORY_WARNING');
    expect(memKindName(60007)).toBe('WILL_TERMINATE');
    expect(memKindName(60009)).toBe('METRICKIT_PAYLOAD');
  });

  it('1.6 prints an unknown kind as kind:N rather than blank or undefined', () => {
    // ⚠ A blank here would read as "nothing happened" in a report whose whole
    // job is to distinguish that from "I do not recognise this".
    expect(memKindName(31337)).toBe('kind:31337');
  });

  it('1.7 keeps the JS memory warning separate from the native one', () => {
    // These two MUST be able to disagree: a native warning with no JS warning
    // beside it means the notification never reached the JS runtime.
    expect(MEM_KIND.JS_MEMORY_WARNING).not.toBe(60002);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('§2 absence of the native module is an ordinary state, not an error', () => {
  it('2.1 reports itself unavailable', () => {
    expect(nativeMemoryAvailable()).toBe(false);
  });

  it('2.2 every hot door is a silent no-op that cannot throw', () => {
    // ⚠ This is the property the whole facade exists for. These are called from
    // game seams — a generation settling, a finger landing — on Android, on web
    // and in every jest run, where no native module exists.
    expect(() => annotateMemory(MEM_KIND.T0_ROOT_TOUCH, 1)).not.toThrow();
    expect(() => memoryHeartbeat()).not.toThrow();
    expect(() => beginMemoryBurst(3000)).not.toThrow();
  });

  it('2.3 start and stop answer false rather than pretending', () => {
    expect(startNativeMemoryRecorder('2026-09-14-test')).toBe(false);
    expect(stopNativeMemoryRecorder()).toBe(false);
  });

  it('2.4 readMemoryFlight returns an unavailable report, not a rejected promise', async () => {
    const r = await readMemoryFlight();
    expect(r.available).toBe(false);
    expect(r.samples).toEqual([]);
    expect(r.facts.n).toBe(0);
  });

  it('2.5 the report block says ABSENCE OF THE INSTRUMENT, not a clean bill of health', () => {
    // ⚠⚠ THE LOAD-BEARING ASSERTION OF THIS SECTION. A blank or cheerful block
    // here is the exact failure this module was written to avoid: a reader
    // seeing no memory problem reported and concluding there was none, when the
    // truth is that nothing was ever measured.
    const block = memoryFlightBlock();
    expect(block).toContain('NOT AVAILABLE');
    expect(block).toContain('NOT a clean bill of health');
  });

  it('2.6 priming reports failure and leaves the cache empty', async () => {
    expect(await primeMemoryFlight()).toBe(false);
    expect(cachedMemoryFlight().report).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('§3 derived semantics — the three shapes that want different repairs', () => {
  it('3.1 an empty trace is UNKNOWN, never a reading of zero', () => {
    const f = deriveMemoryFacts([]);
    expect(f.n).toBe(0);
    expect(f.band).toBe('unknown');
    expect(f.shape).toBe('unknown');
  });

  it('3.2 a flat session reads FLAT', () => {
    const f = deriveMemoryFacts(trace([400, 401, 400, 402, 401, 400, 401, 402, 401, 400]));
    expect(f.shape).toBe('flat');
    expect(f.band).toBe('normal');
    expect(Math.abs(f.retainedDeltaMb)).toBeLessThanOrEqual(5);
  });

  it('3.3 a spike that comes back down reads SPIKE-RECOVERED', () => {
    // Up to 900, back to where it started: the allocation was real and transient.
    const f = deriveMemoryFacts(trace([
      400, 400, 400, 400, 400, 400, 400, 400,
      700, 900, 900, 700, 420, 405, 400, 400,
    ]));
    expect(f.shape).toBe('spike-recovered');
    expect(f.peakMb).toBe(900);
    expect(f.recoveryFraction).toBeGreaterThan(0.9);
  });

  it('3.4 a spike that stays up reads SPIKE-RETAINED', () => {
    const f = deriveMemoryFacts(trace([
      400, 400, 400, 400, 400, 400, 400, 400,
      700, 900, 900, 900, 890, 895, 900, 900,
    ]));
    expect(f.shape).toBe('spike-retained');
    expect(f.recoveryFraction).toBeLessThan(0.5);
    expect(f.retainedDeltaMb).toBeGreaterThan(400);
  });

  it('3.5 a session that settles higher every cycle reads RATCHET', () => {
    // ⚠⚠ THE ONE THAT MATTERS. Peaks rise whenever the app does something big,
    // which says nothing. It is the FLOOR between spikes — what the process
    // refuses to give back once the work is over — that separates "busy" from
    // "walking to its own death". Three rising troughs, each well over
    // RATCHET_STEP_MB.
    const cycle = (floor: number) => [floor, floor + 200, floor + 260, floor + 180, floor];
    const f = deriveMemoryFacts(trace([
      ...cycle(400), ...cycle(500), ...cycle(600), ...cycle(700), ...cycle(800),
    ]));
    expect(f.shape).toBe('ratchet');
    expect(f.ratchetSteps).toBeGreaterThanOrEqual(RATCHET_MIN_STEPS);
    expect(f.ratchetMb).toBeGreaterThan(0);
  });

  it('3.6 a busy session with a STABLE floor is NOT called a ratchet', () => {
    // ⚠ The counterpart to 3.5, and the reason the test walks troughs rather
    // than peaks. Big repeated spikes off an unchanging floor is a large
    // working set, not a leak, and reporting it as a ratchet would send the
    // next investigation after a leak that does not exist.
    const cycle = [400, 700, 850, 650, 400];
    const f = deriveMemoryFacts(trace([...cycle, ...cycle, ...cycle, ...cycle, ...cycle]));
    expect(f.shape).not.toBe('ratchet');
    expect(f.ratchetSteps).toBeLessThan(RATCHET_MIN_STEPS);
  });

  it('3.7 BASELINE is the settled early reading, not the first sample', () => {
    // ⚠⚠ A process opens mid-boot with the bundle still evaluating and models
    // still loading. If the FIRST sample were the baseline, this trace would
    // report a huge negative retained delta and every healthy session would
    // look like a catastrophic ratchet away from a number that never existed.
    const f = deriveMemoryFacts(trace([
      120, 300, 380, 400, 405, 402, 401, 400,
      400, 401, 400, 402, 400, 401, 400, 400,
    ]));
    expect(f.baselineMb).toBeGreaterThan(380);
    expect(f.baselineMb).not.toBe(120);
    expect(Math.abs(f.retainedDeltaMb)).toBeLessThan(20);
  });

  it('3.8 a single outlier cannot drag the baseline — it is a median, not a mean', () => {
    const f = deriveMemoryFacts(trace([400, 400, 400, 1800, 400, 400, 400, 400, 400, 400]));
    expect(f.baselineMb).toBe(400);
  });

  it('3.9 peak, last and high water are what they say', () => {
    const rows = trace([400, 900, 500]);
    // residentPeak is the kernel's own never-decreasing high water.
    rows[2] = sample(2, 500, { residentPeakMb: 1200 });
    const f = deriveMemoryFacts(rows);
    expect(f.peakMb).toBe(900);
    expect(f.lastMb).toBe(500);
    expect(f.highWaterMb).toBe(1200);
  });

  it('3.10 recovery fraction is clamped to 0..1 and is 1 when nothing climbed', () => {
    const flat = deriveMemoryFacts(trace([400, 400, 400, 400, 400]));
    expect(flat.recoveryFraction).toBe(1);
    for (const t of [trace([400, 900, 200]), trace([400, 900, 1200])]) {
      const f = deriveMemoryFacts(t);
      expect(f.recoveryFraction).toBeGreaterThanOrEqual(0);
      expect(f.recoveryFraction).toBeLessThanOrEqual(1);
    }
  });

  it('3.11 the bands land on the stated thresholds', () => {
    const bandOf = (mb: number) => deriveMemoryFacts(trace([300, 300, 300, mb])).band;
    expect(bandOf(MEM_ELEVATED_MB - 1)).toBe('normal');
    expect(bandOf(MEM_ELEVATED_MB)).toBe('elevated');
    expect(bandOf(MEM_HIGH_MB)).toBe('high');
    expect(bandOf(MEM_SEVERE_MB)).toBe('severe');
  });

  it('3.12 the thresholds are ordered, so no reading can match two bands', () => {
    expect(MEM_ELEVATED_MB).toBeLessThan(MEM_HIGH_MB);
    expect(MEM_HIGH_MB).toBeLessThan(MEM_SEVERE_MB);
  });

  it('3.13 minimum available ignores the zeros that mean "the API did not answer"', () => {
    // ⚠ Zero means unanswered, NEVER "no memory left". Treating it as a reading
    // would put a 0 MB available figure in a report as if it were measured.
    const rows = [
      sample(0, 400, { availableMb: 0 }),
      sample(1, 400, { availableMb: 800 }),
      sample(2, 400, { availableMb: 300 }),
    ];
    expect(deriveMemoryFacts(rows).minAvailableMb).toBe(300);
  });

  it('3.14 counts the samples taken while JS had gone quiet', () => {
    const JS_STALE = 2;
    const rows = [
      sample(0, 400), sample(1, 400, { flags: JS_STALE }),
      sample(2, 400, { flags: JS_STALE }), sample(3, 400),
    ];
    expect(deriveMemoryFacts(rows).jsStaleSamples).toBe(2);
  });

  it('3.15 filters rows that carry no usable footprint instead of averaging them in', () => {
    const rows = [
      sample(0, 400), { ...sample(1, 0), footprint: 0 },
      { ...sample(2, 0), footprint: Number.NaN }, sample(3, 400),
    ];
    expect(deriveMemoryFacts(rows).n).toBe(2);
  });

  it('3.16 never throws, whatever malformed rows it is handed', () => {
    // ⚠ It is called from the report path, which is exercised precisely when a
    // session has already gone wrong.
    const junk = [
      null, undefined, {}, { footprint: 'lots' }, { footprint: -1 },
      { footprint: 400 * MB, flags: null }, 42, 'x',
    ] as never;
    expect(() => deriveMemoryFacts(junk)).not.toThrow();
    expect(() => deriveMemoryFacts(undefined as never)).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('§4 the process-minus-Hermes gap', () => {
  it('4.1 is the subtraction it claims to be', () => {
    expect(processMinusHermesGapMb(1000 * MB, 60)).toBe(940);
  });

  it('4.2 is null — not zero — when Hermes did not answer', () => {
    // ⚠ A fabricated 0 would read as "no native memory", which is the single
    // most misleading thing this number could say.
    expect(processMinusHermesGapMb(1000 * MB, null)).toBeNull();
    expect(processMinusHermesGapMb(1000 * MB, Number.NaN)).toBeNull();
  });

  it('4.3 is null when there is no footprint to subtract from', () => {
    expect(processMinusHermesGapMb(0, 60)).toBeNull();
    expect(processMinusHermesGapMb(Number.NaN, 60)).toBeNull();
  });

  it('4.4 never goes negative, even if Hermes reports more than the process', () => {
    expect(processMinusHermesGapMb(50 * MB, 400)).toBe(0);
  });

  it('4.5 is documented as NOT a native heap, in the source a reader will find', () => {
    // ⚠⚠ NOT a decorative string check. The brief forbids this label by name,
    // because calling the gap a heap would send the next investigation hunting
    // for an allocator to shrink that does not exist. This is the ratchet that
    // keeps the warning attached to the function.
    const src = fs.readFileSync(
      path.join(__dirname, '..', 'app', 'diagnostics', 'nativeMemoryRecorder.ts'), 'utf8',
    );
    const fn = src.slice(src.indexOf('PROCESS-MINUS-HERMES GAP'), src.indexOf('export function processMinusHermesGapMb'));
    expect(fn).toMatch(/NEVER CALL THIS "NATIVE HEAP"/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('§5 the report tells the truth about itself', () => {
  const report = (over: Partial<Parameters<typeof memoryFlightSummary>[0]> = {}) => ({
    available: true,
    facts: deriveMemoryFacts(trace([400, 400, 400, 400, 400, 400, 400, 400, 400, 400])),
    samples: trace([400, 400, 400, 400, 400, 400, 400, 400, 400, 400]),
    events: [],
    health: {},
    previousLife: null,
    metricKit: null,
    ...over,
  }) as Parameters<typeof memoryFlightSummary>[0];

  it('5.1 labels the footprint honestly and refuses the word heap', () => {
    const s = memoryFlightSummary(report());
    expect(s).toContain('phys_footprint');
    expect(s).toContain('NOT a heap');
  });

  it('5.2 refuses to call os_proc_available_memory the Jetsam threshold', () => {
    expect(memoryFlightSummary(report())).toContain('NOT the exact Jetsam threshold');
  });

  it('5.3 states that its own bands are hypotheses, not established thresholds', () => {
    // ⚠⚠ The numbers in this report will be quoted at people. They must arrive
    // carrying their own provenance, or a reading aid becomes a fake constant.
    expect(memoryFlightSummary(report())).toContain('not established universal iPhone danger thresholds');
  });

  it('5.4 is bounded — a full ring prints the tail, not all of it', () => {
    const many = Array.from({ length: 512 }, (_, i) => sample(i, 400));
    const events = Array.from({ length: 64 }, (_, i) => ({
      seq: i, t: i * 1000, footprint: 400 * MB, sampleSeq: i,
      kind: MEM_KIND.T0_ROOT_TOUCH, code: i, phase: 1,
    }));
    const s = memoryFlightSummary(report({ samples: many, events }));
    const sampleLines = s.split('\n').filter((l) => /^\s+\+\d/.test(l));
    expect(sampleLines.length).toBeLessThanOrEqual(REPORT_SAMPLE_ROWS + REPORT_EVENT_ROWS);
    expect(s).toContain(`of ${many.length}`);
  });

  it('5.5 says a missing previous life is ABSENT, not fine', () => {
    expect(memoryFlightSummary(report({ previousLife: null }))).toContain('none on record');
  });

  it('5.6 surfaces a previous life as the trace of a process that did not come back', () => {
    const s = memoryFlightSummary(report({
      previousLife: {
        reason: 60002, footprint: 1800 * MB, observedHighWater: 1850 * MB,
        baseline: 400 * MB, uptimeMs: 420_000, memoryWarnings: 3, phase: 1,
        buildTag: '2026-09-14-1822-the-keys-read-as-keys',
      },
    }));
    expect(s).toContain('PREVIOUS LIFE');
    expect(s).toContain('MEMORY_WARNING');
    expect(s).toContain('1800MB');
    expect(s).toContain('2026-09-14-1822-the-keys-read-as-keys');
  });

  it('5.7 says an empty MetricKit is UNDELIVERED rather than healthy', () => {
    // ⚠⚠ iOS delivers MetricKit roughly once a day. On a fresh TestFlight
    // install the first payload can be a full day away, and an empty section
    // read as "no memory problem" would be flatly wrong.
    const s = memoryFlightSummary(report({ metricKit: { payloads: [] } }));
    expect(s).toContain('undelivered');
    // ⚠ The word "healthy" may appear ONLY inside the denial. An empty section
    // that read as a clean bill of health would be flatly wrong on any device
    // whose first daily payload has simply not arrived yet.
    const line = s.split('\n').find((l) => l.includes('MetricKit:')) ?? '';
    expect(line).toContain('NOT healthy');
    expect(line.replace('NOT healthy', '')).not.toContain('healthy');
  });

  it('5.8 shouts when iOS itself reports killing us for memory', () => {
    // ⚠⚠⚠ This is the ONE field that can move LIVE CLASS-H MEMORY CAUSATION off
    // UNKNOWN, and it is the OS's own accounting rather than ours.
    const s = memoryFlightSummary(report({
      metricKit: {
        payloads: [{
          peakMemoryBytes: 1_800 * MB,
          fgMemoryResourceLimitExits: 2, bgMemoryResourceLimitExits: 0,
        }],
      },
    }));
    expect(s).toContain('iOS ITSELF REPORTS KILLING US FOR MEMORY');
  });

  it('5.9 surfaces a sampler that stopped, so a flat trace is never mistaken for calm', () => {
    // ⚠⚠ A recorder that quietly stopped produces a FLAT TRACE, and a flat
    // trace reads as "memory was fine" when it means "I stopped looking".
    const s = memoryFlightSummary(report({
      health: { samplesTaken: 12, machFailures: 4, checkpointFailures: 2, started: false },
    }));
    expect(s).toContain('NOT RUNNING');
    expect(s).toContain('mach failures 4');
    expect(s).toContain('checkpoint failures 2');
  });

  it('5.10 reports a JS stall observed from outside the runtime that stalled', () => {
    const rows = [
      ...trace([400, 400, 400, 400, 400, 400, 400, 400]),
      sample(8, 400, { flags: 2 }), sample(9, 400, { flags: 2 }),
    ];
    const s = memoryFlightSummary(report({ samples: rows, facts: deriveMemoryFacts(rows) }));
    expect(s).toContain('JS had gone quiet');
  });

  it('5.11 flags a low available figure as advisory, never as a cliff', () => {
    const rows = trace([400, 400, 400, 400]).map((r, i) => (
      { ...r, available: (i === 3 ? AVAILABLE_LOW_MB - 10 : 800) * MB }
    ));
    const s = memoryFlightSummary(report({ samples: rows, facts: deriveMemoryFacts(rows) }));
    expect(s).toContain('advisory, not a cliff');
  });

  it('5.12 never throws on a malformed report', () => {
    expect(() => memoryFlightSummary(null as never)).not.toThrow();
    expect(() => memoryFlightSummary({ available: true } as never)).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('§6 the facade against a fake native module', () => {
  /** A stand-in that records what the facade asked it to do. */
  function fake(overrides: Record<string, unknown> = {}) {
    const calls: { annotate: number[][]; burst: number[]; drain: number[][] } = {
      annotate: [], burst: [], drain: [],
    };
    const m = {
      start: () => true,
      stop: () => true,
      annotate: (kind: number, code: number) => { calls.annotate.push([kind, code]); },
      heartbeat: () => undefined,
      beginBurst: (ms: number) => { calls.burst.push(ms); },
      setBuildTag: () => undefined,
      snapshot: async () => ({}),
      health: async () => ({}),
      freeze: async () => ({ sampleSeq: 100, eventSeq: 7 }),
      drain: async (s: number, e: number) => {
        calls.drain.push([s, e]);
        return {
          samples: trace([400, 400, 400, 400, 400, 400, 400, 400, 900, 900]),
          events: [], health: { samplesTaken: 10, started: true },
          startWallMs: 0, capacity: { samples: 512, events: 64 },
        };
      },
      previousLife: async () => null,
      metricKit: async () => ({ payloads: [] }),
      startMetricKit: () => true,
      ...overrides,
    };
    return { m, calls };
  }

  it('6.1 drains exactly the marks it froze — the report cannot read past them', async () => {
    // ⚠⚠ Report composition allocates and can be preempted. A reader walking a
    // LIVE ring sees rows shift underneath it and emits a trace that never
    // happened. Freeze-then-drain is what makes the report a snapshot.
    const { m, calls } = fake();
    _setNativeMemoryModuleForTest(m as never);
    await readMemoryFlight();
    expect(calls.drain).toEqual([[100, 7]]);
  });

  it('6.2 composing a report does NOT stop the recorder', async () => {
    // ⚠ The recorder keeps writing throughout; anything it records during
    // composition is simply in the next report. A report that blinded its own
    // instrument would lose the seconds most likely to matter.
    const stop = jest.fn();
    const { m } = fake({ stop });
    _setNativeMemoryModuleForTest(m as never);
    await readMemoryFlight();
    expect(stop).not.toHaveBeenCalled();
  });

  it('6.3 brackets the composition with its own annotations', async () => {
    const { m, calls } = fake();
    _setNativeMemoryModuleForTest(m as never);
    await readMemoryFlight();
    const kinds = calls.annotate.map((a) => a[0]);
    expect(kinds).toContain(MEM_KIND.REPORT_COMPOSE_START);
    expect(kinds).toContain(MEM_KIND.REPORT_COMPOSE_END);
  });

  it('6.4 clamps an out-of-range code instead of letting it wrap', async () => {
    // ⚠ `code` is 16 bits on the native side. A wrapped value would read as a
    // different, plausible fact — the worst kind of wrong number.
    const { m, calls } = fake();
    _setNativeMemoryModuleForTest(m as never);
    annotateMemory(MEM_KIND.ML_QUEUE_DEPTH, 999_999);
    annotateMemory(MEM_KIND.ML_QUEUE_DEPTH, -5);
    expect(calls.annotate.map((a) => a[1])).toEqual([65535, 0]);
  });

  it('6.5 never passes a negative burst length through', () => {
    const { m, calls } = fake();
    _setNativeMemoryModuleForTest(m as never);
    beginMemoryBurst(-1);
    expect(calls.burst).toEqual([0]);
  });

  it('6.6 a throwing native module cannot reach the caller', () => {
    const boom = () => { throw new Error('native exploded'); };
    _setNativeMemoryModuleForTest({
      ...fake().m, annotate: boom, heartbeat: boom, beginBurst: boom, start: boom, stop: boom,
    } as never);
    expect(() => annotateMemory(MEM_KIND.T0_ROOT_TOUCH, 1)).not.toThrow();
    expect(() => memoryHeartbeat()).not.toThrow();
    expect(() => beginMemoryBurst(1000)).not.toThrow();
    expect(startNativeMemoryRecorder()).toBe(false);
    expect(stopNativeMemoryRecorder()).toBe(false);
  });

  it('6.7 a rejecting drain yields an unavailable report, not a rejection', async () => {
    _setNativeMemoryModuleForTest({
      ...fake().m, drain: async () => { throw new Error('gone'); },
    } as never);
    const r = await readMemoryFlight();
    expect(r.available).toBe(false);
  });

  it('6.8 the block distinguishes "present but never read" from "absent"', async () => {
    const { m } = fake();
    _setNativeMemoryModuleForTest(m as never);
    // ⚠ THREE STATES, not two. Before priming, the recorder exists and has not
    // been read; that is not the same as no recorder, and neither is a reading.
    const before = memoryFlightBlock();
    expect(before).toContain('not yet read');
    expect(before).toContain('NOT a reading of zero');
    expect(before).not.toContain('NOT AVAILABLE');

    expect(await primeMemoryFlight()).toBe(true);
    const after = memoryFlightBlock();
    expect(after).toContain('Footprint:');
    expect(after).toContain('snapshot taken');
  });

  it('6.9 the primed block carries the snapshot age, so no figure looks live when it is not', async () => {
    const { m } = fake();
    _setNativeMemoryModuleForTest(m as never);
    await primeMemoryFlight();
    expect(memoryFlightBlock()).toMatch(/snapshot taken \d+s before this report/);
  });

  it('6.10 start passes a build tag through and subscribes MetricKit', () => {
    const setBuildTag = jest.fn();
    const startMetricKit = jest.fn(() => true);
    const { m } = fake({ setBuildTag, startMetricKit });
    _setNativeMemoryModuleForTest(m as never);
    expect(startNativeMemoryRecorder('2026-09-14-1822-the-keys-read-as-keys')).toBe(true);
    expect(setBuildTag).toHaveBeenCalledWith('2026-09-14-1822-the-keys-read-as-keys');
    expect(startMetricKit).toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('§7 the native module stays inside the architecture it was given', () => {
  const iosDir = path.join(__dirname, '..', 'modules', 'tartaria-memory', 'ios');
  const read = (f: string) => fs.readFileSync(path.join(iosDir, f), 'utf8');
  const allSwift = () => fs.readdirSync(iosDir)
    .filter((f) => f.endsWith('.swift'))
    .map((f) => read(f))
    .join('\n');

  it('7.1 ships the four Swift files the module is made of', () => {
    const files = fs.readdirSync(iosDir);
    for (const f of [
      'MemoryFlightRecorder.swift', 'MemoryCheckpointStore.swift',
      'MemoryMetricKitSubscriber.swift', 'TartariaMemoryModule.swift',
      'TartariaMemory.podspec',
    ]) expect(files).toContain(f);
  });

  it('7.2 fixes the ring capacities at compile time', () => {
    // ⚠ The recorder must never become the memory problem it was built to find.
    const src = read('MemoryFlightRecorder.swift');
    expect(src).toMatch(/let TM_SAMPLE_CAPACITY = 512\b/);
    expect(src).toMatch(/let TM_EVENT_CAPACITY = 64\b/);
  });

  it('7.3 preallocates both rings rather than growing them', () => {
    // A ring that `append`s without evicting is an unbounded buffer with a
    // reassuring name. These are filled to capacity once, at construction.
    const src = read('MemoryFlightRecorder.swift');
    expect(src).toMatch(/\[TMSample\]\(repeating: TMSample\(\), count: TM_SAMPLE_CAPACITY\)/);
    expect(src).toMatch(/\[TMEvent\]\(repeating: TMEvent\(\), count: TM_EVENT_CAPACITY\)/);
  });

  it('7.4 samples the allocator at ~1/s and never at the 100 ms burst cadence', () => {
    // ⚠⚠ malloc_zone_statistics takes the zone's lock. At 100 ms, against an
    // allocator llama is actively hammering, that is contention we would be
    // ADDING to the system under investigation.
    const src = read('MemoryFlightRecorder.swift');
    expect(src).toMatch(/let TM_MALLOC_MIN_INTERVAL_MS: UInt64 = 1_000/);
    expect(src).toMatch(/now &- lastMallocSampleMs >= TM_MALLOC_MIN_INTERVAL_MS/);
    expect(src).toMatch(/let TM_CADENCE_BURST_MS = 100/);
  });

  it('7.5 holds ONE shared burst deadline that cannot exceed the ceiling', () => {
    // Overlapping bursts EXTEND one deadline; they do not stack, and they
    // cannot hold the 100 ms cadence open forever by arriving back to back.
    const src = read('MemoryFlightRecorder.swift');
    expect(src).toMatch(/let TM_BURST_MAX_MS: UInt64 = 10_000/);
    expect(src).toMatch(/burstUntilMs = min\(max\(self\.burstUntilMs, proposed\), ceiling\)/);
  });

  it('7.6 runs on a dedicated serial utility queue', () => {
    const src = read('MemoryFlightRecorder.swift');
    expect(src).toMatch(/DispatchQueue\(\s*label: "com\.hotatticgames\.tartaria\.memory-flight-recorder",\s*qos: \.utility\s*\)/);
    expect(src).toMatch(/DispatchSource\.makeTimerSource\(queue: queue\)/);
  });

  it('7.7 does no Mach work on the annotating thread', () => {
    // ⚠⚠ THE PROPERTY THE ANNOTATION API LIVES OR DIES BY. `annotate` is called
    // from the JS thread mid-generation; it reads a clock and hands off.
    const src = read('MemoryFlightRecorder.swift');
    const fn = src.slice(
      src.indexOf('func annotate(kind: UInt16'),
      src.indexOf('func heartbeat()'),
    );
    expect(fn).toContain('queue.async');
    expect(fn).not.toContain('task_info');
    expect(fn).not.toContain('readVM()');
    expect(fn).not.toContain('malloc_zone_statistics');
  });

  it('7.8 excludes every technique the architecture ruled out', () => {
    // ⚠⚠⚠ A REAL SCOPE RATCHET. Each of these was excluded by name: all-zone
    // malloc enumeration, VM-region walking, malloc interposition or hooks,
    // stack logging, retain-cycle scanning, ObjC census, autorelease-pool
    // instrumentation, forced GC, Guard Malloc, Zombies, ASAN. This test fails
    // the moment a future edit reintroduces one, which is the point — the
    // architecture was locked, and "do not reopen it into a broad research
    // project" needs something that enforces it after this session ends.
    const src = allSwift();
    for (const forbidden of [
      'malloc_get_all_zones', 'malloc_zone_enumerate', 'malloc_logger',
      'vm_region', 'mach_vm_region', 'malloc_zone_register',
      'MallocStackLogging', 'NSZombie', 'objc_getClassList',
      'objc_autoreleasePoolPrint', 'CFGetRetainCount',
    ]) expect(src).not.toContain(forbidden);
  });

  it('7.9 touches none of the locked llama knobs', () => {
    // ⚠⚠⚠ BUILD 190 MUST MEASURE THE EXISTING LLAMA CONFIGURATION. An
    // instrument that changed the thing it measures would report on itself.
    const src = codeOnly(allSwift());
    for (const knob of [
      'n_ctx', 'n_gpu_layers', 'n_batch', 'n_ubatch', 'use_mlock',
      'n_threads', 'LlamaContext', 'llama_',
    ]) expect(src.toLowerCase()).not.toContain(knob.toLowerCase());
  });

  it('7.9b names the locked knobs in prose, so the scope claim travels with the code', () => {
    // ⚠ The counterpart to 7.9, and it is deliberately the opposite assertion.
    // 7.9 proves the knobs are absent from the CODE; this proves the promise not
    // to touch them is still written down where the next author will read it.
    // Without this, the cheapest way to pass 7.9 would be to delete the ⚠ block.
    // ⚠ Tolerates the comment leader and any line wrap, so reflowing the block
    // does not break the ratchet — only DELETING the promise does.
    expect(allSwift()).toMatch(
      /BUILD 190 MUST[\s/*]*MEASURE THE EXISTING LLAMA CONFIGURATION/,
    );
  });

  it('7.10 stores no strings, prompts or scene text in a sample or an event', () => {
    // Scalars only. A diagnostic that retains the content it is measuring is
    // both a leak and a privacy problem.
    const src = read('MemoryFlightRecorder.swift');
    const structs = src.slice(src.indexOf('struct TMSample'), src.indexOf('struct TMHealth'));
    expect(structs).not.toMatch(/:\s*String/);
    expect(structs).not.toMatch(/:\s*\[/);
    expect(structs).not.toMatch(/:\s*Any/);
  });

  it('7.11 never labels phys_footprint a heap', () => {
    const src = allSwift();
    expect(src).toMatch(/DO NOT LABEL IT "native heap"/);
    expect(src).not.toMatch(/nativeHeap|native_heap/);
  });

  it('7.12 refuses to call os_proc_available_memory the Jetsam threshold', () => {
    expect(read('MemoryFlightRecorder.swift')).toMatch(/DO NOT CALL THIS "the exact Jetsam/);
  });

  it('7.13 checksums the durable checkpoint and keeps two slots', () => {
    // ⚠⚠ The moment we are most likely to be killed is the moment we are most
    // likely to be writing. Nonsense read back as evidence is worse than none.
    const src = read('MemoryCheckpointStore.swift');
    expect(src).toContain('flight-a.tmcp');
    expect(src).toContain('flight-b.tmcp');
    expect(src).toMatch(/static func crc32/);
    expect(src).toMatch(/crc32\(body\) == crcExpected/);
    expect(src).toMatch(/body\.count == len/);
    expect(src).toMatch(/options: \[\.atomic\]/);
  });

  it('7.14 lifts the previous life before this process can overwrite a slot', () => {
    // ⚠⚠⚠ THE ORDERING THE WHOLE FEATURE DEPENDS ON. The first checkpoint this
    // process writes overwrites a slot belonging to the process that died.
    const store = read('MemoryCheckpointStore.swift');
    const recorder = read('MemoryFlightRecorder.swift');
    expect(store).toMatch(/_ = previousLife\(\)/);
    const start = recorder.slice(recorder.indexOf('func start()'), recorder.indexOf('func stop()'));
    expect(start).toMatch(/MemoryCheckpointStore\.shared\.previousLife\(\)/);
    expect(start.indexOf('previousLife()')).toBeLessThan(start.indexOf('installObserversOnMain()'));
  });

  it('7.15 writes a checkpoint at the two moments a kill is most likely', () => {
    const src = read('MemoryFlightRecorder.swift');
    expect(src).toMatch(/writeCheckpointLocked\(reason: TMEventKind\.memoryWarning\)/);
    expect(src).toMatch(/p == TM_PHASE_BACKGROUND \|\| p == TM_PHASE_TERMINATING/);
  });

  it('7.16 keeps the checkpoint bounded — a fixed field set plus at most 8 event stubs', () => {
    const src = read('MemoryFlightRecorder.swift');
    expect(src).toMatch(/let want: UInt64 = 8/);
  });

  it('7.17 treats MetricKit as supplementary and retains no diagnostic payloads', () => {
    // MXDiagnosticPayload can carry call stacks. Lifting those would be exactly
    // the unbounded shape every other line in this module refuses.
    const src = read('MemoryMetricKitSubscriber.swift');
    expect(src).toMatch(/func didReceive\(_ payloads: \[MXDiagnosticPayload\]\)/);
    const diag = src.slice(src.indexOf('func didReceive(_ payloads: [MXDiagnosticPayload])'));
    expect(diag).toMatch(/Intentionally empty/);
    expect(src).toMatch(/summaries\.count > self\.maxPayloads/);
  });

  it('7.18 registers the module under the name the facade asks for', () => {
    // If these drift, requireOptionalNativeModule returns null forever and the
    // recorder is silently absent on a device that has it compiled in.
    expect(read('TartariaMemoryModule.swift')).toMatch(/Name\("TartariaMemory"\)/);
    const cfg = JSON.parse(fs.readFileSync(
      path.join(iosDir, '..', 'expo-module.config.json'), 'utf8',
    ));
    expect(cfg.ios.modules).toContain('TartariaMemoryModule');
    const facade = fs.readFileSync(
      path.join(__dirname, '..', 'app', 'diagnostics', 'nativeMemoryRecorder.ts'), 'utf8',
    );
    expect(facade).toContain("requireOptionalNativeModule<NativeModuleShape>('TartariaMemory')");
  });

  it('7.19 exposes every door the facade calls, and no orphan on either side', () => {
    const bridge = read('TartariaMemoryModule.swift');
    for (const door of [
      'start', 'stop', 'annotate', 'heartbeat', 'beginBurst', 'setBuildTag',
      'snapshot', 'health', 'freeze', 'drain', 'previousLife', 'metricKit',
      'startMetricKit',
    ]) expect(bridge).toContain(`"${door}"`);
  });

  it('7.20 keeps the hot doors synchronous and the reading doors async', () => {
    // ⚠ A promise per annotation would put microtask traffic on the JS thread
    // at exactly the moments we are trying to measure.
    const bridge = read('TartariaMemoryModule.swift');
    for (const hot of ['annotate', 'heartbeat', 'beginBurst']) {
      expect(bridge).toMatch(new RegExp(`Function\\("${hot}"\\)`));
    }
    for (const cold of ['drain', 'freeze', 'previousLife']) {
      expect(bridge).toMatch(new RegExp(`AsyncFunction\\("${cold}"\\)`));
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('§8 the instrument is wired where it claims to be', () => {
  const app = (p: string) => fs.readFileSync(path.join(__dirname, '..', 'app', p), 'utf8');

  it('8.1 starts and stops with the runtime-pressure watch', () => {
    // ⚠ OTA-1798's finding was that instruments which start at boot and never
    // stop leave timers and observers running past teardown. Binding to the one
    // watch the app already starts AND stops inherits a proven lifecycle.
    const src = app('diagnostics/runtimePressureWatch.ts');
    expect(src).toContain('startNativeMemoryRecorder(OTA_BUILD_ID)');
    expect(src).toContain('stopNativeMemoryRecorder()');
    const stopFn = src.slice(
      src.indexOf('export function stopRuntimePressureWatch'),
      src.indexOf('export function startRuntimePressureWatch'),
    );
    expect(stopFn).toContain('stopNativeMemoryRecorder()');
  });

  it('8.2 creates NO timer of its own on the JS side', () => {
    // Everything rides the five-second tick that has run since OTA-1172.
    const src = app('diagnostics/nativeMemoryRecorder.ts');
    expect(src).not.toMatch(/setInterval|setTimeout|requestAnimationFrame/);
  });

  it('8.3 sends the JS liveness heartbeat from the existing tick', () => {
    // ⚠⚠ The measurement no JS-side instrument can make about itself: when this
    // tick stops arriving, native keeps sampling and flags those samples STALE.
    const src = app('diagnostics/runtimePressureWatch.ts');
    expect(src).toContain('memoryHeartbeat()');
    expect(src).toMatch(/primeTicks % 12 === 0/);
  });

  it('8.4 correlates ONE touch corner and no others', () => {
    // ⚠⚠ AMENDED BY OTA-1854, AND THE AMENDMENT IS THE FINDING. This pin used
    // to state "the four corners", on Build 190's reasoning that four events
    // per tap is a trace a human can read. The first hardware capture measured
    // 1685 events against a 64-slot ring, and eight of nine dated retained
    // footprint steps carried no annotation at all. Four corners is not a
    // budget this ring has. `done` — the only corner that proves the work
    // COMPLETED, and the one whose timestamp sits where retention becomes
    // measurable — keeps the slot; the other three keep the JS trace, which is
    // where their detail always was.
    //
    // ⚠ Still a table rather than a switch, so a NEW stage is silently not
    // annotated — the safe default.
    const src = app('diagnostics/touchPath.ts');
    const table = src.slice(
      src.indexOf('const NATIVE_STAGE_KIND'),
      src.indexOf('function append('),
    );
    expect(table).toContain('done: MEM_KIND.T5_DONE');
    for (const notCorrelated of [
      'root:', 'modal:', 'in:', 'enter:', 'admit:', 'reject:', 'dispatch:',
    ]) {
      expect(table).not.toContain(notCorrelated);
    }
  });

  it('8.5 annotates the two llama seams that Hermes cannot see', () => {
    const src = app('state/slices/bootSlice.ts');
    expect(src).toContain('MEM_KIND.QWEN_GEN_SETTLED');
    expect(src).toContain('MEM_KIND.QWEN_CONTEXT_INIT');
    // The burst across a context transition is what separates "allocated and
    // held" from "allocated, and the previous one was released a moment later".
    expect(src).toMatch(/beginMemoryBurst\(3_000\)/);
  });

  it('8.6 puts the block in the bug report the other instruments feed', () => {
    const src = app('diagnostics/aboutSummary.ts');
    expect(src).toContain('memoryFlightBlock()');
    expect(src).toContain("from './nativeMemoryRecorder'");
  });

  it('8.7 changes no llama configuration anywhere it was wired in', () => {
    // ⚠⚠⚠ The scope claim, made falsifiable. Build 190 is additive
    // instrumentation: every edit is an annotation, a burst request, or a
    // start/stop pair. None of them touches a model setting.
    for (const f of [
      'diagnostics/runtimePressureWatch.ts', 'diagnostics/touchPath.ts',
      'state/slices/bootSlice.ts', 'diagnostics/aboutSummary.ts',
    ]) {
      const src = codeOnly(app(f));
      for (const knob of ['n_gpu_layers', 'n_ubatch', 'use_mlock', 'n_ctx']) {
        expect(src).not.toContain(knob);
      }
    }
  });

  it('8.8 adds only annotations, bursts and a start/stop pair — nothing that steers', () => {
    // ⚠⚠ THE SCOPE CLAIM AS A PROPERTY RATHER THAN A PROMISE. Build 190 is
    // additive instrumentation. Every call it introduces into a game seam must
    // be one of five, and none of the five can change what the game does:
    // annotate, beginBurst, memoryHeartbeat, primeMemoryFlight, start/stop.
    // A future edit that reached for a disposal or a cancellation from one of
    // these seams under the Build 190 banner fails here.
    const ALLOWED = [
      'annotateMemory', 'beginMemoryBurst', 'memoryHeartbeat',
      'primeMemoryFlight', 'startNativeMemoryRecorder', 'stopNativeMemoryRecorder',
      'memoryFlightBlock', 'MEM_KIND', 'OTA_BUILD_ID',
    ];
    for (const f of [
      'diagnostics/runtimePressureWatch.ts', 'diagnostics/touchPath.ts',
      'state/slices/bootSlice.ts', 'diagnostics/aboutSummary.ts',
    ]) {
      const src = app(f);
      const imported = /import \{([^}]*)\} from '[^']*nativeMemoryRecorder'/.exec(src)?.[1] ?? '';
      expect(imported.length).toBeGreaterThan(0);
      for (const name of imported.split(',').map((s) => s.trim()).filter(Boolean)) {
        expect(ALLOWED).toContain(name);
      }
    }
  });
});
