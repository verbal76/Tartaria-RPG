// OTA-1880 — THE CONSTRAINT TEACHES ITS OWN DOOR (#211).
//
// ⚠⚠⚠ OTA-1878 GAVE THE TRANSCRIPT A DOOR AND NEVER MENTIONED IT. When the
// narrative panel is measured too small to read from, EXPAND appears in the
// scene rail — which is also the exact moment a player is staring at a squeezed
// transcript rather than auditing the header for a key that was not there a
// second ago. The owner's principle: THE CONSTRAINT SHOULD SURFACE ITS OWN
// ESCAPE HATCH.
//
// ⚠⚠ AND THE SMALLEST HONEST IMPLEMENTATION WAS ALREADY IN THE REPO. OTA-1738
// built the teaching system this needs: one card per beat through
// `useTeachingSlot`, copy in `teachingRegistry`, per-install dismissal in
// `useFirstTimeHint`, a global tips kill-switch, and a replay listing in
// Settings → GUIDANCE. So this package adds ONE registry entry and ONE candidate
// line — no new component, no new persistence, no new timer, and no new row.
// That last part is the whole point: a feature that exists because vertical
// space is scarce must not spend vertical space explaining itself, and
// FirstTimeHint is an absolute overlay that consumes none.
//
// ⚠ THE TRIGGER IS THE MEASUREMENT, NOT THE PHONE. `narrativeConstrained` is the
// same derived boolean the key renders on, so a large phone whose feed really is
// squeezed is taught and a small one whose feed is fine is not. §B holds that
// line by name, because "just check for the small phone" is the shortcut this
// whole family of repairs exists to refuse.

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('onnxruntime-react-native', () => ({
  InferenceSession: { create: jest.fn(async () => ({ run: jest.fn(async () => ({})) })) },
  Tensor: class { constructor(_t: string, _d: unknown, _s: unknown[]) {} },
}));
jest.mock('llama.rn', () => ({
  initLlama: jest.fn(async () => ({ completion: jest.fn(async () => ({ text: '' })), release: jest.fn() })),
  releaseAllLlama: jest.fn(),
}));

import React from 'react';
import { StyleSheet } from 'react-native';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const renderer = require('react-test-renderer') as {
  act(cb: () => unknown): unknown;
  create(el: React.ReactElement): { toJSON(): unknown; root: TI; unmount(): void };
};

import { TEACHINGS, ALL_TEACHINGS } from '../app/components/teachingRegistry';
import { resetAllFirstTimeHints, readSeenHintIds } from '../app/components/useFirstTimeHint';
import {
  CONSTRAINED_NARRATIVE_MIN_HEIGHT,
  NARRATIVE_BODY_LINE_HEIGHT,
  READABLE_NARRATIVE_LINES,
} from '../app/ui/narrativeReadability';
import { readFileSync } from 'fs';
import { join } from 'path';

const src = (...p: string[]): string => readFileSync(join(__dirname, '..', ...p), 'utf8');
const EXPL = src('app', 'screens', 'ExplorationScreen.tsx');
const REGISTRY = src('app', 'components', 'teachingRegistry.ts');

interface TI {
  type: unknown;
  props: Record<string, unknown>;
  parent: TI | null;
  children: unknown[];
  findAll(fn: (n: TI) => boolean): TI[];
  findAllByProps(p: Record<string, unknown>): TI[];
}

const CARD = TEACHINGS.narrative_expand_v1;

// ⚠ This suite mounts the real ExplorationScreen, whose import graph is the whole
// engine; the FIRST mount pays for loading it and then waits on an AsyncStorage
// read. That is harness cost, not a slow assertion — jest's 5 s default is not
// enough for it and a timeout there would be a false red.
jest.setTimeout(30_000);

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

// ⚠ A REAL PLAYER, VIA THE REAL OPENING — ExplorationScreen returns a bare
// placeholder when `player` is null, so a hand-built store would measure a
// screen with no feed and no teaching slot at all (ota1255's recipe).
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
  // Warm the screen's module graph here rather than inside the first test.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('../app/screens/ExplorationScreen');
});

