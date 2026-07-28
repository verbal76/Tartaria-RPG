// OTA-967 — v2-audit knobs 3 + 4: the Tartarian Reaver's Greatsword no longer counts
// twice (it transfers with the carried kit; the loot roll could even duplicate it),
// and knockouts earn a rarity-scaled mercy premium so lethal play doesn't strictly
// cash-dominate against humans. The sweep below generalizes the dedup rule for all
// future data: an item may live in `carries` OR `loot`, never both.
import enemiesData from '../app/data/enemies/enemies.json';

type EnemyRow = {
  name: string;
  loot?: string[];
  carries?: { weapons?: string[]; armor?: string[]; tc?: number };
};
const enemies: EnemyRow[] = enemiesData as unknown as EnemyRow[];

describe('OTA-967 — no enemy double-dips an item between carries and loot', () => {
  it('the Reaver keeps its Greatsword in the kit only', () => {
    const reaver = enemies.find((e) => e.name === 'Tartarian Reaver')!;
    expect(reaver.carries?.weapons).toContain("Reaver's Greatsword");
    expect(reaver.loot).not.toContain("Reaver's Greatsword");
    expect(reaver.loot).toContain("Reaver's Pauldron");
  });

  it('sweep: nothing appears in both carries and loot, for any enemy', () => {
    const offenders: string[] = [];
    for (const e of enemies) {
      const kit = new Set([...(e.carries?.weapons ?? []), ...(e.carries?.armor ?? [])]);
      for (const n of e.loot ?? []) {
        if (kit.has(n)) offenders.push(`${e.name}: ${n}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
