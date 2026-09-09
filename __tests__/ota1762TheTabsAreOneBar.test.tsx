/**
 * OTA-1762 — FIVE TAB ROWS, FIFTEEN TABS, ONE BAR.
 *
 * Tier 0, step 4. Measured before writing a line:
 *
 *              tabRow                   the chip                  SELECTED
 *   About    gap 4 · ph 12 · mb 8  #1a1612 · ph 2 · justify   FILLED GOLD, ink #13110f
 *   Contracts bar + bottom rule    underline · pv 10          bottom rule
 *   Crafting gap 6 · mb 10         #1a1714 #3a342c r4 pv8     rim only
 *   Guidance gap 6 · mb 10         IDENTICAL to Crafting      rim + #221d15
 *   Vendor   gap 6 · mb 8          IDENTICAL to Crafting      rim + #2a2520
 *
 * ⚠⚠ A COMPONENT THIS TIME, WHERE `TRow` WAS DELIBERATELY NOT ONE — and the
 * reason is measured, not stylistic. The INTERACTION converges completely here:
 * all fifteen are one `TouchableOpacity`, one `onPress`, `activeOpacity={0.7}`,
 * `accessibilityRole="button"`, `accessibilityState={{ selected }}`, one `Text`.
 * No long-press, no checkbox mode, no bare `View`. TRow's four call sites
 * disagreed about what a row DOES; these fifteen do not.
 *
 * ⚠⚠⚠ AND THIS IS THE FIRST TIER 0 PRIMITIVE THAT MOVES A PIXEL. The selected
 * state does NOT converge — five screens, five treatments — so there is no set
 * of values that reproduces all of them and no honest "nothing moves" claim to
 * make. The bar takes the majority reading (gold rim AND a lifted ground) with
 * Vendor's own `#2a2520` as the ground, so the cost is exactly one screen:
 * VENDOR MOVES ZERO PIXELS, CRAFTING'S SELECTED TAB GAINS A GROUND. One
 * property, one screen, declared and photographed rather than asserted.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import React from 'react';
import { TTabBar, tartariaKitStyles as kit, T } from '../app/ui/tartariaKit';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const renderer = require('react-test-renderer') as {
  act(cb: () => void | Promise<void>): Promise<void> & void;
  create(el: React.ReactElement): { toJSON(): unknown; root: { findAll(p: (n: TestNode) => boolean): TestNode[] } };
};
interface TestNode { type?: unknown; props: Record<string, unknown>; children: unknown[] }

const ROOT = join(__dirname, '..');
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), 'utf8');
const KIT = read('app', 'ui', 'tartariaKit.tsx');
const CRAFT = read('app', 'screens', 'CraftingScreen.tsx');
const VENDOR = read('app', 'screens', 'VendorScreen.tsx');
const GUIDANCE = read('app', 'screens', 'GuidanceScreen.tsx');
const ABOUT = read('app', 'screens', 'AboutScreen.tsx');
const CONTRACTS = read('app', 'screens', 'ContractsScreen.tsx');

const flat = (s: unknown): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  const walk = (x: unknown) => {
    if (!x) return;
    if (Array.isArray(x)) { x.forEach(walk); return; }
    if (typeof x === 'object') Object.assign(out, x as Record<string, unknown>);
  };
  walk(s);
  return out;
};
const textOf = (n: TestNode): string => {
  const w = (x: unknown): string => typeof x === 'string' ? x
    : Array.isArray(x) ? x.map(w).join('')
      : ((x as TestNode | null)?.children ? w((x as TestNode).children) : '');
  return w(n.children);
};
const TABS = [
  { key: 'craft', label: 'CRAFT' },
  { key: 'repair', label: 'REPAIR' },
] as const;
const mount = (el: React.ReactElement) => renderer.create(el);

// ═══ 1. THE VALUES THREE SCREENS AGREED ON ═══════════════════════════════════
describe('the chip carries what Crafting, Guidance and Vendor already drew', () => {
  test('⚠⚠ the resting chip is the style that was byte-identical in three files', () => {
    const s = flat(kit.tabChip);
    expect(s.flex).toBe(1);
    expect(s.backgroundColor).toBe('#1a1714');
    expect(s.borderColor).toBe('#3a342c');
    expect(s.borderWidth).toBe(1);
    expect(s.borderRadius).toBe(4);
    expect(s.paddingVertical).toBe(8);
    expect(s.alignItems).toBe('center');
  });

  test('the label is Crafting and Vendor’s, byte for byte', () => {
    const s = flat(kit.tabLabel);
    expect(s.color).toBe('#a2977b');
    expect(s.fontSize).toBe(12);
    expect(s.letterSpacing).toBe(2);
    expect(s.fontWeight).toBe('700');
    expect(String(flat(kit.tabLabelOn).color).toLowerCase()).toBe(T.gold.toLowerCase());
  });

  test('the row keeps both bottom margins, because that is the only thing it differed on', () => {
    expect(flat(kit.tabRow).gap).toBe(6);
    expect(flat(kit.tabRow).marginBottom).toBe(10);       // Crafting, Guidance
    expect(flat(kit.tabRowTight).marginBottom).toBe(8);   // Vendor
  });

  test('the gold comes from the token, not a literal', () => {
    const block = KIT.slice(KIT.indexOf('tabRow:'), KIT.indexOf('// ── TScreenHeader'));
    expect(block).toContain('borderColor: T.gold');
    expect(block).not.toContain("'#c9a86a'");
  });
});

// ═══ 2. ⚠⚠⚠ THE ONE THING THAT MOVES ═════════════════════════════════════════
describe('the selected state does not converge, and the cost is one screen', () => {
  test('⚠⚠⚠ the bar lifts the ground AND lights the rim', () => {
    const s = flat(kit.tabChipOn);
    expect(String(s.borderColor).toLowerCase()).toBe(T.gold.toLowerCase());
    expect(s.backgroundColor).toBe('#2a2520');
  });

  test('⚠⚠ the ground is VENDOR’S OWN VALUE, so Vendor does not move', () => {
    /* Chosen deliberately over Guidance's `#221d15`: picking either one costs a
     * screen, and picking Vendor's costs the screen that is NOT adopting a
     * changed pixel anyway. Crafting was rim-only, so Crafting is the one that
     * changes — one property, one screen. */
    expect(flat(kit.tabChipOn).backgroundColor).toBe('#2a2520');
    expect(KIT).toContain("VENDOR'S OWN SHIPPED VALUE");
  });

  test('⚠⚠⚠ the pass does NOT claim nothing moves, and says so in the kit', () => {
    /* OTA-1758 and OTA-1759 could both claim to be pure extractions. This one
     * cannot, and a primitive that quietly changed a screen while wearing the
     * same claim would be the exact failure OTA-1758's before/after existed to
     * catch. The claim has to match the diff. */
    expect(KIT).toContain('CANNOT claim nothing moves');
    expect(KIT).toContain('GAINS A GROUND IT DID NOT HAVE');
  });
});

