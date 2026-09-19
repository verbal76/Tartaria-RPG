/* ⚠⚠⚠ OTA-1846 — THREE PIECES OF UI DEBT, AND THE AUDIT DISAGREED WITH TWO OF
 * THE THREE PREMISES.
 *
 * Item A was real and worse than reported: the four cardinals and the
 * contextual door were FIVE EQUAL CHIPS in one wrapping row, so the compass
 * broke across lines at every supported width — only the seam moved with the
 * device. §A measures that, before and after, against the real widths.
 *
 * Item B was already built. OTA-1736 shipped equipped-first sorting, durable
 * instance-id identity and an `EQUIPPED (slot)` line; what it did not ship was
 * SALIENCE — fontSize 10 on the third line of a row whose name is 14, inside a
 * section that opens collapsed. §B pins the promotion of that existing state to
 * the name line and, at the owner's instruction, pins hard that the mark
 * follows the equipped INSTANCE and never the display name.
 *
 * Item C found nothing to delete. All four controls behind the drawer trace to
 * live consumers and OTA-1666 had already done the pruning; the only thing left
 * that lied was the word ADVANCED. §C is therefore small on purpose: the label,
 * its disclosure treatment, and the four survivors still being there.
 *
 * ⚠⚠ §A IS ARITHMETIC OVER RENDERED STYLE, NOT OVER SOURCE TEXT. Every width in
 * here is computed from the style objects the components actually rendered and
 * from ExplorationScreen's own container padding — so a chip that is renamed,
 * re-parented or re-sized moves these numbers. The owner's instruction was to
 * test against the actual minimum supported width rather than assert a shape.
 *
 * ⚠ ABSENCE CLAIMS GRADE CODE. `codeOnly` strips comments first, for the reason
 * OTA-1842 and OTA-1844 both learned the hard way: a file's comments will
 * happily satisfy a grep for the thing they promise is absent.
 */
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
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => {}) }));
jest.mock('expo-constants', () => ({ default: { expoConfig: {} } }));
jest.mock('expo-font', () => ({ loadAsync: jest.fn(async () => {}) }));
jest.mock('expo-speech-recognition', () => ({}));
jest.mock('expo-updates', () => ({}));
// ⚠ Reduce-motion is a real shipped path and it stops RN Animated loops from
// outliving Jest's teardown as the graph unloads.
jest.mock('../app/state/accessibility', () => ({
  ...jest.requireActual('../app/state/accessibility'),
  useReduceMotion: () => true,
}));

import React from 'react';
import { readFileSync } from 'fs';
import { join } from 'path';
import { StyleSheet } from 'react-native';
import { DEVICE_PROFILES } from '../app/engine/keyboardSafeCard';
import { hubLocationIds } from '../app/engine/hub';
import { placedAt } from '../test-utils/placePlayer';
import { useGameStore } from '../app/state/gameStore';
import { getRaces, getFactions } from '../app/engine/character';
import { equippedWhereLabel, instanceDisplayName } from '../app/engine/itemIdentity';
import type { VendorInstance } from '../app/engine/vendors';
import type { InventoryItem } from '../app/engine/types';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const renderer = require('react-test-renderer') as {
  act(cb: () => void | Promise<void>): void;
  create(el: React.ReactElement): Tree;
};

jest.setTimeout(240000);

interface Inst {
  type?: unknown;
  props: Record<string, unknown>;
  parent: Inst | null;
  children: unknown[];
  findAll(p: (n: Inst) => boolean): Inst[];
}
interface Tree { root: Inst; toJSON(): unknown; unmount(): void }

const ROOT = join(__dirname, '..');
const read = (...p: string[]): string => readFileSync(join(ROOT, ...p), 'utf8');
/** Strips block and line comments so an absence claim grades CODE. */
const codeOnly = (s: string): string => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
const W = (s: string): void => { process.stdout.write(s + '\n'); };

const INPUT_BOX = read('app', 'components', 'InputBox.tsx');
const VENDOR = read('app', 'screens', 'VendorScreen.tsx');
const ABOUT = read('app', 'screens', 'AboutScreen.tsx');

const mounted: Tree[] = [];
afterEach(() => {
  while (mounted.length) {
    const t = mounted.pop()!;
    try { renderer.act(() => { t.unmount(); }); } catch { /* already gone */ }
  }
});

function textOf(n: unknown): string {
  if (typeof n === 'string') return n;
  if (typeof n === 'number') return String(n);
  if (Array.isArray(n)) return n.map(textOf).join('');
  if (typeof n === 'function') {
    const r = n as (s: { pressed: boolean; hovered: boolean; focused: boolean }) => unknown;
    return textOf(r({ pressed: false, hovered: false, focused: false }));
  }
  const node = n as { children?: unknown; props?: { children?: unknown } } | null;
  if (!node) return '';
  if (node.children !== undefined) return textOf(node.children);
  return node.props ? textOf(node.props.children) : '';
}

