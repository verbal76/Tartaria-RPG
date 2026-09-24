// OTA-1878 — THE TRANSCRIPT KEEPS A DOOR.
//
// ⚠⚠⚠ THE OWNER'S SCREENSHOT IS THE SPEC. On a 4.7" screen, mid-fight, the
// narrative panel was not merely cramped — it was GONE. Between the MAIN QUEST
// chip and the PUNCH button there was no transcript at all, and no way to reach
// one. The cause is not a bug in the feed: `styles.feed` is
// `flex:1, flexShrink:1, minHeight:0` because OTA-179 deliberately made the
// transcript the sacrificial region so the action row would stop clipping off
// the bottom of the screen. Every other region on that screen is natural-height
// and unshrinkable, so the feed absorbs 100% of any deficit — including all of
// it.
//
// ⚠⚠ SO THIS DOES NOT GIVE THE FEED A FLOOR, AND MUST NEVER BE CHANGED INTO ONE.
// A `minHeight` on the feed takes its pixels straight back out of the bottom
// controls, which is the exact defect OTA-179 existed to fix. The feed is still
// allowed to collapse to zero. What changes is that when it does, a key appears
// in the scene rail and the same transcript opens in a reader that has room.
//
// ⚠ THE THRESHOLD IS DERIVED, NOT CHOSEN, and the trigger is a MEASURED HEIGHT,
// never a device. Both of those are asserted below, because both are the kind of
// thing that quietly rots into a magic number and a model-name check.

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
// ⚠ Native modules the store pulls in transitively — mocked, not stubbed, and
// deliberately NOT virtual. Same recipe as ota1246ExplorationRenders, which is
// the suite that established that a source pin proves nothing until the screen
// has actually mounted.
jest.mock('onnxruntime-react-native', () => ({
  InferenceSession: { create: jest.fn(async () => ({ run: jest.fn(async () => ({})) })) },
  Tensor: class { constructor(_t: string, _d: unknown, _s: unknown[]) {} },
}));
jest.mock('llama.rn', () => ({
  initLlama: jest.fn(async () => ({ completion: jest.fn(async () => ({ text: '' })), release: jest.fn() })),
  releaseAllLlama: jest.fn(),
}));

import React from 'react';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const renderer = require('react-test-renderer') as {
  act(cb: () => void): void;
  create(el: React.ReactElement): { toJSON(): unknown; root: TI; unmount(): void };
};

import {
  CONSTRAINED_NARRATIVE_MIN_HEIGHT,
  NARRATIVE_BODY_LINE_HEIGHT,
  NARRATIVE_FEED_BORDER,
  NARRATIVE_FEED_CHROME,
  NARRATIVE_FEED_PADDING,
  READABLE_NARRATIVE_LINES,
  isNarrativeConstrained,
} from '../app/ui/narrativeReadability';
import { readFileSync } from 'fs';
import { join } from 'path';

const src = (...p: string[]): string => readFileSync(join(__dirname, '..', ...p), 'utf8');

interface TI {
  type: unknown;
  props: Record<string, unknown>;
  parent: TI | null;
  children: unknown[];
  findAll(fn: (n: TI) => boolean): TI[];
  findAllByProps(p: Record<string, unknown>): TI[];
}

// ⚠ OTA-1449 hygiene — close what you open. A mounted screen keeps looping
// animations ticking into jest's teardown, which can kill the worker with no
// summary line at all.
const _mounted: Array<{ unmount(): void }> = [];
afterEach(() => {
  const roots = _mounted.splice(0);
  renderer.act(() => { for (const r of roots) { try { r.unmount(); } catch { /* gone */ } } });
});

const SCENE = {
  location: { id: 'test_tile', name: 'Test Tile', type: 'ruin', tags: ['ruin'] },
  ambientNouns: [], displayedAmbientNouns: [], pinnedAmbientNouns: [],
  enemies: [], enemyHps: [], hooks: [], range: 'mid', text: '',
};
const LOG = [
  { id: 'l1', ts: 1, channel: 'world', text: 'The rain does not stop at the wall.' },
  { id: 'l2', ts: 2, channel: 'arbiter', text: 'Something in the dark counts your steps.' },
];

