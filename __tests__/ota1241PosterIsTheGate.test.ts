// OTA-1241 — THE MAP LOCATIONS MISMATCH, CLOSED. Owner: "what about the map
// locations mismatch?" The audit: 15 of 18 hunt posters NAME a real, walkable
// atlas location ("Drakova", "Yuldra-Tul", "the Obsidian Pillars"...) while the
// anchor — the card's "You're at", the atlas pin, the SET COURSE target, AND
// the OTA-1236 stage gate, all one spelling — sat on the generic biome cell.
// Reading the poster and walking to the named place earned the "Not here"
// refusal. Now the poster's named place IS the anchor; only a pure-flavor name
// falls back to the biome cell. This suite makes the agreement law: a hunt
// whose poster names a place the gate refuses can never ship again.
import { huntAnchorId, resolvePosterLocation } from '../app/engine/contractMarkers';
import { HUNTS } from '../app/engine/hunts';
import { canonicalCellOf } from '../app/engine/worldMap';
import locationsData from '../app/data/locations/locations.json';

const locations = (locationsData as { locations: Array<{ id: string }> }).locations
  ?? (locationsData as unknown as Array<{ id: string }>);
const isRealLocation = (id: string) => locations.some((l) => l.id === id);

describe('OTA-1241 — the place the poster names is the place the hunt pays', () => {
  it('⚠⚠ AUDIT: every hunt whose poster names a real location anchors THERE — poster, pin, card and gate agree', () => {
    for (const def of HUNTS) {
      const named = resolvePosterLocation(def.targetLocationName);
      if (named) {
        expect({ hunt: def.id, poster: def.targetLocationName, anchor: huntAnchorId(def) })
          .toEqual({ hunt: def.id, poster: def.targetLocationName, anchor: named });
      }
    }
  });

  it('⚠⚠ the resolver actually resolves — a silent regression here would quietly send every hunt back to the biome cell', () => {
    const hunts = HUNTS;
    const resolved = hunts.filter((h) => resolvePosterLocation(h.targetLocationName));
    // 15 of 18 resolve today; new hunts may push this up. It must never collapse.
    expect(resolved.length).toBeGreaterThanOrEqual(15);
    // The three shapes, pinned by name:
    const byId = (id: string) => hunts.find((h) => h.id === id)!;
    // A bare real name is the gate.
    expect(huntAnchorId(byId('hunt_mud_siren_drakova'))).toBe('drakova');
    // A real name with parenthetical flavor still resolves through the flavor.
    expect(huntAnchorId(byId('hunt_bog_dragon'))).toBe('mud_seas');
    // A pure-flavor name falls back to the biome anchor, not to garbage.
    expect(huntAnchorId(byId('hunt_iron_titan'))).toBe('obsidian_pillars');
    // An alias resolves too ("the Sunken Enclave" is tartarian_enclave's alias).
    expect(huntAnchorId(byId('hunt_plague_moth_enclave'))).toBe('tartarian_enclave');
  });

  it('⚠ every anchor is a REAL, routable atlas location — the gate can always be walked to', () => {
    for (const def of HUNTS) {
      const anchor = huntAnchorId(def);
      expect({ hunt: def.id, anchor, real: isRealLocation(anchor) })
        .toEqual({ hunt: def.id, anchor, real: true });
      const cell = canonicalCellOf(anchor);
      expect(Number.isFinite(cell.x)).toBe(true);
      expect(Number.isFinite(cell.y)).toBe(true);
    }
  });
});
