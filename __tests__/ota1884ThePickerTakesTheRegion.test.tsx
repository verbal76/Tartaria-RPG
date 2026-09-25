// OTA-1884 — THE PICKER TAKES THE REGION, IT DOES NOT EXTEND IT (#212).
//
// ⚠⚠⚠ THE OWNER'S REPORT WAS "THE DOG AND HEAL BUTTONS DO NOT WORK IN A FIGHT",
// AND THE BUTTONS WERE FINE. Two submitted logs from a 375×667 iPhone show every
// press completing the whole touch ledger — `in → enter → admit → dispatch →
// done`, p=none — 22 heal presses and 8 dog presses in one report, 5 and 5 in the
// other, with no `[player]` line after any of them. There is none to expect:
// neither chip submits an action, both toggle an inline picker. The pickers
// opened. They opened where he could not see them, because each was APPENDED
// BELOW the quick rows and that fight had ~23.6pt of slack against the dog
// picker's ~63.2 and the heal picker's ~55.0. His Android phone carries ~263pt,
// which is the only reason the same code looked healthy there.
//
// ⚠⚠ SO THE SUITE'S JOB IS OWNERSHIP, NOT TOUCH. Touch delivery was never the
// defect and is not what broke; what broke was two things claiming one region at
// once. Every case below asks the rendered tree who owns the quick-action region
// and proves the answer is exactly one of NORMAL / DOG / HEAL — never two.
//
// ⚠ AND THE TOPOLOGY MAY NEVER LEARN A DEVICE. A fix keyed to a screen size
// would have been a different defect wearing this one's clothes: the same
// unbounded reveal would sit there waiting for the next phone. §F renders the
// identical sequence at 375×667 and at 430×932 and demands the SAME answers.
import React from 'react';
import { StyleSheet } from 'react-native';
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
/* ⚠⚠⚠ OTA-1884 — THESE TWO MODULES REALLY EXIST, SO THEY ARE MOCKED THE WAY THE
 * OTHER 588 SUITES MOCK THEM. An earlier draft of this file marked both mocks
 * virtual. A virtual registration stands in for a module that is NOT installed;
 * used on one that is, it leaves the real module resolvable, and the next suite
 * to share this process resolves it for real — gameStore → trapDive →
 * combatResolution → narration → engines → CognitiveOrchestrator →
 * SemanticEmbeddingService reaches onnxruntime's native binding, which has no
 * native side under jest and dies reading `install` of undefined.
 * ⚠⚠ THE COST WAS PAID BY THE NEIGHBOURS, NOT BY THIS FILE, which is what made
 * it hard to see: alone this suite was green, while ota1803 lost 11 tests and
 * ota1879 failed to run at all. Same cross-suite isolation class OTA-1246
 * recorded and OTA-1881 met again. Factories below are the shipped shape. */
