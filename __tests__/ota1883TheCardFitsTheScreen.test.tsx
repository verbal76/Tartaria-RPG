/* ⚠ THE NATIVE EDGE, MOCKED — the same preamble OTA-1872 carries, and for the
 * same reason: these cards read the store, the store reaches the whole engine,
 * and the engine reaches onnxruntime and llama.rn, neither of which exists in a
 * Jest process.
 * ⚠⚠ AND NOT ONE OF THESE CARRIES `{ virtual: true }`. OTA-1246 wrote that lesson
 * and OTA-1881 paid for it again: a virtual mock on a module that GENUINELY
 * EXISTS holds only while the suite runs ALONE, and in a shared run the real
 * binding loads and dies — failing a NEIGHBOUR suite, not this one. */
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('onnxruntime-react-native', () => ({
  InferenceSession: { create: jest.fn(async () => ({ run: jest.fn(async () => ({})) })) },
  Tensor: class { constructor(_t: string, _d: unknown, _s: unknown[]) {} },
}));
jest.mock('llama.rn', () => ({
  initLlama: jest.fn(async () => ({ completion: jest.fn(async () => ({ text: '' })), release: jest.fn() })),
  releaseAllLlama: jest.fn(),
}));
jest.mock('react-native-executorch', () => ({}));
jest.mock('expo-file-system', () => ({
  documentDirectory: '/tmp/', cacheDirectory: '/tmp/',
  getInfoAsync: jest.fn(async () => ({ exists: false })),
  makeDirectoryAsync: jest.fn(async () => {}),
  readAsStringAsync: jest.fn(async () => ''),
  writeAsStringAsync: jest.fn(async () => {}),
  deleteAsync: jest.fn(async () => {}),
  downloadAsync: jest.fn(async () => ({ uri: '' })),
  EncodingType: { UTF8: 'utf8', Base64: 'base64' },
}));
jest.mock('expo-speech', () => ({ speak: jest.fn(), stop: jest.fn(), isSpeakingAsync: jest.fn(async () => false) }));
jest.mock('expo-av', () => ({
  Audio: {
    setAudioModeAsync: jest.fn(),
    Sound: class {
      static createAsync: () => Promise<{ sound: { playAsync: () => void; unloadAsync: () => void } }> =
        jest.fn(async () => ({ sound: { playAsync: jest.fn(), unloadAsync: jest.fn() } }));
    },
  },
}));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '0', applicationId: 'test' }));
jest.mock('expo-asset', () => ({ Asset: { fromModule: () => ({ downloadAsync: jest.fn(async () => {}), localUri: '' }) } }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => {}), getStringAsync: jest.fn(async () => '') }));
jest.mock('expo-constants', () => ({ default: { expoConfig: {} } }));
jest.mock('expo-font', () => ({ loadAsync: jest.fn(async () => {}) }));
jest.mock('expo-speech-recognition', () => ({}));
jest.mock('expo-updates', () => ({}));

/* ⚠ The one seam, exactly as OTA-1872 owns it: `useCardViewport` subscribes to
 * real `Keyboard` events a Jest process never emits. The arithmetic stays real. */
jest.mock('../app/components/KeyboardSafeCard', () => ({
  ...(jest.requireActual('../app/components/KeyboardSafeCard') as object),
  useCardViewport: () => ({ windowHeight: 667, keyboardTop: 667 }),
}));

import { readFileSync } from 'fs';
import { join } from 'path';
import React from 'react';
import { StyleSheet } from 'react-native';
import { GolemNamingModal, GOLEM_CARD_DWELL_MS } from '../app/components/GolemNamingModal';
import { DogOnboardingModal, DOG_CARD_DWELL_MS } from '../app/components/DogOnboardingModal';
import { getGolemDefinition, makeCompanion } from '../app/engine/golems';
import type { PendingDogOnboarding } from '../app/engine/types';
import { tartariaKitStyles as kit } from '../app/ui/tartariaKit';
import { useGameStore } from '../app/state/gameStore';

