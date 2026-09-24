// OTA-1875 — THE LIST GETS ITS SCROLL BACK.
//
// ⚠⚠⚠ WHY THIS SUITE EXISTS, FROM THE DEVICE AND NOT FROM A THEORY.
// 2026-09-24, Pixel 10 Pro XL / Android 37, OTA-1874, bundle muerx6olk9ie (10/10
// parts, complete). The owner opened the Fusing Crucible, reached the
// upgrade-target stage, and the surface went dead. His words, which are the whole
// reason this was findable: *"It's not the push alone, even the scroll froze.
// Nothing on the screen except the cancel reacted."*
//
// THREE SYMPTOMS AND ONE NON-SYMPTOM, ALL PREDICTED BY ONE STRUCTURE. The card
// was wrapped in a second `TouchableWithoutFeedback` whose only job was
// `onPress={() => {}}` — a swallow, so a tap on the card would not reach the
// outer scrim's dismiss. A Touchable attaches its responder handlers to its ONE
// CHILD, so that swallow put `onStartShouldSetResponder` on the card — an
// ANCESTOR of the ScrollView. The card took the responder at touch-start, and a
// descendant cannot take it back from an ancestor:
//
//     scroll dead        the pan never reached the ScrollView
//     blocked rows dead  they are <View>, not controls — nothing deeper claimed
//                        the touch, so it died on the swallow's empty handler
//     Cancel ALIVE       a Pressable DOES win first claim, and it sits outside
//                        the list
//
// The outer Touchable was the same hazard one level up — it wrapped the backdrop,
// which is also an ancestor of the card — so removing only the inner one would
// have moved the claim rather than removed it. The scrim is now a Pressable
// SIBLING rendered behind the card.
//
// ⚠⚠ WHAT THIS SUITE DOES NOT CLAIM. It does not claim the freeze is cured on
// hardware — no physical post-repair verification has happened, and this suite
// cannot produce one. It holds the STRUCTURE that the owner's four discriminators
// all point at, and it holds the LADDER that was missing when the incident
// happened. Those are two different claims and neither is "the freeze is fixed".
//
// ⚠ AND IT LEAVES THE BLOCKED ROWS ALONE, BY OWNER RULING: *"Do NOT make blocked
// rows interactive. Their existing explanatory copy is sufficient."* §C pins that
// they stay non-actionable, so a later well-meaning pass cannot quietly turn a
// refusal into a control.

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('onnxruntime-react-native', () => ({
  InferenceSession: { create: jest.fn(async () => ({ run: jest.fn(async () => ({})) })) },
  Tensor: class { constructor(_t: string, _d: unknown, _s: unknown[]) { void _t; void _d; void _s; } },
}));
jest.mock('llama.rn', () => ({ initLlama: jest.fn(async () => ({ completion: jest.fn(async () => ({ text: '' })), release: jest.fn() })), releaseAllLlama: jest.fn() }));
jest.mock('react-native-executorch', () => ({}));
jest.mock('expo-file-system', () => ({ documentDirectory: '/tmp/', cacheDirectory: '/tmp/', getInfoAsync: jest.fn(async () => ({ exists: false })), makeDirectoryAsync: jest.fn(async () => {}), readAsStringAsync: jest.fn(async () => ''), writeAsStringAsync: jest.fn(async () => {}), deleteAsync: jest.fn(async () => {}), downloadAsync: jest.fn(async () => ({ uri: '' })), EncodingType: { UTF8: 'utf8', Base64: 'base64' } }));
jest.mock('expo-speech', () => ({ speak: jest.fn(), stop: jest.fn(), isSpeakingAsync: jest.fn(async () => false) }));
// ⚠ Sound is a plain object, not a class with a self-referential static: the
// `static createAsync = jest.fn(...)` spelling infers TS7022 and would push the
// test-typecheck ratchet past its baseline.
jest.mock('expo-av', () => ({
  Audio: {
    setAudioModeAsync: jest.fn(),
    Sound: { createAsync: jest.fn(async () => ({ sound: { playAsync: jest.fn(async () => {}), unloadAsync: jest.fn(async () => {}) } })) },
  },
}));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '0', applicationId: 'test' }));
jest.mock('expo-asset', () => ({ Asset: { fromModule: () => ({ downloadAsync: jest.fn(async () => {}), localUri: '' }) } }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => {}) }));
jest.mock('expo-constants', () => ({ default: { expoConfig: {} } }));
jest.mock('expo-font', () => ({ loadAsync: jest.fn(async () => {}) }));
jest.mock('expo-speech-recognition', () => ({}));
jest.mock('expo-updates', () => ({}));

