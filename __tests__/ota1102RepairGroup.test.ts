// OTA-1102 — THE REPAIR TAB LEARNS THE GRIP, AND LEARNS TO COUNT.
//
// Owner: "I thought we were going to do the same tap and hold to multiselct for
// repair too. it will have to take into account the items needed for each item
// you sent and dim make items in selectable if the items you selected consume
// the items needed."
//
// The first sentence is the OTA-1099/1123 gesture again — hold to start, tap to
// add, act on the lot — and the sameness is the point.
//
// The second sentence is what makes REPAIR different from SELL and DROP: those
// groups are independent (selling a sword does not make the axe unsellable),
// but repairs all draw from ONE pile. Every pick changes what the next pick can
// afford. So the group carries a running material budget, and a row the budget
// can no longer pay for goes dim and un-tappable WITH ITS REASON, rather than
// being tappable-then-silently-skipped at the hammer.
//
// What this suite guards:
//   · the budget is SIMULATED with the engine's own substitution-aware
//     functions, not hand-rolled arithmetic that would drift from them;
//   · the ORDER is honest — first ticked, first served, same order the repairs
//     run in;
//   · a dimmed row says WHY, and says the RIGHT why (the group ate it) rather
//     than the wrong one (you never had it);
//   · a picked row the budget cannot pay for is NAMED at the confirm, never
//     dropped in silence;
//   · the group reuses `repairInventoryItem`, so there is no second repair path
//     that could disagree about cost, substitutions, or eligibility.

jest.setTimeout(20000);

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
  makeDirectoryAsync: jest.fn(async () => {}), readAsStringAsync: jest.fn(async () => ''),
  writeAsStringAsync: jest.fn(async () => {}), deleteAsync: jest.fn(async () => {}),
  downloadAsync: jest.fn(async () => ({ uri: '' })), EncodingType: { UTF8: 'utf8', Base64: 'base64' },
}));
jest.mock('expo-speech', () => ({ speak: jest.fn(), stop: jest.fn(), isSpeakingAsync: jest.fn(async () => false) }));
jest.mock('expo-av', () => ({
  Audio: {
    setAudioModeAsync: jest.fn(),
    Sound: class {
      static createAsync: (...args: unknown[]) => Promise<{ sound: { playAsync: () => Promise<void>; unloadAsync: () => Promise<void> } }> =
        jest.fn(async () => ({ sound: { playAsync: jest.fn(async () => {}), unloadAsync: jest.fn(async () => {}) } }));
    },
  },
}));

import { readFileSync } from 'fs';
import { join } from 'path';
import { missingIngredientsList, consumeIngredientsList } from '../app/engine/crafting';
import type { InventoryItem } from '../app/engine/types';

const src = (p: string): string => readFileSync(join(__dirname, '..', p), 'utf8');
const view = src('app/screens/CraftingScreen.tsx');

const stack = (name: string, quantity: number): InventoryItem =>
  ({ id: `${name.replace(/\s+/g, '_').toLowerCase()}_stack`, name, kind: 'material', quantity, tags: ['material'] } as unknown as InventoryItem);

