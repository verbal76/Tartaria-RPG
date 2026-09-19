/**
 * OTA-1849 — LORE AND FALLEN SHARE ONE ROW.
 *
 * Owner ask, and it is a PRESENTATION repair with nothing behind it: the
 * exploration card's right column stacked four things in a 165px minimum —
 * ⚑ WORLD, the live mini-map, ◈ LORE, ☗ FALLEN — and the last two are both
 * secondary destinations a player opens between fights, not during one. Paired
 * on one row they give a whole row back to the map, which is `flex: 1` and
 * absorbs it without anybody resizing it by hand.
 *
 * ⚠ WHAT THIS SUITE IS FOR, said plainly. A row of two buttons is trivial to
 * write and trivial to get wrong in exactly one way: at the narrowest supported
 * phone the halves are 84pt and the longer label is eight letter-spaced
 * characters. So the tests that matter here are the WIDTH ARITHMETIC and the
 * NO-WRAP guarantee, not a census of JSX. Everything else in the file exists to
 * prove the repair stayed presentation-only — same control, same labels, same
 * handlers, same destinations, same tap ledger.
 *
 * ⚠⚠ AND THE ONE THING THIS SUITE CANNOT DO IS MEASURE A GLYPH. Jest has no
 * text shaper and the device fonts are not here, so §4 proves the SLOT is the
 * width the arithmetic says it is and §5 proves the failure mode is bounded to
 * one line. The remaining margin is small and is written down as a number in
 * §4 so the owner's hardware check has something to check against, rather than
 * being quietly asserted away.
 */
import fs from 'fs';
import path from 'path';
import React from 'react';
import renderer from 'react-test-renderer';
import { StyleSheet, View } from 'react-native';

import { TButton } from '../app/ui/tartariaKit';
import { DEVICE_PROFILES } from '../app/engine/keyboardSafeCard';

const EXP = fs.readFileSync(
  path.join(__dirname, '..', 'app', 'screens', 'ExplorationScreen.tsx'),
  'utf8',
);
const MINIMAP = fs.readFileSync(
  path.join(__dirname, '..', 'app', 'components', 'MiniMap.tsx'),
  'utf8',
);

/* ⚠ OTA-1847's rule, kept: a claim about what the code DOES is graded on code,
 * never on the comment beside it. Several of the assertions below are absence
 * claims, and a comment that merely mentions the thing would satisfy a naive
 * `not.toContain`. */
const codeOnly = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
const CODE = codeOnly(EXP);

/* ⚠ EVERY HELPER HERE IS TOTAL — it returns empty rather than throwing when
 * what it looks for is missing. A module-scope `expect` would abort the whole
 * file with "test suite failed to run", which is red but says nothing about
 * WHICH claim broke; the negative control for this repair is precisely "the
 * row is gone", so the row's absence has to reach the named tests. */

/** The `crestNavRow` element and everything nested inside it. */
const ROW_BLOCK = (() => {
  const open = CODE.indexOf('<View style={styles.crestNavRow}>');
  if (open < 0) return '';
  const close = CODE.indexOf('</View>', open);
  return close > open ? CODE.slice(open, close) : '';
})();

const styleBlock = (name: string) =>
  new RegExp(`\\n  ${name}:\\s*\\{[^{}]*\\},`).exec(EXP)?.[0] ?? '';

/* ⚠ `react-test-renderer` ships no declarations in this tree, so every node a
 * `findAll` predicate receives arrives as an implicit `any` and the test
 * typecheck counts one error per unannotated parameter. Naming the shape here
 * costs nothing and keeps this file from spending the gate's slack on four
 * errors that say nothing about the repair. */
type TestNode = { type: unknown; props: Record<string, unknown> };

/* ⚠ READ OFF THE TREE, NOT REMEMBERED. ExplorationScreen cannot be imported
 * here — it pulls gameStore and the whole native surface behind it, which is
 * why every suite that grades this screen reads its source instead (OTA-1746
 * set that precedent). So the gutter is PARSED from the declaration rather
 * than copied as a literal: change the constant and the arithmetic in §4
 * follows it, which is the whole point of naming it in the first place. */
const CREST_NAV_ROW_GAP = (() => {
  const m = /\nconst CREST_NAV_ROW_GAP = (\d+(?:\.\d+)?);/.exec(CODE);
  return m ? Number(m[1]) : NaN;
})();