jest.mock('onnxruntime-react-native', () => ({
  InferenceSession: { create: jest.fn(async () => ({ run: jest.fn(async () => ({})) })) },
  Tensor: class { constructor(_t: string, _d: unknown, _s: unknown[]) {} },
}));
jest.mock('llama.rn', () => ({
  initLlama: jest.fn(async () => ({ completion: jest.fn(async () => ({ text: '' })), release: jest.fn() })),
  releaseAllLlama: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const renderer = require('react-test-renderer') as {
  act(cb: () => unknown): unknown;
  create(el: React.ReactElement): { toJSON(): unknown; root: TI; unmount(): void };
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { SafeAreaProvider } = require('react-native-safe-area-context');
import { readFileSync } from 'fs';
import { join } from 'path';

const src = (...p: string[]): string => readFileSync(join(__dirname, '..', ...p), 'utf8');
const BOX = src('app', 'components', 'InputBox.tsx');

interface TI {
  type: unknown;
  props: Record<string, unknown>;
  parent: TI | null;
  children: unknown[];
  findAll(fn: (n: TI) => boolean): TI[];
  findAllByProps(p: Record<string, unknown>): TI[];
}

jest.setTimeout(60_000);

const DOG = { name: 'Salt', hp: 8, hpMax: 17, status: 'with_player', sex: { pronoun: 'they' }, bond: 1 };
const HEAL = { id: 'h1', name: 'Trauma Kit', type: 'consumable', quantity: 1 };

let base: unknown = null;
beforeAll(async () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useGameStore } = require('../app/state/gameStore');
  await useGameStore.getState().startNewGame({
    name: '', raceId: 'reclaimer', factionId: 'reclaimers_guild',
    motiveId: 'debt', pressure: 'owed',
  } as never);
  if (useGameStore.getState().storyIntro) useGameStore.getState().dismissStoryIntro();
  useGameStore.getState().submitPlayerAction('Walker');
  base = useGameStore.getState().player;
  require('../app/screens/ExplorationScreen');
});

const _mounted: Array<{ unmount(): void }> = [];
afterEach(() => { while (_mounted.length) _mounted.pop()!.unmount(); });

/** ⚠ THE REPORTED FIGHT, not a hand-built screen. ExplorationScreen returns a
 *  placeholder with no player, so the chips would not exist at all; and the dog
 *  chip needs a living companion at the player's side while the heal chip needs a
 *  stack the real catalog resolves as a heal. Both gates are production's. */
function mountFight(w = 375, h = 667) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useGameStore } = require('../app/state/gameStore');
  const p = base as Record<string, unknown>;
  renderer.act(() => {
    useGameStore.setState({
      player: {
        ...p, hp: 20,
        inventory: [...((p.inventory as unknown[]) ?? []), HEAL],
        equipped: { ...((p.equipped as object) ?? {}), medkitIds: ['h1'] },
        dog: DOG,
      },
      currentScene: {
        location: { id: 'probe_tile', name: 'Probe Tile', type: 'ruin', tags: ['ruin'] },
        ambientNouns: [], displayedAmbientNouns: [], pinnedAmbientNouns: [],
        enemies: ['Mud Monarch'], enemyHps: [180], hooks: [], range: 'close', text: '',
      },
    } as never);
  });
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { ExplorationScreen } = require('../app/screens/ExplorationScreen');
  let tree!: { toJSON(): unknown; root: TI; unmount(): void };
  renderer.act(() => {
    tree = renderer.create(
      <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: w, height: h }, insets: { top: 20, left: 0, right: 0, bottom: 0 } }}>
        <ExplorationScreen />
      </SafeAreaProvider>,
    ) as never;
  });
  _mounted.push(tree);
  return tree;
}

/** Every label under a node, joined — a chip nests its text, so nothing here may
 *  depend on the label being a direct child. */
function textOf(n: TI): string {
  const out: string[] = [];
  const walk = (x: TI) => {
    const c = x.props.children;
    if (typeof c === 'string') out.push(c);
    for (const k of (x.children ?? [])) if (k && typeof k === 'object' && 'props' in (k as object)) walk(k as TI);
  };
  walk(n);
  return out.join('|');
}
const pressables = (tree: { root: TI }): TI[] =>
  tree.root.findAll((n) => typeof n.props.onPress === 'function');
/** ⚠ The FIRST match only. react-test-renderer yields a composite and its host
 *  for one control, and pressing both would count one tap twice. */
function key(tree: { root: TI }, re: RegExp): TI | null {
  for (const x of pressables(tree)) if (re.test(textOf(x))) return x;
  return null;
}
function press(tree: { root: TI }, re: RegExp) {
  const k = key(tree, re);
  if (!k) throw new Error(`#212: no control matching ${String(re)}`);
  renderer.act(() => { (k.props.onPress as () => void)(); });
}
const shown = (tree: { toJSON(): unknown }): string => JSON.stringify(tree.toJSON());
const has = (tree: { root: TI }, re: RegExp): boolean => key(tree, re) !== null;

