// OTA-1043 — forge changes (engine_Dev, lore-agnostic):
//   (2a) inferred weapons/armor are NOT forge-reservable (they used to show a ♥
//        the Crucible then silently ignored); a fused one-of-a-kind is never re-fusible.
//   (3)  scrapping a FUSED weapon/armor yields the higher-tier ROLE mats (essence +
//        premium), never the common bulk. Which concrete mats those roles map to is the
//        content pack's call — this test reads the loaded scrap role config.

import { isFusionReservable } from '../app/engine/itemFusion';
import { scrapOutputFor } from '../app/engine/scrapEngine';
import scrapData from '../app/data/scrap/scrap.json';
import type { InventoryItem, UniqueItemStats } from '../app/engine/types';

const roles = (scrapData as { roles: Record<string, string> }).roles;
const mk = (p: Partial<InventoryItem> & { name: string }): InventoryItem =>
  ({ id: p.name, kind: 'misc', quantity: 1, rarity: 'Common', tags: [], ...p } as InventoryItem);

describe('OTA-1043 (2a) — forge reservability guards', () => {
  it('inferred misc junk is reservable', () => {
    expect(isFusionReservable(mk({ name: 'Weird Goo', kind: 'misc', tags: ['organic'] }))).toBe(true);
  });
  it('(2a) an inferred WEAPON/ARMOR is NOT reservable', () => {
    expect(isFusionReservable(mk({ name: 'Junk Blade', kind: 'weapon', tags: ['improvised'] }))).toBe(false);
    expect(isFusionReservable(mk({ name: 'Junk Plate', kind: 'armor', tags: ['improvised'] }))).toBe(false);
  });
  it('a fused one-of-a-kind is never re-reservable', () => {
    const u = { kind: 'weapon' } as unknown as UniqueItemStats;
    expect(isFusionReservable(mk({ name: 'Ghostblade', kind: 'weapon', tags: ['fused'], uniqueStats: u }))).toBe(false);
  });
  it('an edible reagent is excluded', () => {
    expect(isFusionReservable(mk({ name: 'Odd Mushroom', kind: 'consumable', tags: ['forage', 'organic'] }))).toBe(false);
  });
});

describe('OTA-1043 (3) — fused weapon/armor scraps to premium role mats only', () => {
  const commonRoles = new Set([roles.metalBulk, roles.cloth, roles.stone, roles.wood, roles.mud, roles.organic]);
  const premiumRoles = new Set([roles.essencePrimary, roles.essenceBonus, roles.metalPremium]);
  const fusedWeapon = mk({ name: 'Ghost Gouge', kind: 'weapon', rarity: 'Legendary', tags: ['fused', 'unique'], uniqueStats: {} as UniqueItemStats });
  const fusedArmor = mk({ name: 'Ghost Aegis', kind: 'armor', rarity: 'Rare', tags: ['fused', 'unique'], uniqueStats: {} as UniqueItemStats });

  it('a fused weapon yields only essence/premium role mats, no common bulk', () => {
    const out = scrapOutputFor(fusedWeapon);
    expect(out.grants.length).toBeGreaterThan(0);
    for (const g of out.grants) {
      expect(premiumRoles.has(g.name)).toBe(true);
      expect(commonRoles.has(g.name)).toBe(false);
    }
    expect(out.grants.map((g) => g.name)).toContain(roles.metalPremium); // Rare+ → premium
  });
  it('a fused armor also skips the common bulk', () => {
    const out = scrapOutputFor(fusedArmor);
    for (const g of out.grants) expect(commonRoles.has(g.name)).toBe(false);
    expect(out.grants.map((g) => g.name)).toContain(roles.essencePrimary);
  });
});
