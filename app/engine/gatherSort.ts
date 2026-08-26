// ⚠⚠ OTA-1232 — WHAT THE LOOT POPUP HAS TO ANSWER, ANSWERED IN THE POPUP.
//
// Owner, designing the merged take/salvage picker: *"can we have the nouns sorted
// maybe place a sword on weapons, a shield on armor and have them first, then I
// can manage what I need and hit salvage all later."* Right shape — decisions
// first, bulk afterwards — with one addition that came out of the discussion:
//
// ⚠ THE QUESTION A PLAYER ACTUALLY ASKS OF A LOOT ROW IS NOT "WHAT SLOT IS THIS",
// IT IS "IS THIS BETTER THAN WHAT I AM WEARING." Sorting by slot puts the right
// rows near the top; it does not answer the question. Without a mark, answering it
// means leaving the popup, opening Inventory, comparing, and coming back — for
// each piece. So `upgrade` is computed here and sorts ABOVE the slot groups.
//
// ⚠⚠ COMPARED AGAINST REAL CATALOG NUMBERS, NOT PARSED PROSE. `getItemPreview`
// renders lines like "AC +2" and "Damage: 2d6 (slashing)" for humans; reading the
// numbers back out of those strings would make this helper break the day someone
// rewords a label. Armor compares `acBonus` from the ARMOR catalog against the
// piece equipped in the SAME slot; weapons compare average damage-dice against the
// equipped main hand. Both come from the same tables the combat engine rolls on.
//
// ⚠ AN UNKNOWN IS NEVER AN UPGRADE. Anything that does not resolve to a catalog
// entry, and any slot the player has nothing in yet, is handled explicitly below
// rather than falling out of a comparison against undefined.
import type { PlayerCharacter, InventoryItem, EquipSlot } from './types';
import { WEAPONS, ARMOR, findCatalogItem, findWeaponByName } from './crafting';
import { inferArmor } from './itemDefaults';
import { resolveEquippedItem } from './equipment';
import { reachBandsFor, type WeaponReachClass } from './types';   // OTA-1277
import { reachClassFor } from './combatRules';           // OTA-1277

export type GatherKind = 'weapon' | 'armor' | 'other' | 'scenery' | 'inert' | 'lead';

/** Mean roll of an NdM dice string ("2d6" → 7). Returns 0 on anything
 *  unparseable, which keeps an unreadable weapon out of the upgrade lane
 *  rather than silently ranking it first. */
export function averageDamage(dice: string | null | undefined): number {
  if (!dice) return 0;
  const m = /^(\d+)\s*[dD]\s*(\d+)\s*(?:\+\s*(\d+))?$/.exec(dice.trim());
  if (!m) return 0;
  const n = Number(m[1]);
  const faces = Number(m[2]);
  const flat = m[3] ? Number(m[3]) : 0;
  if (!Number.isFinite(n) || !Number.isFinite(faces)) return 0;
  return n * ((faces + 1) / 2) + flat;
}

function weaponByName(name: string): (typeof WEAPONS)[number] | null {
  const lower = name.toLowerCase();
  return WEAPONS.find((w) => w.name.toLowerCase() === lower) ?? null;
}

function armorByName(name: string): (typeof ARMOR)[number] | null {
  const lower = name.toLowerCase();
  return ARMOR.find((a) => a.name.toLowerCase() === lower) ?? null;
}

