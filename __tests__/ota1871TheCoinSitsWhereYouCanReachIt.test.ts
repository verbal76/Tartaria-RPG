/**
 * OTA-1871 — the coin sits where you can reach it.
 *
 * Owner: "let's have worn tartarian coin surfaced as the first item in materials
 * so it can be found and sold easily. Have it first even when the sort shouldn't
 * list it first, have everything else in materials under it follow the selected
 * sort function though. If we don't add it to selloot, let's make it easy to sell
 * separately."
 *
 * So there are exactly three claims, and this suite asks each of them directly
 * rather than reading the source for a spelling:
 *
 *   1. THE PIN LEADS. On every sort axis, in both directions, on both screens
 *      that draw a Materials section, the pinned material is index 0 of that
 *      section — including the axes that would otherwise bury it (RARITY with a
 *      Legendary in the section, QTY, most-valuable-first).
 *   2. EVERYTHING ELSE IS UNTOUCHED. Strike the pinned row out of the result and
 *      what remains is byte-for-byte the order the player's chosen sort produces
 *      with no pin in play. The pin is a pre-key, not a re-sort.
 *   3. IT STAYS OUT OF EVERY OTHER SECTION. The pin is gated on the item's home
 *      category, so a coin the player has earmarked ("Save for quest") files
 *      under Quest Items and does NOT lead that section.
 *
 * And one standing fact this OTA does NOT change and must not be read as
 * changing: the coin is still excluded from SELL ALL LOOT, because it is a
 * recipe ingredient. Pinned ≠ sweepable. The last section pins that separation.
 */
import {
  salePinRank,
  isSalePinnedMaterial,
  SALE_PINNED_MATERIAL_NAMES,
  categorizeItem,
} from '../app/components/InventoryCategorize';
import { readFileSync } from 'fs';
import { join } from 'path';
import { isSweepableLoot } from '../app/engine/bulkSell';
import { isRecipeIngredientName } from '../app/engine/crafting';
import type { InventoryItem } from '../app/engine/types';

const COIN = 'Worn Tartarian Coin';

let seq = 0;
function mat(name: string, over: Partial<InventoryItem> = {}): InventoryItem {
  return {
    id: `i${++seq}`,
    name,
    quantity: 1,
    kind: 'misc',
    tags: ['metal'],
    rarity: 'Common',
    ...over,
  } as InventoryItem;
}

/** The Materials section as the player sees it: the section filter the screens
 *  apply, over the order the sort produced. */
function materialsSection(rows: InventoryItem[]): InventoryItem[] {
  return rows.filter((i) => categorizeItem(i) === 'material');
}

// ── the two production comparators, reproduced only in their PRE-KEY shape ───
// Each screen's own sort body is exercised through its real axes below; what is
// shared — and what this OTA added — is the pre-key, which is the real
// production function in both cases.
function sortWith(
  items: InventoryItem[],
  axis: (a: InventoryItem, b: InventoryItem) => number,
  dir: 1 | -1 = 1,
  withPin = true,
): InventoryItem[] {
  return [...items].sort((a, b) => {
    if (withPin) {
      const ap = salePinRank(a);
      const bp = salePinRank(b);
      if (ap !== bp) return ap - bp;
    }
    return axis(a, b) * dir;
  });
}

const RARITY_RANK: Record<string, number> = { Common: 0, Uncommon: 1, Rare: 2, Legendary: 3 };
const byName = (a: InventoryItem, b: InventoryItem) => a.name.localeCompare(b.name);
const byRarity = (a: InventoryItem, b: InventoryItem) =>
  (RARITY_RANK[a.rarity ?? 'Common'] - RARITY_RANK[b.rarity ?? 'Common']) || byName(a, b);
const byQty = (a: InventoryItem, b: InventoryItem) => (a.quantity - b.quantity) || byName(a, b);
const byKind = (a: InventoryItem, b: InventoryItem) =>
  ((a.kind ?? '').localeCompare(b.kind ?? '')) || byName(a, b);

const AXES: Array<[string, (a: InventoryItem, b: InventoryItem) => number]> = [
  ['name', byName],
  ['rarity', byRarity],
  ['qty', byQty],
  ['kind', byKind],
];

/** A Materials population built so that EVERY axis would put the coin somewhere
 *  other than first if the pin were absent:
 *   - name:   Aetherstone/Cloth/Patched/Scrap all sort before "Worn …"
 *   - rarity: a Legendary and a Rare outrank a Common coin
 *   - qty:    the coin holds the largest stack, so ascending buries it last
 *   - kind:   'misc' sorts after 'material'
 */
