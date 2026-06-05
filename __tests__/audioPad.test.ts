// arb65 — regression test for the Arbiter voice clipping the start/end of
// utterances ("Choose your character" → "aracter"). After trimSilenceLeadTrail
// strips Kokoro's leading silence pad, expo-av's AudioTrack warm-up swallows
// the first phonemes. padSilence re-adds a CONTROLLED silent lead/tail so the
// warm-up eats zeros, not speech. These assert the pad's exact shape so the
// fix can't silently regress.

import { padSilence } from '../app/voice/audioPad';

describe('padSilence — silent lead/tail guard against AudioTrack warm-up clipping', () => {
  const SR = 22050; // Kokoro output rate

  it('grows the buffer by exactly lead + tail samples', () => {
    const speech = new Float32Array(1000).fill(0.5);
    const out = padSilence(speech, SR, 220, 90);
    const lead = Math.floor((SR * 220) / 1000); // 4851
    const tail = Math.floor((SR * 90) / 1000); //  1984
    expect(out.length).toBe(lead + speech.length + tail);
  });

  it('the lead is pure silence and the original speech survives intact', () => {
    const speech = new Float32Array([0.1, -0.2, 0.3, -0.4]);
    const out = padSilence(speech, SR, 220, 90);
    const lead = Math.floor((SR * 220) / 1000);
    // every lead sample is exactly zero
    for (let i = 0; i < lead; i++) expect(out[i]).toBe(0);
    // the speech is copied verbatim, in order, right after the lead
    expect(Array.from(out.subarray(lead, lead + speech.length))).toEqual(
      Array.from(speech),
    );
  });

  it('the tail is pure silence', () => {
    const speech = new Float32Array(64).fill(0.9);
    const out = padSilence(speech, SR, 220, 90);
    const tail = Math.floor((SR * 90) / 1000);
    for (let i = out.length - tail; i < out.length; i++) expect(out[i]).toBe(0);
  });

  it('does not mutate the input buffer', () => {
    const speech = new Float32Array([0.1, 0.2, 0.3]);
    const copy = Float32Array.from(speech);
    padSilence(speech, SR, 220, 90);
    expect(Array.from(speech)).toEqual(Array.from(copy));
  });

  it('returns the SAME instance when both pads round to zero samples', () => {
    const speech = new Float32Array([0.1, 0.2]);
    // 0ms both sides → no work, identity return (keeps inter-batch joins tight)
    expect(padSilence(speech, SR, 0, 0)).toBe(speech);
  });

  it('clamps negative pad requests to zero rather than throwing', () => {
    const speech = new Float32Array([0.5]);
    const out = padSilence(speech, SR, -50, -50);
    // both clamp to 0 → identity
    expect(out).toBe(speech);
  });

  it('a lead-only pad still preserves and appends nothing past the speech', () => {
    const speech = new Float32Array([0.7, 0.8]);
    const out = padSilence(speech, SR, 220, 0);
    const lead = Math.floor((SR * 220) / 1000);
    expect(out.length).toBe(lead + speech.length);
    expect(out[out.length - 1]).toBeCloseTo(0.8, 5);
  });
});
