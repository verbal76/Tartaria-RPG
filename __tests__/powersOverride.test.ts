// engine_Dev — the magic/ability system is data-driven. The built-in Aethercraft
// disciplines are DEFAULT_POWERS; an uploaded 'powers' table replaces them, so a
// power's name / fuel / DC / stat reskin (the effect primitive stays coded).

import { getPowers, powerForDiscipline, DEFAULT_POWERS } from '../app/engine/powers';
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
});
