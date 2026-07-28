// OTA-864 — war-feed flavour. The board drew clashes / assaults / maulings from tiny
// pools (2 / 1 / 4 lines) so it read the same on loop. These pools are now deep and
// seeded: same seed → same line (deterministic for the sim), but the pool is wide enough
// that consecutive events vary in both verb and scenario.

import { patrolClashLine, outpostAssaultLine, patrolMaulLine } from '../app/engine/worldEvents';

describe('OTA-864 — deterministic, interpolated, varied', () => {
  it('interpolates the faction names into every line kind', () => {
    expect(patrolClashLine('Order', 'Monarchs', false, 1)).toContain('Order');
    expect(patrolClashLine('Order', 'Monarchs', false, 1)).toContain('Monarchs');
    expect(patrolClashLine('Order', 'Monarchs', false, 1)).not.toMatch(/\{[WL]\}/);
    expect(outpostAssaultLine('Order', 'Monarchs', 1)).toContain('Order');
    expect(outpostAssaultLine('Order', 'Monarchs', 1)).not.toMatch(/\{[AD]\}/);
    expect(patrolMaulLine('Order', 1)).toContain('Order');
    expect(patrolMaulLine('Order', 1)).not.toMatch(/\{F\}/);
  });

  it('is deterministic — same seed yields the same line', () => {
    expect(patrolClashLine('A', 'B', false, 42)).toBe(patrolClashLine('A', 'B', false, 42));
    expect(outpostAssaultLine('A', 'B', 42)).toBe(outpostAssaultLine('A', 'B', 42));
    expect(patrolMaulLine('A', 42)).toBe(patrolMaulLine('A', 42));
  });

  it('a friction clash appends a grudge tail; a plain one does not', () => {
    const grudge = patrolClashLine('A', 'B', true, 5);
    const plain = patrolClashLine('A', 'B', false, 5);
    expect(grudge.length).toBeGreaterThan(plain.length);
    expect(grudge.startsWith(plain)).toBe(true);
  });

  it('the pools are deep — many distinct lines across seeds (not a 2/1/4 loop)', () => {
    const clash = new Set(Array.from({ length: 60 }, (_, s) => patrolClashLine('A', 'B', false, s)));
    const assault = new Set(Array.from({ length: 60 }, (_, s) => outpostAssaultLine('A', 'B', s)));
    const maul = new Set(Array.from({ length: 60 }, (_, s) => patrolMaulLine('A', s)));
    expect(clash.size).toBeGreaterThanOrEqual(10);
    expect(assault.size).toBeGreaterThanOrEqual(8);
    expect(maul.size).toBeGreaterThanOrEqual(10);
  });
});
