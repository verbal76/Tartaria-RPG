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

describe('one column, and both cards are in it', () => {
  test('⚠⚠⚠ tile and record share the same right edge', () => {
    const t = box('dossierFieldCompact');
    const c = box('dossierField');
    expect(t.right).toBe(c.right);
    expect(t.right).toBeGreaterThan(0);   // a margin, so it never meets the rim
  });

  test('⚠⚠ neither runs off the card any more — which was the actual complaint', () => {
    for (const n of ['dossierFieldCompact', 'dossierField']) {
      const f = box(n);
      expect(f.left).toBeGreaterThan(0);
      expect(f.right).toBeGreaterThan(0);
    }
  });

  test('it is a RIGHT column, decisively — not centred, not left', () => {
    for (const n of ['dossierFieldCompact', 'dossierField']) {
      const f = box(n);
      const centre = f.left + f.width / 2;
      expect(centre).toBeGreaterThan(55);
    }
  });

  test('⚠⚠ the widths differ ON PURPOSE, and the reason is arithmetic', () => {
    /* `contain` fits by width, so a box's width IS the emblem's drawn size. The
     * same fraction cannot serve both cards: 42% of a 340dp card draws an emblem
     * ~3x a 58dp tile's height (a cropped fragment) and ~0.9x a 200dp record's
     * (a whole logo). The record takes the wider box to stay a fragment. */
    const t = box('dossierFieldCompact');
    const c = box('dossierField');
    expect(c.width).toBeGreaterThan(t.width);
    const tallest = Math.max(...crestFactionIds().map((id) => crestArt(id)!.aspect));
    const shortest = Math.min(...crestFactionIds().map((id) => crestArt(id)!.aspect));
    // both stay taller than the card they sit on — still fragments, not logos
    expect((t.width / 100) * 340 * shortest).toBeGreaterThan(TILE_H * 2);
    expect((c.width / 100) * 340 * shortest).toBeGreaterThan(CARD_H);
    expect(tallest).toBeGreaterThan(1);
  });
});

describe('what the earlier passes established still holds', () => {
  test('the one-third coverage floor survives the move', () => {
    // OTA-1750's floor was written independently of position, which is exactly
    // what let the box travel across the card three times without re-arguing it.
    expect(box('dossierFieldCompact').width / 100).toBeGreaterThanOrEqual(1 / 3);
  });

  test('⚠ a third of the EMBLEM still shows — the splinter cannot come back', () => {
    const t = box('dossierFieldCompact');
    for (const id of crestFactionIds()) {
      const imgH = (t.width / 100) * 340 * crestArt(id)!.aspect;
      expect(TILE_H / imgH).toBeGreaterThanOrEqual(0.30);
      expect(imgH / TILE_H).toBeGreaterThan(2);   // ...and it is still cropped
    }
  });

  test('⚠⚠ both boxes still fit by WIDTH, on a phone AND at the tablet cap', () => {
    /* The property everything else rests on: fit-by-width means image width
     * equals box width, so placement is exact and the focus nudge has a known
     * height to shift. A narrower card or a shallower box flips it to
     * fit-by-height and the column stops being a column. */
    const cases: Array<[string, number]> = [['dossierFieldCompact', TILE_H], ['dossierField', CARD_H]];
    for (const [name, cardH] of cases) {
      const f = box(name);
      const spread = Math.abs(num(f.b, 'top'));
      for (const cardW of WIDTHS) {
        const boxW = (f.width / 100) * cardW;
        const boxH = (1 + (2 * spread) / 100) * cardH;
        for (const id of crestFactionIds()) {
          expect(boxH / boxW).toBeGreaterThanOrEqual(crestArt(id)!.aspect);
        }
      }
    }
  });

  test('the per-faction focus table is still driving both', () => {
    expect((TITLE.match(/<DossierField crest=\{crest\} factionId=/g) ?? []).length).toBe(2);
    expect(TITLE).toContain('FIELD_STYLES[factionId]');
  });

  test('the build stamp names this pass', () => {
    expect(read('app', 'buildInfo.ts')).toContain("'2026-09-08-1754-one-column-on-the-right'");
  });
});
