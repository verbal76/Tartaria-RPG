jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// ⚠⚠ OTA-1250 — THE PC BUILD STOPS BEING A PHONE ON A MONITOR. Owner, looking
// at the desktop build: *"on a PC it's a slice down the middle or is it
// resolution aware, and do we have a resolution picker?"* It was a slice, and
// there was no picker.
//
// Two faults, and this suite holds both fixes:
//   1. FIVE screens hard-capped at `maxWidth: 600` — a phone assumption nobody
//      revisited at port time. They now share ONE platform-aware constant, so
//      they cannot drift apart again (the pin below is the whole point: a sixth
//      screen copy-pasting a bare 600 is the failure mode).
//   2. No scale control. Now a desktop UI-SCALE setting — deliberately not a
//      "resolution picker", since the OS owns resolution inside a maximized
//      window.
//
// ⚠ MOBILE MUST BE UNTOUCHED. jest-expo runs the NATIVE platform, so the
// width asserted here is the mobile one — which is exactly the regression
// guard that matters for HAL: this change may not move the phone layout by a
// single pixel.
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  CONTENT_MAX_WIDTH, UI_SCALES, ZOOM_FOR_SCALE, displayScaleSupported,
  getUiScale, setUiScale, loadUiScale, applyUiScale,
} from '../app/ui/displayScale';

const SCREENS = ['AboutScreen', 'InventoryScreen', 'VendorScreen', 'TitleScreen', 'ExplorationScreen'];

describe('OTA-1250 — one column width, and a scale control that only exists where it works', () => {
  it('⚠⚠ MOBILE IS UNCHANGED: on a native platform the column is still exactly 600', () => {
    // jest-expo = native. If this ever reads 1024, the PC widening leaked onto
    // phones and every mobile screen just got a layout it was never designed for.
    expect(CONTENT_MAX_WIDTH).toBe(600);
  });

  it('⚠⚠ all five screens share the ONE constant — no screen carries a bare 600', () => {
    const offenders: string[] = [];
    for (const s of SCREENS) {
      const src = readFileSync(join(__dirname, '..', 'app', 'screens', `${s}.tsx`), 'utf8');
      if (!src.includes('maxWidth: CONTENT_MAX_WIDTH')) offenders.push(`${s}: not using the constant`);
      if (src.includes('maxWidth: 600')) offenders.push(`${s}: still hard-codes 600`);
      if (!src.includes("from '../ui/displayScale'")) offenders.push(`${s}: missing the import`);
    }
    expect(offenders).toEqual([]);
  });

  it('⚠ the desktop width is genuinely wider — the whole point of the change', () => {
    // ⚠ OTA-1252 moved the pure constants to ./layoutConstants (displayScale
    // needs AsyncStorage, and a width should not cost a render path a storage
    // dependency). displayScale re-exports both, so the five screens below are
    // unchanged — only where the NUMBER is written moved.
    const src = readFileSync(join(__dirname, '..', 'app', 'ui', 'layoutConstants.ts'), 'utf8');
    expect(src).toMatch(/Platform\.OS === 'web' \? (\d+) : 600/);
    const web = Number(/Platform\.OS === 'web' \? (\d+) : 600/.exec(src)![1]);
    expect(web).toBeGreaterThan(600);
    // ...but still a CENTRED COLUMN, not edge-to-edge stretch on a 4K monitor.
    expect(web).toBeLessThanOrEqual(1400);
  });

  it('⚠⚠ the scale control hides itself when it cannot do anything', () => {
    // No desktop bridge in this environment — mobile, or a plain browser.
    expect(displayScaleSupported()).toBe(false);
    // And the Settings row is gated on exactly that, never rendered inert.
    const about = readFileSync(join(__dirname, '..', 'app', 'screens', 'AboutScreen.tsx'), 'utf8');
    expect(about).toContain('scaleSupported && (');
    expect(about).toContain('displayScaleSupported()');
  });

  it('⚠ applying a scale off-desktop is a silent no-op, never a crash', () => {
    for (const s of UI_SCALES) {
      expect(() => applyUiScale(s)).not.toThrow();
    }
  });

  it('⚠⚠ the setting round-trips and drives a real zoom factor', async () => {
    expect(UI_SCALES).toEqual(['small', 'medium', 'large']);
    // Medium is 1.0 — the default must be "the game as it has always looked".
    expect(ZOOM_FOR_SCALE.medium).toBe(1);
    expect(ZOOM_FOR_SCALE.small).toBeLessThan(1);
    expect(ZOOM_FOR_SCALE.large).toBeGreaterThan(1);
    // Gentle steps: nothing here should reflow the layout into a new shape.
    expect(ZOOM_FOR_SCALE.large / ZOOM_FOR_SCALE.small).toBeLessThan(2);

    await setUiScale('large');
    expect(getUiScale()).toBe('large');
    await setUiScale('small');
    expect(getUiScale()).toBe('small');
    // An unknown/absent stored value resolves to medium rather than breaking.
    expect(await loadUiScale()).toBe('small'); // cache wins once set
  });

  it('⚠ the boot path re-applies the saved scale — Electron forgets zoom across launches', () => {
    const app = readFileSync(join(__dirname, '..', 'App.tsx'), 'utf8');
    expect(app).toContain('loadUiScale()');
  });
});
