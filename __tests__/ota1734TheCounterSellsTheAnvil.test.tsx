/**
 * OTA-1734 - THE PLAYER CAN ACTUALLY BUY THE REINFORCEMENT.
 *
 * OTA-1733 shipped the mechanic with no way in but a typed `reinforce <name>`
 * nobody is told about - the same shape the workings were in before OTA-812.
 *
 * Owner: *"Do not create another reinforcement or durability implementation.
 * reinforceWithVendor and the existing durability object are authoritative...
 * The preview/confirmation must use the same pricing and durability authorities
 * as the actual transaction. Do not duplicate the pricing calculation in UI
 * code... Audit the existing vendor/service UI first and use its established
 * interaction pattern."*
 *
 * WHAT WAS BUILT, and why each piece is where it is:
 *
 * - `reinforceQuote(item)` in durability.ts is the ONE sum. It answers refusal,
 *   step, coin, materials and the resulting durability - and `to` is not
 *   arithmetic performed anywhere, it is `reinforceItem`'s own output. Both the
 *   screen and `reinforceWithVendor` read it, so a shown price and a charged
 *   price cannot be two numbers.
 *
 * - The screen reuses the WORKINGS TO LEARN pattern exactly: a collapsible
 *   section of `offerRow`s, the ONE shared `pending` confirm sheet, and a maxed
 *   row that reads as finished and does not act (OTA-1731's rule, OTA-220's).
 *
 * - `reinforceWithVendor` gained an OPTIONAL `itemId`, which is not a second
 *   implementation but the same one told WHICH COPY. Two blades at +0 and +2 are
 *   two rows; picking by name alone could only ever reach one of them.
 *
 * - The card says `Common +1` on the chip that already carries the rarity. A new
 *   chip would be a new wrap point in Row 1 - the row OTA-1727 was called in to
 *   unclog - and " +1" cannot break away from the word it is appended to.
 *
 * ⚠ THE DOUBLE-SUBMIT GUARD IS A REF, NOT STATE. `setPending(null)` is async, so
 *   a second tap in the same frame reads the stale `pending` and would buy a
 *   second level nobody asked for. doSell/doBuy live with that because a
 *   duplicate sale is at least visible; a duplicate reinforcement is a permanent
 *   paid-for change to one object.
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
// outliving Jest's teardown ("_bezier is not a function" as the graph unloads).
jest.mock('../app/state/accessibility', () => ({
  ...jest.requireActual('../app/state/accessibility'),
  useReduceMotion: () => true,
}));

// ⚠⚠ OTA-1255 — THE OTHER FOUR SCREENS HAD NEVER BEEN RENDERED BY A TEST.

import React from 'react';
import { readFileSync } from 'fs';
import { join } from 'path';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const renderer = require('react-test-renderer') as {
  act(cb: () => void | Promise<void>): void;
  create(el: React.ReactElement): { toJSON(): unknown; unmount(): void; root: { findAll(p: (n: TestNode) => boolean): TestNode[] } };
};
interface TestNode { props: Record<string, unknown>; children: unknown[] }

import { useGameStore } from '../app/state/gameStore';
import { getRaces, getFactions } from '../app/engine/character';
import {
  reinforceQuote, reinforceItem, reinforceLevel, REINFORCE_MAX_LEVEL,
} from '../app/engine/durability';
import { reinforceCostMaterials } from '../app/engine/scrapEngine';
import { WEAPONS } from '../app/engine/crafting';
import { between, expectAbsent } from '../test-utils/srcBlock';
import type { InventoryItem } from '../app/engine/types';
import type { VendorInstance } from '../app/engine/vendors';

jest.setTimeout(240000);
const flush = () => new Promise((r) => setTimeout(r, 0));
const W = (s: string) => process.stdout.write(s + '\n');

const stall = (): VendorInstance => ({
  id: 'roadside_forge_probe', name: 'Duvo', title: 'roadside smith', offers: [],
} as unknown as VendorInstance);

async function boot(tc = 5000): Promise<void> {
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
const find = (name: string) => inv().find((i) => i.name === name);
const qty = (name: string) => inv().find((i) => i.name === name)?.quantity ?? 0;
function setPack(items: Array<Record<string, unknown>>): void {
  const p = useGameStore.getState().player!;
  useGameStore.setState({ player: { ...p, inventory: items } } as never);
}

/** A worn, tempered blade — the ordinary case. `Rusted Blade` is a catalog row,
 *  so its step comes off the catalog base exactly as the design specified. */