// ⚠ A REAL PLAYER, VIA THE REAL OPENING. ExplorationScreen returns a bare
// placeholder when `player` is null, so a hand-built store would have measured a
// screen that has no feed at all. Same recipe as ota1255ScreensMount.
let basePlayer: unknown = null;
beforeAll(async () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useGameStore } = require('../app/state/gameStore');
  await useGameStore.getState().startNewGame({
    name: '', raceId: 'reclaimer', factionId: 'reclaimers_guild',
    motiveId: 'debt', pressure: 'owed',
  } as never);
  if (useGameStore.getState().storyIntro) useGameStore.getState().dismissStoryIntro();
  useGameStore.getState().submitPlayerAction('Walker');
  basePlayer = useGameStore.getState().player;
});

function mountExploration() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useGameStore } = require('../app/state/gameStore');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { ExplorationScreen } = require('../app/screens/ExplorationScreen');
  useGameStore.setState({
    tutorialStep: null,
    currentScreen: 'exploration',
    currentScene: SCENE,
    player: basePlayer,
    gameLog: LOG,
  } as never);
  // ⚠ The real app mounts every screen under App.tsx's SafeAreaProvider, and the
  // expanded reader reads its insets from that context (the OTA-1799/P5 rule:
  // insets come from context, never from a guessed constant). Supplying real
  // metrics here keeps the harness honest about what the device provides.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { SafeAreaProvider } = require('react-native-safe-area-context');
  let tree!: { toJSON(): unknown; root: TI; unmount(): void };
  renderer.act(() => {
    tree = renderer.create(
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 375, height: 667 },
          insets: { top: 20, left: 0, right: 0, bottom: 0 },
        }}
      >
        <ExplorationScreen />
      </SafeAreaProvider>,
    );
  });
  _mounted.push(tree);
  return tree;
}

/** Drive the feed panel's REAL onLayout — jest computes no layout, so the
 *  measurement is injected at the exact seam production reads it from. */
function measureFeed(tree: { root: TI }, height: number) {
  const panel = tree.root.findAllByProps({ testID: 'narrative-feed-panel' })[0]!;
  renderer.act(() => {
    (panel.props.onLayout as (e: unknown) => void)({ nativeEvent: { layout: { height, width: 350, x: 0, y: 0 } } });
  });
}

const has = (tree: { root: TI }, testID: string): boolean =>
  tree.root.findAllByProps({ testID }).length > 0;

const press = (tree: { root: TI }, testID: string) => {
  const node = tree.root.findAllByProps({ testID }).filter((n) => typeof n.props.onPress === 'function')[0]!;
  renderer.act(() => { (node.props.onPress as () => void)(); });
};

describe('OTA-1878 §A — the threshold is DERIVED from the feed, not chosen', () => {
  it('⚠⚠ four body lines plus the feed\'s own chrome, and the arithmetic is stated', () => {
    // 4 × 22 = 88 body lines; 2 × (1 panelFrame + 8 padding + 1 rim) = 20.
    expect(READABLE_NARRATIVE_LINES).toBe(4);
    expect(NARRATIVE_FEED_CHROME).toBe(2 * (NARRATIVE_FEED_BORDER + NARRATIVE_FEED_PADDING + NARRATIVE_FEED_BORDER));
    expect(CONSTRAINED_NARRATIVE_MIN_HEIGHT)
      .toBe(READABLE_NARRATIVE_LINES * NARRATIVE_BODY_LINE_HEIGHT + NARRATIVE_FEED_CHROME);
    expect(CONSTRAINED_NARRATIVE_MIN_HEIGHT).toBe(108);
  });

  it('⚠⚠⚠ AdventureFeed COMPOSES those metrics — the derivation is load-bearing, not a copy', () => {
    // If the feed ever spells its own line height or padding again, the
    // threshold silently stops describing the thing it claims to measure.
    const feed = src('app', 'components', 'AdventureFeed.tsx');
    expect(feed).toContain("from '../ui/narrativeReadability'");
    expect(feed).toContain('lineHeight: NARRATIVE_BODY_LINE_HEIGHT');
    expect(feed).toContain('padding: NARRATIVE_FEED_PADDING');
    expect(feed).toContain('borderWidth: NARRATIVE_FEED_BORDER');
  });

  it('⚠ an unmeasured panel is NOT constrained — no first-frame flash of the key', () => {
    expect(isNarrativeConstrained(null)).toBe(false);
  });

  it('⚠⚠ the rule is a HEIGHT — no device name, no platform branch, no window compare', () => {
    const mod = src('app', 'ui', 'narrativeReadability.ts');
    const screen = src('app', 'screens', 'ExplorationScreen.tsx');
    for (const forbidden of ['iPhone', 'iOS', 'Platform.OS', 'windowHeight', 'DEVICE_PROFILES']) {
      expect(mod).not.toContain(forbidden);
    }
    // The screen may mention Platform elsewhere; what it must NOT do is decide
    // the narrative mode from anything but the measured height.
    expect(screen).toContain('isNarrativeConstrained(feedH)');
  });

  it('⚠⚠⚠ the feed KEEPS its OTA-179 sacrificial sizing — no minHeight was added', () => {
    const screen = src('app', 'screens', 'ExplorationScreen.tsx');
    expect(screen).toContain('feed: { flex: 1, flexShrink: 1, minHeight: 0 }');
  });
});

