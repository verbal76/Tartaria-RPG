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
  TTabBar,
} from '../app/ui/tartariaKit';

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
    expect(down.transform).toEqual([{ translateY: 1.5 }]);
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
    expect(down.transform).toEqual([{ translateY: 1.5 }]);
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
  it('tab bar tabs stay flat: interactive is not the same as a command', () => {
    let tree!: ReturnType<typeof renderer.create>;
    renderer.act(() => {
      tree = renderer.create(
        React.createElement(TTabBar, {
          tabs: [
            { key: 'a', label: 'ONE' },
            { key: 'b', label: 'TWO' },
          ],
          value: 'a',
          onChange: () => {},
        } as any),
      );
    });
    const tabs = tree.root.findAll((n: any) => typeof n.props?.onPress === 'function');
    expect(tabs.length).toBeGreaterThan(0);
    for (const t of tabs) {
      for (const pressed of [false, true]) {
        const s = styleAt(t, pressed);
        expect(s.borderTopColor).not.toBe(T.controlRaisedLit);
        expect(s.borderBottomColor).not.toBe(T.controlRaisedDark);
        expect(s.transform).toBeUndefined();
      }
    }
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
    const literals = [T.controlRaisedLit, T.controlRaisedDark];
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