// ⚠⚠⚠ OTA-1512 — WHAT THE WORN PIECE IS, AND WHY THE CATALOG ALONE COULD NOT SAY.
//
// Owner, on picking up a Salvager's Mask of Secrets while wearing a
// Forge-Black Cowl: *"if there was no star that means I have something
// equipped. so how come there was no red or green pyramid for the mask?"*
// He read the marks exactly right. The mask resolved fine (armor.json, head,
// AC +1). The COWL did not — it is Crucible-forged, and a forged name is
// assembled at the bench (`Forge-Black` from the metal theme bank, `Cowl`
// from the head slot nouns), so it will never appear in a hand-authored
// catalog. Every worn-side read in this file was `armorByName(worn.name)` /
// `weaponByName(main.name)` — catalog or nothing — so the comparison refused
// and the row fell through to a plain 🛡 with no slot named.
//
// ⚠⚠ THE CLASS, NOT THE CASE: that same catalog-only read appears SEVEN times
// (isUpgradeOverEquipped ×2, upgradeEquipSlot, upgradeReasonClause ×2,
// equipVerdict ×2). Any player wearing forged gear had that slot permanently
// marker-blind — and forged gear is end-game gear, so the marks went dark
// exactly when the choices start mattering. One resolver per kind, read by
// all seven, in order of authority:
//
//   1 the hand-authored catalog row — the truth when it exists;
//   2 THE FORGE'S OWN STAMP on the instance (`uniqueStats`) — a fused piece
//     carries its real acBonus/armorSlot/damageDice there, which is where the
//     equip and preview resolvers have always read it;
//   3 the name heuristic (`inferArmor` / the inference half of
//     `findWeaponByName`) that already backs equip, preview and scrap.
//
// The refusal survives where it is HONEST — a noun nothing can identify still
// returns null and still earns no mark. What changed is that "the forge made
// it" stopped counting as "unidentifiable".
//
// ⚠ `instanceStats.acBonus` outranks the catalog number for THIS copy (the
// per-instance roll, OTA-1440's rule, already honoured by every other
// resolver), so the AC the mark compares is the AC the player actually wears.
export interface WornArmorFacts {
  name: string;
  slot: string;
  acBonus: number;
  resistances?: readonly string[];
  statBonuses?: readonly { amount: number }[];
}

export function wornArmorFacts(item: InventoryItem | null | undefined): WornArmorFacts | null {
  if (!item) return null;
  let slot: string | null = null;
  let acBonus = 0;
  let resistances: readonly string[] | undefined;
  let statBonuses: readonly { amount: number }[] | undefined;
  const row = armorByName(item.name);
  const u = item.uniqueStats;
  if (row) {
    slot = row.slot;
    acBonus = row.acBonus;
    resistances = row.resistances;
    statBonuses = row.statBonuses;
  } else if (u && u.kind === 'armor' && u.armorSlot && typeof u.acBonus === 'number') {
    slot = u.armorSlot;
    acBonus = u.acBonus;
    resistances = u.resistance ? [u.resistance] : undefined;
    statBonuses = u.statBonus ? [u.statBonus] : undefined;
  } else {
    const inferred = inferArmor(item.name);
    if (inferred) {
      slot = inferred.slot;
      acBonus = inferred.acBonus;
      resistances = inferred.resistances;
      statBonuses = inferred.statBonuses;
    }
  }
  if (!slot) return null;
  return {
    name: item.name,
    slot,
    acBonus: item.instanceStats?.acBonus ?? acBonus,
    resistances,
    statBonuses,
  };
}

// ⚠ `kind` and `tags` ride along because the reach reader (OTA-1277's
// two-bands rule in upgradeEquipSlot) classifies the held weapon as well as
// scoring it, and both must come from ONE resolution or the slot and the
// damage line can disagree about what is in the hand. For a forged weapon the
// forge's own `reachClass` names the kind — and the NAME is safe to lean on
// here besides, because the bench picks the form noun to match that class
// (Spike/Maul = melee, Spear/Pike = long, Bow/Caster = ranged, OTA-955).
export interface WornWeaponFacts {
  name: string;
  damageDice: string;
  kind?: string;
  tags?: readonly string[];
}

export function wornWeaponFacts(item: InventoryItem | null | undefined): WornWeaponFacts | null {
  if (!item) return null;
  const row = weaponByName(item.name);
  if (row?.damageDice) {
    // ⚠⚠ `kind` IS DELIBERATELY NOT SET FROM `row.weaponKind`, AND THAT IS NOT A
    // TYPO. The pre-1512 code passed the raw catalog row into the reach reader
    // below, which reads `w.kind` — a field catalog rows do not have (theirs is
    // `weaponKind`). So for every catalog weapon the reader has ALWAYS seen
    // `kind: undefined` and fallen back to 'melee', letting the name and tags do
    // the classifying. That is a real latent bug, but it is a live BALANCE rule:
    // supplying the true kind here re-decides OTA-1277's main/off pairing and
    // moved a starter weapon to the other hand (ota1254 caught it). Fixing it is
    // a deliberate combat change for the owner to call, not a side effect of
    // making forged gear readable. Reproduce the old shape exactly.
    return { name: row.name, damageDice: row.damageDice, tags: row.tags };
  }
  const u = item.uniqueStats;
  if (u && u.kind === 'weapon' && u.damageDice) {
    return {
      name: item.name,
      damageDice: u.damageDice,
      kind: u.reachClass === 'ranged' ? 'ranged' : 'melee',
      tags: item.tags,
    };
  }
  // The catalog half already missed above, so this is the inference half.
  const inferred = findWeaponByName(item.name);
  return inferred?.damageDice
    ? { name: item.name, damageDice: inferred.damageDice, kind: inferred.weaponKind, tags: inferred.tags }
    : null;
}

