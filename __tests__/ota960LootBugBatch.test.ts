// OTA-960 — loot bug batch, data-side locks.
// (1) The 8 "Resurrection Gem" loot-pool entries were FAKES: the real gem is a
// separate stash grant on boss defeat; the loot copy minted a useless Common misc
// brick ~60-70% of boss kills and stole a drop slot from the boss's real rolls.
// This lock keeps them from creeping back into the data.
// (2) The empty-pool dust fallback must reference the CATALOG's stackable name.
import enemiesData from '../app/data/enemies/enemies.json';
import { MATERIALS } from '../app/engine/crafting';

type EnemyRow = { name: string; loot?: string[] };
// enemies.json is a bare top-level array (no { enemies: ... } wrapper)
const enemies: EnemyRow[] = enemiesData as unknown as EnemyRow[];

describe('OTA-960 — loot data locks', () => {
  it('no enemy loot pool contains the fake "Resurrection Gem" (the real one is a stash grant)', () => {
    const offenders = enemies.filter((e) => (e.loot ?? []).includes('Resurrection Gem'));
    expect(offenders.map((e) => e.name)).toEqual([]);
  });

  it('the dust fallback name is a real, exactly-cased catalog material', () => {
    expect(MATERIALS.some((m) => m.name === 'Aether Dust')).toBe(true);
  });
});
