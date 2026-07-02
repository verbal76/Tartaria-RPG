// OTA-632 — the player card tints by HP fraction (green → amber → red) and the
// HP number takes a matching brighter colour, so health reads at a glance. These
// lock the gradient direction + that the card stays dark enough for cream text.

jest.mock('react-native', () => ({
  View: 'View',
  Text: 'Text',
  StyleSheet: { create: (s: unknown) => s },
}));

import { healthHue, healthCardBg, healthTextColor } from '../app/components/StatsPanel';

const parseRgb = (s: string): [number, number, number] => {
  const m = s.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/)!;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
};

describe('OTA-632 — health card tint', () => {
  it('hue fades green → red directly (no bright amber midpoint)', () => {
    const [fr, fg, fb] = healthHue(1);
    expect(fg).toBeGreaterThan(fr); // green dominant when healthy
    expect(fg).toBeGreaterThan(fb);

    const [er, eg] = healthHue(0);
    expect(er).toBeGreaterThan(eg); // red dominant when dying

    // Half HP is a straight red↔green blend — each channel sits BETWEEN the two
    // endpoints (redder than full, greener than death) and must NOT spike bright, so
    // there's no vivid-yellow midpoint that washes the card text.
    const [hr, hg] = healthHue(0.5);
    expect(hr).toBeGreaterThan(fr);
    expect(hr).toBeLessThan(er);
    expect(hg).toBeGreaterThan(eg);
    expect(hg).toBeLessThan(fg);
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
