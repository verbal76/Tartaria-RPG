// OTA-677 verification — the durability TEMPER (variable max + rolled stat perks) must
// apply ONLY to weapons and armor. This scans the ENTIRE non-weapon/armor catalog
// (gear, amulets, rings, exploration, materials) and proves that stamping any of them is
// (a) deterministic — no random durability drift — and (b) never produces instanceStats
// (no rolled stat buffs on a torch / pry bar / rope / amulet / ring). It also asserts the
// perk roller itself is gated by weapon/armor catalog membership.

import { stampDurability } from '../app/engine/durability';
import { GEAR, AMULETS, RINGS, EXPLORATION, MATERIALS, WEAPONS, ARMOR } from '../app/engine/crafting';
import type { InventoryItem } from '../app/engine/types';

type Row = { name: string; kind?: string; rarity?: string; tags?: string[] };
const asItem = (r: Row, fallbackKind: string): InventoryItem =>
  ({ id: `t_${r.name}`, name: r.name, kind: (r.kind ?? fallbackKind), rarity: r.rarity ?? 'Common', tags: r.tags ?? [], quantity: 1 } as unknown as InventoryItem);

// Everything that is NOT in the weapon or armor catalog.
const nonGear: Array<{ item: InventoryItem; src: string }> = [
  ...GEAR.map((r) => ({ item: asItem(r as Row, (r as Row).kind ?? 'misc'), src: 'gear' })),
  ...AMULETS.map((r) => ({ item: asItem(r as Row, 'relic'), src: 'amulet' })),
  ...RINGS.map((r) => ({ item: asItem(r as Row, 'relic'), src: 'ring' })),
  ...EXPLORATION.map((r) => ({ item: asItem(r as Row, 'relic'), src: 'exploration' })),
  ...MATERIALS.map((r) => ({ item: asItem(r as Row, 'misc'), src: 'material' })),
];

const weaponArmorNames = new Set([...WEAPONS, ...ARMOR].map((w) => (w as Row).name.toLowerCase()));

describe('temper (variable durability + rolled perks) is weapon/armor only — full catalog scan (OTA-677)', () => {
  it('no non-weapon/armor catalog item receives rolled instanceStats when stamped', () => {
    const offenders: string[] = [];
    for (const { item, src } of nonGear) {
      if (weaponArmorNames.has(item.name.toLowerCase())) continue; // a gear row shadowing a real weapon — skip
      const stamped = stampDurability(item) as InventoryItem & { instanceStats?: unknown };
      if (stamped.instanceStats) offenders.push(`${item.name} [${src}]`);
    }
    expect(offenders).toEqual([]);
  });

  it('every non-weapon/armor item stamps DETERMINISTICALLY (no temper durability drift)', () => {
    const drifters: string[] = [];
    for (const { item, src } of nonGear) {
      if (weaponArmorNames.has(item.name.toLowerCase())) continue;
      const a = stampDurability(item).durability;
      const b = stampDurability(item).durability;
      // Either both undefined (not durability-tracked) or identical (fixed = base).
      if (JSON.stringify(a) !== JSON.stringify(b)) drifters.push(`${item.name} [${src}]`);
      if (a && a.current !== a.max) drifters.push(`${item.name} [${src}] current!=max`);
    }
    expect(drifters).toEqual([]);
  });

  it('a control weapon DOES still temper (sanity: the gate is not over-broad)', () => {
    const maxes = new Set<number>();
    let sawPerk = false;
    for (let i = 0; i < 80; i++) {
      const w = { id: 'w', name: 'Mud-Rend Blade', kind: 'weapon', rarity: 'Common', tags: [], quantity: 1 } as unknown as InventoryItem;
      const s = stampDurability(w) as InventoryItem & { instanceStats?: unknown };
      if (s.durability) maxes.add(s.durability.max);
      if (s.instanceStats) sawPerk = true;
    }
    expect(maxes.size).toBeGreaterThan(1); // durability varies
    expect(sawPerk).toBe(true);            // perks roll on a weapon
  });
});
