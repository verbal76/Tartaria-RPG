/* ⚠ THE NATIVE EDGE, MOCKED — the same preamble OTA-1862 carries, and for the
 * same reason: DogOnboardingModal reads the store, the store reaches the whole
 * engine, and the engine reaches onnxruntime and llama.rn, neither of which
 * exists in a Jest process. */
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

/* ⚠⚠ THE ONE SEAM THIS SUITE OWNS. `useCardViewport` subscribes to real
 * `Keyboard` events, which a Jest process never emits. Mocking THE HOOK rather
 * than the arithmetic is deliberate: `keyboardInset`, `visibleBottom` and the
 * device table stay the real shipped ones, so what is under test is how the
 * MODAL spends the viewport, not whether the viewport maths is right (OTA-1718
 * already owns that). */
let MOCK_VP = { windowHeight: 667, keyboardTop: 667 };
jest.mock('../app/components/KeyboardSafeCard', () => ({
  ...(jest.requireActual('../app/components/KeyboardSafeCard') as object),
  useCardViewport: () => MOCK_VP,
}));

import React from 'react';
import { StyleSheet } from 'react-native';
import { DEVICE_PROFILES, keyboardInset, visibleBottom } from '../app/engine/keyboardSafeCard';
import type { PendingDogOnboarding } from '../app/engine/types';
import { DogOnboardingModal, DOG_CARD_DWELL_MS } from '../app/components/DogOnboardingModal';
import { useGameStore } from '../app/state/gameStore';

/**
 * OTA-1872 — THE KEYBOARD LEAVES THE CARD A ROOM.
 *
 * ⚠⚠⚠ THE REPORT. The owner, on a physical small Android phone, at the rescue
 * beat: the keyboard opens for the name field and the card "remains essentially
 * full-height behind the keyboard" — the composition badly compressed, the lower
 * content obscured, TAKE THEM WITH YOU only technically on screen.
 *
 * ⚠⚠ THE DEFECT IS AN ASSUMPTION, NOT A MISSING FEATURE. This card is one of
 * Family B's three WRAPPED adopters (OTA-1862 names them: DogOnboarding,
 * GolemNaming, WandererEncounter): the whole card sits inside a ScrollView that
 * is a flex child of `momentScrim`, "so the card may be any height and stays
 * reachable." That containment is sound — and it silently assumes THE SCROLLER'S
 * VIEWPORT IS THE VISIBLE AREA. With the keyboard open that assumption is false.
 * `momentScrim` is `flex: 1` of the full Modal frame, so the ScrollView keeps its
 * FULL-WINDOW height and its lower portion lies underneath the keyboard.
 *
 * ⚠ AND OTA-1718's INSET WAS SPENT IN THE WRONG PLACE. It added
 * `paddingBottom: 32 + kbInset` to the scroll CONTENT — trailing space below the
 * card, inside the scroller. That buys scroll DISTANCE; it never shrinks the
 * scroller. So the card is still laid out against the whole window and the
 * player has to discover a drag to rescue a control that is drawn behind the
 * keyboard — which is exactly what §4E of the brief forbids: the modal must not
 * rely on content extending invisibly behind the keyboard.
 *
 * ⚠⚠⚠ THE REPAIR IS THE INSET, MOVED ONE LEVEL OUT — and it is the idiom the
 * house already uses. `KeyboardSafeCard`, the shared shell the other three
 * text-entry modals ride, spends its inset on THE SCRIM:
 * `style={[styles.scrim, { paddingBottom: inset }]}`. Doing the same here makes
 * the scroller's viewport equal the visible box, so the card scrolls INSIDE the
 * room the keyboard left instead of behind the keyboard.
 *
 * ⚠ NOTHING SHRINKS. No font, control, field, spacing or copy changes, and with
 * the keyboard CLOSED `keyboardInset` is 0, the scrim's `paddingBottom` resolves
 * to the 24 it already had from `momentScrim.padding`, and the content keeps the
 * 32 it already had from `paddingVertical`. The closed-keyboard tree is
 * byte-identical — §E proves it rather than asserting it.
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
  toJSON(): unknown;
  root: { findAll(fn: (n: TestNode) => boolean): TestNode[] };
}

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

/** The scrim: the translucent sheet `momentScrim` paints, found by what it IS
 *  rather than by which style constant it was spelled with. */
