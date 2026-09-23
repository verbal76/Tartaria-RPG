/**
 * OTA-1873 — THE SALE IS READ BEFORE IT IS MADE.
 *
 * Owner: SELL ALL COMMON GEAR and SELL ALL LOOT commit on a count and a total.
 * Those two numbers are the safety OTA-1232 built and they are still right, but
 * they never say WHICH pieces. A pack full of eligible gear is a pack where one
 * of those rows is the one you meant to keep, and the sweep gave you no way to
 * find out and no way to say so.
 *
 * So both sweeps now open a SCROLLABLE REVIEW before anything is sold: every
 * eligible candidate listed, all of them in to begin with, a tap to veto a row
 * and a tap to put it back, a live count and TC total, and an explicit confirm.
 * Cancel mutates nothing.
 *
 * ⚠⚠ ELIGIBILITY IS NOT RE-DECIDED. `planCommonGearSale` / `planLootSale` keep
 * every guard they have learned — isForged, isRunecaster, isCoatedGear,
 * isSweepableLoot, the OTA-1320 gate-satisfier hold-back — and this suite proves
 * the review can only ever SUBTRACT from what they returned (§J, §M).
 *
 * ⚠ THE COIN STAYS OUT, AND §M IS WHY. The Worn Tartarian Coin is an ingredient
 * in five shipped recipes AND a named NPC's liked gift, so it has real non-sale
 * mechanical use and both of its existing exclusions are correct. It gets no
 * third button and no reclassification; §M pins that it appears in neither
 * review list.
 *
 * The thirteen claims:
 *   §A  each sweep opens a review listing one row per eligible plan row
 *   §B  every eligible candidate is IN when the review opens (opt-out)
 *   §C  a tap vetoes a row; a second tap puts it back
 *   §D  the count and the TC total are live and agree with the ticked rows
 *   §E  cancel sells nothing — pack and purse byte-identical
 *   §F  confirm sells the included rows ONLY, and pays the total it showed
 *   §G  the veto is transaction-local — reopening restores the full list
 *   §H  the list is inside a scrolling ancestor (OTA-1799's rule)
 *   §I  with everything vetoed there is no live confirm
 *   §J  the review can never widen eligibility
 *   §K  individual and category selling still work
 *   §L  the pure authority's arithmetic, including quantities
 *   §M  the Worn Tartarian Coin is in neither review
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
jest.mock('../app/state/accessibility', () => ({
  ...jest.requireActual('../app/state/accessibility'),
  useReduceMotion: () => true,
}));

import React from 'react';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const renderer = require('react-test-renderer') as {
  act(cb: () => void | Promise<void>): void;
  create(el: React.ReactElement): {
    toJSON(): unknown; unmount(): void;
    root: { findAll(p: (n: TestNode) => boolean): TestNode[] };
  };
};
interface TestNode {
  type?: unknown;
  props: Record<string, unknown>;
  children: unknown[];
  parent?: TestNode | null;
}

import { useGameStore } from '../app/state/gameStore';
import { getRaces, getFactions } from '../app/engine/character';
import { VendorScreen } from '../app/screens/VendorScreen';
import { WEAPONS, ARMOR } from '../app/engine/crafting';
import { planCommonGearSale, planLootSale, isSweepableLoot } from '../app/engine/bulkSell';
import {
  reviewRowsFor, reviewTotals, toggleExclusion, includedCandidates, reviewIsEmpty,
  NOTHING_EXCLUDED,
} from '../app/engine/bulkSellReview';
import type { InventoryItem } from '../app/engine/types';
import type { VendorInstance } from '../app/engine/vendors';
import MATERIALS from '../app/data/items/materials.json';

jest.setTimeout(240000);
const flush = () => new Promise((r) => setTimeout(r, 0));

const stall = (): VendorInstance => ({
  id: 'roadside_probe', name: 'Duvo', title: 'roadside trader', offers: [],
} as unknown as VendorInstance);

async function boot(tc = 500): Promise<void> {
  const st = useGameStore;
  await st.getState().hydrate();
  await st.getState().startNewGame({ name: 'Probe', raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
  st.getState().skipTutorial?.();
  if (st.getState().storyIntro) st.getState().dismissStoryIntro();
  const p = st.getState().player!;
  st.setState({
    player: { ...p, tc, inventory: [] },
    currentScene: { ...st.getState().currentScene!, vendor: stall(), enemies: [], enemyHps: [] },
    tutorialStep: null,
  } as never);
  await flush();
}
const inv = () => useGameStore.getState().player!.inventory;
const tcNow = () => useGameStore.getState().player!.tc;
const qty = (name: string) => inv().find((i) => i.name === name)?.quantity ?? 0;
function setPack(items: Array<Record<string, unknown>>): void {
  const p = useGameStore.getState().player!;
  useGameStore.setState({ player: { ...p, inventory: items } } as never);
}

function textOf(n: TestNode): string {
  const walk = (x: unknown): string => {
    if (typeof x === 'string') return x;
    if (typeof x === 'number') return String(x);
    if (Array.isArray(x)) return x.map(walk).join('');
    const c = (x as TestNode | null)?.children;
    return c ? walk(c) : '';
  };
  return walk(n.children);
}

const mounted: Array<ReturnType<typeof renderer.create>> = [];
afterEach(() => {
  while (mounted.length) {
    const t = mounted.pop()!;
    try { renderer.act(() => { t.unmount(); }); } catch { /* already gone */ }
  }
});
function mount(): ReturnType<typeof renderer.create> {
  let tree!: ReturnType<typeof renderer.create>;
  renderer.act(() => { tree = renderer.create(React.createElement(VendorScreen)); });
  mounted.push(tree);
  return tree;
}