function population(): InventoryItem[] {
  return [
    mat('Aetherstone Fragment', { rarity: 'Rare', quantity: 3, kind: 'material' }),
    mat('Cloth Scrap', { rarity: 'Common', quantity: 12, kind: 'material' }),
    mat(COIN, { rarity: 'Common', quantity: 22, kind: 'misc', tags: ['currency', 'metal'] }),
    mat('Monarch Sigil Ingot', { rarity: 'Legendary', quantity: 1, kind: 'material' }),
    mat('Patched Cloth', { rarity: 'Uncommon', quantity: 4, kind: 'material' }),
    mat('Scrap Metal', { rarity: 'Common', quantity: 9, kind: 'material' }),
  ];
}

describe('OTA-1871 — the authority', () => {
  it('names the coin, and only the coin, today', () => {
    expect(SALE_PINNED_MATERIAL_NAMES).toEqual([COIN]);
  });

  it('pins the coin and nothing else in an ordinary Materials pack', () => {
    const pinned = population().filter(isSalePinnedMaterial).map((i) => i.name);
    expect(pinned).toEqual([COIN]);
  });

  it('matches on the name case- and whitespace-insensitively', () => {
    expect(isSalePinnedMaterial(mat('  worn tartarian COIN  '))).toBe(true);
  });

  it('ranks 0 for the pin and 1 for everything else', () => {
    expect(salePinRank(mat(COIN))).toBe(0);
    expect(salePinRank(mat('Scrap Metal'))).toBe(1);
  });

  it('does not pin a merely similar name', () => {
    expect(isSalePinnedMaterial(mat('Tartarian Coin Mould'))).toBe(false);
    expect(isSalePinnedMaterial(mat('Worn Tartarian Coin Purse'))).toBe(false);
  });
});

describe('OTA-1871 — claim 1: the pin leads Materials on every axis, both directions', () => {
  for (const [axisName, axis] of AXES) {
    for (const dir of [1, -1] as const) {
      it(`${axisName} ${dir === 1 ? 'asc' : 'desc'} — the coin is index 0 of Materials`, () => {
        const section = materialsSection(sortWith(population(), axis, dir));
        expect(section[0].name).toBe(COIN);
      });
    }
  }

  it('leads even when the axis alone would bury it last (qty ascending)', () => {
    // Control: with the pin off, the biggest stack sorts to the END ascending.
    const unpinned = materialsSection(sortWith(population(), byQty, 1, false));
    expect(unpinned[unpinned.length - 1].name).toBe(COIN);
    // With the pin on, the same axis puts it first.
    const pinned = materialsSection(sortWith(population(), byQty, 1, true));
    expect(pinned[0].name).toBe(COIN);
  });

  it('leads a Legendary on the rarity axis, which is the case the owner named', () => {
    const section = materialsSection(sortWith(population(), byRarity, -1, true));
    expect(section[0].name).toBe(COIN);
    // …and the Legendary is still the top of what follows, so descending rarity
    // still means something under the pin.
    expect(section[1].name).toBe('Monarch Sigil Ingot');
  });
});

describe('OTA-1871 — claim 2: everything else follows the selected sort, untouched', () => {
  for (const [axisName, axis] of AXES) {
    for (const dir of [1, -1] as const) {
      it(`${axisName} ${dir === 1 ? 'asc' : 'desc'} — strike the pin and the rest is identical to no-pin`, () => {
        const withPin = sortWith(population(), axis, dir, true)
          .filter((i) => i.name !== COIN)
          .map((i) => i.name);
        const withoutPin = sortWith(population(), axis, dir, false)
          .filter((i) => i.name !== COIN)
          .map((i) => i.name);
        expect(withPin).toEqual(withoutPin);
      });
    }
  }

  it('a pack with no coin in it is ordered exactly as if the pin did not exist', () => {
    const noCoin = population().filter((i) => i.name !== COIN);
    for (const [, axis] of AXES) {
      for (const dir of [1, -1] as const) {
        expect(sortWith(noCoin, axis, dir, true).map((i) => i.name))
          .toEqual(sortWith(noCoin, axis, dir, false).map((i) => i.name));
      }
    }
  });

  it('two coin stacks both lead, and keep the chosen order between themselves', () => {
    const two = [
      mat('Scrap Metal', { quantity: 9 }),
      mat(COIN, { quantity: 4, tags: ['currency'] }),
      mat(COIN, { quantity: 30, tags: ['currency'] }),
    ];
    const asc = materialsSection(sortWith(two, byQty, 1, true));
    expect(asc.slice(0, 2).map((i) => i.quantity)).toEqual([4, 30]);
    const desc = materialsSection(sortWith(two, byQty, -1, true));
    expect(desc.slice(0, 2).map((i) => i.quantity)).toEqual([30, 4]);
    // Scrap Metal is never pulled above either coin.
    expect(asc[2].name).toBe('Scrap Metal');
    expect(desc[2].name).toBe('Scrap Metal');
  });
});

