// OTA-868 — pitched BLOC BATTLES. When allied war-parties are near a clash they pile in and
// it becomes a coalition engagement with scaled (but conservatively capped) casualties. This
// pins the pure flavour helper; the resolution + casualty cap live in simulatePatrols.

import { blocBattleLine } from '../app/engine/worldEvents';

describe('OTA-868 — blocBattleLine', () => {
  it('interpolates both leads and the casualty count, no leftover tokens', () => {
    const line = blocBattleLine('Suppressors', 'Reclaimers', 3, 7);
    expect(line).toContain('Suppressors');
    expect(line).toContain('Reclaimers');
    expect(line).toContain('3');
    expect(line).not.toMatch(/\{[WLN]\}/);
  });
  it('is deterministic — same seed, same line', () => {
    expect(blocBattleLine('A', 'B', 2, 42)).toBe(blocBattleLine('A', 'B', 2, 42));
  });
  it('never shows zero casualties (floored at 1)', () => {
    expect(blocBattleLine('A', 'B', 0, 1)).toContain('1');
  });
  it('is a deep pool — many distinct lines across seeds', () => {
    const set = new Set(Array.from({ length: 60 }, (_, s) => blocBattleLine('A', 'B', 3, s)));
    expect(set.size).toBeGreaterThanOrEqual(8);
  });
});