type Tree = ReturnType<typeof renderer.create>;

/** Every pressable whose rendered text contains `label`, deduped by that text —
 *  a Pressable is a composite that forwards its props, so findAll returns it
 *  twice and pressing both toggles an even number of times (the trap ota1734
 *  documents). */
function pressables(tree: Tree, label: string): TestNode[] {
  const seen = new Set<string>();
  return tree.root
    .findAll((n) => typeof n.props?.onPress === 'function' && textOf(n).includes(label))
    .filter((n) => { const t = textOf(n); if (seen.has(t)) return false; seen.add(t); return true; })
    /* ⚠⚠ SHORTEST TEXT FIRST, AND THIS IS NOT COSMETIC. The modal's scrim is a
     *  TouchableWithoutFeedback wrapping the whole card, so its rendered text
     *  CONTAINS every button's label and it sits ABOVE them in tree order.
     *  Taking the first match pressed the scrim — i.e. `onRequestClose`, i.e.
     *  cancel — and the suite silently measured "nothing sold" for the confirm.
     *  The control that actually says the label is the one with the least text
     *  around it. */
    .sort((a, b) => textOf(a).trim().length - textOf(b).trim().length);
}
function press(tree: Tree, label: string): void {
  const hits = pressables(tree, label);
  if (hits.length === 0) throw new Error(`no control containing "${label}"`);
  renderer.act(() => { (hits[0]!.props.onPress as () => void)(); });
}
/** Press the LAST control whose whole rendered text is exactly `label`.
 *  ⚠ `SELL` names two different controls once a sheet is open: the tab in the
 *  screen body and the sheet's own confirm. The modal is rendered after the
 *  body, so the later match is the one on the card — and length cannot separate
 *  them because both read exactly "SELL". */
function pressExactLast(tree: Tree, label: string): void {
  const hits = tree.root.findAll(
    (n) => typeof n.props?.onPress === 'function' && textOf(n).trim() === label,
  );
  if (hits.length === 0) throw new Error(`no control reading exactly "${label}"`);
  renderer.act(() => { (hits[hits.length - 1]!.props.onPress as () => void)(); });
}
/** Open the SELL tab's collapsed category sections (OTA-1764 ships them shut).
 *  ⚠ `CONTRACTS ▸` carries the chevron in its LABEL and is a modal, not a
 *  section — pressing it buries the screen under the mission board. */
