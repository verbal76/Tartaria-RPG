/**
 * OTA-1736 - THE VENDOR IS A PROJECTION OF WHAT YOU CARRY, WEAR AND KNOW.
 *
 * Owner, from the device: the REINFORCE YOUR GEAR rows did not say which copy
 * was equipped and did not show the complete player-facing name, so two
 * similarly named instances could not be told apart before a permanent spend;
 * and learned workings/procedures could still look purchasable.
 *
 * ⚠⚠⚠ ONE CAUSE, TWO SYMPTOMS. The vendor screen was APPROXIMATING player and
 * item state instead of projecting it:
 *   - the reinforcement rows built a name from bare `item.name` and used the
 *     equipment authority to SORT and never to LABEL, because the inventory's
 *     name / worn-where / hold-label logic lived as closures inside
 *     InventoryScreen's render body where no other screen could reach it;
 *   - a Procedure Text is appended to `vendor.offers` ONCE at scene build and
 *     the shelf is a persisted snapshot, so a learned text stayed on the BUY
 *     list, tappable, refused only by a log line the screen never shows.
 *
 * ⚠ THE REPAIR IS A BOUNDARY, NOT TWO PATCHES. `app/engine/itemIdentity.ts`
 * holds the extracted (verbatim) name / equipped-where / hold-label authority
 * and the inventory now CALLS it; `shelfKnowledge` in vendors.ts answers "is
 * this shelf row knowledge the character already has" and BOTH the screen
 * (✓ KNOWN, disabled) and `buyFromVendor` (refuse before the purse) read it.
 * Recipes were already a live projection of `knownRecipes` (OTA-1731).
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

import { useGameStore, withTechniqueTextOffer } from '../app/state/gameStore';
import { getRaces, getFactions } from '../app/engine/character';
import { between, expectAbsent } from '../test-utils/srcBlock';
import { instanceDisplayName, equippedWhereLabel, holdLabelFor } from '../app/engine/itemIdentity';
import { shelfKnowledge } from '../app/engine/vendors';
import { techniqueForFaction, techniqueTextName, techniqueTextPrice } from '../app/engine/aetherTechniques';
import { vendorRecipeMenu, recipeIsUnlockedFor } from '../app/engine/recipeDiscovery';
import { RECIPES, findRecipeByResult } from '../app/engine/crafting';
import type { VendorInstance } from '../app/engine/vendors';
import type { InventoryItem } from '../app/engine/types';

jest.setTimeout(240000);
const flush = () => new Promise((r) => setTimeout(r, 0));
const W = (s: string) => process.stdout.write(s + '\n');
const S = () => useGameStore.getState();
const ROOT = join(__dirname, '..');
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), 'utf8');

const stall = (over: Partial<VendorInstance> = {}): VendorInstance =>
  ({ id: 'probe_stall', name: 'Duvo', title: 'trader', faction: null, offers: [], ...over } as unknown as VendorInstance);
async function boot(tc = 5000): Promise<void> {
  const st = useGameStore;
  await st.getState().hydrate();
  await st.getState().startNewGame({ name: 'Probe', raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
  st.getState().skipTutorial?.();
  if (st.getState().storyIntro) st.getState().dismissStoryIntro();
  const p = st.getState().player!;
  st.setState({ player: { ...p, tc, inventory: [] }, tutorialStep: null } as never);
  await flush();
}
function setScene(v: VendorInstance): void {
  useGameStore.setState({ currentScene: { ...S().currentScene!, vendor: v, enemies: [], enemyHps: [] } } as never);
}
const inv = () => S().player!.inventory;
const byId = (id: string) => inv().find((i) => i.id === id)!;

const mounted: Array<ReturnType<typeof renderer.create>> = [];
afterEach(() => { while (mounted.length) { const t = mounted.pop()!; try { renderer.act(() => { t.unmount(); }); } catch { /* gone */ } } });
function textOf(n: TestNode): string {
  const walk = (x: unknown): string => typeof x === 'string' ? x : typeof x === 'number' ? String(x) : Array.isArray(x) ? x.map(walk).join('') : ((x as TestNode | null)?.children ? walk((x as TestNode).children) : '');
  return walk(n.children);
}
function openVendor() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { VendorScreen } = require('../app/screens/VendorScreen');
  let tree!: ReturnType<typeof renderer.create>;
  renderer.act(() => { tree = renderer.create(React.createElement(VendorScreen)); });
  mounted.push(tree);
  return { tree, all: () => tree.root.findAll(() => true).map(textOf).join('\n') };
}
const shows = (hay: string, needle: string) => hay.toUpperCase().includes(needle.toUpperCase());
/** Buttons (role=button) whose text contains `needle`, shortest first — the
 *  backdrop of the sheet carries no role, so it can never be matched. */