// The three states the region can be in, read off the rendered tree.
const DOG_KEY = /SALT \(/i;
const HEAL_KEY = /HEALS \(/i;
const NORMAL_ONLY = [/^PUNCH/i, /^DODGE/i, /^STEALTH/i, /^APPROACH/i];
const BITE = /^BITE/;
const DISTRACT = /^DISTRACT/;
const TRAUMA = /TRAUMA KIT/i;

// ════════════════════════════════════════════════════════════════════════════
// §A — THE DOG PRESS STILL REACHES ITS OWN HANDLER, EXACTLY ONCE
// ════════════════════════════════════════════════════════════════════════════
describe('OTA-1884 §A — DOG opens its picker and the rows stand down', () => {
  it('⚠⚠ the dog chip is present in the fight and its press is a single dispatch', () => {
    const tree = mountFight();
    expect(has(tree, DOG_KEY)).toBe(true);
    // ⚠ The handler is a local toggle, so "exactly once" is proven by the fact
    // that one press LANDS the picker rather than toggling past it — a doubled
    // dispatch would open and immediately close.
    press(tree, DOG_KEY);
    expect(has(tree, BITE)).toBe(true);
  });

  it('⚠⚠⚠ the DOG picker renders, and the quick rows it replaces are GONE', () => {
    const tree = mountFight();
    for (const re of NORMAL_ONLY) expect(has(tree, re)).toBe(true);
    press(tree, DOG_KEY);
    expect(has(tree, BITE)).toBe(true);
    expect(has(tree, DISTRACT)).toBe(true);
    // This is the repair. Before it, these rows were still mounted BELOW/ABOVE
    // the picker and their height is what pushed the picker off the screen.
    for (const re of NORMAL_ONLY) expect(has(tree, re)).toBe(false);
    // …and the chip that opened it is one of them.
    expect(has(tree, DOG_KEY)).toBe(false);
  });

  it('BITE and DISTRACT stay actionable, with their shipped copy', () => {
    const tree = mountFight();
    press(tree, DOG_KEY);
    expect(typeof key(tree, BITE)!.props.onPress).toBe('function');
    expect(typeof key(tree, DISTRACT)!.props.onPress).toBe('function');
    expect(shown(tree)).toContain('lunges in');
    expect(shown(tree)).toContain('+1 init, +4 atk next swing');
  });

  it('⚠⚠ BACK restores the ordinary quick rows', () => {
    const tree = mountFight();
    press(tree, DOG_KEY);
    expect(has(tree, BITE)).toBe(true);
    press(tree, /^BACK/);
    expect(has(tree, BITE)).toBe(false);
    for (const re of NORMAL_ONLY) expect(has(tree, re)).toBe(true);
    expect(has(tree, DOG_KEY)).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// §B — THE SAME FOR HEAL
// ════════════════════════════════════════════════════════════════════════════
describe('OTA-1884 §B — HEAL opens its picker and the rows stand down', () => {
  it('⚠⚠ the heal chip is present and one press lands its picker', () => {
    const tree = mountFight();
    expect(has(tree, HEAL_KEY)).toBe(true);
    press(tree, HEAL_KEY);
    expect(has(tree, TRAUMA)).toBe(true);
  });

  it('⚠⚠⚠ the HEAL picker renders, and the quick rows it replaces are GONE', () => {
    const tree = mountFight();
    press(tree, HEAL_KEY);
    expect(has(tree, TRAUMA)).toBe(true);
    for (const re of NORMAL_ONLY) expect(has(tree, re)).toBe(false);
    expect(has(tree, HEAL_KEY)).toBe(false);
  });

  it('the racked stack is actionable and reaches the target question', () => {
    const tree = mountFight();
    press(tree, HEAL_KEY);
    expect(typeof key(tree, TRAUMA)!.props.onPress).toBe('function');
    // With a dog beside you the tap ASKS (OTA-1662) — YOU or the dog.
    press(tree, TRAUMA);
    expect(has(tree, /^YOU/)).toBe(true);
    // ⚠ The dog target tile reads its NAME then its HP, so the joined label is
    // `SALT|8/17` — anchoring at the end would be asserting the hint away.
    expect(has(tree, /^SALT\|/i)).toBe(true);
  });

  it('⚠⚠ BACK restores the ordinary quick rows', () => {
    const tree = mountFight();
    press(tree, HEAL_KEY);
    press(tree, /^BACK/);
    expect(has(tree, TRAUMA)).toBe(false);
    for (const re of NORMAL_ONLY) expect(has(tree, re)).toBe(true);
    expect(has(tree, HEAL_KEY)).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// §C — ONE OWNER, NEVER TWO
// ════════════════════════════════════════════════════════════════════════════
describe('OTA-1884 §C — the region has exactly one owner', () => {
  it('⚠⚠⚠ DOG and HEAL ownership is mutually exclusive, from either direction', () => {
    const a = mountFight();
    press(a, DOG_KEY);
    expect(has(a, BITE)).toBe(true);
    expect(has(a, TRAUMA)).toBe(false);
    // The heal chip is hidden while the dog owns the region, so the only way to
    // reach the other picker is through BACK — which is the point of the state
    // machine: one owner, and a named way home.
    press(a, /^BACK/);
    press(a, HEAL_KEY);
    expect(has(a, TRAUMA)).toBe(true);
    expect(has(a, BITE)).toBe(false);
  });

  it('⚠⚠ the owner is ONE derived value, not a race between two booleans', () => {
    expect(BOX).toContain("const quickRegionOwner: 'dog' | 'heal' | null =");
    expect(BOX).toContain('{quickRegionOwner !== null ? null : inCombat ? (');
    // Opening one closes the others — proven behaviourally above, pinned here so
    // a later hand cannot quietly drop the cross-close and rely on render order.
    expect(BOX).toMatch(/setMedkitOpen\(false\);\s*\n\s*setMedkitPick\(null\);\s*\n\s*setBandolierOpen\(false\);\s*\n\s*setDogPickerOpen\(\(v\) => !v\);/);
  });

  it('⚠ each picker keeps its own shipped gate — ownership decides the ROWS only', () => {
    // ota1657 pins this exact line; the repair must not have touched it.
    expect(BOX).toContain('{medkitOpen && medkitItems.length > 0 ? (');
    expect(BOX).toContain('{dog && dog.hp > 0 && dogPickerOpen ? (');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// §D — ZERO ADDED HEIGHT, AND NOT BY HIDING BUTTONS UNTIL THE SUMS WORK
// ════════════════════════════════════════════════════════════════════════════
describe('OTA-1884 §D — the picker replaces, it does not extend', () => {
  it('⚠⚠⚠ no quick-action ROW coexists with an open picker', () => {
    // Structural rather than arithmetic: count the rows that carry the chips.
    // While a picker owns the region there must be none of them, which is what
    // "adds zero net vertical demand" means in a natural-height stack.
    const rowStyle = /quickRowLine/;
    void rowStyle;
    const tree = mountFight();
    const rowsAtRest = tree.root.findAll((n) => {
      let st: Record<string, unknown> = {};
      try { st = (StyleSheet.flatten(n.props.style as never) ?? {}) as Record<string, unknown>; } catch { st = {}; }
      return st.flexDirection === 'row' && st.flexWrap === 'wrap' && st.gap === 6;
    }).length;
    expect(rowsAtRest).toBeGreaterThan(0);
    press(tree, DOG_KEY);
    const rowsOpen = tree.root.findAll((n) => {
      let st: Record<string, unknown> = {};
      try { st = (StyleSheet.flatten(n.props.style as never) ?? {}) as Record<string, unknown>; } catch { st = {}; }
      return st.flexDirection === 'row' && st.flexWrap === 'wrap' && st.gap === 6;
    }).length;
    expect(rowsOpen).toBe(0);
  });

  it('⚠⚠ the way out is INSIDE the picker, so leaving costs no height either', () => {
    // BACK is a sibling of BITE/DISTRACT in the same row at the same flex — not
    // a new line underneath, which would re-introduce the defect in miniature.
    const tree = mountFight();
    press(tree, DOG_KEY);
    const back = key(tree, /^BACK/)!;
    const bite = key(tree, BITE)!;
    const flat = (n: TI) => {
      try { return (StyleSheet.flatten(n.props.style as never) ?? {}) as Record<string, unknown>; } catch { return {}; }
    };
    expect(flat(back).flex).toBe(flat(bite).flex);
    expect(flat(back).paddingVertical).toBe(flat(bite).paddingVertical);
  });

  it('⚠ the picker is still INLINE in the control region — not an overlay, not a modal', () => {
    const tree = mountFight();
    press(tree, DOG_KEY);
    let h: TI | null = key(tree, BITE)!.parent;
    let absolute = false;
    while (h) {
      let st: Record<string, unknown> = {};
      try { st = (StyleSheet.flatten(h.props.style as never) ?? {}) as Record<string, unknown>; } catch { st = {}; }
      if (st.position === 'absolute') { absolute = true; break; }
      h = h.parent;
    }
    expect(absolute).toBe(false);
    // The rejected OTA-571 shape is not resurrected.
    expect(BOX).not.toMatch(/<Modal/);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// §E — SEMANTICS, ELIGIBILITY AND RESOURCES ARE UNTOUCHED
// ════════════════════════════════════════════════════════════════════════════
describe('OTA-1884 §E — a layout repair changes no rules', () => {
  it('⚠⚠ BACK spends nothing: no heal is consumed and no dog action is submitted', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useGameStore } = require('../app/state/gameStore');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { HIDDEN_LOG_CHANNELS } = require('../app/engine/gameLog');
    const visible = () => (useGameStore.getState().gameLog as Array<{ channel: string; text: string }>)
      .filter((e) => !HIDDEN_LOG_CHANNELS.has(e.channel)).map((e) => e.text);
    const tree = mountFight();
    const before = visible();
    const inv0 = JSON.stringify(useGameStore.getState().player?.inventory);
    const dog0 = JSON.stringify(useGameStore.getState().player?.dog);
    press(tree, DOG_KEY);
    press(tree, /^BACK/);
    press(tree, HEAL_KEY);
    press(tree, /^BACK/);
    expect(visible()).toEqual(before);
    expect(JSON.stringify(useGameStore.getState().player?.inventory)).toBe(inv0);
    expect(JSON.stringify(useGameStore.getState().player?.dog)).toBe(dog0);
  });

  it('⚠ the dog\'s own blocked predicate is untouched — a blocked dog still explains', () => {
    // arb143's branch buzzes and lets the Arbiter speak instead of opening the
    // picker. Ownership must not have become a way around that.
    expect(BOX).toContain("dogBlocked === 'aerial'");
    expect(BOX).toContain('if (dogBlocked) {');
  });

  it('the heal choices still route through the shipped store action', () => {
    expect(BOX).toContain("humanGetState().useHealBatch(it.name, 'self', 1)");
    expect(BOX).toContain('humanGetState().useHealBatch(it.name, target, 1)');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// §F — TOPOLOGY, NOT GEOMETRY
// ════════════════════════════════════════════════════════════════════════════
describe('OTA-1884 §F — a constrained phone and a tall one behave identically', () => {
  it('⚠⚠⚠ the same sequence gives the same answers at 375×667 and at 430×932', () => {
    for (const [w, h] of [[375, 667], [430, 932]] as Array<[number, number]>) {
      const tree = mountFight(w, h);
      for (const re of NORMAL_ONLY) expect(has(tree, re)).toBe(true);
      press(tree, DOG_KEY);
      expect(has(tree, BITE)).toBe(true);
      for (const re of NORMAL_ONLY) expect(has(tree, re)).toBe(false);
      press(tree, /^BACK/);
      for (const re of NORMAL_ONLY) expect(has(tree, re)).toBe(true);
    }
  });

  it('⚠⚠⚠ no device, platform, window or breakpoint decides this', () => {
    const owner = /const dogPickerOwnsQuickRegion[\s\S]*?quickRegionOwner: 'dog' \| 'heal' \| null =[\s\S]*?;/.exec(BOX)?.[0] ?? '';
    expect(owner.length).toBeGreaterThan(0);
    for (const forbidden of ['iPhone', 'iOS', 'Android', 'Platform.OS', 'SE', 'useWindowDimensions', 'Dimensions', 'windowHeight', 'DEVICE_PROFILES', 'uiScale']) {
      expect(owner).not.toContain(forbidden);
    }
    // And the gate that hides the rows reads the owner and nothing else.
    expect(BOX).toContain('{quickRegionOwner !== null ? null : inCombat ? (');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// §G — THE NEIGHBOURS THIS PACKAGE PROMISED NOT TO DISTURB
// ════════════════════════════════════════════════════════════════════════════
describe('OTA-1884 §G — OTA-1879 and OTA-1880 contracts stand', () => {
  it('the DiceRoller geometry is untouched', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { DICE_ROLLER_STYLES } = require('../app/components/DiceRoller');
    const s = DICE_ROLLER_STYLES as Record<string, Record<string, unknown>>;
    expect(s.container!.padding).toBe(10);
    expect(s.card!.minHeight).toBe(64);
    expect(s.rollBtn!.paddingVertical).toBe(10);
    expect(s.advancingHint!.paddingVertical).toBe(12);
  });

  it('the #211 narrative-constraint contract is untouched', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { CONSTRAINED_NARRATIVE_MIN_HEIGHT, isNarrativeConstrained } = require('../app/ui/narrativeReadability');
    expect(CONSTRAINED_NARRATIVE_MIN_HEIGHT).toBe(108);
    expect(isNarrativeConstrained(107)).toBe(true);
    expect(isNarrativeConstrained(108)).toBe(false);
    const EXPL = src('app', 'screens', 'ExplorationScreen.tsx');
    expect(EXPL).toContain('const narrativeConstrained = isNarrativeConstrained(feedH);');
    expect(EXPL).toContain('{ id: TEACH.narrative_expand_v1.id, when: !modalOwnsBeat && narrativeConstrained && !narrativeReaderOpen },');
  });

  it('⚠ unrelated combat controls are still reachable at rest', () => {
    const tree = mountFight();
    for (const re of [/^PUNCH/i, /^DODGE/i, /^STEALTH/i, /^FLEE /i, /^APPROACH/i, /^INVENTORY/i]) {
      expect(has(tree, re)).toBe(true);
    }
  });
});