function expandSections(tree: Tree): void {
  for (let pass = 0; pass < 3; pass++) {
    const seen = new Set<string>();
    const closed = tree.root
      .findAll((n) => typeof n.props?.onPress === 'function'
        && textOf(n).includes('▸')
        && !textOf(n).includes('CONTRACTS'))
      .filter((n) => { const t = textOf(n); if (seen.has(t)) return false; seen.add(t); return true; });
    if (closed.length === 0) return;
    renderer.act(() => { for (const n of closed) (n.props.onPress as () => void)(); });
  }
}
function has(tree: Tree, label: string): boolean {
  return tree.root.findAll((n) => textOf(n).includes(label)).length > 0;
}

/** The review's rows, deduped by their accessibility label (unique per row). */
function reviewRows(tree: Tree): TestNode[] {
  const seen = new Set<string>();
  return tree.root
    .findAll((n) => n.props?.accessibilityRole === 'checkbox' && typeof n.props?.onPress === 'function')
    .filter((n) => {
      const k = String(n.props.accessibilityLabel ?? textOf(n));
      if (seen.has(k)) return false; seen.add(k); return true;
    });
}
const rowName = (n: TestNode): string => textOf(n).replace(/^[✓—]/, '').replace(/\d+ TC$/, '').trim();
const rowIsIn = (n: TestNode): boolean =>
  (n.props.accessibilityState as { checked?: boolean } | undefined)?.checked === true;
const rowTc = (n: TestNode): number => Number(/(\d+) TC$/.exec(textOf(n))?.[1] ?? NaN);
function tapRow(tree: Tree, name: string): void {
  const row = reviewRows(tree).find((n) => rowName(n).startsWith(name));
  if (!row) throw new Error(`no review row for "${name}"`);
  renderer.act(() => { (row.props.onPress as () => void)(); });
}
/** The live confirm's label, e.g. "SELL 3 FOR 21 TC" — the button row upcases. */
function confirmLabel(tree: Tree): string | null {
  const hit = tree.root
    .findAll((n) => typeof n.props?.onPress === 'function' && /^SELL \d+ FOR \d+ TC$/.test(textOf(n).trim()))
    .map((n) => textOf(n).trim())[0];
  return hit ?? null;
}
const confirmTotal = (tree: Tree): number => Number(/FOR (\d+) TC/.exec(confirmLabel(tree) ?? '')?.[1] ?? NaN);
const confirmCount = (tree: Tree): number => Number(/^SELL (\d+) /.exec(confirmLabel(tree) ?? '')?.[1] ?? NaN);

/** Open the SELL tab and then the named sweep. */
function openSweep(tree: Tree, which: 'SELL ALL COMMON GEAR' | 'SELL ALL LOOT'): void {
  press(tree, 'SELL');
  press(tree, which);
}

// ── the two packs, built from the SHIPPED catalogs ───────────────────────────
/** Three Common, unequipped, unforged, uncoated, non-runecaster pieces — the
 *  gear sweep's own definition, satisfied from the real weapon/armor tables so
 *  the fixture can never drift from what the planner accepts. */
const GEAR_NAMES: string[] = [
  ...WEAPONS.filter((w) => w.weaponKind !== 'runecaster').slice(0, 2).map((w) => w.name),
  ...ARMOR.slice(0, 1).map((a) => a.name),
];
const gearPack = () => GEAR_NAMES.map((name, i) => ({
  id: `gear_${i}`, name, kind: i === 2 ? 'armor' : 'weapon', rarity: 'Common',
  quantity: 1, tags: [],
}));

/** Loot the forge itself would melt, taken from materials.json and filtered by
 *  `isSweepableLoot` — never a hand-picked name, so a catalog change that makes
 *  a row ineligible simply drops it from the fixture instead of going red for
 *  the wrong reason. */
