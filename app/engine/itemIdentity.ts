// ⚠⚠⚠ OTA-1736 — WHAT AN ITEM INSTANCE IS CALLED, AND WHERE IT IS WORN.
//
// Owner, standing at a vendor: *"It does not show which weapon/armor is
// currently equipped. It does not show the complete generated/player-facing
// item name… Do not create another item-description implementation
// specifically for reinforcement. First find the existing authoritative
// formatter/display model used by inventory/equipment."*
//
// ⚠ THIS FILE IS THAT MODEL, EXTRACTED — not written fresh. All three answers
// lived as closures inside InventoryScreen.tsx (the coated display name at the
// row header, `equippedSlotLabelFor` and `slotFillLabelFor` in the render
// body), where a second screen could not reach them. The reinforcement rows
// therefore built their own name from bare `item.name` and used the equipment
// authority to SORT and never to LABEL. Two screens, two opinions about one
// object — the exact defect OTA-1550 fixed once already inside the inventory.
//
// ⚠ The inventory now CALLS these. That is what makes them the authority
// rather than a third copy: there is one body, and both screens read it.
//
// ⚠ IDENTITY IS BY INSTANCE ID. `equippedWhereLabel` resolves the id-bearing
// slots first and falls back to the stored NAME only for legacy saves whose
// slot has no id (OTA-1550's rule, kept verbatim: an id-bearing slot is
// settled and is never re-matched by name).

import type { InventoryItem, PlayerCharacter, EquipSlot } from './types';
import { SLOT_LABEL, validSlotsForItem, RING_SLOTS, RING_ID_KEYS } from './equipment';
import { findWeaponByName } from './crafting';
import { resolveDisplayWeapon } from './itemResolution';
import { wornDogVestInstanceId } from './dogCompanion';

/** The player-facing name of THIS copy: a coated weapon reads with its
 *  coating(s) in front ("Corrupted Venomous Battle Axe" — OTA-360 / OTA-873);
 *  the stored `item.name` is untouched for every lookup. */
export function instanceDisplayName(item: Pick<InventoryItem, 'name' | 'coating' | 'coating2'>): string {
  const coats = [item.coating?.label, item.coating2?.label].filter(Boolean);
  return coats.length ? `${coats.join(' ')} ${item.name}` : item.name;
}

/** Where THIS instance is worn, in the inventory's own words — 'main hand',
 *  'off hand', 'both hands', 'two-handed', 'Head', 'Chest + Cloak', 'on Cinder'
 *  — or '' when it is in the pack. Keyed on the instance id. */
export function equippedWhereLabel(player: PlayerCharacter, item: InventoryItem): string {
  const eq = player.equipped ?? {};
  const wornVestId = wornDogVestInstanceId(player);
  if (wornVestId && item.id === wornVestId) {
    return player.dog?.name ? `on ${player.dog.name}` : 'on your dog';
  }
  const byId = new Map<string, EquipSlot[]>();
  const idSlotPairs: Array<[string | undefined, EquipSlot]> = [
    [eq.mainId, 'main'], [eq.offId, 'off'], [eq.headId, 'head'],
    [eq.chestId, 'chest'], [eq.handsId, 'hands'], [eq.legsId, 'legs'],
    [eq.feetId, 'feet'], [eq.cloakId, 'cloak'], [eq.amuletId, 'amulet'],
    ...RING_ID_KEYS.map((k): [string | undefined, EquipSlot] => [eq[k], 'ring']),
  ];
  for (const [id, slot] of idSlotPairs) {
    if (!id) continue;
    const list = byId.get(id) ?? [];
    list.push(slot);
    byId.set(id, list);
  }
  // ⚠ OTA-1550 — the LEGACY-ONLY name map: a slot whose instance id is SET has
  //   already been resolved exactly above and must never be re-matched by name,
  //   or a pack duplicate of the held weapon reads EQUIPPED too.
  const legacySlotsByName = new Map<string, EquipSlot[]>();
  const nameIdSlotTriples: Array<[EquipSlot, string | undefined, string | undefined]> = [
    ['main', player.equipped?.main, eq.mainId],
    ['off', player.equipped?.off, eq.offId],
    ['head', player.equipped?.head, eq.headId],
    ['chest', player.equipped?.chest, eq.chestId],
    ['hands', player.equipped?.hands, eq.handsId],
    ['legs', player.equipped?.legs, eq.legsId],
    ['feet', player.equipped?.feet, eq.feetId],
    ['cloak', player.equipped?.cloak, eq.cloakId],
    ['amulet', player.equipped?.amulet, eq.amuletId],
    ...RING_SLOTS.map((k, i): [EquipSlot, string | undefined, string | undefined] => ['ring', player.equipped?.[k], eq[RING_ID_KEYS[i]!]]),
  ];
  for (const [slot, name, id] of nameIdSlotTriples) {
    if (!name || id) continue;
    const list = legacySlotsByName.get(name) ?? [];
    list.push(slot);
    legacySlotsByName.set(name, list);
  }
  let slots = byId.get(item.id);
  if (!slots || slots.length === 0) slots = legacySlotsByName.get(item.name) ?? [];
  if (slots.length === 0) return '';
  if (findWeaponByName(item.name)?.style === 'two_handed') return 'two-handed';
  const hasMain = slots.includes('main');
  const hasOff = slots.includes('off');
  if (hasMain && hasOff) return 'both hands';
  if (hasMain) return 'main hand';
  if (hasOff) return 'off hand';
  const labels = [...new Set(slots.map((s) => SLOT_LABEL[s] ?? s))];
  return labels.join(' + ');
}

/** How the thing is held or worn, regardless of whether it is: 'One-handed',
 *  'Two-handed', or the slot label(s) for armour and accessories. '' when it
 *  fills no slot the player has. */
export function holdLabelFor(item: InventoryItem): string {
  const slots = validSlotsForItem(item);
  if (slots.length === 0) return '';
  if (resolveDisplayWeapon(item)?.style === 'two_handed') return 'Two-handed';
  if (slots.every((s) => s === 'main' || s === 'off')) return 'One-handed';
  const labels = [...new Set(slots.map((s) => SLOT_LABEL[s] ?? s))];
  return labels.join(' / ');
}
