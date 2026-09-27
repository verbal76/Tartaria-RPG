/* ⚠ THE NATIVE EDGE, MOCKED — same preamble as OTA-1872/OTA-1883, and for the
 * same reason: GolemNamingModal reads the store, the store reaches the whole
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

/* ⚠⚠ THE ONE SEAM THIS SUITE OWNS — exactly as OTA-1872 owns it for
 * DogOnboardingModal. `useCardViewport` subscribes to real `Keyboard` events a
 * Jest process never emits; the arithmetic (`keyboardInset`, `visibleBottom`,
 * the device table) stays the real shipped code. */
let MOCK_VP = { windowHeight: 667, keyboardTop: 667 };
jest.mock('../app/components/KeyboardSafeCard', () => ({
  ...(jest.requireActual('../app/components/KeyboardSafeCard') as object),
  useCardViewport: () => MOCK_VP,
}));

import React from 'react';
import { StyleSheet } from 'react-native';
import { DEVICE_PROFILES, keyboardInset } from '../app/engine/keyboardSafeCard';
import { GolemNamingModal, GOLEM_CARD_DWELL_MS } from '../app/components/GolemNamingModal';
import { getGolemDefinition, makeCompanion } from '../app/engine/golems';
import { useGameStore } from '../app/state/gameStore';

/**
 * QOL #221 — GOLEM NAMING MODAL LAYOUT/KEYBOARD USABILITY.
 *
 * Owner report: "THE CONSTRUCT WAKES / Name your golem" — KEEP ITS MAKING
 * visibly hangs outside/below the modal frame and overlaps the underlying
 * game. Traced (see the header comment this OTA-1883/OTA-1872 sibling change
 * left in GolemNamingModal.tsx): the keyboard inset was being spent on the
 * ScrollView's own CONTENT padding, which only buys scroll DISTANCE inside a
 * scroller still laid out against the whole window — the same class of bug
 * OTA-1872 repaired on DogOnboardingModal. Repaired by moving the inset to
 * the scrim's `paddingBottom` (the OTA-1872 idiom), so the scroller's
 * viewport shrinks to the room the keyboard actually leaves and KEEP ITS
 * MAKING stays reachable inside the card instead of drawn past the visible
 * area. This suite locks that contract the way OTA-1872 locked it for its
 * own card, rather than asserting against source text alone.
 */

/* ── the harness — same shape as OTA-1872 / OTA-1883 ──────────────────────── */

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

/* ── the fixture — the golem the naming beat actually stands on ───────────── */

const GOLEM = makeCompanion(getGolemDefinition('crystal_golem'));
const mounted: Tree[] = [];

const open = (vp: { windowHeight: number; keyboardTop: number }): Tree => {
  MOCK_VP = vp;
  renderer.act(() => {
    useGameStore.setState((s) => ({
      missionCompleteNotice: null,
      pendingGolemNaming: true,
      player: s.player ? { ...s.player, golem: { ...GOLEM } } : s.player,
    }));
  });
  let tree!: Tree;
  renderer.act(() => { tree = renderer.create(<GolemNamingModal />); });
  // OTA-1044's read-the-summon-line-first dwell — the card is null without it.
  renderer.act(() => { jest.advanceTimersByTime(GOLEM_CARD_DWELL_MS + 50); });
  mounted.push(tree);
  return tree;
};

beforeAll(async () => {
  await useGameStore.getState().startNewGame({
    name: 'Maker', raceId: 'mud_dweller', factionId: 'mud_monarchs',
  });
});

beforeEach(() => { jest.useFakeTimers(); });
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
    }));
  });
  jest.useRealTimers();
});

const SE = DEVICE_PROFILES['iPhone SE 3']!;
const ANDROID_SMALL = { windowHeight: 640, keyboardTop: 640 - 290 };

describe('QOL #221 — all three controls are contained inside one coherent modal', () => {
  it('⚠⚠⚠ with the keyboard CLOSED, ROLL / SEAL THE NAME / KEEP ITS MAKING all sit inside the scroller', () => {
    const tree = open({ windowHeight: SE.windowHeight, keyboardTop: SE.windowHeight });
    const scroller = scrollOf(tree);
    for (const label of ['Roll a name', 'Seal the name', 'Keep its making']) {
      expect(isUnder(controlOf(tree, label), scroller)).toBe(true);
    }
  });

  it('⚠⚠⚠ with the keyboard OPEN on the smallest phone, KEEP ITS MAKING is still reachable, not drawn past the visible area', () => {
    const tree = open(SE);
    const inset = keyboardInset(SE);
    expect(inset).toBeGreaterThan(0); // the fixture really does open a keyboard
    const scroller = scrollOf(tree);
    const keep = controlOf(tree, 'Keep its making');
    // Reachable = inside the scroller that now yields the keyboard's room —
    // exactly the OTA-1872 contract, applied to this card's own CTA.
    expect(isUnder(keep, scroller)).toBe(true);
  });
});

describe('QOL #221 — the keyboard inset moved from content padding to the scrim, per OTA-1872', () => {
  it('⚠⚠⚠ the scrim yields at least the full keyboard inset', () => {
    const tree = open(SE);
    const inset = keyboardInset(SE);
    const pad = Number(flat(scrimOf(tree).props.style).paddingBottom ?? 0);
    expect(pad).toBeGreaterThanOrEqual(inset);
  });

  it('⚠⚠ the inset is spent ONCE — content padding does not also carry it', () => {
    const tree = open(SE);
    const inset = keyboardInset(SE);
    const contentPad = Number(flat(scrollOf(tree).props.contentContainerStyle).paddingBottom ?? 0);
    expect(contentPad).toBeLessThan(inset);
  });

  it('⚠ with the keyboard CLOSED the tree is unaffected — the scrim falls back to its own 24pt padding', () => {
    const tree = open({ windowHeight: SE.windowHeight, keyboardTop: SE.windowHeight });
    expect(keyboardInset({ windowHeight: SE.windowHeight, keyboardTop: SE.windowHeight })).toBe(0);
    const pad = Number(flat(scrimOf(tree).props.style).paddingBottom ?? 0);
    expect(pad).toBe(24);
    const contentPad = Number(flat(scrollOf(tree).props.contentContainerStyle).paddingBottom ?? 0);
    expect(contentPad).toBe(32);
  });
});

describe('QOL #221 — the interaction itself is untouched', () => {
  it('⚠⚠ typing a name and pressing SEAL THE NAME still commits it, with the keyboard up', () => {
    const tree = open(ANDROID_SMALL);
    const input = tree.root.findAll((n) => n.props.accessibilityLabel === 'Golem name')[0]!;
    renderer.act(() => { (input.props.onChangeText as (t: string) => void)('Marrow'); });
    const seal = controlOf(tree, 'Seal the name');
    renderer.act(() => { (seal.props.onPress as () => void)(); });
    expect(useGameStore.getState().pendingGolemNaming).toBe(false);
  });

  it('⚠ KEEP ITS MAKING still dismisses with no name typed', () => {
    const tree = open(ANDROID_SMALL);
    renderer.act(() => { (controlOf(tree, 'Keep its making').props.onPress as () => void)(); });
    expect(useGameStore.getState().pendingGolemNaming).toBe(false);
  });

  it('⚠ SEAL THE NAME stays disabled with an empty name — validation untouched', () => {
    const tree = open(SE);
    expect(controlOf(tree, 'Seal the name').props.disabled).toBe(true);
  });
});
