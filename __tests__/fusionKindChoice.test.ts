// engine_Dev — synthesizeFusionDeterministic(preferKind): the Crucible forges the
// kind the player chose (weapon OR armor), overriding the dominant-tag inference.
// (The take-list armor guarantee is covered in takeableGearSpawns.test.ts.)

import { synthesizeFusionDeterministic } from '../app/engine/itemFusion';
import type { InventoryItem } from '../app/engine/types';

const mk = (name: string, tags: string[]): InventoryItem => ({
  id: `in_${name.replace(/\s+/g, '_')}`,
  name,
  kind: 'misc',
  rarity: 'Common',
  quantity: 1,
  tags,
});

describe('engine_Dev — Crucible kind choice', () => {
  // A metal/iron/plate input set normally forges a WEAPON; forcing armor must win.
  const metalInputs = [mk('Scrap A', ['metal', 'iron']), mk('Scrap B', ['plate']), mk('Scrap C', ['metal'])];
  const metalTags = ['metal', 'iron', 'plate'];
  // An organic/bone set normally forges ARMOR; forcing weapon must win.
  const organicInputs = [mk('Hide A', ['organic', 'bone']), mk('Hide B', ['organic']), mk('Hide C', ['bone'])];
  const organicTags = ['organic', 'bone'];

  it('forces a weapon even when the dominant tag would make armor', () => {
    expect(synthesizeFusionDeterministic(organicInputs, organicTags).stats.kind).toBe('armor'); // baseline
    expect(synthesizeFusionDeterministic(organicInputs, organicTags, 'weapon').stats.kind).toBe('weapon');
  });

  it('forces armor even when the dominant tag would make a weapon', () => {
    expect(synthesizeFusionDeterministic(metalInputs, metalTags).stats.kind).toBe('weapon'); // baseline
    expect(synthesizeFusionDeterministic(metalInputs, metalTags, 'armor').stats.kind).toBe('armor');
  });

  it('a forced weapon carries weapon stats; forced armor carries armor stats', () => {
    const w = synthesizeFusionDeterministic(organicInputs, organicTags, 'weapon').stats;
    expect(w.damageDice).toBeTruthy();
    const a = synthesizeFusionDeterministic(metalInputs, metalTags, 'armor').stats;
    expect(typeof a.acBonus).toBe('number');
    expect(a.acBonus).toBeGreaterThan(0);
  });
});
