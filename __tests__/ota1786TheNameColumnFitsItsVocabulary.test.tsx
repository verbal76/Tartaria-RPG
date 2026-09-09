/**
 * OTA-1786 — THE NAME COLUMN FITS ITS VOCABULARY.
 *
 * Owner, from an actual device: *"The Glyphs cheat sheet is wrapping
 * BLUDGEONING so the final G sits alone on a second line. Fix the layout at the
 * narrowest appropriate level. Do not abbreviate BLUDGEONING and do not
 * globally shrink the legend typography to accommodate it. Give the
 * damage-family name column sufficient governed width for its vocabulary while
 * preserving useful room for the descriptions."*
 *
 * ⚠⚠⚠ WHY 92 LOOKED FINE AND WAS NOT — AND IT IS THE INTERESTING PART.
 * BLUDGEONING is 11 characters at 11pt with `letterSpacing: 1`. Uppercase in a
 * system font runs roughly 0.66–0.75 em, so the label needs somewhere between
 * 91 and 102dp depending on which face the device resolves. The shipped column
 * was 92 — INSIDE that range. It fits on a narrow font and wraps on a wide one,
 * which is precisely the class of number that survives review and fails on
 * hardware, because nothing on a developer machine disagrees with it.
 *
 * ⚠⚠ SO THE FIX IS NOT "MAKE IT 102". It is to stop typing a number that has to
 * be right about a font. The width is DERIVED from the longest label the key can
 * ever print, at the WIDE end of the ratio — so a damage family added later
 * widens the column instead of wrapping in it, and no future reader has to
 * re-derive why the number is what it is.
 */
import fs from 'node:fs';
import path from 'node:path';

import {
  LONGEST_GLYPH_NAME,
  NAME_COL_W,
  COAT_KEY_ORDER,
} from '../app/components/WeaponGlyphKey';
import { BASE_DAMAGE_GLYPH } from '../app/engine/weaponGlyphs';

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const KEY = 'app/components/WeaponGlyphKey.tsx';

/** The measured shape of the shipped row, so the arithmetic below is about the
 *  real control rather than about numbers retyped into a test. */
const FONT = 11;
const LETTER_SPACING = 1;

describe('OTA-1786 — the column is derived, not typed', () => {
  it('the longest label is the longest one in the whole vocabulary', () => {
    const all = Object.keys(BASE_DAMAGE_GLYPH).concat(COAT_KEY_ORDER as unknown as string[]);
    const longest = all.reduce((a, b) => (b.length > a.length ? b : a), '');
    expect(LONGEST_GLYPH_NAME.length).toBe(longest.length);
    expect(LONGEST_GLYPH_NAME.length).toBe(11); // BLUDGEONING, and DEGRADATION ties
  });

  /* ⚠⚠⚠ THE WHOLE VOCABULARY, NOT TODAY'S SUBSET. The key renders
   * `baseTypesInPlay()`, which filters to the damage families the weapon
   * catalog actually uses. Sizing the column to THAT would make the layout
   * depend on the catalog: add one weapon with a new damage type and a column
   * that had always been fine starts wrapping, in a file nobody touched. */
  it('every name in the vocabulary fits, not merely the ones in play today', () => {
    const all = Object.keys(BASE_DAMAGE_GLYPH).concat(COAT_KEY_ORDER as unknown as string[]);
    for (const name of all) {
      const needed = name.length * (FONT * 0.75 + LETTER_SPACING);
      expect({ name, fits: needed <= NAME_COL_W }).toEqual({ name, fits: true });
    }
  });

  /* ⚠ THE WIDE END OF THE RATIO, ON PURPOSE. A column sized to the AVERAGE font
   * is a column that wraps on the wide ones — which is the defect this replaces.
   * At 0.66 em the old 92 was just enough; at 0.75 it was ten dp short. */
  it('is sized for the widest plausible face, not the average one', () => {
    const atWide = LONGEST_GLYPH_NAME.length * (FONT * 0.75 + LETTER_SPACING);
    expect(NAME_COL_W).toBeGreaterThanOrEqual(atWide);
    // and the old number would NOT have cleared it — the defect, stated as arithmetic
    expect(92).toBeLessThan(atWide);
  });

  it('the shipped column reads the derived value rather than a literal', () => {
    const code = read(KEY);
    const rule = /name: \{[^}]*\}/.exec(code)?.[0] ?? '';
    expect(rule).not.toBe('');
    expect(rule).toContain('width: NAME_COL_W');
    expect(rule).not.toMatch(/width: \d+/);
  });
});

describe('OTA-1786 — nothing else moved', () => {
  const code = read(KEY);

  /* Owner: *"Do not abbreviate BLUDGEONING and do not globally shrink the legend
   * typography to accommodate it."* Both halves, asserted. */
  it('the legend type size is untouched', () => {
    const rule = /name: \{[^}]*\}/.exec(code)?.[0] ?? '';
    expect(rule).toContain(`fontSize: ${FONT}`);
    expect(rule).toContain(`letterSpacing: ${LETTER_SPACING}`);
    const meaning = /meaning: \{[^}]*\}/.exec(code)?.[0] ?? '';
    expect(meaning).toContain('fontSize: 11');
  });

  it('no label is abbreviated — the names are the damage keys, uppercased', () => {
    expect(code).toContain('{name.toUpperCase()}');
    expect(code).not.toMatch(/BLUDG\b|BLUNT\b/);
  });

  /* ⚠ THE DESCRIPTION COLUMN STILL TAKES EVERYTHING LEFT OVER. Owner: *"while
   * preserving useful room for the descriptions."* `flex: 1` is what makes that
   * true regardless of the name column's width; the cost of this fix is the ten
   * dp the name column took. */
  it('the description column still flexes into the remainder', () => {
    const meaning = /meaning: \{[^}]*\}/.exec(code)?.[0] ?? '';
    expect(meaning).toContain('flex: 1');
  });

  /* ⚠⚠ AND THE ARTWORK IS UNTOUCHED. The owner was explicit that this is a
   * layout finding and not a reopening of the combat-glyph artwork: the cell is
   * still `GLYPH_ART_SIZE.lore`, still 28, still square. */
  it('the artwork cell is the approved 28dp footprint', () => {
    expect(code).toContain('artCell: { width: GLYPH_ART_SIZE.lore, height: GLYPH_ART_SIZE.lore }');
  });
});

describe('OTA-1786 — the row still fits a phone', () => {
  /* ⚠ MEASURED, NOT HOPED. The row is art(28) + gap(8) + name + gap(8) +
   * description. On the narrowest phone this game targets, the Lore card sits
   * inside the screen's 12dp padding and its own; taking the tightest plausible
   * case, the description keeps well over a hundred dp — which is what "useful
   * room" has to mean for a sentence. The device is still the final authority;
   * this is the floor under it. */
  it('leaves the description a usable column on a 360dp phone', () => {
    const SCREEN = 360;
    const CHROME = 12 * 2 + 12 * 2; // screen padding + card padding, generous
    const row = 28 + 8 + NAME_COL_W + 8;
    expect(SCREEN - CHROME - row).toBeGreaterThan(100);
  });
});
