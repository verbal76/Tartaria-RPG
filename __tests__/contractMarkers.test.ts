// arb100 — open contracts plot as numbered atlas pins, derived live from the
// player's open-contract lists (no persistence, so they back-populate + clear
// automatically). Numbered in Contracts-screen list order: hunts → mysteries →
// storylines → faction quests → leads.

import { openContractMarkers, contractMarkerNumbers } from '../app/engine/contractMarkers';
import { canonicalCellOf } from '../app/engine/worldMap';
import type { PlayerCharacter } from '../app/engine/types';

function player(over: Partial<PlayerCharacter>): PlayerCharacter {
  return { activeHunts: [], activeMysteries: [], activeStorylines: [], activeFactionQuests: [], activeQuests: [], ...over } as PlayerCharacter;
}

describe('openContractMarkers', () => {
  it('no open contracts → no markers', () => {
    expect(openContractMarkers(player({}))).toEqual([]);
    expect(contractMarkerNumbers(player({}))).toEqual({});
  });

  it('a hunt anchors on its biome cell; a faction quest on its faction home', () => {
    const markers = openContractMarkers(player({
      activeHunts: [{ id: 'hunt_bog_dragon', stage: 0, postedByFaction: null, acceptedAt: 0 }],
      activeFactionQuests: [{ id: 'fq_reclaimers_starter', stage: 0, postedByFaction: 'reclaimers_guild', acceptedAt: 0 }],
    }));
    expect(markers).toHaveLength(2);
    // hunt comes first (list order), faction quest second.
    expect(markers[0].family).toBe('hunt');
    expect(markers[0].number).toBe(1);
    expect(markers[0].anchorId).toBe('mud_seas');
    expect(markers[0]).toMatchObject(canonicalCellOf('mud_seas'));
    expect(markers[1].family).toBe('faction');
    expect(markers[1].number).toBe(2);
    expect(markers[1].anchorId).toBe('reclaimer_stake');
  });

  it('numbers follow the Contracts-screen order: hunts → faction quests → leads', () => {
    const loc = { id: 'asgardar', name: 'Asgardar' } as never;
    const numbers = contractMarkerNumbers(player({
      activeHunts: [{ id: 'hunt_bog_dragon', stage: 0, postedByFaction: null, acceptedAt: 0 }],
      activeFactionQuests: [{ id: 'fq_reclaimers_starter', stage: 0, postedByFaction: 'reclaimers_guild', acceptedAt: 0 }],
      activeQuests: [{ id: 'lead1', state: 'open', location: loc, objective: { id: 'o', verb: 'recover', target: 'a relic', tags: [] } } as never],
    }));
    expect(numbers['hunt:hunt_bog_dragon']).toBe(1);
    expect(numbers['faction:fq_reclaimers_starter']).toBe(2);
    expect(numbers['lead:lead1']).toBe(3);
  });

  it('skips leads with no location and completed/failed leads', () => {
    const markers = openContractMarkers(player({
      activeQuests: [
        { id: 'done', state: 'completed', location: { id: 'asgardar', name: 'Asgardar' }, objective: { id: 'o', verb: 'x', target: 'y', tags: [] } } as never,
        { id: 'open1', state: 'open', location: { id: 'asgardar', name: 'Asgardar' }, objective: { id: 'o', verb: 'x', target: 'y', tags: [] } } as never,
      ],
    }));
    expect(markers.map((m) => m.key)).toEqual(['lead:open1']);
  });
});
