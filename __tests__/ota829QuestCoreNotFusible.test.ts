// OTA-829 — the FUSABLE inventory filter (isForgeReservableItem) listed the
// player's main-quest Capital "Cores" — un-fusible Legendary quest items. They're
// catalog-absent, so they fell through to the `isInferredItem` shortcut and read as
// reservable junk BEFORE the FORGE_LOOT_BLOCK_TAGS guard (quest/relic/sigil/...)
// could reject them. That guard already protected the 'loot' reagent path; it must
// protect the inferred path too. Quest items are never fusion fodder.

import { isForgeReservableItem } from '../app/engine/itemFusion';
import type { InventoryItem } from '../app/engine/types';

const mk = (p: Partial<InventoryItem> & { name: string }): InventoryItem =>
  ({ id: p.name, kind: 'misc', quantity: 1, rarity: 'Common', tags: [], ...p } as InventoryItem);

// The exact shape triggerMainQuest mints on Core recovery (gameStore).
const questCore = (name: string): InventoryItem =>
  mk({ name, kind: 'relic', rarity: 'Legendary', tags: ['quest', 'aetheric_core', 'main_quest'] });

describe('OTA-829 — main-quest Cores are never forge-reservable', () => {
  it('a Capital Core (quest/relic, catalog-absent) is NOT reservable', () => {
    expect(isForgeReservableItem(questCore('Samarran Core'))).toBe(false);
    expect(isForgeReservableItem(questCore('Nimari Core'))).toBe(false);
  });

  it('the quest tag alone blocks it, even without the relic kind', () => {
    expect(isForgeReservableItem(mk({ name: 'Odd Quest Trinket', kind: 'misc', tags: ['quest'] }))).toBe(false);
  });

  it('a relic KIND is out regardless of tags', () => {
    expect(isForgeReservableItem(mk({ name: 'Some Relic', kind: 'relic', tags: [] }))).toBe(false);
  });

  it('genuine inferred junk is still reservable (no regression)', () => {
    expect(isForgeReservableItem(mk({ name: 'Weird Goo', kind: 'misc', tags: ['organic'] }))).toBe(true);
  });
});