// ═══ 3. IT BEHAVES LIKE THE FIFTEEN IT REPLACES ══════════════════════════════
describe('the bar behaves the way the hand-rolled rows did', () => {
  /* ⚠⚠ `TouchableOpacity` is a COMPOSITE that forwards its props down several
   * levels, so a bare `findAll` on `accessibilityRole` returns FIVE nodes per
   * tab and a length assertion reads 10 where it should read 2. Host nodes
   * (`typeof n.type === 'string'`) are the real controls; the composite is
   * where Touchable-only props like `activeOpacity` survive. Both are used
   * below, each for what it can actually answer. */
  const hostButtons = (t: ReturnType<typeof mount>) =>
    t.root.findAll((n) => typeof n.type === 'string' && n.props.accessibilityRole === 'button');
  const pressables = (t: ReturnType<typeof mount>) =>
    t.root.findAll((n) => typeof n.props.onPress === 'function' && n.props.activeOpacity === 0.7);

  test('a tap reports the key, and only the selected tab says so', async () => {
    const seen: string[] = [];
    const t = mount(<TTabBar tabs={TABS} value="craft" onChange={(k) => seen.push(k)} />);
    const btns = hostButtons(t);
    expect(btns).toHaveLength(2);
    expect((btns[0]!.props.accessibilityState as { selected: boolean }).selected).toBe(true);
    expect((btns[1]!.props.accessibilityState as { selected: boolean }).selected).toBe(false);
    const unselected = pressables(t)
      .filter((n) => (n.props.accessibilityState as { selected: boolean } | undefined)?.selected === false);
    expect(unselected.length).toBeGreaterThan(0);
    await renderer.act(async () => { (unselected[0]!.props.onPress as () => void)(); });
    expect(seen).toEqual(['repair']);
  });

  test('⚠ activeOpacity is the shipped feedback, and it is on the Touchable', () => {
    const t = mount(<TTabBar tabs={TABS} value="craft" onChange={() => {}} />);
    // one per tab at minimum; the composite forwards, so never fewer than two
    expect(pressables(t).length).toBeGreaterThanOrEqual(2);
    expect(hostButtons(t)).toHaveLength(2);
  });

  test('⚠⚠ a badge shows only when it is worth showing', () => {
    /* Crafting's four tabs carry ready-counts and every one of them was written
     * by hand as `LABEL ${n > 0 ? `(${n})` : ''}` — which leaves a TRAILING
     * SPACE when the count is zero, and a trailing space inside a centred Text
     * shifts the glyphs left by half a space. The component drops it. */
    const t = mount(<TTabBar value="a" onChange={() => {}} tabs={[
      { key: 'a', label: 'CRAFT', badge: 3 },
      { key: 'b', label: 'REPAIR', badge: 0 },
      { key: 'c', label: 'RECIPES' },
    ]} />);
    const labels = t.root
      .findAll((n) => typeof n.type === 'string' && n.props.accessibilityRole === undefined)
      .map(textOf)
      .filter((s) => s.length > 0);
    expect(labels).toContain('CRAFT (3)');
    expect(labels).toContain('REPAIR');
    expect(labels).toContain('RECIPES');
    for (const l of labels) expect(l).toBe(l.trim());
  });

  test('⚠⚠ the right slot renders a control that is NOT a tab', () => {
    /* Vendor's `CONTRACTS ▸` shares the row and never holds the selected state.
     * It is the one thing a component had to make room for, and it is one prop
     * rather than a reason to reject the component. */
    const t = mount(<TTabBar tabs={TABS} value="craft" onChange={() => {}}
      right={<></>} />);
    expect(hostButtons(t)).toHaveLength(2);
  });

  test('an empty tab list renders a row rather than throwing', () => {
    const t = mount(<TTabBar tabs={[]} value="" onChange={() => {}} />);
    expect(t.toJSON()).not.toBeNull();
  });
});

