/**
 * OTA-1731 - THE PACK SORTS BY WHERE IT GOES, AND THE VENDOR ADMITS WHAT YOU OWN.
 *
 * Two owner asks, measured before either was written.
 *
 * 1. *"armor should also be split up into subcategories like the weapons, but just
 *    by what part of the body it is for, same as for the rings/amulets category."*
 *
 *    OTA-1683 already built the mechanism for Weapons (labelled runs inside one
 *    section). The authority chosen here is `validSlotsForItem` - the SAME function
 *    `slotFillLabelFor` calls to print "Head" / "Chest" on the row itself, and the
 *    one the equip router obeys - so a subsection heading can never disagree with
 *    the row underneath it, nor claim a slot the game will not use. It also
 *    resolves FUSED pieces off uniqueStats instead of a name lookup that misses.
 *
 *    Measured across the catalog first: 297 armour rows split head 77 / chest 60 /
 *    cloak 43 / hands 41 / feet 39 / legs 37, and 48 accessories split ring 28 /
 *    amulet 20 - with ZERO rows failing to resolve. There is no "Other" bucket in
 *    the data; one exists in the code anyway so a future oddity stays reachable
 *    rather than dropping out of the list.
 *
 * 2. *"ensure that if I have already bought a 'working to learn' I can see that I
 *    own it if someone tries to sell it to me again."*
 *
 *    A learned working VANISHED from the vendor's list - three rows became two -
 *    so an absence had to carry the meaning "you own this", which no absence can.
 *    The vendor genuinely still stocks it: OTA-802 made the menu a fixed seeded
 *    slice precisely so it cannot reroll. The row stays now and says ✓ KNOWN.
 *
 *    ⚠ AND IT MADE A DEAD MESSAGE LIVE. `buyFromVendor` reads the recipe list to
 *    find what you typed, then checks `knownRecipes.includes(...)` to say "You
 *    already know the X working." It read `vendorRecipeOffers`, which has ALREADY
 *    dropped everything you know - so that branch could never be true. Typing the
 *    name of a working you own fell through to the item lookup and answered
 *    "doesn't carry any X", which is the opposite of the truth.
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
import { ARMOR, RINGS, AMULETS, RECIPES } from '../app/engine/crafting';
import { categoryRuns, bodySubsectionOf, BODY_SUBSECTION_ORDER, categoriesForItem } from '../app/components/InventoryCategorize';
import { vendorRecipeMenu, vendorRecipeOffers, vendorSeed } from '../app/engine/recipeDiscovery';
import { validSlotsForItem } from '../app/engine/equipment';

jest.setTimeout(180000);
const flush = () => new Promise((r) => setTimeout(r, 0));
const W = (s: string) => process.stdout.write(s + '\n');
const item = (name: string, kind: string, rarity = 'Common', tags: string[] = []) =>
  ({ id: 'i_' + name.replace(/\W/g, ''), name, kind, rarity, quantity: 1, tags } as never);
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

// ===== 1. the split, on the whole catalog ================================

describe('OTA-1731 - armour and jewellery divide by body part', () => {
  it('⚠⚠⚠ EVERY armour and accessory row in the catalog resolves to a heading', () => {
    const tally = new Map<string, number>();
    let unplaced = 0;
    for (const [rows, kind, cat] of [[ARMOR, 'armor', 'armor'], [RINGS, 'relic', 'accessory'], [AMULETS, 'relic', 'accessory']] as const) {
      for (const r of rows as Array<{ name: string; rarity: string; tags?: string[] }>) {
        const it = item(r.name, kind, r.rarity, r.tags ?? []);
        if (!categoriesForItem(it).includes(cat as never)) continue;
        const sub = bodySubsectionOf(it);
        if (!sub) { unplaced++; continue; }
        tally.set(sub, (tally.get(sub) ?? 0) + 1);
      }
    }
    W('\nCATALOG BY BODY PART:');
    for (const s of BODY_SUBSECTION_ORDER) if (tally.get(s)) W(`   ${String(tally.get(s)).padStart(4)}  ${s}`);
    W(`   unplaced: ${unplaced}`);
    expect(unplaced).toBe(0);
    // the six armour slots and the two jewellery ones are all represented
    for (const s of BODY_SUBSECTION_ORDER) expect(tally.get(s) ?? 0).toBeGreaterThan(0);
  });

  it('⚠⚠ THE HEADING AND THE ROW LABEL COME FROM ONE AUTHORITY', () => {
    // slotFillLabelFor prints the row's own slot from validSlotsForItem; so does
    // bodySubsectionOf. A piece can never sit under "Head" and read "Chest".
    for (const a of (ARMOR as Array<{ name: string; rarity: string; tags?: string[] }>).slice(0, 60)) {
      const it = item(a.name, 'armor', a.rarity, a.tags ?? []);
      const slots = validSlotsForItem(it).map((x) => String(x).replace(/\d+$/, ''));
      expect(slots).toContain(bodySubsectionOf(it));
    }
  });

  it('⚠ a section with only ONE kind in it gets no sub-heading', () => {
    // A heading repeating what the section already says is noise.
    const onlyHead = [item('Rusted Helm', 'armor'), item('Bone Helm', 'armor')]
      .filter((i) => bodySubsectionOf(i) === 'head');
    const runs = categoryRuns('armor', onlyHead as never);
    expect(runs).toHaveLength(1);
    expect(runs[0]!.label).toBeNull();
  });

  it('⚠ weapons still divide by reach - the mechanism was reused, not replaced', () => {
    const w = [item('Stone Spear', 'weapon'), item('Rusted Blade', 'weapon')];
    const runs = categoryRuns('weapon', w as never);
    expect(runs.length).toBeGreaterThanOrEqual(1);
    expect(runs.map((r) => r.label).join('|')).toMatch(/Melee|Spears/);
  });

  it('⚠ a category with no subdivision returns one unlabelled run, as before', () => {
    const runs = categoryRuns('material', [item('Scrap Metal', 'material')] as never);
    expect(runs).toEqual([{ label: null, items: [expect.objectContaining({ name: 'Scrap Metal' })] }]);
  });
});

// ===== 2. the split, on a real render ====================================

describe('OTA-1731 - the headings reach the screen', () => {
  it('⚠⚠⚠ ARMOR and AMULETS & RINGS show body-part headings in the pack', async () => {
    await useGameStore.getState().hydrate();
    await useGameStore.getState().startNewGame({ name: '', raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id } as never);
    useGameStore.getState().skipTutorial?.();
    if (useGameStore.getState().storyIntro) useGameStore.getState().dismissStoryIntro();
    const pack = [
      ...(ARMOR as Array<{ name: string; rarity: string; slot: string; tags?: string[] }>)
        .filter((a, i, all) => all.findIndex((b) => b.slot === a.slot) === i)   // one per slot
        .map((a) => item(a.name, 'armor', a.rarity, a.tags ?? [])),
      item((RINGS as Array<{ name: string }>)[0]!.name, 'relic'),
      item((AMULETS as Array<{ name: string }>)[0]!.name, 'relic'),
    ];
    const p0 = useGameStore.getState().player!;
    useGameStore.setState({ player: { ...p0, inventory: pack }, tutorialStep: null } as never);
    await flush();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { InventoryScreen } = require('../app/screens/InventoryScreen');
    let tree!: ReturnType<typeof renderer.create>;
    renderer.act(() => { tree = renderer.create(React.createElement(InventoryScreen)); });
    // sections default COLLAPSED — open the two we are here for
    for (const want of ['ARMOR', 'AMULETS & RINGS']) {
      const h = tree.root.findAll((n) => typeof n.props?.onPress === 'function' && textOf(n).includes(want))[0];
      expect(h).toBeDefined();
      renderer.act(() => { (h!.props.onPress as () => void)(); });
    }
    const all = tree.root.findAll(() => true).map(textOf).join('\n');
    // ⚠ self-check FIRST: the sections really opened and the rows really rendered,
    //   so the heading assertions below cannot pass against an empty tree.
    const packNames = (pack as unknown as Array<{ name: string }>).map((i) => i.name);
    expect(all).toContain(packNames[0]!);
    expect(all).toContain(packNames[packNames.length - 1]!);
    for (const heading of ['HEAD ·', 'CHEST ·', 'HANDS ·', 'LEGS ·', 'FEET ·', 'CLOAKS ·']) {
      expect(all).toContain(heading);
    }
    expect(all).toContain('AMULETS ·');
    expect(all).toContain('RINGS ·');
    W('  render: armour shows all six body headings; jewellery shows Amulets and Rings');
    renderer.act(() => { tree.unmount(); });
  });
});

// ===== 3. the vendor admits what you own =================================

describe('OTA-1731 - a working you own is shown as owned', () => {
  const seed = vendorSeed('Road Hawker');

  it('⚠⚠⚠ THE MENU KEEPS THE ROW AND MARKS IT; the SALES LIST drops it', () => {
    const menu0 = vendorRecipeMenu(RECIPES, [], seed);
    expect(menu0.length).toBeGreaterThan(0);
    expect(menu0.every((r) => r.known === false)).toBe(true);
    const learned = menu0[0]!.result;
    const menu1 = vendorRecipeMenu(RECIPES, [learned], seed);
    // same three rows, same order — one of them now marked
    expect(menu1.map((r) => r.result)).toEqual(menu0.map((r) => r.result));
    expect(menu1.find((r) => r.result === learned)!.known).toBe(true);
    // and what the vendor will actually SELL shrinks, exactly as before
    expect(vendorRecipeOffers(RECIPES, [learned], seed).map((o) => o.result))
      .toEqual(menu0.map((r) => r.result).filter((n) => n !== learned));
  });

  it('⚠⚠ OTA-802 IS UNTOUCHED: the slice is still fixed and never rerolls', () => {
    const menu0 = vendorRecipeOffers(RECIPES, [], seed);
    const learned = menu0[0]!.result;
    const after = vendorRecipeOffers(RECIPES, [learned], seed);
    expect(after).toHaveLength(menu0.length - 1);
    // no NEW recipe slid into the gap
    for (const o of after) expect(menu0.map((x) => x.result)).toContain(o.result);
  });

  it('⚠ the sales list is DERIVED from the menu — one answer to "which three"', () => {
    const SRC = readFileSync(join(__dirname, '..', 'app', 'engine', 'recipeDiscovery.ts'), 'utf8');
    expect(SRC).toContain('return vendorRecipeMenu(allRecipes, knownRecipes, seed, count)');
    // the slice arithmetic exists once
    expect((SRC.match(/allDiscoverableRecipes\(allRecipes\);\s*\/\/ STABLE/g) ?? []).length).toBe(1);
  });

  it('⚠⚠⚠ AND THE REFUSAL IS REACHABLE NOW — the store can say "you already know it"', () => {
    const SLICE = readFileSync(join(__dirname, '..', 'app', 'state', 'slices', 'vendorSlice.ts'), 'utf8');
    // it looks the typed name up in the MENU, so the knownRecipes branch below can
    // actually be true; on vendorRecipeOffers it never could be.
    expect(SLICE).toContain('rd.vendorRecipeMenu(RECIPES, player.knownRecipes, rd.vendorSeed(scene.vendor.name))');
    expect(SLICE).toContain('You already know the ${rOffer.result} working.');
  });

  it('⚠ the screen shows the row as owned instead of deleting it', () => {
    const VS = readFileSync(join(__dirname, '..', 'app', 'screens', 'VendorScreen.tsx'), 'utf8');
    expect(VS).toContain('vendorRecipeMenu(RECIPES, player.knownRecipes, vendorSeed(vendor.name))');
    expect(VS).toContain("{o.known ? '✓ KNOWN' : `${o.price} TC`}");
    expect(VS).toContain('already in your book');
    // an owned row is not a button that opens a sheet the store will refuse
    expect(VS).toContain('disabled={o.known}');
    // and the duplicate known-filter the screen used to carry is gone
    expect(VS.includes(".filter((o) => !(player.knownRecipes ?? []).includes(o.result))")).toBe(false);
  });
});
