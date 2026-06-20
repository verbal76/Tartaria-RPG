// engine_Dev — the tutorial teaches with items pulled from the LIVE tables, so a
// re-skinned game picks up its own weapon/armor (a .38 Revolver, not a Cudgel).

import { getTutorialProps, fillTutorialPlaceholders } from '../app/engine/tutorialProps';
import { setTableOverride, clearAllOverrides } from '../app/engine/contentPack';

describe('engine_Dev — data-driven tutorial props', () => {
  afterEach(() => clearAllOverrides());

  it('defaults to built-in starter props', () => {
    const p = getTutorialProps();
    expect(typeof p.weapon).toBe('string');
    expect(p.weapon.length).toBeGreaterThan(0);
    expect(typeof p.armor).toBe('string');
    expect(typeof p.rope).toBe('string');
  });

  it('resolves the weapon + armor from uploaded tables', () => {
    setTableOverride('weapons', [
      { name: '.38 Revolver', rarity: 'Common', weaponKind: 'ranged', damageType: 'piercing', damageDice: '1d8', stat: 'dexterity', tags: ['weapon', 'gun'], description: 'A snub sidearm.' },
    ]);
    setTableOverride('armor', [
      { name: 'Flak Vest', rarity: 'Common', slot: 'torso', ac: 2, tags: ['armor'], description: 'Issue vest.' },
    ]);
    const p = getTutorialProps();
    expect(p.weapon).toBe('.38 Revolver');
    expect(p.armor).toBe('Flak Vest');
  });

  it('resolves the rope from a climb-tagged gear item', () => {
    setTableOverride('gear', [
      { name: 'Grapnel Line', kind: 'misc', rarity: 'Common', tags: ['climb', 'rope'], description: 'A launched grapnel.' },
    ]);
    expect(getTutorialProps().rope).toBe('Grapnel Line');
  });

  it('fills {weapon}/{armor}/{rope} placeholders in tutorial copy', () => {
    setTableOverride('weapons', [{ name: '.38 Revolver', rarity: 'Common', weaponKind: 'ranged', damageType: 'piercing', damageDice: '1d8', stat: 'dexterity', tags: ['weapon'], description: 'x' }]);
    expect(fillTutorialPlaceholders('Tap TAKE to grab the {weapon}.')).toBe('Tap TAKE to grab the .38 Revolver.');
    expect(fillTutorialPlaceholders('no placeholder here')).toBe('no placeholder here');
  });
});
