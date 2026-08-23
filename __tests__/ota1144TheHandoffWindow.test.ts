import { blockAt } from '../test-utils/srcBlock';
// OTA-1144 — THE HANDOFF WINDOW.
//
// Owner, from the device on the very next load after 1166 shipped:
// "reintroduced llm lag." The log:
//
//   [:25.994] arbiter  "Welcome back, Verbal. …"          ← text on screen
//   [:29.722] qwen⏱   item_synthesis preempted 3565ms  in 328t→out 0t
//   [:30.714] voice⏱  gap 4720ms (wait 3604ms + synth 849ms, live)
//
// ⚠ WHAT IT IS NOT. It is not OTA-1143: that load was ~90 minutes after the
// last, so neither the ≥6h while-away beat nor the ≥4h offline recap armed —
// the one greeting is exactly what 1166 promises, and the pre-1166 code would
// have printed the same single line. Nothing in 1166 touches the LLM or TTS.
//
// ⚠ WHAT IT IS. Two independent holes, and OTA-1134 closed neither for this
// shape of job:
//
//   1. THE JOB STARTED AFTER THE LINE WAS QUEUED, in the window where drain()
//      awaits the voice model and a durable crash breadcrumb before it ever
//      calls runExclusiveNativeMl. Priority is powerless there — at the moment
//      pumpMl chose, the voice simply was not in the pending set.
//   2. `out 0t` — THE PREEMPT COULD NOT LAND. stopCompletion() is polled in
//      llama.cpp's decode loop, and this job never reached decode: all 3565 ms
//      was prefill of a 328-token prompt. The hook fired (the outcome IS filed
//      as `preempted`) and it saved ~40 ms of a ~3.6 s wait. Compare the
//      pre-1157 log quoted in LlamaRuntime: wait 3940 ms behind a 3847 ms
//      synthesis. Interruption only ever covered the decode half.
//
// So a voice line that needs synthesis now RESERVES the lock the moment it is
// accepted for speech, and work below voice defers until it arrives or the
// deadline passes. Bounded by construction: a deadline, an explicit release,
// and no reservation at all for a banked line that never takes the lock.
import {
  runExclusiveNativeMl,
  reserveVoiceSlot,
  releaseVoiceSlot,
  _clearVoiceReservation,
  _mlLockState,
  ML_PRIORITY_VOICE,
  ML_PRIORITY_LLM,
  ML_PRIORITY_HOMEWORK,
  VOICE_RESERVATION_MS,
} from '../app/ai/nativeMlLock';

const tick = () => new Promise((r) => setTimeout(r, 0));
const after = (ms: number) => new Promise((r) => setTimeout(r, ms));

afterEach(() => { _clearVoiceReservation(); });

