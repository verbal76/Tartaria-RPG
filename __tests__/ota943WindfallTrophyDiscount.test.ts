// OTA-943 — v2 audit knobs 1 + 2: mid-tier windfalls closed, trophy sell discount.
import { sellPriceFor } from '../app/engine/sellPrice';
import { MATERIALS } from '../app/engine/crafting';
import enemiesData from '../app/data/enemies/enemies.json';
import type { InventoryItem } from '../app/engine/types';

type EnemyRow = { name: string; rarity?: string; loot?: string[] };
const enemies: EnemyRow[] = enemiesData as unknown as EnemyRow[];
const RANK: Record<string, number> = { Common: 0, Uncommon: 1, Rare: 2, Legendary: 3 };

const mk = (o: Partial<InventoryItem>): InventoryItem =>
  ({ id: 't', name: 'X', kind: 'misc', rarity: 'Legendary', quantity: 1, tags: [], ...o } as unknown as InventoryItem);

describe('OTA-943 — no sub-Legendary enemy drops a Legendary material (windfalls closed)', () => {
  const matRarity = new Map(MATERIALS.map((m) => [m.name, m.rarity]));
  it('sweep: every authored loot material is at or below its enemy tier... except Legendary enemies', () => {
    const offenders: string[] = [];
    for (const e of enemies) {
      const er = RANK[e.rarity ?? 'Common']!;
      if (er >= 3) continue; // Legendary enemies may drop Legendary materials
      for (const n of e.loot ?? []) {
        const mr = matRarity.get(n);
        if (mr === 'Legendary') offenders.push(`${e.name} -> ${n}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('the audit-named windfalls got tier-appropriate replacements', () => {
    const golemKnight = enemies.find((e) => e.name === 'Golem Knight')!;
    const lion = enemies.find((e) => e.name === 'Aetheric Lion')!;
    expect(golemKnight.loot).toContain('Clockwork Core');
    expect(golemKnight.loot).not.toContain('Aether Core');
    expect(lion.loot).toContain('Beast Fang');
    expect(lion.loot).not.toContain('Aether Core');
  });
});

describe('OTA-943 — trophy sell discount (half a real material of the same rarity)', () => {
  it('a Legendary trophy sells for half of a plain Legendary misc', () => {
    const plain = sellPriceFor(mk({ name: 'Plain Part' }), null);
    const trophy = sellPriceFor(mk({ name: 'Horror Tendril', tags: ['trophy'] }), null);
    expect(trophy).toBeLessThan(plain);
    expect(trophy).toBeGreaterThanOrEqual(Math.floor(plain / 2) - 1);
    expect(trophy).toBeLessThanOrEqual(Math.ceil(plain / 2) + 1);
  });

  it('real authored materials are NOT discounted', () => {
    const real = sellPriceFor(mk({ name: 'Dragon Scale', tags: [] }), null);
    const plain = sellPriceFor(mk({ name: 'Plain Part' }), null);
    expect(real).toBe(plain);
  });

  it('the discount never crushes a trophy below 1 TC', () => {
    expect(sellPriceFor(mk({ name: 'Rat Tail', rarity: 'Common' as never, tags: ['trophy'] }), null)).toBeGreaterThanOrEqual(1);
  });
});