const LOOT_NAMES: string[] = (MATERIALS as { materials: Array<{ name: string; tags: string[] }> }).materials
  .filter((m) => isSweepableLoot({
    id: 'probe', name: m.name, kind: 'misc', quantity: 1, tags: m.tags,
  } as unknown as InventoryItem))
  .slice(0, 3)
  .map((m) => m.name);
const lootPack = () => LOOT_NAMES.map((name, i) => ({
  id: `loot_${i}`, name, kind: 'misc', rarity: 'Common', quantity: i + 1,
  tags: ['loot'],
}));

const COIN = 'Worn Tartarian Coin';

beforeEach(async () => { await boot(); });

// ─────────────────────────── §A — a review, not a bare confirm ──────────────
describe('§A the sweep opens a review listing every eligible piece', () => {
  it('SELL ALL COMMON GEAR lists one row per plan row', () => {
    setPack(gearPack());
    const tree = mount();
    expect(reviewRows(tree)).toHaveLength(0);          // nothing before the tap
    openSweep(tree, 'SELL ALL COMMON GEAR');
    expect(reviewRows(tree).length).toBe(GEAR_NAMES.length);
    for (const name of GEAR_NAMES) expect([name, has(tree, name)]).toEqual([name, true]);
  });

  it('SELL ALL LOOT lists one row per plan row', () => {
    setPack(lootPack());
    const tree = mount();
    openSweep(tree, 'SELL ALL LOOT');
    expect(reviewRows(tree).length).toBe(LOOT_NAMES.length);
  });
});

// ─────────────────────────── §B — all in to begin with ──────────────────────
describe('§B every eligible candidate is included when the review opens', () => {
  it('gear: every row is ticked', () => {
    setPack(gearPack());
    const tree = mount();
    openSweep(tree, 'SELL ALL COMMON GEAR');
    expect(reviewRows(tree).map(rowIsIn)).toEqual(GEAR_NAMES.map(() => true));
  });

  it('loot: every row is ticked', () => {
    setPack(lootPack());
    const tree = mount();
    openSweep(tree, 'SELL ALL LOOT');
    expect(reviewRows(tree).map(rowIsIn)).toEqual(LOOT_NAMES.map(() => true));
  });
});

// ─────────────────────────── §C — the veto, both ways ───────────────────────
describe('§C a tap takes a row out of the sale and a second tap puts it back', () => {
  it('the tapped row alone changes state, and reverses', () => {
    setPack(gearPack());
    const tree = mount();
    openSweep(tree, 'SELL ALL COMMON GEAR');
    const target = GEAR_NAMES[0]!;
    tapRow(tree, target);
    const after = reviewRows(tree);
    expect(after.filter(rowIsIn).length).toBe(GEAR_NAMES.length - 1);
    expect(rowIsIn(after.find((n) => rowName(n).startsWith(target))!)).toBe(false);
    tapRow(tree, target);
    expect(reviewRows(tree).map(rowIsIn)).toEqual(GEAR_NAMES.map(() => true));
  });

  it('the row stays in the list rather than disappearing — you can put it back', () => {
    setPack(gearPack());
    const tree = mount();
    openSweep(tree, 'SELL ALL COMMON GEAR');
    tapRow(tree, GEAR_NAMES[0]!);
    expect(reviewRows(tree).length).toBe(GEAR_NAMES.length);
  });
});

// ─────────────────────────── §D — live count and total ──────────────────────
describe('§D the count and the TC total are live and agree with the ticked rows', () => {
  it('the confirm label equals the sum of the ticked rows, before and after a veto', () => {
    setPack(gearPack());
    const tree = mount();
    openSweep(tree, 'SELL ALL COMMON GEAR');
    const sumIn = () => reviewRows(tree).filter(rowIsIn).reduce((n, r) => n + rowTc(r), 0);
    expect(confirmCount(tree)).toBe(GEAR_NAMES.length);
    expect(confirmTotal(tree)).toBe(sumIn());
    tapRow(tree, GEAR_NAMES[0]!);
    expect(confirmCount(tree)).toBe(GEAR_NAMES.length - 1);
    expect(confirmTotal(tree)).toBe(sumIn());
  });

  it('the heading counts the live selection, not the tap', () => {
    setPack(gearPack());
    const tree = mount();
    openSweep(tree, 'SELL ALL COMMON GEAR');
    expect(has(tree, `Sell ${GEAR_NAMES.length} Common`.toUpperCase())).toBe(true);
    tapRow(tree, GEAR_NAMES[0]!);
    expect(has(tree, `Sell ${GEAR_NAMES.length - 1} Common`.toUpperCase())).toBe(true);
  });
});