describe('OTA-1144 — the reservation holds the slot', () => {
  it('THE BUG: an LLM job that asks AFTER the line is queued no longer starts first', async () => {
    // Exactly the device ordering: the greeting is accepted for speech, and
    // ~160 ms later — while drain() is still awaiting the model — an item
    // synthesis asks for the lock.
    const order: string[] = [];
    reserveVoiceSlot();
    void runExclusiveNativeMl(async () => { order.push('llm'); }, ML_PRIORITY_LLM);
    await tick();
    // Pre-fix this read ['llm'] — the synthesis had the lock and the voice
    // waited out its whole uninterruptible prefill.
    expect(order).toEqual([]);
    // Now the voice arrives, as it did at :26.2 in the log.
    await runExclusiveNativeMl(async () => { order.push('voice'); }, ML_PRIORITY_VOICE);
    releaseVoiceSlot();
    await tick();
    expect(order).toEqual(['voice', 'llm']);
  });

  it('the LLM still runs — the reservation defers it, it does not drop it', async () => {
    reserveVoiceSlot();
    const done = runExclusiveNativeMl(async () => 'llm-result', ML_PRIORITY_LLM);
    releaseVoiceSlot();
    await expect(done).resolves.toBe('llm-result');
  });

  it('a reservation nobody claims expires, so the LLM can never be starved', async () => {
    // The failsafe that makes this safe to ship: if the line is dropped by the
    // stale sweep, or the voice model never loads, the slot frees itself.
    reserveVoiceSlot(60);
    const order: string[] = [];
    const done = runExclusiveNativeMl(async () => { order.push('llm'); }, ML_PRIORITY_LLM);
    await tick();
    expect(order).toEqual([]);
    await after(90);
    await done;
    expect(order).toEqual(['llm']);
  });

  it('homework defers too — it already yields to everything', async () => {
    reserveVoiceSlot();
    const order: string[] = [];
    void runExclusiveNativeMl(async () => { order.push('hw'); }, ML_PRIORITY_HOMEWORK);
    await tick();
    expect(order).toEqual([]);
    releaseVoiceSlot();
    await tick();
    expect(order).toEqual(['hw']);
  });

  it('a voice op is never held by a reservation — it IS the thing being waited for', async () => {
    reserveVoiceSlot();
    const order: string[] = [];
    await runExclusiveNativeMl(async () => { order.push('voice'); }, ML_PRIORITY_VOICE);
    expect(order).toEqual(['voice']);
  });

  it('release is immediate — the LLM waits the real handoff, not the whole deadline', async () => {
    reserveVoiceSlot(); // 1200 ms deadline
    const t0 = Date.now();
    reserveVoiceSlot();
    const done = runExclusiveNativeMl(async () => Date.now() - t0, ML_PRIORITY_LLM);
    await after(20);
    releaseVoiceSlot();
    const waited = await done;
    expect(waited).toBeLessThan(VOICE_RESERVATION_MS);
  });

  it('⚠ EXCLUSIVITY IS UNTOUCHED — still exactly one native op at a time', async () => {
    // The arb159 crash guarantee. Deferring a START must never overlap two ops.
    let concurrent = 0;
    let peak = 0;
    reserveVoiceSlot(30);
    const body = async () => {
      concurrent += 1;
      peak = Math.max(peak, concurrent);
      await after(5);
      concurrent -= 1;
    };
    await Promise.all([
      runExclusiveNativeMl(body, ML_PRIORITY_LLM),
      runExclusiveNativeMl(body, ML_PRIORITY_VOICE),
      runExclusiveNativeMl(body, ML_PRIORITY_HOMEWORK),
      runExclusiveNativeMl(body, ML_PRIORITY_LLM),
    ]);
    expect(peak).toBe(1);
  });

  it('a failing deferred op still frees the chain', async () => {
    reserveVoiceSlot(20);
    const boom = runExclusiveNativeMl(async () => { throw new Error('native blew up'); }, ML_PRIORITY_LLM);
    await expect(boom).rejects.toThrow('native blew up');
    await expect(runExclusiveNativeMl(async () => 'after', ML_PRIORITY_LLM)).resolves.toBe('after');
  });

  it('the state probe reports the reservation', () => {
    expect(_mlLockState().voiceReserved).toBe(false);
    reserveVoiceSlot();
    expect(_mlLockState().voiceReserved).toBe(true);
    releaseVoiceSlot();
    expect(_mlLockState().voiceReserved).toBe(false);
  });
});

describe('OTA-1144 — only lines that need the lock reserve it', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const TTS: string = require('fs').readFileSync(
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('path').join(__dirname, '..', 'app', 'voice', 'PiperTTSManager.ts'), 'utf8');

  it('the reserve is gated on a chunk actually needing synthesis', () => {
    // ⚠ A banked (OTA-1130 pre-synthesised) line plays straight from memory and
    // never takes the lock. Reserving for it would stall the LLM for nothing —
    // and the bank is the mechanism that makes the voice land WITH the text, so
    // making it cost narration time would defeat both fixes at once.
    expect(TTS).toContain('if (!banked) needsSynth = true;');
    expect(TTS).toContain('if (needsSynth) reserveVoiceSlot();');
  });

  it('the reserve happens at enqueue, BEFORE drain awaits the model', () => {
    const reserveAt = TTS.indexOf('if (needsSynth) reserveVoiceSlot();');
    const drainAt = TTS.indexOf('void drain();', reserveAt);
    expect(reserveAt).toBeGreaterThan(0);
    expect(drainAt).toBeGreaterThan(reserveAt);
  });

  it('the slot is released once the audio is in hand, on every path', () => {
    // Banked, prefetched, or freshly synthesised — all three converge on the
    // line above `synthMs`, so one release covers them.
    expect(TTS).toContain('releaseVoiceSlot();\n    const synthMs =');
  });

  it('a drained queue drops the reservation instead of waiting out the deadline', () => {
    const emptyAt = TTS.indexOf('// Nothing left to speak');
    expect(emptyAt).toBeGreaterThan(0);
    expect(blockAt(TTS, '// Nothing left to speak')).toContain('releaseVoiceSlot();');
  });
});
