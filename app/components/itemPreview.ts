import {
  WEAPONS,
  ARMOR,
  AMULETS,
  RINGS,
  GEAR,
  EXPLORATION,
  MATERIALS,
  type CatalogWeapon,
  type CatalogArmor,
  type CatalogAccessory,
  type CatalogGear,
  type CatalogMaterial,
} from '../engine/crafting';
import {
  inferWeapon,
  inferArmor,
  inferAccessory,
  inferGear,
} from '../engine/itemDefaults';

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

// OTA-195 — uniqueStats-aware preview. When the caller has the
// InventoryItem (most call sites do), prefer this entry point so a
// fused item renders its unique stats instead of falling through to
// inferGear (which would only see the name keywords).
export function getItemPreviewForInstance(item: {
  name: string;
  uniqueStats?: import('../engine/types').UniqueItemStats;
  durability?: { current: number; max: number };
  instanceStats?: { acBonus?: number; statBonuses?: { stat: string; amount: number }[] };
  description?: string;
  rarity?: string;
}): ItemPreview {
  if (item.uniqueStats) {
    const u = item.uniqueStats;
    const kindLabel =
      u.kind === 'weapon' ? 'Unique Weapon'
      : u.kind === 'dog_armor' ? 'Unique Dog Vest'
      : `Unique ${u.armorSlot ? u.armorSlot.charAt(0).toUpperCase() + u.armorSlot.slice(1) + ' ' : ''}Armor`;
    const stats: string[] = [];
    if (u.damageDice && u.damageType) stats.push(`Damage: ${u.damageDice} (${u.damageType})`);
    if (u.scalesWith) stats.push(`Scales with ${u.scalesWith.toUpperCase().slice(0, 3)}`);
    if (u.acBonus !== undefined) stats.push(`AC +${u.acBonus}`);
    if (u.resistance) stats.push(`Resists: ${u.resistance}`);
    if (u.special) stats.push(`Special: ${u.special}`);
    stats.push(`Durability: ${u.durability.current}/${u.durability.max}`);
    return {
      name: item.name,
      kindLabel,
      rarity: u.rarity,
      description: item.description ?? '',
      stats,
    };
  }

  const base = getItemPreview(item.name);
  // No per-instance roll → plain catalog preview (legacy saves, non-gear).
  if (!item.instanceStats && !item.durability) return base;

  const isAcLine = (s: string) => /^AC \+\d+$/.test(s);
  const isStatLine = (s: string) => /^[A-Za-z]{3} \+\d+$/.test(s); // "DEX +1", "STE +2"
  const isDurLine = (s: string) => s.startsWith('Durability:');
  const catalogDur = base.stats.find(isDurLine);

  let stats: string[];
  if (item.instanceStats) {
    // Swap the catalog AC + attribute-perk lines for this instance's rolled
    // values; keep everything else (Damage / Scales / Resists / Tags) intact.
    const rebuilt: string[] = [];
    if (item.instanceStats.acBonus !== undefined) rebuilt.push(`AC +${item.instanceStats.acBonus}`);
    for (const s of base.stats) {
      if (isAcLine(s) || isStatLine(s) || isDurLine(s)) continue;
      rebuilt.push(s);
    }
    for (const b of item.instanceStats.statBonuses ?? []) {
      rebuilt.push(`${b.stat.toUpperCase().slice(0, 3)} +${b.amount}`);
    }
    stats = rebuilt;
  } else {
    stats = base.stats.filter((s) => !isDurLine(s));
  }

  // Re-append durability: the live instance value when known, else the catalog line.
  const durLine = item.durability
    ? `Durability: ${item.durability.current}/${item.durability.max}`
    : catalogDur;
  if (durLine) stats.push(durLine);

  return { ...base, stats };
}

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

  // OTA 193 — exploration catalog lookup. Without this, items like
  // Pulse Scanner / Aetheric Circuit Repair Kit (both authored in
  // exploration.json with full effect tags) miss every catalog
  // and fall through to inferGear(), firing a noisy "inferred-
  // stats: gear:NAME" debug line every render even though the
  // catalog DOES have them. Treat exploration rows as gear-shaped
  // for preview rendering (kind/rarity/desc/tags all present).
  const exp = EXPLORATION.find((x) => x.name.toLowerCase() === lower);
  if (exp) {
    return previewGear({
      name: exp.name,
      kind: 'misc',
      rarity: exp.rarity,
      tags: exp.tags,
      description: exp.description,
      effect: exp.effect,
    });
  }

  const m = MATERIALS.find((x) => x.name.toLowerCase() === lower);
  if (m) return previewMaterial(m);

  // No catalog entry — infer stats from the item name so the modal
  // shows real numbers instead of "No record." Inferred items are
  // flagged (description prefix) so the player knows the stats are
  // a guess and they can ship a backfill log to the dev later.
  // Order: armor > accessory > weapon > gear (most-specific to least).
  const armorInfer = inferArmor(itemName);
  if (armorInfer) return previewArmor(armorInfer);
  const accInfer = inferAccessory(itemName);
  if (accInfer) {
    const kind: 'Amulet' | 'Ring' = /\b(ring|band|signet)\b/i.test(itemName) ? 'Ring' : 'Amulet';
    return previewAccessory(accInfer, kind);
  }
  // Weapon inference is permissive — falls back to a generic
  // improvised melee for any unmatched name. Gate it behind a
  // "looks like a weapon" name check so plain materials don't
  // wrongly render as weapons.
  const looksLikeWeapon = /\b(blade|sword|axe|spear|bow|crossbow|dagger|knife|club|mace|hammer|maul|staff|wand|rod|scepter|gun|rifle|pistol|sling|javelin|lance|glaive|halberd|pike|scythe|whip|claw|fang|baton|cudgel|cleaver|saber|sabre|katana|machete|tomahawk|trowel|hatchet|warblade|thornblade|shadowblade|nightblade|deathblade|etherblade|caster|runecaster)\b/i.test(itemName);
  if (looksLikeWeapon) return previewWeapon(inferWeapon(itemName));
  // Otherwise treat as inferred gear (consumable / light / rope /
  // generic) so we still surface a description.
  return previewGear(inferGear(itemName));
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
  // OTA 220 — surface passive stat bonuses ({ kind: 'passive', stat,
  // bonus }) that exploration items use. Without this, Echoing Steps
  // Boots and similar render with no stat line even though they
  // grant +1 DEX while equipped. Playtester: "echoing steps boots
  // don't have any stats but they're for sale in the store."
  if (g.effect && g.effect.kind === 'passive' && g.effect.bonus !== 0) {
    const sign = g.effect.bonus > 0 ? '+' : '';
    stats.push(`${sign}${g.effect.bonus} ${g.effect.stat.toUpperCase().slice(0, 3)} (passive)`);
  }
  // OTA-111 — surface CONSUMABLE restore amounts on the catalog
  // preview so RECIPES-tab cards show "+5 HP / +2 stamina" inline
  // instead of just the rarity. Playtester ask: "We should show
  // what each food recipe gives back in terms of health and/or
  // stamina, so we know what we need to make to restore health."
  // Data lives in app/data/items/gear.json under
  // effect.{healHP,restoreStamina,reduceCorruption,buffStat/Bonus/Duration,cureBleed}.
  if (g.effect && g.effect.kind === 'consumable') {
    const restoreParts: string[] = [];
    if (g.effect.healHP) restoreParts.push(`+${g.effect.healHP} HP`);
    if (g.effect.restoreStamina) restoreParts.push(`+${g.effect.restoreStamina} stamina`);
    if (g.effect.reduceCorruption) restoreParts.push(`−${g.effect.reduceCorruption} corruption`);
    if (g.effect.extendLight) restoreParts.push(`+${g.effect.extendLight} light`);
    if (restoreParts.length > 0) stats.push(`Restores: ${restoreParts.join(' / ')}`);
    if (g.effect.buffStat && g.effect.buffBonus && g.effect.buffDuration) {
      const sign = g.effect.buffBonus > 0 ? '+' : '';
      stats.push(
        `Buff: ${sign}${g.effect.buffBonus} ${g.effect.buffStat.toUpperCase().slice(0, 3)} for ${g.effect.buffDuration} turns`,
      );
    }
    if (g.effect.cureBleed) stats.push('Cures: bleed');
    if (g.effect.revealScene) stats.push('Reveals hidden scene hooks');
  }
  // arb-fix — effect-LESS food/consumables (Trail Rations and any other
  // consumable authored without a structured effect block) don't declare a
  // restore, so the eat/rest handler heals a default **2d6 HP** (rollDie(6) +
  // rollDie(6), capped at missing HP — see gameStore `rest` case). The preview
  // showed only "Tags: food", so the player couldn't tell what a ration gives
  // back. Surface the engine's actual default so the row reads honestly. Only
  // fires when there's NO structured consumable effect — an effect block with
  // no healHP heals 0 (not 2d6), so we leave those alone.
  const hasConsumableEffect = !!(g.effect && g.effect.kind === 'consumable');
  const isFoodish = g.kind === 'consumable' || g.tags.includes('food');
  if (!hasConsumableEffect && isFoodish) {
    stats.push('Restores: 2d6 HP (~7 avg)');
  }
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
