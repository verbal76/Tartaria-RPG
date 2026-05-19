import {
  voiceForSpeaker,
  ARBITER_DEFAULT_VOICE,
  __TEST_ONLY__,
} from '../app/voice/speakerVoices';

describe('voiceForSpeaker', () => {
  it('returns null for "the Arbiter" — caller falls back to setting', () => {
    expect(voiceForSpeaker('the Arbiter')).toBeNull();
    expect(voiceForSpeaker('Arbiter')).toBeNull();
    expect(voiceForSpeaker('THE ARBITER')).toBeNull();
  });

  it('returns null on empty / whitespace', () => {
    expect(voiceForSpeaker('')).toBeNull();
  });

  it('resolves authored vendor names to their assigned voice', () => {
    // Irma Ironhand → af_sarah per the vendors.json assignment
    expect(voiceForSpeaker('Irma Ironhand')).toBe('af_sarah');
    // Halem the Trader → am_adam
    expect(voiceForSpeaker('Halem the Trader')).toBe('am_adam');
    // Naha → af_river
    expect(voiceForSpeaker('Naha')).toBe('af_river');
  });

  it('resolves first-word stem when arbiter line dropped the epithet', () => {
    // "Halem" alone (without "the Trader") → same voice as full name
    expect(voiceForSpeaker('Halem')).toBe('am_adam');
    // "Jorah" alone → bm_daniel
    expect(voiceForSpeaker('Jorah')).toBe('bm_daniel');
  });

  it('is case-insensitive', () => {
    expect(voiceForSpeaker('IRMA IRONHAND')).toBe('af_sarah');
    expect(voiceForSpeaker('irma ironhand')).toBe('af_sarah');
  });

  it('hash-picks a stable voice for unknown speakers', () => {
    // Same input always produces the same output
    const first = voiceForSpeaker('Random Wanderer');
    const second = voiceForSpeaker('Random Wanderer');
    expect(first).not.toBeNull();
    expect(first).toBe(second);
    // The result is from one of the known pools (not am_michael —
    // reserved for the arbiter)
    const allPoolVoices = [
      ...__TEST_ONLY__.FEMALE_POOL,
      ...__TEST_ONLY__.MALE_POOL,
    ];
    expect(allPoolVoices).toContain(first);
    expect(first).not.toBe(ARBITER_DEFAULT_VOICE);
  });

  it('hash distribution favours female pool 70/30 (more voices = more variety)', () => {
    // Sanity sample — over 50 random names, female pool should dominate
    const names = Array.from({ length: 50 }, (_, i) => `unknown_npc_${i}`);
    const counts = { female: 0, male: 0 };
    for (const n of names) {
      const v = voiceForSpeaker(n);
      if (!v) continue;
      if (__TEST_ONLY__.FEMALE_POOL.includes(v)) counts.female++;
      else if (__TEST_ONLY__.MALE_POOL.includes(v)) counts.male++;
    }
    expect(counts.female).toBeGreaterThan(counts.male);
  });

  it('all 24 authored vendors are loaded in the lookup', () => {
    expect(__TEST_ONLY__.NAME_TO_VOICE.size).toBeGreaterThanOrEqual(24);
  });
});
