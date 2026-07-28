// OTA-687 — the vendor sell list used to exclude equipped gear by NAME, so a spare
// copy of an equipped item's name was hidden from the shop too (own two "Stone-Grip
// Gloves", equip one → neither is sellable). equippedInstanceIds returns the EXACT
// worn instance ids (id-bound, with a legacy first-by-name fallback), so the sell
// filter can exclude only what's actually worn and leave spares sellable.

import { equippedInstanceIds } from '../app/engine/equipment';
import type { PlayerCharacter, InventoryItem } from '../app/engine/types';

const item = (id: string, name: string, extra: Partial<InventoryItem> = {}): InventoryItem =>
  ({ id, name, kind: 'armor', quantity: 1, tags: [], ...extra } as InventoryItem);

const player = (inventory: InventoryItem[], equipped: any): PlayerCharacter =>
  ({ inventory, equipped } as PlayerCharacter);

describe('equippedInstanceIds (OTA-687)', () => {
  it('excludes ONLY the equipped instance, not a same-named spare', () => {
    const inv = [item('g1', 'Stone-Grip Gloves'), item('g2', 'Stone-Grip Gloves')];
    const ids = equippedInstanceIds(player(inv, { hands: 'Stone-Grip Gloves', handsId: 'g1' }));
    expect(ids.has('g1')).toBe(true);
    expect(ids.has('g2')).toBe(false); // the spare stays sellable
  });

  it('covers every slot including ring2 / ring3', () => {
    const inv = [
      item('m', 'Blade', { kind: 'weapon' }),
      item('r1', 'Ring A', { kind: 'accessory' }),
      item('r2', 'Ring B', { kind: 'accessory' }),
      item('r3', 'Ring C', { kind: 'accessory' }),
    ];
    const ids = equippedInstanceIds(player(inv, {
      main: 'Blade', mainId: 'm',
      ring: 'Ring A', ringId: 'r1',
      ring2Id: 'r2', ring3Id: 'r3',
    }));
    expect([...ids].sort()).toEqual(['m', 'r1', 'r2', 'r3']);
  });

  it('legacy save (name only, no id) hides ONE instance by name', () => {
    const inv = [item('a', 'Rusted Blade', { kind: 'weapon' }), item('b', 'Rusted Blade', { kind: 'weapon' })];
    const ids = equippedInstanceIds(player(inv, { main: 'Rusted Blade' })); // no mainId
    expect(ids.size).toBe(1); // exactly one copy excluded, the other sellable
  });

  it('nothing equipped → empty set', () => {
    expect(equippedInstanceIds(player([item('x', 'Thing')], {})).size).toBe(0);
    expect(equippedInstanceIds(player([], undefined as any)).size).toBe(0);
  });
});
