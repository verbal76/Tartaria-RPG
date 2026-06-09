import { leaveEmptyWaterBottle } from '../app/engine/waterBottle';
import { consumeVerb } from '../app/engine/consumeVerb';
import type { InventoryItem } from '../app/engine/types';

// OTA-393 — drinking a Water Bottle (via ANY consume path) must leave an Empty
// Water Bottle behind so it can be refilled. The `use`/use_relic path used to
// destroy it outright, leaving the player with nothing.

const item = (over: Partial<InventoryItem>): InventoryItem => ({
  id: 'x', name: 'X', kind: 'misc', quantity: 1, tags: [], ...over,
});

describe('leaveEmptyWaterBottle', () => {
  it('adds an Empty Water Bottle when a Water Bottle is consumed', () => {
    const inv: InventoryItem[] = [item({ name: 'Trail Rations', quantity: 2 })];
    const next = leaveEmptyWaterBottle(inv, 'Water Bottle');
    const empty = next.find((i) => i.name === 'Empty Water Bottle');
    expect(empty).toBeTruthy();
    expect(empty!.quantity).toBe(1);
  });

  it('merges into an existing Empty Water Bottle stack', () => {
    const inv: InventoryItem[] = [item({ name: 'Empty Water Bottle', quantity: 1, tags: ['container', 'water'] })];
    const next = leaveEmptyWaterBottle(inv, 'Water Bottle');
    expect(next.filter((i) => i.name === 'Empty Water Bottle')).toHaveLength(1);
    expect(next.find((i) => i.name === 'Empty Water Bottle')!.quantity).toBe(2);
  });

  it('leaves inventory untouched for any other item', () => {
    const inv: InventoryItem[] = [item({ name: 'Trail Rations' })];
    expect(leaveEmptyWaterBottle(inv, 'Trail Rations')).toEqual(inv);
    expect(leaveEmptyWaterBottle(inv, 'First Aid Kit').some((i) => i.name === 'Empty Water Bottle')).toBe(false);
  });
});

describe('consumeVerb — drink not eat', () => {
  it('the Water Bottle is DRUNK, not eaten', () => {
    expect(consumeVerb({ name: 'Water Bottle', tags: ['drink', 'water', 'container'] })).toBe('drink');
  });
  it('drinks: vials/potions/canteens/teas', () => {
    expect(consumeVerb({ name: 'Blue Cap Draught', tags: [] })).toBe('drink');
    expect(consumeVerb({ name: 'Healing Potion', tags: [] })).toBe('drink');
    expect(consumeVerb({ name: 'Canteen', tags: [] })).toBe('drink');
  });
  it('food is eaten', () => {
    expect(consumeVerb({ name: 'Trail Rations', tags: ['food'] })).toBe('eat');
    expect(consumeVerb({ name: 'Speckled Egg', tags: ['food'] })).toBe('eat');
  });
  it('medical kits are applied', () => {
    expect(consumeVerb({ name: 'First Aid Kit', tags: ['healing'] })).toBe('apply');
  });
});
