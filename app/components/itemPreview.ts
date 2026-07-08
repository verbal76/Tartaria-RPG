import {
  WEAPONS,
  ARMOR,
  AMULETS,
  RINGS,
  GEAR,
  EXPLORATION,
  MATERIALS,
  armorResistances,
  fusedArmorResistances,
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

// engine_Dev — coating-vial resists worked into an ARMOR instance (addedResists)
// weren't reflected in the item's stat preview, so a coated piece read identically
// to an uncoated one. Fold them into the "Resists:" line, tagged "(coated)" so they
// read distinct from the piece's native/laddered resists. Inserts a Resists line if
// the piece had none (placed before Durability). Returns a NEW array.
function withAddedResists(stats: string[], added?: string[]): string[] {
  if (!added || added.length === 0) return stats;
  const out = [...stats];
  const tag = added.map((r) => `${r} (coated)`).join(', ');
  const idx = out.findIndex((s) => s.startsWith('Resists:'));
  if (idx >= 0) {
    out[idx] = `${out[idx]}, ${tag}`;
  } else {
    const line = `Resists: ${tag}`;
    const durIdx = out.findIndex((s) => s.startsWith('Durability:'));
    if (durIdx >= 0) out.splice(durIdx, 0, line);
    else out.push(line);
  }
  return out;
}

// OTA-195 — uniqueStats-aware preview. When the caller has the
// InventoryItem (most call sites do), prefer this entry point so a
// fused item renders its unique stats instead of falling through to
// inferGear (which would only see the name keywords).
export function getItemPreviewForInstance(item: {
  name: string;
  uniqueStats?: import('../engine/types').UniqueItemStats;
  durability?: { current: number; max: number };
  instanceStats?: { acBonus?: number; statBonuses?: { stat: string; amount: number }[] };
  addedResists?: string[];
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
    // arb117 — fused ARMOR shows its laddered resist set (Rare 2 / Legendary 3),
    // matching what aggregateArmor applies; weapons/dog-vests keep the single line.
    if (u.kind === 'armor') {
      const fr = fusedArmorResistances(item.name, u.rarity, u.resistance);
      if (fr.length > 0) stats.push(`Resists: ${fr.join(', ')}`);
    } else if (u.resistance) {
      stats.push(`Resists: ${u.resistance}`);
    }
    if (u.special) stats.push(`Special: ${u.special}`);
    stats.push(`Durability: ${u.durability.current}/${u.durability.max}`);
    return {
      name: item.name,
      kindLabel,
      rarity: u.rarity,
      description: item.description ?? '',
      stats: withAddedResists(stats, item.addedResists),
    };
  }

  const base = getItemPreview(item.name);
  // No per-instance roll → plain catalog preview (legacy saves, non-gear), but
  // still fold in any coating-applied resists.
  if (!item.instanceStats && !item.durability) {
    return item.addedResists?.length ? { ...base, stats: withAddedResists(base.stats, item.addedResists) } : base;
  }

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

  return { ...base, stats: withAddedResists(stats, item.addedResists) };
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
  // arb116 — show the EFFECTIVE (rarity/material-derived) resists, so what the
  // player reads on the piece is exactly what mitigates in combat.
  const resists = armorResistances(a);
  if (resists.length > 0) stats.push(`Resists: ${resists.join(', ')}`);
  if (a.statBonus) stats.push(`${a.statBonus.stat.toUpperCase().slice(0, 3)} +${a.statBonus.amount}`);
  if (a.baseDurability !== undefined) stats.push(`Durability: ${a.baseDurability}`);
  return { name: a.name, kindLabel: `${slotLabel} Armor`, rarity: a.rarity, description: a.description, stats };
}

function previewAccessory(x: CatalogAccessory, kind: 'Amulet' | 'Ring'): ItemPreview {
  const stats: string[] = [];
  if (x.acBonus) stats.push(`AC +${x.acBonus}`); // OTA-730 — defensive accessories
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
    // OTA-721 — surface a WEAPON-COATING's actual output so the RECIPES-tab
    // card shows what it does, not just "Tags: weapon_coating, burn". Playtester
    // ask: "you have incendiary AND another fire coating — I can't tell which
    // has the better output, I'm picking by cooler name." Now each coating row
    // reads e.g. "Coats weapon: +1d6 poison (Festering)" or "+1d4 burn, +1 STR
    // while coated (Searing)" so higher-dice / stat-bonus variants are legible.
    if (g.effect.coating) {
      const c = g.effect.coating;
      const bonus = c.statBonus ? `, +${c.statBonus.amount} ${c.statBonus.stat.toUpperCase().slice(0, 3)} while coated` : '';
      stats.push(`Coats weapon: +${c.dice} ${c.kind}${bonus} (${c.label})`);
    }
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