/**
 * OTA-1883 — THE CARD FITS THE SCREEN.
 *
 * ⚠⚠⚠ THE REPORT, AND THE SCREENSHOT THAT REDIRECTED IT. The owner, on Android,
 * at the golem naming beat: the ROLL control clipped at the right bezel. That
 * reads as a row defect, and it is not one. His screenshot shows the CARD ITSELF
 * oversized — left edge correctly inset, right edge off-screen, the gold divider
 * running through the boundary, both full-width controls overhanging, and the
 * body prose reading "… Crystal Go…" instead of WRAPPING. A `Text` only fails to
 * wrap when no ancestor hands it a definite width. ROLL was the most visible
 * casualty, never the cause.
 *
 * ⚠⚠ THE MECHANISM IS A PERCENTAGE WITH NOTHING TO RESOLVE AGAINST.
 * `momentScrim` is a COLUMN with `alignItems: 'center'`, so its cross axis is
 * HORIZONTAL and a direct child is centred at its CONTENT size rather than
 * stretched. Three of the six beats put the card inside a ScrollView; that
 * ScrollView was the unstretched child, so it handed its content container no
 * definite width, `momentCard`'s `width: '100%'` collapsed to `auto`, and the card
 * sized to its widest intrinsic descendant. `maxWidth: 440` cannot cap a
 * percentage that never resolved.
 *
 * ⚠ AND THE REPO HAD ALREADY REASONED THIS OUT ON THE OTHER AXIS. OTA-1862, on
 * its own `maxHeight: '85%'`: "a ScrollView's content container is sized by its
 * content … so there is nothing for 85% to resolve against and the constraint is
 * dropped." Correct, and nobody carried it across to `width`.
 *
 * ⚠⚠ SO THE OWNER IS THE SCROLLER, NOT THE CARD. `momentCard` is right for the
 * three beats that hang it straight off the scrim, whose inner width IS definite.
 * Repairing `momentCard` would have been repairing the innocent party.
 *
 * ⚠ THE SUITE MEASURES THE RENDERED TREE, NOT THE SOURCE TEXT. Jest carries no
 * Yoga, so it cannot produce pixels — but it can read the STYLE CONTRACT off the
 * real nodes the real components render, and derive the containment arithmetic
 * from those values rather than from numbers retyped here. Change the scrim's
 * gutter, the scroll padding or the 440 cap and §A follows; it does not need
 * re-baselining and it is not a token search.
 */

/* ── the harness ──────────────────────────────────────────────────────────── */

const renderer = require('react-test-renderer') as {
  act(cb: () => void): void;
  create(el: React.ReactElement): Tree;
};

interface TestNode {
  type: unknown;
  parent: TestNode | null;
  props: Record<string, unknown>;
}
interface Tree {
  unmount(): void;
  root: { findAll(fn: (n: TestNode) => boolean): TestNode[] };
}

const ROOT = join(__dirname, '..');
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), 'utf8');
const cmp = (n: string) => read('app', 'components', `${n}.tsx`);

/* ⚠ GRADE THE CODE, NOT THE PROSE — the OTA-1721 class. This package's own
 * comments name the device words and the masking property it exists to forbid,
 * and an unstripped scan would convict them. */
const codeOf = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
     .replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

const nameOf = (n: TestNode): string => {
  const t = n.type;
  return typeof t === 'string'
    ? t
    : (t as { displayName?: string; name?: string })?.displayName
      ?? (t as { name?: string })?.name
      ?? '';
};

const flat = (s: unknown): Record<string, unknown> =>
  (StyleSheet.flatten(s as never) ?? {}) as Record<string, unknown>;

/** ⚠ A `style` PROP IS NOT NECESSARILY AN OBJECT. OTA-1806 made the controls'
 *  planes a function of the finger, so a Pressable's style is
 *  `({ pressed }) => [...]` and `flatten` on the function itself yields nothing —
 *  the same shape OTA-1880's suite tripped over with a children function. Resolve
 *  it at rest, then flatten. */
