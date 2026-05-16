import { extractAmbientNouns, matchAmbientNoun } from '../app/engine/ambientNouns';

describe('extractAmbientNouns — adjective + participle filtering', () => {
  it('drops common adjectives that used to leak through', () => {
    const out = extractAmbientNouns(
      'A vast ancient hall, dark and deep, with bright Aetheric pulses.',
    );
    // None of the adjectives should make it through.
    expect(out).not.toContain('vast');
    expect(out).not.toContain('ancient');
    expect(out).not.toContain('dark');
    expect(out).not.toContain('deep');
    expect(out).not.toContain('bright');
    // ...but a real noun like 'hall' or 'pulses' should survive.
    expect(out.some((n) => n === 'hall' || n === 'pulses')).toBe(true);
  });

  it('drops participles ending in -ed and -ing', () => {
    const out = extractAmbientNouns(
      'Buried towers stand humming with charged Aetheric currents flowing through cracked stone.',
    );
    expect(out).not.toContain('buried');
    expect(out).not.toContain('humming');
    expect(out).not.toContain('charged');
    expect(out).not.toContain('flowing');
    expect(out).not.toContain('cracked');
    // Real nouns survive
    expect(out).toContain('towers');
    expect(out).toContain('currents');
    expect(out).toContain('stone');
  });

  it('preserves multi-word phrases that start with a participle', () => {
    // "buried cities" lives in MULTI_WORD_PHRASES so it's added in the first
    // pass before the single-word participle filter runs.
    const out = extractAmbientNouns('The buried cities lie quiet beneath the silt.');
    expect(out).toContain('buried cities');
    // The standalone token 'buried' is still filtered.
    expect(out).not.toContain('buried');
  });

  it('keeps the canonical allowlist of short tokens', () => {
    const out = extractAmbientNouns('Cold mud underfoot. Aether thick in the air. Stone everywhere.');
    expect(out).toContain('mud');
    expect(out).toContain('aether');
    expect(out).toContain('air');
    expect(out).toContain('stone');
  });

  it('still strips adverbs (-ly suffix)', () => {
    const out = extractAmbientNouns('Quietly, the Aetheric pulse beats steadily.');
    expect(out).not.toContain('quietly');
    expect(out).not.toContain('steadily');
  });

  it('returns an empty list for an empty or missing description', () => {
    expect(extractAmbientNouns(undefined)).toEqual([]);
    expect(extractAmbientNouns('')).toEqual([]);
  });
});

describe('matchAmbientNoun — still works against the cleaner pool', () => {
  it('matches a direct noun the extractor kept', () => {
    const nouns = extractAmbientNouns('Cold mud underfoot.');
    expect(matchAmbientNoun('the mud', nouns)).toBe('mud');
  });

  it('does not match a target that maps only to a filtered adjective', () => {
    const nouns = extractAmbientNouns('A vast ancient hall, dark and deep.');
    // "vast" and "ancient" were filtered out — searching for them should miss.
    expect(matchAmbientNoun('the vast', nouns)).toBeNull();
    expect(matchAmbientNoun('the ancient', nouns)).toBeNull();
  });
});
