// arb63 — hands (gauntlets/gloves) + cloak (back) armor slots. Previously these
// regions returned [] from validSlotsForItem ("cannot be equipped"), stranding
// ~71 catalog armor pieces. Player: "all gear that is picked up must be
// equippable. do we not have hand slots?"

import { validSlotsForItem, ARMOR_SLOTS, SLOT_LABEL, SLOT_ID_KEY } from '../app/engine/equipment';
import type { InventoryItem } from '../app/engine/types';

const mk = (name: string): InventoryItem =>
  ({ id: 'x', name, kind: 'armor', quantity: 1, tags: [] } as InventoryItem);

describe('hands + cloak armor slots', () => {
  it('gauntlets / gloves equip to the hands slot', () => {
    expect(validSlotsForItem(mk('Rough-Hewn Gauntlets'))).toEqual(['hands']);
    expect(validSlotsForItem(mk('Mud-Claw Gloves'))).toEqual(['hands']);
    expect(validSlotsForItem(mk('Mud-Woven Gauntlets'))).toEqual(['hands']);
  });

  it('cloaks / capes equip to the cloak slot (not mis-routed to chest)', () => {
    expect(validSlotsForItem(mk('Mud-Bound Cloak'))).toEqual(['cloak']);
    expect(validSlotsForItem(mk("Aether-Warden's Cape"))).toEqual(['cloak']);
  });

  it('name-fallback handles unknown hand/cloak gear too', () => {
    expect(validSlotsForItem(mk('Strange Vambraces'))).toEqual(['hands']);
    expect(validSlotsForItem(mk('Tattered Shroud'))).toEqual(['cloak']);
  });

  it('both are armor slots with labels + id keys (so AC + EQUIPPED badge work)', () => {
    expect(ARMOR_SLOTS).toContain('hands');
    expect(ARMOR_SLOTS).toContain('cloak');
    expect(SLOT_LABEL.hands).toBe('Hands');
    expect(SLOT_LABEL.cloak).toBe('Cloak');
    expect(SLOT_ID_KEY.hands).toBe('handsId');
    expect(SLOT_ID_KEY.cloak).toBe('cloakId');
  });
});