// ═══ 4. THE TWO ADOPTIONS ════════════════════════════════════════════════════
describe('Crafting and Vendor adopted it and left nothing behind', () => {
  test('both render TTabBar', () => {
    for (const s of [CRAFT, VENDOR]) expect(s).toContain('<TTabBar');
  });

  test('⚠⚠ the styles they replaced are DELETED, not orphaned', () => {
    for (const n of ['tabRow', 'tabBtn', 'tabBtnActive', 'tabBtnText', 'tabBtnTextActive']) {
      expect(CRAFT).not.toMatch(new RegExp(`\\n  ${n}: [\\{\\s]`));
      expect(CRAFT).not.toContain(`styles.${n}`);
    }
    for (const n of ['tabRow', 'tab', 'tabActive', 'tabText', 'tabTextActive']) {
      expect(VENDOR).not.toMatch(new RegExp(`\\n  ${n}: [\\{\\s]`));
    }
    expect(VENDOR).not.toMatch(/styles\.tab\b/);
  });

  test('Crafting keeps all four tabs and the badge each one actually counts', () => {
    expect(CRAFT).toContain("{ key: 'craft', label: 'CRAFT', badge: craftableCounts.craft }");
    expect(CRAFT).toContain("{ key: 'recipes', label: 'RECIPES', badge: craftableCounts.recipes }");
    expect(CRAFT).toContain("{ key: 'aetheric', label: 'AETHERIC', badge: craftableCounts.aetheric }");
    // ⚠ OTA-1720 — REPAIR counts what you are WEARING, not every affordable row.
    expect(CRAFT).toContain("{ key: 'repair', label: 'REPAIR', badge: repairEquippedReady }");
    expect(CRAFT).toContain('the REPAIR badge counts what you are WEARING');
  });

  test('⚠⚠ Vendor keeps OTA-1099’s rule: leaving SELL ends the group', () => {
    /* The tab press was never just a mode change. A selection you can no longer
     * see is a hidden mode waiting to surprise you on the way back — so the
     * exit has to survive the move into a shared component. */
    expect(VENDOR).toMatch(/if \(k === 'buy'\) exitSellSelect\(\);/);
    expect(VENDOR).toContain("setMode(k as 'buy' | 'sell')");
    expect(VENDOR).toContain('leaving the SELL tab ends the group');
  });

  test('⚠ Vendor’s CONTRACTS button rides the right slot, still not a tab', () => {
    expect(VENDOR).toContain('CONTRACTS ▸');
    expect(VENDOR).toContain('style={kit.tabChip}');
    // it must not have acquired a selected state by joining the row
    const slot = VENDOR.slice(VENDOR.indexOf('right={('), VENDOR.indexOf('CONTRACTS ▸'));
    expect(slot).not.toContain('accessibilityState');
  });
});

