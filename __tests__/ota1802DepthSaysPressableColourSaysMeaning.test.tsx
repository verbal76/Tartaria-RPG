/**
 * OTA-1802 — DEPTH SAYS PRESSABLE, COLOUR SAYS MEANING.
 *
 * The owner, holding a Pixel 10 Pro XL running the build his own device
 * reported as `2026-09-11-1801-asked-once` on channel `hal2001`: the combat
 * controls *"still look flat."*
 *
 * ⚠⚠ THE AUDIT AND THE OBSERVATION WERE BOTH RIGHT, WHICH IS THE WHOLE POINT.
 * An independent census proved the construction was present and correctly
 * wired — `QuickBtn` has applied `tControlDepth` since OTA-1782, semantics
 * first and depth last. So this was never a missing-wiring bug and a census
 * could never have found it. It was the wrong WEIGHT, and only a person
 * looking at a screen could say so.
 *
 * `TButton` — the one control in the game that has always read as physical —
 * carries the language on TWO layers, and they are not the same strength:
 *
 *     btnRim   rgba(140,146,150,0.55) / rgba(0,0,0,0.75)   ← structural
 *     btnFace  T.controlLit  (0.20)   / T.controlDark (0.45) ← inner highlight
 *
 * The rim does the work. The face is a secondary sheen INSIDE it. When
 * OTA-1782 handed the language to flat single-ring controls it handed them the
 * FACE strength — the subordinate one — as their ONLY cue. A compact chip has
 * no rim to sit inside, so 0.20/0.45 was the entire physical claim, and on a
 * dense dark chip that is a top-to-bottom gradient of 56 out of 255.
 *
 * ⚠ WHAT THIS SUITE PROTECTS, AND WHAT IT DELIBERATELY DOES NOT.
 * It does not snapshot pixels. It protects the CHAIN:
 *
 *     discrete command family → governed depth authority → semantic style
 *     preserved → resting affordance → pressed settle
 *
 * and the boundary on the other side: surfaces that are interactive but are
 * NOT discrete commands must stay flat. A solution that makes everything with
 * an `onPress` look like a button fails this pass, so that is asserted too.
 */
import React from 'react';
import { StyleSheet } from 'react-native';
import {
  T,
  tControlDepth,
  tFilledGold,
  TScreenHeader,
  TTabBar, tartariaKitStyles } from '../app/ui/tartariaKit';
const flatKit = (x: unknown): Record<string, unknown> =>
  Object.assign({}, ...[x].flat(9).filter(Boolean) as Record<string, unknown>[]);

const renderer = require('react-test-renderer') as {
  create: (el: React.ReactElement) => { root: { findAll: (f: (n: any) => boolean) => any[] } };
  act: (f: () => void) => void;
};

