/**
 * OTA-1569 — THE GLYPH BRINGS ITS OWN GROUND.
 *
 * ⚠⚠⚠ MY ERROR, AND THE FIX OTA-1568 SHOULD HAVE BEEN. The owner, on a
 * screenshot of the acid alembic sitting on a strike-tone chip: *"look at the
 * acid symbol, it's blended into the active button color."* He is right. I chose
 * `#b4e619` — an acid green-yellow — for a glyph that renders on `quickStrike`'s
 * sage green `#9ec96a`. Same hue family. I picked a green to sit on a green
 * button.
 *
 * ⚠⚠⚠ BUT SWAPPING THE HUE WOULD ONLY MOVE THE COLLISION, and that is the part
 * worth writing down, because it is why this is a different fix rather than a
 * different colour. A quick chip has TWO fills that are nearly opposite: light
 * sage `#9ec96a` when it is a strike, near-black (`#1b2417`, `#1a1714`)
 * otherwise. I was hunting for six hues that read on BOTH at once. No such set
 * exists — every colour bright enough to carry on the black chip is at risk on
 * the sage one, and every colour dark enough for the sage chip dies on the
 * black. OTA-1568 got one of the two conditions right and called it done.
 *
 * ⚠⚠ SO THE GLYPH STOPS CARING WHAT IS BEHIND IT. An inline `backgroundColor`
 * gives it a dark cell of its own, and every colour is then chosen against ONE
 * known backdrop instead of two hostile ones — permanently, including for any
 * coating added later. On the dark chips the cell matches the fill and is
 * invisible, which is correct: nothing there was ever broken.
 *
 * ⚠ THE HALO STAYS AND ITS JOB CHANGES. In 1568 it was the only thing that could
 * reach a colour emoji on the sage chip. It still reaches them — but now it also
 * softens the cell's hard edge, and on the dark chips it remains what it always
 * was: invisible and harmless.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { COATING_GLYPH, COATING_GLYPH_COLOR } from '../app/engine/weaponGlyphs';

const src = (p: string): string => readFileSync(join(__dirname, '..', p), 'utf8');
const INPUT = src('app/components/InputBox.tsx');

/** sRGB relative luminance, so "does this read on that" is measured, not eyeballed. */
function luminance(hex: string): number {
  const v = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * v[0]! + 0.7152 * v[1]! + 0.0722 * v[2]!;
}
function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x! + 0.05) / (y! + 0.05);
}

const CHIP_STRIKE = '#9ec96a';  // quickStrike fill — the light sage he photographed
const CHIP_DARK = '#1a1714';    // the default chip fill
const GLYPH_CELL = '#0d0b09';   // the new backing this OTA introduces

describe('OTA-1569 — the measurement that proves the 1568 colour was wrong', () => {
  /** The colour OTA-1568 shipped, kept as a literal so the failure stays on file. */
  const ACID_1568 = '#b4e619';

  it('⚠⚠⚠ THE FAILURE HE PHOTOGRAPHED, AS A NUMBER', () => {
    // 1.3:1. "Blended into the active button color" was not an opinion — an acid
    // green-yellow on a sage-green button is very nearly the same colour, and a
    // contrast check would have caught it before he ever saw it.
    expect(contrast(ACID_1568, CHIP_STRIKE)).toBeLessThan(1.5);
  });

  it('⚠⚠⚠ HIS COLOUR IS FAR BETTER, and STILL would not survive bare on the sage', () => {
    // He sent the reference: burnt orange is what corrosive-hazard warnings use,
    // and real acid burns are charred browns and deep oranges, not neon green.
    // It is a large improvement — 1.3 → 2.26 — and it is STILL under the 3:1 bar
    // for a graphical object. That is the proof that the cell is load-bearing
    // rather than belt-and-braces: even a well-chosen hue needs it.
    expect(COATING_GLYPH_COLOR.acid).toBe('#cc5500');
    const bare = contrast(COATING_GLYPH_COLOR.acid, CHIP_STRIKE);
    expect(bare).toBeGreaterThan(contrast(ACID_1568, CHIP_STRIKE));
    expect(bare).toBeLessThan(3);
  });

  it('⚠⚠⚠ …AND ON ITS OWN CELL IT READS EASILY', () => {
    // 4.55:1 — comfortably past the 3:1 WCAG bar for a graphical object, and past
    // the stricter 4.5 text bar as well. The colour was never the problem once it
    // had a ground of its own.
    expect(contrast(COATING_GLYPH_COLOR.acid, GLYPH_CELL)).toBeGreaterThan(4.5);
  });

  it('⚠⚠⚠ EVERY GLYPH COLOUR CLEARS THE BAR ON THE CELL — all six, not just acid', () => {
    // The point of a fixed backdrop: one check covers the whole table, and any
    // colour added later is checked the same way instead of being eyeballed
    // against two different chips.
    for (const kind of Object.keys(COATING_GLYPH)) {
      const hex = COATING_GLYPH_COLOR[kind as keyof typeof COATING_GLYPH_COLOR];
      // 3:1 is the WCAG bar for a graphical object (1.4.11); every entry in fact
      // clears the stricter 4.5 text bar too, acid included at 4.55.
      expect({ kind, ok: contrast(hex, GLYPH_CELL) > 4.5 }).toEqual({ kind, ok: true });
    }
  });

  it('⚠⚠ AND THIS IS WHY A HUE SWAP COULD NOT HAVE WORKED', () => {
    // The structural claim, measured: no colour clears 4.5:1 against BOTH the
    // sage chip and the dark chip. Anything that reads on one is at risk on the
    // other, so a palette hunt was never going to end.
    const survives = (hex: string) => contrast(hex, CHIP_STRIKE) > 3 && contrast(hex, CHIP_DARK) > 3;
    for (const hex of Object.values(COATING_GLYPH_COLOR)) {
      expect({ hex, both: survives(hex) }).toEqual({ hex, both: false });
    }
    // His burnt orange included — the best-chosen hue in the table still fails
    // the two-ground test, which is the whole argument for the cell.
    expect(survives(COATING_GLYPH_COLOR.acid)).toBe(false);
    // Not a quirk of my six — it holds for pure black and pure white too, which
    // are the extreme cases any palette would reach for.
    expect(survives('#000000')).toBe(false);
    expect(survives('#ffffff')).toBe(false);
  });

  it('⚠ the cell is genuinely dark, and invisible on the chips that never broke', () => {
    expect(luminance(GLYPH_CELL)).toBeLessThan(luminance(CHIP_DARK) + 0.01);
    expect(contrast(GLYPH_CELL, CHIP_DARK)).toBeLessThan(1.4);
  });
});

