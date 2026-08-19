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

  // ⚠⚠ P19 — A HUNT'S PIN FOLLOWS ITS CURRENT STAGE, not its poster. Before the stage
  // layer the pin sat on the contract's one anchor for the whole hunt, so a chase that
  // crosses the map still routed you back to stage one's tile every time. The record's
  // `stage` is now part of the answer — which is why this test names it explicitly.
  it('a hunt anchors on its CURRENT STAGE; a faction quest on its faction home', () => {
    const markers = openContractMarkers(player({
      activeHunts: [{ id: 'hunt_bog_dragon', stage: 0, postedByFaction: null, acceptedAt: 0 }],
      activeFactionQuests: [{ id: 'fq_reclaimers_starter', stage: 0, postedByFaction: 'reclaimers_guild', acceptedAt: 0 }],
    }));
    expect(markers).toHaveLength(2);
    // hunt comes first (list order), faction quest second.
    expect(markers[0].family).toBe('hunt');
    expect(markers[0].number).toBe(1);
    // Stage 0 of the Bog Dragon opens with the Drakovan reeve, in Drakova.
    expect(markers[0].anchorId).toBe('drakova');
    expect(markers[0]).toMatchObject(canonicalCellOf('drakova'));
    expect(markers[1].family).toBe('faction');
    expect(markers[1].number).toBe(2);
    expect(markers[1].anchorId).toBe('reclaimer_stake');
  });

  it('the same hunt, later, pins somewhere else — the pin walks with the player', () => {
    const at = (stage: number) => openContractMarkers(player({
      activeHunts: [{ id: 'hunt_bog_dragon', stage, postedByFaction: null, acceptedAt: 0 }],
    }))[0]!.anchorId;
    // Stage 0 the reeve (Drakova) → stage 2 Old Mira (the Waystation) → apex the Mud Seas.
    expect(at(0)).toBe('drakova');
    expect(at(2)).toBe('monarch_waystation');
    expect(at(6)).toBe('mud_seas');
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
