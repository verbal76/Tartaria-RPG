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
import type { ItemEffect, StatKey } from './itemEffect';
import { getCachedSynth } from './itemSynthesisCache';

const INFERRED_EVER: Set<string> = new Set();

let onInferred: ((label: string) => void) | null = null;

/** OTA-191 — fire-and-forget callback installed by gameStore.hydrate
 *  that kicks off a Qwen synthesis call when an inferred-gear row
 *  doesn't have a cached overlay yet. The Qwen result lands in the
 *  cache; the NEXT lookup picks it up automatically. Wired this way
 *  (instead of calling Qwen inline) because itemDefaults.ts is the
 *  fast synchronous path — we never block here. */
let qwenSynthRequester: ((name: string, hintTags: readonly string[]) => void) | null = null;
export function setQwenSynthRequester(
  cb: ((name: string, hintTags: readonly string[]) => void) | null,
): void {
  qwenSynthRequester = cb;
}

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

/** OTA-191 — flavor effect string for inferred weapons. Pattern-
 *  matched on the name so a "Shock Rod" gets the same shock flavor as
 *  an authored "Storm Rod" would. The string is mostly flavor today
 *  (rare combat resolvers like bleed/stun read it) but matches the
 *  authored-row shape so a future hook can light it up uniformly. */
function inferWeaponEffectString(name: string): string | undefined {
  const lower = name.toLowerCase();
  if (/\b(razor|serrated|jagged|thornblade|barbed)\b/.test(lower)) {
    return 'On a critical hit: target bleeds for 1 turn (1d4 damage at the start of their next turn).';
  }
  if (/\b(storm|shock|lightning|spark|volt|electric|tesla)\b/.test(lower)) {
    return 'On a critical hit: target is stunned for 1 turn.';
  }
  if (/\b(flame|fire|burn|ember|kindle|pyre|torch)\b/.test(lower)) {
    return 'On a hit: target catches fire for 1d4 turns (1 damage per turn).';
  }
  if (/\b(venom|poison|toxic|envenom)\b/.test(lower)) {
    return 'On a hit: target is poisoned for 1d4 turns (1 damage per turn).';
  }
  return undefined;
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
  const effect = inferWeaponEffectString(name);
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
    description: `${h.kind === 'ranged' ? 'A ranged weapon' : h.kind === 'runecaster' ? 'An Aether-channeling focus' : 'A melee weapon'}, sized for a reclaimer's hand.`,
    ...(effect ? { effect } : {}),
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

/** OTA-191 — pick up keyword-based resistances so an inferred
 *  "Flame-Hardened Vest" comes with `burn` resistance, a "Mud-Sealed
 *  Cloak" with `poison`, etc. Mirrors how authored armor rows in
 *  armor.json carry a `resistances` array. */
function inferArmorResistances(name: string): string[] {
  const out: string[] = [];
  const lower = name.toLowerCase();
  if (/\b(aether|aetheric|etheric|ether)\b/.test(lower)) out.push('aetheric');
  if (/\b(flame|fire|burn|ember|pyre|heat)\b/.test(lower)) out.push('burn');
  if (/\b(frost|ice|cold|chill|winter)\b/.test(lower)) out.push('cold');
  if (/\b(toxin|poison|venom|toxic|fume)\b/.test(lower)) out.push('poison');
  if (/\b(mud|sludge|silt|peat|sealed)\b/.test(lower)) out.push('degradation');
  if (/\b(shock|spark|storm|volt|tesla)\b/.test(lower)) out.push('electrical');
  if (/\b(plate|hardened|reinforced|armored)\b/.test(lower)) out.push('bludgeoning');
  return Array.from(new Set(out));
}

export function inferArmor(name: string): CatalogArmor | null {
  const matched = ARMOR_HEURISTICS.find((a) => a.pattern.test(name));
  if (!matched) return null;
  const h = matched.h;
  const aether = /\b(aether|aetheric|aetherstone|etheric|ether)\b/i.test(name);
  const rarity: Rarity = aether ? 'Uncommon' : 'Common';
  const resistances = inferArmorResistances(name);
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
    description: `Worn armor, sized for a reclaimer's frame.`,
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
    description: `${isAmulet ? 'An amulet' : 'A ring'} carried close to the skin.`,
  };
}

