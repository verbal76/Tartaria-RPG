/* ⚠⚠⚠ OTA-1826 — THE CHARACTER RECORD PRESSES WITHOUT OPENING A HOLE.
 *
 * Owner, on the Pixel and earlier on Apple: pressing a character choice exposes
 * a BLACK RECTANGLE along the record's TOP edge, for exactly as long as the
 * finger is down. The depressed movement itself is intended and is not in
 * question. The hole above it is.
 *
 * ⚠⚠ THIS IS THE THIRD APPEARANCE OF ONE GEOMETRY, and the screen already
 * describes the other two in its own comments:
 *
 *   1. TSettle's resting pose settled to 0, so every collapsed record sat
 *      permanently 4dp low inside its own parent — "the strip of parent left
 *      uncovered above each card is the thin dark seam the owner photographed
 *      immediately above the gold rim". Fixed by making rest 1.
 *   2. OTA-1822: `kit.controlPressed` sat on `dossierOuter`, the shadow CASTER,
 *      so pressing slid the shadow out from under the card and 3dp of near-
 *      opaque black appeared BELOW it. Fixed by moving the travel to the rim.
 *
 * Repair 2 cured the bottom edge and, by the same arithmetic, moved the
 * uncovered strip to the TOP. It traded edges rather than closing the hole.
 *
 * ⚠⚠⚠ THE MECHANISM, and it needs no platform to explain it. `dossierRim` is
 * the ONLY layer in this subtree that paints. `dossierOuter` carried a shadow
 * and nothing else — no background, no border. `kit.controlPressed` translates
 * the rim down 3dp, so 3dp of the outer's frame is uncovered, and it was
 * transparent. The screen `container` is `backgroundColor: 'transparent'`, so
 * what showed through was:
 *
 *   Android — the app backdrop, because `elevation` is DELIBERATELY absent here
 *             (the screen says so: Android's elevation ignores `shadowOffset`
 *             and would paint a halo above the plate as well as below).
 *   iOS     — that same backdrop PLUS the #000 drop shadow this view anchors,
 *             which since OTA-1822 no longer travels with the card.
 *
 * Both read as a black rectangle, which is why the owner saw it on both.
 *
 * ⚠ THE REPAIR IS THE HOLE, NOT THE TRAVEL. The outer now carries the rim's own
 * resting fill and radius. The rim fills the outer exactly — the outer has no
 * padding — so at rest and on release this is invisible; the travel is
 * untouched at translateY(3); the shadow did not move. Nothing else on the
 * character choice screen changes.
 *
 * ⚠⚠ WHAT THIS SUITE CANNOT DO. It reads construction, not pixels. There is no
 * device, simulator or screenshot in this environment, so the final proof that
 * the black rectangle is gone is the owner's eye on hardware. Nothing below
 * claims otherwise.
 */
import fs from 'fs';
import path from 'path';
import { StyleSheet } from 'react-native';
import { tartariaKitStyles as kit } from '../app/ui/tartariaKit';

const TITLE = fs.readFileSync(
  path.join(__dirname, '..', 'app', 'screens', 'TitleScreen.tsx'), 'utf8',
);

/* ⚠⚠ CODE ONLY, COMMENTS STRIPPED — the repo has been bitten by this twice and
 * writes it down each time: a ratchet that fires on the ⚠ block EXPLAINING the
 * defect teaches the next author to delete the explanation. This screen quotes
 * `kit.controlPressed` and `dossierRimPressed` in prose several times. */
const CODE = TITLE
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

/** the body of a `name: { … }` style block, stopping at the first `}` exactly
 *  as the OTA-1822 suite does — enough for every flat property we assert. */
const blockOf = (name: string) =>
  new RegExp(`${name}:\\s*\\{([^}]*)\\}`).exec(TITLE)?.[1] ?? '';
const fillOf = (name: string) =>
  /backgroundColor:\s*'([^']+)'/.exec(blockOf(name))?.[1];

/** the style array literal of a Pressable, located by its opening styles. */
const styleArrayAt = (anchor: string) => {
  const i = TITLE.indexOf(anchor);
  if (i < 0) return '';
  return TITLE.slice(i, TITLE.indexOf(']', i) + 1);
};
const OUTER_COLLAPSED = 'styles.dossierOuter, !bootGateOpen';
const OUTER_OPEN = 'styles.dossierOuter, styles.dossierOuterOpen';

describe('OTA-1826 §1 — the defect: the travel gap must not be transparent', () => {
  test('1.1 the rim is still the only bordered, travelling layer', () => {
    // if this ever stops being true the whole diagnosis needs re-deriving
    expect(blockOf('dossierRim')).toMatch(/borderWidth:\s*1/);
    expect(blockOf('dossierOuter')).not.toMatch(/borderWidth:/);
  });

  test('1.2 ⚠ THE REPAIR — the outer paints, so the vacated strip is not a hole', () => {
    expect(fillOf('dossierOuter')).toBeTruthy();
  });

  test('1.3 …and it paints the card\'s own material, not an invented tone', () => {
    expect(fillOf('dossierOuter')).toBe(fillOf('dossierRim'));
    expect(fillOf('dossierOuterOpen')).toBe(fillOf('dossierRimOpen'));
    expect(fillOf('dossierOuterDead')).toBe(fillOf('dossierRimDead'));
  });

  test('1.4 the outer is radiused like the card, so the strip is not a square corner', () => {
    const rimR = /borderRadius:\s*(\d+)/.exec(blockOf('dossierRim'))?.[1];
    const outR = /borderRadius:\s*(\d+)/.exec(blockOf('dossierOuter'))?.[1];
    expect(outR).toBe(rimR);
  });

  test('1.5 ⚠ the outer still has NO padding — the rim must cover it exactly at rest', () => {
    // any padding here would reintroduce a permanently visible band, which is
    // the resting-state half of this same defect.
    expect(blockOf('dossierOuter')).not.toMatch(/padding/);
  });
});

