/* ⚠⚠⚠ THE REPORT SAID +1198MB. THE SESSION HELD ABOUT +100MB.
 *
 * The native memory flight recorder's headline read
 *
 *     Footprint: baseline 68MB · peak 1690MB · last 1266MB · high water 1877MB
 *     Shape: RATCHET — retained +1198MB vs baseline · recovery 26% · ratchet 6 step(s) +1816MB
 *
 * on the 2026-09-20 iPhone SE capture (OTA-1854, the first boot after an OTA
 * apply). Nothing was wrong with the native samples. Two things were wrong with
 * how TypeScript READ them, and they are independent:
 *
 *  ⚠ 1. THE BASELINE WAS THE MEDIAN OF THE FIRST EIGHT SAMPLES, and on that
 *       capture all eight were pre-hydration or mid-boot:
 *
 *           29 · 39 · 50 · 68 · 29 · 216 · 790 · 904 MB   → median 68MB
 *
 *       The first five were taken before the JS bundle had been evaluated —
 *       81k malloc blocks against 1.98M a moment later. A median protects
 *       against ONE bad member; it cannot rescue a window where every member
 *       is wrong. §3.7 of ota1823 was written for exactly this hazard and
 *       passed, because its synthetic ramp settles by its fourth sample.
 *
 *  ⚠ 2. THE SAMPLE STREAM IS NOT ONE OBSERVATION. The recorder samples in
 *       bursts and restarts its own `t` each time. That capture held THREE
 *       epochs — 5 samples, then 46, then 426 — with unobserved gaps across
 *       which the footprint moved hundreds of megabytes. `last − first` across
 *       that is not a measurement of retention; it spans time nobody watched.
 *       The same crossing made the step detector print `STEP 4: +46.1s → +0.8s`,
 *       an interval that runs backwards because its two ends came off two
 *       different clocks.
 *
 * ⚠⚠ AND THE `ratchet … +1816MB` FIGURE WAS NEVER RETENTION. It sums upward
 * trough movements and never subtracts a downward one, so it is how far the
 * floor TRAVELLED up. Printed immediately after "retained +1198MB" it read as a
 * second, larger retention number for a session whose floor ended roughly
 * 100MB above where it started.
 *
 * ⚠ WHAT THIS SUITE IS NOT. It does not fix, explain or narrow #174. The
 * underlying question — what native resource holds the footprint that does not
 * come back — is untouched by anything here. This repairs the TRUTHFULNESS AND
 * COMPARABILITY of the report that has to answer it. A forensic instrument that
 * overstates by an order of magnitude spends the next investigation's time on a
 * number that was never there.
 *
 * ⚠ AND IT PROVES BEHAVIOUR, NOT SPELLING. Every case below drives the real
 * `deriveMemoryFacts` / `detectRatchetSteps` / `memoryFlightSummary` over a
 * constructed series and reads what comes back. */

import {
  deriveMemoryFacts,
  detectRatchetSteps,
  memoryFlightSummary,
  sampleEpochStarts,
  BASELINE_WINDOW,
  BASELINE_STABLE_SPREAD_MB,
  RATCHET_FLOOR_WINDOW,
  RATCHET_STABLE_SAMPLES,
  type MemoryFlightReport,
} from '../app/diagnostics/nativeMemoryRecorder';

const MB = 1024 * 1024;

/** One sample. `t` is the recorder's own clock, which RESTARTS per epoch. */
function sample(tSec: number, footprintMb: number, seq = tSec) {
  return {
    seq,
    t: tSec * 1000,
    footprint: footprintMb * MB,
    resident: footprintMb * MB,
    residentPeak: footprintMb * MB,
    available: 500 * MB,
    mallocInUse: 0,
    mallocAllocated: 0,
    mallocBlocks: 0,
    phase: 1,
    thermal: 0,
    flags: 0,
  };
}

/** A single-epoch trace: one sample a second, clock strictly increasing. */
const trace = (mbs: number[]) => mbs.map((mb, i) => sample(i, mb));

/** Repeat a value, so a series can be given enough samples to be judged. */
const hold = (mb: number, n: number) => Array.from({ length: n }, () => mb);

