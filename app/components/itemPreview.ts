import {
  WEAPONS,
  ARMOR,
  AMULETS,
  RINGS,
  GEAR,
  MATERIALS,
  type CatalogWeapon,
  type CatalogArmor,
  type CatalogAccessory,
  type CatalogGear,
  type CatalogMaterial,
} from '../engine/crafting';

export type ItemPreview = {
  name: string;
  /** "Weapon", "Helm", "Amulet", etc. */
  kindLabel: string;
  /** Common / Uncommon / Rare / Legendary or null. */
  rarity: string | null;
  /** Flavor text from the catalog. */
  description: string;
  /** Compact list of mechanical lines: "Damage: 2d6 (slashing)", "AC +2", etc. */
  stats: string[];
};

// Resolve an item name to a previewable summary. Used by the buy / equip /
// trade modals so the player can read what they're about to commit to.
export function getItemPreview(itemName: string): ItemPreview {
  const lower = itemName.toLowerCase();

  const w = WEAPONS.find((x) => x.name.toLowerCase() === lower);
  if (w) return previewWeapon(w);

  const a = ARMOR.find((x) => x.name.toLowerCase() === lower);
  if (a) return previewArmor(a);

  const am = AMULETS.find((x) => x.name.toLowerCase() === lower);
  if (am) return previewAccessory(am, 'Amulet');

  const r = RINGS.find((x) => x.name.toLowerCase() === lower);
  if (r) return previewAccessory(r, 'Ring');

  const g = GEAR.find((x) => x.name.toLowerCase() === lower);
  if (g) return previewGear(g);

  const m = MATERIALS.find((x) => x.name.toLowerCase() === lower);
  if (m) return previewMaterial(m);

  // Unknown — return a minimal record so the modal still renders.
  return {
    name: itemName,
    kindLabel: 'Item',
    rarity: null,
    description: 'No record of this item in the catalog.',
    stats: [],
  };
}

function previewWeapon(w: CatalogWeapon): ItemPreview {
  const kindLabel =
    w.weaponKind === 'melee' ? 'Melee Weapon'
    : w.weaponKind === 'ranged' ? 'Ranged Weapon'
    : 'Runecaster';
  const stats: string[] = [
    `Damage: ${w.damageDice} (${w.damageType})`,
    `Scales with ${w.stat.toUpperCase().slice(0, 3)}`,
  ];
  if (w.baseDurability !== undefined) stats.push(`Durability: ${w.baseDurability}`);
  return { name: w.name, kindLabel, rarity: w.rarity, description: w.description, stats };
}

function previewArmor(a: CatalogArmor): ItemPreview {
  const slotLabel = a.slot.charAt(0).toUpperCase() + a.slot.slice(1);
  const stats: string[] = [`AC +${a.acBonus}`];
  if (a.resistances.length > 0) stats.push(`Resists: ${a.resistances.join(', ')}`);
  if (a.statBonus) stats.push(`${a.statBonus.stat.toUpperCase().slice(0, 3)} +${a.statBonus.amount}`);
  if (a.baseDurability !== undefined) stats.push(`Durability: ${a.baseDurability}`);
  return { name: a.name, kindLabel: `${slotLabel} Armor`, rarity: a.rarity, description: a.description, stats };
}

function previewAccessory(x: CatalogAccessory, kind: 'Amulet' | 'Ring'): ItemPreview {
  const stats: string[] = [];
  if (x.statBonus) stats.push(`${x.statBonus.stat.toUpperCase().slice(0, 3)} +${x.statBonus.amount}`);
  if (x.resistances.length > 0) stats.push(`Resists: ${x.resistances.join(', ')}`);
  if (x.baseDurability !== undefined) stats.push(`Durability: ${x.baseDurability}`);
  return { name: x.name, kindLabel: kind, rarity: x.rarity, description: x.description, stats };
}

function previewGear(g: CatalogGear): ItemPreview {
  const kindLabel = g.kind === 'consumable' ? 'Consumable' : g.kind === 'relic' ? 'Relic' : 'Gear';
  const stats: string[] = [];
  if (g.tags.length > 0) stats.push(`Tags: ${g.tags.slice(0, 4).join(', ')}`);
  return { name: g.name, kindLabel, rarity: g.rarity, description: g.description, stats };
}

function previewMaterial(m: CatalogMaterial): ItemPreview {
  return {
    name: m.name,
    kindLabel: 'Material',
    rarity: m.rarity,
    description: m.description,
    stats: m.tags.length > 0 ? [`Tags: ${m.tags.slice(0, 4).join(', ')}`] : [],
  };
}
