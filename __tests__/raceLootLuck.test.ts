import { rollAreaSearch } from '../app/engine/areaSearch';
import { raceLootBias, raceSearchHookBonus } from '../app/engine/raceMechanics';
import type { PlayerCharacter, SceneContext } from '../app/engine/types';

function player(raceId: string): PlayerCharacter {
  return { raceId, inventory: [], equipped: {} } as unknown as PlayerCharacter;
}
function scene(tags: string[]): SceneContext {
  return { location: { tags } } as unknown as SceneContext;
}

describe('race loot-luck — raceLootBias / raceSearchHookBonus', () => {
  it('Reclaimer + Aetherborn get an always-on loot bias; Mud Dweller only indoors', () => {
    expect(raceLootBias(player('reclaimer'), scene([]))).toBeGreaterThan(0);
    expect(raceLootBias(player('aetherborn'), scene([]))).toBeGreaterThan(0);
    // Mud Dweller: 0 on the open surface, >0 underground.
    expect(raceLootBias(player('mud_dweller'), scene([]))).toBe(0);
    expect(raceLootBias(player('mud_dweller'), scene(['underground']))).toBeGreaterThan(0);
    // Giant: no loot luck.
    expect(raceLootBias(player('tartarian_giant'), scene(['underground']))).toBe(0);
  });

  it('Mud Dweller hook keenness only fires indoors/underground', () => {
    expect(raceSearchHookBonus(player('mud_dweller'), scene([]))).toBe(0);
    expect(raceSearchHookBonus(player('mud_dweller'), scene(['underground']))).toBeGreaterThan(0);
    expect(raceSearchHookBonus(player('reclaimer'), scene(['underground']))).toBe(0);
  });

  it('rareLootBias raises the share of material finds over many search rolls', () => {
    const trials = 4000;
    const count = (bias: number) => {
      let mats = 0;
      for (let i = 0; i < trials; i++) {
        if (rollAreaSearch('the rubble', { intent: 'search', rareLootBias: bias }).kind === 'material') mats++;
      }
      return mats / trials;
    };
    const base = count(0);
    const boosted = count(0.2);
    expect(boosted).toBeGreaterThan(base); // wider material window → more finds
  });

  it('rareLootBias never errors and stays a valid outcome on investigate', () => {
    const out = rollAreaSearch('the altar', { intent: 'investigate', rareLootBias: 0.18 });
    expect(['nothing', 'material', 'tc', 'hook', 'directional_find', 'cool_story']).toContain(out.kind);
  });
});