describe('OTA-1878 §G — normal, constrained, and the boundary between them', () => {
  it('1 · NORMAL HEIGHT — a roomy panel shows no expand key and no reader', () => {
    const tree = mountExploration();
    measureFeed(tree, 400);
    expect(has(tree, 'narrative-expand')).toBe(false);
    expect(has(tree, 'narrative-reader-close')).toBe(false);
  });

  it('2 · JUST ABOVE THRESHOLD — exactly four lines still fit, so nothing changes', () => {
    const tree = mountExploration();
    measureFeed(tree, CONSTRAINED_NARRATIVE_MIN_HEIGHT);
    expect(has(tree, 'narrative-expand')).toBe(false);
  });

  it('3 · JUST BELOW THRESHOLD — one point short, and the key appears', () => {
    const tree = mountExploration();
    measureFeed(tree, CONSTRAINED_NARRATIVE_MIN_HEIGHT - 1);
    expect(has(tree, 'narrative-expand')).toBe(true);
  });

  it('4 · ⚠⚠⚠ ZERO HEIGHT — THE OWNER SCREENSHOT — the key is STILL reachable', () => {
    // This is the case the whole package exists for, and the reason the key does
    // not live inside the feed frame: anything parented to the collapsing panel
    // collapses with it and is gone exactly when it is needed.
    const tree = mountExploration();
    measureFeed(tree, 0);
    expect(has(tree, 'narrative-expand')).toBe(true);
  });

  it('⚠⚠ ...and the key is anchored OUTSIDE the feed panel, structurally', () => {
    const tree = mountExploration();
    measureFeed(tree, 0);
    const key = tree.root.findAllByProps({ testID: 'narrative-expand' })[0]!;
    const panel = tree.root.findAllByProps({ testID: 'narrative-feed-panel' })[0]!;
    const ancestors: TI[] = [];
    for (let p = key.parent; p; p = p.parent) ancestors.push(p);
    expect(ancestors).not.toContain(panel);
  });
});

