// engine_Dev — the player card's health tint (red→amber→green) was blended into the
// near-black card base, so the dark bled through and muddied the colour. It now rides
// on a flat WHITE base layer as a TRANSLUCENT wash (healthTintRGBA), so the colour reads
// bright/clean over white; the wash's alpha grows as HP drops (full = lighter/brighter,
// near-death = strong red). These lock that contract.

jest.mock('react-native', () => ({
  View: 'View',
  Text: 'Text',
  StyleSheet: { create: (s: unknown) => s },
}));

import { healthTintRGBA, healthTextInk } from '../app/components/StatsPanel';

const parse = (s: string): { r: number; g: number; b: number; a: number } => {
  const m = s.match(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/)!;
  return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]), a: Number(m[4]) };
};

describe('engine_Dev — white-base health tint (healthTintRGBA)', () => {
  it('is a translucent rgba wash (so the flat white base shows through)', () => {
    const full = parse(healthTintRGBA(1));
    expect(full.a).toBeGreaterThan(0);
    expect(full.a).toBeLessThan(1);
  });

  it('hue is green at full, amber at half, red at empty', () => {
    const full = parse(healthTintRGBA(1));
    expect(full.g).toBeGreaterThan(full.r); // green dominant when healthy
    expect(full.g).toBeGreaterThan(full.b);

    const half = parse(healthTintRGBA(0.5));
    expect(half.r).toBeGreaterThan(120); // amber = high red + high green
    expect(half.g).toBeGreaterThan(120);

    const empty = parse(healthTintRGBA(0));
    expect(empty.r).toBeGreaterThan(empty.g); // red dominant when dying
    expect(empty.r).toBeGreaterThan(empty.b);
  });

  it('the wash gets more opaque as HP drops (near-death red is stronger than full-HP green)', () => {
    expect(parse(healthTintRGBA(0)).a).toBeGreaterThan(parse(healthTintRGBA(1)).a);
  });

  it('clamps out-of-range fractions instead of producing garbage', () => {
    expect(healthTintRGBA(2)).toBe(healthTintRGBA(1));
    expect(healthTintRGBA(-1)).toBe(healthTintRGBA(0));
  });
});

describe('engine_Dev — HP-number ink adapts to the tint (healthTextInk)', () => {
  // The HP number rides on the health tint, so it must not be the same hue (green
  // washing out green-on-green). Dark ink on the lighter green/amber, light ink on
  // the dark near-death red.
  it('is dark on the lighter full/mid tints and light on the dark near-death tint', () => {
    expect(healthTextInk(1)).toBe('#17231f');   // full HP → dark on green
    expect(healthTextInk(0.5)).toBe('#17231f');  // half → dark on amber
    expect(healthTextInk(0)).toBe('#eef3f0');    // dead → light on dark red
  });
  it('never returns the health hue itself (no same-colour-on-same-colour wash)', () => {
    for (const f of [1, 0.75, 0.5, 0.25, 0]) {
      expect(['#17231f', '#eef3f0']).toContain(healthTextInk(f));
    }
  });
});
