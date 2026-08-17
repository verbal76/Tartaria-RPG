// ⚠⚠ THE ATLAS NAME OVERLAY — because the new map art has no lettering on it at all.
//
// Owner, on whether names should be painted into the artwork or drawn by the game:
// *"so you think generating a map overlay is better than having the names on the map
// itself?"* — answered yes, and then: *"you're able to place them either above or under the
// location in a text that is easy enough to read and spaced evenly throughout the map for
// all the names. this is something you can handle without us nitpicking this for the next 3
// days."* This module is that promise, kept as an algorithm rather than as 38 hand-tuned
// coordinates that would rot the first time a landmark moved.
//
// ⚠⚠ WHY THIS EXISTS AT ALL. I told the artist "no lettering of any kind" on the assumption
// that the game already drew location names. It does not — it draws the player marker, the
// "?"/"✕" event glyphs, the "◆" contract pins and exactly ONE name label (the Hidden
// Market). Every other name a player has ever read on that screen was PAINTED INTO THE ART.
// The owner caught it: *"when you said there was no names on the map, did you remove all of
// the names even for the named locations that we are putting on the map from that file?"*
// So until this ships, the new art is an anonymous ruin-field. It is a hard prerequisite of
// the art swap, not a polish item.
//
// ⚠ PURE ON PURPOSE. No React, no store, no rendered pixel sizes — it solves in ATLAS pixel
// space and returns fractions, so the same layout holds at every zoom and on every screen,
// and so the placement can be tested without mounting a screen.
import { LOCATION_ATLAS_COORDS, ATLAS_PIXEL_W, ATLAS_PIXEL_H } from './atlasCoords';
import locationsData from '../data/locations/locations.json';

const LOCATIONS = locationsData as Array<{ id: string; name: string }>;

export type LabelSide = 'below' | 'above' | 'right' | 'left';

export interface AtlasLabel {
  id: string;
  /** Wrapped display lines, in order. */
  lines: string[];
  /** The landmark itself, as image fractions. */
  fx: number;
  fy: number;
  /** CENTRE of the label box, as image fractions. */
  lx: number;
  ly: number;
  side: LabelSide;
  /** Label box size, as image fractions. */
  wFrac: number;
  hFrac: number;
}

// ⚠⚠ THESE THREE NUMBERS WERE ALL WRONG IN THE FIRST CUT, AND A SCREENSHOT IS WHAT PROVED
// IT — not the suite, which agreed with itself and passed.
//
// FONT_PX was 25.5, inherited from the Hidden Market label. That label was tuned by the
// owner as ONE name sitting among names PAINTED INTO THE OLD ART, where its job was to blend
// in. As the source of all 37 names it is far too big: measured, the median gap between
// neighbouring landmarks is 102 px, and a 15-character line at 25.5 px is ~237 px wide —
// more than twice the room available. The map read as names with some art behind them.
//
// CHAR_W_PX was FONT_PX * 0.54, described in the old comment as "a slight OVER-estimate". It
// is not: the shipped face is a heavy serif and 0.54em is comfortably UNDER its real advance.
// That single wrong constant caused the visible defect — React Native re-wrapped the
// already-wrapped lines inside a box too narrow to hold them, breaking words mid-syllable
// ("Giant-Wat / ch / Shrine") and silently adding a third line to two-line names, which then
// overlapped neighbours the solver believed it had cleared.
//
// ⚠ The lesson worth keeping: a layout solver that measures its own ESTIMATE and then tests
// that estimate against itself will always pass. The only honest checks are an over-estimate
// wide enough that reality cannot exceed it, and a render you actually look at.
// ⚠ EXPORTED so MapScreen renders at exactly the size the solver reserved room for. They
// were separate literals in the first cut — the same duplicated-constant trap that put the
// atlas dimensions out of step with the artwork twice. One number, one owner.
export const LABEL_FONT_PX = 14;
export const LABEL_LINE_PX = 16;
const FONT_PX = LABEL_FONT_PX;
const LINE_PX = LABEL_LINE_PX;
// Honest over-estimate for a bold serif. Over-estimating costs a little spacing; under-
// estimating breaks words in half, which is what happened.
const CHAR_W_PX = FONT_PX * 0.66;
// ⚠ 11, not 13, and the number was MEASURED rather than chosen. The widest rendered line
// must fit the typical gap between neighbouring landmarks (~102 px); at 14 px type an
// 11-character line runs 101.6 px and a 13-character one runs 120 px. Swept every
// combination of font 12–15 against wrap 10–13: font 14 / wrap 11 is the LARGEST type that
// still fits the density. Bigger looks better in isolation and worse on the actual map.
const MAX_LINE_CHARS = 11;
// ⚠ The rendered box is deliberately WIDER than the solved text box. The solver's width is
// what governs collisions; this margin exists purely so the real glyphs cannot overflow the
// container and trigger a re-wrap. Transparent and non-interactive, so the slack is invisible.
export const LABEL_BOX_SAFETY = 1.4;
// Clearance between the landmark's own point and the near edge of its name.
const GAP_PX = 16;
// A landmark's own footprint, so a name is never laid across a different landmark's pin.
const ANCHOR_HALF_PX = 15;
// Keep whole labels on the canvas.
const MARGIN_PX = 4;

