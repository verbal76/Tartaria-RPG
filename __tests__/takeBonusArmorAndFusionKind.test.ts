// engine_Dev — two authored behaviors:
//   1. pickTakeBonusArmor(): every TAKE salts in one LOW-TIER armor piece so the
//      loot stream isn't weapon-heavy (sell/scrap economy). Pulls from the ACTIVE
//      armor table, rarity-weighted to Common/Uncommon.
//   2. synthesizeFusionDeterministic(preferKind): the Crucible forges the kind the
//      player chose (weapon OR armor), overriding the dominant-tag inference.

import { pickTakeBonusArmor } from '../app/engine/crafting';
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

describe('engine_Dev — take bonus armor', () => {
  it('returns a low-tier (Common/Uncommon) armor piece from the active table', () => {
    // Sweep many picks — the table has higher tiers too, but the picker must only
    // ever surface Common/Uncommon fodder (Rare+ filtered out).
    for (let i = 0; i < 60; i++) {
      const a = pickTakeBonusArmor();
      expect(a).not.toBeNull();
      expect(['Common', 'Uncommon']).toContain(a!.rarity);
      // It's a real armor catalog row (has a slot + AC).
      expect(typeof a!.slot).toBe('string');
      expect(typeof a!.acBonus).toBe('number');
    }
  });
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