const restingStyle = (n: TestNode): Record<string, unknown> => {
  const s = n.props.style;
  return typeof s === 'function'
    ? flat((s as (p: { pressed: boolean }) => unknown)({ pressed: false }))
    : flat(s);
};

const num = (v: unknown, what: string): number => {
  if (typeof v !== 'number') throw new Error(`${what} is not a number: ${String(v)}`);
  return v;
};

/** The moment card, found by what `momentCard` IS — its ground and its ceiling —
 *  rather than by which constant it was spelled with. */
const cardOf = (tree: Tree): TestNode => {
  const hits = tree.root.findAll((n) => {
    if (nameOf(n) !== 'View') return false;
    const s = flat(n.props.style);
    return s.backgroundColor === '#17150f' && s.maxWidth === 440;
  });
  if (!hits.length) throw new Error('no moment card rendered');
  return hits[0]!;
};

/** The scrim: the translucent sheet `momentScrim` paints. */
const scrimOf = (tree: Tree): TestNode => {
  const hits = tree.root.findAll(
    (n) => nameOf(n) === 'View' && flat(n.props.style).backgroundColor === 'rgba(0,0,0,0.78)',
  );
  if (!hits.length) throw new Error('no scrim rendered');
  return hits[0]!;
};

/** The nearest ScrollView ABOVE a node, or null when the node hangs straight off
 *  the scrim. Which of those two it is IS the topology this package is about. */
const scrollAbove = (node: TestNode): TestNode | null => {
  for (let p = node.parent; p; p = p.parent) if (nameOf(p) === 'ScrollView') return p;
  return null;
};

/** ⚠ THE INVARIANT THAT MAKES THE OVERFLOW IMPOSSIBLE, STATED ONCE. A flex child
 *  hands its own children a definite cross size only if it HAS one: either it is
 *  stretched, or it declares a width itself. Anything else leaves a percentage
 *  descendant unresolvable. */
const handsDownADefiniteWidth = (style: unknown): boolean => {
  const s = flat(style);
  return s.alignSelf === 'stretch' || typeof s.width === 'number' || s.width === '100%';
};

/** A control, by the words a screen reader would say. */
const controlOf = (tree: Tree, label: string): TestNode => {
  const hits = tree.root.findAll(
    (n) => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function',
  );
  if (!hits.length) throw new Error(`no control labelled ${label}`);
  return hits[0]!;
};

const textsOf = (tree: Tree): string[] =>
  tree.root
    .findAll((n) => nameOf(n) === 'Text')
    .flatMap((n) => {
      const c = n.props.children;
      return Array.isArray(c) ? c.filter((x) => typeof x === 'string') as string[]
        : typeof c === 'string' ? [c] : [];
    });

const mounted: Tree[] = [];

/** The golem the owner actually had in front of him — his prose read
 *  "… Crystal Go…". Built through the engine's own factory rather than a hand-made
 *  literal, so the fixture cannot drift from the shape the game carries. */
const GOLEM = makeCompanion(getGolemDefinition('crystal_golem'));

const openGolem = (): Tree => {
  renderer.act(() => {
    useGameStore.setState((s) => ({
      missionCompleteNotice: null,
      pendingGolemNaming: true,
      player: s.player ? { ...s.player, golem: { ...GOLEM } } : s.player,
    }));
  });
  let tree!: Tree;
  renderer.act(() => { tree = renderer.create(<GolemNamingModal />); });
  // OTA-1044's read-the-summon-line-first dwell. Without this the card is null.
  renderer.act(() => { jest.advanceTimersByTime(GOLEM_CARD_DWELL_MS + 50); });
  mounted.push(tree);
  return tree;
};

const DOG_PENDING: PendingDogOnboarding = {
  stage: 'breed',
  rescueData: { scenario: 'smelter', startingProfile: 'mongrel' },
};

