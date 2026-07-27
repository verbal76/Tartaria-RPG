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
export function isQuestLockedItem(item: Pick<InventoryItem, 'tags'> & { name?: string }): boolean {
  // OTA-1022 — CANONICAL tags when the caller passes a real item. The instance
  // snapshot alone let a quest key acquired before its catalog 'quest' tag
  // shipped be dropped, sold, scrapped, gifted and FUSED — an unwinnable-run
  // hole. Lazy require: sellPrice/crafting import in both directions.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { canonicalItemTags } = require('./crafting') as typeof import('./crafting');
  const tags = item.name
    ? canonicalItemTags({ name: item.name, tags: item.tags })
    : (item.tags ?? []).map((t) => t.toLowerCase());
  return tags.some((t) => (QUEST_LOCK_TAGS as readonly string[]).includes(t));
}
