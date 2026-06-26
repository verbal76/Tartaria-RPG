// engine_Dev — in a RE-SKIN, the uploaded startingLoadout JSON is the SOLE source
// of the new character's kit. The built-in Tartaria starter items (Hand Torch,
// Trail Rations, Water Bottle, Finder's Locket, the race/faction default gear)
// must NOT leak in — a player who fills out a loadout gets exactly that loadout,
// resolved to real catalog items (not inert "improvised" placeholders).

import { createCharacter } from '../app/engine/character';
import { setTableOverride, clearAllOverrides } from '../app/engine/contentPack';

const BUILTIN_KIT = ['Hand Torch', 'Trail Rations', 'Water Bottle', "Finder's Locket"];

function loadPhillyPack() {
  // Minimal re-skin: overriding factions/races/enemies flips isReskinActive() true.
  setTableOverride('factions', [
    { id: 'british_sovereign_forces', name: 'British Sovereign Forces', startingStanding: 0 },
    { id: 'soviet_smersh', name: 'Soviet SMERSH', startingStanding: 0 },
  ]);
  setTableOverride('races', [{ id: 'soldier', name: 'Soldier', description: 'A WWII operative.', baseAC: 10, startingTCFormula: '2d6 x 10', startingHP: 40 }]);
  setTableOverride('enemies', [{ name: 'Drowned Kriegsmarine', type: 'Undead', hp: 20 }]);
  // Real catalog rows the loadout names resolve against.
  setTableOverride('weapons', [
    { name: 'Webley Mk IV', weaponKind: 'ranged', damageType: 'ballistic', damageDice: '1d8', stat: 'dexterity', rarity: 'Common', tags: ['weapon', 'ranged', 'sidearm'], description: 'A British service revolver.' },
    { name: 'TT-33 Tokarev', weaponKind: 'ranged', damageType: 'ballistic', damageDice: '1d8', stat: 'dexterity', rarity: 'Common', tags: ['weapon', 'ranged', 'sidearm'], description: 'A Soviet sidearm.' },
  ]);
  setTableOverride('gear', [
    { name: 'British Char (Tea Flask)', kind: 'consumable', rarity: 'Common', tags: ['consumable', 'drink'], description: 'A flask of strong tea.' },
    { name: 'Tushonka (Canned Pork)', kind: 'consumable', rarity: 'Common', tags: ['consumable', 'food'], description: 'Canned pork ration.' },
  ]);
  setTableOverride('startingLoadout', [
    { name: 'Webley Mk IV', tags: ['weapon', 'ranged', 'sidearm'], equip: 'main', faction: 'british_sovereign_forces' },
    { name: 'British Char (Tea Flask)', tags: ['consumable', 'drink'], faction: 'british_sovereign_forces' },
    { name: 'TT-33 Tokarev', tags: ['weapon', 'ranged', 'sidearm'], equip: 'main', faction: 'soviet_smersh' },
    { name: 'Tushonka (Canned Pork)', tags: ['consumable', 'food'], quantity: 5, faction: 'soviet_smersh' },
  ]);
}

describe('engine_Dev — startingLoadout is the sole kit source in a re-skin', () => {
  afterEach(() => clearAllOverrides());

  it('a British character gets EXACTLY the British loadout — no built-in kit', () => {
    loadPhillyPack();
    const pc = createCharacter({ name: 'bobb', raceId: 'soldier', factionId: 'british_sovereign_forces' });
    const names = pc.inventory.map((i) => i.name);
    // The loadout items are present...
    expect(names).toContain('Webley Mk IV');
    expect(names).toContain('British Char (Tea Flask)');
    // ...the OTHER faction's loadout rows are filtered out...
    expect(names).not.toContain('TT-33 Tokarev');
    expect(names).not.toContain('Tushonka (Canned Pork)');
    // ...and NONE of the built-in Tartaria starter kit leaks in.
    for (const junk of BUILTIN_KIT) expect(names).not.toContain(junk);
    // The loadout weapon is equipped to the main hand.
    expect(pc.equipped.main).toBe('Webley Mk IV');
  });

  it('the loadout items resolve to REAL catalog kinds (not inert "improvised" misc)', () => {
    loadPhillyPack();
    const pc = createCharacter({ name: 'bobb', raceId: 'soldier', factionId: 'british_sovereign_forces' });
    const webley = pc.inventory.find((i) => i.name === 'Webley Mk IV');
    expect(webley!.kind).toBe('weapon');
    const tea = pc.inventory.find((i) => i.name === 'British Char (Tea Flask)');
    expect(tea!.kind).toBe('consumable');
    // No item should carry the "improvised" fallback tag.
    for (const it of pc.inventory) expect(it.tags ?? []).not.toContain('improvised');
  });

  it('a re-skin race that omits startingTCFormula does not crash creation', () => {
    // Same pack but the race has NO startingTCFormula — the engine must default,
    // not throw (a content author shouldn't be able to crash char creation).
    setTableOverride('factions', [{ id: 'british_sovereign_forces', name: 'British', startingStanding: 0 }]);
    setTableOverride('races', [{ id: 'soldier', name: 'Soldier', description: 'x', baseAC: 10 }]);
    setTableOverride('enemies', [{ name: 'X', type: 'Undead', hp: 20 }]);
    setTableOverride('weapons', [{ name: 'Webley Mk IV', weaponKind: 'ranged', damageType: 'ballistic', damageDice: '1d8', stat: 'dexterity', rarity: 'Common', tags: ['weapon'], description: 'x' }]);
    setTableOverride('startingLoadout', [{ name: 'Webley Mk IV', tags: ['weapon'], equip: 'main', faction: 'british_sovereign_forces' }]);
    const pc = createCharacter({ name: 'bobb', raceId: 'soldier', factionId: 'british_sovereign_forces' });
    expect(pc.tc).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(pc.tc)).toBe(true);
  });
});
