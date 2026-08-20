/**
 * OTA-1399 — SLICE 8: vendor, inventory and crafting leave gameStore.
 *
 * 19 actions, 2,233 lines, three slice files.
 *
 * ⚠⚠ THE PLAN SAID ONE SLICE. MEASURING SAID THREE — the sixth time in eight
 * slices that measuring has corrected the plan, and the second time it has split
 * a planned lump (slice 3 was the first).
 *
 *     vendor      666 lines,  8 module symbols
 *     inventory  1306 lines, 19 module symbols
 *     crafting    261 lines,  4 module symbols
 *
 *     inventory ∩ crafting = ∅
 *     vendor ∩ inventory   = 2   (freshInstanceId, statNowClause)
 *     vendor ∩ crafting    = 2   (recordTitleProgress, slotOfEquippedId)
 *
 * Slice 3 set the test: when two groups share no unexported dependency they are
 * two jobs that happened to be typed near each other, and moving them as one
 * lump produces a slice needing both sets and explaining neither. Here the
 * overlaps are two shared utilities out of eight, nineteen and four — near
 * enough to zero that the same conclusion holds, and each deps object is now an
 * honest readout of what its OWN job is coupled to rather than an average of
 * three.
 *
 * ⚠ THESE ARE STORE SLICES, NOT LEAVES — the first of that kind since slice 4.
 * Slices 5, 6 and 7 moved module-level code DOWN out of the store's
 * neighbourhood; these move store ACTIONS into `app/state/slices/`, keeping the
 * same object with the same keys and the same 473 importers. The distinction
 * matters for the test suites: a pin on a slice IS a pin on the store, which is
 * what `storeSource()` exists for, and this is the OTA where that helper finally
 * paid for itself — nineteen suites were re-pointed by swapping one read each.
 *
 * ⚠ NO MUTABLE STATE IN ANY OF THE THREE. Nothing was forced to travel, so the
 * compiler had nothing to refuse — the property that made slice 4 the largest
 * and mechanically safest move so far.
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { storeSource, sliceNames } from '../test-utils/storeSource';

const path = (...p: string[]) => join(__dirname, '..', ...p);
const src = (...p: string[]) => readFileSync(path(...p), 'utf8');

const store = src('app', 'state', 'gameStore.ts');
const vendor = src('app', 'state', 'slices', 'vendorSlice.ts');
const crafting = src('app', 'state', 'slices', 'craftingSlice.ts');
const inventory = src('app', 'state', 'slices', 'inventorySlice.ts');

const GROUPS: Array<[string, string, string[]]> = [
  ['vendor', vendor, ['buyFromVendor', 'sellToVendor', 'useVendorCrucible', 'repairWithVendor']],
  ['crafting', crafting, ['craftRecipe', 'craftRecipeBatch', 'fuseAtCrucible']],
  ['inventory', inventory, [
    'equipItem', 'unequipSlot', 'removeFromBandolier', 'useHealBatch', 'dropInventoryItem',
    'dropInventoryInstance', 'useInventoryItem', 'applyCoating', 'applyCoatingToArmor',
    'scrapInventoryItem', 'repairInventoryItem', 'salvageAllAmbient',
  ]],
];

describe('OTA-1399 — nineteen actions moved into three files', () => {
  it.each(GROUPS.flatMap(([g, body, names]) => names.map((n) => [g, n, body] as const)))(
    '%s: %s lives in the slice, not in gameStore',
    (_g, name, body) => {
      expect(body).toMatch(new RegExp(`^  (async )?${name}\\(`, 'm'));
      expect(store).not.toMatch(new RegExp(`^  (async )?${name}\\(`, 'm'));
    },
  );

  it('⚠ the store still declares all nineteen, so no consumer changes', () => {
    // 473 files import useGameStore. The whole value of the slice pattern is
    // that not one of them notices.
    for (const [, , names] of GROUPS) {
      for (const n of names) expect(store).toContain(`  ${n}: `);
    }
    for (const f of ['createVendorSlice', 'createCraftingSlice', 'createInventorySlice']) {
      expect(store).toContain(`...${f}(set, get, {`);
    }
  });

  it('⚠⚠ none of the three imports a VALUE from gameStore', () => {
    // The load-bearing rule. gameStore imports each slice to build the store; a
    // value import back is a cycle that resolves to `undefined` for whichever
    // module the bundler reaches second — on a device, in a path a unit test
    // that imports one side never runs.
    for (const [, body] of GROUPS) {
      for (const line of body.split('\n')) {
        if (!/from\s+['"]\.\.\/gameStore['"]/.test(line)) continue;
        expect(line.trim().startsWith('import type ')).toBe(true);
      }
    }
  });

  it('⚠ …and none of the three carries mutable state, which is why nothing forced the order', () => {
    for (const [, body] of GROUPS) expect(body).not.toMatch(/^let /m);
  });
});

describe('OTA-1399 — the three-way split is a measurement', () => {
  it('⚠⚠ inventory and crafting share NOTHING — that is why they are two files', () => {
    // Asserted structurally: no dep named by one appears in the other's object.
    const depsOf = (body: string): string[] =>
      [...body.matchAll(/^  (\w+): typeof Store\.\w+;$/gm)].map((m) => m[1] ?? '');
    const inv = new Set(depsOf(inventory));
    const cra = depsOf(crafting);
    expect(cra.length).toBeGreaterThan(0);
    expect(cra.filter((d) => inv.has(d))).toEqual([]);
  });

  it('⚠ the deps objects are honest — the biggest job has the biggest object', () => {
    const count = (body: string): number =>
      [...body.matchAll(/^  \w+: typeof Store\.\w+;$/gm)].length;
    expect(count(vendor)).toBeLessThan(count(inventory));
    expect(count(crafting)).toBeLessThan(count(vendor));
    expect(inventory).toContain('THE LARGEST OF THE THREE, AND THE MOST COUPLED');
  });

  it('⚠⚠ …and the inventory header NAMES the next move rather than hiding the number', () => {
    // Five of its nineteen deps are broad utilities with 30-95 call sites
    // elsewhere. Saying so is the difference between a measurement and an
    // excuse — and it is the shortlist for whatever comes after slice 9.
    expect(inventory).toContain('AND THE DEPS OBJECT NAMES THE NEXT MOVE');
    for (const util of ['advanceTime', 'spendStamina', 'makeRoomKey', 'freshInstanceId']) {
      expect(inventory).toContain(util);
    }
  });

  it('⚠ every dep is typed `typeof Store.fn`, so signatures cannot drift', () => {
    // Hand-written signatures would let gameStore change one and these files
    // keep compiling against the old shape. `import type * as` is fully erased,
    // so the exact types come across with no runtime coupling at all.
    for (const [, body] of GROUPS) {
      expect(body).toContain("import type * as Store from '../gameStore';");
    }
  });
});

describe('OTA-1399 — what travelled, and what went DOWN instead', () => {
  it('⚠ each slice took the knobs only it reads', () => {
    expect(vendor).toContain('const FENCE_STOLEN_CUT');
    expect(crafting).toContain('const FUSE_NAME_TIMEOUT_MS');
    expect(inventory).toContain('function hpAfterMaxChange(');
    for (const name of ['FENCE_STOLEN_CUT', 'FUSE_NAME_TIMEOUT_MS', 'hpAfterMaxChange']) {
      expect(store).not.toMatch(new RegExp(`^(export )?(const|function) ${name}\\b`, 'm'));
    }
  });

  it('⚠⚠ the one helper TWO slices shared went DOWN, not into either of them', () => {
    // `slotOfEquippedId` is used by the vendor counter and by crafting, and by
    // nothing else at all. Injecting it twice would have been two lies about
    // one coupling; putting it in either slice would have made the other import
    // a sibling slice. It is a pure lookup over SLOT_ID_KEY, and
    // app/engine/equipment.ts already owns that table — so that is where it went.
    const equip = src('app', 'engine', 'equipment.ts');
    expect(equip).toContain('export function slotOfEquippedId(');
    expect(equip).toContain('export const SLOT_ID_KEY');
    expect(store).not.toMatch(/^function slotOfEquippedId\(/m);
    for (const body of [vendor, crafting]) {
      expect(body).toContain("import { slotOfEquippedId } from '../../engine/equipment';");
    }
    expect(inventory).not.toContain('slotOfEquippedId');
  });

  it('⚠ SKYREACHER_CHART_NAMES stayed a DEP, and the reason is not laziness', () => {
    // It is derived from SKYREACHER_CHARTS, which stays. Moving the derived
    // constant would have dragged its parent along for one call site.
    expect(vendor).toContain('SKYREACHER_CHART_NAMES: typeof Store.SKYREACHER_CHART_NAMES;');
    expect(store).toMatch(/^export const SKYREACHER_CHART_NAMES/m);
  });
});

describe('OTA-1399 — the source pins, and the helper finally paying for itself', () => {
  it('⚠⚠ storeSource() was the right answer HERE, and was not for slices 5-7', () => {
    // A slice IS the store — same object, same keys, same 473 importers — so a
    // pin against "the store" is satisfied by the store plus its slices. Slices
    // 5-7 moved code DOWN to leaves that are NOT the store, which is why those
    // suites name their leaf directly and this one does not have to.
    const h = src('test-utils', 'storeSource.ts');
    expect(h).toContain('readdirSync(SLICE_DIR)');
    expect(h).not.toContain('narration');
    expect(h).not.toContain('diagnostics');
  });

  it('⚠⚠ the stale-pin guard got SHARPER, because slice 8 found a false positive', () => {
    // `expect(x).not.toContain(lit)` means the literal must NOT be there, so
    // "absent from gameStore, present in a slice" is the test passing. ota1005
    // pins that the bandolier cap site does no raw read; slice 8 moved a
    // legitimately different use of that same line into inventorySlice and the
    // guard called it rot. Exempting negative assertions keeps the guard worth
    // reading instead of teaching people to ignore it.
    const policy = src('__tests__', 'ota1392StoreSlices.test.ts');
    expect(policy).toContain('NEGATIVE ASSERTIONS ARE EXEMPT');
    expect(policy).toContain('if (m[1]) continue;');
  });

  it('⚠ there are seven slices now, and the policy suite covers all of them', () => {
    // ota1392 walks the directory rather than naming files, so all three of
    // this OTA's slices inherited the value-import rule, the wiring check and
    // the mutable-state rule without anyone extending a list.
    expect(sliceNames()).toEqual([
      'aiLifecycleSlice.ts',
      'bootSlice.ts',
      'craftingSlice.ts',
      'inventorySlice.ts',
      'persistSlice.ts',
      'slotSlice.ts',
      'vendorSlice.ts',
    ]);
    for (const f of sliceNames()) {
      expect(existsSync(path('app', 'state', 'slices', f))).toBe(true);
    }
  });
});

describe('OTA-1399 — eight slices in', () => {
  it('gameStore is under 39,700 lines', () => {
    // 45,050 → 44,891 → 44,816 → 44,160 → 43,542 → 43,281 → 42,956 → 41,650 → here.
    expect(store.split('\n').length).toBeLessThan(39700);
  });

  it('⚠ and the store text a pin sees is still ONE store', () => {
    // storeSource() is the store plus its slices; every action moved this OTA is
    // findable through it, which is the property that made nineteen suites a
    // one-line repair each.
    const all = storeSource();
    for (const [, , names] of GROUPS) {
      for (const n of names) expect(all).toMatch(new RegExp(`^  (async )?${n}\\(`, 'm'));
    }
  });
});