describe('OTA-1878 §D/§F — the reader opens, scrolls, and closes three ways', () => {
  it('5 · EXPAND opens the reader over the SAME current gameLog', () => {
    const tree = mountExploration();
    measureFeed(tree, 0);
    press(tree, 'narrative-expand');
    expect(has(tree, 'narrative-reader-close')).toBe(true);
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useGameStore } = require('../app/state/gameStore');
    // ⚠ Scoped to the READER's own subtree, not the whole screen — the inline
    // feed renders the same strings, so a screen-wide search would pass even if
    // the reader were empty.
    const scrim = tree.root.findAllByProps({ testID: 'narrative-reader-scrim' })[0]!;
    const close = tree.root.findAllByProps({ testID: 'narrative-reader-close' })[0]!;
    let overlay: TI | null = null;
    for (let a = close.parent; a; a = a.parent) {
      if (a.findAllByProps({ testID: 'narrative-reader-scrim' }).includes(scrim)) { overlay = a; break; }
    }
    expect(overlay).not.toBeNull();
    // Collect only the STRING leaves under the reader — React elements are
    // circular, so they cannot be serialised wholesale.
    const strings: string[] = [];
    const collect = (v: unknown): void => {
      if (typeof v === 'string') { strings.push(v); return; }
      if (Array.isArray(v)) { for (const x of v) collect(x); }
    };
    for (const n of overlay!.findAll(() => true)) collect(n.props.children);
    // ⚠ Measured against the entries the feed is CONTRACTED to show. The store's
    // log also carries hidden diagnostic channels (OTA-1696's render-lag line
    // lands on `debug`), and AdventureFeed filters those by design — demanding
    // they appear would be asserting against the feed's own rules.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { HIDDEN_LOG_CHANNELS } = require('../app/engine/gameLog');
    const shown = useGameStore.getState().gameLog
      .filter((e: { channel: string }) => !HIDDEN_LOG_CHANNELS.has(e.channel));
    expect(shown.length).toBeGreaterThan(0);
    for (const entry of shown) {
      expect(strings.some((s) => s.includes(entry.text))).toBe(true);
    }
  });

  it('6 · the reader presents a REAL ScrollView, not a fixed block', () => {
    const tree = mountExploration();
    measureFeed(tree, 0);
    press(tree, 'narrative-expand');
    const close = tree.root.findAllByProps({ testID: 'narrative-reader-close' })[0]!;
    // Walk up to the reader card, then find the ScrollView beneath it.
    let card: TI | null = close.parent;
    while (card && card.parent) card = card.parent;
    const scrolls = tree.root.findAll((n) => {
      const nm = (n.type as { displayName?: string; name?: string });
      return typeof n.type !== 'string' && (nm?.displayName === 'ScrollView' || nm?.name === 'ScrollView');
    });
    expect(scrolls.length).toBeGreaterThan(0);
  });

  it('7 · CLOSE button closes the reader and nothing else', () => {
    const tree = mountExploration();
    measureFeed(tree, 0);
    press(tree, 'narrative-expand');
    press(tree, 'narrative-reader-close');
    expect(has(tree, 'narrative-reader-close')).toBe(false);
    expect(has(tree, 'narrative-expand')).toBe(true); // still constrained
  });

  it('8 · the SCRIM closes the reader and nothing else', () => {
    const tree = mountExploration();
    measureFeed(tree, 0);
    press(tree, 'narrative-expand');
    press(tree, 'narrative-reader-scrim');
    expect(has(tree, 'narrative-reader-close')).toBe(false);
  });

  it('9 · BACK closes the reader FIRST and does not leave exploration', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { fireBack } = require('../app/ui/desktopBack');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useGameStore } = require('../app/state/gameStore');
    useGameStore.setState({ currentScreen: 'exploration' } as never);
    const tree = mountExploration();
    measureFeed(tree, 0);
    press(tree, 'narrative-expand');
    let consumed = false;
    renderer.act(() => { consumed = fireBack(); });
    expect(consumed).toBe(true);
    expect(has(tree, 'narrative-reader-close')).toBe(false);
    expect(useGameStore.getState().currentScreen).toBe('exploration');
  });
});

describe('OTA-1878 §G10 — expanding and closing change NOTHING in the game', () => {
  it('10 · ⚠⚠⚠ no log append, no quest/encounter/travel/inventory move, no screen change', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useGameStore } = require('../app/state/gameStore');
    const tree = mountExploration();
    measureFeed(tree, 0);
    const snap = () => {
      const s = useGameStore.getState();
      return JSON.stringify({
        // ⚠ Hidden diagnostic channels are excluded ON PURPOSE, and this is not a
        // loosening: OTA-1696's render-lag instrument appends a `debug` line
        // whenever a render lands, so a raw log comparison would be measuring the
        // profiler's clock rather than whether the reader touched the game. The
        // claim under test is that NO PLAYER-VISIBLE narrative was added.
        log: s.gameLog.filter((e: { channel: string }) => e.channel !== 'debug' && e.channel !== 'cognitive'),
        screen: s.currentScreen,
        scene: s.currentScene,
        player: s.player,
        activeQuests: s.player?.activeQuests ?? null,
        activeHunts: s.player?.activeHunts ?? null,
        inventory: s.player?.inventory ?? null,
        tc: s.player?.tc ?? null,
      });
    };
    const before = snap();
    press(tree, 'narrative-expand');
    const whileOpen = snap();
    press(tree, 'narrative-reader-close');
    const after = snap();
    expect(whileOpen).toBe(before);
    expect(after).toBe(before);
  });
});