// ─────────────────────────── §E — cancel mutates nothing ────────────────────
describe('§E cancel sells nothing', () => {
  it('pack and purse are unchanged after opening, vetoing and cancelling', () => {
    setPack(gearPack());
    const tree = mount();
    const before = { tc: tcNow(), names: inv().map((i) => `${i.name}:${i.quantity}`).sort() };
    openSweep(tree, 'SELL ALL COMMON GEAR');
    tapRow(tree, GEAR_NAMES[0]!);
    press(tree, 'CANCEL');
    expect({ tc: tcNow(), names: inv().map((i) => `${i.name}:${i.quantity}`).sort() }).toEqual(before);
  });
});

// ─────────────────────────── §F — confirm sells the included rows only ──────
describe('§F confirm sells what was ticked, and only that', () => {
  it('the vetoed piece stays in the pack; the rest leave; the purse grows by the shown total', () => {
    setPack(gearPack());
    const tree = mount();
    openSweep(tree, 'SELL ALL COMMON GEAR');
    const kept = GEAR_NAMES[0]!;
    tapRow(tree, kept);
    const shown = confirmTotal(tree);
    const tcBefore = tcNow();
    press(tree, `SELL ${confirmCount(tree)} FOR ${shown} TC`);
    expect([kept, qty(kept)]).toEqual([kept, 1]);
    for (const gone of GEAR_NAMES.slice(1)) expect([gone, qty(gone)]).toEqual([gone, 0]);
    expect(tcNow() - tcBefore).toBe(shown);
  });

  it('with nothing vetoed the whole sweep still goes, exactly as before', () => {
    setPack(gearPack());
    const tree = mount();
    openSweep(tree, 'SELL ALL COMMON GEAR');
    const shown = confirmTotal(tree);
    const tcBefore = tcNow();
    press(tree, `SELL ${confirmCount(tree)} FOR ${shown} TC`);
    for (const gone of GEAR_NAMES) expect([gone, qty(gone)]).toEqual([gone, 0]);
    expect(tcNow() - tcBefore).toBe(shown);
  });
});

// ─────────────────────────── §G — the veto is transaction-local ─────────────
describe('§G a veto belongs to the transaction it was made in', () => {
  it('cancelling and reopening restores the full candidate list', () => {
    setPack(gearPack());
    const tree = mount();
    openSweep(tree, 'SELL ALL COMMON GEAR');
    tapRow(tree, GEAR_NAMES[0]!);
    press(tree, 'CANCEL');
    press(tree, 'SELL ALL COMMON GEAR');
    expect(reviewRows(tree).map(rowIsIn)).toEqual(GEAR_NAMES.map(() => true));
  });

  it('a veto in the gear sweep does not carry into the loot sweep', () => {
    setPack([...gearPack(), ...lootPack()]);
    const tree = mount();
    openSweep(tree, 'SELL ALL COMMON GEAR');
    tapRow(tree, GEAR_NAMES[0]!);
    press(tree, 'CANCEL');
    press(tree, 'SELL ALL LOOT');
    expect(reviewRows(tree).every(rowIsIn)).toBe(true);
  });
});

