// OTA-927 — the Aetheric Vision Lens (and the other detect_aether aether-sight
// gadgets) equip into a dedicated `lens` slot, and the detect_aether passive is
// EQUIP-GATED (active only while worn, not merely carried).
import { validSlotsForItem, aethericVisionEquipped } from '../app/engine/equipment';
import type { InventoryItem, PlayerCharacter } from '../app/engine/types';

const gadget = (name: string, id = 'l1'): InventoryItem =>
  ({ id, name, kind: 'relic', quantity: 1, tags: ['exploration', 'relic'], rarity: 'Common', description: 'x' } as InventoryItem);

describe('OTA-927 — aether-sight gadgets equip to the dedicated Lens slot', () => {
  it('validSlotsForItem returns exactly the lens slot for aether-sight gadgets', () => {
    for (const name of ['Aetheric Vision Lens', 'Aether Goggles', 'Lost Echo Compass', 'Aetheric Harmonics Tuner']) {
      expect(validSlotsForItem(gadget(name))).toEqual(['lens']);
    }
  });

  it('aethericVisionEquipped is FALSE when a lens is only carried (not equipped)', () => {
    const p = { inventory: [gadget('Aetheric Vision Lens')], equipped: {} } as unknown as PlayerCharacter;
    expect(aethericVisionEquipped(p)).toBe(false);
  });

  it('aethericVisionEquipped is TRUE only when a detect_aether gadget is worn in the lens slot', () => {
    const p = {
      inventory: [gadget('Aetheric Vision Lens', 'l1')],
      equipped: { lens: 'Aetheric Vision Lens', lensId: 'l1' },
    } as unknown as PlayerCharacter;
    expect(aethericVisionEquipped(p)).toBe(true);
  });

  it('a non-aether item worn in the lens slot does not grant aether-sight', () => {
    const p = {
      inventory: [{ id: 'x1', name: 'Trail Rations', kind: 'consumable', quantity: 1, tags: [], description: 'x' } as InventoryItem],
      equipped: { lens: 'Trail Rations', lensId: 'x1' },
    } as unknown as PlayerCharacter;
    expect(aethericVisionEquipped(p)).toBe(false);
  });
});
