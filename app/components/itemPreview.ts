import {
  WEAPONS,
  ARMOR,
  AMULETS,
  RINGS,
  GEAR,
  EXPLORATION,
  MATERIALS,
  DOG_GEAR,
  armorResistances,
  fusedArmorResistances,
  type CatalogWeapon,
  type CatalogArmor,
  type CatalogAccessory,
  type CatalogGear,
  type CatalogMaterial,
  type CatalogDogGear,
  isRecipeIngredientName,
} from '../engine/crafting';
import {
  inferWeapon,
  inferArmor,
  inferAccessory,
  inferGear,
} from '../engine/itemDefaults';
// OTA-1557 — the ranged sub-class ("Bolt-Caster", "Crossbow", "Bow", …), so the
// stat line can say WHICH kind of ranged weapon this is.
import { rangedClassLabel, reachClassFor } from '../engine/combatRules';
// OTA-1562 — the range note and the armour-piercing rule, read off the SAME
// parser the combat gate reads so the card can never promise a band or a pierce
// the swing then refuses.
import { parseWeaponEffect, applyRangeNote } from '../engine/weaponEffects';
// OTA-1668 — the same glyph the combat buttons paint and the codex GLYPHS tab
// explains, so a shop row and a swing say the damage type the same way.
import { baseDamageGlyph } from '../engine/weaponGlyphs';
import { reachBandsFor, RANGE_LABELS } from '../engine/types';
// OTA-1561 — what a rune-caster takes instead of a coating, and which stat it
// will scale on, said on the item card rather than only at the Crucible.
import { runecasterPassiveStat, runecasterPassiveSlots } from '../engine/runecasterPassives';

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
  /** ⚠⚠ OTA-1668 — ONE LINE THAT SAYS WHAT IT IS AND WHAT IT DOES, for a row a
   *  player is scanning rather than reading. Owner, about the vendor's WORKINGS
   *  TO LEARN list: *"the things you buy need more than a name, they need to
   *  tell you what they are and what they do on the button line. I understand
   *  that if you tap on it you get the full detailed view but that's an extra
   *  step. If I know it's an axe with electric base damage and it's a 2d10 then
   *  it helps me choose faster."*
   *
   *  ⚠ It is BUILT here, not assembled by the caller out of `stats`. A caller
   *  slicing `stats` would have to parse "Damage: 2d10 (electrical)" back into
   *  its parts — and the first screen to get that regex slightly wrong prints a
   *  weapon's durability where its damage should be. Each preview branch knows
   *  its own facts, so each writes its own headline. */
  headline: string;
  /** OTA-1038 — the equip slot for armor ('head' | 'chest' | 'legs' | 'cloak' |
   *  'feet' | 'hands'), absent for everything else. It was already baked into
   *  `kindLabel` as prose ("Hands Armor"), which meant any caller wanting to
   *  show or FILTER by slot had to parse English back out of it. Carried as
   *  data so the craft list can label and search on it. */
  slot?: string;
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
    // ⚠ OTA-1160 — A FUSED PIECE STILL EARNS ITS CATALOG REGEN, so it must still say
    // so. `aggregateEquippedRegen` resolves the worn piece with `findArmorByName`
    // and never looks at uniqueStats, so fusing "Echoing Steps Boots" keeps the
    // hpRegen 2 while this branch — which builds its lines from the ROLL, not the
    // catalog — would have dropped the only mention of it. Read from ARMOR by name,
    // the same key the payout uses.
    if (u.kind === 'armor') {
      const regen = regenLine(ARMOR.find((p) => p.name === item.name));
      if (regen) stats.push(regen);
    }
    stats.push(`Durability: ${u.durability.current}/${u.durability.max}`);
    return {
      name: item.name,
      kindLabel,
      // OTA-1038 — a fused piece keeps its slot too; the roll never moves it.
      slot: u.armorSlot,
      rarity: u.rarity,
      description: item.description ?? '',
      stats: withAddedResists(stats, item.addedResists),
      headline: composeHeadline(
        kindLabel,
        damageClause(u.damageDice, u.damageType),
        u.acBonus !== undefined ? `AC +${u.acBonus}` : null,
      ),
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

  // ⚠ OTA-1668 — THE HEADLINE FOLLOWS THE INSTANCE, NOT THE CATALOG. A plain
  // `{...base}` would carry the catalog's AC onto a piece whose AC was ROLLED,
  // so the row and the card would disagree about the same object — the OTA-1611
  // defect in a new place. Rebuild it from the lines this instance actually has.
  const finalStats = withAddedResists(stats, item.addedResists);
  //
  // ⚠ Splitting on ' · ' here is the exact inverse of composeHeadline's join —
  // a separator this file owns — NOT a regex over prose. The damage clause is
  // carried through UNTOUCHED rather than re-derived, because an instance never
  // changes a weapon's dice or type; only AC and attribute perks are rolled.
  const kept = base.headline.split(' · ')
    .filter((seg) => !isAcLine(seg) && !isStatLine(seg));
  const instAc = finalStats.find(isAcLine) ?? null;
  const instStat = finalStats.find(isStatLine) ?? null;
  const headline = instAc || instStat
    ? composeHeadline(kept.join(' · '), instAc, instStat)
    : base.headline;
  return { ...base, stats: finalStats, headline };
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

  // ⚠⚠⚠ OTA-1640 — THE FIFTH CATALOG, AGAIN. Owner: *"why do all My different
  // rarity dog armors all have the same stats. there's no use of having a
  // legendary if it's got the same stats as a common or a rare."* They do NOT
  // have the same stats — dogGear.json ladders AC 1/2/3/4 and combat pays it
  // (dogVestAcBonus) — but this resolver never knew dog gear existed, so a
  // Burlap Vest and an Aetheric Padded Vest both fell through to inferArmor
  // ("vest" → chest) and printed the SAME guessed line. The card lied by
  // omission on every rarity. OTA-1603 fixed the same blind spot in
  // findCatalogItem; this is the preview's copy of it.
  const dg = DOG_GEAR.find((x) => x.name.toLowerCase() === lower);
  if (dg) return previewDogGear(dg);

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


/** ⚠⚠ OTA-1668 — THE ROW LINE. Joins a kind with the one or two facts that
 *  decide a purchase, skipping anything absent, so a row reads
 *  `Melee Weapon · ⚔ 2d10 slashing · STR` rather than a name and a price.
 *  Every branch of this file passes its OWN values in; nothing here parses a
 *  `stats` string back apart, which is the mistake that would eventually print
 *  a weapon's durability where its damage belongs. */
function composeHeadline(kindLabel: string, ...bits: (string | null | undefined)[]): string {
  return [kindLabel, ...bits].filter((b): b is string => !!b && b.length > 0).join(' · ');
}

/** The damage clause a weapon row shows: glyph, dice, type. The glyph is the
 *  one the combat button paints (OTA-1636) and the codex GLYPHS tab explains
 *  (OTA-1667), so the shop and the fight teach the same symbol. */
function damageClause(dice: string | undefined, type: string | undefined): string | null {
  if (!dice || !type) return null;
  const g = baseDamageGlyph(type);
  return `${g ? `${g} ` : ''}${dice} ${type.toLowerCase()}`;
}


/** ⚠⚠⚠ OTA-1668 — WHAT LOOT IS FOR, said on the item. Owner: *"we need to define
 *  what loot is in the inventory. It's just there, but what is it for?"*
 *
 *  ⚠ IT ALREADY HAD A JOB AND NEVER SAID SO. `isForgeableLootReagent` has fed
 *  'loot'-tagged drops to the Fusing Crucible since OTA-737, and OTA-1642
 *  authored 86 enemy drops specifically to keep that hopper full. A player
 *  reading their pack had no way to learn any of it, so 175 catalog materials
 *  looked like the same undifferentiated pile.
 *
 *  ⚠⚠ AND THE ANSWER IS NOT ONE ANSWER — THE ENGINE ALREADY SPLITS THEM IN TWO,
 *  which is the reason a blanket label would have been a lie. A drop used by any
 *  recipe is DELIBERATELY excluded from the Crucible (`isRecipeIngredientName`
 *  in isForgeableLootReagent) so fusing can never cannibalise crafting. So:
 *    · named by a recipe  → a crafting ingredient, and the forge will not eat it
 *    · loot-tagged, not   → Crucible fodder
 *    · neither            → nothing claimed; it is worth what a vendor pays.
 *  This reads the SAME predicates the bench enforces, so the label and the
 *  refusal can never disagree. */
export function lootPurposeLine(item: { name: string; kind?: string; tags?: readonly string[] }): string | null {
  if (isRecipeIngredientName(item.name)) return 'crafting ingredient';
  // Lazily required: itemFusion reaches equipment/crafting and this module is
  // imported by the store, so a static import would close a cycle — the same
  // reason accessoryEffects below is lazy.
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { isForgeableLootReagent } = require('../engine/itemFusion') as typeof import('../engine/itemFusion');
    if (isForgeableLootReagent(item)) return 'Crucible fodder';
  } catch { /* the label is a courtesy; never let it cost a row */ }
  return null;
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
  // ⚠⚠ OTA-1557 — WHICH KIND OF RANGED, on the line the owner asked for it:
  // *"a boltcaster is a crossbow style weapon, it needs something like that in
  // the stats line so players know what class of ranged."* Sixty-five weapons
  // shared the two words "Ranged Weapon" and nothing told a bow from a rifle
  // from a thrown knife. See combatRules.rangedClassLabel for why the
  // precedence is what it is.
  const rangedClass = rangedClassLabel({ weaponKind: w.weaponKind, name: w.name, tags: w.tags });
  if (rangedClass) stats.push(`Class: ${rangedClass}`);
  // ⚠⚠ OTA-1562 — SAY WHAT THE BANDS ACTUALLY ARE. The effect column has been
  // saying "Short range" / "Long range" all along; as of this OTA it means
  // something, and a player deciding between a Throwing Knife and a Bone War
  // Javelin deserves the answer on the card rather than by dying at `far`.
  // Printed from the SAME resolver the gate uses, so the card cannot promise a
  // band the swing then refuses.
  const parsedRules = parseWeaponEffect(w.effect);
  if (parsedRules?.rangeNote) {
    const bands = applyRangeNote(
      reachBandsFor(reachClassFor({ weaponKind: w.weaponKind, name: w.name, tags: w.tags })),
      parsedRules.rangeNote,
    );
    stats.push(`Reach: ${bands.map((b) => RANGE_LABELS[b]).reverse().join(' → ')}`);
  }
  // ⚠⚠ …AND WHAT IT DOES TO ARMOUR, for the eight weapons that promise it. This
  // is deliberately phrased as the rule the AC step applies, not the catalog's
  // own wording, so the card and the roll can be checked against each other.
  if (parsedRules?.armorIgnore) {
    const ig = parsedRules.armorIgnore;
    stats.push(
      ig.scope === 'points' ? `Pierces ${ig.points} point${ig.points === 1 ? '' : 's'} of armour`
      : ig.scope === 'light' ? 'Pierces light armour'
      : ig.scope === 'nonmagical' ? 'Pierces armour that is not itself magical'
      : ig.scope === 'shields' ? 'Pierces raised shields'
      : 'Pierces armour',
    );
  }
  // ⚠⚠ OTA-1645 — AND WHAT A SHIELD IS WORTH TO YOUR OWN AC, which the card has
  // printed since the catalog was written and the game never delivered. Phrased
  // as the rule the AC step now applies, for the same reason the pierce line
  // above is: the card and the number on the sheet have to be checkable against
  // each other. The `vs` half says its type out loud, because "+2 AC" and "+2 AC
  // against fire only" are very different purchases.
  if (parsedRules?.shieldAc) {
    const sa = parsedRules.shieldAc;
    if (sa.flat) stats.push(`AC +${sa.flat} while held`);
    if (sa.vs) stats.push(`AC +${sa.vs.amount} against ${sa.vs.types.join(' / ')} damage`);
  }
  // ⚠⚠ OTA-1564 — AND WHAT IT DOES WHEN THE DICE COME UP PERFECT, plus the cost
  // it charges for the privilege. A repeater's volume and a firearm's overheat
  // are the two halves of the same buying decision, so they belong on the same
  // card rather than one being a pleasant surprise and the other an ambush.
  if (parsedRules?.shotsPerRound && parsedRules.shotsPerRound > 1) {
    stats.push(`Fires ${parsedRules.shotsPerRound}× per round (${parsedRules.shotsPerRound}× damage dice)`);
  }
  if (parsedRules?.maxRollFloor) {
    stats.push(`Rolls of ${parsedRules.maxRollFloor}+ count as a max roll`);
  }
  // ⚠⚠ OTA-1643 (slice 4a) — SAY THE RIDER AS A RULE, not only as the sentence
  // the catalog wrote. Eight weapons promise bonus damage on every hit and three
  // promise poison that lasts; until this OTA none of them paid, so a line here
  // is the only way a player can tell the difference between the version that
  // did nothing and the version that does. Phrased as the arithmetic the swing
  // applies, matching how armour-ignore and the max-roll payload read above.
  if (parsedRules?.flatRider) {
    const r = parsedRules.flatRider;
    const amount = r.dice ?? String(r.flat ?? 0);
    stats.push(`Every hit: +${amount}${r.type ? ` ${r.type}` : ''} damage`);
  }
  if (parsedRules?.riderDot) {
    const d = parsedRules.riderDot;
    const gate = d.threshold !== undefined ? `On rolls of ${d.threshold}+: ` : 'On hit: ';
    const who = d.restrictedTo ? ` — ${d.restrictedTo.replace('_', ' ')} targets only` : '';
    stats.push(`${gate}${d.dice} ${d.type}/turn for ${d.rounds} turn${d.rounds === 1 ? '' : 's'}${who}`);
  }
  if (parsedRules?.onMaxRoll) {
    const m = parsedRules.onMaxRoll;
    const parts: string[] = [];
    if (m.bonusDice) parts.push(`+${m.bonusDice} damage`);
    if (m.bonusFlat) parts.push(`+${m.bonusFlat} damage`);
    if (m.shredDice) parts.push(`strips ${m.shredDice} armour`);
    if (m.pierce) parts.push(m.pierce === 'shields' ? 'opens the shield' : 'opens the armour');
    if (m.permanentStat) {
      parts.push(`+${m.permanentStat.amount} ${m.permanentStat.stat.toUpperCase().slice(0, 3)} permanently`);
    }
    // ⚠ OTA-1566 — say that the unlock is PERMANENT, because that is the whole
    // reason to chase the first one. A player who reads "opens the shield" and
    // does not know it stays open has been told the smaller half of the truth.
    if (m.permanentPierce) {
      parts.push(`${m.permanentPierce === 'shields' ? 'shields' : 'armour'} bypassed permanently from then on`);
    }
    if (parts.length > 0) {
      stats.push(`On your ${m.onceEver ? 'FIRST' : ''} max damage roll${m.onceEver ? ' (once ever)' : ''}: ${parts.join('; ')}`.replace('your  max', 'a max'));
    }
  }
  // ⚠⚠⚠ OTA-1565 — THE BLAST, AND WHO IS INSIDE IT. Friendly fire is stated
  // here because this card is the only warning a player gets before they buy a
  // weapon that can kill their own dog. A weapon whose card hides its cost is
  // the same defect as one whose card hides its effect.
  if (parsedRules?.splash) {
    const s = parsedRules.splash;
    stats.push(
      `${s.whenMaxRoll ? 'On a max damage roll: ' : ''}${s.dice} to every other enemy in the target's range`
      + (s.hitsAllies ? ' — AND to your companions in it' : ''),
    );
  }
  if (parsedRules?.overheat) {
    const o = parsedRules.overheat;
    stats.push(
      `Natural 1: ${o.word}s${o.confirmed ? ' (even/odd to confirm)' : ''} — unusable ${o.rounds} round${o.rounds === 1 ? '' : 's'}${o.selfDice ? `, ${o.selfDice} to you` : ''}`,
    );
    // ⚠⚠ OTA-1566 — THE FUSE IS PART OF THE PURCHASE. A weapon that eventually
    // detonates in your hands has to say so on the card, not only in the log
    // line the fourth time it heats up.
    if (o.explodeAfter) {
      stats.push(`After ${o.explodeAfter} ${o.word}s it EXPLODES: ${o.explodeDice ?? '1d10'} to everything at arm's reach, you included`);
    }
  }
  // ⚠ AND THE ONE-LINE RULE A RUNE-CASTER LIVES BY, said on the item rather than
  // only in a refusal the player has to trip over. Owner: *"a runecaster is a
  // power weapon so it can only use the power it can generate, so you cannot
  // apply coatings."*
  if (w.weaponKind === 'runecaster') {
    // OTA-1561 — and what it takes INSTEAD, with the stat named, so the card
    // explains the trade rather than only the refusal.
    const rs = runecasterPassiveStat({ weaponKind: w.weaponKind, damageType: w.damageType, tags: w.tags });
    const slots = runecasterPassiveSlots({ rarity: w.rarity, tags: w.tags });
    stats.push('Power weapon — takes no coating');
    stats.push(`Crucible: up to ${slots} passives, scaling with ${String(rs).slice(0, 3).toUpperCase()}`);
  }
  if (w.baseDurability !== undefined) stats.push(`Durability: ${w.baseDurability}`);
  return {
    name: w.name, kindLabel, rarity: w.rarity, description: w.description, stats,
    headline: composeHeadline(
      kindLabel,
      damageClause(w.damageDice, w.damageType),
      `${w.stat.toUpperCase().slice(0, 3)}`,
    ),
  };
}