// ─────────────────────────── §H — bounded, like everything data-sized ───────
describe('§H the review list lives inside a scrolling ancestor', () => {
  it('every review row has a ScrollView above it (OTA-1799)', () => {
    setPack(gearPack());
    const tree = mount();
    openSweep(tree, 'SELL ALL COMMON GEAR');
    const rows = reviewRows(tree);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      let up: TestNode | null | undefined = row.parent;
      let scrolled = false;
      while (up) {
        const name = typeof up.type === 'function'
          ? ((up.type as { displayName?: string; name?: string }).displayName
             ?? (up.type as { name?: string }).name ?? '')
          : String(up.type ?? '');
        if (/ScrollView/.test(name)) { scrolled = true; break; }
        up = up.parent;
      }
      expect([rowName(row), scrolled]).toEqual([rowName(row), true]);
    }
  });
});

// ─────────────────────────── §I — no confirm for an empty sale ──────────────
describe('§I vetoing everything leaves no live confirm', () => {
  it('the sell button is gone and a single dismissal is offered', () => {
    setPack(gearPack());
    const tree = mount();
    openSweep(tree, 'SELL ALL COMMON GEAR');
    for (const name of GEAR_NAMES) tapRow(tree, name);
    expect(confirmLabel(tree)).toBeNull();
    expect(has(tree, 'KEEP EVERYTHING')).toBe(true);
  });

  it('and dismissing it sells nothing', () => {
    setPack(gearPack());
    const tree = mount();
    const before = inv().map((i) => `${i.name}:${i.quantity}`).sort();
    openSweep(tree, 'SELL ALL COMMON GEAR');
    for (const name of GEAR_NAMES) tapRow(tree, name);
    press(tree, 'KEEP EVERYTHING');
    expect(inv().map((i) => `${i.name}:${i.quantity}`).sort()).toEqual(before);
  });
});

// ─────────────────────────── §J — eligibility is never widened ──────────────
describe('§J the review can only subtract from the plan', () => {
  it('a coated Common weapon is in the pack, not in the review', () => {
    const coated = { ...gearPack()[0]!, id: 'coated_1', coating: 'acid' };
    setPack([...gearPack(), coated]);
    const tree = mount();
    openSweep(tree, 'SELL ALL COMMON GEAR');
    // Same name, but the coated INSTANCE is not among the rows: the plan holds
    // exactly as many rows as it did without it.
    expect(reviewRows(tree).length).toBe(GEAR_NAMES.length);
  });

  it('a loot piece reserved for a quest is in the pack, not in the review', () => {
    const pack = lootPack();
    setPack([...pack, { ...pack[0]!, id: 'reserved_1', reservedForQuest: true }]);
    const tree = mount();
    openSweep(tree, 'SELL ALL LOOT');
    expect(reviewRows(tree).length).toBe(LOOT_NAMES.length);
  });

  it('the rendered rows are exactly the plan rows, never a superset', () => {
    setPack([...gearPack(), ...lootPack()]);
    const tree = mount();
    openSweep(tree, 'SELL ALL COMMON GEAR');
    const planned = new Set(
      planCommonGearSale(
        inv().map((item) => ({ item, price: 1 })),
      ).rows.map((r) => r.item.name),
    );
    for (const row of reviewRows(tree)) {
      const n = rowName(row).replace(/\s+×\d+$/, '');
      expect([n, planned.has(n)]).toEqual([n, true]);
    }
  });
});

// ─────────────────────────── §K — the old doors still open ──────────────────
describe('§K individual and category selling are untouched', () => {
  it('a single row still opens its own sell sheet and sells that one piece', () => {
    setPack(gearPack());
    const tree = mount();
    press(tree, 'SELL');
    expandSections(tree);
    const name = GEAR_NAMES[0]!;
    press(tree, name);                       // the per-item row opens its sheet
    expect(has(tree, 'SELL TO DUVO')).toBe(true);
    pressExactLast(tree, 'SELL');            // ⚠ the sheet's own confirm, not the tab
    expect([name, qty(name)]).toEqual([name, 0]);
    for (const kept of GEAR_NAMES.slice(1)) expect([kept, qty(kept)]).toEqual([kept, 1]);
  });

  it('the category headings are still drawn on the SELL tab', () => {
    setPack(gearPack());
    const tree = mount();
    press(tree, 'SELL');
    expect(has(tree, 'SELL ALL COMMON GEAR')).toBe(true);
    expect(reviewRows(tree)).toHaveLength(0);
  });
});

