/**
 * OTA-1751 — CENTRED ON THE ROW.
 *
 * Owner, on OTA-1750: *"bump to .22 and as far as the overlay we might need a
 * custom position for each emblem since they are all not symetrical. let's
 * center the emblem on the line for now and see what that does."*
 *
 * ⚠⚠ THE ASYMMETRY IS REAL AND IT IS THE NEXT PIECE OF WORK. The nine crests are
 * each composed differently inside their own frame, so ONE window into all of
 * them shows a different PART of each: a spear and a wing from one, the middle
 * of a shield from another, mostly ground from a third. No uniform geometry can
 * fix that — only a per-faction offset, keyed the way the crest table itself is.
 * Centring is the honest default to judge it from, so that is what ships, and
 * this suite pins the two things that changed plus the one that must not: the
 * tile still has to be READABLE at the higher alpha.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

import { crestArt, crestFactionIds } from '../app/engine/factionCrests';
import { placeCrestField, landedFocus, visibleFraction } from '../app/ui/crestField';

const ROOT = join(__dirname, '..');
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), 'utf8');
const TITLE = read('app', 'screens', 'TitleScreen.tsx');

const styleBlock = (name: string) => {
  const one = new RegExp(`\\n  ${name}:\\s*\\{[^{}]*\\},`).exec(TITLE);
  if (one) return one[0];
  return new RegExp(`\\n  ${name}:\\s*\\{[\\s\\S]*?\\n  \\},`).exec(TITLE)?.[0] ?? '';
};
const num = (block: string, prop: string) => {
  const m = new RegExp(`${prop}:\\s*'?(-?\\d+(?:\\.\\d+)?)%?'?`).exec(block);
  return m ? Number(m[1]) : NaN;
};
const hexRgb = (h: string): [number, number, number] => {
  const t = h.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(t.slice(i, i + 2), 16)) as [number, number, number];
};
const lum = (rgb: [number, number, number]) => {
  const f = rgb.map((v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * f[0]! + 0.7152 * f[1]! + 0.0722 * f[2]!;
};
const contrast = (a: [number, number, number], b: [number, number, number]) => {
  const l1 = lum(a); const l2 = lum(b);
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
};


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

describe('the emblem sits on the row\'s centre line', () => {
  /* ⚠⚠⚠ SUPERSEDED BY OTA-1752, ONE DEVICE LOOK LATER — REASONING KEPT.
   * This asserted equal insets, because "centred on the line" is what the owner
   * asked for and equal insets is what that means. He then saw it on the device
   * and said it STILL sat too far right. The arithmetic was never wrong; the
   * PREMISE was. A tile is not an empty rectangle — its weight is all on the
   * left (a 32px name, an objective line under it) against a small timestamp on
   * the right, so an emblem on the geometric centre reads right-of-centre
   * because the eye balances it against the text.
   * The durable claim is therefore the opposite of the original one: the emblem
   * must sit LEFT of the tile's centre, by enough to be deliberate. */
  /* ⚠⚠⚠ SUPERSEDED TWICE, AND THE SECOND TIME REVERSED IT — RECORDED, BECAUSE
   * THE MISTAKE IS THE LESSON.
   *
   * This suite first asserted equal insets ("centred on the line", which is what
   * the owner asked for). OTA-1752 then asserted the centre must sit LEFT of the
   * tile's, after he said the emblems were "still too far to the right". Both
   * were faithful implementations of a reading I never checked.
   *
   * ⚠⚠ HE MEANT THE EMBLEM WAS RUNNING OFF THE RIGHT EDGE — that only a sliver
   * of it was on the card — not that it should move left. The fix was to CONTAIN
   * it at the right. Four words, two opposite readings, and I marched the emblem
   * across the card twice before showing him a picture and asking. The cost was
   * two OTAs; the avoidable part was inferring a direction from an ambiguous
   * report instead of rendering both and letting him point.
   *
   * What survives from this pass is everything that was not about position: the
   * alpha he approved, the contrast arithmetic that replaced a layout rule, and
   * the coverage floor asserted independently of where the box sits — which is
   * precisely what let OTA-1754 move it without re-arguing any of them. */
  test('⚠⚠ SUPERSEDED — the emblem is a contained column on the RIGHT, not a centred mark', () => {
    /* ⚠⚠⚠ THIS PASS CENTRED THE EMBLEM ON A MISREADING, and OTA-1754 reversed
     * it. The owner said the emblems were "still too far to the right"; that
     * was read as "move them left" when it meant the emblem was RUNNING OFF the
     * right edge. The column belongs on the right, contained. Kept as the
     * record of a wrong turn, asserting the geometry that replaced it. */
    for (const id of EVERY_CREST) {
      const p = placeTile(id);
      const centre = (p.left + p.width / 2) / MEASURED_TILE.width;
      expect(centre).toBeGreaterThan(0.7);
      expect(p.left).toBeGreaterThan(0);
      expect(p.left + p.width).toBeLessThanOrEqual(MEASURED_TILE.width);
    }
  });

  test('moving it did not cost coverage — still 42% of the tile', () => {
    for (const id of EVERY_CREST) {
      expect(placeTile(id).width / MEASURED_TILE.width).toBeCloseTo(0.42, 9);
    }
  });

  test('it stays vertically centred — on the ARTWORK\'s focus, not the file\'s middle', () => {
    // ⚠ OTA-1756: "vertically centred" now means the measured focus lands on
    // the card's centre line, which is what this pass was reaching for and what
    // the assumed-card arithmetic never actually delivered.
    for (const id of EVERY_CREST) {
      expect(landedFocus(MEASURED_TILE, crestArt(id)!, placeTile(id)).y).toBeCloseTo(0.5, 9);
    }
  });
});

