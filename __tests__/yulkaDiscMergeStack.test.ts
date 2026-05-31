// OTA-161 — regression lock for Yulka-buy disc grant going through
// mergeOrPushItem. Pre-fix, two Yulka buys created two separate
// Aetheric Disc rows (5 + 5 = two rows of 5 instead of one row of
// 10). Audit from the craft-a-lot stress sweep flagged direct
// inventory pushes as a class to tighten; this was the one site
// doing it for non-theft items.

jest.setTimeout(15000);

import { mergeOrPushItem } from '../app/engine/inventory';

describe('OTA-161 — Yulka disc grant merges into existing stack', () => {
  it('two 5-unit grants merge into one 10-unit row', () => {
    const initial: any[] = [];
    const newDisc1 = {
      id: 'disc_buy_1',
      name: 'Aetheric Disc',
      kind: 'misc' as const,
      rarity: 'Uncommon' as const,
      quantity: 5,
      tags: ['aether', 'currency'],
    };
    const newDisc2 = {
      id: 'disc_buy_2',
      name: 'Aetheric Disc',
      kind: 'misc' as const,
      rarity: 'Uncommon' as const,
      quantity: 5,
      tags: ['aether', 'currency'],
    };
    const afterFirst = mergeOrPushItem(initial, newDisc1);
    expect(afterFirst).toHaveLength(1);
    expect(afterFirst[0]!.quantity).toBe(5);
    const afterSecond = mergeOrPushItem(afterFirst, newDisc2);
    expect(afterSecond).toHaveLength(1);
    expect(afterSecond[0]!.quantity).toBe(10);
  });

  it('grant with existing non-disc inventory preserves other rows', () => {
    const initial = [
      { id: 'wm_1', name: 'Water Bottle', kind: 'consumable' as const, rarity: 'Common' as const, quantity: 1, tags: ['water', 'drink'] },
    ];
    const newDisc = {
      id: 'disc_buy_1',
      name: 'Aetheric Disc',
      kind: 'misc' as const,
      rarity: 'Uncommon' as const,
      quantity: 5,
      tags: ['aether', 'currency'],
    };
    const after = mergeOrPushItem(initial, newDisc);
    expect(after).toHaveLength(2);
    const water = after.find((i: any) => i.name === 'Water Bottle');
    const disc = after.find((i: any) => i.name === 'Aetheric Disc');
    expect(water?.quantity).toBe(1);
    expect(disc?.quantity).toBe(5);
  });
});