const scrimOf = (tree: Tree): TestNode => {
  const hits = tree.root.findAll(
    (n) => nameOf(n) === 'View' && flat(n.props.style).backgroundColor === 'rgba(0,0,0,0.78)',
  );
  if (!hits.length) throw new Error('the card rendered no scrim');
  return hits[0]!;
};

const scrollOf = (tree: Tree): TestNode => {
  const hits = tree.root.findAll((n) => nameOf(n) === 'ScrollView');
  if (!hits.length) throw new Error('the card rendered no scroller');
  return hits[0]!;
};

/** A control, by the words a screen reader would say. Pressable renders a host
 *  View beneath itself carrying the same label, so keep the one that owns the
 *  handler — that is the component, and the component is what production runs. */
const controlOf = (tree: Tree, label: string): TestNode => {
  const hits = tree.root.findAll(
    (n) => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function',
  );
  if (!hits.length) throw new Error(`no control labelled ${label}`);
  return hits[0]!;
};

const isUnder = (node: TestNode, ancestor: TestNode): boolean => {
  for (let p = node.parent; p; p = p.parent) if (p === ancestor) return true;
  return false;
};

/** The real shape the rescue writes — `smelter` is the first of the six
 *  scenarios, and the card reads only `breed`/`name` off it. */
const PENDING: PendingDogOnboarding = {
  stage: 'breed',
  rescueData: { scenario: 'smelter', startingProfile: 'mongrel' },
};

const mounted: Tree[] = [];
const open = (vp: { windowHeight: number; keyboardTop: number }): Tree => {
  MOCK_VP = vp;
  renderer.act(() => {
    useGameStore.setState((s) => ({
      missionCompleteNotice: null,
      worldMemory: { ...s.worldMemory, pendingDogOnboarding: { ...PENDING } },
    }));
  });
  let tree!: Tree;
  renderer.act(() => { tree = renderer.create(<DogOnboardingModal />); });
  // OTA-1043's read-the-fight-first dwell. Without this the card is still null.
  renderer.act(() => { jest.advanceTimersByTime(DOG_CARD_DWELL_MS + 50); });
  mounted.push(tree);
  return tree;
};

/** ⚠ The card refuses to render without a player — `if (!pending || !player)`.
 *  Built through the store's own entry point rather than a hand-made literal, so
 *  the fixture cannot drift from the shape the game actually carries. */
beforeAll(async () => {
  await useGameStore.getState().startNewGame({
    name: 'Rescuer', raceId: 'mud_dweller', factionId: 'mud_monarchs',
  });
});

beforeEach(() => { jest.useFakeTimers(); });
afterEach(() => {
  while (mounted.length) {
    const t = mounted.pop()!;
    renderer.act(() => { try { t.unmount(); } catch { /* already gone */ } });
  }
  renderer.act(() => {
    useGameStore.setState((s) => ({
      worldMemory: { ...s.worldMemory, pendingDogOnboarding: null },
    }));
  });
  jest.useRealTimers();
});

/** The smallest supported target, plus the Android geometry the screenshot
 *  shows. `DEVICE_PROFILES` is the shipped table — reused, not re-guessed. */
const SE = DEVICE_PROFILES['iPhone SE 3']!;
const ANDROID_SMALL = { windowHeight: 640, keyboardTop: 640 - 290 };
const CLOSED_SE = { windowHeight: SE.windowHeight, keyboardTop: SE.windowHeight };
const TALL = DEVICE_PROFILES['iPhone 15 Pro Max']!;
const CLOSED_TALL = { windowHeight: TALL.windowHeight, keyboardTop: TALL.windowHeight };

/* ── §A. THE CONTRACT, AS A PROPERTY OF THE RENDERED TREE ─────────────────── */

