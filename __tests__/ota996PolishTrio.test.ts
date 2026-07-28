// OTA-996 — review item #119, the polish trio. (a) Ambient takeable gear
// gets a cross-tile variety window — root cause of "Rail Saber ×3 in 90s" was
// independent uniform draws over one 128-name pool with zero cross-scene
// memory. (b) The climb-down line names the PERCH, never the person — overlay
// ids doubled as labels and trader/lookout overlays are named after their
// occupant. (c) The buried strip mall becomes a market row (lock: no modern
// Americana in the wild flavor pools).
import * as fs from 'fs';
import * as path from 'path';
import { pickTakeableGearForScene } from '../app/engine/takeableGearSpawns';
import { overlayDescentNoun } from '../app/engine/elevatedOverlay';

describe('OTA-996 — polish trio', () => {
  it('(a) the exclude window keeps recently-rolled gear out of the next tiles', () => {
    const first = pickTakeableGearForScene('loc@roomA@0,0');
    expect(first.length).toBeGreaterThan(0);
    const exclude = new Set(first.map((n) => n.toLowerCase()));
    for (const key of ['loc@roomB@0,1', 'loc@roomC@1,0', 'loc@roomD@1,1']) {
      const next = pickTakeableGearForScene(key, exclude);
      for (const n of next) expect(exclude.has(n.toLowerCase())).toBe(false);
    }
  });

  it('(a) a huge exclude set degrades to fewer picks, never a hang or a crash', () => {
    // Approximate the whole pool by unioning picks across many seeds, then
    // exclude all of it — the guard cap must degrade gracefully, not spin.
    const everything = new Set<string>();
    for (let i = 0; i < 300; i++) {
      for (const n of pickTakeableGearForScene(`probe@${i}`)) everything.add(n.toLowerCase());
    }
    expect(everything.size).toBeGreaterThan(50);
    const picks = pickTakeableGearForScene('loc@roomE@2,2', everything);
    expect(Array.isArray(picks)).toBe(true); // guard-capped, likely empty — but returns
  });

  it('(b) person-overlays descend from their perch, place-overlays keep their name', () => {
    expect(overlayDescentNoun('forgotten_scholar')).toBe("scholar's perch");
    expect(overlayDescentNoun('rumor_pilgrim')).toBe("pilgrim's perch");
    expect(overlayDescentNoun('drunk_drifter')).toBe("drifter's roost");
    expect(overlayDescentNoun('open_sky')).toBe('lookout');
    expect(overlayDescentNoun('nook')).toBe('nook'); // encounter overlays unchanged
    // and the climb-down narration is actually wired through it
    const store = fs.readFileSync(path.join(__dirname, '../app/state/gameStore.ts'), 'utf8');
    expect(store).toMatch(/overlayDescentNoun\(overlayMeta\.overlayId\)/);
  });

  it('(c) LOCK — no modern Americana in the wild flavor pools', () => {
    const climbables = fs.readFileSync(path.join(__dirname, '../app/engine/climbableSpawns.ts'), 'utf8');
    const ladder = fs.readFileSync(path.join(__dirname, '../app/data/world/worldLadder.json'), 'utf8');
    for (const src of [climbables, ladder]) {
      expect(src).not.toMatch(/strip mall|parking lot|gas station|freeway|sidewalk/i);
    }
  });
});
