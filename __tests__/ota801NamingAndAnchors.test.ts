// OTA-1086 — group-C polish regressions (pure-engine):
//   C2 · a forged WEAPON no longer keeps a soft / non-weapon Qwen name
//        ("Aetheric Thread"); the deterministic weapon pool names it instead,
//        and old saves carrying such a name heal on load.

import {
  fusedWeaponNameReadsSoft,
  synthesizeFusionNameViaQwen,
  migrateFusedName,
} from '../app/engine/itemFusion';
import type { InventoryItem, UniqueItemStats } from '../app/engine/types';

const mk = (id: string, name: string, tags: string[]): InventoryItem =>
  ({ id, name, kind: 'misc', rarity: 'Common', quantity: 1, reservedForFusion: true, tags } as InventoryItem);
const mockQwen = (reply: string) => ({ isReady: () => true, generate: async () => reply });

describe('OTA-1086 C2 — fusedWeaponNameReadsSoft', () => {
  it('flags weapon names ending in a soft / non-weapon noun', () => {
    expect(fusedWeaponNameReadsSoft('Aetheric Thread')).toBe(true);
    expect(fusedWeaponNameReadsSoft('Resonant Veil')).toBe(true);
    expect(fusedWeaponNameReadsSoft('Humming Wisp')).toBe(true);
    expect(fusedWeaponNameReadsSoft('Shroud')).toBe(true);
  });
  it('passes real weapon names', () => {
    expect(fusedWeaponNameReadsSoft('Resonant Cleaver')).toBe(false);
    expect(fusedWeaponNameReadsSoft('Iron-Bound Reaver')).toBe(false);
    expect(fusedWeaponNameReadsSoft('Marrow Spike')).toBe(false);
  });
});

describe('OTA-1086 C2 — the Qwen namer rejects a soft WEAPON name', () => {
  const weaponStats = { kind: 'weapon', rarity: 'Rare', damageDice: '2d6', damageType: 'aetheric', scalesWith: 'intelligence' } as unknown as UniqueItemStats;
  const armorStats = { kind: 'armor', rarity: 'Rare', acBonus: 3, armorSlot: 'chest' } as unknown as UniqueItemStats;
  const inputs = [mk('a', 'Aether Sliver', ['aether']), mk('b', 'Crystal Bit', ['crystal'])];
  const tags = ['aether', 'crystal'];

  it('rejects "Aetheric Thread" for a weapon → null so the deterministic name stands', async () => {
    const out = await synthesizeFusionNameViaQwen(
      weaponStats, inputs, tags,
      mockQwen('{"name":"Aetheric Thread","description":"A humming shard of salvaged aether."}'),
    );
    expect(out).toBeNull();
  });

  it('accepts a proper weapon name', async () => {
    const out = await synthesizeFusionNameViaQwen(
      weaponStats, inputs, tags,
      mockQwen('{"name":"Resonant Cleaver","description":"A humming shard of salvaged aether."}'),
    );
    expect(out?.name).toBe('Resonant Cleaver');
  });

  it('a soft tail is FINE for armor (a "Veil" is a good armor name)', async () => {
    const out = await synthesizeFusionNameViaQwen(
      armorStats, inputs, tags,
      mockQwen('{"name":"Resonant Veil","description":"A woven layer of aether-thread."}'),
    );
    expect(out?.name).toBe('Resonant Veil');
  });
});

describe('OTA-1086 C2 — migrateFusedName heals a soft-named weapon on load', () => {
  it('re-mints a weapon whose stored name reads soft', () => {
    const item = {
      id: 'fused_x', name: 'Aetheric Thread', kind: 'weapon', quantity: 1, rarity: 'Rare',
      tags: ['fused', 'unique', 'aether'],
      uniqueStats: { kind: 'weapon', rarity: 'Rare', damageDice: '2d6', damageType: 'aetheric', scalesWith: 'intelligence', durability: { current: 35, max: 35 } },
    } as unknown as InventoryItem;
    const healed = migrateFusedName(item);
    expect(healed.name).not.toBe('Aetheric Thread');
    expect(fusedWeaponNameReadsSoft(healed.name)).toBe(false);
  });
  it('leaves a clean weapon name alone (idempotent)', () => {
    const item = {
      id: 'fused_y', name: 'Resonant Cleaver', kind: 'weapon', quantity: 1, rarity: 'Rare',
      tags: ['fused', 'unique', 'aether'],
      uniqueStats: { kind: 'weapon', rarity: 'Rare', damageDice: '2d6', damageType: 'aetheric', scalesWith: 'intelligence', durability: { current: 35, max: 35 } },
    } as unknown as InventoryItem;
    expect(migrateFusedName(item).name).toBe('Resonant Cleaver');
  });
});