// ---------------------------------------------------------------------
// Gear / misc inference (consumables + relics + generic items)
// ---------------------------------------------------------------------

/** OTA-191 — rarity-scaled consumable yields. Common food restores
 *  3 HP / 2 stamina, Uncommon 6/4, Rare 10/6. Drinks lean stamina-
 *  heavy. Matches the floor of authored gear.json entries (Wild
 *  Onion: 3 HP, Blue Cap Draught: 5 HP / 3 stamina + buff). */
function consumableEffectFor(
  classification: 'food' | 'drink' | 'fungus',
  rarity: Rarity,
  name: string,
): ItemEffect {
  const tier = rarity === 'Rare' ? 2 : rarity === 'Uncommon' ? 1 : 0;
  if (classification === 'food') {
    return {
      kind: 'consumable',
      healHP: [3, 6, 10][tier]!,
      restoreStamina: [2, 4, 6][tier]!,
    };
  }
  if (classification === 'drink') {
    // Pick a buff stat from the name when the word suggests it.
    const lower = name.toLowerCase();
    let buffStat: StatKey | undefined;
    if (/\b(strength|might|iron|stout|warrior|battle)\b/.test(lower)) buffStat = 'strength';
    else if (/\b(swift|quick|nimble|sprint|cunning)\b/.test(lower)) buffStat = 'dexterity';
    else if (/\b(scholar|mind|focus|insight|wise|sage|aether|spell|brew)\b/.test(lower)) buffStat = 'intelligence';
    else if (/\b(seer|sight|patient|silver|moon|serene)\b/.test(lower)) buffStat = 'wisdom';
    else if (/\b(grace|gilded|charm|silver|honey)\b/.test(lower)) buffStat = 'charisma';
    const base: ItemEffect = {
      kind: 'consumable',
      healHP: [2, 4, 6][tier]!,
      restoreStamina: [3, 5, 8][tier]!,
    };
    if (buffStat) {
      return { ...base, buffStat, buffBonus: 1, buffDuration: 3 + tier };
    }
    return base;
  }
  // fungus
  return {
    kind: 'consumable',
    restoreStamina: [2, 3, 5][tier]!,
    ...(rarity === 'Rare' ? { buffStat: 'wisdom' as const, buffBonus: 1, buffDuration: 3 } : {}),
  };
}

/** OTA-191 — material tag pack for misc gear so canScrap (scrapEngine
 *  .ts:34) passes and scrapOutputFor routes to the right materials.
 *  Without these, an inferred rope / lantern / compass has tags=[]
 *  and scrap refuses with "nothing to break down here." */
function inferGearTagPack(name: string): string[] {
  const lower = name.toLowerCase();
  const out: string[] = [];
  if (/\b(rope|cord|line|chain|cable|braid|sinew)\b/.test(lower)) out.push('fiber');
  if (/\b(torch|lantern|lamp|candle|brazier|sconce)\b/.test(lower)) { out.push('metal'); out.push('fiber'); }
  if (/\b(compass|sextant|chronometer|gauge|dial|instrument)\b/.test(lower)) out.push('metal');
  if (/\b(bone|skull|tooth|fang|claw|tusk)\b/.test(lower)) out.push('organic');
  if (/\b(crystal|shard|gem|geode|prism)\b/.test(lower)) out.push('crystal');
  if (/\b(plate|sheet|tin|iron|bronze|copper|brass|steel)\b/.test(lower)) out.push('metal');
  if (/\b(stone|rock|slab|brick)\b/.test(lower)) out.push('stone');
  if (/\b(wood|stick|haft|plank|timber|log)\b/.test(lower)) out.push('wood');
  if (/\b(cloth|linen|silk|rag|wrap|fabric|tapestry)\b/.test(lower)) out.push('cloth');
  if (/\b(glass|vial|flask|bottle|jar|phial)\b/.test(lower)) out.push('crystal');
  return Array.from(new Set(out));
}