// ═══ 1. THE TWO KEYS ARE SIBLINGS IN ONE ROW ═════════════════════════════════
describe('OTA-1849 §1 — one row, and the right two things in it', () => {
  test('LORE and FALLEN are both inside the row', () => {
    expect(ROW_BLOCK).toContain('CREST_LORE_LABEL');
    expect(ROW_BLOCK).toContain('CREST_FALLEN_LABEL');
    expect((ROW_BLOCK.match(/<TButton/g) ?? []).length).toBe(2);
  });

  test('WORLD and the mini-map are NOT in it — the pairing is the bottom two only', () => {
    /* The owner asked for LORE + FALLEN. WORLD keeps its own full-width row
     * above the map, and the map keeps the whole width between them. */
    expect(ROW_BLOCK).not.toContain('CREST_WORLD_LABEL');
    expect(ROW_BLOCK).not.toContain('<MiniMap');
  });

  test('the row is the LAST thing in the corner, so the freed height is the map\'s', () => {
    const row = CODE.indexOf('<View style={styles.crestNavRow}>');
    const map = CODE.indexOf('<MiniMap');
    const world = CODE.indexOf('CREST_WORLD_LABEL');
    expect(world).toBeLessThan(map);
    expect(map).toBeLessThan(row);
  });

  test('nothing stacks LORE or FALLEN on its own row any more', () => {
    /* The pre-repair spelling: a TButton carrying `styles.crestNavBtn` alone.
     * WORLD is the only key entitled to a full-width row now. */
    const soloSlots = CODE.match(/style=\{styles\.crestNavBtn\}/g) ?? [];
    expect(soloSlots.length).toBe(1);
    // ...and the one that still has it is WORLD. Sliced element-wise rather
    // than by a lazy window, which stops at the label and grades nothing.
    const at = CODE.indexOf('CREST_WORLD_LABEL', CODE.indexOf('<TButton'));
    const worldBtn = CODE.slice(CODE.lastIndexOf('<TButton', at), CODE.indexOf('/>', at));
    expect(worldBtn).toContain('style={styles.crestNavBtn}');
    expect(worldBtn).not.toContain('crestNavHalf');
  });
});

// ═══ 2. EQUAL WIDTH, AND IT IS THE FLEX THAT MAKES IT EQUAL ══════════════════
describe('OTA-1849 §2 — equal width by construction, not by a number', () => {
  test('both keys carry the same half-slot style and nothing else differs', () => {
    const halves = ROW_BLOCK.match(/style=\{\[styles\.crestNavBtn, styles\.crestNavHalf\]\}/g) ?? [];
    expect(halves.length).toBe(2);
  });

  test('the half is `flex: 1` and `minWidth: 0`, which is what divides a row', () => {
    const half = styleBlock('crestNavHalf');
    expect(half).not.toBe('');
    expect(half).toMatch(/flex:\s*1\b/);
    /* ⚠ Not decoration. A flex child in a row will not shrink below its text's
     * intrinsic width without this, so the pair would overflow the column's
     * right edge instead of dividing it — the exact defect the owner reported
     * on the Codex tab strip once already. */
    expect(half).toMatch(/minWidth:\s*0\b/);
  });

  test('neither key pins a width, a maxWidth or a basis that would break the split', () => {
    const half = styleBlock('crestNavHalf');
    expect(half).not.toMatch(/\bwidth:|\bmaxWidth:|\bflexBasis:/);
    expect(ROW_BLOCK).not.toMatch(/\bwidth:|\bmaxWidth:|\bflexBasis:/);
  });
});

// ═══ 3. A ROW THAT CANNOT BECOME A COLUMN ════════════════════════════════════
describe('OTA-1849 §3 — the row is a row, and it does not wrap', () => {
  test('crestNavRow declares the direction and the named gutter', () => {
    const row = styleBlock('crestNavRow');
    expect(row).not.toBe('');
    expect(row).toMatch(/flexDirection:\s*'row'/);
    expect(row).toContain('gap: CREST_NAV_ROW_GAP');
  });

  test('it does NOT declare flexWrap — wrapping is the forbidden failure mode', () => {
    /* Requirement 12: on supported narrow widths both keys stay on one line.
     * `flexWrap: 'wrap'` is the one property that would silently turn this
     * repair back into the stacked layout it replaced, on the narrowest device
     * and nowhere else — i.e. exactly where nobody would see it in review. */
    expect(styleBlock('crestNavRow')).not.toContain('flexWrap');
  });

  test('the gutter matches the vertical rhythm the stacked column already had', () => {
    // crestNavBtn's marginVertical: 3 on two adjacent keys = 6pt between them.
    expect(styleBlock('crestNavBtn')).toMatch(/marginVertical:\s*3\b/);
    expect(CREST_NAV_ROW_GAP).toBe(6);
  });
});

