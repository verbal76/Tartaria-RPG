// Guild Broker engine (arb53). The Parley Ground picks two non-allied factions,
// each demanding their canon coveted relic; fetch both → seal the alliance.

import {
  pickBrokerFactions,
  brokerLeg,
  missionLegs,
  isBrokerSourceTile,
  factionName,
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
});