// ─────────────────────────── §L — the pure authority ────────────────────────
describe('§L the review arithmetic, on its own', () => {
  const plan = {
    rows: [
      { item: { id: 'a', name: 'A', quantity: 1 }, price: 5 },
      { item: { id: 'b', name: 'B', quantity: 3 }, price: 4 },
      { item: { id: 'c', name: 'C' }, price: 2 },
    ],
  } as unknown as Parameters<typeof reviewTotals>[0];

  it('totals are quantity-aware and a missing quantity counts once', () => {
    expect(reviewTotals(plan, NOTHING_EXCLUDED)).toEqual({ count: 5, total: 19, excludedCount: 0 });
  });

  it('an excluded row leaves the count and the total by its whole stack', () => {
    expect(reviewTotals(plan, new Set(['b']))).toEqual({ count: 2, total: 7, excludedCount: 3 });
  });

  it('rows carry the line total and the live included flag, in plan order', () => {
    const rows = reviewRowsFor(plan, new Set(['b']));
    expect(rows.map((r) => [r.id, r.quantity, r.lineTotal, r.included]))
      .toEqual([['a', 1, 5, true], ['b', 3, 12, false], ['c', 1, 2, true]]);
  });

  it('toggleExclusion is reversible and never mutates its input', () => {
    const start = new Set(['a']);
    const off = toggleExclusion(start, 'b');
    expect([...start]).toEqual(['a']);
    expect([...off].sort()).toEqual(['a', 'b']);
    expect([...toggleExclusion(off, 'b')]).toEqual(['a']);
  });

  it('includedCandidates keys on the instance id, not the name', () => {
    expect(includedCandidates(plan, new Set(['b'])).map((r) => r.item.id)).toEqual(['a', 'c']);
  });

  it('reviewIsEmpty is true only when every row is vetoed', () => {
    expect(reviewIsEmpty(plan, NOTHING_EXCLUDED)).toBe(false);
    expect(reviewIsEmpty(plan, new Set(['a', 'b']))).toBe(false);
    expect(reviewIsEmpty(plan, new Set(['a', 'b', 'c']))).toBe(true);
  });
});

// ─────────────────────────── §M — the coin is in neither list ───────────────
describe('§M the Worn Tartarian Coin is in neither review', () => {
  const coinRow = () => ({
    id: 'coin_1', name: COIN, kind: 'misc', rarity: 'Common', quantity: 8,
    tags: ['currency', 'metal', 'pre-flood'],
  });

  it('the loot plan does not contain it', () => {
    const rows = [...lootPack(), coinRow()].map((item) => ({ item, price: 2 }));
    expect(planLootSale(rows as never).rows.map((r) => r.item.name)).not.toContain(COIN);
  });

  it('the loot review does not draw a row for it', () => {
    setPack([...lootPack(), coinRow()]);
    const tree = mount();
    openSweep(tree, 'SELL ALL LOOT');
    expect(reviewRows(tree).map(rowName).some((n) => n.startsWith(COIN))).toBe(false);
  });

  it('the gear review does not draw a row for it either', () => {
    setPack([...gearPack(), coinRow()]);
    const tree = mount();
    openSweep(tree, 'SELL ALL COMMON GEAR');
    expect(reviewRows(tree).map(rowName).some((n) => n.startsWith(COIN))).toBe(false);
  });

  it('and it survives a confirmed loot sweep untouched', () => {
    setPack([...lootPack(), coinRow()]);
    const tree = mount();
    openSweep(tree, 'SELL ALL LOOT');
    press(tree, `SELL ${confirmCount(tree)} FOR ${confirmTotal(tree)} TC`);
    expect(qty(COIN)).toBe(8);
  });
});