// ═══ 4. THE WIDTH ARITHMETIC, ON THE NARROWEST SUPPORTED PHONE ═══════════════
describe('OTA-1849 §4 — the one-row width is arithmetic over the real devices', () => {
  /* ⚠ Portrait point WIDTHS, paired by name with the heights the suite already
   * treats as the supported set (DEVICE_PROFILES, app/engine/keyboardSafeCard).
   * The heights live there because the keyboard rule needs them; the widths
   * live here because this is the first repair that needs them. The pairing is
   * asserted below so the two lists cannot drift apart silently. */
  const DEVICE_WIDTHS: Record<string, number> = {
    'iPhone SE 3': 375,
    'iPhone 8': 375,
    'iPhone 13 mini': 375,
    'iPhone 14': 390,
    'iPhone 15 Pro Max': 430,
  };

  // Every constant below is read off the tree, not remembered.
  const CONTAINER_PADDING = 8;   // styles.container
  const TOP_ROW_GAP = 6;         // styles.topRow
  const PANEL_FRAME_BORDER = 1;  // tartariaKitStyles.panelFrame
  const BTN_RIM_BORDER = 1;      // kit.btnRim
  const COMPACT_PAD_H = 8;       // kit.btnFaceCompact

  /** The width of the text box inside ONE of the two paired keys. */
  const textBoxAt = (windowWidth: number) => {
    const content = windowWidth - CONTAINER_PADDING * 2;
    const rightCol = (content - TOP_ROW_GAP) / 2;              // statsCol and rightCol are both flex: 1
    const inner = rightCol - PANEL_FRAME_BORDER * 2;
    const key = (inner - CREST_NAV_ROW_GAP) / 2;
    return key - BTN_RIM_BORDER * 2 - COMPACT_PAD_H * 2;
  };

  test('the device list this arithmetic runs over is the supported set', () => {
    expect(Object.keys(DEVICE_WIDTHS).sort()).toEqual(Object.keys(DEVICE_PROFILES).sort());
  });

  test('the five constants are what the tree actually declares', () => {
    expect(styleBlock('container')).toContain(`padding: ${CONTAINER_PADDING}`);
    expect(styleBlock('topRow')).toContain(`gap: ${TOP_ROW_GAP}`);
    const KIT = fs.readFileSync(
      path.join(__dirname, '..', 'app', 'ui', 'tartariaKit.tsx'), 'utf8',
    );
    expect(KIT).toContain(`panelFrame: { borderWidth: ${PANEL_FRAME_BORDER}`);
    expect(KIT).toMatch(new RegExp(`btnRim:\\s*\\{[\\s\\S]{0,80}borderWidth:\\s*${BTN_RIM_BORDER}\\b`));
    expect(KIT).toMatch(new RegExp(`btnFaceCompact:[^}]*paddingHorizontal:\\s*${COMPACT_PAD_H}\\b`));
  });

  /* ⚠⚠⚠ THE NUMBER THE OWNER'S HARDWARE CHECK IS AGAINST.
   * `☗ FALLEN` is eight characters at fontSize 10 / fontWeight 800 with
   * letterSpacing 1.8 (kit.btnTextCompact). Six uppercase letters and a space
   * in a bold UI face measure about 39pt at 10pt; ☗ (U+2617) is not in SF Pro
   * or Roboto and falls to a symbol font, where a square em is the usual
   * result — call it 10. Letter-spacing adds 1.8 after each of the eight.
   *   39 + 10 + 14.4 ≈ 63pt required, against 66.25pt available at 375.
   * That is a 3.25pt margin, and it is SMALL — about 5%. The floor below is
   * deliberately the required estimate and not a comfortable round number, so
   * that any future change which eats the margin turns this test red instead
   * of shipping an ellipsis. */
  const FALLEN_ESTIMATED_ADVANCE_PT = 63;

  test.each(Object.entries(DEVICE_WIDTHS))(
    '%s — one paired key holds `☗ FALLEN` without clipping',
    (_name, w) => {
      expect(textBoxAt(w)).toBeGreaterThan(FALLEN_ESTIMATED_ADVANCE_PT);
    },
  );

  test('the narrowest device is 66.25pt, and that is the whole margin there is', () => {
    expect(textBoxAt(375)).toBeCloseTo(66.25, 5);
    expect(textBoxAt(375) - FALLEN_ESTIMATED_ADVANCE_PT).toBeCloseTo(3.25, 5);
  });

  test('pairing is what buys the room — stacked, each key had 174.5pt of slot', () => {
    /* Stated as the comparison it is: the repair costs the longer label 108pt
     * of width it was not using, and buys the map a row it was. */
    const stackedKey = (375 - CONTAINER_PADDING * 2 - TOP_ROW_GAP) / 2 - PANEL_FRAME_BORDER * 2;
    expect(stackedKey).toBeCloseTo(174.5, 5);
  });
});

