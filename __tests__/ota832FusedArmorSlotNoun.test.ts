// OTA-812 — a fused armor piece pulled its NOUN from a flat pool
// (Girdle/Harness/Plating/…) while its SLOT was chosen separately, so a "Girdle"
// (waist) or "Harness" (torso) word could land on the FEET slot (player report:
// "one of the feet slot armor is a girdle?"). The synth now picks the slot first,
// then a noun that fits it. This locks that the noun always matches the slot.

import { synthesizeFusionDeterministic } from '../app/engine/itemFusion';
import type { InventoryItem } from '../app/engine/types';

const mat = (name: string, tags: string[]): InventoryItem =>
  ({ id: name, name, kind: 'misc', quantity: 1, rarity: 'Common', tags } as InventoryItem);

// Slot → the ONLY nouns allowed for that slot (mirrors ARMOR_SLOT_NOUNS).
const SLOT_NOUNS: Record<string, string[]> = {
  head: ['Helm', 'Crown', 'Hood', 'Visor', 'Coif', 'Cowl', 'Casque', 'Circlet'],
  chest: ['Plate', 'Cuirass', 'Mantle', 'Carapace', 'Bastion', 'Aegis', 'Harness', 'Bulwark'],
  legs: ['Girdle', 'Greaves', 'Faulds', 'Kilt', 'Legguards', 'Tassets', 'Brace'],
  feet: ['Boots', 'Sabatons', 'Treads', 'Stompers', 'Warboots', 'Footguards', 'Striders'],
};

describe('OTA-812 — fused armor noun matches its slot', () => {
  it('across many input sets, the armor noun is always valid for the assigned slot', () => {
    const tagPools = [
      ['metal', 'plate'], ['cloth', 'fiber'], ['aether', 'crystal'],
      ['organic', 'bone'], ['stone', 'mudstone'], ['wood', 'haft'],
    ];
    let sawFeet = false;
    for (let i = 0; i < 60; i++) {
      const tags = tagPools[i % tagPools.length]!;
      const inputs = [mat(`A${i}`, tags), mat(`B${i}`, tags), mat(`C${i}`, [tags[0]!])];
      // Vary recentSlots so the slot rotation lands on every position over the run.
      const recent = i % 4 === 0 ? ['head'] : i % 4 === 1 ? ['chest'] : i % 4 === 2 ? ['legs'] : ['feet'];
      const out = synthesizeFusionDeterministic(inputs, tags, 'armor', recent);
      const slot = out.stats.armorSlot!;
      const noun = out.name.split(' ').pop()!;
      expect(SLOT_NOUNS[slot]).toContain(noun); // noun belongs to its slot's pool
      if (slot === 'feet') {
        sawFeet = true;
        // The reported bug: a waist/torso word on feet. Never again.
        expect(['Girdle', 'Harness', 'Kilt', 'Faulds']).not.toContain(noun);
      }
    }
    expect(sawFeet).toBe(true); // the run actually exercised the feet slot
  });
});
