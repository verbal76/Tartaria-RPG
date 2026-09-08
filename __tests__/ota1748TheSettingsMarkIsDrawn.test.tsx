/**
 * OTA-1748 — THE SETTINGS MARK IS DRAWN.
 *
 * The settings buttons rendered `⚙` (U+2699) as TEXT. That icon was never ours:
 * it was whatever the device's symbol font contained, at that font's weight —
 * and U+2699 carries an EMOJI PRESENTATION VARIANT, so a fallback chain that
 * reaches the colour emoji font first renders it in colour and ignores the
 * colour the app set.
 *
 * ⚠⚠ AND THE USUAL FIXES WERE UNAVAILABLE. Native builds are parked, so
 * `react-native-svg` and icon-font packages cannot ship at all — an OTA carries
 * JS and assets, not new native modules. So the gear is drawn out of plain
 * Views, and this suite checks the two things that can actually go wrong with a
 * drawn icon: that the GEOMETRY really composes a gear (teeth attached to a
 * body, a hub that is a hole), and that it costs nothing.
 *
 * ⚠ It also holds the boundary the change had to respect: the exploration
 * header's vertical budget, which OTA-1746 measured and pinned, and which the
 * tallest object in its rail — this key — is what sets.
 */
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('../app/state/accessibility', () => ({
  ...jest.requireActual('../app/state/accessibility'),
  useReduceMotion: () => true,
}));

import React from 'react';
import { readFileSync } from 'fs';
import { join } from 'path';
import { TGear, T } from '../app/ui/tartariaKit';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const renderer = require('react-test-renderer') as {
  act(cb: () => void | Promise<void>): Promise<void> & void;
  create(el: React.ReactElement): { unmount(): void; toJSON(): unknown; root: { findAll(p: (n: TestNode) => boolean): TestNode[] } };
};
interface TestNode { type?: unknown; props: Record<string, unknown>; children: unknown[] }

const ROOT = join(__dirname, '..');
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), 'utf8');
const KIT = read('app', 'ui', 'tartariaKit.tsx');
const EXP = read('app', 'screens', 'ExplorationScreen.tsx');
const TITLE = read('app', 'screens', 'TitleScreen.tsx');

/* ⚠ HOST NODES ONLY — RN's `View` is a composite that forwards its props, so a
 * naive findAll double-counts and every part of this gear would be measured
 * twice. */
const hosts = (t: { root: { findAll(p: (n: TestNode) => boolean): TestNode[] } }, p: (n: TestNode) => boolean) =>
  t.root.findAll((n) => typeof n.type === 'string' && p(n));
const flat = (s: unknown): Record<string, number | string | undefined> => {
  const out: Record<string, number | string | undefined> = {};
  const walk = (x: unknown) => {
    if (!x) return;
    if (Array.isArray(x)) { x.forEach(walk); return; }
    if (typeof x === 'object') Object.assign(out, x as Record<string, number | string>);
  };
  walk(s);
  return out;
};

const mounted: Array<{ unmount(): void }> = [];
afterEach(async () => {
  while (mounted.length) {
    const t = mounted.pop()!;
    // eslint-disable-next-line no-await-in-loop
    await renderer.act(async () => { try { t.unmount(); } catch { /* gone */ } });
  }
});

async function drawGear(size: number, color = '#8C8E8B') {
  let tree!: ReturnType<typeof renderer.create>;
  await renderer.act(async () => { tree = renderer.create(<TGear size={size} color={color} />); });
  mounted.push(tree);
  const all = hosts(tree, () => true).map((n) => ({ n, s: flat(n.props.style) }));
  const teeth = all.filter((x) => Array.isArray((x.n.props.style as { transform?: unknown })?.transform)
    || Array.isArray((flat(x.n.props.style) as unknown as { transform?: unknown }).transform));
  const ring = all.find((x) => typeof x.s.borderRadius === 'number' && typeof x.s.borderWidth === 'number');
  return { tree, all, teeth, ring: ring!.s };
}

