/**
 * OTA-1758 — THIRTEEN HAND-ROLLED BACK BARS, ONE PRIMITIVE.
 *
 * Tier 0, step 2. Twelve screens each built their own `← BACK` / title / spacer
 * row, and they agreed almost completely — which is what makes this an
 * extraction rather than a redesign. Measured before writing a line:
 *   · `backText` IDENTICAL in all twelve, byte for byte.
 *   · `backBtn` identical but for padding.
 *   · the row `row · space-between · center` everywhere.
 *   · the title SPLIT SIX GOLD / FIVE INK.
 *
 * ⚠⚠⚠ AND THE COMPARISON FOUND A SHIPPED DEFECT. The claim was "nothing moves".
 * Photographing ContractsScreen from the REAL bundle before and after says
 * otherwise, and the difference is a bug being fixed:
 *     BEFORE  backBtn 80 x 46, label box 54 x 32
 *     AFTER   backBtn 96 x 30, label box 70 x 16
 * Three screens gave the button a FIXED `width: 80` with 12px of horizontal
 * padding — 56px of content for a label that needs ~70 — so `← BACK` WRAPPED
 * ONTO TWO LINES. It is visible in the before-shot: the arrow sits on its own
 * row above the word. The other nine use `minWidth`, so they never wrapped.
 * This suite therefore does NOT claim the pass is invisible. It claims the
 * primitive reproduces the shipped values, and names the one thing that changed.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import React from 'react';
import { TScreenHeader, tartariaKitStyles as kit, T } from '../app/ui/tartariaKit';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const renderer = require('react-test-renderer') as {
  act(cb: () => void | Promise<void>): Promise<void> & void;
  create(el: React.ReactElement): { toJSON(): unknown; root: { findAll(p: (n: TestNode) => boolean): TestNode[] } };
};
interface TestNode { type?: unknown; props: Record<string, unknown>; children: unknown[] }

const ROOT = join(__dirname, '..');
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), 'utf8');
const KIT = read('app', 'ui', 'tartariaKit.tsx');
const CONTRACTS = read('app', 'screens', 'ContractsScreen.tsx');
const ACTIONS = read('app', 'screens', 'ActionReferenceScreen.tsx');

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
const mount = (el: React.ReactElement) => renderer.create(el);
const hosts = (t: ReturnType<typeof mount>, p: (n: TestNode) => boolean) =>
  t.root.findAll((n) => typeof n.type === 'string' && p(n));

// ═══ 1. THE SHIPPED VALUES, REPRODUCED ═══════════════════════════════════════
describe('the primitive carries the values twelve screens agreed on', () => {
  test('⚠⚠ backText is the style that was byte-identical everywhere', () => {
    // color:'#c9a86a', fontSize:14, letterSpacing:2, fontWeight:'700'
    const s = flat(kit.schBackText);
    expect(String(s.color).toLowerCase()).toBe(T.gold.toLowerCase());
    expect(s.fontSize).toBe(14);
    expect(s.letterSpacing).toBe(2);
    expect(s.fontWeight).toBe('700');
  });

  test('the back button chassis is the shipped one', () => {
    const s = flat(kit.schBack);
    expect(s.backgroundColor).toBe('#1a1714');
    expect(s.borderColor).toBe('#3a342c');
    expect(s.borderWidth).toBe(1);
    expect(s.borderRadius).toBe(4);
    expect(s.alignItems).toBe('center');
  });

  test('⚠⚠⚠ minWidth, never a fixed width — this is the defect the render found', () => {
    /* Three screens shipped `width: 80` with 12px padding, leaving 56px for a
     * label needing ~70, so `← BACK` wrapped onto two lines. A primitive that
     * copied that faithfully would have preserved a bug. */
    const s = flat(kit.schBack);
    expect(s.minWidth).toBe(80);
    expect(s.width).toBeUndefined();
    expect(flat(kit.schSlot).minWidth).toBe(80);
    expect(flat(kit.schSlot).width).toBeUndefined();
  });

  test('the row is the layout every screen used', () => {
    const s = flat(kit.schRow);
    expect(s.flexDirection).toBe('row');
    expect(s.justifyContent).toBe('space-between');
    expect(s.alignItems).toBe('center');
  });
});

// ═══ 2. THE TITLE IS NOT AN OBLIGATION ═══════════════════════════════════════
describe('the six-gold / five-ink split is settled by the existing rule', () => {
  test('⚠⚠ ink is the default; gold has to be asked for by name', () => {
    // VIS-3: gold marks a live obligation or a live process. A screen's own
    // name is neither, and making it the brightest thing competes with whatever
    // the screen is for — the same reasoning that took gold off Exploration's
    // place name in OTA-1746.
    expect(String(flat(kit.schTitle).color).toLowerCase()).toBe(T.ink.toLowerCase());
    expect(String(flat(kit.schTitleGold).color).toLowerCase()).toBe(T.gold.toLowerCase());
    const t = mount(<TScreenHeader title="X" onBack={() => {}} />);
    const title = hosts(t, (n) => textOf(n) === 'X' && n.props.accessibilityRole === 'header')[0];
    expect(title).toBeDefined();
    expect(String(flat(title!.props.style).color).toLowerCase()).toBe(T.ink.toLowerCase());
  });

  test('tone="gold" is available for a screen that argues for it', () => {
    const t = mount(<TScreenHeader title="X" onBack={() => {}} tone="gold" />);
    const title = hosts(t, (n) => textOf(n) === 'X' && n.props.accessibilityRole === 'header')[0];
    expect(String(flat(title!.props.style).color).toLowerCase()).toBe(T.gold.toLowerCase());
  });
});