/** ⚠⚠ Which lane a scene noun belongs in — and the distinction OTA-1233 GOT WRONG.
 *
 *  It had two answers for a non-catalog noun: scenery, meaning scrap. But
 *  "the catalog does not know it" and "it can be pried apart" are DIFFERENT
 *  QUESTIONS, and the owner's device log is what proved it:
 *
 *      tap "take / salvage"
 *      You look the firepit, marker, sack over and find nothing your tools
 *        can break down here.
 *      salvageAllAmbient: no pool matched for 4 noun(s) — firepit, marker,
 *        sack, stall.
 *
 *  The picker had counted those four as fixtures and offered
 *  "⚒ SALVAGE 4 FIXTURES". The button promised, the sweep delivered nothing,
 *  and because nothing was consumed the count never dropped — so it could be
 *  tapped forever. Owner: *"still showed salvage at 4 items but never let me
 *  salvage."*
 *
 *  ⚠ THE GALLING PART: `hasSalvageYield` was written in the PREVIOUS OTA for
 *  exactly this distinction, to stop the refusal lines advertising SALVAGE on
 *  nouns with no pool — and then this function did not consult it. The refusal
 *  copy knew the difference; the picker did not.
 *
 *  'inert' is a noun that is neither takeable NOR salvageable — a firepit, a
 *  signpost, a tent. INVESTIGATE is its verb, and it has its own picker. These
 *  are dropped from the loot list rather than shown greyed: a row you cannot act
 *  on is an invitation to the tap that fails. */
export function classifyGatherNoun(noun: string): GatherKind {
  if (findCatalogItem(noun) === null) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { hasSalvageYield } = require('./salvagePools') as typeof import('./salvagePools');
    let yields = false;
    try { yields = hasSalvageYield(noun); } catch { yields = false; }
    return yields ? 'scenery' : 'inert';
  }
  if (weaponByName(noun)) return 'weapon';
  if (armorByName(noun)) return 'armor';
  return 'other';
}

/** ⚠⚠ Is this a straight improvement on what the player has equipped RIGHT NOW?
 *
 *  Deliberately strict — the mark is only worth having if it is trustworthy:
 *   · an EMPTY slot counts as an upgrade (anything beats nothing);
 *   · a tie is NOT an upgrade (a second identical helm is inventory weight);
 *   · anything the catalog cannot resolve is NOT an upgrade, ever.
 *
 *  ⚠ It compares ONE axis per kind — AC for armor, average damage for weapons.
 *  A piece can carry stat bonuses and resists this ignores, so the mark means
 *  "better on the number that decides whether you get hit / how hard you hit",
 *  not "better in every respect". Overstating it would be worse than no mark:
 *  the player would stop reading the rows. */
export function isUpgradeOverEquipped(player: PlayerCharacter | null, noun: string): boolean {
  if (!player) return false;
  const cat = findCatalogItem(noun);
  if (cat === null) return false;

  const armor = armorByName(noun);
  if (armor) {
    const worn = equippedInSlot(player, armor.slot);
    if (!worn) return true; // nothing there — anything is an improvement
    // OTA-1512 — reads the forge's stamp and the name heuristic too, so a
    // Crucible piece is compared instead of refusing the whole slot.
    const wornArmor = wornArmorFacts(worn);
    if (!wornArmor) return false; // cannot compare honestly → do not claim
    return armor.acBonus > wornArmor.acBonus;
  }

  const weapon = weaponByName(noun);
  if (weapon) {
    // ⚠⚠ OTA-1252 — AN EMPTY HAND IS AN EMPTY SLOT. Owner: *"isn't there an option
    // to equip a picked up weapon to any empty hand?"* There is — `validSlotsForItem`
    // has returned `['main', 'off']` for every weapon since long before this file
    // existed, the off hand swings in combat (`offHandSwing`), and the quick row
    // draws an `off:` button for it. This function never looked at it: it compared
    // against the MAIN hand alone, so a weapon that could have filled a bare off
    // hand for free was not marked and had no way into it from the picker.
    //
    // ⚠ THE ARMOR BRANCH ABOVE ALREADY SAYS THE RULE — `if (!worn) return true`,
    // nothing there means anything is an improvement. The weapon branch just never
    // asked the same question of the second hand. This makes them symmetric rather
    // than inventing a new policy.
    //
    // ⚠ A TWO-HANDER IS NOT A FREE-HAND CASE: it takes both, so equipping one with
    // a full main hand DISPLACES that weapon. It earns the mark only by beating
    // what is in the main hand, the same as before.
    const main = resolveEquippedItem(player, 'main');
    if (!main) return true;
    if (weapon.style !== 'two_handed' && !resolveEquippedItem(player, 'off')) return true;
    const heldWeapon = wornWeaponFacts(main); // OTA-1512 — forged mains compare too
    if (!heldWeapon) return false;
    return averageDamage(weapon.damageDice) > averageDamage(heldWeapon.damageDice);
  }

  return false;
}

