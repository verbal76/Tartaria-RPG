// OTA-1114 — engine_Dev port of HAL OTA-829. The reservable-eligibility function
// (engine renamed it isFusionReservable in OTA-1043) had the same latent hole: a
// catalog-absent quest/relic item fell through to the inferred/material shortcuts
// and read as reservable in the FUSABLE filter. Protected kinds/tags (quest / relic
// / sigil / currency / keepsake / throwable) are now rejected first.

import { isFusionReservable } from '../app/engine/itemFusion';
import type { InventoryItem } from '../app/engine/types';

const mk = (p: Partial<InventoryItem> & { name: string }): InventoryItem =>
  ({ id: p.name, kind: 'misc', quantity: 1, rarity: 'Common', tags: [], ...p } as InventoryItem);

const questCore = (name: string): InventoryItem =>
  mk({ name, kind: 'relic', rarity: 'Legendary', tags: ['quest', 'aetheric_core', 'main_quest'] });

describe('OTA-1114 — quest/relic items are never fusion-reservable', () => {
  it('a quest Core (quest/relic) is NOT reservable', () => {
    expect(isFusionReservable(questCore('Samarran Core'))).toBe(false);
  });

  it('the quest tag alone blocks it, even without the relic kind', () => {
    expect(isFusionReservable(mk({ name: 'Odd Quest Trinket', kind: 'misc', tags: ['quest'] }))).toBe(false);
  });

  it('a relic KIND is out regardless of tags', () => {
    expect(isFusionReservable(mk({ name: 'Some Relic', kind: 'relic', tags: [] }))).toBe(false);
  });

  it('a material-tagged reagent is still reservable (no regression)', () => {
    expect(isFusionReservable(mk({ name: 'Weird Goo', kind: 'misc', tags: ['organic'] }))).toBe(true);
  });
});
