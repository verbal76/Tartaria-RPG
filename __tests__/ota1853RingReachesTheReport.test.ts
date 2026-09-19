/* ⚠⚠⚠ OTA-1853 — THE RING REACHES THE REPORT, AND THE STEPS HAVE TIMES.
 *
 * Baker #3's 2026-09-19 iPhone SE capture measured a memory ratchet — baseline
 * 951MB, peak 1903MB, seven steps, +972MB gross, +675MB retained — and could
 * not attribute a single step to a subsystem. The forensic pass returned
 * OUTCOME C, holder not proven, and named two reasons:
 *
 *   1. THE COMPOSER THREW THE EVIDENCE AWAY. The recorder took 504 samples
 *      into a 512-slot ring with `evicted 0` — every sample survived on the
 *      device — and `slice(-48)` emitted the last forty-eight. All seven steps
 *      happened before that window opened.
 *   2. THE VOCABULARY WAS BLIND TO THE SUSPECTS. The 49-second window that
 *      carried every step contained thirteen room transitions and seven
 *      `roster=new` events, and MEM_KIND had no kind for rooms, artwork or
 *      rosters — only for Qwen, MiniLM, voice, touches and persistence.
 *
 * This suite pins both repairs, and pins the detector that turns the emitted
 * series into dated steps. It is diagnostics only: nothing here asserts a
 * memory behaviour, and nothing the file under test does frees, disposes or
 * reschedules anything.
 */

import {
  MEM_KIND, memCodeForId, memKindName,
  REPORT_SAMPLE_ROWS, REPORT_EVENT_ROWS,
  RATCHET_FLOOR_WINDOW, RATCHET_JITTER_MB, RATCHET_RISE_MB, RATCHET_STABLE_SAMPLES,
  detectRatchetSteps, eventsForStep,
  deriveMemoryFacts, memoryFlightSummary,
} from '../app/diagnostics/nativeMemoryRecorder';

const MB = 1024 * 1024;

/** A deterministic sample. No clock, no randomness — §16 forbids both. */
function sample(i: number, footprintMb: number, opts?: { flags?: number }) {
  return {
    seq: i, t: i * 1000,
    footprint: footprintMb * MB, resident: (footprintMb - 400) * MB, residentPeak: footprintMb * MB,
    available: 500 * MB, mallocInUse: (footprintMb - 27) * MB, mallocAllocated: footprintMb * MB,
    mallocBlocks: 4_400_000 + i,
    phase: 1, thermal: 0, flags: opts?.flags ?? 0,
  };
}

/** A flat floor with the real capture's jitter shape laid over it. */
function flat(n: number, floorMb: number, startSeq = 0) {
  const jitter = [0, 21, 0, 0, 29, 0, 10, 0, 0, 17];
  return Array.from({ length: n }, (_, k) => sample(startSeq + k, floorMb + jitter[k % jitter.length]!));
}