function previewArmor(a: CatalogArmor): ItemPreview {
  const slotLabel = a.slot.charAt(0).toUpperCase() + a.slot.slice(1);
  const stats: string[] = [`AC +${a.acBonus}`];
  // arb116 — show the EFFECTIVE (rarity/material-derived) resists, so what the
  // player reads on the piece is exactly what mitigates in combat.
  const resists = armorResistances(a);
  if (resists.length > 0) stats.push(`Resists: ${resists.join(', ')}`);
  if (a.statBonus) stats.push(`${a.statBonus.stat.toUpperCase().slice(0, 3)} +${a.statBonus.amount}`);
  // ⚠ OTA-1160 — REGEN WAS INVISIBLE ON EVERY SURFACE. Owner: "how am I supposed to
  // know I had regen, I almost sold these." He was wearing Echoing Steps Boots —
  // hpRegen 2, which is the ENTIRE HP_REGEN_CAP — and the inventory row read
  // "AC +2 · DEX +2". 93 of 293 armour pieces carry regen (31 hpRegen, 62
  // staminaRegen) and not one of them said so anywhere: not the row, not the
  // preview, not the vendor list. A property the player cannot see is one they sell
  // by accident, and on several Commons it is the best line on the item.
  // ⚠ Placed BEFORE Durability deliberately. The instance path below rebuilds a
  // fused piece by KEEPING every line that is not AC / stat / durability, so a line
  // added here survives fusion for free — which matters, because
  // aggregateEquippedRegen looks the piece up by NAME and pays out on a fused copy
  // exactly the same.
  const regen = regenLine(a);
  if (regen) stats.push(regen);
  // ⚠ OTA-1671 — the bite-back says WHAT it returns, and the answer is "whatever
  // hit you". The dog vest's line names aetheric because that vest always
  // returns aetheric; this one must not, or the card promises a type the engine
  // will not pay (the OTA-1611 lie).
  if (a.reflect) stats.push(`Bites back: ${a.reflect} damage to whatever hits you, in its own element`);
  if (a.baseDurability !== undefined) stats.push(`Durability: ${a.baseDurability}`);
  return {
    name: a.name, kindLabel: `${slotLabel} Armor`, slot: a.slot, rarity: a.rarity,
    description: a.description, stats,
    headline: composeHeadline(
      `${slotLabel} Armor`,
      `AC +${a.acBonus}`,
      a.statBonus ? `${a.statBonus.stat.toUpperCase().slice(0, 3)} +${a.statBonus.amount}` : null,
    ),
  };
}