/** The nearest ANCESTOR that is a host element — i.e. the box this node sits in
 *  once the composites between them have collapsed. */
function hostParent(n: Inst): Inst | null {
  let p = n.parent;
  while (p && typeof p.type !== 'string') p = p.parent;
  return p;
}
const isHost = (n: Inst): boolean => typeof n.type === 'string';

// ═══════════════════════════════════════════════════════════════════════════
// THE MEASURING INSTRUMENT — a single-line flex solver fed by rendered style
// ═══════════════════════════════════════════════════════════════════════════
/* ⚠⚠⚠ THIS IS THE WHOLE POINT OF §A. react-test-renderer does not lay anything
 * out, so a suite that only reads `flexWrap: 'nowrap'` out of a stylesheet has
 * proved that a word is present and nothing about whether four buttons fit on a
 * phone. What follows is the part of the flexbox algorithm that decides where a
 * row breaks and how a line is shared, driven by the FLATTENED STYLE OBJECTS THE
 * COMPONENT ACTUALLY RENDERED. Change a chip's minWidth, its basis, its gap or
 * the screen's padding and these numbers move with it. */
interface Chip { grow: number; basis: number | string; minWidth: number; label: string }

function chipOf(node: Inst, label: string): Chip {
  const f = StyleSheet.flatten(node.props.style as never) as unknown as Record<string, unknown>;
  return {
    grow: typeof f.flexGrow === 'number' ? f.flexGrow : 0,
    basis: (f.flexBasis as number | string | undefined) ?? 'auto',
    minWidth: typeof f.minWidth === 'number' ? f.minWidth : 0,
    label,
  };
}
function resolveBasis(c: Chip, avail: number): number {
  if (typeof c.basis === 'number') return c.basis;
  if (typeof c.basis === 'string' && c.basis.endsWith('%')) return (parseFloat(c.basis) / 100) * avail;
  return 0; // 'auto' on a chip with no explicit width — the floor decides
}
/** The hypothetical main size flexbox uses when it decides where to break. */
const hypothetical = (c: Chip, avail: number): number => Math.max(resolveBasis(c, avail), c.minWidth);

/** Where a WRAPPING row actually breaks. */
function wrapLines(chips: Chip[], gap: number, avail: number): Chip[][] {
  const lines: Chip[][] = [];
  let line: Chip[] = [];
  let used = 0;
  for (const c of chips) {
    const w = hypothetical(c, avail);
    const add = line.length === 0 ? w : gap + w;
    if (line.length > 0 && used + add > avail) { lines.push(line); line = [c]; used = w; }
    else { line.push(c); used += add; }
  }
  if (line.length) lines.push(line);
  return lines;
}
/** The narrowest this set of chips can be squeezed onto ONE line. */
const floorWidth = (chips: Chip[], gap: number, avail: number): number =>
  chips.reduce((a, c) => a + hypothetical(c, avail), 0) + gap * (chips.length - 1);

/** How a single line shares the space it has. */
function share(chips: Chip[], gap: number, avail: number): number[] {
  const bases = chips.map((c) => resolveBasis(c, avail));
  const slack = avail - gap * (chips.length - 1) - bases.reduce((a, b) => a + b, 0);
  const growSum = chips.reduce((a, c) => a + c.grow, 0);
  return chips.map((c, i) =>
    Math.max(c.minWidth, bases[i]! + (growSum > 0 && slack > 0 ? (slack * c.grow) / growSum : 0)));
}

/** ⚠ THE SCREEN'S OWN PADDING, READ FROM THE SCREEN. The travel row inherits no
 *  other horizontal inset between ExplorationScreen's container and itself
 *  (`controls` and InputBox's `container` are both `{ gap: 6 }`), so this one
 *  number converts a device width into a row width — and if the screen's
 *  padding ever changes, every arithmetic claim below changes with it. */
const EXPLORATION_PADDING = (() => {
  const m = /container:\s*\{[^}]*?\bpadding:\s*(\d+)/.exec(read('app', 'screens', 'ExplorationScreen.tsx'));
  if (!m) throw new Error('ExplorationScreen container padding not found — the arithmetic below has lost its ground');
  return Number(m[1]);
})();

/** ⚠⚠ PORTRAIT WIDTHS FOR THE SAME DEVICES THE CARD AUTHORITY NAMES. The
 *  profiles in keyboardSafeCard carry heights because that is what a keyboard
 *  eats; a row needs the other axis. Keying this off DEVICE_PROFILES means a
 *  new supported device cannot be added to the authority without this suite
 *  failing until its width is stated here. */
