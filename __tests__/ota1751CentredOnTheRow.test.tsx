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
  test('⚠⚠ it sits LEFT of the tile\'s centre, to balance against the text', () => {
    const b = styleBlock('dossierFieldCompact');
    const centre = num(b, 'left') + (100 - num(b, 'left') - num(b, 'right')) / 2;
    expect(centre).toBeLessThan(45);          // decisively left of 50%
    expect(centre).toBeGreaterThan(25);       // ...but not pinned to the edge
    expect(num(b, 'left')).toBeGreaterThan(0); // whole width still on the tile
    expect(num(b, 'right')).toBeGreaterThan(0);
  });

  test('moving it did not cost coverage — still 42% of the tile', () => {
    // The owner's floor from OTA-1750 was a third. Moving the box must not
    // quietly shrink it, so the width is asserted independently of position —
    // which is what let OTA-1752 slide it left without re-arguing the size.
    const b = styleBlock('dossierFieldCompact');
    const width = 100 - num(b, 'left') - num(b, 'right');
    expect(width).toBe(42);
    expect(width / 100).toBeGreaterThanOrEqual(1 / 3);
  });

  test('it stays vertically centred — only the HORIZONTAL centre moved', () => {
    const b = styleBlock('dossierFieldCompact');
    expect(num(b, 'top')).toBe(num(b, 'bottom'));
    expect(num(b, 'top')).toBeLessThan(0); // ...and still cropped by the tile
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

  test('the expanded card is untouched by this pass', () => {
    // Only the collapsed tile was under discussion; the composition the owner
    // approved keeps its geometry AND its alpha.
    const a = styleBlock('dossierField');
    expect(num(a, 'top')).toBe(-18);
    expect(num(a, 'bottom')).toBe(-18);
    expect(num(a, 'right')).toBe(-8);
    expect(num(a, 'left')).toBe(32);
    expect(num(a, 'opacity')).toBe(0.13);
  });
});

describe('what is deliberately NOT solved yet', () => {
  test('⚠⚠ there is still no per-faction offset, and that is on purpose', () => {
    /* Recorded so the next pass starts from the truth rather than rediscovering
     * it: ONE set of insets serves all nine crests, so each faction shows
     * whatever part of itself happens to fall in that window. The owner spotted
     * this before the code did. Fixing it properly means a table keyed by
     * faction id — the same shape as `CRESTS` in engine/factionCrests — not more
     * tuning of these four numbers. This test fails the moment someone adds that
     * table, which is the point: it should be a decision, not a drift. */
    expect(TITLE).not.toMatch(/FIELD_OFFSETS|fieldOffsetFor|crestOffset/);
    const b = styleBlock('dossierFieldCompact');
    expect(Number.isFinite(num(b, 'left'))).toBe(true); // one static inset, not a lookup
  });

  test('the build stamp names this pass', () => {
    expect(read('app', 'buildInfo.ts')).toContain("'2026-09-08-1751-centred-on-the-row'");
  });
});