/** OTA-1640 — a dog vest's card says what the vest does for the DOG, in the same
 *  grammar the player's armour uses, and only what combat actually pays:
 *  `dogVestAcBonus` (AC), `dogVestStatBonus` (the stat), `dogVestReflect` (the
 *  bite-back). A line here with no reader in combat would be the OTA-1611 lie. */
function previewDogGear(d: CatalogDogGear): ItemPreview {
  const stats: string[] = [`AC +${d.acBonus} (dog)`];
  if (d.statBonus) stats.push(`${d.statBonus.stat.toUpperCase().slice(0, 3)} +${d.statBonus.amount} (dog)`);
  if (d.reflectsCorruption) stats.push(`Bites back: ${d.reflectsCorruption} aetheric to whatever hits the dog`);
  if (d.faction) stats.push(`Faction: ${d.faction}`);
  if (d.baseDurability !== undefined) stats.push(`Durability: ${d.baseDurability}`);
  return {
    name: d.name, kindLabel: 'Dog Vest', rarity: d.rarity, description: d.description, stats,
    headline: composeHeadline(
      'Dog Vest',
      `AC +${d.acBonus}`,
      d.reflectsCorruption ? 'bites back' : null,
    ),
  };
}

/** OTA-1160 — ONE spelling of the regen line, so the row, the preview and the fused
 *  path can never word it differently. Null when the piece has none.
 *  ⚠ It says "per action" because that is the real cadence: it ticks once per
 *  command inside submitPlayerAction — not per hour, not per rest. A player who
 *  assumes "per hour" will badly under-rate a +2, which is exactly what happened. */