const DEVICE_WIDTH: Record<string, number> = {
  'iPhone SE 3': 375,
  'iPhone 8': 375,
  'iPhone 13 mini': 375,
  'iPhone 14': 390,
  'iPhone 15 Pro Max': 430,
};
const rowWidth = (device: string): number => DEVICE_WIDTH[device]! - 2 * EXPLORATION_PADDING;
const NARROWEST = Object.keys(DEVICE_PROFILES)
  .reduce((a, d) => Math.min(a, DEVICE_WIDTH[d] ?? Infinity), Infinity);

// ═══════════════════════════════════════════════════════════════════════════
// RENDERING THE TRAVEL ROW
// ═══════════════════════════════════════════════════════════════════════════
const INPUT_PROPS = {
  onOpenInventory: () => {}, onOpenSearch: () => {}, onOpenCrafting: () => {},
  onOpenApproach: () => {}, onOpenPickpocket: () => {}, onOpenMissions: () => {},
  onOpenSalvage: () => {}, onOpenTake: () => {}, onOpenClimb: () => {},
  onOpenTorch: () => {}, hasTorch: false, inCombat: false, inventory: [],
};

interface Travel {
  tree: Tree;
  region: Inst;            // the host box the travel-row TutorialTarget renders
  chip(label: string): Inst;
  chips(): Inst[];
  labels(): string[];
}
function mountTravel(extra: Record<string, unknown> = {}): { t: Travel; submitted: string[] } {
  const submitted: string[] = [];
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { InputBox } = require('../app/components/InputBox');
  let tree!: Tree;
  renderer.act(() => {
    tree = renderer.create(React.createElement(InputBox, {
      ...INPUT_PROPS, onSubmit: (s: string) => submitted.push(s), ...extra,
    }));
  });
  mounted.push(tree);
  const target = tree.root.findAll((n) => n.props?.area === 'travel-row')[0];
  if (!target) throw new Error('no travel-row tutorial target rendered');
  const region = target.findAll(isHost)[0]!;
  const chips = (): Inst[] => region.findAll((n) => isHost(n) && n.props.accessibilityRole === 'button');
  return {
    t: {
      tree, region, chips,
      labels: () => chips().map((c) => textOf(c.children)),
      chip: (label: string) => {
        const hit = chips().find((c) => textOf(c.children).includes(label));
        if (!hit) throw new Error(`no travel chip containing ${JSON.stringify(label)} — saw ${JSON.stringify(chips().map((c) => textOf(c.children)))}`);
        return hit;
      },
    },
    submitted,
  };
}
const CARDINALS = ['NORTH', 'SOUTH', 'EAST', 'WEST'] as const;
/** ⚠ A host View carries no `onPress` — the Pressable COMPOSITE above it owns
 *  the handler and the host below it owns the style. Identifying a control by
 *  its box and then pressing it means starting at the box and walking back up
 *  to the thing that actually handles the touch. */
function press(n: Inst): void {
  let p: Inst | null = n;
  while (p && typeof p.props?.onPress !== 'function') p = p.parent;
  if (!p) throw new Error(`nothing in this control's ancestry handles a press: ${textOf(n.children)}`);
  const fire = p.props.onPress as () => void;
  renderer.act(() => { fire(); });
}

/** ⚠⚠ A REAL HUB OUTPOST, PLACED ON ITS ANCHOR TILE BY THE ONE HELPER THAT CAN
 *  SPELL THAT STATE. OTA-1611 put the outpost gate on the location's anchor
 *  tile and nowhere else, so this fixture has to agree about THREE numbers at
 *  once — the location, the authoritative cell and the visual frame. Writing
 *  `currentLocationId` alone would have leaned on the spawn coordinates
 *  happening to be the centre, which is exactly the luck OTA-1484 exists to
 *  take away: the gate would quietly stop being exercised the day spawn moves.
 *  `placedAt` derives all five fields from the canon cell. */
const HUB_ID = hubLocationIds()[0]!;
const ON_THE_GATE_TILE = (): ReturnType<typeof placedAt> => placedAt(HUB_ID);

beforeEach(() => { useGameStore.setState({ player: null, activeBuildingId: null, currentScene: null } as never); });

// ═══ §A — THE COMPASS IS ONE OBJECT ════════════════════════════════════════

