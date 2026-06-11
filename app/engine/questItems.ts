// questItems — OTA-493. Items reserved for an objective: the main quest (Cores,
// quest notes), broker CONTRACTS, and WHISPER objectives. They exist only to be
// turned in for that purpose, so they're LOCKED — never droppable, sellable,
// scrappable, giftable, or fusable — and grouped in their own "Quest Items"
// section at the END of the inventory.
//
// Broker-contract and whisper items already also carry the 'quest' tag, but we
// match the full set so an item tagged only 'contract' / 'broker' / 'whisper'
// still locks. Single source of truth for the lock + the inventory category.

import type { InventoryItem } from './types';

export const QUEST_LOCK_TAGS = ['quest', 'contract', 'broker', 'whisper'] as const;

/** True iff the item is a locked objective item (quest / contract / whisper). */
export function isQuestLockedItem(item: Pick<InventoryItem, 'tags'>): boolean {
  const tags = (item.tags ?? []).map((t) => t.toLowerCase());
  return tags.some((t) => (QUEST_LOCK_TAGS as readonly string[]).includes(t));
}