export function regenLine(
  a: { hpRegen?: number; staminaRegen?: number } | null | undefined,
): string | null {
  if (!a) return null;
  const parts: string[] = [];
  if (a.hpRegen) parts.push(`+${a.hpRegen} HP`);
  if (a.staminaRegen) parts.push(`+${a.staminaRegen} stamina`);
  return parts.length ? `Regen: ${parts.join(' / ')} per action` : null;
}

function previewAccessory(x: CatalogAccessory, kind: 'Amulet' | 'Ring'): ItemPreview {
  const stats: string[] = [];
  if (x.acBonus) stats.push(`AC +${x.acBonus}`); // OTA-730 — defensive accessories
  if (x.statBonus) stats.push(`${x.statBonus.stat.toUpperCase().slice(0, 3)} +${x.statBonus.amount}`);
  // OTA-1649 — a row may carry more than one stat now. The primary keeps its
  // own line above; these are the extras, in the same shape.
  for (const b of x.statBonuses ?? []) stats.push(`${b.stat.toUpperCase().slice(0, 3)} +${b.amount}`);
  // ⚠⚠ OTA-1649 — THE RESIST LINE NOW NAMES A NUMBER. It read "Resists:
  // aetheric" for the whole life of this catalog while the game charged nothing
  // for it — the entries never reached the damage math at all. They do now, so
  // the card states the mitigation the wearer actually gets. Reading the
  // percentage off the SAME table combat reads is the point: the card cannot
  // drift from the fight.
  const ae = accessoryEffects();
  if (x.resistances.length > 0) {
    const pct = Math.round(ae.accessoryResistWeight(kind === 'Ring' ? 'ring' : 'amulet', x.rarity) * 100);
    // ⚠⚠⚠ OTA-1652 — SAY WHAT THE PERCENTAGE REDUCES. This read "Resists
    // degradation (−6% each, stacks with armour)" and the owner reasonably took
    // it for a DURABILITY buff: *"the ring that I have on is -6% then it slows
    // down the wear and tear of your items by 6% each and it says stackable with
    // armor."* A bare −6% beside a word doesn't say −6% of what, and because
    // degradation was a type nothing dealt, nothing in play ever contradicted the
    // reading. The type is live now (it folds into acid) and the line names its
    // object.
    stats.push(`Resists ${x.resistances.join(', ')}: −${pct}% incoming damage of each, on top of armour`);
  }
  if (x.coatedBoost?.kind) {
    stats.push(`${x.coatedBoost.kind} coatings bite +${Math.round(ae.COATED_BOOST_PCT[x.rarity] * 100)}%`);
  }
  if (x.wearWard) {
    // ⚠ OTA-1653 — say it plainly, and say what it covers. This is the buff the
    // owner invented by misreading the resist line; the copy that replaces it
    // must not be misreadable in turn.
    stats.push(`Everything you wear or wield lasts ${Math.round(ae.WEAR_WARD_PCT[x.rarity] * 100)}% longer`);
  }
  if (x.stealthDamage) {
    stats.push(`Strikes from stealth deal +${Math.round(ae.STEALTH_DAMAGE_PCT[x.rarity] * 100)}%`);
  }
  if (x.burst?.damageType) {
    // ⚠ "ONCE PER FIGHT" GOES ON THE CARD. It is the entire cost of the effect,
    // and a discharge that reads as repeatable is a card promising something the
    // game will refuse on the second swing.
    stats.push(`Discharges ${ae.BURST_DAMAGE[x.rarity]} ${x.burst.damageType} at ${x.burst.bands.join('/')} range — once per fight`);
  }
  if (x.baseDurability !== undefined) stats.push(`Durability: ${x.baseDurability}`);
  return {
    name: x.name, kindLabel: kind, rarity: x.rarity, description: x.description, stats,
    // An accessory's whole point is its one effect, and stats[0] IS that effect
    // for every branch above — there is no dice/AC pair to name instead.
    headline: composeHeadline(kind, stats[0] ?? null),
  };
}

