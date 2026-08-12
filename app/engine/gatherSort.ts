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
import { WEAPONS, ARMOR, findCatalogItem } from './crafting';
import { resolveEquippedItem } from './equipment';

export type GatherKind = 'weapon' | 'armor' | 'other' | 'scenery';

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

/** ⚠ Which lane a scene noun belongs in. 'scenery' means the catalog does not
 *  know it — those are the salvage fodder, and they sort last precisely because
 *  they are the ones SALVAGE ALL is going to sweep anyway. */
export function classifyGatherNoun(noun: string): GatherKind {
  if (findCatalogItem(noun) === null) return 'scenery';
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
    const wornArmor = armorByName(worn.name);
    if (!wornArmor) return false; // cannot compare honestly → do not claim
    return armor.acBonus > wornArmor.acBonus;
  }

  const weapon = weaponByName(noun);
  if (weapon) {
    const held = resolveEquippedItem(player, 'main');
    if (!held) return true;
    const heldWeapon = weaponByName(held.name);
    if (!heldWeapon) return false;
    return averageDamage(weapon.damageDice) > averageDamage(heldWeapon.damageDice);
  }

  return false;
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

function equippedInSlot(player: PlayerCharacter, slot: string): InventoryItem | null {
  const equipSlot = ARMOR_SLOT_TO_EQUIP[slot];
  if (!equipSlot) return null;
  try {
    return resolveEquippedItem(player, equipSlot) ?? null;
  } catch {
    return null;
  }
}

export interface GatherRow {
  noun: string;
  kind: GatherKind;
  upgrade: boolean;
  consumed: boolean;
}

/** ⚠ THE ORDER IS THE FEATURE: decisions first, sweepable last.
 *    ★ upgrades → ⚔ weapons → 🛡 armor → everything else takeable → scenery.
 *  Consumed rows sink within their group rather than jumping the order, so a
 *  half-looted room does not reshuffle under the player's thumb between taps.
 *  Ties break alphabetically so the list is STABLE — a picker that reorders
 *  itself while you read it is worse than one sorted badly. */
const KIND_RANK: Record<GatherKind, number> = { weapon: 1, armor: 2, other: 3, scenery: 4 };

export function sortGatherRows(rows: readonly GatherRow[]): GatherRow[] {
  return [...rows].sort((a, b) => {
    if (a.consumed !== b.consumed) return a.consumed ? 1 : -1;
    if (a.upgrade !== b.upgrade) return a.upgrade ? -1 : 1;
    const rank = KIND_RANK[a.kind] - KIND_RANK[b.kind];
    if (rank !== 0) return rank;
    return a.noun.localeCompare(b.noun);
  });
}

/** The mark shown at the left of a row. Kept here beside the sort so the icon
 *  and the ordering can never disagree about what a row is. */
export function gatherIcon(row: { kind: GatherKind; upgrade: boolean }): string {
  if (row.upgrade) return '★';
  if (row.kind === 'weapon') return '⚔';
  if (row.kind === 'armor') return '🛡';
  if (row.kind === 'other') return '◆';
  return '⚒';
}