/** Greedy word wrap at MAX_LINE_CHARS. Long single words are left intact rather than cut. */
export function wrapLabel(name: string, maxChars: number = MAX_LINE_CHARS): string[] {
  const words = name.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if (!cur) { cur = w; continue; }
    if ((cur + ' ' + w).length <= maxChars) cur = `${cur} ${w}`;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [name];
}

interface Box { x0: number; y0: number; x1: number; y1: number }
const overlaps = (a: Box, b: Box): boolean =>
  a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

/**
 * Solve every named landmark's label position.
 *
 * ⚠ The candidate order is BELOW → ABOVE → RIGHT → LEFT, and that order is the owner's
 * instruction ("either above or under the location") with two sideways escapes for the
 * cases his instruction cannot cover — a landmark hard against the top or bottom edge has
 * no room in either vertical direction.
 *
 * Placement is greedy in a fixed order (north to south, then west to east, then by id), so
 * the layout is deterministic: the same catalogue always produces the same map. A label is
 * rejected if it would leave the canvas, cover another label, or sit on another landmark's
 * pin.
 */
export function atlasLabelLayout(): AtlasLabel[] {
  const nameById = new Map(LOCATIONS.map((l) => [l.id, l.name]));

  const entries = Object.entries(LOCATION_ATLAS_COORDS)
    .filter(([id]) => nameById.has(id))
    .map(([id, c]) => ({ id, name: nameById.get(id)!, fx: c.fx, fy: c.fy }))
    .sort((a, b) => (a.fy - b.fy) || (a.fx - b.fx) || a.id.localeCompare(b.id));

  // Every landmark's own footprint blocks every label, including labels placed before it.
  const anchorBoxes: Box[] = entries.map((e) => ({
    x0: e.fx * ATLAS_PIXEL_W - ANCHOR_HALF_PX,
    y0: e.fy * ATLAS_PIXEL_H - ANCHOR_HALF_PX,
    x1: e.fx * ATLAS_PIXEL_W + ANCHOR_HALF_PX,
    y1: e.fy * ATLAS_PIXEL_H + ANCHOR_HALF_PX,
  }));

  const placed: Box[] = [];
  const out: AtlasLabel[] = [];

  for (const e of entries) {
    const lines = wrapLabel(e.name);
    const w = Math.max(...lines.map((l) => l.length)) * CHAR_W_PX;
    const h = lines.length * LINE_PX;
    const ax = e.fx * ATLAS_PIXEL_W;
    const ay = e.fy * ATLAS_PIXEL_H;

    // ⚠ THE FIRST VERSION OFFERED ONLY FOUR POSITIONS AND LEFT SEVEN NAMES PILED ON TOP OF
    // ONE ANOTHER, all in the north-west corner where Tartarian Outskirts, Reclaimer's
    // Stake and the Architect's Blind sit within a few percent of each other. Four slots
    // simply is not enough vocabulary for a cluster that tight.
    //
    // So: eight compass positions, tried at three increasing distances. Straight below and
    // straight above are tried FIRST at every distance, because that is the owner's stated
    // preference ("either above or under the location") — the diagonals and the far rings
    // exist only to rescue the handful of names that genuinely cannot take a clean vertical
    // slot. A name pushed one ring out is still unambiguous; two names on top of each other
    // are not.
    const RINGS = [GAP_PX, GAP_PX * 2.2, GAP_PX * 3.8];
    const candidates: Array<{ side: LabelSide; cx: number; cy: number }> = [];
    for (const d of RINGS) {
      const dy = d + h / 2;
      const dx = d + w / 2;
      candidates.push(
        { side: 'below', cx: ax, cy: ay + dy },
        { side: 'above', cx: ax, cy: ay - dy },
        { side: 'right', cx: ax + dx, cy: ay },
        { side: 'left', cx: ax - dx, cy: ay },
        // Diagonals are pulled in by ~30% on each axis: a name set on the true diagonal
        // reads as belonging to nothing in particular, while a slight offset still reads as
        // attached to its landmark.
        { side: 'below', cx: ax + dx * 0.7, cy: ay + dy * 0.7 },
        { side: 'below', cx: ax - dx * 0.7, cy: ay + dy * 0.7 },
        { side: 'above', cx: ax + dx * 0.7, cy: ay - dy * 0.7 },
        { side: 'above', cx: ax - dx * 0.7, cy: ay - dy * 0.7 },
      );
    }

    let chosen = candidates[0]!;
    for (const c of candidates) {
      const box: Box = { x0: c.cx - w / 2, y0: c.cy - h / 2, x1: c.cx + w / 2, y1: c.cy + h / 2 };
      const inBounds = box.x0 >= MARGIN_PX && box.y0 >= MARGIN_PX
        && box.x1 <= ATLAS_PIXEL_W - MARGIN_PX && box.y1 <= ATLAS_PIXEL_H - MARGIN_PX;
      if (!inBounds) continue;
      if (placed.some((p) => overlaps(box, p))) continue;
      if (anchorBoxes.some((p) => overlaps(box, p))) continue;
      chosen = c; break;
    }

    // ⚠ No silent truncation. If nothing fits, the label still renders below its landmark —
    // an overlapping name is bad, an ABSENT name is worse, because the player then has a
    // pin on unnamed ground and no way to learn what it is. `atlasLabelConflicts()` reports
    // these so a test can hold the count at zero rather than the map quietly degrading.
    const box: Box = {
      x0: chosen.cx - w / 2, y0: chosen.cy - h / 2,
      x1: chosen.cx + w / 2, y1: chosen.cy + h / 2,
    };
    placed.push(box);
    out.push({
      id: e.id,
      lines,
      fx: e.fx,
      fy: e.fy,
      lx: chosen.cx / ATLAS_PIXEL_W,
      ly: chosen.cy / ATLAS_PIXEL_H,
      side: chosen.side,
      wFrac: w / ATLAS_PIXEL_W,
      hFrac: h / ATLAS_PIXEL_H,
    });
  }

  return out;
}