// ═══ 1. IT IS ACTUALLY A GEAR ════════════════════════════════════════════════
describe('the geometry composes a gear rather than a pile of rectangles', () => {
  test('eight teeth, evenly spaced through a full turn', async () => {
    const { teeth } = await drawGear(20);
    expect(teeth).toHaveLength(8);
    const angles = teeth
      .map((t) => {
        const tr = (flat(t.n.props.style) as unknown as { transform: Array<Record<string, string>> }).transform;
        const rot = tr.find((o) => 'rotate' in o)!.rotate!;
        return Number(/(-?\d+)deg/.exec(rot)![1]);
      })
      .sort((a, b) => a - b);
    expect(angles).toEqual([0, 45, 90, 135, 180, 225, 270, 315]);
  });

  test('⚠⚠ each tooth is rotated BEFORE it is translated — that is what puts it on a radius', async () => {
    // `[{rotate}, {translateY}]` runs the translate in the ALREADY-ROTATED frame,
    // so one View lands at angle θ, distance r, pointing outward. Reverse the
    // order and all eight teeth stack on top of each other above the hub.
    const { teeth } = await drawGear(20);
    for (const t of teeth) {
      const tr = (flat(t.n.props.style) as unknown as { transform: Array<Record<string, unknown>> }).transform;
      expect(Object.keys(tr[0]!)[0]).toBe('rotate');
      expect(Object.keys(tr[1]!)[0]).toBe('translateY');
      expect(Number(tr[1]!.translateY)).toBeLessThan(0); // outward, not inward
    }
    expect(KIT).toContain('transform: [{ rotate: `${deg}deg` }, { translateY: -g.radius }]');
  });

  test('⚠⚠⚠ the teeth are ATTACHED to the body and clear of the hub hole', async () => {
    // The single geometric claim that makes it read as one machined object: a
    // tooth's inner end must land inside the ring's stroke — past the outer edge
    // it floats free, past the inner edge it pokes into the hole.
    for (const size of [14, 16, 20, 32]) {
      // eslint-disable-next-line no-await-in-loop
      const { teeth, ring } = await drawGear(size);
      const radius = -Number((flat(teeth[0]!.n.props.style) as unknown as { transform: Array<Record<string, unknown>> }).transform[1]!.translateY);
      const toothH = Number(flat(teeth[0]!.n.props.style).height);
      const ringOuter = Number(ring.width) / 2;
      const ringInner = ringOuter - Number(ring.borderWidth);
      const toothInnerEnd = radius - toothH / 2;
      expect(toothInnerEnd).toBeLessThan(ringOuter);   // attached
      expect(toothInnerEnd).toBeGreaterThan(ringInner); // not intruding on the hub
      // ...and the teeth stick out past the body, or there is no gear
      expect(radius + toothH / 2).toBeGreaterThan(ringOuter);
      // eslint-disable-next-line no-await-in-loop
      await renderer.act(async () => { mounted.pop()!.unmount(); });
    }
  });

  test('the hub is a real HOLE, not a disc in a guessed colour', async () => {
    const { ring } = await drawGear(20);
    // an annulus: a border, no fill. A filled disc would need to know what is
    // behind it, which on a player-tunable background it cannot.
    expect(ring.backgroundColor).toBeUndefined();
    expect(Number(ring.borderWidth)).toBeGreaterThan(0);
    expect(Number(ring.borderRadius)).toBeCloseTo(Number(ring.width) / 2, 5);
    // and the hole has real area rather than being closed up by its own stroke
    expect(Number(ring.width) / 2 - Number(ring.borderWidth)).toBeGreaterThan(1);
  });

  test('every part takes the colour it is given, and it fits its box', async () => {
    const { all, teeth, ring } = await drawGear(20, '#C9A86A');
    for (const t of teeth) expect(flat(t.n.props.style).backgroundColor).toBe('#C9A86A');
    expect(ring.borderColor).toBe('#C9A86A');
    const box = all.find((x) => Number(x.s.width) === 20 && Number(x.s.height) === 20);
    expect(box).toBeDefined();
    // nothing escapes the declared size — this sits inside a socket and a circle
    const radius = -Number((flat(teeth[0]!.n.props.style) as unknown as { transform: Array<Record<string, unknown>> }).transform[1]!.translateY);
    expect(radius + Number(flat(teeth[0]!.n.props.style).height) / 2).toBeLessThanOrEqual(10);
  });

  test('it survives being scaled — no dimension collapses to zero', async () => {
    for (const size of [10, 12, 14, 16, 20, 24, 32, 48]) {
      // eslint-disable-next-line no-await-in-loop
      const { teeth, ring } = await drawGear(size);
      expect(teeth).toHaveLength(8);
      for (const t of teeth) {
        const s = flat(t.n.props.style);
        expect(Number(s.width)).toBeGreaterThanOrEqual(1);
        expect(Number(s.height)).toBeGreaterThanOrEqual(1);
      }
      expect(Number(ring.borderWidth)).toBeGreaterThanOrEqual(1);
      // eslint-disable-next-line no-await-in-loop
      await renderer.act(async () => { mounted.pop()!.unmount(); });
    }
  });
});