/** ⚠⚠ OTA-1498 — THE CHIP SAYS WHY. Owner, with a "Take & wield Bone Javelin"
 *  chip mid-fight: *"I don't know how it compares — why would I just grab it?"*
 *  The chip only ever exists because `isUpgradeOverEquipped` above said yes —
 *  but that verdict was invisible, so a correct offer read as a blind grab.
 *  This clause is the verdict made visible, derived from THE SAME lookups the
 *  comparator used (one derivation — a second comparison here is how the label
 *  and the mark end up disagreeing). Returns null when the noun is not an
 *  upgrade or cannot be honestly compared, mirroring the comparator's refusals.
 */
export function upgradeReasonClause(player: PlayerCharacter | null, noun: string): string | null {
  // ⚠⚠ OTA-1500 — REWRITTEN TO DERIVE FROM THE VERDICT, after its own
  // consistency test caught the two-derivations defect it warned about: the
  // first draft short-circuited on "off hand free" while `upgradeEquipSlot`'s
  // range-coverage rule (OTA-1277) was actually sending the ranged piece to
  // MAIN — a label promising one slot over a tap that filled another. The
  // clause now reads the destination the verdict names and speaks about THAT
  // slot only. `averageDamage` appears here to pick between the dice line and
  // the coverage line — the verdict itself is not re-decided.
  const v = equipVerdict(player, noun);
  if (!v || v.state === 'down' || !player) return null;
  if (v.state === 'empty') {
    return v.slot === 'off' ? 'your off hand is free'
      : v.slot === 'main' ? 'your main hand is empty'
        : `your ${equipSlotWord(v.slot)} slot is bare`;
  }
  const armor = armorByName(noun);
  if (armor) {
    const worn = resolveEquippedItem(player, v.slot);
    const wornArmor = wornArmorFacts(worn); // OTA-1512
    if (!wornArmor) return null;
    return `AC +${armor.acBonus} over your +${wornArmor.acBonus}`;
  }
  const weapon = weaponByName(noun);
  if (weapon) {
    const held = resolveEquippedItem(player, v.slot);
    const heldWeapon = wornWeaponFacts(held); // OTA-1512
    if (!heldWeapon) return null;
    if (averageDamage(weapon.damageDice) > averageDamage(heldWeapon.damageDice)) {
      return `${weapon.damageDice} over your ${heldWeapon.damageDice}`;
    }
    // Placed by OTA-1277's range-coverage rule, not by dice — say that.
    return 'covers a range your hands lack';
  }
  return null;
}


/** ⚠ The armor catalog's slot names and the player's equip slots are the same
 *  words (head / chest / hands / legs / feet / cloak) — but they are separate
 *  types, so the bridge is written out here ONCE rather than cast at each call.
 *  A catalog slot that is not an equip slot resolves to null instead of throwing,
 *  which keeps an odd piece out of the upgrade lane rather than crashing the
 *  picker that is trying to render it. */
const ARMOR_SLOT_TO_EQUIP: Readonly<Record<string, EquipSlot>> = {
  head: 'head', chest: 'chest', hands: 'hands', legs: 'legs', feet: 'feet', cloak: 'cloak',
};