/** The alpha out of an `rgba(r,g,b,a)` string. */
function alphaOf(c: string): number {
  const m = /rgba?\([^)]*,\s*([0-9.]+)\s*\)/.exec(c);
  if (!m) throw new Error(`not an rgba colour: ${c}`);
  return Number(m[1]);
}
/** The Rec.709 luminance of an `rgb`/`rgba` source or a `#rrggbb`. */
function lum(c: string): number {
  let r: number, g: number, b: number;
  const hex = /^#([0-9a-f]{6})$/i.exec(c);
  if (hex) {
    const n = parseInt(hex[1]!, 16);
    r = (n >> 16) & 255; g = (n >> 8) & 255; b = n & 255;
  } else {
    const m = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(c);
    if (!m) throw new Error(`not a colour: ${c}`);
    r = Number(m[1]); g = Number(m[2]); b = Number(m[3]);
  }
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
/** Composite a translucent edge over the fill it sits on, and report the delta. */
function edgeDelta(edge: string, fill: string): number {
  return alphaOf(edge) * (lum(edge) - lum(fill));
}
function flat(style: unknown): Record<string, any> {
  return (StyleSheet.flatten(style as any) ?? {}) as Record<string, any>;
}
/** Resolve a `Pressable`'s style prop in both states. */
function styleAt(node: any, pressed: boolean): Record<string, any> {
  const s = node.props.style;
  return flat(typeof s === 'function' ? s({ pressed }) : s);
}

/* The four surfaces the shipped OTA-1782 comment measured, so the before and
   after numbers are comparable line for line rather than by assertion. */
const SURFACES: Array<[string, string]> = [
  ['filled sage', '#9ec96a'],
  ['filled gold', '#c9a86a'],
  ['semantic rim', '#1b2417'],
  ['neutral rim', '#1a1714'],
];

describe('OTA-1802 — the compact authority carries the structural weight', () => {
  it('resting takes the RAISED pair, not the inner-highlight pair', () => {
    const rest = flat(tControlDepth(false));
    expect(rest.borderTopColor).toBe(T.controlRaisedLit);
    expect(rest.borderBottomColor).toBe(T.controlRaisedDark);
    // The bug this closes: a single-ring control wearing the face's strength.
    expect(rest.borderTopColor).not.toBe(T.controlLit);
    expect(rest.borderBottomColor).not.toBe(T.controlDark);
  });

  it('the raised pair is strictly stronger than the inner-highlight pair', () => {
    expect(alphaOf(T.controlRaisedLit)).toBeGreaterThan(alphaOf(T.controlLit));
    expect(alphaOf(T.controlRaisedDark)).toBeGreaterThan(alphaOf(T.controlDark));
  });

  it('the raised pair matches the structural strength TButton already proved', () => {
    // `btnRim` ships rgba(0,0,0,0.75) as its shadow edge. The raised dark edge
    // is that same strength — the number the game already demonstrated reads as
    // structure rather than one invented for this pass.
    expect(alphaOf(T.controlRaisedDark)).toBeCloseTo(0.75, 5);
  });

  it('pressed reverses the light and settles the face, and differs from rest', () => {
    const rest = flat(tControlDepth(false));
    const down = flat(tControlDepth(true));
    expect(down.borderTopColor).toBe(rest.borderBottomColor);
    expect(down.borderBottomColor).toBe(rest.borderTopColor);
    /* ⚠⚠⚠ PHASE 2 SUPERSEDES THE 1.5dp LITERAL, ON OWNER AUTHORITY. Game
     * Director, after physical inspection: Phase 1 is *"too subtle"*, and the
     * ruling that followed asks for *"actual depressed pressed geometry"* and
     * *"stronger pressed displacement"*. The travel moved 1.5 → 2.
     * ⚠ AND THE REPLACEMENT IS STRICTER THAN THE NUMBER IT REPLACES: it reads
     * the distance from the ONE governing style rather than restating it, so a
     * control that settles by some private amount now fails; and it holds a
     * FLOOR, so the travel can never quietly shrink back under the threshold
     * the device review rejected. A literal could do neither. */
    expect(down.transform).toEqual(flatKit(tartariaKitStyles.controlPressed).transform);
    expect((down.transform as [{ translateY: number }])[0].translateY).toBeGreaterThanOrEqual(2);

    // REST must not translate — a control that sits pre-depressed reads wrong.
    expect(rest.transform).toBeUndefined();
  });

  it('every real surface ends with a stronger gradient than the old pair gave', () => {
    const rest = flat(tControlDepth(false));
    for (const [name, fill] of SURFACES) {
      const top = edgeDelta(rest.borderTopColor, fill);
      const bottom = edgeDelta(rest.borderBottomColor, fill);
      const now = top - bottom;
      const before =
        alphaOf(T.controlLit) * (lum(T.controlLit) - lum(fill)) -
        alphaOf(T.controlDark) * (lum(T.controlDark) - lum(fill));
      // The shipped numbers were 96 / 93 / 58 / 56. Every one of them roughly
      // doubles; the floor below is what the OLD pair fails on all four.
      expect({ name, now: Math.round(now) }).toEqual({ name, now: Math.round(now) });
      expect(now).toBeGreaterThan(before * 1.7);
      expect(now).toBeGreaterThan(120);
    }
  });

  it('the pair stays self-balancing: light carries dark fills, shadow carries light fills', () => {
    const rest = flat(tControlDepth(false));
    const onDark = edgeDelta(rest.borderTopColor, '#1a1714');
    const onLight = -edgeDelta(rest.borderBottomColor, '#9ec96a');
    // On a dark fill the LIGHT does the work; on a light fill the SHADOW does.
    expect(onDark).toBeGreaterThan(-edgeDelta(rest.borderBottomColor, '#1a1714'));
    expect(onLight).toBeGreaterThan(edgeDelta(rest.borderTopColor, '#9ec96a'));
  });

  it('depth owns no fill, no text colour and no semantic border', () => {
    for (const s of [flat(tControlDepth(false)), flat(tControlDepth(true))]) {
      expect(s.backgroundColor).toBeUndefined();
      expect(s.color).toBeUndefined();
      expect(s.borderColor).toBeUndefined();
      expect(s.borderLeftColor).toBeUndefined();
      expect(s.borderRightColor).toBeUndefined();
      // It must never decide a control's weight or size either.
      expect(s.borderWidth).toBeUndefined();
      expect(s.paddingVertical).toBeUndefined();
      expect(s.height).toBeUndefined();
    }
  });

  it('an inert filled-gold pill is handed no depth at all', () => {
    const inert = flat(tFilledGold(null));
    expect(inert.backgroundColor).toBe(T.gold);
    expect(inert.borderTopColor).toBeUndefined();
    expect(inert.borderBottomColor).toBeUndefined();
    // …while a live one carries the same governed edges as everything else.
    expect(flat(tFilledGold(false)).borderTopColor).toBe(T.controlRaisedLit);
  });
});

describe('OTA-1802 — the shared header BACK is wired to the authority', () => {
  function backNode() {
    let tree!: ReturnType<typeof renderer.create>;
    renderer.act(() => {
      tree = renderer.create(
        React.createElement(TScreenHeader, { title: 'CHARACTER', onBack: () => {} }),
      );
    });
    const hits = tree.root.findAll(
      (n: any) => n.props?.accessibilityRole === 'button' && typeof n.props?.onPress === 'function',
    );
    expect(hits.length).toBeGreaterThan(0);
    return hits[0];
  }

  it('carries the governed depth at rest and settles when pressed', () => {
    const n = backNode();
    const rest = styleAt(n, false);
    const down = styleAt(n, true);
    expect(rest.borderTopColor).toBe(T.controlRaisedLit);
    expect(rest.borderBottomColor).toBe(T.controlRaisedDark);
    expect(down.borderTopColor).toBe(T.controlRaisedDark);
    /* ⚠⚠⚠ PHASE 2 SUPERSEDES THE 1.5dp LITERAL, ON OWNER AUTHORITY. Game
     * Director, after physical inspection: Phase 1 is *"too subtle"*, and the
     * ruling that followed asks for *"actual depressed pressed geometry"* and
     * *"stronger pressed displacement"*. The travel moved 1.5 → 2.
     * ⚠ AND THE REPLACEMENT IS STRICTER THAN THE NUMBER IT REPLACES: it reads
     * the distance from the ONE governing style rather than restating it, so a
     * control that settles by some private amount now fails; and it holds a
     * FLOOR, so the travel can never quietly shrink back under the threshold
     * the device review rejected. A literal could do neither. */
    expect(down.transform).toEqual(flatKit(tartariaKitStyles.controlPressed).transform);
    expect((down.transform as [{ translateY: number }])[0].translateY).toBeGreaterThanOrEqual(2);

  });

  it('keeps its own semantic chassis and its logical target', () => {
    const n = backNode();
    const rest = styleAt(n, false);
    // The semantic ring still rings it: left and right are untouched, and the
    // fill is the one the header has always had.
    expect(rest.backgroundColor).toBe('#1a1714');
    expect(rest.borderColor).toBe('#3a342c');
    expect(rest.borderWidth).toBe(1);
    // Geometry and touch target are unchanged by the physical language.
    expect(rest.minWidth).toBe(80);
    expect(rest.paddingHorizontal).toBe(14);
    expect(rest.paddingVertical).toBe(10);
    expect(n.props.hitSlop).toBe(8);
  });

  it('never fades the whole control — the settle replaced the opacity fade', () => {
    const n = backNode();
    expect(styleAt(n, true).opacity).toBeUndefined();
    expect(n.props.activeOpacity).toBeUndefined();
  });
});

describe('OTA-1802 — the negative boundary holds', () => {
  /* ⚠⚠⚠ SUPERSEDED BY OWNER AUTHORITY — PHASE 2, AND THE OLD ASSERTION HAD
   * ALREADY STOPPED BITING. This described tabs as FLAT, because OTA-1802 ruled
   * "interactive is not the same as a command" and concluded a tab should
   * therefore carry no physical language at all. The PRINCIPLE survives; the
   * VISUAL CONCLUSION does not. Game Director, Phase 2: *"inactive tabs use
   * governed selector affordance; active tab uses governed engaged/docked
   * affordance"*, and tabs now belong to the raised family.
   *
   * ⚠⚠ IT IS REPLACED RATHER THAN DELETED, AND THE REPLACEMENT IS STRICTLY
   * STRONGER. The old test asked only what a tab is NOT (not these two border
   * colours, no transform) — and once the planes arrived as CHILD VIEWS rather
   * than border colours it would have passed on a fully raised tab while
   * claiming to prove it flat. A guard that cannot fail is worse than no guard.
   * What replaces it asserts what a tab IS, in both states, structurally:
   * inactive stands proud on three planes, active has none of them and instead
   * docks; and the two can never be the same object. */
  it('an inactive tab is a raised selector and an active tab is docked — two objects, not two colours', () => {
    const render = (value: string) => {
      let tree!: ReturnType<typeof renderer.create>;
      renderer.act(() => {
        tree = renderer.create(
          React.createElement(TTabBar, {
            tabs: [{ key: 'a', label: 'ONE' }, { key: 'b', label: 'TWO' }],
            value,
            onChange: () => {},
          } as any),
        );
      });
      return tree;
    };
    const tree = render('a');
    /* ⚠ The test renderer surfaces both the Touchable and its host View for one
     * control, so match on the ACCESSIBILITY STATE — the selected flag is what
     * makes a node a tab rather than an implementation detail underneath one. */
    /* ⚠ `deep: false` returns only the OUTERMOST match per branch. Without it the
     * renderer surfaces both the TouchableOpacity and the element it renders,
     * and one control counts twice — which would quietly halve every per-tab
     * assertion below. */
    const tabsOf = (root: any) => root.findAll(
      (n: any) => n.props?.accessibilityState?.selected !== undefined
        && typeof n.props?.onPress === 'function',
      { deep: false },
    );
    const tabs = tabsOf(tree.root);
    expect(tabs.length).toBe(2);

    const planesOf = (tab: any) =>
      tab.findAll((n: any) => n.props?.pointerEvents === 'none' && n.props?.style, { deep: false })
        .map((n: any) => flatKit(n.props.style)) as Record<string, unknown>[];

    const [active, inactive] = tabs;
    expect(active.props.accessibilityState.selected).toBe(true);
    expect(inactive.props.accessibilityState.selected).toBe(false);

    // INACTIVE: a raised key — face light, sidewall, contact. Three planes.
    const inert = planesOf(inactive);
    expect(inert.length).toBe(3);
    const colours = inert.map((p: Record<string, unknown>) => p.backgroundColor);
    expect(colours).toContain(T.controlFaceLit);
    expect(colours).toContain(T.controlSidewall);
    expect(colours).toContain(T.controlContact);
    // …and the side has real thickness, which is what a drawn edge cannot have.
    expect(inert.find((p: Record<string, unknown>) => p.backgroundColor === T.controlSidewall)!.height as number)
      .toBeGreaterThanOrEqual(3);

    // ACTIVE: no side, no contact — it is not standing proud of anything.
    const act = planesOf(active);
    const actColours = act.map((p: Record<string, unknown>) => p.backgroundColor);
    expect(actColours).not.toContain(T.controlSidewall);
    expect(actColours).not.toContain(T.controlContact);
    expect(actColours).not.toContain(T.controlFaceLit);

    // …instead it DOCKS: its bottom border is opened and its own material is
    // carried BELOW the row baseline, so the face is continuous into the region
    // it controls rather than stopping at a line the inactive tabs stop at.
    const activeStyle = flatKit(active.props.style);
    expect(activeStyle.borderBottomWidth).toBe(0);
    const mouth = act.find((p: Record<string, unknown>) => (p.bottom as number) < 0);
    expect(mouth).toBeDefined();
    expect(mouth!.position).toBe('absolute');
    expect(mouth!.backgroundColor).toBe(activeStyle.backgroundColor);

    // ⚠ NO GLOW, AND NO COLOUR-ONLY SELECTION: the two states differ as OBJECTS.
    expect(JSON.stringify(act)).not.toBe(JSON.stringify(inert));
    for (const p of [...act, ...inert]) {
      for (const banned of ['shadowColor', 'shadowRadius', 'elevation']) {
        expect(p).not.toHaveProperty(banned);
      }
    }

    // ⚠ And selecting the other tab moves the docking, rather than adding a second.
    const other = tabsOf(render('b').root);
    expect(other.filter((t: any) => t.props.accessibilityState.selected).length).toBe(1);
  });

  /* ⚠⚠ THE RULE THIS ENFORCES IS OWNER RULE 8: *"Do not copy/paste depth colors
     or transforms into individual screens when a shared authority can own
     them."* OTA-1791 had to consolidate ten hand-copied filled-gold pills
     precisely because a style written by hand in ten files is ten places to
     drift. The depth literals get one home, and this is the test that says so
     — a hand-copied `rgba(255,250,240,0.50)` in a screen fails here rather than
     quietly becoming an eleventh copy. */
  it('the depth literals live in exactly one file', () => {
    const fs = require('fs') as typeof import('fs');
    const path = require('path') as typeof import('path');
    const root = path.join(__dirname, '..', 'app');
    /* ⚠ VISUAL LANGUAGE PHASE 1 — the second plane's four values join the list.
     * Same rule, wider: the sidewall and the chassis weight are depth, so a
     * hand-copied `rgba(0,0,0,0.38)` in a screen is the same drift a
     * hand-copied `rgba(255,250,240,0.50)` would be. Extending this list
     * STRENGTHENS the claim — six literals with one home instead of two. */
    const literals = [
      T.controlRaisedLit, T.controlRaisedDark,
      T.controlFaceLit, T.controlSidewall,
      T.chassisFaceLit, T.chassisSidewall,
    ];
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) { walk(p); continue; }
        if (!/\.(ts|tsx)$/.test(e.name)) continue;
        if (p.endsWith(path.join('ui', 'tartariaKit.tsx'))) continue; // the one home
        const src = fs.readFileSync(p, 'utf8');
        for (const lit of literals) if (src.includes(lit)) offenders.push(`${p} :: ${lit}`);
      }
    };
    walk(root);
    expect(offenders).toEqual([]);
  });
});