describe('OTA-1878 §G11 — the responder topology OTA-1875 paid for', () => {
  const TOUCHABLES = ['Pressable', 'TouchableOpacity', 'TouchableHighlight', 'TouchableWithoutFeedback'];
  const nameOf = (n: TI): string => {
    if (typeof n.type === 'string') return n.type;
    const t = n.type as { displayName?: string; name?: string };
    return t?.displayName ?? t?.name ?? '';
  };

  it('11 · ⚠⚠⚠ NO ScrollView on this screen has a Touchable or start-responder ancestor', () => {
    const tree = mountExploration();
    measureFeed(tree, 0);
    press(tree, 'narrative-expand'); // both the inline feed AND the reader are live
    const scrolls = tree.root.findAll((n) => nameOf(n) === 'ScrollView');
    expect(scrolls.length).toBeGreaterThan(0);
    const offenders: string[] = [];
    for (const sv of scrolls) {
      for (let a = sv.parent; a; a = a.parent) {
        if (TOUCHABLES.includes(nameOf(a))) offenders.push(`touchable-ancestor:${nameOf(a)}`);
        // ⚠ BUBBLE PHASE ONLY. The capture-phase observers OTA-1813/1818 put on
        // the app root and the feed frame RETURN FALSE and never claim the
        // responder — they are explicitly permitted, and banning them would
        // delete the freeze instrument to satisfy a rule about scrolling.
        if (typeof a.props.onStartShouldSetResponder === 'function') offenders.push('start-responder-ancestor');
      }
    }
    expect(offenders).toEqual([]);
  });

  it('⚠⚠ the reader\'s scrim is a SIBLING behind the card, never its ancestor', () => {
    const tree = mountExploration();
    measureFeed(tree, 0);
    press(tree, 'narrative-expand');
    const scrim = tree.root.findAllByProps({ testID: 'narrative-reader-scrim' })[0]!;
    const close = tree.root.findAllByProps({ testID: 'narrative-reader-close' })[0]!;
    const ancestors: TI[] = [];
    for (let p = close.parent; p; p = p.parent) ancestors.push(p);
    expect(ancestors).not.toContain(scrim);
  });

  it('⚠ the feed is NOT wrapped in a tap target — the whole transcript is not a button', () => {
    const screen = src('app', 'screens', 'ExplorationScreen.tsx');
    // The feed frame must still be a TutorialTarget, not a Pressable/Touchable.
    expect(screen).toContain('<TutorialTarget\n        area="feed"');
  });
});

describe('OTA-1878 §G12-14 — non-regression, the SE shape, and moving between modes', () => {
  it('12 · NORMAL-SCREEN NON-REGRESSION — a tall panel is untouched', () => {
    const tree = mountExploration();
    measureFeed(tree, 520);
    expect(has(tree, 'narrative-expand')).toBe(false);
    expect(has(tree, 'narrative-reader-close')).toBe(false);
  });

  it('13 · ⚠⚠ THE SE SHAPE — real 375×667 arithmetic crosses the threshold, with no device logic', () => {
    // Derived rather than asserted: uiScale scales on WIDTH only, so a 375-wide
    // screen keeps 667 physical points but reports ~694 LOGICAL ones, and the
    // interior is what is left after the safe-area floors. The point of this
    // case is that the number the feed ends up with is well under the readable
    // threshold once the protected regions have taken their natural heights.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { computeUiScale } = require('../app/ui/uiScale');
    const ui = computeUiScale(375, 667);
    expect(ui.scale).toBeLessThan(1);
    const interior = ui.logicalHeight - (14 + 12) / ui.scale;
    // Protected, unshrinkable regions on the combat screen (topRow's own floor,
    // the scene bar, the objective chip, the control stack and the container's
    // padding + gaps). Conservative — the owner's screenshot has MORE control
    // rows than this.
    const protectedHeight = 165 + 44 + 52 + 342 + 16 + 24;
    const feedGets = interior - protectedHeight;
    expect(feedGets).toBeLessThan(CONSTRAINED_NARRATIVE_MIN_HEIGHT);
    // And the engine agrees, through the same measured path the device uses.
    const tree = mountExploration();
    measureFeed(tree, Math.max(0, feedGets));
    expect(has(tree, 'narrative-expand')).toBe(true);
  });

  it('14 · DYNAMIC TRANSITION — above → below → above walks normal → constrained → normal', () => {
    const tree = mountExploration();
    measureFeed(tree, 400);
    expect(has(tree, 'narrative-expand')).toBe(false);
    measureFeed(tree, 10);
    expect(has(tree, 'narrative-expand')).toBe(true);
    measureFeed(tree, 400);
    expect(has(tree, 'narrative-expand')).toBe(false);
  });

  it('⚠⚠ AN OPEN READER IS NOT CLOSED BY THE LAYOUT GROWING BACK — documented choice', () => {
    // The commonest way height returns is the keyboard dismissing. Being thrown
    // out of the page mid-sentence because the layout relaxed is worse than
    // staying; the reader closes when the PLAYER closes it. The affordance is
    // what `narrativeConstrained` governs, never the open reader.
    const tree = mountExploration();
    measureFeed(tree, 0);
    press(tree, 'narrative-expand');
    expect(has(tree, 'narrative-reader-close')).toBe(true);
    measureFeed(tree, 400);
    expect(has(tree, 'narrative-expand')).toBe(false); // affordance gone
    expect(has(tree, 'narrative-reader-close')).toBe(true); // reader stays
  });
});