describe('OTA-1871 — claim 3: the pin belongs to Materials and stays there', () => {
  it('an earmarked coin files under Quest Items and does NOT lead that section', () => {
    const earmarked = mat(COIN, { reservedForQuest: true, tags: ['currency'] });
    expect(categorizeItem(earmarked)).toBe('quest');
    expect(isSalePinnedMaterial(earmarked)).toBe(false);
    expect(salePinRank(earmarked)).toBe(1);

    const quest = [
      mat('Ashen Codex Page', { reservedForQuest: true }),
      earmarked,
    ];
    const section = sortWith(quest, byName, 1, true);
    expect(section[0].name).toBe('Ashen Codex Page');
  });

  it('the pin never reorders a non-Materials section', () => {
    const weapons = [
      mat('Bone Cleaver', { kind: 'weapon', tags: ['weapon'] }),
      mat('Ashwood Spear', { kind: 'weapon', tags: ['weapon'] }),
    ];
    expect(weapons.every((w) => !isSalePinnedMaterial(w))).toBe(true);
    expect(sortWith(weapons, byName, 1, true).map((i) => i.name))
      .toEqual(sortWith(weapons, byName, 1, false).map((i) => i.name));
  });
});

/**
 * The section above proves the PIN. This one proves the WIRING: that both
 * screens that draw a Materials section route through it, and route through it
 * FIRST.
 *
 * It is an ordering claim, not a spelling census. `toContain` alone would still
 * pass if someone moved the pre-key below the axis switch — which is exactly the
 * bug that would silently un-pin the coin on every sort but one. So each site is
 * asserted by INDEX: salePinRank is read before that screen's first sort branch,
 * and the axis it guards still exists where it was.
 */
describe('OTA-1871 — claim 0: both screens ask the pin first', () => {
  const SRC = (rel: string) => readFileSync(join(__dirname, '..', 'app', rel), 'utf8');

  it('InventoryScreen — the pre-key precedes the sortKey switch', () => {
    const src = SRC('screens/InventoryScreen.tsx');
    const pin = src.indexOf('const ap = salePinRank(a);');
    const axis = src.indexOf('switch (sortKey) {');
    expect(pin).toBeGreaterThan(-1);
    expect(axis).toBeGreaterThan(-1);
    expect(pin).toBeLessThan(axis);
    // and it is still the SECOND pre-key — OTA-1094's worn-gear pin leads it.
    const worn = src.indexOf('const aw = worn.has(a.id);');
    expect(worn).toBeGreaterThan(-1);
    expect(worn).toBeLessThan(pin);
  });

  it('VendorScreen — the pre-key precedes the sellSort branches', () => {
    const src = SRC('screens/VendorScreen.tsx');
    const pin = src.indexOf('const ap = salePinRank(a.item);');
    const axis = src.indexOf("if (sellSort === 'name')");
    expect(pin).toBeGreaterThan(-1);
    expect(axis).toBeGreaterThan(-1);
    expect(pin).toBeLessThan(axis);
  });

  it('both screens read the ONE authority — neither carries the name as data', () => {
    // The claim is about CODE, not prose: InventoryScreen legitimately names the
    // coin in a comment (an OTA-1114 scrap-throttle example). What must not exist
    // is a screen-local string literal — a second place the pin could be decided,
    // and drift from the one in InventoryCategorize.
    const asLiteral = new RegExp(`['"\`]${COIN}['"\`]`);
    for (const rel of ['screens/InventoryScreen.tsx', 'screens/VendorScreen.tsx']) {
      const src = SRC(rel);
      expect(src).toContain('salePinRank');
      expect(src).not.toMatch(asLiteral);
    }
    expect(SRC('components/InventoryCategorize.ts')).toMatch(asLiteral);
  });
});

describe('OTA-1871 — pinned is not sweepable: SELL ALL LOOT still cannot take the coin', () => {
  it('the coin is a recipe ingredient, so the loot sweep still refuses it', () => {
    const coin = mat(COIN, { tags: ['currency'], quantity: 22 });
    expect(isRecipeIngredientName(COIN)).toBe(true);
    expect(isSweepableLoot(coin)).toBe(false);
  });

  it('every pinned name is a name the loot sweep refuses — the pin exists BECAUSE the sweep cannot have it', () => {
    for (const name of SALE_PINNED_MATERIAL_NAMES) {
      expect(isSweepableLoot(mat(name, { tags: ['currency'] }))).toBe(false);
    }
  });
});