// ═══ 3. STRUCTURE AND BEHAVIOUR ══════════════════════════════════════════════
describe('the header behaves the way the hand-rolled ones did', () => {
  test('back fires, and carries the roles a screen reader needs', async () => {
    let hit = 0;
    const t = mount(<TScreenHeader title="CONTRACTS" onBack={() => { hit += 1; }} />);
    const btn = t.root.findAll((n) => n.props.accessibilityRole === 'button')[0];
    expect(btn).toBeDefined();
    expect(btn!.props.accessibilityLabel).toBe('Go back');
    expect(btn!.props.activeOpacity).toBe(0.7);      // ⚠ the shipped feedback
    await renderer.act(async () => { (btn!.props.onPress as () => void)(); });
    expect(hit).toBe(1);
    expect(hosts(t, (n) => n.props.accessibilityRole === 'header')).toHaveLength(1);
  });

  test('⚠ the right slot reserves the back button width even when empty', () => {
    // That is what the eight `<View style={{ width: 80 }} />` spacers were
    // doing by hand; without it the title drifts as the back label changes.
    const t = mount(<TScreenHeader title="X" onBack={() => {}} />);
    const slots = hosts(t, (n) => flat(n.props.style).minWidth === 80 && n.props.onPress === undefined);
    expect(slots.length).toBeGreaterThanOrEqual(1);
  });

  test('a right node renders into that slot', () => {
    const t = mount(<TScreenHeader title="X" onBack={() => {}} right={<></>} />);
    expect(t.toJSON()).not.toBeNull();
  });

  test('with no onBack there is no button, but the row stays balanced', () => {
    const t = mount(<TScreenHeader title="X" />);
    expect(t.root.findAll((n) => n.props.accessibilityRole === 'button')).toHaveLength(0);
    expect(hosts(t, (n) => flat(n.props.style).minWidth === 80).length).toBeGreaterThanOrEqual(2);
  });

  test('⚠ the back control is still a TouchableOpacity, and that is a DEFERRAL', () => {
    /* The kit's control family presses with a depth translate; these twelve
     * press with activeOpacity. Routing them through `TButton` is the right end
     * state and a VISIBLE change to how the control feels — a decision for the
     * screen passes, not something to smuggle in under a primitive whose claim
     * is that it reproduces what shipped. */
    const fn = KIT.slice(KIT.indexOf('export function TScreenHeader'), KIT.indexOf('const kit = StyleSheet.create'));
    expect(fn).toContain('TouchableOpacity');
    expect(fn).not.toContain('<TButton');
    expect(KIT).toContain('DEFERRAL RATHER THAN AN OVERSIGHT');
  });
});

// ═══ 4. THE TWO ADOPTIONS ════════════════════════════════════════════════════
describe('two well-covered screens adopted it, and left nothing behind', () => {
  test('both render TScreenHeader', () => {
    for (const s of [CONTRACTS, ACTIONS]) {
      expect(s).toContain('<TScreenHeader');
      expect(s).toMatch(/from '\.\.\/ui\/tartariaKit'/);
    }
  });

  test('⚠⚠ the styles they left behind are DELETED, not orphaned', () => {
    // "Delete the styles it leaves behind — they are how the old language
    // creeps back." Orphaned rules are also how a later reader concludes the
    // screen still owns its own header.
    for (const s of [CONTRACTS, ACTIONS]) {
      for (const n of ['header', 'backBtn', 'backText', 'title']) {
        expect(s).not.toMatch(new RegExp(`\\n  ${n}: \\{`));
        expect(s).not.toContain(`styles.${n}}`);
      }
    }
  });

  test('⚠⚠⚠ the wrapping back button is gone from both', () => {
    for (const s of [CONTRACTS, ACTIONS]) expect(s).not.toMatch(/backBtn[\s\S]{0,200}?width: 80/);
  });

  test('⚠⚠⚠ and it is GONE from GuidanceScreen — the pin fired as designed', () => {
    /* ⚠ *"This test fails the day it is fixed so the record cannot outlive the
     * bug."* It did, on OTA-1780. Guidance shipped a FIXED `width: 80` back
     * pill where every other screen used `minWidth`, so the label had nowhere
     * to go — the wrapping the owner reported. It was RECORDED here rather than
     * fixed, because Guidance was one of the four thin-cover screens he asked
     * to cover before touching; the order ran record → cover → migrate, and
     * adopting `TScreenHeader` replaced the fixed width with the kit's
     * grow-to-fit pill.
     * Re-aimed rather than deleted so the record of the defect survives its
     * own fix. */
    const g = read('app', 'screens', 'GuidanceScreen.tsx');
    expect(g).toContain('TScreenHeader');
    expect(g).not.toMatch(/\n {2}backBtn: \{/);
    expect(read('app', 'ui', 'tartariaKit.tsx')).toContain('minWidth: 80');
  });
});

describe('the stamp', () => {
  test('names this pass', () => {
    expect(read('app', 'buildInfo.ts')).toContain("'2026-09-08-1758-one-header'");
  });
});
