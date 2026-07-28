// OTA-1020 — every coating racks (owner: "there were coatings that I couldn't
// load into my bandolier. verify that all coatings are able to be loaded.").
// Root cause: identity-by-instance-tag-snapshot. Instances keep the tags they
// were minted with; vials from before a catalog tag existed failed every
// coating check forever. Identity now reads canonical (instance ∪ catalog) tags.
import * as fs from 'fs';
import * as path from 'path';
import { isBandolierEligible, itemIsThrowable, itemIsThrowableCoating } from '../app/engine/bandolierEligibility';
import { canonicalItemTags } from '../app/engine/crafting';
import { isWeaponCoatingItem } from '../app/engine/weaponCoating';
import { coatingItemDrinkable } from '../app/engine/coatingRemedy';

const gearJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'app', 'data', 'items', 'gear.json'), 'utf8'));
const weaponsJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'app', 'data', 'items', 'weapons.json'), 'utf8'));
const gearRows: any[] = Array.isArray(gearJson) ? gearJson : (gearJson.gear ?? []);
const weaponRows: any[] = Array.isArray(weaponsJson) ? weaponsJson : (weaponsJson.weapons ?? []);
const coatings = gearRows.filter((g) => g.effect && g.effect.coating);
const PLAYER = { equipped: {} } as any;
const stale = (name: string) => ({ id: 'x1', name, kind: 'consumable', quantity: 1, tags: ['potion'] }) as any;

describe('OTA-1020 — the owner\'s ask, verified: ALL catalog coatings rack', () => {
  it('every coating-effect row in the catalog is bandolier-eligible — even as a STALE instance with no coating tag', () => {
    expect(coatings.length).toBeGreaterThanOrEqual(14);
    for (const c of coatings) {
      const verdict = isBandolierEligible(stale(c.name), PLAYER);
      expect(`${c.name}: ${verdict.eligible}`).toBe(`${c.name}: true`);
    }
  });
  it('the canonical reader unions instance and catalog tags, and leaves non-catalog names alone', () => {
    const first = coatings[0]!;
    expect(canonicalItemTags(stale(first.name))).toContain('weapon_coating');
    expect(canonicalItemTags({ name: 'zz-not-a-real-item', tags: ['thrown'] })).toEqual(['thrown']);
  });
});

describe('OTA-1020 — the throwable side of the gate reads canonical tags too', () => {
  it('a stale small throwable racks; a stale spear/javelin is still refused as too long', () => {
    const knife = weaponRows.find((w) => (w.tags ?? []).includes('throwable') && !(w.tags ?? []).includes('spear'));
    const spear = weaponRows.find((w) => (w.tags ?? []).includes('throwable') && (w.tags ?? []).includes('spear'));
    expect(knife).toBeTruthy();
    expect(spear).toBeTruthy();
    const staleKnife = { id: 'k1', name: knife.name, kind: 'weapon', quantity: 1, tags: [] } as any;
    const staleSpear = { id: 's1', name: spear.name, kind: 'weapon', quantity: 1, tags: [] } as any;
    expect(isBandolierEligible(staleKnife, PLAYER).eligible).toBe(true);
    const sv = isBandolierEligible(staleSpear, PLAYER);
    expect(sv.eligible).toBe(false);
    expect(sv.reason).toContain('too long');
  });
  it('an improvised rock (plain `thrown`, no catalog row) still never racks', () => {
    expect(isBandolierEligible({ id: 'r1', name: 'zz-odd-rock', kind: 'misc', quantity: 1, tags: ['thrown'] } as any, PLAYER).eligible).toBe(false);
    expect(itemIsThrowable({ id: 'r1', name: 'zz-odd-rock', kind: 'misc', quantity: 1, tags: ['thrown'] } as any)).toBe(false);
    expect(itemIsThrowableCoating(stale(coatings[0]!.name))).toBe(true);
  });
});

describe('OTA-1020 — every sibling consumer answers from the same canonical reader', () => {
  it('throw burst, coat-a-weapon button, and equip guard all route through isWeaponCoatingItem', () => {
    const store = fs.readFileSync(path.join(__dirname, '..', 'app', 'state', 'gameStore.ts'), 'utf8');
    const inv = fs.readFileSync(path.join(__dirname, '..', 'app', 'screens', 'InventoryScreen.tsx'), 'utf8');
    const eq = fs.readFileSync(path.join(__dirname, '..', 'app', 'engine', 'equipment.ts'), 'utf8');
    expect(store).toContain('if (iwciThrow(item)) {');
    expect(store).not.toContain("/^weapon_coating$/i");
    expect(inv).toContain('if (isWeaponCoatingItem(pending.item)) {');
    expect(inv).not.toContain("(pending.item.tags ?? []).includes('weapon_coating')");
    expect(eq).toContain('if (isWeaponCoatingItem(item)) return [];');
  });
  it('the bandolier gate itself no longer reads raw instance tags anywhere', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'app', 'engine', 'bandolierEligibility.ts'), 'utf8');
    expect(src).not.toContain('item.tags');
  });
  it('drinkability answers the same for a stale instance as for a fully-tagged one (whole catalog)', () => {
    for (const c of coatings) {
      const fresh = { name: c.name, tags: c.tags } as any;
      expect(`${c.name}: ${coatingItemDrinkable(stale(c.name))}`).toBe(`${c.name}: ${coatingItemDrinkable(fresh)}`);
    }
  });
});
