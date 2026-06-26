// engine_Dev — the uploaded `startingLoadout` table is ONE source of truth for creation gear:
// it replaces the scattered defaults (built-in survival kit + faction knife + race starter
// weapon/gear). The engine infers item kind from the behavior tags, defaults quantity to 1,
// pulls catalog rarity/durability when the name matches, and auto-equips per `equip` (or the
// first weapon → main hand). Omitting the table keeps the built-in behavior.

import { createCharacter, getRaces } from '../app/engine/character';
import { setTableOverride } from '../app/engine/contentPack';

const RACE = () => getRaces()[0]!.id;
const FACTION = 'reclaimers_guild';

afterEach(() => setTableOverride('startingLoadout', null));

describe('startingLoadout — uploaded creation gear', () => {
  it('grants exactly the loadout rows, infers kind from tags, defaults/honors quantity, keeps behavior tags, auto-equips', () => {
    setTableOverride('startingLoadout', [
      { name: 'M1911A1 Pistol', tags: ['weapon', 'ranged'], equip: 'main' },
      { name: 'Trench Knife', tags: ['weapon', 'knife', 'tool'] },
      { name: 'Grapnel Line', tags: ['climb', 'rope'] },
      { name: 'K-Ration', tags: ['food'], quantity: 3 },
      { name: 'Filled Canteen', tags: ['drink', 'water', 'container'] },
      { name: 'Field Flashlight', tags: ['light'] },
    ]);
    const pc = createCharacter({ name: 'Tester', raceId: RACE(), factionId: FACTION });
    const byName = new Map(pc.inventory.map((i) => [i.name, i]));

    // Exactly the six loadout items — none of the built-in starter/knife/race gear leaked in.
    expect(pc.inventory.length).toBe(6);

    // Kind inferred from behavior tags.
    expect(byName.get('M1911A1 Pistol')?.kind).toBe('weapon');
    expect(byName.get('Trench Knife')?.kind).toBe('weapon');
    expect(byName.get('K-Ration')?.kind).toBe('consumable');
    expect(byName.get('Filled Canteen')?.kind).toBe('consumable');
    expect(byName.get('Field Flashlight')?.kind).toBe('relic'); // light → relic (matches Hand Torch)
    expect(byName.get('Grapnel Line')?.kind).toBe('misc');

    // Quantity: explicit honored, otherwise defaults to 1.
    expect(byName.get('K-Ration')?.quantity).toBe(3);
    expect(byName.get('Trench Knife')?.quantity).toBe(1);

    // Behavior tags survive (so food/drink/climb keep working).
    expect(byName.get('K-Ration')?.tags).toContain('food');
    expect(byName.get('Filled Canteen')?.tags).toEqual(expect.arrayContaining(['drink', 'water']));
    expect(byName.get('Grapnel Line')?.tags).toEqual(expect.arrayContaining(['climb', 'rope']));

    // Weapons get durability stamped even when the name isn't in the catalog.
    expect(byName.get('M1911A1 Pistol')?.durability).toBeTruthy();

    // Auto-equip honored the explicit equip:'main'.
    expect(pc.equipped.main).toBe('M1911A1 Pistol');
  });

  it('arms the player with the first weapon when no row declares equip', () => {
    setTableOverride('startingLoadout', [
      { name: 'Field Ration', tags: ['food'] },
      { name: 'Service Rifle', tags: ['weapon'] },
    ]);
    const pc = createCharacter({ name: 'Tester', raceId: RACE(), factionId: FACTION });
    expect(pc.equipped.main).toBe('Service Rifle');
  });

  it('no loadout uploaded → built-in starter behavior is untouched', () => {
    // (override cleared by afterEach; not set here)
    const pc = createCharacter({ name: 'Tester', raceId: RACE(), factionId: FACTION });
    expect(pc.inventory.length).toBeGreaterThan(0);
    expect(pc.equipped.main).toBeTruthy();
  });
});