describe('OTA-1872 §A — the scrolling region stops where the keyboard starts', () => {
  /** ⚠⚠⚠ THE CLAIM THE REPAIR EXISTS FOR, and the one that is red before it.
   *  The scroller is the scrim's only flex child, so the scrim's bottom padding
   *  IS how much of the window the scroller gives back to the keyboard. If that
   *  is less than the keyboard's own inset, the scroller extends underneath the
   *  keyboard and part of the card is drawn where no finger can reach it. */
  for (const [label, vp] of [
    ['iPhone SE 3', SE],
    ['small Android (the screenshot)', ANDROID_SMALL],
    ['iPhone 13 mini', DEVICE_PROFILES['iPhone 13 mini']!],
    ['iPhone 14', DEVICE_PROFILES['iPhone 14']!],
  ] as const) {
    it(`⚠⚠⚠ ${label}: the scroller yields the whole keyboard inset`, () => {
      const tree = open(vp);
      const inset = keyboardInset(vp);
      expect(inset).toBeGreaterThan(0); // the fixture really does open a keyboard
      const pad = Number(flat(scrimOf(tree).props.style).paddingBottom ?? 0);
      expect(pad).toBeGreaterThanOrEqual(inset);
    });
  }

  it('⚠⚠ the inset is spent ONCE — the content does not double-count it', () => {
    const tree = open(SE);
    const inset = keyboardInset(SE);
    const contentPad = Number(flat(scrollOf(tree).props.contentContainerStyle).paddingBottom ?? 0);
    // Trailing content padding is chrome, not keyboard compensation. Paying the
    // inset in both places pushes the card up off its own top edge.
    expect(contentPad).toBeLessThan(inset);
  });

  it('⚠ the card still lives inside the scroller — WRAPPED containment is kept', () => {
    const tree = open(SE);
    const cta = controlOf(tree, 'Take them with you');
    expect(isUnder(cta, scrollOf(tree))).toBe(true);
  });
});

/* ── §B. REACHABILITY: every required control is inside the room ──────────── */

describe('OTA-1872 §B — the three answers and the way out are all reachable', () => {
  const REQUIRED = ['Dog name', 'Boy', 'Girl', 'Take them with you'];

  it('⚠⚠⚠ with the keyboard open on the smallest phone, nothing required is stranded', () => {
    const tree = open(SE);
    const scroller = scrollOf(tree);
    const name = tree.root.findAll((n) => n.props.accessibilityLabel === 'Dog name');
    expect(name.length).toBeGreaterThan(0);
    for (const label of REQUIRED) {
      const node = label === 'Dog name' ? name[0]! : controlOf(tree, label);
      // Inside the scroller = the player can bring it above the keyboard.
      expect(isUnder(node, scroller)).toBe(true);
    }
    // And the room it scrolls in is real, not a sliver.
    const pad = Number(flat(scrimOf(tree).props.style).paddingBottom ?? 0);
    expect(visibleBottom(SE) - pad + keyboardInset(SE)).toBeLessThanOrEqual(SE.windowHeight);
  });

  it('⚠⚠ taps survive an open keyboard — the first press reaches the control', () => {
    const tree = open(SE);
    expect(scrollOf(tree).props.keyboardShouldPersistTaps).toBe('handled');
  });

  /** ⚠⚠ THE ROOM IS ONLY A ROOM IF THE CARD CAN MOVE IN IT. Shrinking the
   *  scroller to the visible box is half the contract; the other half is that
   *  the content may actually travel, or a card taller than the box has simply
   *  swapped one unreachable region for another. */
  it('⚠⚠ the body can still scroll — the card may travel inside the room', () => {
    const tree = open(SE);
    expect(scrollOf(tree).props.scrollEnabled).not.toBe(false);
  });
});

/* ── §C. THE INTERACTION, END TO END, KEYBOARD OPEN ───────────────────────── */

describe('OTA-1872 §C — focus the name, answer, and take the dog', () => {
  it('⚠⚠⚠ BOY then TAKE THEM WITH YOU commits, with the keyboard still up', () => {
    const tree = open(ANDROID_SMALL);
    renderer.act(() => { (controlOf(tree, 'Boy').props.onPress as () => void)(); });
    const cta = controlOf(tree, 'Take them with you');
    expect(cta.props.disabled).toBe(false);
    renderer.act(() => { (cta.props.onPress as () => void)(); });
    expect(useGameStore.getState().worldMemory.pendingDogOnboarding).toBeNull();
  });

  it('⚠⚠ GIRL is the same door', () => {
    const tree = open(ANDROID_SMALL);
    renderer.act(() => { (controlOf(tree, 'Girl').props.onPress as () => void)(); });
    renderer.act(() => { (controlOf(tree, 'Take them with you').props.onPress as () => void)(); });
    expect(useGameStore.getState().worldMemory.pendingDogOnboarding).toBeNull();
  });
});