/** ⚠⚠ OTA-1251 — WHERE A ★ UPGRADE GOES WHEN YOU TAP IT. Owner, on the armor
 *  beat: *"it was supposed to highlight the fact you can select and equip the vest
 *  from the popup, not from inventory."* The ★ has meant "picked and equipped at
 *  the same time" since he first asked about the mark (OTA-1237) — it was never
 *  meant to be a label you then go and act on somewhere else.
 *
 *  ⚠ Resolved from the SAME catalog lookups `isUpgradeOverEquipped` compares with,
 *  so the mark and the slot cannot disagree: a row cannot show ★ and then have
 *  nowhere to go. Returns null for anything that is not a wearable or wieldable
 *  catalog piece, and the caller falls back to a plain take.
 *
 *  ⚠⚠ IT RETURNS THE CATALOG NAME TOO, AND THAT IS NOT A CONVENIENCE. A scene noun
 *  is matched LOOSELY — "blade" resolves to a Rusted Blade — but `takeAmbientNoun`
 *  grants the item under its CATALOG name, and `equipItem` matches the pack by
 *  exact name. Equipping by the noun the player tapped would fail on every loose
 *  match with "I don't see a blade on you", which is a refusal for a take that
 *  just succeeded. One lookup, both answers. */
/** ⚠⚠ OTA-1277 — ARMOUR IS RANKED, NOT JUST SLOTTED. Owner's spec, verbatim:
 *  *"if we have multiple pieces for one slot, go towards the one that has the
 *  most resists the highest AC and any other values. so if I have a two AC
 *  resist poisons legging and I have a two AC resist poisons slashing and
 *  burning plus two dexterity leggings pick the latter."*
 *  His example is the whole rule: equal AC, so the tiebreak is resist COUNT,
 *  then the stat bonuses. AC leads because it is the thing that stops a hit. */
export function armorScore(a: { acBonus: number; resistances?: readonly string[]; statBonus?: { amount: number }; statBonuses?: readonly { amount: number }[] }): number {
  const resists = a.resistances?.length ?? 0;
  const stats = (a.statBonuses?.length ? a.statBonuses : a.statBonus ? [a.statBonus] : [])
    .reduce((n, b) => n + Math.abs(b.amount ?? 0), 0);
  // AC dominates, resists break ties, stat points break those. Weighted rather
  // than lexicographic so a piece two AC better still wins over one extra resist.
  return a.acBonus * 100 + resists * 10 + stats;
}