describe('OTA-1569 — the wiring', () => {
  it('⚠⚠⚠ the glyph carries its own background', () => {
    expect(INPUT).toContain("backgroundColor: '#0d0b09',");
  });

  it('⚠⚠ the halo from 1568 is kept — it still reaches the colour emoji', () => {
    // ❄ is a colour emoji: deaf to `color:`, so the cell alone would leave it
    // unoutlined. Both mechanisms are load-bearing.
    expect(INPUT).toContain("textShadowColor: '#000000',");
    expect(INPUT).toContain('textShadowOffset: { width: 0, height: 0 },');
  });

  it('⚠⚠ a mark is never clamped to its own exact box — by a margin now, by hair spaces before', () => {
    /* ⚠⚠⚠ OTA-1766 MOVED THE MECHANISM AND KEPT THE CLAIM, WHICH IS THE ONLY
     * HONEST WAY TO UPDATE A PIN. The combat label stopped being one inline
     * `<Text>` and became a `<View>` row of measured boxes, on the owner's
     * instruction: *"handle the combat image layout appropriately rather than
     * trying to force the images into the old inline text-glyph
     * construction."* */
    /* ⚠ THE CLAIM — "a mark clamped to the glyph's exact box reads as a clipping
     * artifact rather than a deliberate inlay" — is unchanged. HAIR SPACES were
     * the only way to say that inside a text flow, because an inline `Text` in
     * React Native takes no padding. A box in a row takes a margin, so the
     * artwork gets its breathing room as a layout property.
     * ⚠⚠ THE HAIR SPACES SURVIVE ON THE FALLBACK, AND THAT IS NOT AN OVERSIGHT:
     * `degradation` and `stun` have no artwork, so they still paint a CHARACTER,
     * still inline, still with no box of its own. The workaround is kept exactly
     * where the problem it solves still exists. */
    /* ⚠⚠⚠ AND THIS ASSERTION ITSELF PINNED A NUMBER AND BROKE ONE OTA LATER,
     * WHICH IS THE FOURTH TIME IN THIS ROLLOUT AND THE MOST EMBARRASSING. I
     * rewrote it in OTA-1766 *while explaining that pinning a mechanism is how a
     * suite goes red on a pass that kept its promise* — and then pinned the
     * literal margin, which is mechanism. OTA-1767 scaled the gaps with the mark
     * (18dp → 28dp) and this went red on a pass that made the thing MORE
     * readable. The fix is to assert the RULE the gap exists to express. */
    expect(INPUT).toContain('quickGlyphArt: { width: GLYPH_ART_SIZE.combat');
    /* ⚠ The claim is that a mark HAS breathing room, not how much. */
    const gap = Number(/quickGlyphArt: \{[^}]*marginRight: (\d+)/.exec(INPUT)?.[1]);
    expect(Number.isFinite(gap)).toBe(true);
    expect(gap).toBeGreaterThan(0);
    // the fallback character keeps its padding, because it is still inline text
    expect(INPUT).toContain('\\u200a${ch}\\u200a');
  });

  it('⚠⚠⚠ THE BREADCRUMB IS STILL UNTOUCHED — the padding never reaches `label`', () => {
    // OTA-1172: the tap breadcrumb is forensic evidence in the freeze hunt. The
    // hair spaces are added in the JSX only; `logUiTap` still logs the flat
    // string OTA-1553 built, so `tap "⚗ auralite talon"` stays greppable.
    expect(INPUT).toContain('logUiTap(label);');
    /* ⚠⚠⚠ RE-AIMED BY OTA-1781 — PIN THE CLAIM, NEVER THE MECHANISM.
     * This pinned the fallback element character for character:
     *   `<Text style={textStyle}>{label.toUpperCase()}</Text>`
     * The claim is that a chip with no glyphs still paints the FLAT LABEL off
     * `textStyle` — nothing about what ELSE may style it. OTA-1781 added the
     * weapon-name size to that same element and THREE suites went red on a
     * change that left all three claims intact: this one, and OTA-1569's or
     * OTA-1568's, and OTA-1766's. One literal pinned in three places is three
     * chances to be wrong about the same thing. */
    expect(INPUT).toMatch(/<Text style=\{\[?textStyle[\s\S]{0,90}?\}>\{label\.toUpperCase\(\)\}<\/Text>/);
  });
});
