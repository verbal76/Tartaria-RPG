// OTA-919 — new-content wiring / integrity sweep (audit batch 1). Verifies this
// arc's additions resolve end-to-end instead of dropping as phantom content:
//   - every Aetherkin loot name is a REAL authored item (not a bare misc name)
//   - the 5 summit bosses project into the codex with names that match the built
//     boss (so a defeat catalogues them) and don't collide with enemies.json
//   - the swapped storyline reward item actually exists in the armor catalog

import enemiesData from '../app/data/enemies/enemies.json';
import materials from '../app/data/items/materials.json';
import currencyGoods from '../app/data/lore/canon-currency-goods.json';
import runecasters from '../app/data/items/runecasters.json';
import armor from '../app/data/items/armor.json';
import { SUMMIT_BOSSES, SUMMIT_BOSS_BASES, buildSummitBoss } from '../app/engine/greatClimbs';
import { isAetherkin, AETHERKIN_VARIANT_NAMES } from '../app/engine/aetherkin';
import type { Enemy } from '../app/engine/types';

/** Pull every authored `name` out of a catalog (array or {key: array} wrapper). */
function names(cat: unknown): string[] {
  const arr = Array.isArray(cat) ? cat : Object.values(cat as Record<string, unknown>).find(Array.isArray) as unknown[];
  return (arr ?? []).map((o) => (o as { name?: string }).name).filter((n): n is string => typeof n === 'string');
}
const ITEM_NAMES = new Set<string>([
  ...names(materials), ...names(currencyGoods), ...names(runecasters), ...names(armor),
]);
const enemies = enemiesData as Enemy[];

describe('OTA-919 — Aetherkin loot resolves to real items', () => {
  const aetherkinEnemies = enemies.filter((e) => isAetherkin(e));

  it('there are three Aetherkin variants carrying loot', () => {
    expect(aetherkinEnemies.length).toBe(3); // Aetherkin, Drowned, Mud-Wracked
    for (const e of aetherkinEnemies) expect((e.loot ?? []).length).toBeGreaterThan(0);
  });

  it('every Aetherkin loot drop is an authored item, not a phantom misc name', () => {
    for (const e of aetherkinEnemies) {
      for (const name of e.loot ?? []) {
        expect(ITEM_NAMES.has(name)).toBe(true); // includes the newly-authored "Veil of Peace"
      }
    }
  });

  it('the two new variant NAMES match the aetherkin module list', () => {
    for (const n of AETHERKIN_VARIANT_NAMES) {
      expect(enemies.some((e) => e.name === n)).toBe(true);
    }
  });
});

describe('OTA-919 — summit bosses wire into the codex cleanly', () => {
  it('exactly five projected bases, each name matches the built boss (catalogues on defeat)', () => {
    expect(SUMMIT_BOSS_BASES).toHaveLength(5);
    for (const def of SUMMIT_BOSSES) {
      expect(buildSummitBoss(def.climbId)!.name).toBe(def.base.name);
    }
  });

  it('summit-boss names do NOT collide with enemies.json (no dup catalog entry / no wild spawn)', () => {
    const jsonNames = new Set(enemies.map((e) => e.name));
    for (const b of SUMMIT_BOSS_BASES) expect(jsonNames.has(b.name)).toBe(false);
  });
});

describe('OTA-919 — swapped storyline reward exists', () => {
  it("Explorer's Aetheric Greaves is a real armor item", () => {
    expect(names(armor)).toContain("Explorer's Aetheric Greaves");
  });
});
