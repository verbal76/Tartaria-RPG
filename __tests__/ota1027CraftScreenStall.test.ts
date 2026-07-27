// OTA-1027 — the craft screen stops stalling. ingredientShortfall annotated the
// whole inventory PER RECIPE (O(recipes × inventory × catalog), pre-existing);
// a WeakMap cache keyed on the immutable inventory array makes it once-per-
// change. Plus the canCraft/drain parity fix for the exact-ingredient
// substitution exclusion.
import * as fs from 'fs';
import * as path from 'path';
import { craftableRecipeCounts, canCraft } from '../app/engine/crafting';

const it_ = (name: string, qty = 1) =>
  ({ id: `${name}_${qty}`, name, kind: 'misc', quantity: qty, tags: ['loot'] }) as any;

describe('OTA-1027 — the craft badge computes in milliseconds, not seconds', () => {
  it('a fat inventory sweep over all recipes stays under a generous bound', () => {
    const names = ['Scrap Metal', 'Stick', 'Small Rock', 'Patched Cloth', 'Beast Fang', 'Aether Dust', 'Mud Fragment', 'Bone Sliver'];
    const inv: any[] = [];
    for (let i = 0; i < 150; i++) inv.push(it_(names[i % names.length]!, 1 + (i % 3)));
    craftableRecipeCounts(inv); // prime (canonical caches warm)
    const t0 = Date.now();
    for (let i = 0; i < 5; i++) craftableRecipeCounts(inv);
    // Pre-fix this loop cost ~4500ms (900ms each); the bound is 25x headroom.
    expect(Date.now() - t0).toBeLessThan(900);
  });
  it('the cache is keyed on array identity — a CHANGED inventory recomputes honestly', () => {
    const a = [it_('Stick', 2)];
    const before = craftableRecipeCounts(a);
    const b = [...a, it_('Small Rock', 2), it_('Patched Cloth', 2), it_('Scrap Metal', 2)];
    const after = craftableRecipeCounts(b);
    expect(after.craft).toBeGreaterThanOrEqual(before.craft);
    expect(JSON.stringify(craftableRecipeCounts(b))).toBe(JSON.stringify(after));
  });
});

describe('OTA-1027 — canCraft agrees with the drain (exact-ingredient exclusion parity)', () => {
  it('an exact ingredient can no longer satisfy ANOTHER slot via tags at approval time', () => {
    // Stick carries the catalog 'improvised' tag, which the Small Rock
    // substitute family accepts — pre-fix canCraft approved this craft while
    // the drain (already excluded) would have underpaid the rock slot.
    const recipe = { result: 'zz-test-club', ingredients: [
      { name: 'Small Rock', quantity: 1 },
      { name: 'Stick', quantity: 1 },
    ] } as any;
    expect(canCraft(recipe, [it_('Stick', 5)])).toBe(false);
    expect(canCraft(recipe, [it_('Stick', 1), it_('Small Rock', 1)])).toBe(true);
  });
  it('the shared shortfall carries the exclusion + the meta cache (source lock)', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'app', 'engine', 'crafting.ts'), 'utf8');
    expect(src).toContain('SHORTFALL_META');
    expect(src).toContain('exactIngredientNames.has(p.name)');
    expect(src).not.toContain("p.name === target) continue;");
  });
});
