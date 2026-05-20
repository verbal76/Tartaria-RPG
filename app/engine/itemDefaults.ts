// itemDefaults — synthesize a catalog entry on the fly for items the
// hand-authored catalog doesn't have. Used as the FALLBACK path under
// findWeaponByName / findArmorByName / findAccessoryByName / etc., so
// the player never sees "No record of this item in the catalog" on an
// inventory item.
//
// Player feedback (verbatim): "every item in the inventory should have
// all the stats from the chart. If there are no stats make something
// up, and flag the log to add it later when I send you a log sheet.
// we will populate the tables that are blank if need be."
//
// Each inference is a name-keyword classifier — "blade" → 1d8 slashing,
// "club" → 1d6 bludgeoning, "boots" → +1 AC feet, etc. The result
// shapes match the CatalogWeapon / CatalogArmor / CatalogAccessory /
// CatalogGear interfaces so they drop in transparently.
//
// Inference events get logged once-per-item-name via the recordInferred
// callback so a future "catalog backfill" log sheet can list every
// uncatalogued item the engine encountered. Dedup is per-process (the
// Set resets on app restart) — good enough for a playtest log capture.

import type {
  CatalogWeapon,
  CatalogArmor,
  CatalogAccessory,
  CatalogGear,
  CatalogArmorSlot,
} from './crafting';
import type { Rarity, DamageType } from './types';

const INFERRED_EVER: Set<string> = new Set();

let onInferred: ((label: string) => void) | null = null;

/** Wire the inference event into the game log (or any other sink) so
 *  the playtest log captures every "engine had to guess at this
 *  item's stats" event. Called from gameStore.hydrate. */
export function setOnInferred(cb: ((label: string) => void) | null): void {
  onInferred = cb;
}

function note(label: string): void {
  if (INFERRED_EVER.has(label)) return;
  INFERRED_EVER.add(label);
  try { onInferred?.(label); } catch { /* ignore */ }
}

// ---------------------------------------------------------------------
// Weapon inference
// ---------------------------------------------------------------------

interface WeaponHeuristic {
  kind: 'melee' | 'ranged' | 'runecaster';
  damageType: DamageType;
  damageDice: string;
  stat: CatalogWeapon['stat'];
  defense: number;
  baseDurability: number;
  tags: string[];
}

const WEAPON_HEURISTICS: Array<{ pattern: RegExp; h: WeaponHeuristic }> = [
  // Two-handed heavy → big damage, slow swing.
  { pattern: /\b(maul|warhammer|greatsword|claymore|greataxe|halberd|polehammer|warblade)\b/i,
    h: { kind: 'melee', damageType: 'bludgeoning', damageDice: '1d12', stat: 'strength', defense: 4, baseDurability: 20, tags: ['weapon','two_handed','melee'] } },
  // Cleavers / heavy blades
  { pattern: /\b(cleaver|machete|tomahawk|hatchet|axe)\b/i,
    h: { kind: 'melee', damageType: 'slashing', damageDice: '1d10', stat: 'strength', defense: 3, baseDurability: 16, tags: ['weapon','blade','melee'] } },
  // Mid-tier slashing — swords, blades, sabers
  { pattern: /\b(sword|saber|sabre|katana|broadsword|longblade|shortsword|blade|warblade|thornblade|shadowblade|nightblade|deathblade|etherblade)\b/i,
    h: { kind: 'melee', damageType: 'slashing', damageDice: '1d8', stat: 'strength', defense: 3, baseDurability: 14, tags: ['weapon','blade','melee'] } },
  // Daggers / knives / shivs — fast, finesse
  { pattern: /\b(dagger|knife|dirk|shiv|stiletto|poniard)\b/i,
    h: { kind: 'melee', damageType: 'piercing', damageDice: '1d4', stat: 'dexterity', defense: 1, baseDurability: 10, tags: ['weapon','knife','melee','finesse'] } },
  // Spears / pikes — reach + piercing
  { pattern: /\b(spear|pike|lance|javelin|glaive|trident)\b/i,
    h: { kind: 'melee', damageType: 'piercing', damageDice: '1d8', stat: 'strength', defense: 2, baseDurability: 14, tags: ['weapon','spear','melee','reach'] } },
  // Bludgeoning sticks
  { pattern: /\b(club|cudgel|baton|mace|hammer|truncheon)\b/i,
    h: { kind: 'melee', damageType: 'bludgeoning', damageDice: '1d8', stat: 'strength', defense: 2, baseDurability: 12, tags: ['weapon','club','melee'] } },
  // Whips / chains
  { pattern: /\b(whip|flail|chain)\b/i,
    h: { kind: 'melee', damageType: 'slashing', damageDice: '1d6', stat: 'dexterity', defense: 1, baseDurability: 10, tags: ['weapon','whip','melee'] } },
  // Claws / fangs / improvised natural
  { pattern: /\b(claw|fang|talon|tooth)\b/i,
    h: { kind: 'melee', damageType: 'slashing', damageDice: '1d4', stat: 'strength', defense: 0, baseDurability: 8, tags: ['weapon','natural','melee','improvised'] } },
  // Bows / crossbows
  { pattern: /\b(bow|crossbow|longbow|shortbow|recurve)\b/i,
    h: { kind: 'ranged', damageType: 'piercing', damageDice: '1d8', stat: 'dexterity', defense: 0, baseDurability: 12, tags: ['weapon','bow','ranged'] } },
  // Firearms — rifles / pistols / slings / muskets
  { pattern: /\b(rifle|pistol|musket|gun|carbine|revolver|sling)\b/i,
    h: { kind: 'ranged', damageType: 'piercing', damageDice: '1d10', stat: 'dexterity', defense: 0, baseDurability: 14, tags: ['weapon','firearm','ranged'] } },
  // Runecasters / aether-tech focused — INT
  { pattern: /\b(wand|staff|rod|scepter|focus|runecaster|caster)\b/i,
    h: { kind: 'runecaster', damageType: 'aetheric', damageDice: '1d6', stat: 'intelligence', defense: 0, baseDurability: 12, tags: ['weapon','runecaster','aether'] } },
  // Throwing weapons (small projectiles)
  { pattern: /\b(throw|dart|disk|disc)\b/i,
    h: { kind: 'ranged', damageType: 'piercing', damageDice: '1d6', stat: 'dexterity', defense: 0, baseDurability: 10, tags: ['weapon','thrown','ranged'] } },
];

