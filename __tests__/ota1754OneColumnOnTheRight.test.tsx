/**
 * OTA-1754 — ONE COLUMN, ON THE RIGHT.
 *
 * Owner: *"if we can get the column on the far right we are done, especially if
 * it is on the expanded and collapsed character tiles."*
 *
 * ⚠⚠⚠ AND THE REASON THIS TOOK FOUR PASSES IS WORTH WRITING DOWN, because the
 * code was never the problem. He had said the emblems were "still too far to the
 * right". I read that as *move them left* and did — to the geometric centre in
 * OTA-1751, then past it to 38% in OTA-1752. He meant the emblem was RUNNING OFF
 * the right edge, so only a sliver of it was on the card. The fix was to CONTAIN
 * it at the right, which is the opposite of the direction I inferred.
 *
 * One rendered picture would have settled it before either pass. The lesson is
 * not "read more carefully" — it is that a four-word report about position has
 * more than one reading, and rendering both is cheaper than shipping one.
 *
 * What survives from those passes is everything that was not about direction:
 * the one-third coverage floor, the contrast arithmetic that replaced a layout
 * rule, and the per-faction focus table. All of it holds under this column
 * because none of it was written in terms of where the box sits.
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
const box = (name: string) => {
  const b = styleBlock(name);
  return { b, left: num(b, 'left'), right: num(b, 'right'), width: 100 - num(b, 'left') - num(b, 'right') };
};
const TILE_H = 58; const CARD_H = 200; const WIDTHS = [340, 570];


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

describe('one column, and both cards are in it', () => {
  test('⚠⚠⚠ tile and record share the same right edge', () => {
    for (const id of EVERY_CREST) {
      const t = placeTile(id);
      const r = placeRecord(id);
      /* ⚠ NOT BIT-IDENTICAL, AND THAT IS CORRECT. The column is anchored by the
       * ARTWORK'S FOCUS, not by the image's edge, so a crest whose ink sits
       * 0.5% right of centre (stone_builders, focusX 0.505) puts its right edge
       * a fraction differently in the two columns — 0.9694 against 0.9696, a
       * difference of 0.07dp on a 375dp card. Pinning these to 6 places would
       * be pinning the arithmetic; what the owner asked for is that the two
       * cards read as ONE column, and a tenth of a device pixel is that. */
      expect((t.left + t.width) / MEASURED_TILE.width)
        .toBeCloseTo((r.left + r.width) / MEASURED_RECORD.width, 2);
      expect(Math.abs((t.left + t.width) - (r.left + r.width))).toBeLessThan(0.5);
    }
  });

  test('⚠⚠ neither runs off the card any more — which was the actual complaint', () => {
    for (const card of [MEASURED_TILE, TABLET_TILE, { width: 286.5, height: 45.1 }]) {
      for (const id of EVERY_CREST) {
        const p = placeTile(id, card);
        expect(p.left).toBeGreaterThan(0);
        expect(p.left + p.width).toBeLessThanOrEqual(card.width);
      }
    }
    for (const id of EVERY_CREST) {
      const p = placeRecord(id);
      expect(p.left).toBeGreaterThan(0);
      expect(p.left + p.width).toBeLessThanOrEqual(MEASURED_RECORD.width);
    }
  });

  test('it is a RIGHT column, decisively — not centred, not left', () => {
    for (const id of EVERY_CREST) {
      expect((placeTile(id).left + placeTile(id).width / 2) / MEASURED_TILE.width).toBeGreaterThan(0.7);
      expect((placeRecord(id).left + placeRecord(id).width / 2) / MEASURED_RECORD.width).toBeGreaterThan(0.6);
    }
  });

  test('⚠⚠ the widths differ ON PURPOSE, and the reason is arithmetic', () => {
    /* `coverage` IS the emblem's drawn width, so a wider column makes a TALLER
     * emblem and shows LESS of it. 42% keeps a fragment on a 55dp tile; the
     * record is 2.6x taller, so it needs the wider column to stay a fragment
     * rather than becoming a complete logo. Proved against the SQUAREST crest,
     * which is the worst case — the average passes trivially. */
    const squarest = EVERY_CREST.reduce((a, b) => {
      const A = crestArt(a)!; const B = crestArt(b)!;
      return Math.abs(A.srcH / A.srcW - 1) <= Math.abs(B.srcH / B.srcW - 1) ? a : b;
    });
    expect(crestArt(squarest)!.srcH).toBe(crestArt(squarest)!.srcW);
    expect(placeTile(squarest).height).toBeGreaterThan(MEASURED_TILE.height * 2);
    expect(placeRecord(squarest).height).toBeGreaterThan(MEASURED_RECORD.height);
    expect(OPEN_COMP.coverage).toBeGreaterThan(TILE_COMP.coverage);
  });
});

describe('what the earlier passes established still holds', () => {
  test('the one-third coverage floor survives the move', () => {
    for (const id of EVERY_CREST) {
      expect(placeTile(id).width / MEASURED_TILE.width).toBeGreaterThanOrEqual(1 / 3);
    }
  });

  test('⚠ the splinter cannot come back — measured on the REAL tile', () => {
    // ⚠ The "one third of the emblem" figure this used to pin was an artifact
    // of the assumed 340x58 card; see ota1750 for the full account. The real
    // floor on a measured 375x55 tile is 0.29 for the tallest crests.
    for (const id of EVERY_CREST) {
      expect(visibleFraction(MEASURED_TILE, placeTile(id))).toBeGreaterThan(0.25);
    }
  });

  test('⚠⚠ RETIRED — the fit axis is no longer a question', () => {
    // See ota1750's note. The drawn size is explicit pixels derived from the
    // source canvas, so it is deterministic by construction on every width.
    for (const card of [MEASURED_TILE, TABLET_TILE]) {
      for (const id of EVERY_CREST) {
        const art = crestArt(id)!;
        expect(placeTile(id, card).height / placeTile(id, card).width)
          .toBeCloseTo(art.srcH / art.srcW, 9);
      }
    }
  });

  test('the per-faction focus table is still driving both', () => {
    const tops = EVERY_CREST.map((id) => Math.round(placeTile(id).top * 100));
    expect(new Set(tops).size).toBeGreaterThan(5);   // genuinely per-faction
    for (const id of EVERY_CREST) {
      expect(landedFocus(MEASURED_TILE, crestArt(id)!, placeTile(id)).y).toBeCloseTo(0.5, 9);
      expect(landedFocus(MEASURED_RECORD, crestArt(id)!, placeRecord(id)).y).toBeCloseTo(0.5, 9);
    }
  });

  test('the build stamp names this pass', () => {
    expect(read('app', 'buildInfo.ts')).toContain("'2026-09-08-1754-one-column-on-the-right'");
  });
});