function buttons(tree: ReturnType<typeof renderer.create>, needle: string): TestNode[] {
  const seen = new Set<string>();
  return tree.root.findAll((n) => typeof n.props?.onPress === 'function' && n.props?.accessibilityRole === 'button' && shows(textOf(n), needle))
    .sort((a, b) => textOf(a).length - textOf(b).length)
    // ⚠ a TouchableOpacity is a composite AND a host node with the same props/text — one row, one entry
    .filter((n) => { const t = textOf(n); if (seen.has(t)) return false; seen.add(t); return true; });
}
/** BUY categories open collapsed (OTA-686); open every closed section header. */
function expandAll(tree: ReturnType<typeof renderer.create>): void {
  for (let pass = 0; pass < 3; pass++) {
    const closed = buttons(tree, '\u25b8');
    if (closed.length === 0) return;
    for (const h of closed) renderer.act(() => { (h.props.onPress as () => void)(); });
  }
}
function tap(tree: ReturnType<typeof renderer.create>, needle: string): void {
  const n = buttons(tree, needle)[0];
  if (!n) throw new Error(`no button containing ${JSON.stringify(needle)}`);
  renderer.act(() => { (n.props.onPress as () => void)(); });
}

// Two copies of one name. A is the interesting one: worn, coated, perked,
// already +1. B is the plain spare. Same base name, different everything else.
const BLADE_A = (): Record<string, unknown> => ({
  id: 'blade_A', name: 'Rusted Blade', kind: 'weapon', rarity: 'Common', quantity: 1, tags: ['weapon'],
  durability: { current: 7, max: 28, baseMax: 23, reinforced: 1 },
  instanceStats: { statBonuses: [{ stat: 'dexterity', amount: 2 }] },
  coating: { label: 'Corrupted', dice: '1d4', kind: 'corruption' },
});
const BLADE_B = (): Record<string, unknown> => ({
  id: 'blade_B', name: 'Rusted Blade', kind: 'weapon', rarity: 'Common', quantity: 1, tags: ['weapon'],
  durability: { current: 20, max: 20, baseMax: 20, reinforced: 0 },
});
const stock = (): Record<string, unknown>[] => [
  { id: 'm1', name: 'Scrap Metal', kind: 'material', rarity: 'Common', quantity: 99, tags: [] },
  { id: 'm2', name: 'Stick', kind: 'material', rarity: 'Common', quantity: 60, tags: [] },
];

// ═══ 1. THE AUTHORITY IS ONE BODY, AND THE INVENTORY READS IT ═════════════

describe('OTA-1736 - one identity authority, read by both screens', () => {
  it('⚠⚠⚠ the inventory no longer carries its own copy of the three answers', () => {
    const INV = read('app', 'screens', 'InventoryScreen.tsx');
    expect(INV).toContain("from '../engine/itemIdentity'");
    // the closures are gone from the screen body; the engine has them
    expectAbsent(INV, 'const legacySlotsByName = new Map', 'equippedWhereLabel(player, item)');
    expectAbsent(INV, "if (findWeaponByName(item.name)?.style === 'two_handed') return 'two-handed';", 'equippedWhereLabel(player, item)');
    expectAbsent(INV, "`${[item.coating?.label, item.coating2?.label].filter(Boolean).join(' ')} ${item.name}`", 'instanceDisplayName(item)');
    const VEN = read('app', 'screens', 'VendorScreen.tsx');
    expect(VEN).toContain("from '../engine/itemIdentity'");
    expectAbsent(VEN, 'item.coating?.label', 'instanceDisplayName(item)');
  });

  it('⚠⚠ the three answers, by instance id', () => {
    const a = BLADE_A() as unknown as InventoryItem; const b = BLADE_B() as unknown as InventoryItem;
    const player = { inventory: [a, b], equipped: { main: 'Rusted Blade', mainId: 'blade_A' } } as never;
    expect(instanceDisplayName(a)).toBe('Corrupted Rusted Blade');
    expect(instanceDisplayName(b)).toBe('Rusted Blade');
    expect(equippedWhereLabel(player, a)).toBe('main hand');
    expect(equippedWhereLabel(player, b)).toBe('');           // same NAME as the held one — not equipped
    expect(holdLabelFor(a)).toBe('One-handed');
  });
});

