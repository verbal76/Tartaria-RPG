// OTA-688 — three fused-item fixes:
//  (1) categorizeItem trusts a fused item's KIND, so a fused ARMOR whose synthesized
//      name reads weapon-ish no longer files under Weapons (which had broken the
//      "View in inventory" jump — the reveal opened the ARMOR section but the piece
//      sat in Weapons, so it never highlighted).
//  (2) isFusedInventoryItem detects Crucible forges (uniqueStats OR the 'fused' tag)
//      for the magical ✶ inventory marker.
//  (3) A fused item is NOT treated as "inferred" (no ◆ diamond) — it gets its own mark.

import { categorizeItem } from '../app/components/InventoryCategorize';
import { isFusedInventoryItem, isInferredInventoryItem } from '../app/engine/crafting';
import type { InventoryItem, UniqueItemStats } from '../app/engine/types';

const armorStats = { kind: 'armor', rarity: 'Rare', durability: { current: 20, max: 20 } } as unknown as UniqueItemStats;

// A fused ARMOR with a deliberately weapon-sounding name ("... Edge") + a stray
// 'weapon' tag — exactly the shape that used to leak into the Weapons section.
const fusedArmor: InventoryItem = {
  id: 'fused_x', name: 'Ghostforged Aegis Edge', kind: 'armor', quantity: 1,
  rarity: 'Rare', tags: ['fused', 'unique', 'aetheric'], uniqueStats: armorStats,
} as InventoryItem;

const fusedWeapon: InventoryItem = {
  id: 'fused_w', name: 'Pulse-Woven Render', kind: 'weapon', quantity: 1,
  rarity: 'Rare', tags: ['fused', 'unique'], uniqueStats: { kind: 'weapon', rarity: 'Rare', durability: { current: 30, max: 30 } } as unknown as UniqueItemStats,
} as InventoryItem;

describe('fused item category + marker (OTA-688)', () => {
  it('a fused ARMOR files under Armor, not Weapons (kind is authoritative)', () => {
    expect(categorizeItem(fusedArmor)).toBe('armor');
  });

  it('a fused WEAPON still files under Weapons', () => {
    expect(categorizeItem(fusedWeapon)).toBe('weapon');
  });

  it('OTA-704 — a fused armor whose top-level kind is stale ("weapon") still files under Armor via uniqueStats.kind', () => {
    // The reported bug: two "Aetheric Armor" pieces equipped to the head slot
    // (uniqueStats.kind 'armor', AC bonus) but the top-level item.kind read 'weapon',
    // so they scattered into Weapons. uniqueStats.kind is the forge's ground truth.
    const mismatched: InventoryItem = {
      id: 'fused_mm', name: 'Aetheric Armor', kind: 'weapon', quantity: 1, rarity: 'Legendary',
      tags: ['fused', 'unique', 'aetheric'],
      uniqueStats: { kind: 'armor', rarity: 'Legendary', armorSlot: 'head', acBonus: 5, durability: { current: 45, max: 45 } } as unknown as UniqueItemStats,
    } as InventoryItem;
    expect(categorizeItem(mismatched)).toBe('armor');
  });

  it('the deep-link category (item.kind) now matches where the item actually renders', () => {
    // settleFusion opens the section by item.kind; categorizeItem must agree or the
    // "View in inventory" highlight lands on an empty section.
    expect(categorizeItem(fusedArmor)).toBe(fusedArmor.kind);
    expect(categorizeItem(fusedWeapon)).toBe(fusedWeapon.kind);
  });

  it('isFusedInventoryItem detects forges by uniqueStats OR the fused tag', () => {
    expect(isFusedInventoryItem(fusedArmor)).toBe(true);
    expect(isFusedInventoryItem({ tags: ['fused'] })).toBe(true); // tag only (older forge / no uniqueStats)
    expect(isFusedInventoryItem({ uniqueStats: {} })).toBe(true); // uniqueStats only
    expect(isFusedInventoryItem({ name: 'Rusted Blade', tags: ['weapon'] } as any)).toBe(false);
  });

  it('a fused item is NOT flagged inferred (so it shows ✶, never the ◆ diamond)', () => {
    expect(isInferredInventoryItem(fusedArmor)).toBe(false);
  });
});
