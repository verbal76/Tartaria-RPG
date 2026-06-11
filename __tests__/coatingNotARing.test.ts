// OTA-496 — Searing Paste (a burn weapon-coating consumable) was offering
// "Equip (Ring)" because validSlotsForItem tested /ring|band/ WITHOUT word
// boundaries, so "Sea·RING· Paste" matched. Coatings are applied via "Coat a
// weapon", never equipped — and a name merely CONTAINING "ring" must not route to
// the ring slot.

import { validSlotsForItem } from '../app/engine/equipment';
import type { InventoryItem } from '../app/engine/types';

const mk = (over: Partial<InventoryItem>): InventoryItem => ({
  id: 'i', name: 'X', kind: 'consumable', quantity: 1, tags: [], ...over,
} as unknown as InventoryItem);

describe('OTA-496 — weapon coatings are not equippable; "ring" substring is word-bounded', () => {
  it('Searing Paste is NOT equippable (it is a coating, not a ring)', () => {
    const paste = mk({
      name: 'Searing Paste',
      kind: 'consumable',
      tags: ['potion', 'weapon_coating', 'burn', 'aether', 'crafted', 'alchemy'],
    });
    expect(validSlotsForItem(paste)).toEqual([]);
  });

  it('the other weapon coatings stay non-equippable too', () => {
    for (const name of ['Poison Vial', 'Acid Flask', 'Corruption Tonic']) {
      expect(validSlotsForItem(mk({ name, tags: ['potion', 'weapon_coating'] }))).toEqual([]);
    }
  });

  it('a real ring still routes to the ring slot', () => {
    expect(validSlotsForItem(mk({ name: 'Golem Controller Ring', kind: 'misc', tags: [] })))
      .toEqual(['ring']);
  });

  it('a name that merely contains "ring" is not a ring (word boundary)', () => {
    // "Searing Blade" → weapon by the blade token, never a ring.
    expect(validSlotsForItem(mk({ name: 'Searing Blade', kind: 'misc', tags: [] })))
      .toEqual(['main', 'off']);
  });
});
