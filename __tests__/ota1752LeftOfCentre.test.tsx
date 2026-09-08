/**
 * OTA-1752 — LEFT OF CENTRE.
 *
 * OTA-1751 put the roster tile's faction emblem on the row's geometric centre,
 * which is exactly what the owner asked for. On the device it still read as
 * sitting too far right.
 *
 * ⚠⚠⚠ THE ARITHMETIC WAS NEVER WRONG — THE PREMISE WAS. The emblem really was
 * centred; the tile is not an empty rectangle. Its weight is all on the LEFT — a
 * 32px name with an objective line beneath it — against nothing but a small
 * timestamp on the right. An emblem on the geometric centre reads right of
 * centre, because the eye balances it against the TEXT, not against the border.
 *
 * That is worth a suite of its own because it is a rule the rest of the rollout
 * will need: on any surface whose content is one-sided, "centred" is a property
 * of the composition, not of the box.
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
const field = () => {
  const b = styleBlock('dossierFieldCompact');
  const left = num(b, 'left');
  const right = num(b, 'right');
  const width = 100 - left - right;
  return { b, left, right, width, centre: left + width / 2 };
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

describe('the emblem balances against the text, not against the border', () => {
  /* ⚠⚠⚠ THIS PASS WAS WRONG, AND SUPERSEDED BY OTA-1754. KEPT, NOT DELETED.
   *
   * The reasoning below was sound and the conclusion was still wrong, which is
   * the useful kind of failure to leave in the tree. The premise — that a tile's
   * weight is on the left, so a geometrically centred mark reads right-of-centre
   * — is TRUE, and it is a rule the rest of the rollout will need. What was
   * wrong was applying it to a report it did not explain.
   *
   * ⚠⚠ The owner said the emblems were "still too far to the right". I read that
   * as "move them left" and did, twice — to the centre in OTA-1751, past it to
   * 38% in OTA-1752. He meant the emblem was RUNNING OFF the right edge, so only
   * a sliver of it was on the card, and asked for it to be a contained column on
   * the far right. One rendered picture would have settled it before either
   * pass. Two OTAs of travel, and the direction was mine, not his.
   *
   * The positional assertions are therefore retired. What is kept is the part
   * that was never about direction, and the note above, so the next surface with
   * one-sided weight starts from the rule without repeating the inference. */
  test('⚠⚠ SUPERSEDED — the column is on the RIGHT, and this pass moved it left', () => {
    /* ⚠⚠⚠ OTA-1752 WAS THE SECOND STEP OF A MISREADING and OTA-1754 reversed
     * it. Its underlying observation is still worth keeping for the rollout:
     * a tile's text sits on the left, so a mark placed at the geometric centre
     * reads as sitting right of centre. That is true. Applying it here was
     * wrong, because the complaint was about the emblem leaving the card. */
    for (const id of EVERY_CREST) {
      const centre = (placeTile(id).left + placeTile(id).width / 2) / MEASURED_TILE.width;
      expect(centre).toBeGreaterThan(0.7);
    }
  });

  test('⚠⚠ width and crop still match the treatment, whatever the column does', () => {
    for (const id of EVERY_CREST) {
      const p = placeTile(id);
      expect(p.width / MEASURED_TILE.width).toBeCloseTo(0.42, 9);
      expect(p.top).toBeLessThan(0);
      expect(p.top + p.height).toBeGreaterThan(MEASURED_TILE.height);
    }
  });

  test('⚠ it runs under the timestamp, and that is a consequence worth naming', () => {
    /* The pre-OTA-1750 band stopped short of the timestamp; the right-hand
     * column the owner asked for necessarily sits behind it, because the
     * timestamp is flush right in the same row. At 0.22 over the plate the
     * readout still reads — the contrast arithmetic lives in ota1750 — but this
     * is the trade the column makes, recorded rather than discovered later. */
    for (const id of EVERY_CREST) {
      expect((placeTile(id).left + placeTile(id).width) / MEASURED_TILE.width).toBeGreaterThan(0.9);
    }
  });

  test('⚠ SUPERSEDED — both cards move together now, by design', () => {
    // Keeping the two states in step is the point of one treatment; see
    // ota1751's note on why "card X did not change" is not a property.
    for (const id of EVERY_CREST) {
      expect(landedFocus(MEASURED_RECORD, crestArt(id)!, placeRecord(id)).y).toBeCloseTo(0.5, 9);
    }
  });

  test('the build stamp names this pass', () => {
    expect(read('app', 'buildInfo.ts')).toContain("'2026-09-08-1752-left-of-centre'");
  });
});