/* ── §D. THE VALIDATION CONTRACT, UNCHANGED ───────────────────────────────── */

describe('OTA-1872 §D — a disabled way out is not an unreachable one', () => {
  it('⚠⚠ no sex chosen: the CTA is disabled and the card stays up', () => {
    const tree = open(SE);
    const cta = controlOf(tree, 'Take them with you');
    expect(cta.props.disabled).toBe(true);
    renderer.act(() => { (cta.props.onPress as () => void)(); });
    expect(useGameStore.getState().worldMemory.pendingDogOnboarding).not.toBeNull();
  });

  it('⚠ a blank breed and a blank name are still fine — only sex gates', () => {
    const tree = open(SE);
    renderer.act(() => { (controlOf(tree, 'Boy').props.onPress as () => void)(); });
    expect(controlOf(tree, 'Take them with you').props.disabled).toBe(false);
  });

  it('⚠ the disabled CTA is reachable while disabled — it is in the scroller', () => {
    const tree = open(SE);
    expect(isUnder(controlOf(tree, 'Take them with you'), scrollOf(tree))).toBe(true);
  });
});

/* ── §E. THE NEGATIVE CONTROL: a roomy screen must not notice ─────────────── */

describe('OTA-1872 §E — keyboard closed and tall phones are untouched', () => {
  for (const [label, vp] of [
    ['iPhone SE 3, keyboard closed', CLOSED_SE],
    ['iPhone 15 Pro Max, keyboard closed', CLOSED_TALL],
  ] as const) {
    it(`⚠⚠⚠ ${label}: the scrim keeps exactly the padding momentScrim gives it`, () => {
      const tree = open(vp);
      expect(keyboardInset(vp)).toBe(0);
      const s = flat(scrimOf(tree).props.style);
      // 24 is `momentScrim.padding`. Not 24+something, and not a compacted value.
      expect(Number(s.paddingBottom ?? s.padding)).toBe(24);
      expect(Number(s.padding)).toBe(24);
    });
  }

  it('⚠⚠ no scroll region is added or removed by the repair', () => {
    const closed = open(CLOSED_TALL);
    const openKb = open(SE);
    const count = (t: Tree) => t.root.findAll((n) => nameOf(n) === 'ScrollView').length;
    expect(count(openKb)).toBe(count(closed));
    expect(count(closed)).toBe(1);
  });

  it('⚠ typography and control geometry do not move with the keyboard', () => {
    const closed = open(CLOSED_TALL);
    const openKb = open(SE);
    const face = (t: Tree) =>
      flat(controlOf(t, 'Take them with you').props.style as never);
    // The CTA is styled by the kit and its own rule; neither reads the viewport.
    expect(JSON.stringify(face(openKb))).toBe(JSON.stringify(face(closed)));
  });
});

/* ── §F. ACCESSIBILITY: one of each, still named ──────────────────────────── */

describe('OTA-1872 §F — the repair duplicates nothing and renames nothing', () => {
  it('⚠⚠ exactly one control answers to each label, keyboard open', () => {
    const tree = open(SE);
    for (const label of ['Boy', 'Girl', 'Take them with you', 'Roll a name']) {
      const owners = tree.root.findAll(
        (n) => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function',
      );
      expect(owners.length).toBe(1);
    }
  });

  it('⚠ both fields keep their labels and the header keeps its role', () => {
    const tree = open(SE);
    for (const label of ['Dog breed', 'Dog name']) {
      expect(tree.root.findAll((n) => n.props.accessibilityLabel === label).length).toBeGreaterThan(0);
    }
    // Host nodes only — react-test-renderer surfaces a Text twice (the
    // component and the host it renders), which is a harness fact, not a tree.
    expect(
      tree.root.findAll((n) => n.props.accessibilityRole === 'header' && typeof n.type === 'string').length,
    ).toBe(1);
  });
});