describe('OTA-1102 — the same grip as SELL and DROP', () => {
  it('HOLD starts the group; a plain tap outside the mode still repairs one', () => {
    // A player who never holds a row sees no change at all — the tap handler
    // branches on the mode rather than replacing the old action.
    expect(view).toContain(`onPress={() => (repairSelectMode
                      ? toggleRepairSelect(r.item.id)
                      : repairInventoryItem(r.item.id))}`);
    expect(view).toContain(`onLongPress={() => (repairSelectMode
                      ? toggleRepairSelect(r.item.id)
                      : beginRepairSelect(r.item.id))}`);
  });

  it('a picked row is ticked, outlined, and reads as a checkbox', () => {
    expect(view).toContain("{repairSelectMode ? (groupPicked ? '☑ ' : '☐ ') : ''}");
    expect(view).toContain('groupPicked && styles.recipeRowPicked');
    expect(view).toContain("accessibilityRole={repairSelectMode ? 'checkbox' : 'button'}");
  });

  it('emptying the group leaves the mode, and a finished repair clears both', () => {
    expect(view).toContain('if (next.length === 0) setRepairSelectMode(false);');
    expect(view).toContain('const exitRepairSelect = () => { setRepairSelectMode(false); setRepairSelected([]); setRepairGroupConfirm(false); };');
    expect(view).toMatch(/const runRepairGroup = \(\) => \{[\s\S]*?exitRepairSelect\(\);\s*\};/);
  });

  it('⚠ the bar is ANCHORED above the scroll and TAKES REPAIR ALL\'s place', () => {
    // Same structural rule as OTA-1101's sell bar: it sits outside the
    // ScrollView, so it cannot scroll away while you tick rows further down —
    // which is exactly when the running material bill starts to matter.
    const barAt = view.indexOf('{repairSelectMode ? (');
    const scrollAt = view.indexOf('<ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>', barAt);
    expect(barAt).toBeGreaterThan(-1);
    expect(scrollAt).toBeGreaterThan(barAt);
    const branch = view.slice(barAt, scrollAt);
    expect(branch).toContain('REPAIR GROUP');
    // REPAIR ALL is the ELSE arm — it is not even rendered while a group is
    // open, so there is no second bulk button to fight the one you are building.
    // ⚠ OTA-1720 — the else arm became a fragment (kit button + sweep + the
    // short-of line). The claim is the same one: neither bulk button is rendered
    // while a group is open, because they live in the arm the group branch is
    // not taking.
    expect(branch).toContain(') : (');
    expect(branch).toContain('REPAIR MY KIT');
    expect(branch.indexOf('REPAIR GROUP')).toBeLessThan(branch.indexOf('REPAIR MY KIT'));
    expect(branch).toContain('repair everything listed');
  });

  it('the group reuses the single-row repair, not a second path', () => {
    // ⚠ OTA-1552 — RETARGETED, NOT RELAXED. The loop moved from this click
    // handler into the store (`repairInventoryItems`) so the Crucible guard can
    // stop a run and KEEP THE REST OF IT — a loop inside an onPress has nowhere
    // to keep a remainder. The picked ids, and their order, still go straight
    // through; and the batch still calls the single-row repair, one level down.
    expect(view).toContain('repairInventoryItems(repairPlan.picked.map((r) => r.item.id));');
    const slice = readFileSync(join(__dirname, '..', 'app/state/slices/inventorySlice.ts'), 'utf8');
    expect(slice).toContain("const verdict = get().repairInventoryItem(id, { allowIds: allow });");
  });
});

