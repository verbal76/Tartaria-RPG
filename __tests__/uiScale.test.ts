// OTA 23-005 — Verifies the responsive UI scale math. The scale
// is reactive (useWindowDimensions feeds it inside the hook), but
// the math is a pure function — computeUiScale — that we can pin
// across the full range of real-world phone dimensions.

import {
  computeUiScale,
  DESIGN_BASE_WIDTH,
  MIN_UI_SCALE,
} from '../app/ui/uiScale';

describe('OTA 23-005 — UI scale math', () => {
  describe('at design baseline', () => {
    it('390 × 844 (iPhone 13) returns scale 1.0, logicalWidth=390', () => {
      const ui = computeUiScale(390, 844);
      expect(ui.scale).toBe(1);
      expect(ui.logicalWidth).toBe(390);
      expect(ui.logicalHeight).toBe(844);
      expect(ui.isShrunk).toBe(false);
    });
  });

  describe('on smaller phones (the wife-case)', () => {
    it('iPhone SE 1st gen (320 × 568) shrinks proportionally', () => {
      const ui = computeUiScale(320, 568);
      expect(ui.scale).toBeCloseTo(320 / DESIGN_BASE_WIDTH, 5);
      // The scaled rendering should still claim the device's
      // physical width (logicalWidth × scale == 320).
      expect(ui.logicalWidth * ui.scale).toBeCloseTo(320, 5);
      expect(ui.logicalHeight * ui.scale).toBeCloseTo(568, 5);
      expect(ui.isShrunk).toBe(true);
    });

    it('Galaxy S8 / S9 (360 × 740) shrinks but only slightly', () => {
      const ui = computeUiScale(360, 740);
      expect(ui.scale).toBeCloseTo(360 / DESIGN_BASE_WIDTH, 5);
      expect(ui.scale).toBeGreaterThan(0.9);
      expect(ui.isShrunk).toBe(true);
    });

    it('older Android compact (340 × 620) returns a >MIN_UI_SCALE value', () => {
      const ui = computeUiScale(340, 620);
      expect(ui.scale).toBeGreaterThan(MIN_UI_SCALE);
      expect(ui.scale).toBeLessThan(1);
    });
  });

  describe('on larger phones', () => {
    it('iPhone 13 Pro Max (430 × 932) stays at scale 1.0 — no upscale', () => {
      const ui = computeUiScale(430, 932);
      expect(ui.scale).toBe(1);
      expect(ui.logicalWidth).toBe(430);
      expect(ui.isShrunk).toBe(false);
    });

    it('Pixel 7 Pro (412 × 915) stays at scale 1.0', () => {
      const ui = computeUiScale(412, 915);
      expect(ui.scale).toBe(1);
    });

    it('tablet-class (768 × 1024) stays at scale 1.0; extra room is breathing space', () => {
      const ui = computeUiScale(768, 1024);
      expect(ui.scale).toBe(1);
      expect(ui.logicalWidth).toBe(768);
    });
  });

  describe('edge cases', () => {
    it('floors at MIN_UI_SCALE so tiny widths don\'t produce unreadable shrink', () => {
      const ui = computeUiScale(100, 200);
      expect(ui.scale).toBe(MIN_UI_SCALE);
    });

    it('the logical viewport always covers the device viewport (scale × logical >= device)', () => {
      // For any reasonable phone, scaled logical pixels equal the
      // actual device pixels — no empty bars on screen edges.
      for (const w of [300, 320, 360, 380, 390, 412, 430, 480]) {
        const ui = computeUiScale(w, 800);
        expect(ui.logicalWidth * ui.scale).toBeCloseTo(
          Math.max(w, MIN_UI_SCALE * DESIGN_BASE_WIDTH),
          5,
        );
      }
    });

    it('isShrunk is true iff the scale is < 1', () => {
      expect(computeUiScale(320, 600).isShrunk).toBe(true);
      expect(computeUiScale(390, 600).isShrunk).toBe(false);
      expect(computeUiScale(500, 800).isShrunk).toBe(false);
    });
  });

  describe('reactivity contract', () => {
    // The hook itself uses useWindowDimensions which is reactive;
    // computeUiScale is the pure-math layer. We can prove the math
    // responds correctly to dimension changes by re-running.
    it('flipping landscape on a small phone re-computes accordingly', () => {
      // Portrait small phone: 320 × 568
      const portrait = computeUiScale(320, 568);
      // Landscape: 568 × 320 — width now >= baseline, no shrink.
      const landscape = computeUiScale(568, 320);
      expect(portrait.scale).toBeLessThan(1);
      expect(landscape.scale).toBe(1);
    });

    it('foldable unfold (360 → 720) drops the shrink', () => {
      const folded = computeUiScale(360, 800);
      const unfolded = computeUiScale(720, 800);
      expect(folded.isShrunk).toBe(true);
      expect(unfolded.isShrunk).toBe(false);
    });
  });
});
