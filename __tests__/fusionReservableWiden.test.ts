// engine_Dev — a lore-agnostic reskin catalogs most loot, so almost nothing was
// "inferred" and players had nothing to fuse. Material-kind / misc items carrying a
// fusion material tag are now reservable too. (Inferred items still qualify.)
import { isFusionReservable } from '../app/engine/itemFusion';

describe('engine_Dev — widened fusion-reservable gate', () => {
  it('accepts a cataloged material-kind item with a material tag', () => {
    expect(isFusionReservable({ name: 'Scrap Metal', kind: 'material', tags: ['metal'] })).toBe(true);
  });
  it('accepts a misc item with a material tag', () => {
    expect(isFusionReservable({ name: 'Automaton Circuit', kind: 'misc', tags: ['metal', 'tech'] })).toBe(true);
  });
  it('still accepts inferred (catalog-absent) names', () => {
    expect(isFusionReservable({ name: 'Shrike Claw', kind: 'misc', tags: [] })).toBe(true);
  });
  it('rejects a material-less, non-inferred item', () => {
    // A cataloged (non-inferred) consumable with no material tag shouldn't be reservable.
    expect(isFusionReservable({ name: 'Trail Rations', kind: 'consumable', tags: ['food'] })).toBe(false);
  });
});