/* ══════════════════════════════════════════════════════════════════════════ */
describe('OTA-1853 §A — the whole ring reaches the report', () => {
  test('A1 the row budget is the ring capacity, not a tail', () => {
    expect(REPORT_SAMPLE_ROWS).toBe(512);
    expect(REPORT_EVENT_ROWS).toBe(64);
  });

  /* ⚠ THE REGRESSION THAT COST A CAPTURE. 48 was the old cutoff; a series
   * longer than that must now reach rows older than it. */
  test('A2 a 504-sample series emits rows older than the old 48-row cutoff', () => {
    const series = flat(504, 951);
    const emitted = series.slice(-REPORT_SAMPLE_ROWS);
    expect(emitted.length).toBe(504);
    expect(emitted[0]!.seq).toBe(0);
    expect(emitted[504 - 49]!.seq).toBe(455); // inside the old blind zone
  });

  test('A3 a full 512-sample ring emits 512 rows', () => {
    expect(flat(512, 951).slice(-REPORT_SAMPLE_ROWS).length).toBe(512);
  });

  test('A4 order is chronological and there are no duplicates', () => {
    const emitted = flat(504, 951).slice(-REPORT_SAMPLE_ROWS);
    const seqs = emitted.map((s) => s.seq);
    expect(seqs).toEqual([...seqs].sort((a, b) => a - b));
    expect(new Set(seqs).size).toBe(seqs.length);
  });

  test('A5 nothing is truncated below ring capacity', () => {
    for (const n of [1, 47, 48, 49, 200, 511, 512]) {
      expect(flat(n, 951).slice(-REPORT_SAMPLE_ROWS).length).toBe(n);
    }
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */
describe('OTA-1853 §B — the blind subsystems have a vocabulary', () => {
  /* ⚠ These three are the whole reason the capture could not attribute. */
  test.each([
    ['ROOM_ENTER'], ['ROOM_EXIT'], ['ROUTE_MOUNT'], ['ROUTE_UNMOUNT'],
    ['ARTWORK_MOUNT'], ['ARTWORK_UNMOUNT'], ['ARTWORK_REPLACE'],
    ['ROSTER_CREATE'], ['ROSTER_DISPOSE'], ['SCENE_CREATE'], ['SCENE_DISPOSE'],
    ['AUDIO_PLAYER_CREATE'], ['AUDIO_PLAYER_DISPOSE'], ['SPEECH_QUEUE_ADD'],
  ])('B1 %s exists and names itself', (name) => {
    const code = (MEM_KIND as Record<string, number>)[name];
    expect(typeof code).toBe('number');
    expect(memKindName(code!)).toBe(name);
  });

  /* ⚠ Native owns 60000+. A JS kind colliding with it would silently rename a
   * native event in every future report. */
  test('B2 every JS kind stays below the native floor and is unique', () => {
    const codes = Object.values(MEM_KIND);
    for (const c of codes) expect(c).toBeLessThan(60000);
    expect(new Set(codes).size).toBe(codes.length);
  });

  test('B3 an unknown kind renders safely rather than throwing', () => {
    expect(memKindName(31337)).toBe('kind:31337');
    expect(memKindName(-1)).toBe('kind:-1');
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */
describe('OTA-1853 §C — the id code is a bounded checksum, not a map', () => {
  test('C1 stable, pure and inside 16 bits', () => {
    const a = memCodeForId('outpost_relic_vault');
    expect(memCodeForId('outpost_relic_vault')).toBe(a);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThanOrEqual(0xffff);
  });

  test('C2 different rooms generally separate', () => {
    const ids = ['outpost_gate', 'outpost_chapel', 'outpost_messhall', 'outpost_central',
      'outpost_relic_vault', 'outpost_workshop', 'outpost_lab', 'buried_landing_one',
      'buried_landing_two', 'buried_pumps', 'monarch_waystation'];
    expect(new Set(ids.map(memCodeForId)).size).toBe(ids.length);
  });

  /* ⚠ BOUNDEDNESS IS THE POINT. A diagnostic that learns a new key per room
   * for the lifetime of a session becomes the holder it was installed to find. */
  test('C3 it holds no state — 5,000 distinct ids add nothing', () => {
    for (let i = 0; i < 5000; i++) memCodeForId(`room_${i}`);
    expect(memCodeForId('outpost_gate')).toBe(memCodeForId('outpost_gate'));
  });

  test('C4 junk input is safe', () => {
    for (const v of ['', '   ', undefined as unknown as string, null as unknown as string]) {
      const c = memCodeForId(v);
      expect(Number.isFinite(c)).toBe(true);
      expect(c).toBeLessThanOrEqual(0xffff);
    }
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */
describe('OTA-1853 §D — report-time ratchet detection', () => {
  test('D1 thresholds are the measured ones', () => {
    expect(RATCHET_FLOOR_WINDOW).toBe(10);
    expect(RATCHET_JITTER_MB).toBe(12);
    expect(RATCHET_RISE_MB).toBe(48);
    expect(RATCHET_STABLE_SAMPLES).toBe(8);
  });

  /* ⚠ THE FALSE-POSITIVE FLOOR. Measured on the real SE series: raw jitter ran
   * to 61 MB peak-to-peak inside ONE stable floor. A detector that fires on
   * that would report seven steps in a session that had none. */
  test('D2 a flat floor with the capture\'s own 29MB jitter yields no steps', () => {
    expect(detectRatchetSteps(flat(200, 951))).toEqual([]);
  });

  test('D3 a sustained rise is found, dated and measured', () => {
    const series = [...flat(40, 951), ...flat(60, 951 + 140, 40)];
    const steps = detectRatchetSteps(series);
    expect(steps.length).toBe(1);
    expect(steps[0]!.step).toBe(1);
    expect(steps[0]!.beforeFloorMb).toBe(951);
    expect(steps[0]!.retainedDeltaMb).toBeGreaterThanOrEqual(RATCHET_RISE_MB);
    expect(steps[0]!.tStartMs).toBeGreaterThan(0);
    expect(steps[0]!.firstRisingSeq).toBeGreaterThanOrEqual(40);
  });

  /* ⚠ THE OTHER HALF, AND WITHOUT IT D3 WOULD PASS ON A DETECTOR THAT CALLED
   * EVERY BUMP A STEP. A spike that recovers establishes no new floor. */
  test('D4 a transient spike that recovers is NOT a step', () => {
    const series = [...flat(40, 951), ...flat(3, 951 + 300, 40), ...flat(60, 951, 43)];
    expect(detectRatchetSteps(series)).toEqual([]);
  });

  test('D5 several retained steps are found and numbered in order', () => {
    const series = [
      ...flat(30, 900), ...flat(30, 1000, 30), ...flat(30, 1120, 60), ...flat(40, 1260, 90),
    ];
    const steps = detectRatchetSteps(series);
    expect(steps.length).toBeGreaterThanOrEqual(3);
    expect(steps.map((s) => s.step)).toEqual(steps.map((_, i) => i + 1));
    for (let i = 1; i < steps.length; i++) {
      expect(steps[i]!.firstRisingIndex).toBeGreaterThan(steps[i - 1]!.settledIndex);
      expect(steps[i]!.beforeFloorMb).toBeGreaterThanOrEqual(steps[i - 1]!.newFloorMb - RATCHET_JITTER_MB);
    }
  });

  /* ⚠ THE ONE SAMPLE THE LAST CAPTURE COUNTED AND THEN DISCARDED. The header
   * said "1 sample taken while JS had gone quiet" and the row was not in the
   * printed window, so nobody could say which transition it belonged to. */
  test('D6 a JS-STALE sample inside a step survives into the step record', () => {
    const rise = flat(60, 951 + 140, 40);
    rise[2] = sample(42, 951 + 140, { flags: 2 });
    const steps = detectRatchetSteps([...flat(40, 951), ...rise]);
    expect(steps.length).toBe(1);
    expect(steps[0]!.jsStale).toBe(true);
  });

  test('D7 a step with no stale sample reports jsStale false', () => {
    const steps = detectRatchetSteps([...flat(40, 951), ...flat(60, 951 + 140, 40)]);
    expect(steps[0]!.jsStale).toBe(false);
  });

  /* ⚠ THE STEP MUST BE DATED WHERE IT STARTED. The first version measured the
   * settle floor with the 10-sample trailing window, which reached back THROUGH
   * the rise, rejected the real candidate and re-found the same step nine
   * samples later — ~2.25 s at device cadence, which is the whole event-join
   * window. The rise here begins at index 40 and must be reported there. */
  test('D6b the step is dated at the first rising sample, not after the lookback', () => {
    const steps = detectRatchetSteps([...flat(40, 951), ...flat(60, 951 + 140, 40)]);
    expect(steps[0]!.firstRisingIndex).toBe(40);
    expect(steps[0]!.firstRisingSeq).toBe(40);
  });

  /* ⚠ PROVE OR LEAVE OPEN. A rise caught in the last few samples has no settle
   * evidence behind it — it may be a spike the capture happened to end on. */
  test('D6c a rise with no room left to settle is not claimed as a step', () => {
    expect(detectRatchetSteps([...flat(40, 951), ...flat(4, 951 + 300, 40)])).toEqual([]);
  });

  test('D8 short, empty and malformed series are safe', () => {
    expect(detectRatchetSteps([])).toEqual([]);
    expect(detectRatchetSteps(flat(5, 951))).toEqual([]);
    expect(detectRatchetSteps(undefined as unknown as [])).toEqual([]);
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */
describe('OTA-1853 §E — the event→sample join uses the key that already exists', () => {
  const ev = (seq: number, sampleSeq: number, kind: number, code = 0) =>
    ({ seq, t: sampleSeq * 1000, footprint: 0, sampleSeq, kind, code, phase: 1 });

  test('E1 events inside a step are attributed to it by sampleSeq alone', () => {
    const steps = detectRatchetSteps([...flat(40, 951), ...flat(60, 951 + 140, 40)]);
    const step = steps[0]!;
    const events = [
      ev(1, 5, MEM_KIND.ROOM_ENTER, memCodeForId('outpost_gate')),
      ev(2, step.firstRisingSeq, MEM_KIND.ROOM_ENTER, memCodeForId('outpost_relic_vault')),
      ev(3, step.firstRisingSeq + 1, MEM_KIND.ROSTER_CREATE, 7),
      ev(4, step.settledSeq + 50, MEM_KIND.ROOM_EXIT, 0),
    ];
    const got = eventsForStep(step, events);
    expect(got.map((e) => e.seq)).toEqual([2, 3]);
  });

  /* The lead window is what makes "what happened immediately BEFORE the rise"
   * answerable rather than only "what happened during it". */
  test('E2 the lead window reaches events just before the first rising sample', () => {
    const steps = detectRatchetSteps([...flat(40, 951), ...flat(60, 951 + 140, 40)]);
    const step = steps[0]!;
    const just = ev(9, step.firstRisingSeq - 2, MEM_KIND.ROOM_ENTER, 1);
    expect(eventsForStep(step, [just], 4).map((e) => e.seq)).toEqual([9]);
    expect(eventsForStep(step, [just], 0)).toEqual([]);
  });

  test('E3 an empty or absent event list is safe', () => {
    const steps = detectRatchetSteps([...flat(40, 951), ...flat(60, 951 + 140, 40)]);
    expect(eventsForStep(steps[0]!, [])).toEqual([]);
    expect(eventsForStep(steps[0]!, undefined as unknown as [])).toEqual([]);
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */
describe('OTA-1853 §F — the instrument stays bounded', () => {
  /* ⚠ THE SELF-CONTAMINATION RULE. An instrument installed to find a ~1 GB
   * holder must not become one. The detector returns a fixed-shape record per
   * step and holds no sample objects. */
  test('F1 the detector retains no input objects in its output', () => {
    const series = [...flat(40, 951), ...flat(60, 951 + 140, 40)];
    const steps = detectRatchetSteps(series);
    for (const s of steps) {
      for (const v of Object.values(s)) {
        expect(['number', 'boolean']).toContain(typeof v);
      }
    }
  });

  test('F2 a full 512-sample series yields a small, bounded step list', () => {
    const steps = detectRatchetSteps(flat(512, 951));
    expect(Array.isArray(steps)).toBe(true);
    expect(steps.length).toBeLessThanOrEqual(512 / RATCHET_STABLE_SAMPLES);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 * §H — THE REPORT DOES THE JOIN, NOT THE READER.
 *
 * The last capture had the samples and the events in the same document and the
 * forensic pass still returned OUTCOME C, because reading a step out of 504 raw
 * rows and hand-matching events to it is not something anyone does on a phone
 * at 20:02 local. These drive the real composer end to end.
 * ══════════════════════════════════════════════════════════════════════════ */
describe('OTA-1853 §H — the composed report carries the joined table', () => {
  const ev = (seq: number, sampleSeq: number, kind: number, code = 0) =>
    ({ seq, t: sampleSeq * 1000, footprint: 1_000 * MB, sampleSeq, kind, code, phase: 1 });

  /** A whole report around a supplied series and event list. */
  function reportOf(samples: ReturnType<typeof flat>, events: ReturnType<typeof ev>[]) {
    return {
      available: true,
      facts: deriveMemoryFacts(samples),
      samples, events,
      health: {}, previousLife: null, metricKit: null,
    };
  }

  /** The capture's own shape: a flat floor, then a step that keeps its gain. */
  const RATCHET_SERIES = [...flat(40, 951), ...flat(60, 951 + 140, 40)];

  test('H1 a retained step is printed with its times, floors and recovery', () => {
    const text = memoryFlightSummary(reportOf(RATCHET_SERIES, []));
    expect(text).toContain('Retained steps: 1');
    expect(text).toContain('STEP 1:');
    expect(text).toContain('floor 951 → 1091MB (+140 retained)');
  });

  test('H2 a flat session says so rather than inventing a step', () => {
    const text = memoryFlightSummary(reportOf(flat(200, 951), []));
    expect(text).toContain('Retained steps: none detected');
    expect(text).not.toContain('STEP 1:');
  });

  /* ⚠ THE THIRTEEN CROSSINGS, COUNTED. The capture's own shape: many events of
   * one kind inside one step. They must read as a tally, not as thirteen lines
   * that push the next step off the screen. */
  test('H3 events inside a step are tallied by kind and the codes survive', () => {
    const steps = detectRatchetSteps(RATCHET_SERIES);
    const base = steps[0]!.firstRisingSeq;
    const events = [
      // ⚠ Several land on the SAME sample — on device the sampler runs at
      // 250 ms and a player crosses more rooms than that in a burst, so the
      // join must not assume one event per sample.
      ...Array.from({ length: 13 }, (_, i) =>
        ev(i, base + (i % 9), MEM_KIND.ROOM_ENTER, memCodeForId(`room_${i}`))),
      ev(50, base + 2, MEM_KIND.ROSTER_CREATE, 7),
    ];
    const text = memoryFlightSummary(reportOf(RATCHET_SERIES, events));
    expect(text).toContain('ROOM_ENTER×13');
    expect(text).toContain('ROSTER_CREATE×1');
    expect(text).toContain(`ROOM_ENTER/${memCodeForId('room_0')}`);
    // Only the first six are printed in full; the rest are counted, not listed.
    expect(text).toContain('more inside this step');
  });

  /* ⚠ THE HONEST ANSWER WHEN THERE IS NONE. A step with no annotated events
   * must say that the subsystem does not report — not fall silent, which reads
   * as "nothing happened" and is how a blind spot becomes a clean bill. */
  test('H4 a step with no events says the subsystem did not report', () => {
    const text = memoryFlightSummary(reportOf(RATCHET_SERIES, []));
    expect(text).toContain('no annotated events inside this step');
  });

  /* ⚠ EVIDENCE, NOT A VERDICT. Co-location in time is all this table proves,
   * and the words that would overstate it are absent by design. */
  test('H5 the joined section never uses holder, cause or leak', () => {
    const steps = detectRatchetSteps(RATCHET_SERIES);
    const events = [ev(1, steps[0]!.firstRisingSeq, MEM_KIND.ROOM_ENTER, 42)];
    const text = memoryFlightSummary(reportOf(RATCHET_SERIES, events));
    const joined = text.slice(text.indexOf('Retained steps:'), text.indexOf('  Events ('));
    for (const word of ['holder', 'caused', 'leak', 'culprit', 'responsible']) {
      expect(joined.toLowerCase()).not.toContain(word);
    }
  });

  /* ⚠ THE REGRESSION THAT COST A CAPTURE, END TO END. 504 samples were taken
   * with `evicted 0` and 48 were printed; every step happened before that
   * window opened. */
  test('H6 a 504-sample report prints all 504 rows, not the last 48', () => {
    const text = memoryFlightSummary(reportOf(flat(504, 951), []));
    expect(text).toContain('Samples (last 504 of 504)');
  });

  test('H7 the join never throws the report away when the series is degenerate', () => {
    for (const s of [flat(0, 951), flat(3, 951), flat(512, 951)]) {
      const text = memoryFlightSummary(reportOf(s, []));
      expect(text).toContain('Native memory flight recorder');
      expect(text).not.toContain('report composition failed');
    }
  });
});