describe('OTA-1846 §A — the movement row, measured', () => {
  it('A1 · the travel region lays its children out as a COLUMN in the cardinal branches', () => {
    const { t } = mountTravel();
    const f = StyleSheet.flatten(t.region.props.style as never) as unknown as Record<string, unknown>;
    expect(f.flexDirection).toBe('column');
    // and it is NOT the old wrapping row
    expect(f.flexWrap).toBeUndefined();
  });

  it('A2 · the four cardinals are siblings in one row that may not wrap', () => {
    const { t } = mountTravel();
    const parents = CARDINALS.map((d) => hostParent(t.chip(d))!);
    expect(new Set(parents).size).toBe(1);
    const f = StyleSheet.flatten(parents[0]!.props.style as never) as unknown as Record<string, unknown>;
    expect(f.flexDirection).toBe('row');
    expect(f.flexWrap).toBe('nowrap');
  });

  it('A3 · the contextual door is NOT a sibling of the cardinals', () => {
    useGameStore.setState({ currentScene: { sceneBuilding: { id: 'probe_hut', name: 'Probe Hut' }, enemies: [], enemyHps: [] } } as never);
    const { t } = mountTravel();
    const compass = hostParent(t.chip('NORTH'))!;
    const door = hostParent(t.chip('ENTER'))!;
    expect(door).not.toBe(compass);
    // and both hang off the same column
    expect(hostParent(door)).toBe(hostParent(compass));
  });

  it('⚠⚠⚠ A4 · at the NARROWEST supported width the four cardinals fit one line — measured', () => {
    const { t } = mountTravel();
    const row = hostParent(t.chip('NORTH'))!;
    const gap = (StyleSheet.flatten(row.props.style as never) as unknown as { gap: number }).gap;
    const chips = CARDINALS.map((d) => chipOf(t.chip(d), d));
    const avail = NARROWEST - 2 * EXPLORATION_PADDING;
    const floor = floorWidth(chips, gap, avail);
    W(`  narrowest supported ${NARROWEST}pt → row ${avail}pt · compass floor ${floor}pt`);
    expect(NARROWEST).toBe(375);
    expect(floor).toBeLessThanOrEqual(avail);
    expect(wrapLines(chips, gap, avail)).toHaveLength(1);
  });

  it('⚠⚠⚠ A5 · and the geometry it replaced did NOT fit, at every supported width', () => {
    // The pre-repair row was FIVE EQUAL CHIPS — the door and the four cardinals
    // as siblings in one wrapping container — so it is built here out of the
    // live general chip geometry rather than out of remembered numbers. The
    // door chip on today's screen still carries exactly that geometry.
    useGameStore.setState({ currentScene: { sceneBuilding: { id: 'probe_hut', name: 'Probe Hut' }, enemies: [], enemyHps: [] } } as never);
    const { t } = mountTravel();
    const general = chipOf(t.chip('ENTER'), 'ENTER');
    const before: Chip[] = [general, ...CARDINALS.map((d) => ({ ...general, label: d }))];
    const gap = 6;
    for (const device of Object.keys(DEVICE_PROFILES)) {
      const avail = rowWidth(device);
      const lines = wrapLines(before, gap, avail);
      const compassLines = new Set(
        lines.map((ln, i) => ln.some((c) => (CARDINALS as readonly string[]).includes(c.label)) ? i : -1).filter((i) => i >= 0));
      W(`  ${device} (${DEVICE_WIDTH[device]}pt → ${avail}pt): ${lines.map((l) => l.map((c) => c.label).join('+')).join(' / ')}`);
      expect({ device, compassOnOneLine: compassLines.size === 1 }).toEqual({ device, compassOnOneLine: false });
    }
  });

  it('⚠⚠ A6 · and the repaired compass holds one line at EVERY supported width, each chip above its floor', () => {
    const { t } = mountTravel();
    const row = hostParent(t.chip('NORTH'))!;
    const gap = (StyleSheet.flatten(row.props.style as never) as unknown as { gap: number }).gap;
    const chips = CARDINALS.map((d) => chipOf(t.chip(d), d));
    for (const device of Object.keys(DEVICE_PROFILES)) {
      const avail = rowWidth(device);
      const widths = share(chips, gap, avail);
      W(`  ${device}: ${widths.map((w) => w.toFixed(2)).join(' · ')}  (sum+gaps ${(widths.reduce((a, b) => a + b, 0) + gap * 3).toFixed(2)} of ${avail})`);
      expect({ device, lines: wrapLines(chips, gap, avail).length }).toEqual({ device, lines: 1 });
      // evenly shared, and never squeezed under the audited floor
      expect(new Set(widths.map((w) => w.toFixed(4))).size).toBe(1);
      for (const w of widths) expect(w).toBeGreaterThanOrEqual(chips[0]!.minWidth);
      // and never overflowing the row it was given
      expect(widths.reduce((a, b) => a + b, 0) + gap * 3).toBeLessThanOrEqual(avail + 1e-9);
    }
  });

  it('A7 · a cardinal still FLEXES — the floor is a floor, not a fixed width', () => {
    const { t } = mountTravel();
    const c = chipOf(t.chip('NORTH'), 'NORTH');
    expect(c.grow).toBe(1);
    expect(c.basis).toBe(0);              // flexBasis 0 is what makes the four share evenly
    expect(c.minWidth).toBe(80);
    const narrow = share([c, c, c, c], 6, rowWidth('iPhone SE 3'))[0]!;
    const wide = share([c, c, c, c], 6, rowWidth('iPhone 15 Pro Max'))[0]!;
    W(`  one cardinal: ${narrow.toFixed(2)}pt at 375 → ${wide.toFixed(2)}pt at 430`);
    expect(narrow).toBeGreaterThan(c.minWidth);
    expect(wide).toBeGreaterThan(narrow);
  });

  it('A8 · open wild ground renders the compass and NOTHING beneath it', () => {
    const { t } = mountTravel();
    expect(t.labels().map((s) => s.trim())).toEqual([...CARDINALS]);
    // exactly one box under the column: the compass row itself
    const boxes = t.region.findAll((n) => isHost(n) && hostParent(n) === t.region);
    expect(boxes).toHaveLength(1);
    expect(boxes[0]).toBe(hostParent(t.chip('NORTH')));
  });

  it('A9 · a structure on the tile puts its door on its own row BENEATH the compass', () => {
    useGameStore.setState({ currentScene: { sceneBuilding: { id: 'probe_hut', name: 'Probe Hut' }, enemies: [], enemyHps: [] } } as never);
    const { t } = mountTravel();
    const boxes = t.region.findAll((n) => isHost(n) && hostParent(n) === t.region);
    expect(boxes).toHaveLength(2);
    expect(boxes[0]).toBe(hostParent(t.chip('NORTH')));   // compass first
    expect(boxes[1]).toBe(hostParent(t.chip('ENTER')));   // door second
  });

  it('A10 · the outpost gate gets the same treatment on the anchor tile', async () => {
    await bootPlayer();
    useGameStore.setState({
      player: { ...useGameStore.getState().player!, hubRoomId: null, ...ON_THE_GATE_TILE() },
      activeBuildingId: null,
      currentScene: { ...useGameStore.getState().currentScene!, sceneBuilding: null, enemies: [], enemyHps: [] },
    } as never);
    const { t } = mountTravel();
    expect(t.labels().some((s) => s.includes('ENTER OUTPOST'))).toBe(true);
    expect(hostParent(t.chip('ENTER OUTPOST'))).not.toBe(hostParent(t.chip('NORTH')));
  });

  it('A11 · the compass reads NORTH · SOUTH · EAST · WEST, in both cardinal branches', () => {
    const open = mountTravel().t;
    expect(open.labels().map((s) => s.trim())).toEqual([...CARDINALS]);
    useGameStore.setState({ currentScene: { sceneBuilding: { id: 'probe_hut', name: 'Probe Hut' }, enemies: [], enemyHps: [] } } as never);
    const door = mountTravel().t;
    expect(door.labels().map((s) => s.trim()).slice(0, 4)).toEqual([...CARDINALS]);
  });

  it('⚠⚠ A12 · direction semantics are untouched — each chip still submits its own verb', () => {
    const { t, submitted } = mountTravel();
    for (const d of CARDINALS) press(t.chip(d));
    expect(submitted).toEqual(['go north', 'go south', 'go east', 'go west']);
  });

  it('⚠⚠ A13 · and the doors still do what they did — ENTER enters, the gate submits its taught phrase', async () => {
    await bootPlayer();
    useGameStore.setState({
      player: { ...useGameStore.getState().player!, hubRoomId: null, ...ON_THE_GATE_TILE() },
      currentScene: { ...useGameStore.getState().currentScene!, sceneBuilding: null, enemies: [], enemyHps: [] },
    } as never);
    const { t, submitted } = mountTravel();
    press(t.chip('ENTER OUTPOST'));
    expect(submitted).toEqual(['enter outpost']);
  });

  it('A14 · every way through a wall wears the door, and it is a real glyph', () => {
    useGameStore.setState({ currentScene: { sceneBuilding: { id: 'probe_hut', name: 'Probe Hut' }, enemies: [], enemyHps: [] } } as never);
    const { t } = mountTravel();
    expect(textOf(t.chip('ENTER').children)).toContain('\u{1F6AA}');
    // ⚠ The trap this nearly shipped with: a JSX string attribute is LITERAL
    // text, so `label="🚪 ENTER"` renders the characters backslash-u.
    expect(codeOnly(INPUT_BOX)).not.toContain('\\ud83d');
    // the door row's chips carry a spoken label as well as a picture
    expect(t.chip('ENTER').props.accessibilityLabel).toBe('Enter, step inside');
  });

  it('A15 · rooms, a plotted course and hub exits keep the ORIGINAL wrapping row', async () => {
    // a plotted course
    const course = mountTravel({ travelTargetName: 'Mud Seas', onContinueTravel: () => {}, onStopTravel: () => {} }).t;
    const cf = StyleSheet.flatten(course.region.props.style as never) as unknown as Record<string, unknown>;
    expect(cf.flexDirection).toBe('row');       // travelRow, exactly as it shipped
    expect(cf.flexWrap).toBe('wrap');
    // inside a building
    await bootPlayer();
    useGameStore.setState({ activeBuildingId: 'market' } as never);
    const inside = mountTravel().t;
    const inf = StyleSheet.flatten(inside.region.props.style as never) as unknown as Record<string, unknown>;
    expect(inf.flexWrap).toBe('wrap');
  });
});