export function upgradeEquipSlot(
  player: PlayerCharacter | null,
  noun: string,
): { name: string; slot: EquipSlot } | null {
  const armor = armorByName(noun);
  if (armor) {
    const slot = ARMOR_SLOT_TO_EQUIP[armor.slot];
    if (!slot) return null;
    // ⚠ OTA-1277 — only claim the slot if it actually BEATS what is worn, by the
    // owner's ranking. Previously any catalog armour took the slot on sight,
    // which could downgrade a better piece already on your back.
    if (player) {
      const worn = resolveEquippedItem(player, slot);
      const wornArmor = wornArmorFacts(worn); // OTA-1512
      if (wornArmor && armorScore(armor) <= armorScore(wornArmor)) return null;
    }
    return { name: armor.name, slot };
  }
  const weapon = weaponByName(noun);
  if (!weapon) return null;
  // ⚠⚠ OTA-1252 — WHICH HAND, AND THE ORDER IS THE WHOLE ANSWER. Owner: *"isn't
  // there an option to equip a picked up weapon to any empty hand?"*
  //
  // ⚠ BETTER-THAN-MAIN WINS OVER FREE-HAND, and getting that backwards is the
  // obvious bug: fill-the-free-hand-first would drop a Bone Splitter Axe into the
  // off hand and leave a worse cudgel swinging in the main. A player picking up a
  // clearly better weapon means it for their good hand.
  //
  // ⚠ A two-hander is always 'main' — `equipItem` displaces the off hand for it
  // and says so, and main is the canonical two-handed slot everywhere else.
  if (!player || weapon.style === 'two_handed') return { name: weapon.name, slot: 'main' };
  const main = resolveEquippedItem(player, 'main');
  if (!main) return { name: weapon.name, slot: 'main' };
  const heldWeapon = wornWeaponFacts(main); // OTA-1512 — forged mains classify too
  // ⚠⚠⚠ OTA-1512 — THE OWNER'S RULE, AND IT REPLACES THE HEURISTIC: *"always
  // melee in main and ranged in off, for auto equips."*
  //
  // What stood here was OTA-1277's coverage puzzle — cover two bands first,
  // then maximise damage, with four interacting branches deciding the hand.
  // It was built from his EARLIER spec ("always recommend two different ranged
  // weapons… one long range… the other melee"), and it got the pair right
  // while leaving WHICH HAND to a damage comparison, so the same two weapons
  // could sit either way round. He has now named the hands outright. A rule he
  // can predict beats a rule that is merely defensible: he knows before he taps
  // where the thing is going to land.
  //
  // The pairing intent survives intact — a ranged piece still goes opposite a
  // melee one — it is just stated as a fact about hands instead of derived from
  // band coverage. Damage still decides WHETHER to displace (the caller only
  // asks after `isUpgradeOverEquipped` said yes), never WHERE.
  //
  // ⚠ A two-hander is exempt above: it takes both hands, so it is always main.
  const reachOf = (w: { name: string; kind?: string; tags?: readonly string[] } | null): WeaponReachClass | null =>
    w ? reachClassFor({
      weaponKind: w.kind === 'ranged' || w.kind === 'runecaster' ? w.kind : undefined,
      name: w.name,
      tags: w.tags,
    }) : null;
  /** His two buckets. `ranged` and `runecaster` shoot; `throwable` is thrown,
   *  which is the off hand's business too. Everything that closes to arm's
   *  reach — melee and the long shafts that stab from mid — is main-hand. */
  const shootsRatherThanSwings = (cls: WeaponReachClass | null): boolean =>
    cls === 'ranged' || cls === 'runecaster' || cls === 'throwable';
  const newCls = reachClassFor({ weaponKind: weapon.weaponKind, name: weapon.name, tags: weapon.tags });
  const wantedSlot: EquipSlot = shootsRatherThanSwings(newCls) ? 'off' : 'main';
  const occupant = wantedSlot === 'main' ? heldWeapon : wornWeaponFacts(resolveEquippedItem(player, 'off'));
  // The named hand is free — take it, no comparison needed.
  if (!occupant) return { name: weapon.name, slot: wantedSlot };
  // The named hand is held by something of the SAME kind: the better one wins it.
  if (shootsRatherThanSwings(reachOf(occupant)) === shootsRatherThanSwings(newCls)) {
    if (averageDamage(weapon.damageDice) > averageDamage(occupant.damageDice)) {
      return { name: weapon.name, slot: wantedSlot };
    }
    // ⚠⚠ AND IF THE OTHER HAND IS BARE, IT STILL GOES THERE — OTA-1252's rule
    // survives the new one: "an empty hand is an empty slot", and OTA-1254's
    // promise is that no race finishes the starting beat with the cudgel sitting
    // in the pack. A second melee that loses to your main is not better than
    // your main; it is still better than a bare hand. The owner's rule names
    // the PREFERRED hand, and this only fires once that hand is spoken for.
    const spare: EquipSlot = wantedSlot === 'main' ? 'off' : 'main';
    if (!resolveEquippedItem(player, spare)) return { name: weapon.name, slot: spare };
    return null;
  }
  // The named hand is held by the WRONG kind (a bow in main, a blade in off).
  // This weapon belongs there by the rule, so it takes the slot and the
  // mis-filed piece is displaced into the pack — the hands end up right.
  // (The old "both hands full and it beats neither → null" tail lived here and
  // is now unreachable: that case is answered above, inside the same-kind
  // branch, which is the only way to lose a hand you are entitled to.)
  return { name: weapon.name, slot: wantedSlot };
}

function equippedInSlot(player: PlayerCharacter, slot: string): InventoryItem | null {
  const equipSlot = ARMOR_SLOT_TO_EQUIP[slot];
  if (!equipSlot) return null;
  try {
    return resolveEquippedItem(player, equipSlot) ?? null;
  } catch {
    return null;
  }
}

// ⚠⚠ OTA-1499 — THE THREE-STATE VERDICT BEHIND THE PICKER'S MARKS. Owner:
// *"what if star was for a slot that isn't filled, and we put a green up or
// red down arrow on an item and the slot's name so we can compare it."*
//
// One derivation, layered on the two rulers that already exist:
//   · `isUpgradeOverEquipped` decides IF the row earns the one-tap equip;
//   · `upgradeEquipSlot` decides WHERE it would land (its range-coverage and
//     better-than-main policies are not re-derived here);
//   · this function only names the STATE of that destination —
//       'empty' → the slot is bare, taking it costs nothing      (★)
//       'up'    → it beats what is there, taking it displaces    (▲)
//       'down'  → it is not better than what is there            (▼, plain take)
//   Returns null for a row that is not honestly comparable (no catalog entry,
//   or the worn item is unknown) — mirroring the comparator's own refusals, so
//   the mark never claims what the tap will not do.
export type EquipVerdictState = 'empty' | 'up' | 'down';
export interface EquipVerdict { slot: EquipSlot; state: EquipVerdictState }