describe('OTA-1826 §2 — the press the owner asked to keep is untouched', () => {
  test('2.1 the travel is still 3dp, and still comes from the kit', () => {
    const down = StyleSheet.flatten(kit.controlPressed) as {
      transform?: { translateY?: number }[];
    };
    expect(down.transform?.[0]?.translateY).toBe(3);
  });

  test('2.2 the travel still rides the RIM, never the shadow-caster (OTA-1822 holds)', () => {
    expect(TITLE).toContain('pressed && kit.controlPressed, pressed && styles.dossierRimPressed');
    expect(TITLE).toContain('pressed && kit.controlPressed, pressed && styles.dossierRimOpenPressed');
    expect(styleArrayAt(OUTER_COLLAPSED)).not.toContain('kit.controlPressed');
    expect(styleArrayAt(OUTER_OPEN)).not.toContain('kit.controlPressed');
  });

  test('2.3 the shadow is unmoved — same colour, opacity, radius and offset', () => {
    const o = blockOf('dossierOuter');
    expect(o).toMatch(/shadowColor:\s*'#000'/);
    expect(o).toMatch(/shadowOpacity:\s*0\.5/);
    expect(o).toMatch(/shadowRadius:\s*6/);
    expect(o).toMatch(/shadowOffset:\s*\{\s*width:\s*0,\s*height:\s*3/);
    expect(blockOf('dossierOuterOpen')).toMatch(/shadowOpacity:\s*0\.62/);
  });

  test('2.4 ⚠ still no `elevation` on a record — the Android halo stays banished', () => {
    for (const n of ['dossierOuter', 'dossierOuterOpen', 'dossierOuterDead']) {
      expect(blockOf(n)).not.toMatch(/elevation/);
    }
  });

  test('2.5 every press mark is still behind `pressed` — release restores rest', () => {
    const marks = [...CODE.matchAll(/kit\.controlPressed|styles\.dossierRim(?:Open)?Pressed/g)];
    expect(marks.length).toBeGreaterThan(0);
    for (const m of marks) {
      const before = CODE.slice(Math.max(0, m.index! - 40), m.index!);
      expect(before).toMatch(/pressed &&\s*$/);
    }
  });
});

describe('OTA-1826 §3 — the card is otherwise exactly as it was', () => {
  test('3.1 position and dimensions unchanged — the outer still only spaces itself', () => {
    const o = blockOf('dossierOuter');
    expect(o).toMatch(/marginVertical:\s*3/);
    /* ⚠ THE NESTED OBJECT HAS TO GO FIRST. `shadowOffset: { width: 0, height: 3 }`
     * legitimately contains both `width:` and `height:`, so a naive search — and
     * then a brace-anchored one — both flagged the shadow this repair is
     * explicitly preserving. Twice wrong before it was right; the assertion now
     * reads only the outer's OWN top-level properties. */
    const flat = o.replace(/\w+:\s*\{[^}]*/g, '');
    for (const forbidden of ['width', 'height', 'flex', 'marginTop', 'marginBottom', 'marginHorizontal']) {
      expect(flat).not.toMatch(new RegExp(`\\b${forbidden}:`));
    }
  });

  test('3.2 the resting composition is untouched — rim, face, spine, corners, field', () => {
    for (const piece of [
      /styles\.dossierRim/, /styles\.dossierFace/, /styles\.spine/,
      /<TCorners/, /<DossierField/,
    ]) expect(TITLE).toMatch(piece);
  });

  test('3.3 artwork, names and the crest are untouched by this repair', () => {
    expect(TITLE).toMatch(/crest=\{crest\}/);
    expect(TITLE).toMatch(/\{item\.playerName\}/);
  });

  test('3.4 selection and navigation are unchanged', () => {
    expect(TITLE).toMatch(/onPress=\{\(\) => setExpandedSlotId\(item\.slotId\)\}/);
    expect(TITLE).toMatch(/onPress=\{\(\) => onSlotTap\(item\)\}/);
  });
});

describe('OTA-1826 §4 — every character choice is covered by the one authority', () => {
  test('4.1 both records — collapsed and selected — take the repaired outer', () => {
    expect(styleArrayAt(OUTER_COLLAPSED)).toContain('styles.dossierOuter');
    expect(styleArrayAt(OUTER_OPEN)).toContain('styles.dossierOuter');
  });

  test('4.2 a dead record travels over rust, not over the live card\'s grey', () => {
    expect(styleArrayAt(OUTER_COLLAPSED)).toContain('item.dead && styles.dossierOuterDead');
    expect(styleArrayAt(OUTER_OPEN)).toContain('item.dead && styles.dossierOuterDead');
  });

  test('4.3 ⚠ the repair is a style, not a per-record patch — one outer, three fills', () => {
    const outers = [...TITLE.matchAll(/dossierOuter(?:Open|Dead)?:\s*\{/g)];
    expect(outers).toHaveLength(3);
  });
});
