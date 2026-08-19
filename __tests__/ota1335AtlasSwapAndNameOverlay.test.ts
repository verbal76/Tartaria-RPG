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
import { atlasLabelLayout, atlasLabelConflicts, wrapLabel, LABEL_BOX_SAFETY } from '../app/engine/atlasLabels';
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

  // ⚠⚠⚠ THE THREE ASSERTIONS BELOW EXIST BECAUSE THIS SUITE PASSED ON A BROKEN LAYOUT.
  //
  // The overlay shipped, and the owner's screenshot showed names snapped in half
  // ("Giant-Wat / ch / Shrine") and sprawling across a third of the map. Every test above
  // was green at the time. The reason is worth stating plainly: the solver estimated each
  // label's width, and the tests checked those estimates against each other. Nothing in the
  // loop ever touched the real font, so the suite could only ever confirm that the solver
  // agreed with itself — the same failure as the hunt walker that never moved.
  //
  // A unit test cannot measure a typeface. What it CAN do is pin the two properties that
  // make the estimate safe to be wrong in only one direction, and pin the density the
  // estimate has to live within. That is what these three do.
  it('⚠⚠ the character-width estimate is an OVER-estimate, which is the only safe direction', () => {
    // Under-estimating is what broke it: too narrow a box makes React Native re-wrap the
    // pre-wrapped lines, snapping words and adding lines the solver never reserved room for.
    // Over-estimating merely costs a little spacing. 0.54em was under; a heavy serif needs
    // ~0.6em or more, so the floor is set above that and this fails if anyone trims it.
    const src = readFileSync('app/engine/atlasLabels.ts', 'utf8');
    const m = src.match(/CHAR_W_PX\s*=\s*FONT_PX\s*\*\s*([\d.]+)/);
    expect(m).toBeTruthy();
    expect(Number(m![1])).toBeGreaterThanOrEqual(0.62);
  });

  it('⚠⚠ the rendered box is wider than the solved box, so real glyphs cannot force a re-wrap', () => {
    expect(LABEL_BOX_SAFETY).toBeGreaterThan(1.15);
    // ⚠ And MapScreen must actually APPLY it, and must take its type size from this module
    // rather than re-typing the numbers — re-typed constants are what put the atlas
    // dimensions out of step with the artwork twice already.
    const screen = readFileSync('app/screens/MapScreen.tsx', 'utf8');
    expect(screen).toMatch(/LABEL_BOX_SAFETY/);
    expect(screen).toMatch(/LABEL_FONT_PX \* labelScale/);
    expect(screen).toMatch(/LABEL_LINE_PX \* labelScale/);
    expect(screen).not.toMatch(/25\.5 \* labelScale/);
  });

  it('⚠⚠ a label fits the space between landmarks — the size is checked against DENSITY', () => {
    // The real defect behind the screenshot: 25.5 px type was inherited from a label tuned
    // as ONE name among painted names, and never checked against how close the landmarks
    // actually are. Measured, the median nearest-neighbour gap is ~102 px, and a long line
    // at 25.5 px ran ~237 px — over twice the room. The map read as text with art behind it.
    const pts = Object.values(LOCATION_ATLAS_COORDS)
      .map((c) => [c.fx * ATLAS_PIXEL_W, c.fy * ATLAS_PIXEL_H] as const);
    const nn = pts.map((a, i) => Math.min(
      ...pts.filter((_, j) => j !== i).map((b) => Math.hypot(a[0] - b[0], a[1] - b[1])),
    )).sort((x, y) => x - y);
    const medianGap = nn[Math.floor(nn.length / 2)]!;
    const widest = Math.max(...labels.map((l) => l.wFrac * ATLAS_PIXEL_W));
    // The widest name may not exceed the typical gap between neighbouring places. This is
    // the assertion the first cut would have failed, and the one that keeps the type honest
    // if the catalogue ever gets denser.
    expect(widest).toBeLessThanOrEqual(medianGap);
  });

  it('⚠ wrapping keeps long names to readable lines without dropping words', () => {
    // ⚠ This used to assert a literal example — `['The Monarch\'s', 'Waystation']` — which
    // broke the moment the wrap width was retuned from 13 characters to 11, even though the
    // wrapper was behaving perfectly. That is pinning an ACCIDENT of one setting instead of
    // the rule. The rule is: never exceed the width unless a single word is itself longer,
    // never split a word, never lose one.
    for (const name of ['The Monarch\'s Waystation', 'Asgardar', 'The Architect\'s Blind']) {
      const lines = wrapLabel(name, 11);
      expect(lines.join(' ')).toBe(name);
      for (const line of lines) {
        // A line may only exceed the budget when it is one unbreakable word.
        if (line.length > 11) expect(line.split(' ').length).toBe(1);
      }
    }
    expect(wrapLabel('Asgardar')).toEqual(['Asgardar']);
    // Nothing is ever truncated — a clipped place name is worse than a wide one.
    for (const l of labels) {
      const joined = l.lines.join(' ');
      expect(joined).not.toContain('…');
      expect(joined.length).toBeGreaterThan(0);
    }
  });
});