// ═══ 5. WHAT WAS DELIBERATELY LEFT ALONE ═════════════════════════════════════
describe('the three that did not converge were left alone, each for its own reason', () => {
  test('⚠ Contracts is a different SHAPE — an underlined bar, not chips', () => {
    expect(CONTRACTS).not.toContain('TTabBar');
    expect(CONTRACTS).toMatch(/tabBtn: \{[^}]*borderBottomWidth: 2/);
    // the same call it made in OTA-1759 about its padded `card`
    expect(CONTRACTS).toMatch(/tabRow: \{[^}]*borderBottomWidth: 1/);
  });

  test('⚠⚠ About fills the chip with SOLID GOLD, which is a question not a style', () => {
    /* VIS-3 reserves gold for a live obligation or a live process. "Which
     * settings tab am I on" is neither, and this is the loudest treatment in
     * the game spent on the quietest question. RECORDED, not fixed — About has
     * its own pass in the rollout and this belongs to it. Fails the day it is
     * converted, so the record cannot outlive the defect. */
    expect(ABOUT).not.toContain('TTabBar');
    expect(ABOUT).toMatch(/tabBtnActive: \{\s*backgroundColor: '#c9a86a',/);
    expect(ABOUT).toMatch(/tabBtnTextActive: \{\s*color: '#13110f',/);
  });

  test('⚠⚠⚠ Guidance carries TWO one-off defects this measurement found', () => {
    /* Neither is fixed: Guidance is one of the four thin-cover screens (3
     * referencing suites) the owner asked to decide about before touching, and
     * it is the same screen still carrying OTA-1758's wrapping back button.
     *   1. `tabText` is MISSING `fontWeight: '700'` — its tabs render lighter
     *      than every other screen's, and nothing says that was intended.
     *   2. its selected label is `#e0c179`, not the brand gold. That is a THIRD
     *      off-brand gold after the two OTA-1759 found in Inventory, and
     *      `check:gold` is blind to all three because it counts `#c9a86a`. */
    expect(GUIDANCE).not.toContain('TTabBar');
    expect(GUIDANCE).toContain("tabText: { color: '#a2977b', fontSize: 12, letterSpacing: 2 }");
    expect(GUIDANCE).not.toMatch(/tabText: \{[^}]*fontWeight/);
    expect(GUIDANCE).toContain("tabTextActive: { color: '#e0c179' }");
  });

  test('⚠⚠ the three off-brand golds are counted, and the gate still cannot see them', () => {
    const gate = read('scripts', 'check-gold.mjs');
    expect(gate).toContain("/'#c9a86a'/gi");
    for (const h of ['#e0c179', '#d8b46a', '#9c8348']) expect(gate).not.toContain(h);
  });
});

describe('the gate and the stamp', () => {
  test('⚠ check:gold ratchets down by the four declarations this removed', () => {
    const gate = read('scripts', 'check-gold.mjs');
    /* ⚠⚠⚠ THIS PINNED `const BASELINE = 369;` AND WENT RED THREE OTAs LATER,
     * WHICH IS THE SECOND TIME IN THIS ROLLOUT I HAVE MADE EXACTLY THIS MISTAKE.
     * The first was OTA-1759 pinning the same gate's then-current value from a
     * suite about ROWS. A ratchet's whole point is that it MOVES; a suite that
     * pins today's number turns every correct future removal into a red test,
     * which is the opposite of what a ratchet is for.
     * What OTA-1762 can honestly claim is that its four declarations went and
     * that the number never climbs back: at most 369, with its own line in the
     * ledger. OTA-1765 took it to 367. */
    const baseline = Number(/const BASELINE = (\d+);/.exec(gate)?.[1]);
    expect(Number.isFinite(baseline)).toBe(true);
    expect(baseline).toBeLessThanOrEqual(369);
    expect(gate).toContain('OTA-1762');
  });

  test('names this pass', () => {
    expect(read('app', 'buildInfo.ts')).toContain("'2026-09-08-1762-one-tab-bar'");
  });
});
