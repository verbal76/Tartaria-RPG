// OTA-632 — the player card tints by HP fraction (green → amber → red) and the
// HP number takes a matching brighter colour, so health reads at a glance. These
// lock the gradient direction + that the card stays dark enough for cream text.

jest.mock('react-native', () => ({
  View: 'View',
  Text: 'Text',
  StyleSheet: { create: (s: unknown) => s },
  // ⚠ OTA-1229 — StatsPanel now reads STAT_ROW_MAX_WIDTH (the cap that stops
  // the stat row stretching on a desktop monitor), and that constant is
  // platform-aware. This mock is deliberately PARTIAL, so it needs the key
  // explicitly; 'ios' keeps this suite on the native branch, which is the one
  // whose colours it is actually pinning.
  Platform: { OS: 'ios', select: (o: Record<string, unknown>) => o.ios ?? o.default },
}));

import { healthHue, healthCardBg, healthTextColor } from '../app/components/StatsPanel';

const parseRgb = (s: string): [number, number, number] => {
  const m = s.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/)!;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
};

describe('OTA-632 — health card tint', () => {
  it('hue is green at full, amber at half, red at empty', () => {
    const [fr, fg, fb] = healthHue(1);
    expect(fg).toBeGreaterThan(fr); // green dominant when healthy
    expect(fg).toBeGreaterThan(fb);

    const [hr, hg] = healthHue(0.5);
    expect(hr).toBeGreaterThan(120); // amber = high red + high green
    expect(hg).toBeGreaterThan(120);

    const [er, eg] = healthHue(0);
    expect(er).toBeGreaterThan(eg); // red dominant when dying
  });

  it('card background is dark (text-legible) at every HP level', () => {
    for (const frac of [1, 0.75, 0.5, 0.25, 0]) {
      const [r, g, b] = parseRgb(healthCardBg(frac));
      // Each channel stays in the dark range so cream text keeps contrast.
      expect(Math.max(r, g, b)).toBeLessThanOrEqual(170);
    }
  });

  it('card fills toward red as HP drops (low HP is redder + more intense than full)', () => {
    const full = parseRgb(healthCardBg(1));
    const dying = parseRgb(healthCardBg(0.05));
    // Dying card is dominantly red...
    expect(dying[0]).toBeGreaterThan(dying[1]);
    expect(dying[0]).toBeGreaterThan(dying[2]);
    // ...and more saturated/intense than the subtle full-HP green tint.
    expect(dying[0]).toBeGreaterThan(full[0]);
  });

  it('clamps out-of-range fractions instead of producing garbage', () => {
    expect(healthCardBg(2)).toBe(healthCardBg(1));
    expect(healthCardBg(-1)).toBe(healthCardBg(0));
  });

  it('HP number colour is brighter than the card hue (pops off the card)', () => {
    const hue = healthHue(0.3);
    const text = parseRgb(healthTextColor(0.3));
    // Mixed 45% toward white → every channel >= the raw hue.
    expect(text[0]).toBeGreaterThanOrEqual(hue[0]);
    expect(text[1]).toBeGreaterThanOrEqual(hue[1]);
    expect(text[2]).toBeGreaterThanOrEqual(hue[2]);
  });
});
