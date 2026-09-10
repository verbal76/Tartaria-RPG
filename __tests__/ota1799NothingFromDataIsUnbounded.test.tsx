jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

/**
 * OTA-1799 — NOTHING WHOSE HEIGHT COMES FROM DATA MAY BE UNBOUNDED.
 *
 * ⚠⚠⚠ THE REPORT, AND WHY IT IS NOT A COATING BUG. A physical Android photo:
 * APPLY ACID FLASK, and the list of coatable weapons runs off the bottom of the
 * screen and into the system navigation region. The owner's ruling on scope is
 * the whole reason this suite is shaped the way it is:
 *
 *   *"ACID FLASK IS ONLY THE PHYSICAL SPECIMEN. DO NOT create an Acid Flask-
 *   specific bug. DO NOT create an Acid Flask-specific repair… Fix the lowest
 *   correct shared authority."*
 *
 * So there is not one assertion about Acid Flask in this file, and not one about
 * coatings. There is a rule, and the rule is checked wherever a card lets a
 * COLLECTION decide how many rows it draws.
 *
 * ⚠⚠ THE MECHANISM, exactly. OTA-1614 stopped a card's BODY growing past the
 * screen: give the body a scroll, pin the buttons below it. What it could not
 * anticipate was a caller putting a DYNAMIC POPULATION into the pinned row —
 * the one region whose entire job is never to move. `BrandedModal`'s button row
 * had no ceiling, no `flexShrink` and no scroll, and of its ~31 call sites
 * exactly two pass a collection-derived array. Grow the pack and the rows grow;
 * grow the rows and they leave the card, then the screen.
 *
 * ⚠ MEASURED, AND STATED IN THE ONE UNIT THAT DOES NOT DEPEND ON THE
 * INSTRUMENT. At 375×667 with 30 coatable weapons, before the repair: 33 rows,
 * ZERO of them inside any scroller. That is the defect. The rows laid out from
 * y=127 to y=1585 — 985 pt below the card's own bottom edge, in a 667 pt
 * window — with no scroll path to any of them, 21 of the 33 not hittable at
 * all, and the way out (CANCEL) as the last of them. A clip-aware reading and a
 * raw-layout reading disagree about what to CALL those rows on web, because the
 * card clips them there; they agree that nothing can reach them, and the
 * owner's Android photograph shows them drawn into the navigation region.
 * After: 33 rows, 33 inside the scroller, CANCEL reachable at the end of it.
 *
 * ⚠⚠ THREE LEVELS, DELIBERATELY. Level 1 is arithmetic over the device list —
 * fast, exact, and it runs the acceptance criteria instead of asserting them.
 * Level 2 RENDERS the real components and asks the architectural question
 * behaviourally: is the region whose child count tracks the data inside
 * something that scrolls? That is a rule about structure, not a census of
 * syntax — rename the styles, reorder the JSX, swap the container, and it still
 * answers correctly, while reverting the region to a plain View fails it.
 * Level 3 is the rendered viewport sweep, which lives in the harness and not
 * here, because it needs a browser.
 *
 * ⚠ WHAT THIS SUITE CANNOT DO, said plainly. It cannot open a keyboard, it
 * cannot measure a real safe-area inset, and it cannot tell you what an iPhone
 * SE does. Those remain the owner's device checklist. What it can do is make the
 * arithmetic and the structure impossible to regress silently.
 */
import React from 'react';
import {
  CARD_MARGIN,
  DEVICE_PROFILES,
  NO_INSETS,
  cardMaxHeight,
  cardStaysBounded,
  layoutCard,
  usableBottom,
  usableHeight,
  usableTop,
  visibleBottom,
  type CardRegions,
  type UsableViewport,
} from '../app/engine/keyboardSafeCard';
import { BrandedModal, type BrandedModalButton } from '../app/components/BrandedModal';
import { GatherModal, type GatherChip } from '../app/components/GatherModal';

const renderer = require('react-test-renderer') as {
  act(cb: () => void): void;
  create(el: React.ReactElement): Tree;
};

interface Tree {
  unmount(): void;
  root: { findAll(fn: (n: TestNode) => boolean): TestNode[] };
}

/** ⚠ WHAT IS MOUNTED GETS UNMOUNTED. OTA-1798's whole subject was instruments
 *  that keep running after the thing that started them is gone; a suite that
 *  leaves a dozen live component trees behind is the same mistake in the test
 *  tree. Every render here is registered and torn down after its test. */