import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { ScrollView, TouchableWithoutFeedback, TouchableOpacity, TouchableHighlight } from 'react-native';
import { useGameStore } from '../app/state/gameStore';
import { FusionPickerModal } from '../app/components/FusionPickerModal';
import { peekTouchPath, _resetTouchPathForTest, type TouchPathEntry } from '../app/diagnostics/touchPath';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const renderer = require('react-test-renderer') as {
  create: (el: React.ReactElement) => TestTree;
  act: (fn: () => void) => void;
};
interface TI { type: unknown; props: Record<string, unknown>; parent: TI | null; findAll(f: (n: TI) => boolean): TI[] }
interface TestTree { root: TI; unmount(): void }

const COMPONENTS = path.join(__dirname, '..', 'app', 'components');
const PICKER = path.join(COMPONENTS, 'FusionPickerModal.tsx');
const src = (p: string) => fs.readFileSync(p, 'utf8');

/* ⚠⚠⚠ THE ONE KNOWN SECOND INSTANCE, NAMED RATHER THAN HIDDEN.
 *
 * `CrucibleGuardModal` carries the same swallow-over-scrollable shape. It is NOT
 * repaired here, by explicit owner ruling on this package's scope: *"I do not
 * want to alter another responder surface while repairing the one we are
 * investigating."* So it is allowlisted — which means the rule below still FAILS
 * for any NEW occurrence anywhere in app/components, and this file is the record
 * of the one that was deliberately left. An allowlist entry is a debt with a
 * name on it; deleting the rule would have been a debt with nothing. */
const KNOWN_UNREPAIRED = new Set(['CrucibleGuardModal.tsx']);

/** Source-level: does this file wrap scrollable content in a responder-claiming
 *  Touchable? Deliberately crude and deliberately broad — the precise version is
 *  §D, which walks the REAL rendered tree. This one catches a file before anyone
 *  has to render it. */
function hasSwallowOverScrollable(text: string): boolean {
  const scrollable = /<(ScrollView|FlatList|SectionList)\b/.test(text);
  const swallow = /<TouchableWithoutFeedback[^>]*onPress=\{\(\)\s*=>\s*\{\s*\/?\*?[^}]*\}\}/s.test(text);
  return scrollable && swallow;
}

describe('OTA-1875 §A — no scrollable content under a responder-swallow Touchable', () => {
  it('⚠⚠⚠ FusionPickerModal no longer wraps its list in a swallow Touchable', () => {
    expect(hasSwallowOverScrollable(src(PICKER))).toBe(false);
  });

  it('⚠⚠ and the swallow idiom is gone from the file entirely', () => {
    expect(src(PICKER)).not.toMatch(/<TouchableWithoutFeedback/);
  });

  it('⚠⚠⚠ NO OTHER COMPONENT ACQUIRES THE SHAPE — one named exception, on the record', () => {
    const offenders = fs.readdirSync(COMPONENTS)
      .filter((f) => f.endsWith('.tsx'))
      .filter((f) => !KNOWN_UNREPAIRED.has(f))
      .filter((f) => hasSwallowOverScrollable(src(path.join(COMPONENTS, f))));
    expect(offenders).toEqual([]);
  });

  it('⚠ the allowlist is not vacuous — the named exception really does still carry it', () => {
    // If someone repairs CrucibleGuardModal, this fails and the allowlist entry
    // must be DELETED. An allowlist that outlives its reason is a lie.
    for (const f of KNOWN_UNREPAIRED) {
      expect(hasSwallowOverScrollable(src(path.join(COMPONENTS, f)))).toBe(true);
    }
  });
});

describe('OTA-1875 §B — the picker speaks the ladder the incident was missing', () => {
  const text = src(PICKER);
  it('imports the established vocabulary, not a second framework', () => {
    expect(text).toMatch(/from '\.\.\/diagnostics\/touchPath'/);
    for (const call of ['noteRootTouch', 'notePressIn', 'noteHandlerEnter', 'noteStage']) {
      expect(text).toContain(call);
    }
  });

  it('⚠⚠ observes the modal touch in CAPTURE phase and RETURNS FALSE — never claims it', () => {
    expect(text).toMatch(/onStartShouldSetResponderCapture=\{\(\)\s*=>\s*\{\s*noteRootTouch\('modal'\);\s*return false;\s*\}\}/);
  });

  it('⚠ does NOT instrument scroll or move events — the ring must survive the recurrence', () => {
    for (const perFrame of ['onScroll', 'onMomentumScroll', 'onResponderMove', 'onTouchMove']) {
      expect(text).not.toContain(perFrame);
    }
  });
});

describe('OTA-1875 §C — blocked rows stay refusals, not controls (owner ruling)', () => {
  const text = src(PICKER);
  it('the blocked row is a <View> with copy, and never a Pressable', () => {
    const blocked = text.match(/<View key=\{c\.item\.id\}[^>]*rowBlocked[^>]*>/s);
    expect(blocked).not.toBeNull();
    expect(blocked![0]).not.toMatch(/onPress/);
  });

  it('its explanatory copy still comes from the engine verdict, unchanged', () => {
    expect(text).toMatch(/c\.blocked/);
  });
});