export function equipVerdict(
  player: PlayerCharacter | null,
  noun: string,
): EquipVerdict | null {
  if (!player) return null;
  if (isUpgradeOverEquipped(player, noun)) {
    const wear = upgradeEquipSlot(player, noun);
    if (!wear) return null; // the two rulers disagree — no claim (OTA-1457's case)
    const occupied = resolveEquippedItem(player, wear.slot) !== null;
    return { slot: wear.slot, state: occupied ? 'up' : 'empty' };
  }
  const armor = armorByName(noun);
  if (armor) {
    const slot = ARMOR_SLOT_TO_EQUIP[armor.slot];
    if (!slot) return null;
    const worn = resolveEquippedItem(player, slot);
    // ⚠ OTA-1512 — THE OWNER'S CASE. `!worn` here is unreachable (an empty slot
    // was already answered 'empty' above); the live meaning was "the worn piece
    // has no catalog row", which is every forged piece. It reads them now.
    if (!worn || !wornArmorFacts(worn)) return null;
    return { slot, state: 'down' };
  }
  const weapon = weaponByName(noun);
  if (weapon) {
    const main = resolveEquippedItem(player, 'main');
    if (!main || !wornWeaponFacts(main)) return null; // OTA-1512
    return { slot: 'main', state: 'down' };
  }
  return null;
}

/** The slot as the player reads it — hands get their word, armor slots are
 *  already words ('chest', 'head', …). One spelling, shared by tail and a11y. */
export function equipSlotWord(slot: EquipSlot): string {
  return slot === 'main' ? 'main hand' : slot === 'off' ? 'off hand' : slot;
}

export interface GatherRow {
  noun: string;
  kind: GatherKind;
  upgrade: boolean;
  consumed: boolean;
  /** OTA-1499 — the three-state mark (★ empty / ▲ up / ▼ down), or null for a
   *  row with nothing honest to compare. Optional so fixtures predating the
   *  verdict still type-check; absent reads as null. */
  verdict?: EquipVerdict | null;
}

/** ⚠ THE ORDER IS THE FEATURE: decisions first, sweepable last.
 *    ★ upgrades → ⚔ weapons → 🛡 armor → everything else takeable → scenery.
 *  Consumed rows sink within their group rather than jumping the order, so a
 *  half-looted room does not reshuffle under the player's thumb between taps.
 *  Ties break alphabetically so the list is STABLE — a picker that reorders
 *  itself while you read it is worse than one sorted badly. */
// ⚠⚠ OTA-1236 — A LEAD RANKS LAST, AND THAT IS DELIBERATE INVERSION. Everything
// else in this picker sorts decisions-first; the lead sorts LAST because the
// owner asked for it there and his reason is better than the convention: *"if it
// is there it should always be the last thing listed so the next step is right
// there to see."* The bulk buttons sit at the bottom of the card, so the last
// block is the one the player's thumb is already next to — and it is the one
// thing here no bulk button will touch.
const KIND_RANK: Record<GatherKind, number> = { weapon: 1, armor: 2, other: 3, scenery: 4, lead: 5, inert: 6 };

export function sortGatherRows(rows: readonly GatherRow[]): GatherRow[] {
  return [...rows].sort((a, b) => {
    if (a.consumed !== b.consumed) return a.consumed ? 1 : -1;
    // ⚠ OTA-1236 — the lead's rank beats the upgrade star, checked BEFORE it. A
    // lead is normally a non-catalog noun so `upgrade` is false anyway, but
    // "normally" is not a guarantee and the owner asked for last, not usually-last.
    if ((a.kind === 'lead') !== (b.kind === 'lead')) return a.kind === 'lead' ? 1 : -1;
    if (a.upgrade !== b.upgrade) return a.upgrade ? -1 : 1;
    const rank = KIND_RANK[a.kind] - KIND_RANK[b.kind];
    if (rank !== 0) return rank;
    return a.noun.localeCompare(b.noun);
  });
}

/** The mark shown at the left of a row. Kept here beside the sort so the icon
 *  and the ordering can never disagree about what a row is. */