// ⚠⚠ EVERY TEST STARTS WITH AN UNTAUGHT INSTALL. Dismissal is per-install and
// AsyncStorage is module state, so without this a card dismissed in §F would
// stay dismissed for every test declared after it — the suite would pass while
// proving nothing.
beforeEach(async () => { await resetAllFirstTimeHints(); });

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
    ) as unknown as { toJSON(): unknown; root: TI; unmount(): void };
  });
  _mounted.push(tree);
  return tree;
}

/** The card's visibility waits on an AsyncStorage read; flush it. */
async function settle(): Promise<void> {
  await (renderer.act(async () => { await Promise.resolve(); await Promise.resolve(); }) as Promise<void>);
}

/** Drive the feed panel's REAL onLayout — jest computes no layout, so the
 *  measurement is injected at the exact seam production reads it from. */
function measureFeed(tree: { root: TI }, height: number) {
  const panel = tree.root.findAllByProps({ testID: 'narrative-feed-panel' })[0]!;
  renderer.act(() => {
    (panel.props.onLayout as (e: unknown) => void)({ nativeEvent: { layout: { height, width: 350, x: 0, y: 0 } } });
  });
}

const rendered = (tree: { toJSON(): unknown }): string => JSON.stringify(tree.toJSON());
const cardUp = (tree: { toJSON(): unknown }): boolean => rendered(tree).includes(CARD.title);
const has = (tree: { root: TI }, testID: string): boolean =>
  tree.root.findAllByProps({ testID }).length > 0;
const press = (tree: { root: TI }, testID: string) => {
  const node = tree.root.findAllByProps({ testID }).filter((n) => typeof n.props.onPress === 'function')[0]!;
  renderer.act(() => { (node.props.onPress as () => void)(); });
};
/** ⚠ A `style` PROP IS NOT NECESSARILY A STYLE, AND NOT NECESSARILY FLAT. Across
 *  a rendered tree it can be one object, an array of them, a registered id, or —
 *  on a composite whose own prop happens to be named `style` — a value carrying
 *  React internals that JSON.stringify cannot walk at all (it throws on the
 *  circular `Provider`). So flatten through the platform's own resolver and
 *  tolerate anything that is not a style, rather than reading `.position` off a
 *  shape that may not have it or stringifying a shape that may not survive it. */
