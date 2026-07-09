import { bestDigTool, digScoreFor, rollDig, materialMatchesBiome } from '../app/engine/digging';
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

  // OTA-741 — biome-aware forage. On a 'mud'-tagged tile (the Mud Seas), a
  // material that shares the biome tag (Mud Fragment / Aether Mud, both tagged
  // 'mud') is far more common than on an untagged tile. Playtest: "been in the
  // mud seas twice and still no mud materials" — the pool ignored biome.
  it('rollDig yields mud materials far more often on a mud-tagged tile', () => {
    const isMud = (name?: string) => name === 'Mud Fragment' || name === 'Aether Mud';
    let flat = 0;
    let mud = 0;
    for (let i = 0; i < 600; i++) {
      if (isMud(rollDig(3).found?.name)) flat++;
      if (isMud(rollDig(3, ['mud']).found?.name)) mud++;
    }
    // The mud biome should meaningfully out-yield the flat pool (4× weight).
    expect(mud).toBeGreaterThan(flat);
    expect(mud).toBeGreaterThan(flat + 30);
  });
});

describe('OTA-741 — materialMatchesBiome', () => {
  it('matches a mud material against a mud biome, not an aether-only one', () => {
    expect(materialMatchesBiome('Mud Fragment', ['mud'])).toBe(true);
    expect(materialMatchesBiome('Mud Fragment', ['aether'])).toBe(false);
    // Aether Mud is tagged both mud AND aether, so it matches either biome.
    expect(materialMatchesBiome('Aether Mud', ['aether'])).toBe(true);
    expect(materialMatchesBiome('Aether Mud', ['mud'])).toBe(true);
    // A rock is not biome-flagged for mud.
    expect(materialMatchesBiome('Small Rock', ['mud'])).toBe(false);
    // No biome tags → never a boost.
    expect(materialMatchesBiome('Mud Fragment', [])).toBe(false);
  });
});