// ═══ 2. DUPLICATE INSTANCES AT THE ANVIL — the owner's regression ══════════

describe('OTA-1736 - two Rusted Blades, one worn: the row, the sheet and the spend all name the instance', () => {
  it('⚠⚠⚠ both appear, each with its own identity, and only the worn one reads EQUIPPED', async () => {
    await boot(5000);
    useGameStore.setState({ player: { ...S().player!, inventory: [BLADE_A(), BLADE_B(), ...stock()], equipped: { main: 'Rusted Blade', mainId: 'blade_A' } } } as never);
    setScene(stall());
    const { tree } = openVendor();
    const rows = buttons(tree, 'Rusted Blade').filter((n) => shows(textOf(n), 'in your pack') || shows(textOf(n), 'EQUIPPED'));
    expect(rows).toHaveLength(2);
    const [rowA, rowB] = [rows.find((r) => shows(textOf(r), 'Corrupted'))!, rows.find((r) => !shows(textOf(r), 'Corrupted'))!];
    const tA = textOf(rowA); const tB = textOf(rowB);
    W(`  row A: ${tA}`); W(`  row B: ${tB}`);
    // A — complete identity
    for (const need of ['Corrupted Rusted Blade', 'EQUIPPED (main hand)', 'Common +1', '7/28', 'DEX +2', '1d6', 'One-handed', '+1d4 corruption', '300 TC']) {
      expect({ need, present: shows(tA, need) }).toEqual({ need, present: true });
    }
    // B — plain, in the pack, first rung
    for (const need of ['Rusted Blade', 'in your pack', '20/20', '140 TC', 'One-handed']) {
      expect({ need, present: shows(tB, need) }).toEqual({ need, present: true });
    }
    expect(shows(tB, 'EQUIPPED')).toBe(false);
    expect(shows(tB, 'Corrupted')).toBe(false);
    expect(shows(tB, 'Common +')).toBe(false);
  });

  it('⚠⚠⚠ selecting the SPARE reinforces the spare — the worn copy is untouched, and stays worn', async () => {
    await boot(5000);
    useGameStore.setState({ player: { ...S().player!, inventory: [BLADE_A(), BLADE_B(), ...stock()], equipped: { main: 'Rusted Blade', mainId: 'blade_A' } } } as never);
    setScene(stall());
    const { tree, all } = openVendor();
    const aBefore = JSON.stringify(byId('blade_A'));
    tap(tree, '140 TC');                                   // B's rung — A's is 300
    const sheet = all();
    // ⚠ the sheet's FIRST line is the instance and where it is
    expect(shows(sheet, 'Rusted Blade — in your pack')).toBe(true);
    expect(shows(sheet, 'Reinforce Rusted Blade to +1')).toBe(true);
    // ⚠ the rows are still on screen behind the sheet, so the negatives are on the
    //   sheet's OWN identity line (the em-dash form exists nowhere else)
    expect(shows(sheet, 'Corrupted Rusted Blade —')).toBe(false);
    expect(shows(sheet, 'Reinforce Corrupted Rusted Blade')).toBe(false);
    tap(tree, 'Reinforce for 140 TC'); await flush();
    // ⚠ THE PROOF THAT THE ID TRAVELLED, NOT THE NAME: reinforceWithVendor's
    //   NAME resolution prefers the EQUIPPED copy. Had the name gone through,
    //   A would have changed. B did.
    expect(byId('blade_B').durability!.reinforced).toBe(1);
    expect(byId('blade_B').durability!.max).toBe(25);
    expect(JSON.stringify(byId('blade_A'))).toBe(aBefore);
    expect(S().player!.equipped?.mainId).toBe('blade_A');
    W(`  spare → +1 (${byId('blade_B').durability!.current}/${byId('blade_B').durability!.max}); worn copy unchanged and still main hand`);
  });

  it('⚠⚠⚠ selecting the WORN copy names it as worn, reinforces only it, and it stays worn', async () => {
    await boot(5000);
    useGameStore.setState({ player: { ...S().player!, inventory: [BLADE_A(), BLADE_B(), ...stock()], equipped: { main: 'Rusted Blade', mainId: 'blade_A' } } } as never);
    setScene(stall());
    const { tree, all } = openVendor();
    const bBefore = JSON.stringify(byId('blade_B'));
    tap(tree, 'Corrupted Rusted Blade');
    const sheet = all();
    expect(shows(sheet, 'Corrupted Rusted Blade — EQUIPPED (main hand)')).toBe(true);
    expect(shows(sheet, 'Reinforce Corrupted Rusted Blade to +2')).toBe(true);
    tap(tree, 'Reinforce for 300 TC'); await flush();
    expect(byId('blade_A').durability!.reinforced).toBe(2);
    expect(JSON.stringify(byId('blade_B'))).toBe(bBefore);
    expect(S().player!.equipped?.mainId).toBe('blade_A');
    expect(equippedWhereLabel(S().player!, byId('blade_A'))).toBe('main hand');
    // and the success sheet names the same instance
    expect(shows(all(), 'Corrupted Rusted Blade reinforced')).toBe(true);
  });
});

