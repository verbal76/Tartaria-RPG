// Guild Broker engine (arb53). The Parley Ground picks two non-allied factions,
// each demanding their canon coveted relic; fetch both → seal the alliance.

import {
  pickBrokerFactions,
  brokerLeg,
  missionLegs,
  isBrokerSourceTile,
  factionName,
  brokerMissionLine,
  brokerMissionShortLine,
} from '../app/engine/broker';
import { FACTION_COVETED_ITEM } from '../app/engine/locationChallenges';

describe('Guild Broker engine', () => {
  it('coveted chart is the canon-relic set (9 distinct relics at real tiles)', () => {
    const names = Object.values(FACTION_COVETED_ITEM).map((c) => c.name);
    expect(new Set(names).size).toBe(9);
    expect(names).toContain('Mud Flood Nexus Pulse-Key');
    expect(names).toContain("Mask of Tartaria's Last King");
    expect(names).toContain('Aetheric Phoenix Feather');
  });

  it('picks the first two eligible factions, excluding the player and affiliated ones', () => {
    const standings = [{ factionId: 'forgotten_order', standing: 20 }]; // affiliated → excluded
    const picked = pickBrokerFactions('mud_monarchs', standings);
    expect(picked).not.toBeNull();
    const [a, b] = picked!;
    expect(a).not.toBe('mud_monarchs');
    expect(b).not.toBe('mud_monarchs');
    expect([a, b]).not.toContain('forgotten_order');
    expect(a).not.toBe(b);
  });

  it('brokerLeg resolves faction name, relic, and a real source tile', () => {
    const leg = brokerLeg('reclaimers_guild')!;
    expect(leg.factionName).toBe('Reclaimers Guild');
    expect(leg.itemName).toBe('Fragment of the Endless Stair');
    expect(leg.tileId).toBe('endless_stair');
  });

  it('missionLegs + isBrokerSourceTile drive the fetch beats', () => {
    const mission = { factionA: 'reclaimers_guild', factionB: 'stone_builders' };
    const legs = missionLegs(mission)!;
    expect(legs.map((l) => l.itemName)).toEqual([
      'Fragment of the Endless Stair', 'Obsidian Siphon',
    ]);
    expect(isBrokerSourceTile(mission, 'endless_stair')?.itemName).toBe('Fragment of the Endless Stair');
    expect(isBrokerSourceTile(mission, 'obsidian_pillars')?.itemName).toBe('Obsidian Siphon');
    expect(isBrokerSourceTile(mission, 'asgardar')).toBeNull();
  });

  it('factionName falls back to the id for unknowns', () => {
    expect(factionName('mud_monarchs')).toBe('Mud Monarchs');
    expect(factionName('not_a_faction')).toBe('not_a_faction');
  });

  describe('brokerMissionLine (persistent "current mission" reminder — OTA-653)', () => {
    const mission = { factionA: 'reclaimers_guild', factionB: 'stone_builders' };
    const tileName = (id: string) => ({
      endless_stair: 'Endless Stair', obsidian_pillars: 'Obsidian Pillars',
    } as Record<string, string>)[id] ?? id;

    it('lists both demands with recover-at tiles when the player holds neither relic', () => {
      const line = brokerMissionLine(mission, () => false, tileName)!;
      // Leads with the mission NAME (matches the CONTRACTS card title) so the
      // standing reminder and the card agree on what this mission is called.
      expect(line.startsWith('Broker an Alliance')).toBe(true);
      expect(line).toContain('Reclaimers Guild demands the Fragment of the Endless Stair (recover it at Endless Stair)');
      expect(line).toContain('Stone Builders demands the Obsidian Siphon (recover it at Obsidian Pillars)');
      expect(line).toMatch(/SEAL THE ALLIANCE\.$/);
    });

    it('marks a relic already in hand with a check instead of a recover-at tile', () => {
      const line = brokerMissionLine(mission, (n) => n === 'Fragment of the Endless Stair', tileName)!;
      expect(line).toContain('Fragment of the Endless Stair (in hand ✓)');
      expect(line).toContain('Obsidian Siphon (recover it at Obsidian Pillars)');
    });

    it('returns null for a missing or already-sealed mission', () => {
      expect(brokerMissionLine(null, () => false, tileName)).toBeNull();
      expect(brokerMissionLine(undefined, () => false, tileName)).toBeNull();
      expect(brokerMissionLine({ ...mission, done: true }, () => false, tileName)).toBeNull();
    });
  });

  describe('brokerMissionShortLine (SHORT standing reminder — OTA-701)', () => {
    const mission = { factionA: 'reclaimers_guild', factionB: 'stone_builders' };
    const tileName = (id) => ({
      endless_stair: 'Endless Stair', obsidian_pillars: 'Obsidian Pillars',
    })[id] ?? id;

    it('names the mission, progress, and only the NEXT step (holds neither)', () => {
      const line = brokerMissionShortLine(mission, () => false, tileName);
      expect(line.startsWith('Broker an Alliance — 0/2 relics.')).toBe(true);
      expect(line).toContain('Next: Fragment of the Endless Stair at Endless Stair (+1 more)');
      expect(line.length).toBeLessThan(brokerMissionLine(mission, () => false, tileName).length);
    });

    it('drops the "+N more" once only one relic remains', () => {
      const line = brokerMissionShortLine(mission, (n) => n === 'Fragment of the Endless Stair', tileName);
      expect(line.startsWith('Broker an Alliance — 1/2 relics.')).toBe(true);
      expect(line).not.toContain('more');
    });

    it('switches to the SEAL prompt once both relics are in hand', () => {
      expect(brokerMissionShortLine(mission, () => true, tileName)).toBe('Broker an Alliance — all 2 relics in hand. SEAL THE ALLIANCE at the parley stone.');
    });
  });
});
