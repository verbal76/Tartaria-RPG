/**
 * OTA-1767 — THE BUTTON GROWS TO HOLD THE GLYPH, NOT THE OTHER WAY ROUND.
 *
 * Owner: *"do NOT preserve the current combat weapon button height at the
 * expense of icon readability... The combat glyphs should be at least Lore size.
 * Start with the exact displayed icon size used in Lore ▸ Glyphs. If that does
 * not fit comfortably with proper padding and vertical centering, enlarge the
 * weapon buttons enough to accommodate it... Do not shrink the artwork simply to
 * preserve the old button dimensions."*
 *
 * Priority order, given explicitly:
 *     1. glyph immediately readable
 *     2. weapon name immediately readable
 *     3. comfortable padding around both
 *     4. compact button height AFTER those are satisfied
 *
 * ⚠⚠⚠ THIS OVERTURNS OTA-1766, AND THE OVERTURNED REASONING IS KEPT RATHER THAN
 * DELETED BECAUSE IT NAMES THE MISTAKE EXACTLY. That pass drew combat at 18dp and
 * argued for it from a real measurement: the chip is `paddingVertical: 6` around
 * 12pt text, so an 18dp mark fits the content box it already had and a 28 would
 * add about 12dp to every weapon button. Every word of that was true as
 * MEASUREMENT and wrong as a DECISION — it made the chip's existing height the
 * constraint and the artwork the variable, when the artwork is the thing the
 * player has to read. The chip was never a requirement; it was what happened to
 * be there. Measuring the wrong thing still produces a number.
 *
 * ⚠ MEASURED ON THE LIVE COMBAT SCREEN in the web harness, not computed: the
 * icons render 28×28, the glyph row is 32dp (28 + 2 + 2 padding), so a weapon
 * chip is 46dp against a text-only chip's 28dp.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

import { GLYPH_ART_SIZE } from '../app/engine/combatGlyphArt';

const ROOT = join(__dirname, '..');
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), 'utf8');
const INPUTBOX = read('app', 'components', 'InputBox.tsx');
const KEY = read('app', 'components', 'WeaponGlyphKey.tsx');
const ART = read('app', 'engine', 'combatGlyphArt.ts');

/* ⚠ GRADE THE CODE, NOT THE PROSE — eighth time in this rollout. The files below
 * argue at length about `18`, `backgroundColor` and the old chip height, which
 * are the exact strings several assertions require to be absent. */
const codeOf = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

/** A style declaration's own block, anchored on its two-space indent. */
function styleBlock(src: string, name: string): string {
  const code = codeOf(src);
  const start = code.indexOf(`\n  ${name}: {`);
  if (start < 0) return '';
  const end = code.indexOf('\n  },', start);
  // one-liners close on the same line
  const line = code.slice(start, code.indexOf('\n', start + 1));
  if (line.trimEnd().endsWith('},')) return line;
  return end < 0 ? '' : code.slice(start, end);
}

describe('priority 1 — the glyph is readable, which means it is Lore size', () => {
  test('⚠⚠⚠ combat draws at the SAME size as Lore, and equality is the assertion', () => {
    /* While the two disagreed, a pair of numbers said something real. They agree
     * now, so a drift apart would be a regression rather than a decision — which
     * is why this is `toBe(lore)` and not `toBe(28)`. */
    expect(GLYPH_ART_SIZE.combat).toBe(GLYPH_ART_SIZE.lore);
    expect(GLYPH_ART_SIZE.lore).toBe(28);
  });

  test('⚠⚠ the artwork is not shrunk anywhere — no second, smaller copy of the size', () => {
    /* The failure this guards is "someone puts the old 18 back to save 16dp of
     * height". There is one number; nothing may hard-code another. */
    const code = codeOf(INPUTBOX);
    expect(code).toContain('width: GLYPH_ART_SIZE.combat, height: GLYPH_ART_SIZE.combat');
    expect(code).not.toMatch(/width: 1[0-9], height: 1[0-9]/);
    expect(codeOf(KEY)).toContain('GLYPH_ART_SIZE.lore');
  });

  test('⚠ the overturned reasoning is RECORDED, not quietly swapped', () => {
    /* A number that changes with no trace of why invites the next reader to
     * change it back for the reason that was already rejected. */
    expect(ART).toContain('OVERRULED');
    expect(ART).toContain('at the expense of icon readability');
    expect(ART).toContain('18');            // the old value, named as the mistake
  });
});

