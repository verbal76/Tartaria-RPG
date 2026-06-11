// OTA-497 — perk-only faction rings. Each faction's armory now stocks one themed,
// stat-bonus-only ring (no AC, no HP). factionGearOffers(faction) must surface it.

import { factionGearOffers } from '../app/engine/vendors';
import { RINGS } from '../app/engine/crafting';

const EXPECTED: Record<string, { ring: string; stat: string }> = {
  conspiracy_architects: { ring: 'Ring of Shadows', stat: 'stealth' },
  servants_of_giants:    { ring: 'Titanhold Ring', stat: 'strength' },
  true_tartarians:       { ring: 'Tartarian Oath-Band', stat: 'strength' },
  reclaimers_guild:      { ring: 'Light-Finger Guild Band', stat: 'dexterity' },
  forgotten_order:       { ring: 'Ring of Forgotten Lore', stat: 'intelligence' },
  tartarian_revivalists: { ring: "Revivalist's Aether-Coil", stat: 'intelligence' },
  stone_builders:        { ring: "Architect's Insight Ring", stat: 'wisdom' },
  mud_monarchs:          { ring: "Monarch's Drowned Signet", stat: 'charisma' },
  eternal_dynasty:       { ring: 'Aetherborn Signet', stat: 'charisma' },
};

describe('OTA-497 — faction rings', () => {
  it("each faction's armory stocks its themed ring", () => {
    for (const [faction, { ring }] of Object.entries(EXPECTED)) {
      const names = factionGearOffers(faction).map((o) => o.itemName);
      expect(names).toContain(ring);
    }
  });

  it('the faction rings are perk-only: a stat bonus, no AC and no HP', () => {
    for (const { ring, stat } of Object.values(EXPECTED)) {
      const r = RINGS.find((x) => x.name === ring) as (typeof RINGS[number] & { acBonus?: number; hpBonus?: number }) | undefined;
      expect(r).toBeDefined();
      expect(r!.statBonus).toEqual({ stat, amount: 2 });
      expect(r!.acBonus).toBeUndefined();   // no armor class
      expect(r!.hpBonus).toBeUndefined();   // no hit points
      expect(r!.resistances).toEqual([]);   // no defensive resist either
    }
  });

  it('a faction with no themed ring gets none of these by mistake', () => {
    // sanity: a faction id that owns no ring returns an offer list without them
    const names = factionGearOffers('no_such_faction').map((o) => o.itemName);
    for (const { ring } of Object.values(EXPECTED)) expect(names).not.toContain(ring);
  });
});