// ═══ §B — THE MARK IS ON THE NAME LINE ═════════════════════════════════════

const flush = (): Promise<unknown> => new Promise((r) => setTimeout(r, 0));
const S = () => useGameStore.getState();

async function bootPlayer(tc = 5000): Promise<void> {
  const st = useGameStore;
  await st.getState().hydrate();
  await st.getState().startNewGame({ name: 'Probe', raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
  st.getState().skipTutorial?.();
  if (st.getState().storyIntro) st.getState().dismissStoryIntro();
  st.setState({ player: { ...st.getState().player!, tc, inventory: [] }, tutorialStep: null } as never);
  await flush();
}
const stall = (): VendorInstance =>
  ({ id: 'probe_stall', name: 'Duvo', title: 'trader', faction: null, offers: [] } as unknown as VendorInstance);

// Two copies of ONE name. A is worn; B is the plain spare. The owner's rule for
// this OTA is that the mark must follow the instance, so the fixture gives the
// display name no power to distinguish them on its own.
const BLADE_A = (): Record<string, unknown> => ({
  id: 'blade_A', name: 'Rusted Blade', kind: 'weapon', rarity: 'Common', quantity: 1, tags: ['weapon'],
  durability: { current: 7, max: 28, baseMax: 23, reinforced: 1 },
});
const BLADE_B = (): Record<string, unknown> => ({
  id: 'blade_B', name: 'Rusted Blade', kind: 'weapon', rarity: 'Common', quantity: 1, tags: ['weapon'],
  durability: { current: 20, max: 20, baseMax: 20, reinforced: 0 },
});
const MATS = (): Record<string, unknown>[] => [
  { id: 'm1', name: 'Scrap Metal', kind: 'material', rarity: 'Common', quantity: 99, tags: [] },
  { id: 'm2', name: 'Stick', kind: 'material', rarity: 'Common', quantity: 60, tags: [] },
];

function openVendor(): Tree {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { VendorScreen } = require('../app/screens/VendorScreen');
  let tree!: Tree;
  renderer.act(() => { tree = renderer.create(React.createElement(VendorScreen)); });
  mounted.push(tree);
  // every section opens collapsed since OTA-1764; a player taps them open
  for (let pass = 0; pass < 3; pass++) {
    const seen = new Set<string>();
    const closed = tree.root
      .findAll((n) => typeof n.props?.onPress === 'function' && n.props?.accessibilityRole === 'button'
        && /▸/.test(textOf(n.children)) && !textOf(n.children).includes('CONTRACTS'))
      .filter((n) => { const x = textOf(n.children); if (seen.has(x)) return false; seen.add(x); return true; });
    if (!closed.length) break;
    for (const h of closed) press(h);
  }
  return tree;
}
/** Every EQUIPPED badge on screen: a Text whose whole content is the word. The
 *  slot detail reads `EQUIPPED (main hand)`, so an exact match tells the two
 *  apart without asking either of them what style they are wearing. */
const badges = (tree: Tree): Inst[] =>
  tree.root.findAll((n) => isHost(n) && n.type === 'Text' && textOf(n.children) === 'EQUIPPED');
/** The reinforce row a given instance id owns, identified by its own text. */
function reinforceRow(tree: Tree, needle: string): Inst {
  const hit = tree.root.findAll((n) => isHost(n) && n.props.accessibilityRole === 'button'
    && textOf(n.children).includes(needle)
    && (textOf(n.children).includes('in your pack') || textOf(n.children).includes('EQUIPPED')));
  if (!hit.length) throw new Error(`no reinforce row for ${JSON.stringify(needle)}`);
  return hit[0]!;
}
const inRow = (row: Inst, n: Inst): boolean => {
  let p: Inst | null = n;
  while (p) { if (p === row) return true; p = p.parent; }
  return false;
};

async function anvil(equippedId: string | null): Promise<Tree> {
  await bootPlayer(5000);
  useGameStore.setState({
    player: {
      ...S().player!, inventory: [BLADE_A(), BLADE_B(), ...MATS()],
      equipped: equippedId ? { main: 'Rusted Blade', mainId: equippedId } : {},
    },
    currentScene: { ...S().currentScene!, vendor: stall(), enemies: [], enemyHps: [] },
  } as never);
  return openVendor();
}

describe('OTA-1846 §B — REINFORCE YOUR GEAR: the equipped copy says so on the name line', () => {
  it('⚠⚠⚠ B16 · exactly ONE badge, and it is on the worn instance', async () => {
    const tree = await anvil('blade_A');
    const b = badges(tree);
    expect(b).toHaveLength(1);
    expect(inRow(reinforceRow(tree, 'Rusted Blade'), b[0]!)).toBe(true);
    expect(textOf(reinforceRow(tree, 'Rusted Blade').children)).toContain('EQUIPPED (main hand)');
  });

  it('⚠⚠⚠ B17 · the badge follows the INSTANCE, not the display name', async () => {
    // Both rows are called "Rusted Blade". Only blade_A is worn.
    const tree = await anvil('blade_A');
    const rows = tree.root.findAll((n) => isHost(n) && n.props.accessibilityRole === 'button'
      && textOf(n.children).includes('Rusted Blade')
      && (textOf(n.children).includes('in your pack') || textOf(n.children).includes('EQUIPPED')));
    const distinct = rows.filter((r, i) => rows.findIndex((o) => textOf(o.children) === textOf(r.children)) === i);
    expect(distinct.length).toBe(2);
    const worn = distinct.filter((r) => badges(tree).some((b) => inRow(r, b)));
    expect(worn).toHaveLength(1);
    expect(textOf(worn[0]!.children)).toContain('7/28');    // blade_A's own durability
    // the engine agrees, on the same two instances
    const a = BLADE_A() as unknown as InventoryItem;
    const b = BLADE_B() as unknown as InventoryItem;
    const player = { inventory: [a, b], equipped: { main: 'Rusted Blade', mainId: 'blade_A' } } as never;
    expect(equippedWhereLabel(player, a)).toBe('main hand');
    expect(equippedWhereLabel(player, b)).toBe('');
    expect(instanceDisplayName(a)).toBe(instanceDisplayName(b));   // identical names, different answers
  });

  it('⚠⚠ B18 · move the equipment and the badge moves with it', async () => {
    const tree = await anvil('blade_B');
    const b = badges(tree);
    expect(b).toHaveLength(1);
    const wearer = tree.root.findAll((n) => isHost(n) && n.props.accessibilityRole === 'button'
      && textOf(n.children).includes('Rusted Blade') && inRow(n, b[0]!))
      .sort((x, y) => textOf(x.children).length - textOf(y.children).length)[0]!;
    expect(textOf(wearer.children)).toContain('20/20');     // blade_B's own durability now
  });

  it('⚠⚠ B19 · with nothing worn, nothing is badged', async () => {
    const tree = await anvil(null);
    expect(badges(tree)).toHaveLength(0);
    // and the rows are still there — the section did not simply fail to render
    expect(textOf(reinforceRow(tree, 'Rusted Blade').children)).toContain('in your pack');
  });

  it('⚠⚠⚠ B20 · the badge sits on the NAME LINE, beside the name and the price', async () => {
    const tree = await anvil('blade_A');
    const head = hostParent(badges(tree)[0]!)!;
    const f = StyleSheet.flatten(head.props.style as never) as unknown as Record<string, unknown>;
    expect(f.flexDirection).toBe('row');
    expect(f.alignItems).toBe('baseline');
    const line = textOf(head.children);
    W(`  name line: ${line}`);
    expect(line).toContain('Rusted Blade');
    expect(line).toContain('EQUIPPED');
    expect(line).toContain('TC');
  });

  it('⚠⚠ B21 · and it is BIGGER NEWS than the line it promotes — that was the whole defect', async () => {
    const tree = await anvil('blade_A');
    const badge = StyleSheet.flatten(badges(tree)[0]!.props.style as never) as unknown as Record<string, unknown>;
    // the detail line it promotes
    const detail = tree.root.findAll((n) => isHost(n) && n.type === 'Text' && textOf(n.children).includes('EQUIPPED (main hand)'))[0]!;
    const det = StyleSheet.flatten(detail.props.style as never) as unknown as Record<string, unknown>;
    W(`  badge: fontSize ${String(badge.fontSize)} bordered ${String(badge.borderWidth)} · detail: fontSize ${String(det.fontSize)}`);
    // the badge's salience is its FRAME and its position, not its size
    expect(badge.borderWidth).toBe(1);
    expect(det.borderWidth).toBeUndefined();
    expect(badge.color).toBe(det.color ?? badge.color);     // same green that has carried since OTA-1736
    expect(badge.flexShrink).toBe(0);                       // a long name may not eat it
  });

  it('⚠⚠ B22 · the slot detail is still underneath — nothing was moved, only added', async () => {
    const tree = await anvil('blade_A');
    const row = reinforceRow(tree, 'Rusted Blade');
    const t = textOf(row.children);
    expect(t.indexOf('EQUIPPED')).toBeLessThan(t.indexOf('EQUIPPED (main hand)'));
    expect(t).toContain('One-handed');
  });

  it('⚠⚠ B23 · sorting, price and eligibility are exactly what OTA-1736 shipped', async () => {
    const tree = await anvil('blade_A');
    const all = tree.root.findAll((n) => isHost(n) && n.props.accessibilityRole === 'button'
      && textOf(n.children).includes('Rusted Blade')
      && (textOf(n.children).includes('in your pack') || textOf(n.children).includes('EQUIPPED')));
    const seen: string[] = [];
    for (const r of all) { const x = textOf(r.children); if (!seen.includes(x)) seen.push(x); }
    expect(seen).toHaveLength(2);
    expect(seen[0]).toContain('EQUIPPED');        // equipped first, as before
    expect(seen[0]).toContain('300 TC');          // +1 already — the second rung's price
    expect(seen[1]).toContain('in your pack');
    expect(seen[1]).toContain('140 TC');          // first rung
  });

  it('⚠ B24 · the badge belongs to the reinforce rows and nowhere else', async () => {
    const tree = await anvil('blade_A');
    for (const b of badges(tree)) expect(inRow(reinforceRow(tree, 'Rusted Blade'), b)).toBe(true);
  });

  it('⚠⚠⚠ B25 · and nothing about identity or order was rewritten to get here', () => {
    const code = codeOnly(VENDOR);
    // one call to the identity authority, hoisted — not a second opinion
    expect(code).toContain('const equippedWhere = equippedWhereLabel(player, item);');
    expect(code).toContain('const where = equippedWhere;');
    // the screen still asks the authority rather than comparing names itself
    expect(code).not.toContain("item.name === player.equipped");
    expect(code).toContain("from '../engine/itemIdentity'");
  });
});

// ═══ §C — THE DRAWER SAYS WHAT IT IS ═══════════════════════════════════════

describe('OTA-1846 §C — Settings ▸ Session: the drawer is named after its job', () => {
  it('⚠⚠ C26 · the visible label is DIAGNOSTIC TOOLS, in both disclosure states', () => {
    const code = codeOnly(ABOUT);
    expect(code).toContain("{advancedOpen ? '▾ DIAGNOSTIC TOOLS' : '▸ DIAGNOSTIC TOOLS'}");
  });

  it('⚠⚠ C27 · the word ADVANCED no longer labels anything a player sees', () => {
    const code = codeOnly(ABOUT);
    expect(code).not.toContain("'▾ ADVANCED'");
    expect(code).not.toContain("'▸ ADVANCED'");
    expect(code).not.toContain('ADVANCED EXPORTS');
  });

  it('⚠ C28 · the disclosure treatment is the one it already had', () => {
    const code = codeOnly(ABOUT);
    // same chevrons, same secondary session button, same expanded state
    expect(code).toContain('styles.sessionBtnSecondaryText');
    expect(code).toContain('accessibilityState={{ expanded: advancedOpen }}');
    expect(code).toContain('const [advancedOpen, setAdvancedOpen] = useState(false)');   // still collapsed by default
  });

  it('⚠⚠⚠ C29 · all four controls survived the audit, with their handlers', () => {
    const code = codeOnly(ABOUT);
    for (const control of ['COPY LOG', 'COPY SAVE', 'IMPORT SAVE', 'ERASE THIS LOG']) {
      expect({ control, present: code.includes(control) }).toEqual({ control, present: true });
    }
    for (const handler of ['handleCopyLog', 'handleCopySave', 'handleImportSave', 'handleClearLog']) {
      expect({ handler, present: code.includes(handler) }).toEqual({ handler, present: true });
    }
  });

  it('⚠⚠⚠ C30 · and the erase still stamps BOTH report-dedupe marks — the reason it was kept', () => {
    // OTA-1666 found that erasing the log was otherwise a one-tap bypass of the
    // duplicate-report gate. Renaming the drawer may not have loosened that.
    const code = codeOnly(ABOUT);
    const at = code.indexOf('async function handleClearLog');
    expect(at).toBeGreaterThan(-1);
    const erase = code.slice(at, at + 1400);
    expect(erase).toContain('clearGameLog');
    expect(erase).toContain('clearActiveSlotLog');
    expect(erase).toContain('BUG_REPORT_MARK_KEY');     // OTA-1665's mark
    expect(erase).toContain('FULL_LOG_MARK_KEY');       // OTA-1672's second one
  });
});