// ═══ 5. THE FAILURE MODE IS BOUNDED TO ONE LINE ══════════════════════════════
describe('OTA-1849 §5 — one line, whatever the glyph turns out to measure', () => {
  const mounted: ReturnType<typeof renderer.create>[] = [];
  /* ⚠ OTA-1798's rule — the instruments stop when the test does, and an
   * unmount is a React update like any other, so it goes inside `act` or it
   * warns and leaves work scheduled past teardown. */
  afterAll(async () => {
    await renderer.act(async () => { mounted.forEach((t) => t.unmount()); });
  });

  const renderPair = async () => {
    const s = StyleSheet.create({
      row: { flexDirection: 'row', gap: CREST_NAV_ROW_GAP },
      half: { flex: 1, minWidth: 0 },
    });
    let tree!: ReturnType<typeof renderer.create>;
    await renderer.act(async () => {
      tree = renderer.create(
        <View style={s.row}>
          <TButton label="◈ LORE" variant="utility" compact style={[{ marginVertical: 3 }, s.half]} onPress={() => {}} />
          <TButton label="☗ FALLEN" variant="utility" compact style={[{ marginVertical: 3 }, s.half]} onPress={() => {}} />
        </View>,
      );
    });
    mounted.push(tree);
    return tree;
  };

  test('both labels render with numberOfLines={1} — they ellipsize, they never wrap', async () => {
    const tree = await renderPair();
    const texts = tree.root.findAll(
      (n: TestNode) => typeof n.type === 'string' && n.type === 'Text'
        && typeof n.props.children === 'string'
        && /LORE|FALLEN/.test(n.props.children as string),
    );
    expect(texts.length).toBe(2);
    for (const t of texts) expect(t.props.numberOfLines).toBe(1);
  });

  test('both pressables resolve to the same flex split at render time', async () => {
    const tree = await renderPair();
    const pressables = tree.root.findAll(
      (n: TestNode) => typeof n.type === 'string' && n.type === 'View'
        && n.props.accessibilityRole === 'button',
    );
    expect(pressables.length).toBe(2);
    const flats = pressables.map(
      (p: TestNode) => StyleSheet.flatten(p.props.style as never) as Record<string, unknown>,
    );
    expect(flats[0].flex).toBe(1);
    expect(flats[1].flex).toBe(1);
    expect(flats[0].minWidth).toBe(0);
    expect(flats[1].minWidth).toBe(0);
    // equal: the two slots differ in nothing that decides width
    expect(flats[0].flex).toBe(flats[1].flex);
  });
});

// ═══ 6. PRESENTATION-ONLY — NOTHING BEHIND THE ROW MOVED ═════════════════════
describe('OTA-1849 §6 — the repair is presentation and stops there', () => {
  test('the labels are byte-identical to what shipped', () => {
    expect(EXP).toContain("const CREST_LORE_LABEL = '◈ LORE';");
    expect(EXP).toContain("const CREST_FALLEN_LABEL = '☗ FALLEN';");
  });

  test('the destinations are unchanged', () => {
    expect(ROW_BLOCK).toContain("setScreen('lore')");
    expect(ROW_BLOCK).toContain("setScreen('fallen')");
  });

  test('the tap ledger still logs the label each key RENDERS (ota1485\'s rule)', () => {
    expect(ROW_BLOCK).toContain('logUiTap(CREST_LORE_LABEL)');
    expect(ROW_BLOCK).toContain('logUiTap(CREST_FALLEN_LABEL)');
    // and no twin string crept in beside the derivation
    expect(ROW_BLOCK).not.toMatch(/logUiTap\('/);
  });

  test('both are still the kit control at the same variant and density', () => {
    expect((ROW_BLOCK.match(/variant="utility"/g) ?? []).length).toBe(2);
    expect((ROW_BLOCK.match(/\n\s+compact\n/g) ?? []).length).toBe(2);
  });

  test('the slot still styles nothing the kit owns (VIS-3 / OTA-1746 holds)', () => {
    for (const n of ['crestNavBtn', 'crestNavHalf', 'crestNavRow']) {
      expect(styleBlock(n)).not.toMatch(/backgroundColor|borderWidth|borderColor|fontSize|letterSpacing/);
      expect(styleBlock(n).toLowerCase()).not.toContain('c9a86a');
    }
  });

  test('the map was not resized by hand — it is still flex: 1 and takes what it is given', () => {
    /* Requirement 9: the WORLD map does not change size EXCEPT by reclaiming
     * the freed vertical space. `flex: 1` is how it reclaims it, and the proof
     * that nothing was resized is that no height was written anywhere. */
    expect(MINIMAP).toMatch(/wrap:\s*\{\s*\n?\s*flex:\s*1/);
    expect(styleBlock('rightCol')).toContain('flex: 1');
    expect(ROW_BLOCK).not.toContain('height');
  });
});