// ═══ 3. WHAT THE CHARACTER KNOWS IS NOT FOR SALE ══════════════════════════

describe('OTA-1736 - a learned procedure text is projected, everywhere, exactly once', () => {
  const faction = () => getFactions()[0]!.id;
  const withRapport = () => useGameStore.setState({ player: { ...S().player!, completedFactionQuestIds: [`fq_${faction()}_rapport`], stats: { ...S().player!.stats, intelligence: 30 } } } as never);
  const teachingStall = () => withTechniqueTextOffer(stall({ id: 'roadside_teacher', faction: faction() }), S().player!)!;

  it('⚠⚠⚠ unknown → sold once → ✓ KNOWN, not a button, and never charged again', async () => {
    await boot(5000); withRapport();
    const tech = techniqueForFaction(faction()); const text = techniqueTextName(tech); const price = techniqueTextPrice(tech);
    const v = teachingStall();
    expect(v.offers.some((o) => o.itemName === text)).toBe(true);
    setScene(v);
    expect(shelfKnowledge(text, S().player!)).toEqual({ kind: 'technique', known: false });
    let ui = openVendor(); expandAll(ui.tree);
    expect(buttons(ui.tree, text).length).toBeGreaterThan(0);          // buyable row
    const tc0 = S().player!.tc;
    S().buyFromVendor(text, 1); await flush();
    expect(S().player!.tc).toBe(tc0 - price);
    expect(S().player!.knownTechniques).toEqual([tech.id]);
    // the shelf still carries the row (snapshot) — the projection must mark it
    expect(S().currentScene!.vendor!.offers.some((o) => o.itemName === text)).toBe(true);
    expect(shelfKnowledge(text, S().player!)).toEqual({ kind: 'technique', known: true });
    renderer.act(() => { ui.tree.unmount(); }); mounted.pop();
    ui = openVendor(); expandAll(ui.tree);
    const row = ui.tree.root.findAll((n) => n.props?.accessibilityRole === 'button' && shows(textOf(n), text))[0];
    expect(row).toBeDefined();
    expect(row!.props.disabled).toBe(true);
    expect(row!.props.onPress).toBeUndefined();
    expect(shows(textOf(row!), '✓ KNOWN')).toBe(true);
    expect(shows(textOf(row!), `${price} TC`)).toBe(false);
    // exactly once: the counter refuses through the same predicate, before the purse
    S().buyFromVendor(text, 1); await flush();
    expect(S().player!.tc).toBe(tc0 - price);
    expect(S().player!.knownTechniques).toEqual([tech.id]);
    W(`  ${text}: bought once for ${price}, then ✓ KNOWN and refused (TC ${tc0} → ${S().player!.tc})`);
  });

  it('⚠⚠ leave and return: a fresh shelf does not offer it; a stale shelf marks it', async () => {
    await boot(5000); withRapport();
    const tech = techniqueForFaction(faction()); const text = techniqueTextName(tech);
    useGameStore.setState({ player: { ...S().player!, knownTechniques: [tech.id] } } as never);
    expect(teachingStall().offers.some((o) => o.itemName === text)).toBe(false);   // beginScene would not add it
    const stale = stall({ id: 'roadside_other', faction: faction(), offers: [{ itemName: text, price: 999, quantity: 1 }] });
    setScene(stale);
    const { tree } = openVendor(); expandAll(tree);
    const row = tree.root.findAll((n) => n.props?.accessibilityRole === 'button' && shows(textOf(n), text))[0]!;
    expect(row.props.disabled).toBe(true);
    const tc0 = S().player!.tc;
    S().buyFromVendor(text, 1); await flush();
    expect(S().player!.tc).toBe(tc0);
  });

  it('⚠⚠ knowledge learned ANYWHERE is recognised — no vendor keeps its own list', async () => {
    await boot(5000); withRapport();
    const tech = techniqueForFaction(faction()); const text = techniqueTextName(tech);
    // learned by a storyline reward, never bought
    useGameStore.setState({ player: { ...S().player!, knownTechniques: [tech.id] } } as never);
    for (const id of ['roadside_a', 'roadside_b']) {
      setScene(stall({ id, faction: faction(), offers: [{ itemName: text, price: 500, quantity: 1 }] }));
      expect(shelfKnowledge(text, S().player!)?.known).toBe(true);
      const tc0 = S().player!.tc;
      S().buyFromVendor(text, 1); await flush();
      expect(S().player!.tc).toBe(tc0);
    }
  });

  it('⚠⚠ save → load keeps it known, and the shelf keeps saying so', async () => {
    await boot(5000); withRapport();
    const tech = techniqueForFaction(faction()); const text = techniqueTextName(tech);
    setScene(teachingStall());
    S().buyFromVendor(text, 1); await flush();
    await S().persist();
    await S().loadSlotIntoGame(S().activeSlotId!); await flush(); await flush();
    expect(S().player!.knownTechniques).toEqual([tech.id]);
    expect(shelfKnowledge(text, S().player!)?.known).toBe(true);
    const tc0 = S().player!.tc;
    S().buyFromVendor(text, 1); await flush();
    expect(S().player!.tc).toBe(tc0);
  });
});

