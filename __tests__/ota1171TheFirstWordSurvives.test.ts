// OTA-1171 — THE FIRST WORD SURVIVES.
//
// Owner: *"there has been a few times where the arbiter has started speaking
// and has either skipped his first word or started partway through it."*
//
// ⚠ THIS IS OTA-790'S BUG AT THE OTHER END OF THE BUFFER. That OTA widened the
// TAIL guard 8 → 40ms because "a fading fricative sits well under the 0.01
// threshold" and was being trimmed to within 8ms of the last loud sample. An
// ONSET is the same physics in reverse — and the head guard was still 8ms.
//
// The trimmer scans in from each end to the first sample above 0.01. Every
// quiet onset is walked straight past: "Welcome" opens on a /w/ glide that
// ramps from near zero, "The" on a weak voiced /ð/, and /h/ /s/ /f/ are breath
// before they are sound. With only 8ms handed back, the word began mid-vowel —
// or the consonant vanished entirely and it sounded like a skipped word.
const SRC: string = require('fs').readFileSync(
  require('path').join(__dirname, '..', 'app', 'voice', 'PiperTTSManager.ts'), 'utf8');

/** The trimmer is module-private, so re-implement its arithmetic exactly as
 *  the shipped source states it and assert on THAT. The constants are pinned
 *  against the source separately below, so the model can't drift from the code
 *  without one of these two failing. */
const SAMPLE_RATE = 24000;
const THRESHOLD = 0.01;
const GUARD_LEAD_S = 0.045;
const MAX_TRIM_S = 0.2;

function headKept(samples: Float32Array): number {
  const n = samples.length;
  let first = 0;
  while (first < n && Math.abs(samples[first]!) < THRESHOLD) first++;
  const guardLead = Math.floor(SAMPLE_RATE * GUARD_LEAD_S);
  const maxTrim = Math.floor(SAMPLE_RATE * MAX_TRIM_S);
  const start = Math.min(Math.max(0, first - guardLead), maxTrim);
  return first - start; // samples of pre-onset audio retained
}

/** A word that opens on a soft consonant: `rampMs` of sub-threshold breath or
 *  glide, then the vowel. This is "Welcome", "The", "So", "Halem". */
function softOnset(rampMs: number, leadSilenceMs = 120): Float32Array {
  const ms = (x: number) => Math.floor((SAMPLE_RATE * x) / 1000);
  const out = new Float32Array(ms(leadSilenceMs) + ms(rampMs) + ms(300));
  let i = ms(leadSilenceMs);
  // The onset: real signal, but under the 0.01 "sound" threshold.
  for (let k = 0; k < ms(rampMs); k++) out[i++] = 0.004;
  for (let k = 0; k < ms(300); k++) out[i++] = 0.4; // the vowel
  return out;
}

describe('OTA-1171 — a soft onset is no longer trimmed away', () => {
  it('⚠ THE BUG: a 30ms /w/ or /ð/ onset was cut down to 8ms', () => {
    const OLD_GUARD_MS = 8;
    const oldKept = Math.floor((SAMPLE_RATE * OLD_GUARD_MS) / 1000);
    const onsetSamples = Math.floor((SAMPLE_RATE * 30) / 1000);
    // Under the old guard, 30ms of onset kept only 8ms — the rest was gone,
    // which is the "started partway through the word" the owner heard.
    expect(oldKept).toBeLessThan(onsetSamples);
    // Now the whole onset survives.
    expect(headKept(softOnset(30))).toBeGreaterThanOrEqual(onsetSamples);
  });

  it('onsets up to the new guard survive intact', () => {
    for (const rampMs of [5, 10, 20, 30, 40, 45]) {
      const onsetSamples = Math.floor((SAMPLE_RATE * rampMs) / 1000);
      expect(headKept(softOnset(rampMs))).toBeGreaterThanOrEqual(onsetSamples);
    }
  });

  it('a hard onset (no quiet ramp) is unaffected — no new latency', () => {
    // A plosive starts loud; there is nothing to protect, so the guard just
    // keeps a little of Kokoro's own leading silence, which the hardware ramp
    // wants anyway.
    const ms = (x: number) => Math.floor((SAMPLE_RATE * x) / 1000);
    const buf = new Float32Array(ms(120) + ms(300));
    for (let k = ms(120); k < buf.length; k++) buf[k] = 0.4;
    expect(headKept(buf)).toBe(Math.floor(SAMPLE_RATE * GUARD_LEAD_S));
  });

  it('the 200ms per-end trim cap still bounds it', () => {
    // A long silent lead is still trimmed — the guard widens what is KEPT
    // before the onset, it does not disable trimming.
    const ms = (x: number) => Math.floor((SAMPLE_RATE * x) / 1000);
    const buf = new Float32Array(ms(2000) + ms(300));
    for (let k = ms(2000); k < buf.length; k++) buf[k] = 0.4;
    const first = ms(2000);
    const start = Math.min(Math.max(0, first - Math.floor(SAMPLE_RATE * GUARD_LEAD_S)),
      Math.floor(SAMPLE_RATE * MAX_TRIM_S));
    expect(start).toBe(Math.floor(SAMPLE_RATE * MAX_TRIM_S));
  });
});

describe('OTA-1171 — the constants are what the source says', () => {
  it('the head guard is 45ms', () => {
    expect(SRC).toContain('const guardLead = Math.floor(sampleRate * 0.045);');
  });

  it('⚠ and it is now WIDER than the tail guard OTA-790 fixed', () => {
    // Onsets run longer than decays: aspiration and frication precede voicing.
    expect(SRC).toContain('const guardTail = Math.floor(sampleRate * 0.04);');
    expect(GUARD_LEAD_S).toBeGreaterThan(0.04);
  });

  it('the reason is recorded against the owner\'s report', () => {
    // (the quote wraps across comment lines — anchor on the contiguous half)
    expect(SRC).toContain('skipped his first');
    expect(SRC).toContain("OTA-790's bug at the other end");
  });

  it('the trim cap and threshold are unchanged', () => {
    expect(SRC).toContain('const THRESHOLD = 0.01;');
    expect(SRC).toContain('const maxTrim = Math.floor(sampleRate * 0.2);');
  });
});