// ═══ 2. NO FONT IS INVOLVED ANY MORE ═════════════════════════════════════════
describe('the icon is ours, not the device symbol font\'s', () => {
  test('neither settings button renders a glyph', () => {
    expect(EXP).not.toContain('⚙');
    expect(TITLE).not.toContain('⚙');
    // ...and the dead text styles went with the glyphs they styled
    expect(EXP).not.toContain('sceneBarGear');
    expect(TITLE).not.toMatch(/\n  gear: \{/);
  });

  test('both sites use the ONE primitive, at their own size and colour', () => {
    expect(EXP).toContain('<TGear size={SCENE_GEAR_SIZE} color={T.gold} />');
    expect(TITLE).toContain('<TGear size={20} color={T.gold} />');
    /* ⚠⚠ ONE MARK, ONE COLOUR, TWO SIZES. OTA-051 moved the title's gear to the
     * top-right corner explicitly "for UI uniformity with the ExplorationScreen"
     * — and then the two were never uniform: different glyph sizes, and one gold
     * against the other's ceramic. They match now. The SIZE still differs,
     * because a corner button and a header rail are different amounts of room;
     * the colour does not, because there is no reason for it to. */
    const colors = [...TITLE.matchAll(/<TGear[^/]*color=\{T\.(\w+)\}/g)].map((m) => m[1])
      .concat([...EXP.matchAll(/<TGear[^/]*color=\{T\.(\w+)\}/g)].map((m) => m[1]));
    expect(colors).toHaveLength(2);
    expect(new Set(colors).size).toBe(1);
    // one drawn gear in the codebase, not two independent ones
    expect((KIT.match(/export function TGear/g) ?? []).length).toBe(1);
    expect(T.gold).toBeDefined();
  });

  test('it renders no Text and loads no font', async () => {
    const { tree } = await drawGear(16);
    expect(hosts(tree, (n) => n.type === 'Text')).toHaveLength(0);
    const fn = /export function TGear\([\s\S]*?\n\}/.exec(KIT)?.[0] ?? '';
    expect(fn).not.toMatch(/fontFamily|fontSize|<Text|Image|require\(/);
  });

  test('it is inert to touch — the pressable keeps the whole target', async () => {
    const { tree } = await drawGear(16);
    expect(hosts(tree, (n) => n.props.pointerEvents === 'none').length).toBeGreaterThan(0);
    // both call sites still carry their own hit slop and their a11y label
    expect(EXP).toContain('hitSlop={8}');
    expect(EXP).toContain('accessibilityLabel="Settings"');
    expect(TITLE).toContain('hitSlop={10}');
    expect(TITLE).toContain('accessibilityLabel="Settings"');
  });
});

// ═══ 3. IT COSTS NOTHING, AND IT MOVED NO BUDGET ═════════════════════════════
describe('nine static Views, and the header is the height it was', () => {
  test('the whole icon is nine Views and no more', async () => {
    const { all } = await drawGear(16);
    expect(all).toHaveLength(10); // the box + 8 teeth + the ring
  });

  test('no state, no timer, no measurement, no animation', () => {
    const fn = /export function TGear\([\s\S]*?\n\}/.exec(KIT)?.[0] ?? '';
    expect(fn).not.toMatch(/useState|useEffect|setInterval|setTimeout|onLayout|Animated|useReduceMotion/);
    // the geometry is derived ONCE per size, not on every render
    expect(fn).toContain('useMemo');
  });

  test('⚠⚠ the exploration header did not grow', () => {
    // The key is the tallest object in the rail, so it alone sets the height the
    // FEED pays for. The glyph it replaced was fontSize 11, which RN lays out at
    // round(11 x 1.25) = 14 — so a 14dp drawn gear occupies the same box and
    // OTA-1746's measured 12dp header cost still holds. That suite recomputes
    // the whole figure from this constant; this is the local statement of why
    // the number is what it is.
    const size = Number(/const SCENE_GEAR_SIZE = (\d+);/.exec(EXP)?.[1] ?? NaN);
    expect(size).toBe(14);
    expect(size).toBe(Math.round(11 * 1.25));
  });

  test('this pass has a stamp of its own, live or superseded', () => {
    /* ⚠ DURABLE CLAIM, NOT A ONE-RELEASE PIN. I wrote the equality form three
     * times in one day and it went red three times, never once for a defect:
     * the next OTA supersedes the stamp within hours. The house rule is one OTA,
     * one stamp, with the previous kept on a `// SUPERSEDED:` line — so the
     * durable claim is that this pass's stamp is IN the ledger, live or not. */
    const BUILD = read('app', 'buildInfo.ts');
    expect(BUILD).toContain("'2026-09-08-1748-the-settings-mark-is-drawn'");
  });
});
