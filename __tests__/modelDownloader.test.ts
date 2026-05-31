import { allocateProgress } from '../app/ai/ota/ModelDownloader';

describe('allocateProgress', () => {
  it('passes through unchanged when only model is needed', () => {
    expect(allocateProgress('model', 0, true, false)).toBe(0);
    expect(allocateProgress('model', 0.5, true, false)).toBe(0.5);
    expect(allocateProgress('model', 1, true, false)).toBe(1);
  });

  it('passes through unchanged when only vocab is needed', () => {
    expect(allocateProgress('vocab', 0, false, true)).toBe(0);
    expect(allocateProgress('vocab', 0.5, false, true)).toBe(0.5);
    expect(allocateProgress('vocab', 1, false, true)).toBe(1);
  });

  it('scales model progress into the first 95% when both are needed', () => {
    expect(allocateProgress('model', 0, true, true)).toBeCloseTo(0, 5);
    expect(allocateProgress('model', 0.5, true, true)).toBeCloseTo(0.475, 5);
    expect(allocateProgress('model', 1, true, true)).toBeCloseTo(0.95, 5);
  });

  it('scales vocab progress into the last 5% when both are needed', () => {
    expect(allocateProgress('vocab', 0, true, true)).toBeCloseTo(0.95, 5);
    expect(allocateProgress('vocab', 0.5, true, true)).toBeCloseTo(0.975, 5);
    expect(allocateProgress('vocab', 1, true, true)).toBeCloseTo(1, 5);
  });

  it('clamps fractions outside [0,1]', () => {
    expect(allocateProgress('model', -0.5, true, false)).toBe(0);
    expect(allocateProgress('model', 1.5, true, false)).toBe(1);
    expect(allocateProgress('vocab', -1, true, true)).toBeCloseTo(0.95, 5);
    expect(allocateProgress('vocab', 2, true, true)).toBeCloseTo(1, 5);
  });
});
