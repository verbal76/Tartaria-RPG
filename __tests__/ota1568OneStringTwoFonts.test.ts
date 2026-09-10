/**
 * OTA-1568 — ONE STRING, TWO FONTS.
 *
 * ⚠⚠⚠ THE OWNER, LOOKING AT A FROST-COATED PIKE ON A STRIKE CHIP: *"The
 * snowflake being blue is hard to see on the green background. is there any way
 * to get a black outline around it? And the acid symbol has no color at all. can
 * we give it some kind of coloring."*
 *
 * ⚠⚠⚠ THOSE TWO COMPLAINTS ARE ONE ROOT CAUSE WEARING OPPOSITE SYMPTOMS, which
 * is the whole reason this is a single OTA. OTA-1553 put six characters into a
 * label string and nothing ever DECIDED how they render. Android picks a
 * presentation per codepoint out of font fallback:
 *
 *   `❄` → a COLOR emoji font. Permanently that one blue, deaf to `color:`, and
 *         invisible against `quickStrike`'s light sage `#9ec96a`.
 *   `⚗` → a MONOCHROME text font. Inherits the chip's own label colour, which is
 *         why it reads as "no colour at all".
 *
 * One string, two fonts, no control over either. Six glyphs whose appearance was
 * decided by whichever font happened to claim them.
 *
 * ⚠⚠ SO THE FIX IS TWO MECHANISMS, because neither reaches both cases. A BLACK
 * HALO is the only thing that can touch a colour emoji — a text shadow is drawn
 * from the glyph's own alpha mask, so it outlines `❄` without needing to
 * recolour it. A PER-KIND COLOUR reaches the monochrome ones, giving acid a hue
 * of its own. Applying only one of the two would have fixed exactly half of what
 * he reported.
 *
 * ⚠⚠ AND THE COLOURS ARE CHOSEN FOR BOTH CHIP FILLS AT ONCE. `quickStrike` is
 * light sage `#9ec96a`; `quickReady` and the default chip are near-black
 * (`#1b2417`, `#1a1714`). No single hue reads on both — which is why the halo is
 * load-bearing rather than decorative: it lets the glyphs stay BRIGHT so they
 * carry on the dark chips, while the black outline separates them from the light
 * one.
 *
 * ⚠⚠ FOOTNOTE, OTA-1800 (2026-09-10): the "light sage `quickStrike`" this
 * header argues against no longer exists. The owner ruled the equipped weapon
 * control DARK, so every combat chip now has a near-black body and the strike
 * label wears the sage instead. The halo is NOT thereby decoration: it is still
 * the only technique that reaches a COLOUR EMOJI, whose own colours no chip
 * background can override, which is the case this header opened with. What the
 * ruling removed is the SECOND reason — "no single hue reads on both fills" —
 * because there is only one kind of fill left.
 *
 * ⚠ HONESTLY STATED, HERE AND IN THE SOURCE: on a device that renders `🔥` as a
 * colour emoji, its colour entry does nothing. The colours are the fallback for
 * the text-presentation case. An emoji's own colours cannot be overridden, and
 * this OTA does not pretend otherwise — the halo is what serves those.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  combatWeaponLabel,
  combatWeaponLabelParts,
  COATING_GLYPH,
  COATING_GLYPH_COLOR,
} from '../app/engine/weaponGlyphs';
import type { InventoryItem } from '../app/engine/types';

const src = (p: string): string => readFileSync(join(__dirname, '..', p), 'utf8');
const coated = (kind: string, kind2?: string): Pick<InventoryItem, 'coating' | 'coating2'> =>
  ({
    coating: { kind, dice: '1d4' },
    ...(kind2 ? { coating2: { kind: kind2, dice: '1d4' } } : {}),
  } as Pick<InventoryItem, 'coating' | 'coating2'>);

describe('OTA-1568 — the split says exactly what the flat label says', () => {
  it('⚠⚠⚠ THE PARTS REASSEMBLE INTO THE BREADCRUMB, CHARACTER FOR CHARACTER', () => {
    // ⚠ This is the assertion that makes the change safe. `combatWeaponLabel` is
    // still the single source of the flat string, because that string is ALSO
    // the tap breadcrumb (logUiTap) and the screen-reader label — and OTA-1172
    // is on record that the breadcrumb is forensic evidence in the freeze hunt.
    // A second builder that drifted would corrupt the log the crash reports are
    // read from.
    const cases: Array<[string, Pick<InventoryItem, 'coating' | 'coating2'> | null, string | null, string[]]> = [
      ['Crude Golem Pike', coated('cold'), 'piercing', []],
      ['Bone Crossbow', coated('burn'), 'piercing', ['burn']],
      ['Acid-Etched Cudgel', coated('acid'), 'bludgeoning', []],
      ['Cudgel', coated('acid', 'poison'), 'bludgeoning', ['poison']],
      ['Aetheric Rod', null, 'aetheric', ['aetheric']],
      ['Plain Stick', null, null, []],
    ];
    for (const [name, item, raw, weak] of cases) {
      const flat = combatWeaponLabel(name, item, raw, weak);
      const parts = combatWeaponLabelParts(name, item, raw, weak);
      // ⚠ OTA-1636 — the base glyph is the fourth piece, last, after the star.
      const rebuilt = (parts.glyphs.length > 0
        ? `${parts.glyphs.map((g) => g.ch).join('')} ${parts.text}`
        : parts.text) + (parts.base ? ` ${parts.base.ch}` : '') + (parts.star ? ' ★' : ''); // OTA-1636 base, OTA-1638 star last
      expect({ name, rebuilt }).toEqual({ name, rebuilt: flat });
    }
  });

  it('⚠⚠⚠ EVERY COATING KIND HAS BOTH A GLYPH AND A COLOUR', () => {
    // A kind with a glyph and no colour would render at whatever the label
    // happens to be — which is the `⚗` bug, re-created for a different coating.
    for (const kind of Object.keys(COATING_GLYPH)) {
      expect({ kind, glyph: !!COATING_GLYPH[kind as keyof typeof COATING_GLYPH] })
        .toEqual({ kind, glyph: true });
      expect({ kind, colour: COATING_GLYPH_COLOR[kind as keyof typeof COATING_GLYPH_COLOR] })
        .toMatchObject({ colour: expect.stringMatching(/^#[0-9a-f]{6}$/) });
    }
    expect(Object.keys(COATING_GLYPH_COLOR).sort()).toEqual(Object.keys(COATING_GLYPH).sort());
  });

  it('⚠⚠⚠ ACID IS THE ONE HE ASKED FOR, and it is no longer the label colour', () => {
    // `⚗` renders monochrome, so it inherited the chip's own text — `#15180f` on
    // a strike chip, `#9ec96a` on a ready one. Now it is acid green-yellow on
    // both, which is the entire ask.
    // ⚠ RETARGETED BY OTA-1569. The hex moved — my `#b4e619` was an acid green
    // sitting on a sage-green button, which is the collision he photographed —
    // but the PROPERTY this pins is unchanged and is the thing he asked for:
    // acid has a colour of its own instead of inheriting the chip's label.
    //
    // ⚠⚠ AND OTA-1800 MADE THE LAST LINE READ ITS SOURCE INSTEAD OF A HEX. The
    // owner ruled the equipped weapon dark, so the strike LABEL colour moved
    // from soot `#15180f` to the sage `#9ec96a` the body used to wear. The line
    // below existed to name "whatever the strike chip's own lettering is", so
    // that acid could be asserted NOT to be it; hard-coding that value made it
    // a spelling pin that the next repaint breaks for no reason. It now reads
    // the colour out of the shipped style, which is both the same claim and a
    // stronger one — the property survives any future repaint in either
    // direction.
    const INPUT = src('app/components/InputBox.tsx');
    const strikeInk = /quickStrikeText: \{ color: '(#[0-9a-fA-F]{6})'/.exec(INPUT)?.[1];
    expect(strikeInk).toBeDefined();
    expect(COATING_GLYPH_COLOR.acid).not.toBe(strikeInk);
    expect(COATING_GLYPH_COLOR.acid).not.toBe('#15180f');
    expect(COATING_GLYPH_COLOR.acid).not.toBe('#9ec96a');
    expect(COATING_GLYPH_COLOR.acid).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('⚠⚠ NO TWO COATINGS SHARE A COLOUR — six glyphs must stay six signals', () => {
    const hues = Object.values(COATING_GLYPH_COLOR);
    expect(new Set(hues).size).toBe(hues.length);
  });

  it('⚠⚠ TWO COATINGS PRODUCE TWO STYLED GLYPHS, not one merged string', () => {
    // A Crucible-upgraded weapon carries `coating2`. Merging them would put both
    // under one colour and lose the second signal entirely.
    const parts = combatWeaponLabelParts('Cudgel', coated('acid', 'poison'), 'bludgeoning', []);
    expect(parts.glyphs.map((g) => g.kind)).toEqual(['acid', 'poison']);
    expect(parts.glyphs.map((g) => g.ch)).toEqual([COATING_GLYPH.acid, COATING_GLYPH.poison]);
  });

  it('⚠ an uncoated weapon yields no glyphs, and the label is just the name', () => {
    const parts = combatWeaponLabelParts('Crude Golem Pike', null, 'piercing', []);
    expect(parts.glyphs).toEqual([]);
    expect(parts.text).toBe('golem pike');
  });

  it('⚠ the weakness star rides the TEXT, never a glyph', () => {
    // The star is not a coating and must not pick up a coating colour.
    const parts = combatWeaponLabelParts('Bone Crossbow', coated('burn'), 'piercing', ['burn']);
    // OTA-1638 — the star is its own piece now, painted after the base glyph.
    expect(parts.text).toBe('bone crossbow');
    expect(parts.star).toBe(true);
    expect(parts.glyphs.map((g) => g.ch).join('')).not.toContain('★');
  });
});

describe('OTA-1568 — the wiring', () => {
  const INPUT = src('app/components/InputBox.tsx');

  it('⚠⚠⚠ THE HALO IS A SHADOW, CENTRED, because nothing else reaches an emoji', () => {
    // React Native cannot stroke a glyph outline. A text shadow is drawn from the
    // glyph's alpha mask, which is the only technique that touches a colour
    // emoji — and `❄` is a colour emoji, so this is the ONLY thing that could
    // have answered "can we get a black outline around it".
    expect(INPUT).toContain("textShadowColor: '#000000',");
    // Offset 0/0 makes it a halo on every side rather than a drop shadow on two.
    expect(INPUT).toContain('textShadowOffset: { width: 0, height: 0 },');
    expect(INPUT).toContain('textShadowRadius: 3,');
  });

  it('⚠⚠⚠ THE BREADCRUMB IS UNTOUCHED — logUiTap still gets the flat string', () => {
    // OTA-1172: the tap breadcrumb is how a freeze report tells "the tap never
    // arrived" from "the tap arrived and the work hung". Restyling a button must
    // not rewrite the evidence.
    expect(INPUT).toContain('logUiTap(label);');
    expect(INPUT).toContain('accessibilityLabel={cooldownFill !== undefined && cooldownFill < 1');
  });

  it('⚠⚠ each glyph still gets its own colour — on the path where colour is still ours to give', () => {
    /* ⚠⚠⚠ OTA-1766 MOVED THE MECHANISM AND KEPT THE CLAIM, WHICH IS THE ONLY
     * HONEST WAY TO UPDATE A PIN. The combat label stopped being one inline
     * `<Text>` and became a `<View>` row of measured boxes, on the owner's
     * instruction: *"handle the combat image layout appropriately rather than
     * trying to force the images into the old inline text-glyph
     * construction."* */
    /* ⚠⚠⚠ AND THIS OTA'S WHOLE PROBLEM IS GONE, WHICH IS WHY THE ASSERTION MOVED
     * RATHER THAN BEING WEAKENED. OTA-1568 existed because ONE STRING RENDERED IN
     * TWO FONTS: Android picks a presentation per codepoint, so `❄` landed in a
     * colour-emoji font (deaf to `color:`) while `⚗` landed in a monochrome one
     * (borrowing the label's colour). Two mechanisms were needed — a halo for the
     * emoji, a per-kind colour for the text — because neither could serve both.
     * Illustrated artwork is neither: it is a PNG, its colour is in the pixels,
     * and no font fallback gets a vote. That failure mode cannot occur on a mark
     * the pack draws.
     * ⚠ So the per-kind colour is asserted where it still applies — the character
     * fallback for the two types with no artwork — and it is still read from the
     * shared table rather than a local copy, which was this OTA's other claim. */
    expect(INPUT).toContain('color={COATING_GLYPH_COLOR[g.kind]}');
    expect(INPUT).toContain('styles.coatGlyph, { color }');
    // ⚠ the artwork path takes NO colour at all: no tint, ever
    expect(INPUT).not.toContain('tintColor');
  });

  it('⚠⚠ a chip with no glyphs renders exactly as it did before this OTA', () => {
    // Every non-weapon chip (dodge, golem, the dog, travel) passes no glyphs, so
    // it must take the untouched path. This is what makes the OTA cheap to roll
    // back: the change is confined to weapon chips that carry a coating.
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
    // OTA-1636: a base-typed weapon with no coats takes the painted path too,
    // so the guard now reads `(glyphs && glyphs.length > 0) || baseGlyph`.
    expect(INPUT).toContain('{(glyphs && glyphs.length > 0) || baseGlyph ? (');
  });

  it('⚠ both hands are wired, not just the main', () => {
    expect(INPUT.match(/glyphs=\{parts\.glyphs\} glyphText=\{parts\.text\}/g)?.length).toBe(2);
  });
});
