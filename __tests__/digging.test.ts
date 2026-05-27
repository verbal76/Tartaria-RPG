import { bestDigTool, digScoreFor, rollDig } from '../app/engine/digging';
import type { InventoryItem } from '../app/engine/types';

function make(name: string, tags: string[] = []): InventoryItem {
  return { id: name, name, kind: 'weapon', quantity: 1, tags };
}

describe('digging', () => {
  it('rates Reclaimers Trowel higher than a Pocket Knife', () => {
    expect(digScoreFor(make("Reclaimer's Trowel"))).toBeGreaterThan(digScoreFor(make('Pocket Knife')));
  });

  it('returns 0 for non-digging items (rations, locket)', () => {
    expect(digScoreFor(make('Trail Rations', ['food']))).toBe(0);
    expect(digScoreFor(make('Aetheric Locket', ['detection']))).toBe(0);
  });

  it('falls back to tag heuristics for unlisted items', () => {
    expect(digScoreFor(make('Custom Plate', ['plate']))).toBeGreaterThan(0);
  });

  it('bestDigTool picks the highest-score item over bare hands', () => {
    const inv: InventoryItem[] = [
      make('Trail Rations', ['food']),
      make('Pocket Knife', ['weapon', 'knife', 'tool']),
      make("Reclaimer's Trowel", ['weapon', 'tool', 'dig']),
    ];
    const best = bestDigTool(inv);
    expect(best.item?.name).toBe("Reclaimer's Trowel");
    expect(best.score).toBeGreaterThan(1);
  });

  it('rollDig returns nothing some of the time at low score', () => {
    let nothingCount = 0;
    for (let i = 0; i < 200; i++) {
      const r = rollDig(1);
      if (r.nothing) nothingCount++;
    }
    expect(nothingCount).toBeGreaterThan(60); // ~55% expected
  });

  it('rollDig finds rare items more often at high score', () => {
    let rare = 0;
    for (let i = 0; i < 400; i++) {
      const r = rollDig(6);
      if (r.found?.rarity === 'Rare') rare++;
    }
    expect(rare).toBeGreaterThan(5); // probability noticeably above zero
  });
});
