import { factionGearOffers } from '../app/engine/vendors';
import factionsData from '../app/data/factions/factions.json';
import weaponsData from '../app/data/items/weapons.json';
import armorData from '../app/data/items/armor.json';
import { FACTION_QUESTS } from '../app/engine/factionQuests';
import type { Faction } from '../app/engine/types';

const FACTIONS = factionsData as Faction[];

interface GearRow { name: string; faction?: string; tags?: string[]; tc?: number }
const WEAPONS = ((weaponsData as unknown as { weapons?: GearRow[] }).weapons ?? []);
const ARMOR = ((armorData as unknown as { armor?: GearRow[] }).armor ?? []);

// arb104 — every outpost Armory sells the player's own faction-named arms +
// armor, and every faction offers standing-gaining missions. This locks in
// that each faction has at least one faction_gear weapon, one faction_gear
// armor piece, and ≥1 faction quest, and that factionGearOffers surfaces them.
describe('faction gear + mission coverage (arb104)', () => {
  it('every faction has ≥1 faction_gear weapon and ≥1 faction_gear armor', () => {
    const gaps: string[] = [];
    for (const f of FACTIONS) {
      const w = WEAPONS.filter((it) => (it.tags ?? []).includes('faction_gear') && it.faction === f.id);
      const a = ARMOR.filter((it) => (it.tags ?? []).includes('faction_gear') && it.faction === f.id);
      if (w.length < 1) gaps.push(`${f.id}: no faction weapon`);
      if (a.length < 1) gaps.push(`${f.id}: no faction armor`);
    }
    expect(gaps).toEqual([]);
  });

  it('factionGearOffers returns priced, in-stock offers for every faction', () => {
    for (const f of FACTIONS) {
      const offers = factionGearOffers(f.id);
      expect(offers.length).toBeGreaterThanOrEqual(2);
      for (const o of offers) {
        expect(o.itemName.length).toBeGreaterThan(0);
        expect(o.price).toBeGreaterThanOrEqual(2);
        expect(o.quantity ?? 1).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('every faction offers ≥1 standing-gaining mission', () => {
    const gaps: string[] = [];
    for (const f of FACTIONS) {
      const qs = FACTION_QUESTS.filter((q) => q.factionId === f.id);
      if (qs.length < 1) gaps.push(`${f.id}: no faction quest`);
      // every faction quest must grant reputation (standing) on completion
      for (const q of qs) {
        if (!q.reward || (q.reward.rep ?? 0) <= 0) gaps.push(`${q.id}: quest grants no rep`);
      }
    }
    expect(gaps).toEqual([]);
  });
});
