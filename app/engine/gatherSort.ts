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
    const wornArmor = armorByName(worn.name);
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
    const heldWeapon = weaponByName(main.name);
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
export function upgradeEquipSlot(
  player: PlayerCharacter | null,
  noun: string,
): { name: string; slot: EquipSlot } | null {
  const armor = armorByName(noun);
  if (armor) {
    const slot = ARMOR_SLOT_TO_EQUIP[armor.slot];
    return slot ? { name: armor.name, slot } : null;
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
  const heldWeapon = weaponByName(main.name);
  const beatsMain = heldWeapon
    ? averageDamage(weapon.damageDice) > averageDamage(heldWeapon.damageDice)
    : false;
  if (beatsMain) return { name: weapon.name, slot: 'main' };
  if (!resolveEquippedItem(player, 'off')) return { name: weapon.name, slot: 'off' };
  // Both hands full and it beats neither — the mark would not have fired, but a
  // caller that asks anyway gets the honest answer rather than a silent swap.
  return null;
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
export function gatherIcon(row: { kind: GatherKind; upgrade: boolean }): string {
  // ⚠ The lead's ✦ outranks even the upgrade star: a better helm can wait, and
  // the same ✦ is what the Aetheric Torch already marks a worth-a-look noun with,
  // so the player has seen it mean exactly this before.
  if (row.kind === 'lead') return '✦';
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
