/**
 * OTA-1753 — EACH EMBLEM GETS ITS OWN WINDOW.
 *
 * The owner, three passes ago: *"we might need a custom position for each emblem
 * since they are all not symetrical."* Every pass since has moved ONE window and
 * hoped; this measures the artwork instead.
 *
 * ⚠⚠⚠ AND THE MEASUREMENT SAYS SOMETHING SYSTEMATIC, WHICH IS THE FINDING.
 * Every one of the nine crests carries its subject ABOVE the middle of its own
 * file — focusY 0.339 to 0.466, mean 0.40, not one at 0.5. A window on the
 * vertical CENTRE of these files therefore shows the LOWER part of every emblem:
 * the ground and the plinth, never the device. That is not per-faction noise to
 * be tuned away, it is how the set was drawn, and it is the reason the roster
 * fragments read as rubble through four passes of moving the box.
 *
 * So the suite grades three things: that the art data is real and complete, that
 * the conversion into a nudge is sound at both boxes, and that the two card
 * states now wear one treatment instead of two.
 */
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { crestArt, crestFactionIds, factionCrest } from '../app/engine/factionCrests';

import { placeCrestField, landedFocus, visibleFraction } from '../app/ui/crestField';

const ROOT = join(__dirname, '..');
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), 'utf8');
const TITLE = read('app', 'screens', 'TitleScreen.tsx');
const CRESTS = read('app', 'engine', 'factionCrests.ts');

const styleBlock = (name: string) => {
  const one = new RegExp(`\\n  ${name}:\\s*\\{[^{}]*\\},`).exec(TITLE);
  if (one) return one[0];
  return new RegExp(`\\n  ${name}:\\s*\\{[\\s\\S]*?\\n  \\},`).exec(TITLE)?.[0] ?? '';
};
const num = (block: string, prop: string) => {
  const m = new RegExp(`${prop}:\\s*'?(-?\\d+(?:\\.\\d+)?)%?'?`).exec(block);
  return m ? Number(m[1]) : NaN;
};
const constant = (name: string) =>
  Number(new RegExp(`const ${name} = (-?\\d+(?:\\.\\d+)?)`).exec(TITLE)?.[1] ?? NaN);