/**
 * Labels that could not be placed cleanly — they overlap another label, another landmark's
 * pin, or the canvas edge. Exists so the failure is COUNTABLE rather than something you
 * discover by squinting at a screenshot.
 */
export function atlasLabelConflicts(labels: AtlasLabel[] = atlasLabelLayout()): string[] {
  const bad: string[] = [];
  const boxOf = (l: AtlasLabel): Box => ({
    x0: (l.lx - l.wFrac / 2) * ATLAS_PIXEL_W,
    y0: (l.ly - l.hFrac / 2) * ATLAS_PIXEL_H,
    x1: (l.lx + l.wFrac / 2) * ATLAS_PIXEL_W,
    y1: (l.ly + l.hFrac / 2) * ATLAS_PIXEL_H,
  });
  for (let i = 0; i < labels.length; i++) {
    const a = labels[i]!;
    const ba = boxOf(a);
    if (ba.x0 < MARGIN_PX || ba.y0 < MARGIN_PX
      || ba.x1 > ATLAS_PIXEL_W - MARGIN_PX || ba.y1 > ATLAS_PIXEL_H - MARGIN_PX) {
      bad.push(`${a.id}: off canvas`);
    }
    for (let j = i + 1; j < labels.length; j++) {
      const b = labels[j]!;
      if (overlaps(ba, boxOf(b))) bad.push(`${a.id} overlaps ${b.id}`);
    }
    for (const other of labels) {
      if (other.id === a.id) continue;
      const pin: Box = {
        x0: other.fx * ATLAS_PIXEL_W - ANCHOR_HALF_PX,
        y0: other.fy * ATLAS_PIXEL_H - ANCHOR_HALF_PX,
        x1: other.fx * ATLAS_PIXEL_W + ANCHOR_HALF_PX,
        y1: other.fy * ATLAS_PIXEL_H + ANCHOR_HALF_PX,
      };
      if (overlaps(ba, pin)) bad.push(`${a.id} covers ${other.id}'s pin`);
    }
  }
  return bad;
}