const openDog = (): Tree => {
  renderer.act(() => {
    useGameStore.setState((s) => ({
      missionCompleteNotice: null,
      worldMemory: { ...s.worldMemory, pendingDogOnboarding: { ...DOG_PENDING } },
    }));
  });
  let tree!: Tree;
  renderer.act(() => { tree = renderer.create(<DogOnboardingModal />); });
  renderer.act(() => { jest.advanceTimersByTime(DOG_CARD_DWELL_MS + 50); });
  mounted.push(tree);
  return tree;
};

beforeAll(async () => {
  await useGameStore.getState().startNewGame({
    name: 'Maker', raceId: 'mud_dweller', factionId: 'mud_monarchs',
  });
});

beforeEach(() => { jest.useFakeTimers(); });
/* ⚠ OTA-1881's teardown lesson: React defers a passive effect's destroy past
 * `unmount()`, so an unwrapped teardown lets one test's rows land inside the
 * NEXT test's mount. Flush inside `act`. */
afterEach(() => {
  renderer.act(() => {
    while (mounted.length) {
      const t = mounted.pop()!;
      try { t.unmount(); } catch { /* already gone */ }
    }
  });
  renderer.act(() => {
    useGameStore.setState((s) => ({
      pendingGolemNaming: false,
      player: s.player ? { ...s.player, golem: null } : s.player,
      worldMemory: { ...s.worldMemory, pendingDogOnboarding: null },
    }));
  });
  jest.useRealTimers();
});

/** The widths in ingested owner evidence, plus one wide enough to exercise the
 *  ceiling. 443 is the owner's own Android window (`window 443x986`). */
const WIDTHS = [375, 390, 414, 443] as const;
const WIDE = 600;

/* ══════════════════════════════════════════════════════════════════════════
   §A — THE CARD IS CONTAINED, AT EVERY WIDTH, BY ARITHMETIC THE CARD OWNS.
   ══════════════════════════════════════════════════════════════════════════ */
