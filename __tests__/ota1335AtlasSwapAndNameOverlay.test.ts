// ⚠⚠ OTA-1335 — THE NEW ATLAS ART, AND THE NAMES THE GAME NOW HAS TO DRAW ITSELF.
//
// Owner: *"so you think generating a map overlay is better than having the names on the map
// itself?"* — yes — and then the actual brief: *"you're able to place them either above or
// under the location in a text that is easy enough to read and spaced evenly throughout the
// map for all the names. this is something you can handle without us nitpicking this for the
// next 3 days."*
//
// ⚠⚠ THIS SUITE EXISTS BECAUSE THE ART SWAP HAD TWO SILENT KILLERS IN IT. Neither throws.
// Neither shows up in a typecheck. Both put every marker on the map in the wrong place:
//
//   1. `ATLAS_W`/`ATLAS_H` were hand-typed literals in MapScreen (1774×887) with a comment
//      saying they MUST match the live asset — a rule with no mechanism. The new art is
//      1619×971. The dot maths is aspect-driven.
//   2. `ATLAS_LEGEND_FRAC = 10/92` squeezed every marker east to dodge a "TARTARIA"
//      cartouche painted on the OLD art. The new art has no lettering at all, so the inset
//      became a flat 10.9%-of-map-width (≈176 px, ~4 tiles) error applied to every pin.
//
// A test cannot see a PNG's header through the bundler, so what it CAN pin is that the
// numbers the code uses match the numbers the art actually has, and that the correction
// factor is gone.
import { LOCATION_ATLAS_COORDS, ATLAS_PIXEL_W, ATLAS_PIXEL_H } from '../app/engine/atlasCoords';
import { atlasLabelLayout, atlasLabelConflicts, wrapLabel } from '../app/engine/atlasLabels';
import locationsData from '../app/data/locations/locations.json';
import { readFileSync } from 'node:fs';

const LOCS = locationsData as unknown as Array<{ id: string; name: string }>;

describe('OTA-1335 — the atlas swap', () => {
  it('⚠⚠ the declared pixel size matches the shipped PNG, read from its own header', () => {
    // The real check, not a restatement of the constant: parse the IHDR chunk off the asset
    // on disk. If someone drops in new art and forgets these two numbers, this fails here
    // rather than as "the map feels a bit off" three weeks later.
    const buf = readFileSync('assets/world-atlas.png');
    expect(buf.subarray(1, 4).toString('ascii')).toBe('PNG');
    const w = buf.readUInt32BE(16);
    const h = buf.readUInt32BE(20);
    expect(w).toBe(ATLAS_PIXEL_W);
    expect(h).toBe(ATLAS_PIXEL_H);
    // And the spec asked the artist for 5:3. Worth pinning, because every coordinate in the
    // hand-off document is a fraction of that canvas.
    expect(Math.abs(w / h - 5 / 3)).toBeLessThan(0.005);
  });

  it('⚠⚠ the legend inset is gone — no marker is displaced eastward any more', () => {
    // The inset is the single most dangerous line the swap had to remove, so this asserts
    // its ABSENCE from the source rather than trusting that it was deleted.
    const src = readFileSync('app/screens/MapScreen.tsx', 'utf8');
    expect(src).not.toMatch(/insetGroundFx\s*\(/);
    expect(src).not.toMatch(/const\s+ATLAS_LEGEND_FRAC\s*=/);
    // ⚠ And the dimensions must not have been re-typed as literals while nobody was looking.
    expect(src).not.toMatch(/const\s+ATLAS_W\s*=\s*\d/);
    expect(src).not.toMatch(/const\s+ATLAS_H\s*=\s*\d/);
  });
});

describe('OTA-1335 — the name overlay', () => {
  const labels = atlasLabelLayout();

  it('⚠⚠ every landmark on the atlas gets a name — the new art has none of its own', () => {
    const plotted = Object.keys(LOCATION_ATLAS_COORDS);
    expect(labels.length).toBe(plotted.length);
    expect(new Set(labels.map((l) => l.id)).size).toBe(labels.length);
    for (const id of plotted) expect(labels.some((l) => l.id === id)).toBe(true);
    // ⚠ The Hidden Market is deliberately NOT in this set — it keeps its own reveal-gated
    // "?" → name behaviour, because finding it is content. It is still a name on the map,
    // which is why the total the player sees is one more than this count.
    expect(labels.some((l) => l.id === 'hidden_market')).toBe(false);
  });

  it('⚠ every label reads the location\'s real name, not an id', () => {
    const nameById = new Map(LOCS.map((l) => [l.id, l.name]));
    for (const l of labels) {
      expect(l.lines.join(' ')).toBe(nameById.get(l.id));
      expect(l.lines.every((line) => line.trim().length > 0)).toBe(true);
    }
  });

  it('⚠⚠ NOTHING COLLIDES — no name over a name, no name over another landmark\'s pin', () => {
    // This is the owner's "without us nitpicking this for the next 3 days" made checkable.
    // ⚠ The first solver offered only four positions and left SEVEN collisions, all in the
    // north-west where Tartarian Outskirts, Reclaimer's Stake and the Architect's Blind sit
    // within a few percent of each other. Eight compass positions across three distance
    // rings resolve every one. If a future landmark re-creates that pile-up, this is the
    // line that says so.
    expect(atlasLabelConflicts(labels)).toEqual([]);
  });

  it('⚠ every label is fully on the canvas', () => {
    for (const l of labels) {
      expect(l.lx - l.wFrac / 2).toBeGreaterThanOrEqual(0);
      expect(l.lx + l.wFrac / 2).toBeLessThanOrEqual(1);
      expect(l.ly - l.hFrac / 2).toBeGreaterThanOrEqual(0);
      expect(l.ly + l.hFrac / 2).toBeLessThanOrEqual(1);
    }
  });

  it('⚠ the owner asked for above/below, and above/below is what the map overwhelmingly gets', () => {
    // Sideways placement is an escape hatch for landmarks with no vertical room, not a
    // style. If this ratio ever collapses, the layout has stopped matching what he asked
    // for and someone should look at it.
    const vertical = labels.filter((l) => l.side === 'below' || l.side === 'above').length;
    expect(vertical / labels.length).toBeGreaterThan(0.85);
  });

  it('⚠⚠ the two southernmost places are labelled sideways — there is no canvas below them', () => {
    // The Black Reach and the Grand Spire of Etheria sit at fy 0.955, deliberately: the
    // Reach is the bottom of the world. A "below" label would hang off the frame, so the
    // solver has to find them another slot. This is the concrete case that justifies having
    // horizontal candidates at all.
    for (const id of ['black_reach', 'grand_spire_of_etheria']) {
      const l = labels.find((x) => x.id === id)!;
      expect(l).toBeTruthy();
      expect(['right', 'left']).toContain(l.side);
    }
  });

  it('⚠ the layout is deterministic — the same catalogue gives the same map every time', () => {
    // Solved once at module load in MapScreen, so a solver that drifted between runs would
    // move names around between app launches for no reason the player could understand.
    expect(atlasLabelLayout()).toEqual(labels);
  });

  it('⚠ wrapping keeps long names to readable lines without dropping words', () => {
    expect(wrapLabel('The Monarch\'s Waystation')).toEqual(['The Monarch\'s', 'Waystation']);
    expect(wrapLabel('Asgardar')).toEqual(['Asgardar']);
    // Nothing is ever truncated — a clipped place name is worse than a wide one.
    for (const l of labels) {
      const joined = l.lines.join(' ');
      expect(joined).not.toContain('…');
      expect(joined.length).toBeGreaterThan(0);
    }
  });
});