/* ⚠⚠⚠ §D — THE RENDERED TREE, NOT THE SOURCE TEXT. §A can be satisfied by moving
 * the Touchable to another file; this cannot. It mounts the real component and
 * walks from the real ScrollView upward, asking whether ANY ancestor is a
 * Touchable or sets a start-responder handler. That is the exact property whose
 * absence froze the list. */
const live: TestTree[] = [];
function mountPicker(): TestTree {
  /* ⚠ FIVE RESERVED ODDMENTS, because the list only renders when there is one.
   * An empty pack renders the "No reserved (♥) materials" line instead and the
   * ScrollView assertion below would have passed VACUOUSLY on zero scrollers —
   * which is how this fixture failed the first time it ran, correctly. Catalog-
   * absent names make them inferred; no uniqueStats and no protected tag keeps
   * `isForgeReservableItem` happy. */
  const reserved = ['Bent Aether Cog', 'Cracked Mud Plate', 'Scorched Coil', 'Salt-Pitted Rivet', 'Dull Glass Shard']
    .map((name, i) => ({
      id: `inst-fuse-${i}`,
      name,
      quantity: 1,
      reservedForFusion: true,
      tags: [] as string[],
    }));
  useGameStore.setState({
    fusionPickerOpen: true,
    closeFusionPicker: jest.fn() as never,
    player: {
      ...(useGameStore.getState().player ?? {}),
      tc: 159,
      inventory: reserved,
      equipped: {},
    },
  } as never);
  let tree!: TestTree;
  renderer.act(() => { tree = renderer.create(<FusionPickerModal />); });
  live.push(tree);
  return tree;
}

const TOUCHABLES: readonly unknown[] = [TouchableWithoutFeedback, TouchableOpacity, TouchableHighlight];

function ancestorsOf(n: TI): TI[] {
  const out: TI[] = [];
  let cur = n.parent;
  while (cur) { out.push(cur); cur = cur.parent; }
  return out;
}

describe('OTA-1875 §D — the real tree: nothing above the list can take the responder', () => {
  beforeEach(() => { _resetTouchPathForTest(); });
  afterEach(() => { while (live.length) { const t = live.pop()!; renderer.act(() => { t.unmount(); }); } });

  it('⚠⚠⚠ every ScrollView in the picker has NO Touchable ancestor and NO start-responder ancestor', () => {
    const tree = mountPicker();
    const scrollers = tree.root.findAll((n) => n.type === ScrollView);
    // The picker always renders at least one list; if it ever renders none this
    // assertion must not silently pass on an empty set.
    expect(scrollers.length).toBeGreaterThan(0);
    const offenders: string[] = [];
    for (const sv of scrollers) {
      for (const a of ancestorsOf(sv)) {
        if (TOUCHABLES.includes(a.type)) offenders.push('touchable-ancestor');
        if (typeof a.props.onStartShouldSetResponder === 'function') offenders.push('start-responder-ancestor');
      }
    }
    expect(offenders).toEqual([]);
  });

  it('⚠⚠ the scrim still dismisses — it is a SIBLING that claims only its own touches', () => {
    const tree = mountPicker();
    /* ⚠ `findAll` returns the host nodes a Pressable expands into as well as the
     * element itself, so this is >1 by construction. The claim is not "exactly one
     * node carries the label" — it is that the scrim EXISTS and is an ancestor of
     * NOTHING scrollable. */
    const scrim = tree.root.findAll((n) => n.props.accessibilityLabel === 'Close');
    expect(scrim.length).toBeGreaterThan(0);
    const scrollers = tree.root.findAll((n) => n.type === ScrollView);
    expect(scrollers.length).toBeGreaterThan(0);
    for (const sv of scrollers) {
      const anc = ancestorsOf(sv);
      for (const s of scrim) expect(anc).not.toContain(s);
    }
  });

  it('⚠ mounting writes the presentation rung the incident could not produce', () => {
    mountPicker();
    const pres = peekTouchPath().filter((e: TouchPathEntry) => e.st === 'pres');
    expect(pres.length).toBeGreaterThan(0);
  });

  it('⚠ and unmounting records the other edge', () => {
    const tree = mountPicker();
    const before = peekTouchPath().length;
    renderer.act(() => { tree.unmount(); });
    live.pop();
    expect(peekTouchPath().length).toBeGreaterThan(before);
  });

  it('⚠⚠ the instrument did not change what the surface DOES — no store mutation on mount', () => {
    const tcBefore = useGameStore.getState().player?.tc;
    mountPicker();
    expect(useGameStore.getState().player?.tc).toBe(tcBefore ?? 159);
  });
});