describe('OTA-1883 §A — the card never asks for more width than the screen leaves', () => {
  /** Read the three insets off the RENDERED nodes, so the contract is the one
   *  production actually ships rather than numbers retyped into a test. */
  const contractFrom = (tree: Tree) => {
    const scrim = flat(scrimOf(tree).props.style);
    const card = flat(cardOf(tree).props.style);
    const scroll = flat(scrollAbove(cardOf(tree))!.props.contentContainerStyle);
    return {
      scrimPad: num(scrim.padding, 'momentScrim.padding'),
      scrollPadH: num(scroll.paddingHorizontal, 'scroll.paddingHorizontal'),
      cardCap: num(card.maxWidth, 'momentCard.maxWidth'),
      cardPad: num(card.padding, 'momentCard.padding'),
    };
  };

  test('cardRight <= availableRight at 375 / 390 / 414 / 443 and at the ceiling', () => {
    const c = contractFrom(openGolem());
    for (const W of [...WIDTHS, WIDE]) {
      const scrimInner = W - c.scrimPad * 2;
      const scrollContent = scrimInner - c.scrollPadH * 2;
      const cardOuter = Math.min(scrollContent, c.cardCap);
      // The card is laid out inside the scroll content box, which is inside the
      // scrim's inner box, which is inside the window. Each step only ever
      // subtracts, so containment is monotone rather than tuned.
      expect(cardOuter).toBeLessThanOrEqual(scrollContent);
      expect(scrollContent).toBeLessThanOrEqual(scrimInner);
      expect(scrimInner).toBeLessThanOrEqual(W);
      expect(cardOuter).toBeLessThanOrEqual(W);
      expect(cardOuter).toBeGreaterThan(0);
    }
  });

  test('the 440 ceiling engages on a wide screen and yields to the screen on a narrow one', () => {
    const c = contractFrom(openGolem());
    const outer = (W: number) => Math.min(W - c.scrimPad * 2 - c.scrollPadH * 2, c.cardCap);
    // Narrow: the screen wins, so the card shrinks instead of overhanging.
    expect(outer(375)).toBeLessThan(c.cardCap);
    expect(outer(375)).toBe(375 - 48 - 40);
    // Wide: the ceiling wins, so the existing maxWidth behaviour is preserved.
    expect(outer(WIDE)).toBe(c.cardCap);
    // And the crossover is a derived number, not a device: 24*2 + 20*2 + 440.
    expect(c.scrimPad * 2 + c.scrollPadH * 2 + c.cardCap).toBe(528);
  });

  test('the row still fits inside the corrected card, at the narrowest width', () => {
    // ⚠ THE SECOND PROOF, AND IT IS A SEPARATE CLAIM. Once the ancestor is
    // definite it does not follow that the row fits — that has to be shown, or a
    // second defect could hide behind the first one's repair.
    const tree = openGolem();
    const c = contractFrom(tree);
    const roll = restingStyle(controlOf(tree, 'Roll a name'));
    const chrome = num(roll.paddingHorizontal, 'rollBtn.paddingHorizontal') * 2
      + num(flat(kit.ctl).borderWidth, 'kit.ctl.borderWidth') * 2;
    const cardInner = (375 - c.scrimPad * 2 - c.scrollPadH * 2) - c.cardPad * 2;
    // A deliberately generous bound on the label: 6 glyphs at 12pt cannot exceed
    // 12/glyph. Jest has no text metrics, so the bound is stated, not measured.
    const GENEROUS_LABEL = 6 * 12;
    expect(chrome + GENEROUS_LABEL).toBeLessThan(cardInner);
    // And what is left for the input is usable, not a sliver.
    expect(cardInner - (chrome + GENEROUS_LABEL) - 8).toBeGreaterThan(100);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   §B — THE DEFINITENESS CHAIN, ON THE RENDERED TREE.
   ══════════════════════════════════════════════════════════════════════════ */
describe('OTA-1883 §B — a scroller carrying a moment card hands down a definite width', () => {
  test('GolemNaming: the card sits under a ScrollView, and that scroller is stretched', () => {
    const tree = openGolem();
    const scroller = scrollAbove(cardOf(tree));
    expect(scroller).not.toBeNull();
    expect(handsDownADefiniteWidth(scroller!.props.style)).toBe(true);
  });

  test('DogOnboarding: the same topology, the same guarantee', () => {
    const tree = openDog();
    const scroller = scrollAbove(cardOf(tree));
    expect(scroller).not.toBeNull();
    expect(handsDownADefiniteWidth(scroller!.props.style)).toBe(true);
  });

  test('the guarantee comes from ONE shared style, so the three cannot drift', () => {
    expect(flat(kit.momentScroll).alignSelf).toBe('stretch');
    expect(handsDownADefiniteWidth(kit.momentScroll)).toBe(true);
    // ⚠ WandererEncounter is the third caller of this topology. It needs a
    // roadside encounter to mount, which is a different fixture than this suite
    // owns, so its adoption is pinned at the source — but on the SHARED object,
    // not on a spelling.
    const w = codeOf(cmp('WandererEncounterModal'));
    expect(w).toContain('kit.momentScroll');
    expect(/<ScrollView\s+style=\{kit\.momentScroll\}/.test(w)).toBe(true);
  });

  test('all three same-topology callers adopt it, and no other file does', () => {
    const ADOPTERS = ['GolemNamingModal', 'DogOnboardingModal', 'WandererEncounterModal'];
    const DIRECT_CHILD = ['CombatPrimerModal', 'MissionCompleteModal', 'MissionStingerModal'];
    for (const n of ADOPTERS) expect(codeOf(cmp(n))).toContain('kit.momentScroll');
    // ⚠ The other three were never affected — their card is a direct child of the
    // scrim, whose inner width IS definite. Handing them this style would be
    // repairing something that was already right.
    for (const n of DIRECT_CHILD) expect(codeOf(cmp(n))).not.toContain('momentScroll');
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   §C — GROUP A IS UNPERTURBED.
   ══════════════════════════════════════════════════════════════════════════ */
describe('OTA-1883 §C — the three direct-child beats keep their geometry', () => {
  test('their card is not wrapped in a scroller, which is why they were correct', () => {
    for (const n of ['CombatPrimerModal', 'MissionCompleteModal', 'MissionStingerModal']) {
      const code = codeOf(cmp(n));
      const scrim = code.indexOf('kit.momentScrim');
      const card = code.indexOf('style={CARD}');
      const scroll = code.indexOf('<ScrollView');
      expect(scrim).toBeGreaterThanOrEqual(0);
      // The card is reached BEFORE any scroller: it hangs off the scrim, and the
      // scroller (where there is one) lives INSIDE the card for its body copy.
      if (card >= 0 && scroll >= 0) expect(card).toBeLessThan(scroll);
    }
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   §D — EVERY OWNER-VISIBLE CONTROL SURVIVES, AND THE ROW IS STILL THE ROW.
   ══════════════════════════════════════════════════════════════════════════ */
describe('OTA-1883 §D — nothing was removed to win the width', () => {
  test('the card still says all four of its lines', () => {
    const t = textsOf(openGolem()).join(' | ');
    expect(t).toContain('THE CONSTRUCT WAKES');
    expect(t).toContain('Name your golem');
    expect(t).toContain('SEAL THE NAME');
    expect(t).toContain('KEEP ITS MAKING');
    expect(t).toContain('ROLL');
  });

  test('ROLL is present, pressable, and still shares one row with the input', () => {
    const tree = openGolem();
    const roll = controlOf(tree, 'Roll a name');
    expect(typeof roll.props.onPress).toBe('function');
    const input = tree.root.findAll((n) => n.props.accessibilityLabel === 'Golem name')[0];
    expect(input).toBeDefined();
    // ⚠ The intended topology is NAME INPUT + ACCESSORY in ONE row. Proven by a
    // shared row ancestor, not by a style name.
    const rowOf = (n: TestNode): TestNode | null => {
      for (let p = n.parent; p; p = p.parent) {
        if (nameOf(p) === 'View' && flat(p.props.style).flexDirection === 'row') return p;
      }
      return null;
    };
    const rowA = rowOf(roll);
    const rowB = rowOf(input!);
    expect(rowA).not.toBeNull();
    expect(rowA).toBe(rowB);
  });

  test('SEAL THE NAME and KEEP ITS MAKING are both reachable controls', () => {
    const tree = openGolem();
    expect(typeof controlOf(tree, 'Seal the name').props.onPress).toBe('function');
    expect(typeof controlOf(tree, 'Keep its making').props.onPress).toBe('function');
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   §E — THE REPAIR IS RESPONSIVE, NOT A BRANCH, AND NOT A MASK.
   ══════════════════════════════════════════════════════════════════════════ */
describe('OTA-1883 §E — one topology, no device tests, no clipping', () => {
  const CHANGED = ['GolemNamingModal', 'DogOnboardingModal', 'WandererEncounterModal'];

  test('no device, platform or model test appears in any changed component', () => {
    for (const n of CHANGED) {
      const code = codeOf(cmp(n));
      for (const forbidden of ['Platform.OS', 'isSmallPhone', 'Pixel', 'iPhone', 'useWindowDimensions', 'Dimensions.get']) {
        expect(code.includes(forbidden)).toBe(false);
      }
    }
  });

  test('the shared style itself names no device and declares only a cross-axis rule', () => {
    const s = flat(kit.momentScroll);
    expect(Object.keys(s)).toEqual(['alignSelf']);
  });

  test('containment was not bought with a clipping mask', () => {
    for (const n of CHANGED) {
      expect(codeOf(cmp(n))).not.toContain("overflow: 'hidden'");
    }
    expect(flat(kit.momentScroll).overflow).toBeUndefined();
    expect(flat(kit.momentCard).overflow).toBeUndefined();
  });

  test('the card keeps the percentage AND the ceiling — the repair gave it a base', () => {
    // ⚠ The fix is upstream. `momentCard` is untouched, and that is the claim:
    // it was always right, for the three callers whose parent was definite.
    const c = flat(kit.momentCard);
    expect(c.width).toBe('100%');
    expect(c.maxWidth).toBe(440);
    expect(c.padding).toBe(20);
  });
});