/** Lazy require — accessoryEffects reaches equipment.ts, and gameStore imports
 *  this module, so a static import would close a cycle. Same pattern the heal
 *  scaler below uses. */
function accessoryEffects(): typeof import('../engine/accessoryEffects') {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('../engine/accessoryEffects') as typeof import('../engine/accessoryEffects');
}

/** OTA-994 — the preview promises what USE will actually deliver: the #120-scaled
 *  heal for the live character's frame. Outside a live game (no player yet)
 *  the flat catalog value stands. Lazy store require — gameStore imports this
 *  module, so a static import would cycle. */
export function effectiveHealAmount(flatHeal: number): { amount: number; scaled: boolean } {
  let hpMax = 0;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useGameStore } = require('../state/gameStore') as typeof import('../state/gameStore');
    hpMax = useGameStore.getState().player?.hpMax ?? 0;
  } catch { /* no live store (cold boot) — the flat value stands */ }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { scaledHealHP } = require('../engine/itemEffect') as typeof import('../engine/itemEffect');
  const amount = hpMax > 0 ? scaledHealHP(flatHeal, hpMax) : flatHeal;
  return { amount, scaled: amount !== flatHeal };
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
    if (g.effect.healHP) {
      const heal = effectiveHealAmount(g.effect.healHP);
      restoreParts.push(`+${heal.amount} HP${heal.scaled ? ' (your frame)' : ''}`);
    }
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
    // OTA-704 — surface a WEAPON-COATING's actual output so the RECIPES-tab
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
  return {
    name: g.name, kindLabel, rarity: g.rarity, description: g.description, stats,
    headline: composeHeadline(kindLabel, stats.find((l) => l.startsWith('Restores:')) ?? null),
  };
}

function previewMaterial(m: CatalogMaterial): ItemPreview {
  return {
    name: m.name,
    kindLabel: 'Material',
    rarity: m.rarity,
    description: m.description,
    stats: m.tags.length > 0 ? [`Tags: ${m.tags.slice(0, 4).join(', ')}`] : [],
    headline: composeHeadline('Material', lootPurposeLine(m)),
  };
}