describe('OTA-1736 - workings: the menu projects knownRecipes, whoever taught it', () => {
  const sliceWith = (result: string): number | null => {
    for (let seed = 0; seed < 200; seed++) if (vendorRecipeMenu(RECIPES, [], seed).some((r) => r.result === result)) return seed;
    return null;
  };

  it('⚠⚠⚠ bought at vendor A → vendor B shows ✓ KNOWN → neither sells it again', async () => {
    await boot(5000);
    const seedA = 7;
    const menuA = vendorRecipeMenu(RECIPES, S().player!.knownRecipes, seedA);
    const target = menuA[0]!;
    setScene(stall({ name: 'A' }));
    // buy through the real counter: it looks the name up in THIS vendor's menu
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const rd = require('../app/engine/recipeDiscovery') as typeof import('../app/engine/recipeDiscovery');
    const nameForSeed = 'A';
    const ownMenu = vendorRecipeMenu(RECIPES, S().player!.knownRecipes, rd.vendorSeed(nameForSeed));
    const pick = ownMenu[0]!;
    const tc0 = S().player!.tc;
    S().buyFromVendor(pick.result, 1); await flush();
    expect(S().player!.tc).toBe(tc0 - pick.price);
    expect(S().player!.knownRecipes).toContain(pick.result);
    expect(recipeIsUnlockedFor(findRecipeByResult(pick.result)!, S().player!.knownRecipes)).toBe(true);
    // any other vendor whose slice carries it marks it known
    const seedB = sliceWith(pick.result)!;
    expect(vendorRecipeMenu(RECIPES, S().player!.knownRecipes, seedB).find((r) => r.result === pick.result)!.known).toBe(true);
    // and the counter refuses a second sale at A, before the purse
    S().buyFromVendor(pick.result, 1); await flush();
    expect(S().player!.tc).toBe(tc0 - pick.price);
    expect(S().player!.knownRecipes!.filter((r) => r === pick.result)).toHaveLength(1);
    void target;
  });

  it('⚠⚠ a LEGACY save naming the working by its old name is known under the new one after load', async () => {
    await boot(5000);
    useGameStore.setState({ player: { ...S().player!, knownRecipes: ['Mire Maul'] } } as never);   // renamed → Golem Sledge
    await S().persist();
    await S().loadSlotIntoGame(S().activeSlotId!); await flush(); await flush();
    expect(S().player!.knownRecipes).toContain('Golem Sledge');
    const seed = sliceWith('Golem Sledge');
    if (seed != null) expect(vendorRecipeMenu(RECIPES, S().player!.knownRecipes, seed).find((r) => r.result === 'Golem Sledge')!.known).toBe(true);
    expect(recipeIsUnlockedFor(findRecipeByResult('Golem Sledge')!, S().player!.knownRecipes)).toBe(true);
  });

  it('⚠ the counter and the shelf refuse through ONE predicate', () => {
    const slice = read('app', 'state', 'slices', 'vendorSlice.ts');
    const techBranch = between(slice, 'const tech = AT.findTechniqueByTextName(itemName);', 'knownTechniques: [...(s.player.knownTechniques ?? []), tech.id]');
    expect(techBranch).toContain('shelfKnowledge(rowName, player)?.known');
    expectAbsent(techBranch, "(player.knownTechniques ?? []).includes(tech.id)", 'shelfKnowledge(rowName, player)');
  });
});