/** Two epochs joined the way the recorder joins them: the clock goes back. */
function twoEpochs(first: number[], second: number[]) {
  const a = first.map((mb, i) => sample(i, mb, i));
  const b = second.map((mb, i) => sample(i, mb, first.length + i));
  return [...a, ...b];
}

const report = (over: Partial<MemoryFlightReport>): MemoryFlightReport => ({
  available: true,
  facts: deriveMemoryFacts(over.samples ?? []),
  samples: [],
  events: [],
  health: {},
  previousLife: null,
  metricKit: null,
  ...over,
});

// ─────────────────────────────────────────────────────────────────────────────
describe('§A the stream is a list of epochs, and only the last one ends where `last` does', () => {
  it('A1 a monotonic clock is ONE epoch — the ordinary case is not disturbed', () => {
    expect(sampleEpochStarts(trace([100, 200, 300, 400]))).toEqual([0]);
  });

  it('A2 a clock that goes backwards opens a new epoch', () => {
    // ⚠ This is the recorder telling us it stopped watching and started over.
    expect(sampleEpochStarts(twoEpochs([100, 200], [900, 950, 980]))).toEqual([0, 2]);
  });

  it('A3 empty and malformed input answer without throwing', () => {
    expect(sampleEpochStarts([])).toEqual([]);
    expect(() => sampleEpochStarts(undefined as never)).not.toThrow();
  });

  it('A4 the analysis window is the FINAL epoch, and the facts say where it began', () => {
    const f = deriveMemoryFacts(twoEpochs(hold(100, 10), hold(900, 14)));
    expect(f.epochs).toBe(2);
    expect(f.analysisFromIndex).toBe(10);
    expect(f.baselineMb).toBe(900);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('§B the two questions, kept apart', () => {
  it('B1 the earliest sample survives as EVIDENCE and is never the baseline', () => {
    // ⚠ THE SUCCESS CRITERION, stated as a test. A cold-start capture must stay
    // diagnostically useful: "what was the earliest process footprint" has an
    // answer, and it is not the same answer as "how much stayed elevated".
    const f = deriveMemoryFacts(twoEpochs([29, 39, 50, 68, 29], hold(1200, 20)));
    expect(f.processStartMb).toBe(29);
    expect(f.baselineMb).toBe(1200);
    expect(f.baselineMb).not.toBe(f.processStartMb);
  });

  it('B2 the report prints both, and labels the first as evidence', () => {
    const rows = twoEpochs([29, 39, 50, 68, 29], hold(1200, 20));
    const s = memoryFlightSummary(report({ samples: rows }));
    expect(s).toContain('Process start: 29MB');
    expect(s).toMatch(/EVIDENCE, not a baseline/);
    expect(s).toContain('analysis baseline 1200MB');
    // …and it says the stream was discontinuous, because that is why the two
    // numbers may not be subtracted from one another.
    expect(s).toMatch(/2 observation epochs/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('§C the seven cases a baseline rule has to survive', () => {
  it('C1 NORMAL MID-SESSION 950 → 1500 → 1200 still reads the way it always did', () => {
    // The existing useful semantics must not be collateral damage.
    const f = deriveMemoryFacts(trace([
      ...hold(950, 10), 1100, 1300, 1500, 1500, 1400, 1300, ...hold(1200, 6),
    ]));
    expect(f.epochs).toBe(1);
    expect(f.baselineKnown).toBe(true);
    expect(f.baselineMb).toBe(950);
    expect(f.peakMb).toBe(1500);
    expect(f.lastMb).toBe(1200);
    expect(f.retainedDeltaMb).toBe(250);
    expect(f.recoveryFraction).toBeCloseTo((1500 - 1200) / (1500 - 950), 2);
  });

  it('C2 COLD START 50 → 200 → 1100 → 1600 → 1200 is NOT +1150MB of gameplay retention', () => {
    /* ⚠⚠ THE CASE THE DEVICE PRODUCED. A process that opens at 50MB and climbs
     * through an order of magnitude was never AT 50MB during gameplay, so
     * nothing about gameplay may be measured from there. The ramp is rejected
     * as a baseline window; the settled tail is accepted. */
    const f = deriveMemoryFacts(trace([
      50, 60, 70, 200, 400, 800, 1100, 1400, 1600, 1550,
      ...hold(1200, 12),
    ]));
    expect(f.processStartMb).toBe(50);
    expect(f.baselineMb).toBe(1200);
    expect(f.retainedDeltaMb).toBe(0);
    // The old rule would have taken the median of [50,60,70,200,400,800,1100,1400].
    expect(f.retainedDeltaMb).toBeLessThan(1150);
  });

  it('C3 TRUE RATCHET 1000 → 1500 → 1400 → 1800 → 1700 still shows an elevated floor', () => {
    // ⚠ THE ONE THAT MUST NOT BE SOFTENED. A repair that made every session
    // look calm would be worse than the defect it replaced.
    const f = deriveMemoryFacts(trace([
      ...hold(1000, 10), 1200, 1500, 1450, ...hold(1400, 4),
      1600, 1800, 1750, ...hold(1700, 6),
    ]));
    expect(f.baselineMb).toBe(1000);
    expect(f.retainedDeltaMb).toBe(700);
    expect(f.recoveryFraction).toBeLessThan(0.5);
  });

  it('C4 FULL RECOVERY 1000 → 1600 → 1000 is not called permanently retained', () => {
    const f = deriveMemoryFacts(trace([
      ...hold(1000, 10), 1300, 1600, 1600, 1300, ...hold(1000, 10),
    ]));
    expect(f.retainedDeltaMb).toBe(0);
    expect(f.recoveryFraction).toBe(1);
    expect(f.shape).toBe('spike-recovered');
  });

  it('C5 MULTIPLE TRANSIENTS 1000 → 1500 → 1050 → 1600 → 1020 does not imply ~1GB remains', () => {
    /* ⚠ THE `+1816MB` SHAPE, IN MINIATURE. Two excursions that both came back.
     * The retained figure is what matters and it is tiny; whatever the floor-
     * travel sum says, the REPORT may not let it be read as memory still held. */
    const rows = trace([
      ...hold(1000, 10), 1300, 1500, 1400, ...hold(1050, 6),
      1350, 1600, 1500, ...hold(1020, 8),
    ]);
    const f = deriveMemoryFacts(rows);
    expect(f.retainedDeltaMb).toBeLessThanOrEqual(50);
    const s = memoryFlightSummary(report({ samples: rows }));
    if (f.ratchetSteps > 0) {
      expect(s).toContain('travelled');
      expect(s).toContain('NOT memory still held');
      expect(s).not.toMatch(/retained \+\d+MB vs analysis baseline · recovery \d+% · ratchet/);
    }
  });

  it('C6 MULTI-BURST / CLOCK RESET never prints a backwards interval', () => {
    /* ⚠⚠ `STEP 4: +46.1s → +0.8s` ON THE DEVICE — a rise that BEGAN late in one
     * epoch and settled early in the next, so its two ends came off two clocks
     * and printed backwards. The shape has to be built deliberately: a first
     * epoch that ends WHILE STILL CLIMBING, and a second that opens already
     * settled at the higher level.
     *
     * ⚠ THE FIRST DRAFT OF THIS TEST DID NOT DO THAT — it put a flat epoch
     * before the rise, so the detected step began after the boundary and stayed
     * forwards even with the epoch slice removed. The negative control caught
     * it staying green, which is the only reason this trace is the right one.
     * A test that cannot fail was never protecting the invariant. */
    const rows = twoEpochs(
      // ends mid-climb, late in its own clock
      [...hold(1000, RATCHET_FLOOR_WINDOW + 4), 1150, 1300, 1450],
      // opens settled higher, and is long enough to hold a step of its own
      [...hold(1500, RATCHET_FLOOR_WINDOW + 2), 1650, 1800, ...hold(1900, 12)],
    );
    const s = memoryFlightSummary(report({ samples: rows }));
    const intervals = [...s.matchAll(/STEP \d+:\s*\+([0-9.]+)s → \s*\+([0-9.]+)s/g)];
    expect(intervals.length).toBeGreaterThan(0);
    for (const m of intervals) {
      expect(Number(m[2])).toBeGreaterThanOrEqual(Number(m[1]));
    }
    // …and every step the detector reports comes from the final epoch only.
    const epochs = sampleEpochStarts(rows);
    const steps = detectRatchetSteps(rows.slice(epochs[epochs.length - 1]!));
    for (const st of steps) expect(st.tSettledMs).toBeGreaterThanOrEqual(st.tStartMs);
  });

  it('C7 NO DEFENSIBLE BASELINE reports uncertainty instead of fabricating precision', () => {
    /* A series that never holds still: every window is a ramp. The honest
     * answer is that retention cannot be calculated, and the report has to say
     * so rather than print a zero that reads as "nothing was retained". */
    const climbing = Array.from({ length: 30 }, (_, i) => 100 + i * 120);
    const f = deriveMemoryFacts(trace(climbing));
    expect(f.baselineKnown).toBe(false);
    expect(f.shape).toBe('unknown');
    const s = memoryFlightSummary(report({ samples: trace(climbing) }));
    expect(s).toContain('ANALYSIS BASELINE UNAVAILABLE');
    expect(s).toContain('NOT a clean reading');
    // ⚠ and it must not print a retained figure it cannot stand behind.
    expect(s).not.toMatch(/retained [+-]?\d+MB vs analysis baseline/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('§D the stability rule is robust, and says why', () => {
  it('D1 a single outlier still cannot move the baseline — the median is kept', () => {
    // ⚠ ota1823 §3.8 in this suite's own terms. A max−min stability test would
    // be defeated by exactly the outlier the median exists to absorb, so the
    // spread is measured robustly (p75 − p25) instead.
    const f = deriveMemoryFacts(trace([400, 400, 400, 1800, 400, 400, 400, 400, 400, 400]));
    expect(f.baselineKnown).toBe(true);
    expect(f.baselineMb).toBe(400);
  });

  it('D2 a window spanning hundreds of MB is rejected; a settled one is taken', () => {
    const spread = deriveMemoryFacts(trace([
      ...[100, 300, 500, 700, 900, 1100, 1300, 1500],
      ...hold(1500, 12),
    ]));
    expect(spread.baselineMb).toBe(1500);
    // And the tolerance is not so tight that ordinary jitter is rejected.
    const jitter = Array.from({ length: 20 }, (_, i) => 1000 + (i % 4) * 10);
    expect(deriveMemoryFacts(trace(jitter)).baselineKnown).toBe(true);
  });

  it('D3 the constants are declared, not buried', () => {
    expect(BASELINE_WINDOW).toBe(8);
    expect(BASELINE_STABLE_SPREAD_MB).toBeGreaterThan(29);
    // ⚠ Above the worse of the two raw peak-to-peak jitter figures (61MB) the
    // OTA-1853 note already measured inside a single stable floor, so a settled
    // window is never rejected. Sourced from a measurement, not chosen to make
    // one capture read nicely.
    expect(BASELINE_STABLE_SPREAD_MB).toBeGreaterThanOrEqual(61);
  });

  it('D4 a short epoch keeps the old median rather than being declared unavailable', () => {
    // Below BASELINE_WINDOW there is nothing to judge stability with, and
    // refusing to answer would regress every brief capture.
    const f = deriveMemoryFacts(trace([400, 900, 500]));
    expect(f.baselineKnown).toBe(true);
    expect(f.n).toBe(3);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('§E the instrument still refuses to comfort anyone', () => {
  it('E1 high water stays whole-stream — narrowing it would hide a real maximum', () => {
    const f = deriveMemoryFacts(twoEpochs([100, 1900, 100], hold(1200, 14)));
    expect(f.highWaterMb).toBeGreaterThanOrEqual(1900);
    expect(f.peakMb).toBe(1200);
  });

  it('E2 an unavailable recorder is still an ABSENCE OF THE INSTRUMENT', () => {
    const s = memoryFlightSummary(report({ available: false }));
    expect(s).toContain('NOT AVAILABLE');
    expect(s).toContain('NOT a clean bill of health');
  });

  it('E3 junk in does not throw and does not invent facts', () => {
    expect(() => deriveMemoryFacts(undefined as never)).not.toThrow();
    const f = deriveMemoryFacts([]);
    expect(f.n).toBe(0);
    expect(f.baselineKnown).toBe(false);
    expect(f.processStartMb).toBe(0);
  });
});
