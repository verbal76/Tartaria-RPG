import { createCharacter } from '../app/engine/character';
import { effectiveStats } from '../app/engine/equipment';
import { inferWeapon, inferArmor, inferAccessory, inferStealthBonus } from '../app/engine/itemDefaults';
import { synthesizeFusionDeterministic } from '../app/engine/itemFusion';
import type { PlayerCharacter, InventoryItem } from '../app/engine/types';

// OTA-349 — stealth gear pass. Stealth now lives on appropriate weapons +
// light armor, the inferred-stats engine grants it for stealthy-named gear,
// and fusion carries it through from stealthy inputs.

function basePlayer(): PlayerCharacter {
  const p = createCharacter({ name: 'T', raceId: 'reclaimer', factionId: 'mud_monarchs' } as never);
  p.stats.stealth = 0;        // deterministic base
  p.equipped = {} as never;   // clear starter gear
  p.inventory = [];
  return p;
}

describe('equipped weapon stealth applies', () => {
  it('a stealth dagger in the main hand raises effective Stealth', () => {
    const p = basePlayer();
    p.equipped = { main: "Bone Shiv (Stealth)" } as never; // catalog: +2 stealth
    expect(effectiveStats(p).stealth).toBe(2);
  });

  it('a quiet bow contributes its +1 too', () => {
    const p = basePlayer();
    p.equipped = { main: 'Salvaged Bow' } as never; // catalog: +1 stealth
    expect(effectiveStats(p).stealth).toBe(1);
  });
});

describe('inferred-stats engine grants stealth for stealthy names', () => {
  it('inferStealthBonus reads the vocabulary (+2 strong, +1 light, 0 none)', () => {
    expect(inferStealthBonus('Shadowstep Footwraps')).toBe(2);
    expect(inferStealthBonus('Muffled Shiv')).toBe(1);
    expect(inferStealthBonus('Iron Maul')).toBe(0);
  });

  it('inferred armor / weapon / accessory carry a stealth statBonus + tag', () => {
    const boots = inferArmor('Shadowstep Footwraps')!;
    expect(boots.statBonuses?.some((b) => b.stat === 'stealth' && b.amount === 2)).toBe(true);
    expect(boots.tags).toContain('stealth');

    const knife = inferWeapon('Muffled Shiv');
    expect(knife.statBonuses?.some((b) => b.stat === 'stealth')).toBe(true);
    expect(knife.tags).toContain('stealth');

    const pendant = inferAccessory('Shadow Pendant')!;
    expect(pendant.statBonus).toEqual({ stat: 'stealth', amount: 1 });
  });
});

describe('fusion carries stealth through from stealthy inputs', () => {
  function mkInput(over: Partial<InventoryItem> = {}): InventoryItem {
    return { id: 'i1', name: 'Scrap', kind: 'armor', quantity: 1, rarity: 'Common', tags: [], ...over } as InventoryItem;
  }

  it('a stealthy input → the fused result inherits a stealth statBonus', () => {
    const inputs = [mkInput({ tags: ['cloth', 'stealth'] }), mkInput({ id: 'i2', tags: ['fiber'] })];
    const res = synthesizeFusionDeterministic(inputs, ['cloth', 'fiber', 'stealth']);
    expect(res.stats.statBonus?.stat).toBe('stealth');
    expect(res.stats.statBonus?.amount).toBeGreaterThanOrEqual(1);
  });

  it('no stealthy input → no stealth statBonus', () => {
    const inputs = [mkInput({ tags: ['metal'] })];
    const res = synthesizeFusionDeterministic(inputs, ['metal', 'iron']);
    expect(res.stats.statBonus).toBeUndefined();
  });

  it('an equipped fused item with a stealth statBonus applies through effectiveStats', () => {
    const p = basePlayer();
    const fused: InventoryItem = {
      id: 'f1', name: 'Veil-Stitched Shroud', kind: 'armor', quantity: 1, rarity: 'Rare', tags: ['fused'],
      uniqueStats: { kind: 'armor', rarity: 'Rare', durability: { current: 30, max: 30 }, armorSlot: 'feet', acBonus: 2, statBonus: { stat: 'stealth', amount: 3 } },
    } as InventoryItem;
    p.inventory = [fused];
    p.equipped = { feet: 'Veil-Stitched Shroud' } as never;
    expect(effectiveStats(p).stealth).toBe(3);
  });
});
