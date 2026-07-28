// OTA-1013 — every curio is pocketable, whatever words its name carries. Found by
// the extended root-cause audit of the full Opus span (OTA-992..1004): OTA-997's
// portability fix exempts exact CATALOG items from the substance-word ban, but
// OTA-1005's curios are deliberately catalog-absent — so the Mud-Frosted Bead
// (word "mud") could be salvaged into the pack yet refused on re-pickup once
// dropped. The exemption now consults the curio roster as a catalog of its own.
import { isOversized } from '../app/engine/portability';

const curios = require('../app/data/relics/curios.json').curios as { name: string }[];

describe('OTA-1013 — curios pass the portability gate', () => {
  it('CATEGORY LOCK: no curio, present or future, is refused', () => {
    // Sweeps the live roster, so a future curio named with a substance word
    // ("mud", "ash", "fog"...) is covered the day it is authored — the exact
    // failure shape this OTA fixes can never silently return.
    const blocked = curios.filter((c) => isOversized(c.name)).map((c) => c.name);
    expect(blocked).toEqual([]);
    expect(curios.length).toBeGreaterThanOrEqual(50); // the roster is really loaded
  });

  it('THE FINDING: the Mud-Frosted Bead itself', () => {
    expect(curios.some((c) => c.name === 'Mud-Frosted Bead')).toBe(true);
    expect(isOversized('Mud-Frosted Bead')).toBe(false);
    expect(isOversized('mud-frosted bead')).toBe(false); // case-insensitive path
  });

  it('the ban itself still works — substances stay unpocketable', () => {
    // The exemption is surgical: actual substances and scenery keep refusing.
    for (const noun of ['wet mud', 'the mud', 'fog bank', 'mud flat']) {
      expect(isOversized(noun)).toBe(true);
    }
  });
});