// Aether keyword → bumps rarity + adds aether tag.
function bumpForAether(name: string, base: WeaponHeuristic): WeaponHeuristic {
  if (!/\b(aether|aetheric|aetherstone|etheric|ether)\b/i.test(name)) return base;
  return {
    ...base,
    damageType: 'aetheric',
    tags: Array.from(new Set([...base.tags, 'aether'])),
  };
}

export function inferWeapon(name: string): CatalogWeapon {
  const matched = WEAPON_HEURISTICS.find((w) => w.pattern.test(name));
  // Default — generic melee improvised when nothing matches.
  const raw: WeaponHeuristic = matched?.h ?? {
    kind: 'melee', damageType: 'bludgeoning', damageDice: '1d6',
    stat: 'strength', defense: 1, baseDurability: 8,
    tags: ['weapon','melee','improvised'],
  };
  const h = bumpForAether(name, raw);
  const rarity: Rarity = h.tags.includes('aether') ? 'Uncommon' : 'Common';
  note(`weapon:${name}`);
  return {
    name,
    weaponKind: h.kind,
    damageType: h.damageType,
    damageDice: h.damageDice,
    stat: h.stat,
    rarity,
    baseDurability: h.baseDurability,
    defense: h.defense,
    tags: h.tags,
    description: `Field-inferred from the name. ${h.kind === 'ranged' ? 'A ranged weapon' : h.kind === 'runecaster' ? 'An Aether-channeling focus' : 'A melee weapon'} the catalog doesn't formally track yet — stats are an educated guess from its name.`,
  };
}

// ---------------------------------------------------------------------
// Armor inference
// ---------------------------------------------------------------------

interface ArmorHeuristic {
  slot: CatalogArmorSlot;
  acBonus: number;
  baseDurability: number;
  tags: string[];
}

const ARMOR_HEURISTICS: Array<{ pattern: RegExp; h: ArmorHeuristic }> = [
  { pattern: /\b(helm|helmet|hood|headpiece|faceplate|faceguard|faceshroud|crown|circlet|coif|skullcap|mask)\b/i,
    h: { slot: 'head', acBonus: 1, baseDurability: 12, tags: ['armor','head'] } },
  { pattern: /\b(chestplate|breastplate|chestpiece|cuirass|hauberk|jerkin|vest|tunic|robe|battlecoat|warplate|plate)\b/i,
    h: { slot: 'chest', acBonus: 3, baseDurability: 18, tags: ['armor','chest'] } },
  { pattern: /\b(leggings|legguards|legplates|greaves|chausses|trousers|breeches|pants)\b/i,
    h: { slot: 'legs', acBonus: 2, baseDurability: 14, tags: ['armor','legs'] } },
  { pattern: /\b(boots|sandals|footwraps|sabatons|stompers|shoes?)\b/i,
    h: { slot: 'feet', acBonus: 1, baseDurability: 10, tags: ['armor','feet'] } },
  { pattern: /\b(cloak|cape|mantle)\b/i,
    h: { slot: 'cloak', acBonus: 1, baseDurability: 10, tags: ['armor','cloak'] } },
  { pattern: /\b(gauntlets|gloves|handwraps|bracers)\b/i,
    h: { slot: 'hands', acBonus: 1, baseDurability: 10, tags: ['armor','hands'] } },
];