describe('priority 2 and 3 — the name reads, and both have room', () => {
  test('⚠⚠ the icon and the name share one centre line — a property, not a baseline accident', () => {
    /* Owner: *"vertically center the icon with the weapon name."* This is the
     * thing the old inline-text construction could not offer: an inline `Text`
     * has no box, so alignment was whatever the font's baseline happened to do.
     * `alignItems: 'center'` on the row makes it a stated property. */
    expect(styleBlock(INPUTBOX, 'quickGlyphRow')).toContain("alignItems: 'center'");
  });

  test('⚠⚠ the comfortable padding is on the ROW, so only marked chips pay for it', () => {
    /* `quick` is the chassis for EVERY chip — punch, kick, dodge, travel, the
     * golem, the dog. Widening its padding would grow all of them to solve a
     * problem only weapon chips have. */
    expect(styleBlock(INPUTBOX, 'quickGlyphRow')).toContain('paddingVertical: 2');
    expect(styleBlock(INPUTBOX, 'quick')).toContain('paddingVertical: 6');
  });

  test('⚠ the gaps scaled with the mark rather than staying at the 18dp values', () => {
    /* 2dp between an 18dp icon and the name reads as spacing; beside a 28 it
     * reads as a collision. The set moved together. */
    expect(styleBlock(INPUTBOX, 'quickGlyphArt')).toContain('marginRight: 4');
    expect(styleBlock(INPUTBOX, 'quickGlyphName')).toContain('marginLeft: 4');
    expect(styleBlock(INPUTBOX, 'quickMarkLead')).toContain('marginLeft: 9');
    expect(styleBlock(INPUTBOX, 'quickStarArt')).toContain('marginLeft: 7');
  });
});

describe('priority 4 — compact, but only after the rest', () => {
  test('⚠⚠⚠ NOTHING CLAMPS THE CHIP BACK DOWN', () => {
    /* The chip must size to its content. A `height`, a `maxHeight` or a
     * transform would silently re-impose the constraint the owner removed, and
     * the artwork would be squeezed by something no one is looking at. */
    const chip = styleBlock(INPUTBOX, 'quick');
    expect(chip).not.toBe('');
    expect(chip).not.toContain('height');       // catches height AND maxHeight
    expect(chip).not.toContain('transform');
    const row = styleBlock(INPUTBOX, 'quickGlyphRow');
    expect(row).not.toContain('height');
    expect(row).not.toContain('transform');
  });

  test('⚠ the mark stays SQUARE and keeps its aspect', () => {
    /* Owner: *"Keep the glyph square, preserve its aspect ratio."* A square box
     * plus `contain` on a 1:1 source is the pair that guarantees it — `contain`
     * alone in a non-square box would letterbox, and a square box alone with
     * `cover` would crop. */
    for (const name of ['quickGlyphArt', 'quickStarArt']) {
      const b = styleBlock(INPUTBOX, name);
      expect(b).toContain('width: GLYPH_ART_SIZE.combat');
      expect(b).toContain('height: GLYPH_ART_SIZE.combat');
    }
    const code = codeOf(INPUTBOX);
    const marks = code.match(/resizeMode="contain"/g) ?? [];
    expect(marks.length).toBeGreaterThanOrEqual(2);   // the mark and the star
  });

  test('⚠⚠ and no black box came back with the extra height', () => {
    /* Owner, again: *"remove any obsolete black glyph box."* The taller chip is
     * the moment someone might reach for a ground to "anchor" the bigger mark. */
    for (const name of ['quickGlyphArt', 'quickStarArt', 'quickGlyphRow']) {
      expect(styleBlock(INPUTBOX, name)).not.toContain('backgroundColor');
      expect(styleBlock(INPUTBOX, name)).not.toContain('textShadow');
    }
    // ⚠ the character fallback keeps its ground — its problem is unchanged, and
    // no catalog weapon can reach it. See OTA-1766.
    expect(INPUTBOX).toContain("backgroundColor: '#0d0b09'");
  });
});

describe('the stamp', () => {
  test('names this pass', () => {
    expect(read('app', 'buildInfo.ts')).toContain("'2026-09-09-1767-the-button-grows'");
  });
});
