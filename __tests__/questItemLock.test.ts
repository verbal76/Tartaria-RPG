// OTA-493 — quest / contract / whisper items are LOCKED objectives: grouped into a
// "Quest Items" section pinned to the END of the inventory, and never
// drop/sell/scrap/gift/fuse-able. These tests cover the predicate + categorization.

import { isQuestLockedItem } from '../app/engine/questItems';
import { categorizeItem, CATEGORY_ORDER } from '../app/components/InventoryCategorize';
import type { InventoryItem } from '../app/engine/types';

const mk = (over: Partial<InventoryItem>): InventoryItem => ({
  id: 'i', name: 'X', kind: 'misc', quantity: 1, tags: [], ...over,
} as unknown as InventoryItem);

describe('OTA-493 — quest item lock + section', () => {
  it('isQuestLockedItem flags quest / contract / broker / whisper tags', () => {
    expect(isQuestLockedItem(mk({ name: 'Nimari Core', tags: ['quest'] }))).toBe(true);
    expect(isQuestLockedItem(mk({ tags: ['quest', 'coveted', 'broker'] }))).toBe(true);
    expect(isQuestLockedItem(mk({ tags: ['whisper', 'aether', 'quest'] }))).toBe(true);
    expect(isQuestLockedItem(mk({ tags: ['contract'] }))).toBe(true);
  });

  it('does NOT flag ordinary items', () => {
    expect(isQuestLockedItem(mk({ name: 'Scrap Metal', tags: ['metal'] }))).toBe(false);
    expect(isQuestLockedItem(mk({ name: 'Rusted Blade', kind: 'weapon', tags: ['weapon'] }))).toBe(false);
  });

  it('categorizes locked objective items into the quest section', () => {
    expect(categorizeItem(mk({ name: 'Nimari Core', tags: ['quest'] }))).toBe('quest');
    // whisper item also carries 'aether' (would otherwise read as material) — quest wins
    expect(categorizeItem(mk({ name: 'Whisper Token', tags: ['whisper', 'aether', 'quest'] }))).toBe('quest');
    // broker contract item
    expect(categorizeItem(mk({ name: 'Sealed Parcel', tags: ['quest', 'coveted', 'broker'] }))).toBe('quest');
  });

  it('pins the Quest Items section to the END of the inventory order', () => {
    expect(CATEGORY_ORDER[CATEGORY_ORDER.length - 1]).toBe('quest');
  });
});
