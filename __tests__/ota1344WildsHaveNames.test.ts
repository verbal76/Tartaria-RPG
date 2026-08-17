// ⚠ OTA-1344 — THE WILDS HAVE NAMES.
//
// Owner, free of Iskan-Veil with the bar still claiming the city: *"do locations
// have a radius other than the tile — maybe a 2 tile radius around it that's
// still considered that area? but outside of any area's ring of influence
// wouldn't I be on the road, or in the wilds or on the outskirts or badlands or
// some lore specific unnamed area?"* This suite pins the tier ladder he asked
// for, at every cell of the canon grid:
//   d = 0  → null (the scene bar shows the location's real name)
//   d ≤ 2  → "<Name> Outskirts" — the ring of influence
//   course → "The road to <target>"
//   else   → one of five lore wilds names, taken from the atlas band the cell
//            actually sits in — never the last city's name.
import {
  overlandAreaLabel, nearestNamedLocation, wildsNameFor, OUTSKIRTS_RADIUS,
  canonicalCellFor,
} from '../app/engine/worldMap';

const WILDS = new Set([
  'The Frontier Silt', 'The Drowned Reaches', 'The Eastern Mud',
  'The Southern Badlands', 'The Deep Wastes',
]);

describe('OTA-1344 — the tiered overland area label', () => {
  it('⚠⚠ standing AT a named location, the label yields to the real name (null)', () => {
    for (const id of ['iskan_veil', 'asgardar', 'black_reach', 'tartarian_outskirts']) {
      const c = canonicalCellFor(id);
      expect(overlandAreaLabel(c.x, c.y)).toBeNull();
    }
  });

  it('⚠⚠ the whole grid obeys the ladder — outskirts ring, then named wilds, never a bare city name', () => {
    // Sweep a coarse lattice of the canon grid; every cell must satisfy the
    // tier rules against its own nearest-location read. Data-driven, so a moved
    // location or a re-tuned band cannot silently break the ladder.
    for (let x = 2; x < 60; x += 3) {
      for (let y = 2; y < 32; y += 3) {
        const near = nearestNamedLocation(x, y)!;
        const label = overlandAreaLabel(x, y);
        if (near.dist === 0) {
          expect(label).toBeNull();
        } else if (near.dist <= OUTSKIRTS_RADIUS) {
          expect(label).toBe(`${near.name} Outskirts`);
        } else {
          expect(WILDS.has(String(label))).toBe(true);
          expect(label).toBe(wildsNameFor(x, y));
        }
      }
    }
  });

  it('⚠ a plotted course names the road — but never inside an outskirts ring', () => {
    // Find a genuinely wild cell (>2 from everything) and ask for the road label.
    let wild: { x: number; y: number } | null = null;
    outer: for (let x = 2; x < 60; x += 1) {
      for (let y = 2; y < 32; y += 1) {
        if ((nearestNamedLocation(x, y)?.dist ?? 0) > OUTSKIRTS_RADIUS) { wild = { x, y }; break outer; }
      }
    }
    expect(wild).not.toBeNull();
    expect(overlandAreaLabel(wild!.x, wild!.y, 'Asgardar')).toBe('The road to Asgardar');
    // Inside a ring, the ring wins — you are somewhere, not just en route.
    const c = canonicalCellFor('iskan_veil');
    const ringLabel = overlandAreaLabel(c.x + 1, c.y, 'Asgardar');
    expect(ringLabel).toMatch(/ Outskirts$/);
  });

  it('the deep south of the atlas reads as the Deep, the far north as the Frontier', () => {
    // Band sanity against two anchors whose geography is fixed by the art:
    // the Black Reach is the southernmost point; the frontier camps line the top.
    const reach = canonicalCellFor('black_reach');
    expect(wildsNameFor(reach.x, reach.y)).toBe('The Deep Wastes');
    const frontier = canonicalCellFor('monarch_waystation');
    expect(wildsNameFor(frontier.x, frontier.y)).toBe('The Frontier Silt');
  });
});
