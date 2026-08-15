import { isQuestLockedItem } from './questItems';
import { activeFetchItemNames } from './factionQuests';
import { wornInstanceIds } from './equipment';
import type { InventoryItem, PlayerCharacter } from './types';

/** OTA-1154 — ONE ANSWER TO "CAN I GIVE THIS AWAY?", FOR THE UI AND THE STORE.
 *
 *  Owner: *"the list we pick from to give out must exclude all equipped gear,
 *  armor and anything in the bandolier or tool pouch. also no item that is given
 *  away would break a mission or storyline beat."*
 *
 *  ⚠ WHY THIS IS A MODULE AND NOT AN `if` IN THE PICKER. Before this, the only
 *  guard was inside `giveGift`, AFTER the player had already chosen: the old
 *  picker listed worn armour happily and then refused the tap with "you are still
 *  wearing that". That is a choice the game offers and then takes back — and it is
 *  the same shape as the ready-to-hand-in bug from OTA-1152, where one predicate
 *  lived in three places and drifted. So the reason lives HERE, the inventory asks
 *  it before drawing the GIVE button, and `giveGift` asks it again before moving
 *  anything. Two callers, one answer; they cannot disagree.
 *
 *  Returns null when the item may be given, or a short player-facing reason.
 *  ⚠ The reason is written to be shown, not logged — if a button is missing, the
 *  player is told why rather than left to guess. */
export function giftBlockReason(item: InventoryItem, player: PlayerCharacter): string | null {
  // 1 — Bound to a contract outright. These exist only to be turned in.
  if (isQuestLockedItem(item)) return 'it is bound to a contract';

  const eq = player.equipped ?? {};
  // 2 — Worn or wielded. ⚠ Routed through `wornInstanceIds` rather than listing the
  // slots here: that helper is the canonical answer (it also catches the DOG's
  // vest, which a hand-written slot list would have missed), and re-deriving the
  // set locally is exactly how two definitions drift apart. Every slot holds an
  // INSTANCE id, so this is exact — a second identical locket in the pack stays
  // giftable while the first one is worn.
  if (wornInstanceIds(player).has(item.id)) return 'you are wearing it';

  // 3 — Racked. The owner named both pouches, and both are id lists.
  if ((eq.bandolierIds ?? []).includes(item.id)) return 'it is racked in your bandolier';
  if ((eq.toolPouchIds ?? []).includes(item.id)) return 'it is in your tool pouch';

  // 4 — Already promised to the Crucible. Giving it away would silently empty a
  // reservation the player set up on another screen.
  if (item.reservedForFusion === true) return 'it is reserved for the Crucible';

  // 5 — ⚠ THE MISSION-BREAKING CASE, and the one that is NOT a hard lock.
  // `isQuestLockedItem` only covers items flagged as objectives. A FETCH contract
  // wants ordinary catalog items — "bring me 15 rusted metal" — and those are
  // perfectly normal loot right up until you accept the contract. Handing your
  // last one to a vendor does not fail the contract loudly; it just quietly makes
  // it uncompletable until you find another. Matched BY NAME because that is what
  // the contract asks for (a fetch counts held quantity by name, OTA-961), so a
  // name match is the right question here rather than an instance match.
  const wanted = activeFetchItemNames(
    player.activeFactionQuests ?? (player.activeFactionQuestIds ?? []).map((id) => ({ id })),
  );
  // activeFetchItemNames returns a Set of LOWERCASED names.
  if (wanted.has(item.name.toLowerCase())) {
    return 'a contract you have accepted is waiting on it';
  }
  return null;
}

/** Convenience for list filtering — the same predicate, as a boolean. */
export function canGiftItem(item: InventoryItem, player: PlayerCharacter): boolean {
  return giftBlockReason(item, player) === null;
}