const mounted: Tree[] = [];
const mount = (el: React.ReactElement): Tree => {
  let tree!: Tree;
  renderer.act(() => { tree = renderer.create(el); });
  mounted.push(tree);
  return tree;
};
afterEach(() => {
  while (mounted.length) {
    const t = mounted.pop()!;
    renderer.act(() => { try { t.unmount(); } catch { /* already gone */ } });
  }
});

interface TestNode {
  type: unknown;
  parent: TestNode | null;
  props: Record<string, unknown>;
  children: unknown[];
}

/* ══════════════════════════════════════════════════════════════════════════
   LEVEL 1 — THE ARITHMETIC, OVER THE REAL DEVICE LIST.
   ══════════════════════════════════════════════════════════════════════════ */

/** The insets a modern notch phone actually reserves, and the ones the audit's
 *  Android photo was taken through. Not device detection — a pessimistic pair
 *  used to check that reserving space CANNOT make the answer worse. */
const NOTCH: { top: number; bottom: number } = { top: 47, bottom: 34 };
const ANDROID_NAV: { top: number; bottom: number } = { top: 24, bottom: 48 };

const withInsets = (v: UsableViewport, insets: { top: number; bottom: number }): UsableViewport =>
  ({ ...v, insets });

/** ⚠ A LOOKUP THAT CANNOT GO QUIET. Reading DEVICE_PROFILES by key yields
 *  `T | undefined`, and a test that silently measures `undefined` is a test that
 *  passes for the wrong reason the day someone renames a device. */
const profile = (name: string): UsableViewport => {
  const vp = DEVICE_PROFILES[name];
  if (!vp) throw new Error(`no such device profile: ${name}`);
  return vp;
};

/** The height a named region actually got, or a loud failure. */
const region = (heights: number[], i: number): number => {
  const h = heights[i];
  if (typeof h !== 'number') throw new Error(`layoutCard returned no region ${i}`);
  return h;
};

describe('OTA-1799 level 1 — the usable viewport is what the platform leaves', () => {
  // ⚠ THE PROPERTY THAT MAKES ADOPTION FREE. Every consumer written against
  // OTA-1718 passes no insets. If the arithmetic moved by so much as a pixel
  // for those callers this repair would be a redesign of eight other cards.
  it('with no insets, reduces exactly to the OTA-1718 numbers', () => {
    for (const [name, vp] of Object.entries(DEVICE_PROFILES)) {
      expect(usableTop(vp)).toBe(0);
      expect(usableBottom(vp)).toBe(visibleBottom(vp));
      expect(usableHeight(vp)).toBe(visibleBottom(vp));
      // The explicit NO_INSETS spelling must agree with omitting the field.
      expect(cardMaxHeight({ ...vp, insets: NO_INSETS })).toBe(cardMaxHeight(vp));
      expect(cardMaxHeight(vp)).toBe(Math.max(0, visibleBottom(vp) - CARD_MARGIN * 2));
      expect(name.length).toBeGreaterThan(0);
    }
  });

  it('reserving edges never grows the room a card is allowed to use', () => {
    for (const vp of Object.values(DEVICE_PROFILES)) {
      for (const insets of [NOTCH, ANDROID_NAV]) {
        const tighter = withInsets(vp, insets);
        expect(usableHeight(tighter)).toBeLessThanOrEqual(usableHeight(vp));
        expect(cardMaxHeight(tighter)).toBeLessThanOrEqual(cardMaxHeight(vp));
        expect(usableTop(tighter)).toBe(insets.top);
      }
    }
  });

  // ⚠ THE KEYBOARD STILL WINS WHEN IT IS THE LOWER EDGE. A bottom inset and an
  // open keyboard are not additive — the home indicator sits UNDER the keyboard.
  // Taking the smaller of the two is the correct reading and the pessimistic one.
  it('takes whichever comes first, the keyboard or the system furniture', () => {
    const open: UsableViewport = { windowHeight: 844, keyboardTop: 508, insets: NOTCH };
    expect(usableBottom(open)).toBe(508);
    const closed: UsableViewport = { windowHeight: 844, keyboardTop: 844, insets: NOTCH };
    expect(usableBottom(closed)).toBe(844 - NOTCH.bottom);
  });

  it('refuses to return nonsense for the numbers a strange device reports', () => {
    const daft: UsableViewport = {
      windowHeight: 667,
      keyboardTop: Number.NaN,
      insets: { top: -10, bottom: -10 },
    };
    expect(usableTop(daft)).toBe(0);
    expect(usableBottom(daft)).toBe(667);
    expect(usableHeight(daft)).toBeGreaterThanOrEqual(0);
    expect(cardMaxHeight(daft)).toBeGreaterThanOrEqual(0);

    const inverted: UsableViewport = { windowHeight: 100, keyboardTop: 900, insets: { top: 500, bottom: 500 } };
    expect(usableHeight(inverted)).toBe(0);
    expect(cardMaxHeight(inverted)).toBe(0);
  });
});

