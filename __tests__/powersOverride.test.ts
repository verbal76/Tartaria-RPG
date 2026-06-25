// engine_Dev — the magic/ability system is data-driven. The built-in Aethercraft
// disciplines are DEFAULT_POWERS; an uploaded 'powers' table replaces them, so a
// power's name / fuel / DC / stat reskin (the effect primitive stays coded).

import { getPowers, powerForDiscipline, matchPower, DEFAULT_POWERS, POWERS_TEMPLATE } from '../app/engine/powers';
import { setTableOverride, clearAllOverrides } from '../app/engine/contentPack';

describe('engine_Dev — data-driven powers', () => {
  afterEach(() => clearAllOverrides());

  it('defaults to the built-in Aethercraft disciplines', () => {
    expect(getPowers()).toBe(DEFAULT_POWERS);
    expect(powerForDiscipline('shape')?.name).toBe('Aetherstone Manipulation');
    expect(powerForDiscipline('mend')?.stat).toBe('wisdom');
  });

  it('an uploaded powers table reskins name / fuel / DC / stat', () => {
    setTableOverride('powers', [
      { id: 'fog', discipline: 'shape', name: 'Eldridge Fog', title: 'Eldridge Fog (shape)', body: 'x', stat: 'intelligence', dcBase: 10, fuels: ['Experiment Residue'], examples: ['call the fog'] },
      { id: 'patch', discipline: 'mend', name: 'Field Medic', title: 'Field Medic (mend)', body: 'x', stat: 'wisdom', dcBase: 11, fuels: ['Field Kit'], examples: ['patch up'] },
    ]);
    const shape = powerForDiscipline('shape')!;
    expect(shape.name).toBe('Eldridge Fog');
    expect(shape.fuels).toEqual(['Experiment Residue']);
    expect(shape.dcBase).toBe(10);
    expect(powerForDiscipline('mend')?.name).toBe('Field Medic');
    // A discipline the author omitted (summon) simply has no power.
    expect(powerForDiscipline('summon')).toBeUndefined();
  });

  it('matchPower routes a typed cast to a custom power by its examples', () => {
    setTableOverride('powers', [
      { id: 'fog', discipline: 'shape', name: 'Eldridge Fog', title: 't', body: 'b', stat: 'intelligence', dcBase: 12, fuels: ['Residue'], examples: ['call the fog', 'choking fog'], effect: { kind: 'coat_enemies', coating: 'corruption_coat', dmgPerTurn: 3, turns: 3, target: 'all' } },
    ]);
    expect(matchPower('call the fog')?.name).toBe('Eldridge Fog');
    expect(matchPower('i want to call the fog on them')?.id).toBe('fog');
    expect(matchPower('summon golem')).toBeNull(); // not in this set
  });

  it('the TEMPLATE carries custom-effect examples (fog = coat_enemies, heal = heal_self)', () => {
    const fog = POWERS_TEMPLATE.find((p) => p.effect?.kind === 'coat_enemies');
    const heal = POWERS_TEMPLATE.find((p) => p.effect?.kind === 'heal_self');
    expect(fog).toBeTruthy();
    expect(heal).toBeTruthy();
    // engine_Dev (OTA-770) — the template's discipline set is now GENERIC (no Tartaria
    // "aether_*" names), but all three engine disciplines are still present to edit.
    expect(POWERS_TEMPLATE.some((p) => p.discipline === 'summon')).toBe(true);
    expect(POWERS_TEMPLATE.some((p) => p.discipline === 'shape')).toBe(true);
    expect(POWERS_TEMPLATE.some((p) => p.discipline === 'mend')).toBe(true);
    // …and no Tartaria-specific ids leak into the template anymore.
    expect(POWERS_TEMPLATE.some((p) => p.id.startsWith('aether'))).toBe(false);
  });
});