describe('OTA-1102 — the running material budget', () => {
  it('⚠ the budget is SIMULATED with the engine\'s own substitution-aware functions', () => {
    // Hand-rolled cost arithmetic would drift from the substitution rules the
    // moment someone touched them, and the drift would surface as a button that
    // lies — a row that looks affordable and then refuses at the hammer.
    expect(view).toContain('if (missingIngredientsList(row.cost, stock).length > 0) { starved.push(row); continue; }');
    expect(view).toContain('stock = consumeIngredientsList(stock, row.cost);');
    expect(view).toContain('if (missingIngredientsList(r.cost, stock).length === 0) affordable.add(r.item.id);');
  });

  it('the budget spends in SELECTION ORDER — first ticked, first served', () => {
    // …and the repairs then run in that same order, so what the plan promised
    // is what the hammer delivers.
    expect(view).toMatch(/for \(const id of repairSelected\) \{[\s\S]{0,700}picked\.push\(row\);/);
    // OTA-1552 — the ORDER is the property, and it survives the move into the
    // store: the picked ids go across as an array, and repairInventoryItems
    // walks it with an index rather than reordering or de-duplicating it.
    expect(view).toContain('repairInventoryItems(repairPlan.picked.map((r) => r.item.id));');
    const slice = readFileSync(join(__dirname, '..', 'app/state/slices/inventorySlice.ts'), 'utf8');
    expect(slice).toContain('for (let i = 0; i < itemIds.length; i += 1) {');
  });

  it('adding is GATED on the remaining stock — a group can never hold what it cannot pay for', () => {
    expect(view).toContain('if (!repairPlan.affordable.has(id)) return cur;');
    // …and a blocked row cannot be tapped in the first place.
    expect(view).toContain('const rowTappable = repairSelectMode ? (groupPicked || !groupBlocked) : r.available;');
    expect(view).toContain('disabled={!rowTappable}');
  });

  it('⚠ a dimmed row says WHY, and says the RIGHT why', () => {
    // "Greyed out" with no reason is the silent-rule failure OTA-1094 was
    // written against. And the reason has to be TRUE: a row you were never able
    // to afford is blocked too, but telling that player the group ate their
    // cloth is a lie — they get their existing "Missing:" line instead.
    expect(view).toContain('const groupStarved = groupBlocked && r.available;');
    expect(view).toContain('The pieces you already picked are spending the materials this needs.');
    expect(view).toContain('groupStarved && styles.recipeRowStarved');
    expect(view).toContain('Cannot be added — you do not have the materials it needs.');
  });

  it('the bar shows the running bill the dimming is derived from', () => {
    expect(view).toContain('`Costs: ${[...repairPlan.spend.entries()].map(([n, q]) => `${q}× ${n}`).join(\', \')}`');
    expect(view).toContain('No materials committed yet.');
  });

  it('the selection is DERIVED from the live repair list, never stored as rows', () => {
    // A picked piece that gets repaired, sold or dropped falls out of the group
    // rather than lingering as an id the count still claims.
    expect(view).toContain('const row = repairable.find((r) => r.item.id === id);');
    expect(view).toContain('if (!row) continue;');
  });

  it('⚠ a picked row the budget cannot pay for is NAMED at the confirm, not dropped in silence', () => {
    expect(view).toContain('visible={repairGroupConfirm}');
    expect(view).toContain('Not enough materials for:');
    expect(view).toContain('These stay damaged.');
    // …and the confirm itemises what is going and what it costs, so ⚒ is never
    // a blind tap.
    expect(view).toContain('Materials spent:');
    expect(view).toContain('⚒ Repair them');
  });
});

describe('OTA-1102 — the simulation the screen runs is the one the engine honours', () => {
  // The screen's budget is only trustworthy if `consumeIngredientsList` really
  // leaves behind a stock that `missingIngredientsList` then reads the same way
  // the repair itself will. These exercise that pair directly with the shapes
  // the repair tab feeds it.

  it('spending a shared material starves the next piece — exactly what the dimming claims', () => {
    let stock: InventoryItem[] = [stack('Scrap Metal', 3)];
    const cost = [{ name: 'Scrap Metal', quantity: 2 }];
    expect(missingIngredientsList(cost, stock)).toHaveLength(0);
    stock = consumeIngredientsList(stock, cost);
    // One scrap left against a two-scrap bill — the second row goes dim.
    expect(missingIngredientsList(cost, stock).length).toBeGreaterThan(0);
  });

  it('a piece paid for out of the remainder stays affordable — the dimming is not blanket', () => {
    let stock: InventoryItem[] = [stack('Scrap Metal', 3), stack('Cloth Scrap', 4)];
    stock = consumeIngredientsList(stock, [{ name: 'Scrap Metal', quantity: 2 }]);
    // Different material, untouched by the first pick, so it must still pass.
    expect(missingIngredientsList([{ name: 'Cloth Scrap', quantity: 2 }], stock)).toHaveLength(0);
  });

  it('⚠ SUBSTITUTES are counted, which is the whole reason the screen does not roll its own maths', () => {
    // Patched Cloth stands in for Cloth Scrap. A hand-rolled tally that only
    // matched names would dim this row while the repair itself would happily
    // pay for it — the button lying about the engine's own rules.
    const stock: InventoryItem[] = [stack('Patched Cloth', 4)];
    const viaSubstitute = missingIngredientsList([{ name: 'Cloth Scrap', quantity: 2 }], stock);
    const spent = consumeIngredientsList(stock, [{ name: 'Cloth Scrap', quantity: 2 }]);
    // Whatever the substitution table says, the two functions must AGREE: if
    // the cost is payable, spending it moves stock; if it is not, it does not.
    if (viaSubstitute.length === 0) {
      const before = stock.reduce((n, i) => n + i.quantity, 0);
      const after = spent.reduce((n, i) => n + i.quantity, 0);
      expect(after).toBeLessThan(before);
    } else {
      expect(spent.reduce((n, i) => n + i.quantity, 0)).toBe(stock.reduce((n, i) => n + i.quantity, 0));
    }
  });
});