/** The file's own dimensions, straight from the PNG header. */
function pngSize(f: string) {
  const b = readFileSync(join(ROOT, 'assets', 'crests', f));
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

// ═══ 1. THE ART DATA IS REAL, COMPLETE, AND SAYS WHAT IT CLAIMS ══════════════

/* ⚠⚠⚠ OTA-1756 — THESE CLAIMS ARE NOW ASKED OF THE PLACEMENT, NOT OF A
 * STYLESHEET. Everything below used to be read out of `dossierField` /
 * `dossierFieldCompact` as percentage insets, and converted with a constant
 * calibrated against "a 340dp card, ~58dp collapsed, ~200dp expanded" — three
 * numbers nobody had measured. The percentages are gone. The composition and a
 * MEASURED card box now go to `placeCrestField`, and these tests ask where the
 * emblem actually lands.
 * ⚠ The card boxes below are real: read out of the running app at 411dp and at
 * the 600dp tablet cap. Nothing here depends on their exact values — only on
 * the placement tracking whatever box it is handed. */
const MEASURED_TILE = { width: 375, height: 55 };
const MEASURED_RECORD = { width: 375, height: 143.5 };
const TABLET_TILE = { width: 564, height: 55 };
const TILE_COMP = { coverage: 0.42, focusAtX: 0.76, focusAtY: 0.5 };
const OPEN_COMP = { coverage: 0.62, focusAtX: 0.66, focusAtY: 0.5 };
const placeTile = (id: string, card = MEASURED_TILE) => placeCrestField(card, crestArt(id)!, TILE_COMP)!;
const placeRecord = (id: string, card = MEASURED_RECORD) => placeCrestField(card, crestArt(id)!, OPEN_COMP)!;
const EVERY_CREST = crestFactionIds();

describe('the measurement', () => {
  test('every faction with art has a focus, and nothing else does', () => {
    const ids = crestFactionIds();
    expect(ids).toHaveLength(9);
    for (const id of ids) expect(crestArt(id)).toBeDefined();
    // no orphan entries, and no guessing for a faction the game does not ship
    expect(crestArt('no_such_faction')).toBeUndefined();
    expect(crestArt(undefined)).toBeUndefined();
    expect(crestArt(null)).toBeUndefined();
  });

  test('⚠⚠ each recorded CANVAS matches the actual PNG, exactly', () => {
    // ⚠ OTA-1756 replaced the rounded `aspect` with the exact `srcW`/`srcH`,
    // so the aspect is DERIVED and can no longer disagree with the file it
    // describes — the precise drift that shipped in OTA-1754.
    for (const id of crestFactionIds()) {
      const art = crestArt(id)!;
      const { w, h } = pngSize(`${id}.png`);
      expect([art.srcW, art.srcH]).toEqual([w, h]);
    }
  });

  test('⚠⚠⚠ ALL NINE sit above centre — the finding, and it survived re-measurement', () => {
    /* ⚠ THE FINDING HELD; THE NUMBERS DID NOT. OTA-1753 measured focusY at
     * 0.339-0.466 by weighting alpha x max(0, luminance - 0.18) on a 128x128
     * downsample. Discounting dim ink drags the centroid toward the brightest
     * region, so every value came out too high — by 0.061 on true_tartarians.
     * OTA-1756 re-measured at full resolution with alpha x luminance and no
     * threshold: 0.398-0.494. Still every one above centre, which is why a
     * window on the file's middle shows plinth rather than device. */
    const ys = crestFactionIds().map((id) => crestArt(id)!.focusY);
    for (const y of ys) expect(y).toBeLessThan(0.5);
    expect(Math.min(...ys)).toBeGreaterThan(0.35);   // the old table went to 0.339
    expect(Math.max(...ys)).toBeGreaterThan(0.47);
  });

  test('⚠ the harness that produced these numbers is COMMITTED, not just named', () => {
    // ⚠ OTA-1756 replaced the browser/canvas harness with a dependency-free
    // Python one, for two reasons: the old one needed a local web server to get
    // canvas readback at all, and its 0.18 threshold silently biased the table.
    const h = read('scripts', 'measure-crest-art.py');
    expect(h).toContain('crests');
    expect(h).toMatch(/def measure\(/);
    expect(h.slice(h.indexOf('def measure('), h.indexOf('def main('))).not.toMatch(/0\.18/);
  });
});

// ═══ 2. THE CONVERSION FROM ART FACT TO LAYOUT NUDGE ═════════════════════════
describe('the nudge', () => {
  /* ⚠ THE `nudge` HELPER IS GONE. It mirrored the shipped formula
   * `round(K x (0.5 − focusY) x aspect)` so the test could check it — which
   * meant the test could only ever confirm that the code equalled itself. It
   * did exactly that, faithfully, while K was calibrated against a card nobody
   * had measured. The tests below ask the PLACEMENT where the emblem landed on
   * a measured card instead, which is a question the implementation cannot
   * answer wrongly and still pass. */

  test('⚠⚠ a focus above centre pushes the emblem DOWN — the whole point', () => {
    /* The artwork's weight sits above the middle of its own file, so putting
     * that weight on the card's centre line means the image must sit LOWER than
     * a naively centred one. Asked of the placement rather than of a nudge
     * constant: compare against where a centred image would have gone. */
    for (const id of crestFactionIds()) {
      const p = placeTile(id);
      const naiveTop = MEASURED_TILE.height / 2 - p.height / 2;
      expect(p.top).toBeGreaterThan(naiveTop);
      expect(landedFocus(MEASURED_TILE, crestArt(id)!, p).y).toBeCloseTo(0.5, 9);
    }
  });

  test('the placements differ per faction, or the table would be pointless', () => {
    const tops = crestFactionIds().map((id) => Math.round(placeTile(id).top * 100));
    expect(new Set(tops).size).toBeGreaterThan(5);
  });

  test('⚠⚠⚠ the placement never uncovers the window — the visible failure this could cause', () => {
    // Pushing the emblem down to find the device must never pull its top edge
    // onto the card. OTA-1756 makes this a guarantee rather than a hope: the
    // coverage is raised, if it must be, until the emblem bleeds both edges.
    for (const card of [MEASURED_TILE, MEASURED_RECORD, TABLET_TILE, { width: 286.5, height: 200.2 }]) {
      for (const id of crestFactionIds()) {
        const comp = card.height > 100 ? OPEN_COMP : TILE_COMP;
        const p = placeCrestField(card, crestArt(id)!, comp)!;
        expect(p.top).toBeLessThanOrEqual(1e-9);
        expect(p.top + p.height).toBeGreaterThanOrEqual(card.height - 1e-9);
      }
    }
  });

  test('⚠⚠⚠ SUPERSEDED — THERE IS NO DEVICE CALIBRATION LEFT TO DECLARE', () => {
    /* ⚠⚠⚠ THIS IS THE TEST THAT MATTERED, AND IT WAS SATISFIED BY A COMMENT.
     * It asserted that the conversion constant "is declared rather than hidden"
     * — and it passed, because the constant WAS declared. What it could not
     * check was whether the declared numbers were true. They were not: "a 340dp
     * card, ~58dp collapsed, ~200dp expanded" against a real 375x55 and
     * 375x143.5, and the mock-ups that were supposed to catch it were drawn at
     * those same assumed ratios.
     * The honest replacement is not a better-declared constant. It is no
     * constant: the card reports its own box and the placement is computed from
     * that. This asserts the absence. */
    const placement = TITLE.slice(TITLE.indexOf('TILE_FIELD'), TITLE.indexOf('export function TitleScreen'));
    expect(placement).not.toMatch(/\b340\b|\b58dp\b|\b200dp\b/);
    expect(TITLE).not.toMatch(/const\s+(TILE|OPEN)_NUDGE_K\s*=/);
    expect(TITLE).toMatch(/onLayout=\{onLayout\}/);
  });
});

// ═══ 3. ONE TREATMENT, BOTH STATES ═══════════════════════════════════════════
describe('the two card states stopped being two treatments', () => {
  test('⚠⚠ RETIRED — the fit axis is not a question any more', () => {
    // The drawn size is explicit pixels derived from the source canvas, so
    // there is no axis for `contain` to choose. See ota1750's note.
    for (const id of crestFactionIds()) {
      const art = crestArt(id)!;
      expect(placeTile(id).height / placeTile(id).width).toBeCloseTo(art.srcH / art.srcW, 9);
      expect(placeRecord(id).height / placeRecord(id).width).toBeCloseTo(art.srcH / art.srcW, 9);
    }
  });

  test('they share an alpha family instead of reading as different effects', () => {
    const tile = num(styleBlock('dossierFieldCompact'), 'opacity');
    const open = num(styleBlock('dossierField'), 'opacity');
    // ⚠ Not identical — a record is four times a tile's height, so the same
    // alpha covers far more area. Close enough to read as one treatment.
    expect(Math.abs(tile - open)).toBeLessThanOrEqual(0.06);
    expect(open).toBeGreaterThan(0.13);   // was 0.13, and read as absent
  });

  test('both call sites pass the faction, so both get their own window', () => {
    expect((TITLE.match(/<DossierField crest=\{crest\} factionId=/g) ?? []).length).toBe(2);
  });

  test('⚠⚠ SUPERSEDED — the styles CANNOT be built at module load any more', () => {
    /* This asserted that eighteen style objects were built once at import and
     * looked up by key, so the FlatList did no per-row work. That was true, and
     * it was only possible because the geometry was a constant — which is
     * exactly what made it wrong on every card. Placement now depends on a
     * measurement that does not exist until the row lays out.
     * ⚠ The cost is bounded and asserted elsewhere: one useState and one
     * onLayout per row (ota1747), and re-reporting the same box changes nothing
     * (ota1756), so a scroll or a recycle is still free. */
    expect(TITLE).not.toMatch(/const FIELD_STYLES/);
    expect(TITLE).toMatch(/useState<CardBox \| null>/);
  });

  test('a faction with no art borrows nobody else\'s numbers', () => {
    expect(crestArt('not_a_faction')).toBeUndefined();
    expect(crestArt(undefined)).toBeUndefined();
    expect(crestArt(null)).toBeUndefined();
    // and the screen renders nothing rather than falling back to a guess
    expect(TITLE).toMatch(/const place = card && art/);
  });

  test('the build stamp names this pass', () => {
    expect(read('app', 'buildInfo.ts')).toContain("'2026-09-08-1753-each-emblem-gets-its-own-window'");
  });
});