const BLADE = (over: Record<string, unknown> = {}) => ({
  id: 'blade_1', name: 'Rusted Blade', kind: 'weapon', rarity: 'Common', quantity: 1,
  tags: ['weapon'], durability: { current: 7, max: 23, baseMax: 23, reinforced: 0 },
  ...over,
});
/** Materials in the quantities the first reinforcement of BLADE() asks for. */
function stockFor(item: InventoryItem, level = 0): Array<Record<string, unknown>> {
  return reinforceCostMaterials(item, level).map((m, n) => ({
    id: `mat_${n}`, name: m.name, kind: 'material', rarity: 'Common',
    quantity: m.quantity + 5, tags: [],
  }));
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
/* ⚠⚠ EVERY TREE IS UNMOUNTED, INCLUDING ONE A FAILING TEST LEFT BEHIND. A live
 *  VendorScreen still subscribed to the store re-renders when the NEXT test calls
 *  startNewGame — and the screen's early return ("no player yet") changes its hook
 *  count, so React throws "Rendered fewer hooks than expected" and the second test
 *  fails for the first test's reason. That misattribution is worse than the
 *  original failure, so teardown is unconditional rather than per-test. */
const mounted: Array<ReturnType<typeof renderer.create>> = [];
afterEach(() => {
  while (mounted.length) { const t = mounted.pop()!; try { renderer.act(() => { t.unmount(); }); } catch { /* already gone */ } }
});
function mount(Component: React.ComponentType): { tree: ReturnType<typeof renderer.create>; all: () => string } {
  let tree!: ReturnType<typeof renderer.create>;
  renderer.act(() => { tree = renderer.create(React.createElement(Component)); });
  mounted.push(tree);
  return { tree, all: () => tree.root.findAll(() => true).map(textOf).join('\n') };
}
function openVendor(): { tree: ReturnType<typeof renderer.create>; all: () => string } {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { VendorScreen } = require('../app/screens/VendorScreen');
  return mount(VendorScreen);
}
/* ⚠ BrandedModal UPPERCASES every title and every button label, so the sheet's
 *  text is compared case-insensitively. The row text is not transformed; one rule
 *  for both keeps the helpers from lying about which is which. */
const CI = (s2: string) => s2.toUpperCase();
function shows(haystack: string, needle: string): boolean { return CI(haystack).includes(CI(needle)); }
/** The tappable control whose rendered text contains `needle`.
 *
 *  ⚠⚠ ROLE-FILTERED AND SHORTEST-FIRST, and both halves were earned. BrandedModal
 *  wraps its overlay in a `TouchableWithoutFeedback onPress={onRequestClose}`
 *  whose subtree text is the WHOLE SHEET — so a naive "first node with an onPress
 *  containing this text" matched the dismiss backdrop and CLOSED the sheet while
 *  the test believed it had pressed Reinforce. Every failure then read as "the
 *  button does nothing", which is exactly the bug this suite exists to catch, and
 *  it would have been the instrument's. The backdrop carries no
 *  `accessibilityRole`; every real control here does. */
function pressable(tree: ReturnType<typeof renderer.create>, needle: string): TestNode | undefined {
  return tree.root
    .findAll((n) => typeof n.props?.onPress === 'function'
      && n.props?.accessibilityRole === 'button'
      && shows(textOf(n), needle))
    .sort((a, b) => textOf(a).length - textOf(b).length)[0];
}
function tap(tree: ReturnType<typeof renderer.create>, needle: string): void {
  const n = pressable(tree, needle);
  if (!n) throw new Error(`no tappable control containing ${JSON.stringify(needle)}`);
  renderer.act(() => { (n.props.onPress as () => void)(); });
}

// ═══ 1. ONE SUM, READ TWICE ═══════════════════════════════════════════════

describe('OTA-1734 - the preview and the transaction are one calculation', () => {
  it('⚠⚠⚠ what the quote SAYS is exactly what the counter CHARGES and WRITES', async () => {
    await boot(5000);
    const blade = BLADE();
    setPack([blade, ...stockFor(blade as unknown as InventoryItem)]);
    const q = reinforceQuote(find('Rusted Blade')!);
    const tcBefore = tcNow();
    const matBefore = q.materials.map((m) => qty(m.name));

    useGameStore.getState().reinforceWithVendor('Rusted Blade', 'blade_1');
    await flush();

    const after = find('Rusted Blade')!;
    W(`\n  quote: +${q.level}→+${q.nextLevel} · ${q.from.current}/${q.from.max} → ${q.to.current}/${q.to.max} · ${q.tc} TC · ${q.materials.map((m) => `${m.name}×${m.quantity}`).join(', ')}`);
    W(`  paid : ${tcBefore - tcNow()} TC · became ${after.durability!.current}/${after.durability!.max} (+${after.durability!.reinforced})`);
    expect(tcBefore - tcNow()).toBe(q.tc);
    expect(after.durability!.current).toBe(q.to.current);
    expect(after.durability!.max).toBe(q.to.max);
    expect(after.durability!.reinforced).toBe(q.nextLevel);
    q.materials.forEach((m, i) => expect(matBefore[i]! - qty(m.name)).toBe(m.quantity));
  });

  it('⚠ a quote on a MAXED item is a refusal, not a bill', () => {
    const maxed = BLADE({ durability: { current: 30, max: 38, baseMax: 23, reinforced: 3 } }) as unknown as InventoryItem;
    const q = reinforceQuote(maxed);
    expect(q.refusal).toMatch(/as far as it will go/);
    expect(q.tc).toBe(0);
    expect(q.to).toEqual(q.from);
    expect(q.nextLevel).toBe(q.level);
  });

  it('⚠⚠ THE SCREEN DOES NO ARITHMETIC — the ladders are not in the UI at all', () => {
    const src = readFileSync(join(__dirname, '..', 'app', 'screens', 'VendorScreen.tsx'), 'utf8');
    expect(src).toContain('reinforceQuote(');
    // ⚠ canary: the window really is the reinforcement section, so an absence
    //   below cannot be the absence of the subject rather than of the ladder.
    const section = between(src, 'REINFORCE YOUR GEAR</Text>', 'const secKey = ');
    for (const ladder of ['REINFORCE_TC_BY_LEVEL', 'REINFORCE_STEP_FRACTION', 'reinforceStep(', 'reinforceTcCost(']) {
      expectAbsent(src, ladder, 'reinforceQuote(');
    }
    expect(section.length).toBeGreaterThan(0);
  });
});

// ═══ 2. THE COMPLETE PLAYER PATH, ON A REAL RENDER ════════════════════════

describe('OTA-1734 - vendor → choose → preview → confirm → changed once', () => {
  it('⚠⚠⚠ the whole path, then the card, then a save/reload', async () => {
    await boot(5000);
    const blade = BLADE();
    setPack([blade, ...stockFor(blade as unknown as InventoryItem)]);
    const q = reinforceQuote(find('Rusted Blade')!);
    const { tree, all } = openVendor();

    // — the row is on the screen, priced, with the ladder and both ceilings —
    const listed = all();
    expect(listed).toContain('REINFORCE YOUR GEAR');
    expect(listed).toContain('Rusted Blade');
    expect(listed).toContain(`${q.tc} TC`);
    // OTA-1736 — the ladder line reads `+0 → +1 of 3` now, beside the materials.
    expect(listed).toContain(`+0 \u2192 +1 of ${REINFORCE_MAX_LEVEL}`);
    expect(listed).toContain(`${q.from.current}/${q.from.max}`);
    expect(listed).toContain(`${q.to.current}/${q.to.max}`);
    W(`  row: Rusted Blade · +0 of 3 · ${q.from.current}/${q.from.max} → ${q.to.current}/${q.to.max} · ${q.tc} TC`);

    // — tapping it PREVIEWS and spends nothing —
    const tcAtRest = tcNow();
    tap(tree, `${q.tc} TC`);
    const sheet = all();
    expect(shows(sheet, `Reinforce Rusted Blade to +1`)).toBe(true);
    expect(shows(sheet, `Cost: ${q.tc} TC`)).toBe(true);
    for (const m of q.materials) expect(shows(sheet, `${m.name} ×${m.quantity}`)).toBe(true);
    expect(shows(sheet, `${q.from.current}/${q.from.max}`)).toBe(true);
    expect(shows(sheet, `${q.to.current}/${q.to.max}`)).toBe(true);
    // ⚠ the promise the arrow alone would misstate
    expect(shows(sheet, 'does not mend it')).toBe(true);
    expect(tcNow()).toBe(tcAtRest);

    // — confirming charges once and changes the weapon once —
    tap(tree, `Reinforce for ${q.tc} TC`);
    await flush();
    const after = find('Rusted Blade')!;
    expect(tcAtRest - tcNow()).toBe(q.tc);
    expect(after.durability!.reinforced).toBe(1);
    expect(after.durability!.max).toBe(q.to.max);

    // — and the success sheet names the new maximum —
    const done = all();
    expect(shows(done, 'Rusted Blade reinforced')).toBe(true);
    expect(shows(done, `+1 of ${REINFORCE_MAX_LEVEL}`)).toBe(true);
    expect(shows(done, `${q.from.max} → ${q.to.max}`)).toBe(true);
    W(`  success sheet: "${q.from.max} → ${q.to.max}"`);

    // — the CARD says Common +1 —
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { InventoryScreen } = require('../app/screens/InventoryScreen');
    const { tree: pack, all: packAll } = mount(InventoryScreen);
    const head = pack.root.findAll((n) => typeof n.props?.onPress === 'function' && textOf(n).includes('WEAPONS'))[0];
    if (head) renderer.act(() => { (head.props.onPress as () => void)(); });
    const cardText = packAll();
    expect(cardText).toContain('Rusted Blade');
    expect(cardText).toContain('Common +1');
    W('  card: "Common +1"');

    // — and it survives the disk —
    await useGameStore.getState().persist();
    await useGameStore.getState().hydrate();
    const reloaded = find('Rusted Blade')!;
    expect(reloaded.durability!.reinforced).toBe(1);
    expect(reloaded.durability!.max).toBe(q.to.max);
    expect(reloaded.durability!.baseMax).toBe(q.from.max);
    W(`  after reload: ${reloaded.durability!.current}/${reloaded.durability!.max} (+${reloaded.durability!.reinforced})`);
  });

  it('⚠⚠ CANCEL changes nothing — no coin, no materials, no level', async () => {
    await boot(5000);
    const blade = BLADE();
    setPack([blade, ...stockFor(blade as unknown as InventoryItem)]);
    const q = reinforceQuote(find('Rusted Blade')!);
    const before = { tc: tcNow(), dur: { ...find('Rusted Blade')!.durability! }, mats: q.materials.map((m) => qty(m.name)) };
    const { tree, all } = openVendor();
    tap(tree, `${q.tc} TC`);
    expect(shows(all(), 'Reinforce Rusted Blade to +1')).toBe(true);
    tap(tree, 'Cancel');
    expect(shows(all(), 'Reinforce Rusted Blade to +1')).toBe(false);
    expect(tcNow()).toBe(before.tc);
    expect(find('Rusted Blade')!.durability).toEqual(before.dur);
    q.materials.forEach((m, i) => expect(qty(m.name)).toBe(before.mats[i]));
  });

  it('⚠⚠⚠ DOUBLE-SUBMIT buys ONE level, not two', async () => {
    await boot(50000);
    const blade = BLADE();
    /* ⚠⚠ DELIBERATELY OVER-STOCKED, and the first cut of this test was NOT — it
     *  carried just enough for ONE reinforcement, so the second tap was refused
     *  for MATERIALS and the test passed with the guard deleted. It proved the
     *  ladder's cost escalation, not the latch. Purse and stock are now far past
     *  what a second level costs, so the ONLY thing that can stop the second tap
     *  is the thing under test. */
    setPack([blade, ...stockFor(blade as unknown as InventoryItem).map((m) => ({ ...m, quantity: 999 }))]);
    const q = reinforceQuote(find('Rusted Blade')!);
    const tcBefore = tcNow();
    const { tree } = openVendor();
    tap(tree, `${q.tc} TC`);
    const btn = pressable(tree, `Reinforce for ${q.tc} TC`)!;
    expect(btn).toBeDefined();
    // ⚠ TWO PRESSES ON THE SAME HANDLER, back to back, exactly as a double tap
    //   delivers them: `pending` has not re-rendered between them.
    renderer.act(() => {
      (btn.props.onPress as () => void)();
      (btn.props.onPress as () => void)();
    });
    await flush();
    const after = find('Rusted Blade')!;
    W(`  two taps → +${after.durability!.reinforced}, paid ${tcBefore - tcNow()} TC (one level costs ${q.tc})`);
    expect(after.durability!.reinforced).toBe(1);
    expect(tcBefore - tcNow()).toBe(q.tc);
  });
});

// ═══ 3. THE REFUSALS ══════════════════════════════════════════════════════

describe('OTA-1734 - the sheet names the obstacle instead of failing quietly', () => {
  it('⚠⚠ NOT ENOUGH TC — titled, quantified, and no live Reinforce button', async () => {
    await boot(0);
    const blade = BLADE();
    setPack([blade, ...stockFor(blade as unknown as InventoryItem)]);
    const q = reinforceQuote(find('Rusted Blade')!);
    const { tree, all } = openVendor();
    tap(tree, `${q.tc} TC`);
    const sheet = all();
    expect(shows(sheet, 'Not enough TC')).toBe(true);
    expect(shows(sheet, `You are ${q.tc} TC short`)).toBe(true);
    // ⚠ OTA-1307's rule: a button that can only be refused is a dead control.
    expect(pressable(tree, `Reinforce for ${q.tc} TC`)).toBeUndefined();
    expect(find('Rusted Blade')!.durability!.reinforced).toBe(0);
  });

  it('⚠⚠ NOT ENOUGH MATERIALS — the shortfall is named by item and count', async () => {
    await boot(5000);
    const blade = BLADE();
    setPack([blade]);                                   // coin but no stock
    const q = reinforceQuote(find('Rusted Blade')!);
    expect(q.materials.length).toBeGreaterThan(0);
    const { tree, all } = openVendor();
    tap(tree, `${q.tc} TC`);
    const sheet = all();
    expect(shows(sheet, 'Not enough materials')).toBe(true);
    expect(shows(sheet, `You are short ${q.materials[0]!.name} ×${q.materials[0]!.quantity}`)).toBe(true);
    expect(pressable(tree, `Reinforce for ${q.tc} TC`)).toBeUndefined();
    expect(tcNow()).toBe(5000);
  });

  it('⚠⚠⚠ AN ALREADY-+3 WEAPON stays on the list, reads as finished, and does not act', async () => {
    await boot(5000);
    setPack([BLADE({ durability: { current: 30, max: 38, baseMax: 23, reinforced: 3 } })]);
    const { tree, all } = openVendor();
    const listed = all();
    // ⚠ OTA-1731's rule: an ABSENCE cannot carry the meaning "this one is done".
    expect(listed).toContain('Rusted Blade');
    expect(listed).toContain('✓ +3 MAX');
    // OTA-1736 — a maxed row carries its level on the rarity chip (`Common +3`); the
    // ladder line is for a rung that can still be bought.
    expect(listed).toContain('Common +3');
    // and it is not a control — no confirm sheet can be opened from it
    const row = tree.root.findAll((n) => textOf(n).includes('✓ +3 MAX') && n.props?.accessibilityRole === 'button')[0];
    expect(row).toBeDefined();
    expect(row!.props.disabled).toBe(true);
    expect(row!.props.onPress).toBeUndefined();
    W('  +3 row: shown, greyed, ✓ +3 MAX, not tappable');
  });

  it('⚠ the ceiling really is 3 — a fourth is refused by the engine as well', async () => {
    await boot(50000);
    let it = BLADE() as unknown as InventoryItem;
    for (let n = 0; n < 3; n++) it = reinforceItem(it);
    expect(reinforceLevel(it)).toBe(3);
    expect(reinforceItem(it)).toBe(it);                 // identity — no change at all
    expect(reinforceQuote(it).refusal).toBeTruthy();
  });
});

// ═══ 4. THE AWKWARD ITEMS ═════════════════════════════════════════════════

describe('OTA-1734 - fused, generated, and consigned copies', () => {
  const FUSED = () => ({
    id: 'fused_1', name: 'Crucible Oddity', kind: 'weapon', rarity: 'Rare', quantity: 1,
    tags: ['weapon'], durability: { current: 12, max: 40, baseMax: 40, reinforced: 0 },
    uniqueStats: { name: 'Crucible Oddity', kind: 'weapon', rarity: 'Rare', damageDice: '2d6', durability: { current: 40, max: 40 } },
  });

  it('⚠⚠⚠ A FUSED WEAPON reinforces off its OWN roll — no catalog lookup', async () => {
    await boot(5000);
    const fused = FUSED();
    setPack([fused, ...stockFor(fused as unknown as InventoryItem)]);
    const q = reinforceQuote(find('Crucible Oddity')!);
    // OTA-705: a fused name is never looked up in the catalog, so its own
    // baseMax is the base the 20% comes off.
    expect(q.step).toBe(Math.max(1, Math.round(40 * 0.2)));
    const { tree, all } = openVendor();
    expect(all()).toContain('Crucible Oddity');
    tap(tree, `${q.tc} TC`);
    tap(tree, `Reinforce for ${q.tc} TC`);
    await flush();
    const after = find('Crucible Oddity')!;
    W(`  fused: 12/40 → ${after.durability!.current}/${after.durability!.max} (+${after.durability!.reinforced})`);
    expect(after.durability!.max).toBe(48);
    expect(after.durability!.current).toBe(20);         // OTA-1654 — same points missing
    // ⚠ the frozen mint-time copy is NOT the live durability and is not written
    expect(after.uniqueStats!.durability!.max).toBe(40);
  });

  it('⚠⚠ A GENERATED WEAPON — a name the catalog has never heard of — still works', async () => {
    await boot(5000);
    const made = {
      id: 'gen_1', name: 'Kettleworks Prototype Mk II', kind: 'weapon', rarity: 'Uncommon',
      quantity: 1, tags: ['weapon'], durability: { current: 9, max: 30, baseMax: 30, reinforced: 0 },
    };
    expect((WEAPONS as Array<{ name: string }>).some((w) => w.name === made.name)).toBe(false);
    setPack([made, ...stockFor(made as unknown as InventoryItem)]);
    const q = reinforceQuote(find(made.name)!);
    const { tree, all } = openVendor();
    expect(all()).toContain(made.name);
    tap(tree, `${q.tc} TC`);
    tap(tree, `Reinforce for ${q.tc} TC`);
    await flush();
    const after = find(made.name)!;
    W(`  generated: 9/30 → ${after.durability!.current}/${after.durability!.max} (+1), step ${q.step}`);
    expect(after.durability!.reinforced).toBe(1);
    expect(after.durability!.max).toBe(30 + q.step);
  });

  it('⚠⚠⚠ SOLD AND BOUGHT BACK, the reinforcement comes home with it (OTA-1732)', async () => {
    await boot(5000);
    const blade = BLADE();
    setPack([blade, ...stockFor(blade as unknown as InventoryItem)]);
    const q = reinforceQuote(find('Rusted Blade')!);
    useGameStore.getState().reinforceWithVendor('Rusted Blade', 'blade_1');
    await flush();
    const strengthened = { ...find('Rusted Blade')! };
    expect(strengthened.durability!.reinforced).toBe(1);

    useGameStore.getState().sellToVendor('Rusted Blade', 'blade_1'); await flush();
    expect(find('Rusted Blade')).toBeUndefined();
    // ⚠ through the disk as well, because the shelf is persisted with the scene
    await useGameStore.getState().persist();
    await useGameStore.getState().hydrate();
    useGameStore.getState().buyFromVendor('Rusted Blade', 1); await flush();

    const home = find('Rusted Blade')!;
    W(`  sold +1 at ${strengthened.durability!.current}/${strengthened.durability!.max} · bought back ${home.durability!.current}/${home.durability!.max} (+${home.durability!.reinforced})`);
    expect(home.id).toBe(strengthened.id);
    expect(home.durability).toEqual(strengthened.durability);
    // and the ladder continues from where it stood, not from scratch
    expect(reinforceQuote(home).nextLevel).toBe(2);
    expect(reinforceQuote(home).to.max).toBe(q.from.max + q.step * 2);
  });

  it('⚠⚠ THE CATALOG IS NEVER TOUCHED — the row every other copy mints from is unchanged', async () => {
    const row = (WEAPONS as Array<{ name: string; baseDurability?: number }>).find((w) => w.name === 'Mud-Iron Cleaver')!;
    const before = row.baseDurability;
    await boot(50000);
    const c = { id: 'cleaver_1', name: 'Mud-Iron Cleaver', kind: 'weapon', rarity: 'Common', quantity: 1,
      tags: ['weapon'], durability: { current: 19, max: 19, baseMax: 19, reinforced: 0 } };
    setPack([c, ...stockFor(c as unknown as InventoryItem, 0).map((m) => ({ ...m, quantity: 999 }))]);
    for (let n = 0; n < 3; n++) { useGameStore.getState().reinforceWithVendor('Mud-Iron Cleaver', 'cleaver_1'); await flush(); }
    expect(find('Mud-Iron Cleaver')!.durability!.reinforced).toBe(3);
    expect(row.baseDurability).toBe(before);
    W(`  catalog Mud-Iron Cleaver baseDurability still ${String(before)} after three reinforcements of one copy`);
  });
});
