// engine_Dev — the "dog hook" wording is author-definable. An uploaded
// dogScenarios table must drive getRescueScenarios()/spawnRescueCaptor with the
// firing MECHANIC unchanged (captor-faction keying + unaligned fallback).

import {
  getRescueScenarios,
  getRescueScenario,
  spawnRescueCaptor,
} from '../app/engine/dogCompanion';
import { setDogScenariosOverride, clearAllOverrides } from '../app/engine/contentPack';

describe('engine_Dev — dog-rescue scenario override (the dog hook)', () => {
  afterEach(() => clearAllOverrides());

  it('falls back to the built-in scenarios when nothing is uploaded', () => {
    const built = getRescueScenarios();
    expect(built.length).toBeGreaterThan(0);
    // built-in carries the smelter/snare set
    expect(built.find((s) => s.id === 'smelter')).toBeTruthy();
    expect(built.some((s) => s.captorFactionId == null)).toBe(true);
  });

  it('an uploaded dogScenarios table drives the live set + lookup', () => {
    setDogScenariosOverride([
      {
        id: 'pier_cage', hookNouns: ['crate', 'pier cage'],
        captorFactionId: 'navy', captorName: 'Deserter Bosun',
        defaultBreed: 'shepherd', startingProfile: 'shepherd',
        archetypes: ['dock'], rumorVenue: 'a crate on Pier 4',
        introLine: 'A dog whines in a crate. The {captorName} blocks your way.',
        victoryLine: 'The bosun drops. The dog is yours now.',
      },
      {
        id: 'alley', hookNouns: ['alley', 'rope'],
        captorFactionId: null, captorName: 'Back-alley Tough',
        defaultBreed: 'mutt', startingProfile: 'mutt',
        archetypes: ['city'],
        introLine: 'A mutt is tied in the alley. The {captorName} turns.',
        victoryLine: 'The tough folds. The mutt settles.',
      },
    ]);
    const live = getRescueScenarios();
    expect(live).toHaveLength(2);
    expect(getRescueScenario('pier_cage')?.captorName).toBe('Deserter Bosun');
  });

  it('keeps the unaligned-fallback MECHANIC: a player of the captor faction never fights their own', () => {
    setDogScenariosOverride([
      {
        id: 'pier_cage', hookNouns: ['crate'], captorFactionId: 'navy', captorName: 'Deserter Bosun',
        defaultBreed: 'shepherd', startingProfile: 'shepherd', archetypes: ['dock'],
        introLine: 'x {captorName}', victoryLine: 'y',
      },
      {
        id: 'alley', hookNouns: ['alley'], captorFactionId: null, captorName: 'Back-alley Tough',
        defaultBreed: 'mutt', startingProfile: 'mutt', archetypes: ['city'],
        introLine: 'x {captorName}', victoryLine: 'y',
      },
    ]);
    // Player is NOT navy -> faces the navy captor.
    expect(spawnRescueCaptor('pier_cage', 'wardens').name).toBe('Deserter Bosun');
    // Player IS navy -> swapped to the unaligned captor.
    expect(spawnRescueCaptor('pier_cage', 'navy').name).toBe('Back-alley Tough');
    // The faction-neutral flag is always set so the kill costs no standing.
    expect(spawnRescueCaptor('pier_cage', 'navy').factionNeutralFight).toBe(true);
  });
});