export function inferGear(name: string, tags: readonly string[] = []): CatalogGear {
  const isFood = /\b(ration|bread|jerky|stew|food|meal|fruit|tuber|cheese|honey|pie|cake|biscuit|loaf|porridge|onion|carrot|broth|soup|roast)\b/i.test(name);
  const isDrink = /\b(beer|mead|wine|spirit|whiskey|ale|grog|potion|elixir|tonic|draught|distillate|brew|tea|cordial|nectar)\b/i.test(name);
  const isLight = /\b(torch|lantern|lamp|glowstone|candle|brazier)\b/i.test(name);
  const isRope = /\b(rope|chain|cord|line|cable)\b/i.test(name);
  const isCompass = /\b(compass|sextant|chronometer|map)\b/i.test(name);
  const isFungus = /\b(fungus|mushroom|sporecap|shroom|lichen|moss)\b/i.test(name);
  const aether = /\b(aether|aetheric|aetherstone|etheric|ether)\b/i.test(name);
  let kind: CatalogGear['kind'] = 'misc';
  let description = `A reclaimer's find. Useful in the right hands.`;
  let effect: ItemEffect | undefined;
  const rarity: Rarity = aether ? 'Uncommon' : 'Common';

  if (isFood) {
    kind = 'consumable';
    description = 'Edible. Restores a measure of strength when eaten.';
    effect = consumableEffectFor('food', rarity, name);
  } else if (isDrink) {
    kind = 'consumable';
    description = 'A drink. Restores stamina; some carry a brief buff.';
    effect = consumableEffectFor('drink', rarity, name);
  } else if (isFungus) {
    kind = 'consumable';
    description = 'A wild fungus. Restores stamina; rare specimens sharpen the mind for a stretch.';
    effect = consumableEffectFor('fungus', rarity, name);
  } else if (isLight) {
    // Torches are 'relic' kind in the authored catalog (Aetheric Torch).
    // Match that so vendors / scrap / equipped-light all route the
    // same way. The consumable effect lets `use torch` extend the
    // light buff exactly like the authored Aetheric Torch does.
    kind = 'relic';
    description = 'A light source. Holds back the dark; consuming it extends the light buff.';
    effect = {
      kind: 'consumable',
      extendLight: aether ? 6 : 4,
    };
  } else if (isCompass) {
    description = 'An instrument of bearings. Carried in your pack, it sharpens your read on the world by a touch.';
    effect = { kind: 'passive', stat: 'wisdom', bonus: 1 };
  } else if (isRope) {
    description = 'Cordage. Tied around the right thing it solves problems heavier tools cannot.';
    // OTA-191 — climb_steep gate so an inferred rope works the same
    // way an authored Climbing Rope does (the CLIMB button turns
    // green, climb-up resolves). Mirrors inventoryHasGate at
    // itemEffect.ts:154.
    effect = { kind: 'gate', unlocks: 'climb_steep' };
  }

  const tagPack = inferGearTagPack(name);
  // Misc items with NO material tag still fail canScrap. Add a baseline
  // 'improvised' tag so scrapOutputFor falls through to its default
  // (Stick + Small Rock). Consumables and relics aren't scrap-routed
  // through the misc branch, so they don't need it.
  const baselineScrap = kind === 'misc' && tagPack.length === 0 ? ['improvised'] : [];

  note(`gear:${name}`);

  // OTA-191 — Qwen overlay. If a cached synthesis exists (LLM has seen
  // this item before in this install), merge its effect / tags /
  // description on top of the static-inference row. The cache is the
  // source of truth for Qwen-balanced rows. Cache miss + no static
  // effect classification → fire-and-forget a Qwen synth call so the
  // NEXT inventory open has the enriched stats.
  const cached = getCachedSynth(name);
  const finalEffect: ItemEffect | undefined = cached?.effect ?? effect;
  const finalDescription = cached?.description ?? description;
  const finalTags = Array.from(new Set([
    ...tags,
    ...tagPack,
    ...baselineScrap,
    ...(cached?.extraTags ?? []),
    ...(aether ? ['aether'] : []),
  ]));

  // Only request Qwen synthesis when the static inference produced
  // a generic "Field-inferred" row with no effect AND no specific
  // classification (the name didn't match food/drink/light/rope/etc.).
  // Items the static path already classified confidently don't need
  // the LLM to second-guess them.
  if (!cached && !effect && kind === 'misc' && tagPack.length === 0) {
    try {
      qwenSynthRequester?.(name, finalTags);
    } catch {
      // ignore — synth is opportunistic
    }
  }

  return {
    name,
    kind,
    rarity,
    tags: finalTags,
    description: finalDescription,
    ...(finalEffect ? { effect: finalEffect } : {}),
  };
}
