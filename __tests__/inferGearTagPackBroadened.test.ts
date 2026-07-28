// OTA-680 / arb112 — the buried world's loot names skewed almost entirely to
// organic + aether + improvised, so a player's reserved pool collapsed onto a
// single material and the Crucible's "3 DISTINCT materials" gate was effectively
// unreachable ("broaden the mapping or otherwise we'll never be able to make
// anything"). inferGearTagPack's per-material keyword lists are now broadened to
// common scavenge/junk vocabulary so the SAME items span metal / stone / wood /
// cloth / crystal / fiber, not just organic. These assertions lock the broadened
// vocabulary in and prove a realistic loot batch clears the 3-material gate.

import { inferGearTagPack } from '../app/engine/itemDefaults';

describe('inferGearTagPack — broadened scavenge vocabulary', () => {
  const cases: Array<[string, string]> = [
    ['Rusted Buckle', 'metal'],
    ['Bent Nail', 'metal'],
    ['Iron Hinge', 'metal'],
    ['Cracked Flint', 'stone'],
    ['Chunk of Gravel', 'stone'],
    ['Broken Slate Tile', 'stone'],
    ['Splintered Board', 'wood'],
    ['Driftwood Plank', 'wood'],
    ['Snapped Twig', 'wood'],
    ['Frayed Strap', 'cloth'],
    ['Linen Rag', 'cloth'],
    ['Canvas Patch', 'cloth'],
    ['Glass Bead', 'crystal'],
    ['Cracked Vial', 'crystal'],
    ['Amber Shard', 'crystal'],
    ['Length of Twine', 'fiber'],
    ['Coil of Wire', 'metal'],
  ];

  it.each(cases)('%s → includes %s', (name, mat) => {
    expect(inferGearTagPack(name)).toContain(mat);
  });

  it('a mixed junk batch spans 3+ distinct materials (gate reachable)', () => {
    const batch = ['Rusted Buckle', 'Cracked Flint', 'Splintered Board', 'Frayed Strap', 'Glass Bead'];
    const mats = new Set(batch.flatMap((n) => inferGearTagPack(n)));
    // metal + stone + wood + cloth + crystal — comfortably past the 4+ Legendary tier.
    expect(mats.size).toBeGreaterThanOrEqual(3);
  });

  it('is additive — organic creature-parts still classify', () => {
    for (const n of ['Shrike Claw', 'Aetheric Moss', 'Leech Mucus']) {
      expect(inferGearTagPack(n)).toContain('organic');
    }
  });
});