export function gatherIcon(row: { kind: GatherKind; upgrade: boolean; verdict?: EquipVerdict | null }): string {
  // ⚠ The lead's ✦ outranks even the upgrade star: a better helm can wait, and
  // the same ✦ is what the Aetheric Torch already marks a worth-a-look noun with,
  // so the player has seen it mean exactly this before.
  if (row.kind === 'lead') return '✦';
  // ⚠⚠ OTA-1499 — the star narrows to ITS OLD PROMISE KEPT CHEAPLY: a slot that
  // is not filled. A green ▲ displaces something better-beaten; a red ▼ warns
  // the item loses to what is worn (its tap goes to the pack, and the tail says
  // so). A verdict-less upgrade row keeps the ★ so a caller that never computed
  // verdicts (older fixtures) still renders what it always did.
  if (row.verdict?.state === 'empty') return '★';
  if (row.verdict?.state === 'up') return '▲';
  if (row.verdict?.state === 'down') return '▼';
  if (row.upgrade) return '★';
  if (row.kind === 'weapon') return '⚔';
  if (row.kind === 'armor') return '🛡';
  // ⚠⚠ OTA-1237 — NOT ◆. Owner: *"why did the take items get a diamond, I thought
  // that was for upgraded armor items that you picked and equipped at the same
  // time."* He is right that the glyph was already spoken for, and closer than he
  // gave himself credit for: ◆ is the INVENTORY'S inferred-stats marker (OTA-191),
  // and it is also the contract map pin and the PWR / CORES badge. Three meanings
  // already, and this made a fourth. ▪ carries none anywhere in the app — which is
  // the whole requirement, because the lane's colour and heading already say
  // ITEMS. The glyph is only here so the column does not look like it failed to
  // render next to ⚔ / 🛡 / ⚒ / ✦.
  if (row.kind === 'other') return '▪';
  if (row.kind === 'inert') return '·';
  return '⚒';
}

/** ⚠⚠ Can this row be ACTED ON in the loot picker at all? The picker filters on
 *  this, so a noun that neither takes nor salvages never reaches a button that
 *  would promise something it cannot deliver. */
export function isActionableGatherKind(kind: GatherKind): boolean {
  return kind !== 'inert';
}

/** ⚠⚠ OTA-1235 — THE LANE IS THE COLOUR IS THE BUTTON.
 *
 *  Owner, after playing OTA-1233: *"it shouldn't be gated it should be a layout
 *  like here is everything, what do you want to do. we could make the items
 *  blocks color coded like orange squares for gear with a matching orange button
 *  for take all gear, green for takable items with a matching button, and yellow
 *  for salvageable items with a matching color button."*
 *
 *  The old picker had ONE list and TWO bulk buttons, so a player had to read each
 *  row's tail text to work out which button would sweep it — which read as a
 *  gated flow even though nothing was gated. Three lanes, three colours, three
 *  buttons: the block you are looking at is the colour of the button that will
 *  take it. Nothing to deduce.
 *
 *  ⚠ GEAR AND ITEMS ARE SPLIT even though both are "take", because they are
 *  different decisions. Gear is a comparison — is this better than what I have.
 *  An item is not; it just goes in the pack. Sweeping the second is free, and
 *  sweeping the first is what makes a player miss an upgrade. */
export type GatherLane = 'gear' | 'items' | 'scrap' | 'lead';

export function laneForKind(kind: GatherKind): GatherLane | null {
  if (kind === 'weapon' || kind === 'armor') return 'gear';
  if (kind === 'other') return 'items';
  if (kind === 'scenery') return 'scrap';
  if (kind === 'lead') return 'lead';
  return null; // inert — no lane, no colour, no button
}

/** ⚠⚠ OTA-1236 — THE LEAD LANE HAS NO SWEEP BUTTON, AND THAT IS THE POINT.
 *
 *  Every other lane's colour is a promise that a matching button will clear it.
 *  The lead's colour promises the opposite: nothing bulk will touch this. Owner:
 *  *"I don't like that salvage all can bury the dog quest."* It could — ten of the
 *  twenty dog-rescue nouns match a salvage pool, so the yellow SCRAP lane was
 *  offering the chain the dog is on with a one-tap sweep over it.
 *
 *  A single tap still works, and it INVESTIGATES rather than salvaging, because
 *  investigate is the verb that fires the rescue. */
export function laneHasSweep(lane: GatherLane): boolean {
  return lane !== 'lead';
}
