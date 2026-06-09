import type { InventoryItem } from './types';

// OTA 23-010 / OTA-393 — the right verb for consuming an item: you APPLY a first
// aid kit, DRINK a vial / potion / water / bottle, and EAT food. Single source of
// truth shared by the consume narration AND the inventory action-button label, so
// the button no longer says "eat" for a Water Bottle while the log says "drink".
export function consumeVerb(item: Pick<InventoryItem, 'name' | 'tags'>): 'apply' | 'drink' | 'eat' {
  const name = item.name;
  const tags = item.tags ?? [];
  const isMedical = /first aid|bandage|medkit|salve|tonic|poultice|stim/i.test(name);
  const isPotion = /vial|potion|flask|elixir|brew/i.test(name);
  const isDrink = tags.includes('drink')
    || tags.includes('water')
    || /\b(bottle|canteen|skin|cup|draught|broth|tea|infusion|gourd|jug)\b/i.test(name);
  if (isMedical) return 'apply';
  if (isPotion || isDrink) return 'drink';
  return 'eat';
}
