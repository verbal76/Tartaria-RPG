// OTA-1017 — engine_Dev: accessories (rings/amulets) can carry a flat acBonus,
// authored in the content-pack JSON. This verifies (a) the dev-panel template
// documents the field, and (b) a JSON-uploaded ring/amulet with acBonus is read
// back by the engine's accessory lookup (so aggregateArmor can sum it into AC).

import { getTableTemplate } from '../app/engine/contentTemplates';
import { setTableOverride, clearAllOverrides } from '../app/engine/contentPack';
import { findRingByName, findAmuletByName, type CatalogAccessory } from '../app/engine/crafting';

describe('OTA-1017 — the dev panel documents the accessory acBonus field', () => {
  it('the rings + amulets templates mention acBonus (defensive accessories)', () => {
    expect(getTableTemplate('rings')).toContain('acBonus');
    expect(getTableTemplate('amulets')).toContain('acBonus');
    // and the ring template ships a defensive sample so authors see the shape
    expect(getTableTemplate('rings')).toMatch(/acBonus/);
  });
});

describe('OTA-1017 — a JSON-authored +AC accessory is read by the engine', () => {
  afterEach(() => clearAllOverrides());

  it('an uploaded ring/amulet with acBonus round-trips through the content-pack table', () => {
    const ring: CatalogAccessory = {
      name: 'Test Guard Ring', rarity: 'Rare', acBonus: 2,
      statBonus: { stat: 'strength', amount: 1 }, resistances: [], baseDurability: 40,
      tags: ['ring', 'defensive'], description: 'A test ring.',
    };
    const amulet: CatalogAccessory = {
      name: 'Test Aegis Amulet', rarity: 'Legendary', acBonus: 1,
      resistances: ['radiation'], baseDurability: 45, tags: ['amulet'], description: 'A test amulet.',
    };
    setTableOverride('rings', [ring]);
    setTableOverride('amulets', [amulet]);

    const r = findRingByName('Test Guard Ring');
    expect(r?.acBonus).toBe(2);           // engine reads the JSON acBonus
    expect(r?.statBonus?.amount).toBe(1); // and the stat bonus still works
    const a = findAmuletByName('Test Aegis Amulet');
    expect(a?.acBonus).toBe(1);
  });
});
