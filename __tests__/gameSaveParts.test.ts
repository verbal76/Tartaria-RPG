// engine_Dev — size-based N-part whole-game save: split a too-big bundle into as many parts as
// needed (each under the per-part size ceiling), recombine in any order, reject mixed saves.

import {
  buildSaveParts, isGameSavePart, addSavePart, fileStamp, estimatePartCount,
} from '../app/engine/gameSaveParts';

// A ~120 KB bundle string → must split into several parts under a small test ceiling.
const BIG = JSON.stringify({ tables: { weapons: Array.from({ length: 4000 }, (_, i) => ({ id: i, name: `Item ${i}`, dmg: '1d6' })) } });

function reassemble(parts: { __gameSavePart: number; chunk: string }[]): string {
  return [...parts].sort((a, b) => a.__gameSavePart - b.__gameSavePart).map((p) => p.chunk).join('');
}

describe('gameSaveParts — size-based N-part split + knit', () => {
  it('splits into multiple parts each at/under the ceiling, losslessly', () => {
    const parts = buildSaveParts(BIG, 'id1', 'stamp', 5000);
    expect(parts.length).toBeGreaterThan(2);
    for (const p of parts) {
      expect(JSON.stringify(p).length).toBeLessThanOrEqual(5000);
      expect(p.__of).toBe(parts.length);
    }
    expect(reassemble(parts)).toBe(BIG);
  });

  it('small text stays a single part', () => {
    const parts = buildSaveParts('{"a":1}', 'id', 'stamp', 45000);
    expect(parts.length).toBe(1);
    expect(parts[0]!.__of).toBe(1);
  });

  it('addSavePart reassembles regardless of upload order', () => {
    const parts = buildSaveParts(BIG, 'id1', 'stamp', 5000);
    const shuffled = [...parts].reverse();
    let collected: ReturnType<typeof buildSaveParts> = [];
    let done = '';
    for (const p of shuffled) {
      const r = addSavePart(collected, p);
      collected = r.parts;
      if (r.kind === 'complete') done = r.text;
    }
    expect(done).toBe(BIG);
  });

  it('reports what is still needed mid-collection', () => {
    const parts = buildSaveParts(BIG, 'id1', 'stamp', 5000);
    const r = addSavePart([], parts[0]!);
    expect(r.kind).toBe('need-more');
    if (r.kind === 'need-more') {
      expect(r.have).toEqual([1]);
      expect(r.need).toContain(2);
      expect(r.of).toBe(parts.length);
    }
  });

  it('a part from a DIFFERENT save resets the collection (no cross-save mixing)', () => {
    const a = buildSaveParts(BIG, 'saveA', 's', 5000);
    const b = buildSaveParts(BIG, 'saveB', 's', 5000);
    const r1 = addSavePart([], a[0]!);
    const r2 = addSavePart(r1.parts, b[1]!); // different saveId
    expect(r2.kind).toBe('reset');
    if (r2.kind === 'reset') expect(r2.parts).toEqual([b[1]]);
  });

  it('re-uploading the same part doesn\'t duplicate it', () => {
    const parts = buildSaveParts(BIG, 'id', 's', 5000);
    const r1 = addSavePart([], parts[0]!);
    const r2 = addSavePart(r1.parts, parts[0]!);
    expect(r2.parts.length).toBe(1);
  });

  it('isGameSavePart recognizes a part and rejects a plain bundle', () => {
    const parts = buildSaveParts(BIG, 'id', 's', 5000);
    expect(isGameSavePart(parts[0])).toBe(true);
    expect(isGameSavePart({ tables: {} })).toBe(false);
  });

  it('estimatePartCount: 1 when it fits, ≥2 when over', () => {
    expect(estimatePartCount(1000, 45000)).toBe(1);
    expect(estimatePartCount(200000, 45000)).toBeGreaterThanOrEqual(2);
  });

  it('fileStamp formats a filesystem-safe YYYY-MM-DD-HHMM', () => {
    expect(fileStamp(new Date(2026, 5, 24, 14, 3))).toBe('2026-06-24-1403');
  });
});