describe('stronger, and the tile still reads', () => {
  test('the collapsed field is at the alpha the owner asked for', () => {
    expect(num(styleBlock('dossierFieldCompact'), 'opacity')).toBe(0.22);
  });

  test('⚠⚠⚠ every text tone clears its threshold over the BRIGHTEST part of the art', () => {
    /* This is the assertion that replaced a layout rule. Until now the emblem
     * was kept clear of the name column, which meant nobody had to ask whether
     * text over artwork was legible. Centring puts the name directly on it, so
     * the question is answered with arithmetic instead of avoided.
     *
     * The tile face composites to roughly (20,19,13) on the owner's green. The
     * crest art runs to about (150,130,90) where it is brightest — deliberately
     * the worst case the text ever sits on, not the average. */
    const face: [number, number, number] = [20, 19, 13];
    const art: [number, number, number] = [150, 130, 90];
    const op = num(styleBlock('dossierFieldCompact'), 'opacity');
    const lit = [0, 1, 2].map((i) => art[i]! * op + face[i]! * (1 - op)) as [number, number, number];
    expect(contrast(hexRgb('#e6d8b3'), lit)).toBeGreaterThanOrEqual(4.5); // slotName — body text bar
    expect(contrast(hexRgb('#c9a86a'), lit)).toBeGreaterThanOrEqual(3);   // slotObjective
    expect(contrast(hexRgb('#a2977b'), lit)).toBeGreaterThanOrEqual(3);   // slotTime
    expect(contrast(hexRgb('#e07a5f'), lit)).toBeGreaterThanOrEqual(3);   // deadBadge
  });

  test('⚠ there is headroom left, and a ceiling', () => {
    // 0.22 was the top of the band OTA-1750 set. If the owner wants more, the
    // band moves deliberately rather than by drift — and the contrast test above
    // is what decides how far it can go.
    expect(num(styleBlock('dossierFieldCompact'), 'opacity')).toBeLessThanOrEqual(0.22);
  });

  test('⚠ SUPERSEDED — the expanded card was NOT left untouched, and could not be', () => {
    /* This asserted that OTA-1751 changed only the tile. OTA-1753 then had to
     * move the record's box, OTA-1754 moved it again, and OTA-1756 replaced the
     * mechanism for both. A test that pins one card as "unchanged" pins the
     * absence of work rather than a property, and it failed four times for
     * changes that were all correct. What is true and worth holding is that the
     * two states share ONE treatment, differing only in the column each has
     * room for. */
    for (const id of EVERY_CREST) {
      const t = placeTile(id);
      const r = placeRecord(id);
      expect(landedFocus(MEASURED_TILE, crestArt(id)!, t).y).toBeCloseTo(0.5, 9);
      expect(landedFocus(MEASURED_RECORD, crestArt(id)!, r).y).toBeCloseTo(0.5, 9);
      expect(r.width / MEASURED_RECORD.width).toBeGreaterThan(t.width / MEASURED_TILE.width);
    }
  });
});

describe('what is deliberately NOT solved yet', () => {
  test('⚠⚠ SUPERSEDED — there IS a per-faction offset now, and it is measured', () => {
    /* When this pass shipped, every crest shared one window and that was a
     * deliberate deferral. OTA-1753 added a per-faction table and OTA-1756
     * re-measured it from the source assets at full resolution. The deferral is
     * over; this now asserts what replaced it. */
    const tops = EVERY_CREST.map((id) => placeTile(id).top);
    expect(new Set(tops.map((t) => Math.round(t * 100))).size).toBeGreaterThan(5);
    for (const id of EVERY_CREST) expect(crestArt(id)!.focusY).toBeLessThan(0.5);
  });

  test('the build stamp names this pass', () => {
    expect(read('app', 'buildInfo.ts')).toContain("'2026-09-08-1751-centred-on-the-row'");
  });
});