function flatStyle(node: TI): Record<string, unknown> {
  try {
    const flat = StyleSheet.flatten(node.props.style as never) as unknown;
    return flat && typeof flat === 'object' ? (flat as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** ⚠ ACKNOWLEDGE THE CARD. FirstTimeHint's own `Got it` key takes a children
 *  FUNCTION (the OTA-1806 press planes), so it cannot be found by its label the
 *  way an ordinary control can. Its scrim carries the SAME `dismiss` handler, so
 *  the acknowledgement path exercised here is the component's own — and the
 *  visible `Got it` key is asserted separately, by name, in §G. */
function dismissCard(tree: { root: TI }) {
  const scrim = tree.root.findAll((n) => {
    if (typeof n.props.onPress !== 'function') return false;
    const st = flatStyle(n);
    return st.position === 'absolute' && Number(st.zIndex) === 1000;
  })[0];
  if (!scrim) throw new Error('#211: the teaching card has no dismissable overlay');
  renderer.act(() => { (scrim.props.onPress as () => void)(); });
}

const CONSTRAINED = CONSTRAINED_NARRATIVE_MIN_HEIGHT - 1; // 107 — one pt short of readable
const ROOMY = CONSTRAINED_NARRATIVE_MIN_HEIGHT * 3;       // 324 — plainly fine

// ════════════════════════════════════════════════════════════════════════════
// §A — A REAL MEASURED CONSTRAINT TEACHES THE DOOR
// ════════════════════════════════════════════════════════════════════════════
describe('OTA-1880 §A — the constraint surfaces its own escape hatch', () => {
  it('the card exists in the registry, in the exploration group, with replay copy', () => {
    expect(CARD.id).toBe('narrative_expand_v1');
    expect(CARD.group).toBe('exploration');
    expect(CARD.title.length).toBeGreaterThan(0);
    expect(CARD.body.length).toBeGreaterThan(0);
    expect(CARD.when.length).toBeGreaterThan(0);
    // ⚠ It must be replayable — a dismissed card the player can never reread is
    // how OTA-1738's whole registry came to exist.
    expect(ALL_TEACHINGS.some((t) => t.id === CARD.id)).toBe(true);
  });

  it('⚠⚠⚠ a measured-constrained feed raises the card', async () => {
    const tree = mountExploration();
    await settle();
    expect(cardUp(tree)).toBe(false);          // nothing before a measurement
    measureFeed(tree, CONSTRAINED);
    await settle();
    expect(cardUp(tree)).toBe(true);
    expect(rendered(tree)).toContain(CARD.body);
  });

  it('⚠⚠ the copy names the control the rail ACTUALLY draws', () => {
    // The label lives in the screen; if it is ever renamed, this card would keep
    // telling the player to press a key that no longer exists by that name.
    const m = /const NARRATIVE_EXPAND_LABEL = '([A-Z ]+)'/.exec(EXPL);
    expect(m).toBeTruthy();
    expect(CARD.body).toContain(m![1]!);
  });

  it('the card is wired to the MEASURED boolean, and waits for a closed reader', () => {
    expect(EXPL).toContain(
      '{ id: TEACH.narrative_expand_v1.id, when: !modalOwnsBeat && narrativeConstrained && !narrativeReaderOpen },',
    );
    // One derivation feeds both the key and the card — they cannot disagree.
    expect(EXPL).toContain('const narrativeConstrained = isNarrativeConstrained(feedH);');
    expect((EXPL.match(/const narrativeConstrained = /g) ?? []).length).toBe(1);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// §B — NO DEVICE IDENTITY, ANYWHERE ON THIS PATH
// ⚠⚠ The shortcut this package must never take is "if it's a small phone, teach
// it". The trigger is layout pressure, so a large phone under pressure is taught.
// ════════════════════════════════════════════════════════════════════════════
describe('OTA-1880 §B — layout pressure, never a model name', () => {
  it('the registry and the threshold module name no device, platform or window', () => {
    for (const forbidden of ['iPhone', 'Pixel', 'Platform.OS', 'windowHeight', 'DEVICE_PROFILES', 'useWindowDimensions']) {
      expect(REGISTRY).not.toContain(forbidden);
      expect(src('app', 'ui', 'narrativeReadability.ts')).not.toContain(forbidden);
    }
  });

  it("⚠⚠⚠ the card's own gate mentions no device — it is the measurement or nothing", () => {
    const gate = /\{ id: TEACH\.narrative_expand_v1\.id, when: ([^}]*)\}/.exec(EXPL);
    expect(gate).toBeTruthy();
    const when = gate![1]!;
    for (const forbidden of ['iPhone', 'Pixel', 'Platform', 'isShrunk', 'logicalHeight', 'width', 'DEVICE']) {
      expect(when).not.toContain(forbidden);
    }
    expect(when).toContain('narrativeConstrained');
  });

  it('⚠ a LARGE logical viewport still teaches, if its feed is genuinely squeezed', async () => {
    // Same constrained measurement, a phone-sized frame three times the SE's
    // height: the hint follows the feed, not the frame.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useGameStore } = require('../app/state/gameStore');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { ExplorationScreen } = require('../app/screens/ExplorationScreen');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { SafeAreaProvider } = require('react-native-safe-area-context');
    useGameStore.setState({
      tutorialStep: null, currentScreen: 'exploration', currentScene: SCENE,
      player: basePlayer, gameLog: LOG,
    } as never);
    let tree!: { toJSON(): unknown; root: TI; unmount(): void };
    renderer.act(() => {
      tree = renderer.create(
        <SafeAreaProvider initialMetrics={{
          frame: { x: 0, y: 0, width: 430, height: 932 },
          insets: { top: 47, left: 0, right: 0, bottom: 34 },
        }}>
          <ExplorationScreen />
        </SafeAreaProvider>,
      ) as unknown as { toJSON(): unknown; root: TI; unmount(): void };
    });
    _mounted.push(tree);
    await settle();
    measureFeed(tree, CONSTRAINED);
    await settle();
    expect(cardUp(tree)).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// §C — A FEED WITH ROOM TEACHES NOTHING
// ════════════════════════════════════════════════════════════════════════════
describe('OTA-1880 §C — room to read means nothing to say', () => {
  it('⚠⚠⚠ a comfortable measured feed raises neither the card nor the key', async () => {
    const tree = mountExploration();
    measureFeed(tree, ROOMY);
    await settle();
    expect(cardUp(tree)).toBe(false);
    expect(has(tree, 'narrative-expand')).toBe(false);
  });

  it('an UNMEASURED feed teaches nothing either — no first-frame flash', async () => {
    const tree = mountExploration();
    await settle();
    expect(cardUp(tree)).toBe(false);
    expect(has(tree, 'narrative-expand')).toBe(false);
  });

  it('the boundary is the OTA-1878 threshold, on both sides of it', async () => {
    const roomy = mountExploration();
    measureFeed(roomy, CONSTRAINED_NARRATIVE_MIN_HEIGHT);
    await settle();
    expect(cardUp(roomy)).toBe(false);
    const tight = mountExploration();
    measureFeed(tight, CONSTRAINED_NARRATIVE_MIN_HEIGHT - 1);
    await settle();
    expect(cardUp(tight)).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// §D — NO PERMANENT VERTICAL COST
// ⚠⚠⚠ The failure mode named by the owner: answering congestion with more
// permanent congestion. The card is an absolute overlay and the screen's
// vertical stack is untouched.
// ════════════════════════════════════════════════════════════════════════════
describe('OTA-1880 §D — the hint costs no layout', () => {
  it('⚠⚠⚠ the card renders on an ABSOLUTE overlay, not a row in the stack', async () => {
    const tree = mountExploration();
    measureFeed(tree, CONSTRAINED);
    await settle();
    // Walk up from the card's own title to the overlay that hosts it and prove
    // the host is taken out of flow. A row would have no `position`.
    // ⚠ Compare the children AS A STRING, not through JSON. Some composites in
    // this tree carry props JSON.stringify cannot walk (a circular `Provider`),
    // and a finder that throws on an unrelated node never reaches this one.
    const title = tree.root.findAll((n) => n.props.children === CARD.title)[0];
    expect(title).toBeTruthy();
    let host: TI | null = title!.parent;
    let absolute = false;
    while (host) {
      // ⚠ Resolve the style first — see `flatStyle`. A direct `.position` read
      // misses a `position` that lives one level down inside a style ARRAY,
      // which is exactly how this overlay is composed.
      if (flatStyle(host).position === 'absolute') { absolute = true; break; }
      host = host.parent;
    }
    expect(absolute).toBe(true);
  });

  it('⚠⚠ the screen gained no new element in the vertical stack', () => {
    // The feed's sacrificial sizing and the controls strip are byte-identical,
    // and there is still exactly ONE card site on this screen (OTA-1738's
    // consolidation — fourteen stacked overlays is the shape it replaced).
    expect(EXPL).toContain('feed: { flex: 1, flexShrink: 1, minHeight: 0 }');
    expect(EXPL).toContain('controls: { gap: 6 }');
    // ⚠ Match the OPENING TAG WITH ITS FIRST PROP. A bare `/<FirstTimeHint\b/`
    // also counts this screen's own OTA-1738 prose, which quotes the tag while
    // explaining why there is only one of them — the OTA-1721 class, where an
    // instrument acts on a comment that names what it hunts for.
    expect((EXPL.match(/<FirstTimeHint id=/g) ?? []).length).toBe(1);
    // …and no new row was invented to hold the hint.
    expect(EXPL).not.toMatch(/expandHintRow|hintRow|teachRow/);
  });

  it('⚠ it does not shrink the transcript to explain that the transcript is small', () => {
    // No new minHeight, maxHeight or flex anywhere near the feed.
    const feedStyle = /feed: \{[^}]*\}/.exec(EXPL)?.[0] ?? '';
    expect(feedStyle).toBe('feed: { flex: 1, flexShrink: 1, minHeight: 0 }');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// §E — EXPAND IS STILL THE DURABLE ESCAPE HATCH
// ════════════════════════════════════════════════════════════════════════════
describe('OTA-1880 §E — the card teaches; the key still does the work', () => {
  it('⚠⚠⚠ the card does NOT auto-open the reader', async () => {
    const tree = mountExploration();
    measureFeed(tree, CONSTRAINED);
    await settle();
    expect(cardUp(tree)).toBe(true);
    expect(has(tree, 'narrative-reader-scrim')).toBe(false);
    expect(has(tree, 'narrative-reader-close')).toBe(false);
  });

  it('EXPAND is present alongside the card and still opens the reader', async () => {
    const tree = mountExploration();
    measureFeed(tree, CONSTRAINED);
    await settle();
    expect(has(tree, 'narrative-expand')).toBe(true);
    press(tree, 'narrative-expand');
    expect(has(tree, 'narrative-reader-close')).toBe(true);
  });

  it('⚠⚠ the key OUTLIVES the card — dismissing the teaching keeps the door', async () => {
    const tree = mountExploration();
    measureFeed(tree, CONSTRAINED);
    await settle();
    dismissCard(tree);
    await settle();
    expect(cardUp(tree)).toBe(false);
    expect(has(tree, 'narrative-expand')).toBe(true);   // the durable signal stays
    press(tree, 'narrative-expand');
    expect(has(tree, 'narrative-reader-close')).toBe(true);
  });

  it('the reader still reads the in-memory narrative, unchanged by this package', async () => {
    const tree = mountExploration();
    measureFeed(tree, CONSTRAINED);
    await settle();
    press(tree, 'narrative-expand');
    const shown = rendered(tree);
    for (const line of LOG) expect(shown).toContain(line.text);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// §F — IT DOES NOT NAG
// ════════════════════════════════════════════════════════════════════════════
describe('OTA-1880 §F — taught once, not every time the controls grow', () => {
  it('⚠⚠⚠ after acknowledgement, later constraint transitions say nothing', async () => {
    const tree = mountExploration();
    measureFeed(tree, CONSTRAINED);
    await settle();
    expect(cardUp(tree)).toBe(true);
    dismissCard(tree);
    await settle();
    expect(cardUp(tree)).toBe(false);
    // The keyboard closes, the roll resolves, the feed breathes — and squeezes
    // again. That is the ordinary rhythm of this screen, not a new lesson.
    for (const h of [ROOMY, CONSTRAINED, ROOMY, CONSTRAINED]) {
      measureFeed(tree, h);
      await settle();
      expect(cardUp(tree)).toBe(false);
    }
  });

  it('⚠⚠ and a FRESH MOUNT does not re-teach it — the flag is per install', async () => {
    const first = mountExploration();
    measureFeed(first, CONSTRAINED);
    await settle();
    dismissCard(first);
    await settle();
    expect(await readSeenHintIds()).toContain(CARD.id);
    const second = mountExploration();
    measureFeed(second, CONSTRAINED);
    await settle();
    expect(cardUp(second)).toBe(false);
  });

  it('⚠ the persistence is the SHARED one — no private key, no second mechanism', () => {
    // It must answer to SHOW ALL TIPS AGAIN, to the per-id reset and to the
    // global tips switch, which it does by being an ordinary registry card.
    expect(EXPL).toContain('useTeachingSlot([');
    expect(REGISTRY).toContain("id: 'narrative_expand_v1'");
    expect(src('app', 'components', 'useFirstTimeHint.ts')).toContain("const KEY_PREFIX = 'tartaria.hint.v1.'");
  });
});

// ════════════════════════════════════════════════════════════════════════════
// §G — ACCESSIBILITY
// ════════════════════════════════════════════════════════════════════════════
describe('OTA-1880 §G — reachable without seeing an animation', () => {
  it('the card is a header plus real buttons, not a decorated banner', async () => {
    const tree = mountExploration();
    measureFeed(tree, CONSTRAINED);
    await settle();
    expect(tree.root.findAllByProps({ accessibilityRole: 'header' }).length).toBeGreaterThan(0);
    const buttons = tree.root.findAll((n) =>
      n.props.accessibilityRole === 'button' && typeof n.props.onPress === 'function');
    expect(buttons.length).toBeGreaterThan(0);
  });

  it('⚠⚠ the acknowledgement is a VISIBLE, NAMED key — not just a tappable scrim', async () => {
    // The dismissal helper elsewhere in this suite presses the scrim, because the
    // key's children are a FUNCTION (OTA-1806's press planes) and cannot be found
    // by label. That is a harness limitation, so the label itself is proven here:
    // a card a sighted player can only leave by guessing at the backdrop would
    // fail the owner's rule that the hint must not become an obstacle.
    const tree = mountExploration();
    measureFeed(tree, CONSTRAINED);
    await settle();
    expect(rendered(tree)).toContain('Got it');
  });

  it('⚠⚠ EXPAND keeps its own role and label — independently reachable', async () => {
    const tree = mountExploration();
    measureFeed(tree, CONSTRAINED);
    await settle();
    const key = tree.root.findAllByProps({ testID: 'narrative-expand' })
      .filter((n) => typeof n.props.onPress === 'function')[0]!;
    expect(key.props.accessibilityRole).toBe('button');
    expect(String(key.props.accessibilityLabel).length).toBeGreaterThan(0);
  });

  it('⚠ nothing here depends on a timer to become dismissable', () => {
    // The card closes on an explicit acknowledgement. A self-clearing hint would
    // race the very layout thrash that raised it.
    const gate = /\{ id: TEACH\.narrative_expand_v1\.id, when: ([^}]*)\}/.exec(EXPL)![1]!;
    expect(gate).not.toContain('setTimeout');
    expect(src('app', 'components', 'FirstTimeHint.tsx')).not.toContain('setTimeout');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// §H — NO GAMEPLAY CONSEQUENCE
// ════════════════════════════════════════════════════════════════════════════
describe('OTA-1880 §H — teaching is not a move', () => {
  it('⚠⚠⚠ raising and dismissing the card changes no player-visible narrative or state', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useGameStore } = require('../app/state/gameStore');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { HIDDEN_LOG_CHANNELS } = require('../app/engine/gameLog');
    const visible = () => (useGameStore.getState().gameLog as Array<{ channel: string; text: string }>)
      .filter((e) => !HIDDEN_LOG_CHANNELS.has(e.channel)).map((e) => e.text);

    const tree = mountExploration();
    const before = visible();
    const st0 = useGameStore.getState();
    const snap0 = { screen: st0.currentScreen, tc: st0.player?.tc, hours: st0.player?.hoursElapsed };

    measureFeed(tree, CONSTRAINED);
    await settle();
    expect(cardUp(tree)).toBe(true);
    dismissCard(tree);
    await settle();

    const st1 = useGameStore.getState();
    expect(visible()).toEqual(before);
    expect(st1.currentScreen).toBe(snap0.screen);
    expect(st1.player?.tc).toBe(snap0.tc);
    expect(st1.player?.hoursElapsed).toBe(snap0.hours);
  });

  it('⚠ the card names no content — it teaches a control, not an answer', () => {
    expect(CARD.body).not.toMatch(/recipe|weakness|password|answer/i);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// §I — THE OTA-1878 CONTRACT IS UNTOUCHED
// ════════════════════════════════════════════════════════════════════════════
describe('OTA-1880 §I — the measurement remains the source of truth', () => {
  it('the four-line threshold semantics are unchanged', () => {
    expect(READABLE_NARRATIVE_LINES).toBe(4);
    expect(NARRATIVE_BODY_LINE_HEIGHT).toBe(22);
    expect(CONSTRAINED_NARRATIVE_MIN_HEIGHT).toBe(108);
  });

  it('EXPAND still renders on the same measured boolean, and the reader is unchanged', () => {
    expect(EXPL).toContain('{narrativeConstrained && (');
    expect(EXPL).toContain('isNarrativeConstrained(feedH)');
    expect(EXPL).toContain('narrative-expand');
    // The reader itself was not touched by this package.
    const reader = src('app', 'components', 'ExpandedNarrativeReader.tsx');
    expect(reader).toContain('narrative-reader-scrim');
    expect(reader).toContain('narrative-reader-close');
    expect(reader).not.toContain('narrative_expand_v1');
  });

  it('⚠ and OTA-1879 is not reopened — the roll surface is untouched here', () => {
    const dice = src('app', 'components', 'DiceRoller.tsx');
    expect(dice).not.toContain('narrative_expand_v1');
    expect(dice).not.toContain('FirstTimeHint');
  });
});