export function inferArmor(name: string): CatalogArmor | null {
  const matched = ARMOR_HEURISTICS.find((a) => a.pattern.test(name));
  if (!matched) return null;
  const h = matched.h;
  const aether = /\b(aether|aetheric|aetherstone|etheric|ether)\b/i.test(name);
  const rarity: Rarity = aether ? 'Uncommon' : 'Common';
  const resistances: string[] = aether ? ['aetheric'] : [];
  const tags = aether ? Array.from(new Set([...h.tags, 'aether'])) : h.tags;
  note(`armor:${name}`);
  return {
    name,
    slot: h.slot,
    acBonus: h.acBonus,
    resistances,
    rarity,
    baseDurability: h.baseDurability,
    tags,
    description: `Field-inferred from the name. AC stats are an educated guess; full properties pending catalog backfill.`,
  };
}

// ---------------------------------------------------------------------
// Accessory inference (amulet / ring)
// ---------------------------------------------------------------------

export function inferAccessory(name: string): CatalogAccessory | null {
  const isAmulet = /\b(amulet|locket|necklace|pendant|medallion|charm|talisman|brooch)\b/i.test(name);
  const isRing = /\b(ring|band|signet)\b/i.test(name);
  if (!isAmulet && !isRing) return null;
  const aether = /\b(aether|aetheric|aetherstone|etheric|ether)\b/i.test(name);
  // Small stat bonus inferred from name keywords.
  let statBonus: { stat: string; amount: number } | undefined;
  if (/\b(strength|might|iron|stone|warrior)\b/i.test(name)) statBonus = { stat: 'strength', amount: 1 };
  else if (/\b(swift|dex|wind|shadow|nimble)\b/i.test(name)) statBonus = { stat: 'dexterity', amount: 1 };
  else if (/\b(scholar|mind|tome|wise|sage|aetheric|spell)\b/i.test(name)) statBonus = { stat: 'intelligence', amount: 1 };
  else if (/\b(seer|sight|listen|patient|silver|moon)\b/i.test(name)) statBonus = { stat: 'wisdom', amount: 1 };
  else if (/\b(silver|charm|grace|noble|gilded)\b/i.test(name)) statBonus = { stat: 'charisma', amount: 1 };
  note(isAmulet ? `amulet:${name}` : `ring:${name}`);
  return {
    name,
    rarity: aether ? 'Uncommon' : 'Common',
    statBonus,
    resistances: aether ? ['aetheric'] : [],
    baseDurability: 8,
    tags: [isAmulet ? 'amulet' : 'ring', ...(aether ? ['aether'] : [])],
    description: `Field-inferred from the name. Effects are a best guess; full stats pending catalog backfill.`,
  };
}

// ---------------------------------------------------------------------
// Gear / misc inference (consumables + relics + generic items)
// ---------------------------------------------------------------------

export function inferGear(name: string, tags: readonly string[] = []): CatalogGear {
  const isFood = /\b(ration|bread|jerky|stew|food|meal|fruit|tuber)\b/i.test(name);
  const isDrink = /\b(beer|mead|wine|spirit|whiskey|ale|grog|potion|elixir|tonic|draught|distillate|brew)\b/i.test(name);
  const isLight = /\b(torch|lantern|lamp|glowstone|candle)\b/i.test(name);
  const isRope = /\b(rope|chain|cord|line)\b/i.test(name);
  const isCompass = /\b(compass|sextant|chronometer|map)\b/i.test(name);
  const isFungus = /\b(fungus|mushroom|sporecap|shroom)\b/i.test(name);
  const aether = /\b(aether|aetheric|aetherstone|etheric|ether)\b/i.test(name);
  let kind: CatalogGear['kind'] = 'misc';
  let description = `Field-inferred from the name. Catalog backfill pending.`;
  if (isFood || isDrink) {
    kind = 'consumable';
    description = isFood
      ? 'A field-inferred consumable — likely restores HP or stamina when eaten.'
      : 'A field-inferred drink — likely restores some HP or stamina, may carry a small effect.';
  } else if (isLight) {
    description = 'A light source. Holds back the dark — useful in tunnels and at night.';
  } else if (isRope) {
    description = 'Cordage. Tied around the right thing it solves problems heavier tools cannot.';
  } else if (isCompass) {
    description = 'An instrument of bearings. Tartaria does not always cooperate with them, but they help.';
  } else if (isFungus) {
    kind = 'consumable';
    description = 'A field-inferred fungus. Distillable into something with effects. Don\'t eat raw without knowing the colour.';
  }
  note(`gear:${name}`);
  return {
    name,
    kind,
    rarity: aether ? 'Uncommon' : 'Common',
    tags: Array.from(new Set([...tags, ...(aether ? ['aether'] : [])])),
    description,
  };
}
