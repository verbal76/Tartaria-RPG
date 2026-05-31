import { levenshtein } from '../app/engine/editDistance';

describe('levenshtein', () => {
  it('returns 0 for identical strings', () => {
    expect(levenshtein('aetheric', 'aetheric')).toBe(0);
  });

  it('returns length when one side is empty', () => {
    expect(levenshtein('', 'torch')).toBe(5);
    expect(levenshtein('torch', '')).toBe(5);
  });

  it('counts a single substitution', () => {
    expect(levenshtein('rod', 'rid')).toBe(1);
  });

  it('counts a single insertion', () => {
    expect(levenshtein('aetheric', 'aetherics')).toBe(1);
  });

  it('counts a single deletion (missing r in aetheric)', () => {
    expect(levenshtein('aetheric', 'aethetic')).toBe(1);
  });

  it('handles multi-edit cases', () => {
    expect(levenshtein('kitten', 'sitting')).toBe(3);
  });
});