describe('OTA-1799 level 1 — layoutCard says what each region really gets', () => {
  const vp = profile('iPhone SE 3');

  it('leaves a card that already fits exactly as it was', () => {
    const regions: CardRegions = { fixed: 120, scrollable: [80, 40] };
    const out = layoutCard(vp, regions);
    expect(out.overflowed).toBe(false);
    expect(out.regionHeights).toEqual([80, 40]);
    expect(out.cardHeight).toBe(240);
    expect(out.cardHeight).toBeLessThan(cardMaxHeight(vp));
  });

  it('caps an oversized card and shares the shortfall by natural height', () => {
    const ceiling = cardMaxHeight(vp);
    const out = layoutCard(vp, { fixed: 100, scrollable: [ceiling, ceiling] });
    expect(out.cardHeight).toBeCloseTo(ceiling, 5);
    // Equal naturals take equal shares — the rule Yoga runs, stated as arithmetic.
    expect(region(out.regionHeights, 0)).toBeCloseTo(region(out.regionHeights, 1), 5);
    expect(region(out.regionHeights, 0) + region(out.regionHeights, 1)).toBeCloseTo(ceiling - 100, 5);
  });

  // ⚠ `overflowed` is the honest failure and it must not be quietly survivable:
  // chrome alone taller than the ceiling cannot be scrolled out of.
  it('reports chrome that cannot fit rather than pretending it can', () => {
    const out = layoutCard(vp, { fixed: cardMaxHeight(vp) + 1, scrollable: [50] });
    expect(out.overflowed).toBe(true);
    expect(out.regionHeights).toEqual([0]);
    expect(cardStaysBounded(vp, { fixed: cardMaxHeight(vp) + 1, scrollable: [50] })).toBe(false);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   LEVEL 1 (§19) — THE CHOOSER INVARIANT, AT EVERY POPULATION.
   ══════════════════════════════════════════════════════════════════════════
   ⚠ The five populations are the ones the harness drove through real navigation
   on the real build: one target, four, eight, sixteen, thirty. A chooser is
   sound when growing the population grows the SCROLLABLE CONTENT and never the
   card — on every device, with and without a keyboard, with and without the
   platform's own furniture reserved. */
const POPULATIONS = [1, 4, 8, 16, 30, 120] as const;
/** A target row and the card's own chrome, measured from BrandedModal's styles.
 *  Generous: if the real row is shorter the player has MORE room, not less. */
const ROW = 52;
const CHOOSER_CHROME = 150;

describe('OTA-1799 level 1 — a chooser stays bounded however full the pack is', () => {
  it.each(Object.keys(DEVICE_PROFILES))('%s — every population, every edge condition', (device) => {
    const base = profile(device);
    const conditions: Array<[string, UsableViewport]> = [
      ['keyboard closed', { ...base, keyboardTop: base.windowHeight }],
      ['keyboard open', base],
      ['notch + home indicator', withInsets({ ...base, keyboardTop: base.windowHeight }, NOTCH)],
      ['android navigation bar', withInsets({ ...base, keyboardTop: base.windowHeight }, ANDROID_NAV)],
    ];
    for (const [, vp] of conditions) {
      let previousCard = 0;
      for (const n of POPULATIONS) {
        const regions: CardRegions = { fixed: CHOOSER_CHROME, scrollable: [n * ROW] };
        expect(cardStaysBounded(vp, regions)).toBe(true);
        const out = layoutCard(vp, regions);
        expect(out.cardHeight).toBeLessThanOrEqual(cardMaxHeight(vp) + 0.5);
        // ⚠ MONOTONIC, AND CAPPED. More targets may make the card taller while
        // there is room, and must NEVER make it taller than the ceiling.
        expect(out.cardHeight).toBeGreaterThanOrEqual(previousCard - 0.5);
        previousCard = out.cardHeight;
      }
    }
  });

  // ⚠ THE PHOTOGRAPHED CASE, AS ARITHMETIC. 30 targets on the smallest supported
  // screen. Without a ceiling the region wants 1,560 pt in a 667 pt window.
  it('the photographed population on the smallest screen fits, and scrolls', () => {
    const se = profile('iPhone SE 3');
    const vp = withInsets({ ...se, keyboardTop: se.windowHeight }, ANDROID_NAV);
    const natural = 30 * ROW;
    const out = layoutCard(vp, { fixed: CHOOSER_CHROME, scrollable: [natural] });
    expect(out.overflowed).toBe(false);
    expect(out.cardHeight).toBeLessThanOrEqual(cardMaxHeight(vp) + 0.5);
    // The rows did not shrink into nothing — they became a scroll.
    expect(region(out.regionHeights, 0)).toBeGreaterThan(ROW);
    expect(region(out.regionHeights, 0)).toBeLessThan(natural);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   LEVEL 2 — THE ARCHITECTURAL RULE, ASKED OF THE RENDERED TREE.
   ══════════════════════════════════════════════════════════════════════════
   ⚠⚠ WHY THIS IS NOT A SOURCE PIN. The owner's ruling: *"Do NOT create a
   brittle syntax census or source-pin ratchet."* Right — a count of the string
   "ScrollView" proves nothing about where it sits. So these tests render the
   real component twice, with a SMALL population and a LARGE one, and ask two
   questions of the actual tree:

     1. Which region's child count grew with the data?
     2. Does that region have a scrolling ancestor?

   A region that answers "yes" is bounded by construction, whatever its styles
   are called. A region that answers "no" is the defect, whatever they are
   called. */

const SCROLL_HOSTS = new Set(['RCTScrollView', 'ScrollView', 'FlatList']);

const isScrollOwner = (node: TestNode): boolean => {
  const t = node.type;
  const name = typeof t === 'string'
    ? t
    : (t as { displayName?: string; name?: string })?.displayName
      ?? (t as { name?: string })?.name
      ?? '';
  return SCROLL_HOSTS.has(name);
};

const hasScrollingAncestor = (node: TestNode): boolean => {
  for (let p = node.parent; p; p = p.parent) if (isScrollOwner(p)) return true;
  return false;
};

const isButton = (n: TestNode): boolean => (n.props ?? {}).accessibilityRole === 'button';

/** What a control says, whether it says it through an accessibility label or
 *  only through the text drawn on its face. Both are how a player reads it. */
const faceOf = (node: TestNode): string => {
  const label = (node.props ?? {}).accessibilityLabel;
  if (typeof label === 'string' && label.length > 0) return label;
  const words: string[] = [];
  const walk = (v: unknown): void => {
    if (typeof v === 'string') { words.push(v); return; }
    if (Array.isArray(v)) { v.forEach(walk); return; }
    const n = v as TestNode | null;
    if (n && typeof n === 'object' && Array.isArray(n.children)) n.children.forEach(walk);
  };
  node.children.forEach(walk);
  return words.join(' ').trim();
};

/** ⚠ ONE NODE PER CONTROL, and the de-duplication has to be careful. A single
 *  `<Pressable accessibilityRole="button">` renders as four NESTED nodes that
 *  all carry the role, so a raw count multiplies every control by four and the
 *  "does this region multiply with the data" assertions would mean nothing.
 *
 *  ⚠ "Outermost button wins" is the obvious rule and it is WRONG here: this
 *  sheet's scrim is itself a button (tap outside to close), so every real
 *  control has a button ancestor and that rule collapses the whole tree to one
 *  node. What actually identifies the four copies of one control is that they
 *  SAY THE SAME THING — so a node counts unless an ancestor has the same face. */
const pressablesLabelled = (
  root: { findAll(fn: (n: TestNode) => boolean): TestNode[] },
  rx: RegExp,
): TestNode[] =>
  root.findAll(isButton).filter((n) => {
    const face = faceOf(n);
    if (!rx.test(face)) return false;
    for (let p = n.parent; p; p = p.parent) if (isButton(p) && faceOf(p) === face) return false;
    return true;
  });

const chooserButtons = (n: number): BrandedModalButton[] =>
  Array.from({ length: n }, (_, i) => ({
    label: `Target ${i + 1}`,
    onPress: () => {},
    tone: 'neutral' as const,
  })).concat([{ label: 'CANCEL', onPress: () => {}, tone: 'neutral' as const }]);

const renderChooser = (n: number): Tree => mount(
  <BrandedModal
    visible
    title="Choose a target"
    body="Which one?"
    buttons={chooserButtons(n)}
    onRequestClose={() => {}}
  />,
);

describe('OTA-1799 level 2 — the chooser puts its population inside a scroll', () => {
  // ⚠ THE ONE THAT WOULD HAVE CAUGHT THE PHOTOGRAPH. Before the repair every
  // one of these rows was a direct child of a plain View with no ancestor that
  // scrolled, so this assertion failed for all 31 of them.
  it('every target row has a scrolling ancestor, at 1 target and at 40', () => {
    for (const n of [1, 40]) {
      const tree = renderChooser(n);
      // ⚠ Case-insensitive on purpose: this card upper-cases what it is given,
      // and the test is about where a control SITS, not how it is spelled.
      const rows = pressablesLabelled(tree.root, /^target \d+$/i);
      expect(rows.length).toBe(n);
      for (const row of rows) expect(hasScrollingAncestor(row)).toBe(true);
    }
  });

  // ⚠ AND THE WAY OUT IS INSIDE IT TOO. A CANCEL pinned outside the scroll
  // would be fine; a CANCEL pushed past the card's edge by the rows above it is
  // the defect wearing a different hat. Either way it must be in the scroll or
  // in fixed chrome — never after unbounded content in an unscrolled region.
  it('CANCEL is reachable by the same scroll that holds the targets', () => {
    const tree = renderChooser(40);
    const [cancel] = pressablesLabelled(tree.root, /^CANCEL$/);
    if (!cancel) throw new Error('the chooser rendered no way out');
    expect(hasScrollingAncestor(cancel)).toBe(true);
  });

  // ⚠ THE STRUCTURE MUST NOT DEPEND ON THE POPULATION. A card that grows a new
  // scroll region only once it is already too tall has not fixed anything — it
  // has moved the threshold. The same shape at 1 and at 40 is the invariant.
  it('the number of scroll regions does not depend on the population', () => {
    const small = renderChooser(1).root.findAll(isScrollOwner).length;
    const large = renderChooser(40).root.findAll(isScrollOwner).length;
    expect(large).toBe(small);
  });
});

/* ⚠⚠ THE MIRROR CASE. GatherModal's action region is the OTHER shape of the
 * same question: it is deliberately pinned and deliberately NOT scrolled,
 * because the player must always be able to leave the room. That is only sound
 * if its child count is bounded BY CONSTRUCTION — one sweep per lane, and there
 * are only ever three lanes with a sweep — while the lanes themselves, which do
 * grow with the room, live inside the scroll. */
const room = (n: number): GatherChip[] =>
  Array.from({ length: n }, (_, i) => ({ noun: `brick ${i + 1}` }));

const renderRoom = (n: number): Tree => mount(
  <GatherModal
    visible
    chips={room(n)}
    player={null}
    onTake={() => {}}
    onSalvage={() => {}}
    onTakeAll={() => {}}
    onSalvageAll={() => {}}
    onInvestigate={() => {}}
    onCancel={() => {}}
  />,
);

describe('OTA-1799 level 2 — the room sheet keeps its way out, and bounds it', () => {
  it('the row for every noun in the room has a scrolling ancestor', () => {
    for (const n of [1, 60]) {
      const tree = renderRoom(n);
      const rows = pressablesLabelled(tree.root, /^brick \d+\. Tap to/i);
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) expect(hasScrollingAncestor(row)).toBe(true);
    }
  });

  /** The bulk actions and the way out — the controls the owner photographed
   *  terminating under a room's own contents. */
  const PERSISTENT = /^(TAKE ALL |⚒ SALVAGE ALL|Ignore the rest)/i;

  // ⚠⚠ THE DEFECT THIS ONE NAMES, and it is the exact shape the sweep buttons
  // had before OTA-1799: a bulk action rendered INSIDE its own lane, so a room
  // with enough rows scrolls the button that clears them out of sight. Every
  // persistent control — not just the way out — has to sit outside the scroll,
  // or "persistent" is a claim rather than a property.
  it('no persistent control sits inside the scroll the room can grow', () => {
    for (const n of [1, 60]) {
      const controls = pressablesLabelled(renderRoom(n).root, PERSISTENT);
      expect(controls.length).toBeGreaterThan(0);
      for (const c of controls) expect(hasScrollingAncestor(c)).toBe(false);
    }
  });

  // ⚠ THE PINNED REGION, BOUNDED BY CONSTRUCTION. Sixty nouns and one noun give
  // the same persistent controls, and the way out is one of them at both sizes.
  it('the persistent controls do not multiply with the size of the room', () => {
    const controls = (n: number) => pressablesLabelled(renderRoom(n).root, PERSISTENT).length;
    const small = controls(1);
    const large = controls(60);
    expect(large).toBe(small);
    expect(large).toBeLessThanOrEqual(4);
  });

  it('IGNORE THE REST is never inside the scroll that the room can grow', () => {
    const tree = renderRoom(60);
    const [ignore] = pressablesLabelled(tree.root, /^Ignore the rest/i);
    if (!ignore) throw new Error('the room sheet rendered no way out');
    expect(hasScrollingAncestor(ignore)).toBe(false);
  });
});
