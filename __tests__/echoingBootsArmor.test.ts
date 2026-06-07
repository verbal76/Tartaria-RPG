import { itemIsTool } from '../app/engine/pouchEligibility';
import { validSlotsForItem } from '../app/engine/equipment';
import armorData from '../app/data/items/armor.json';
import type { InventoryItem } from '../app/engine/types';

// arb-fix — several worn pieces (Echoing Steps Boots, gloves/gauntlets, Aether
// masks/cloaks/hood) were authored in exploration.json as `kind: exploration`
// + `tool` tags, so they were granted as misc TOOLS and shown in the pouch.
// They've been moved to armor.json with proper armor schema (slot, acBonus,
// statBonus, resistances, and a gate `effect` for the masks).
const ARMOR = (armorData as { armor: Array<Record<string, unknown>> }).armor;
const byName = (n: string) => ARMOR.find((a) => a.name === n);

describe('worn gear reclassified exploration-tool → armor', () => {
  const cases: Array<[string, string, string, number]> = [
    // name, slot, statBonus.stat, statBonus.amount
    ['Echoing Steps Boots', 'feet', 'dexterity', 1],
    ['Golem Leather Gloves', 'hands', 'strength', 1],
    ['Mud-Sealer Gauntlets', 'hands', 'strength', 1],
    ['Heat-Shield Gloves', 'hands', 'strength', 1],
    ['Aetheric Cloak', 'cloak', 'dexterity', 1],
    ['Anti-Aetheric Cloak', 'cloak', 'dexterity', 1],
    ['Stealth Hood', 'head', 'dexterity', 1],
  ];

  it.each(cases)('%s lives in armor.json with slot/statBonus', (name, slot, stat, amt) => {
    const e = byName(name) as Record<string, unknown> | undefined;
    expect(e).toBeTruthy();
    expect(e!.slot).toBe(slot);
    expect(e!.statBonus).toEqual({ stat, amount: amt });
    expect((e!.tags as string[])).toContain('armor');
    expect((e!.tags as string[])).not.toContain('tool');
  });

  it('Echoing Steps Boots: not a tool, equips to feet, +1 DEX applies (statBonus)', () => {
    const e = byName('Echoing Steps Boots') as Record<string, unknown>;
    const inv: InventoryItem = {
      id: 'b1', name: 'Echoing Steps Boots', kind: 'armor', quantity: 1,
      rarity: 'Common', tags: e.tags as string[],
    };
    expect(itemIsTool(inv)).toBe(false);
    expect(validSlotsForItem(inv)).toEqual(['feet']);
    expect(e.statBonus).toEqual({ stat: 'dexterity', amount: 1 });
  });

  it('Aether masks: armor with aether resistance + breathe_toxic gate preserved', () => {
    for (const name of ['Aetheric Mask', 'Aether-Breath Mask']) {
      const e = byName(name) as Record<string, unknown>;
      expect(e).toBeTruthy();
      expect(e.slot).toBe('head');
      expect((e.resistances as string[])).toContain('aetheric');
      expect(e.effect).toEqual({ kind: 'gate', unlocks: 'breathe_toxic' });
    }
  });

  it('aether cloaks + hood grant aether resistance', () => {
    for (const name of ['Aetheric Cloak', 'Anti-Aetheric Cloak', 'Stealth Hood']) {
      const e = byName(name) as Record<string, unknown>;
      expect((e.resistances as string[])).toContain('aetheric');
    }
  });

  it('Heat-Shield Gloves grant burn resistance', () => {
    const e = byName('Heat-Shield Gloves') as Record<string, unknown>;
    expect((e.resistances as string[])).toContain('burn');
  });

  it('the moved items are GONE from exploration.json', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const exp = require('../app/data/items/exploration.json') as Array<{ name: string }>;
    for (const [name] of cases) {
      expect(exp.find((x) => x.name === name)).toBeUndefined();
    }
    expect(exp.find((x) => x.name === 'Aetheric Mask')).toBeUndefined();
  });
});
