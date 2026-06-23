// engine_Dev — the dog-rescue hookNoun matcher is now WHOLE-WORD (was a loose
// bidirectional substring test that false-fired "forest" on "trash", "bunker"
// on "lock"/"arm", "snare" on "spit"/"strap", etc.), and captor combat (hp /
// attack / damage / loot) is author-overridable per scenario.

import {
  rescueHookMatches,
  matchRescueScenarioId,
  spawnRescueCaptor,
} from '../app/engine/dogCompanion';
import { setDogScenariosOverride, clearAllOverrides } from '../app/engine/contentPack';

describe('rescueHookMatches — whole-word matching', () => {
  it('matches exact + word-bounded occurrences', () => {
    expect(rescueHookMatches('ash', 'ash')).toBe(true);
    expect(rescueHookMatches('ash', 'ash tree')).toBe(true);
    expect(rescueHookMatches('ash', 'the black ash')).toBe(true);
    expect(rescueHookMatches('airlock', 'the airlock')).toBe(true);
    expect(rescueHookMatches('containment', 'the containment unit')).toBe(true);
  });

  it('does NOT match a noun buried inside a larger word (the false positives)', () => {
    expect(rescueHookMatches('ash', 'trash')).toBe(false);
    expect(rescueHookMatches('ash', 'ashes')).toBe(false);
    expect(rescueHookMatches('lab', 'slab')).toBe(false);
    expect(rescueHookMatches('airlock', 'lock')).toBe(false);   // no nl.includes(t) direction
    expect(rescueHookMatches('armory', 'arm')).toBe(false);
    expect(rescueHookMatches('pit', 'spit')).toBe(false);
    expect(rescueHookMatches('trap', 'strap')).toBe(false);
    expect(rescueHookMatches('brig', 'bright')).toBe(false);
  });

  it('a multi-word phrase fires ONLY on the full phrase, never its single words', () => {
    expect(rescueHookMatches('snare pit', 'the snare pit')).toBe(true);
    expect(rescueHookMatches('snare pit', 'snare pit')).toBe(true);
    expect(rescueHookMatches('snare pit', 'snare')).toBe(false);
    expect(rescueHookMatches('snare pit', 'pit')).toBe(false);
    expect(rescueHookMatches('black ash tree', 'the black ash tree by the path')).toBe(true);
    expect(rescueHookMatches('black ash tree', 'tree')).toBe(false);
    expect(rescueHookMatches('black ash tree', 'black')).toBe(false);
  });
});

describe('matchRescueScenarioId — over an uploaded set, no false fires', () => {
  afterEach(() => clearAllOverrides());
  beforeEach(() =>
    setDogScenariosOverride([
      { id: 'lab', hookNouns: ['containment', 'generator'], captorFactionId: 'FringeTech', captorName: 'Researcher', defaultBreed: 'mongrel', startingProfile: 'mongrel', archetypes: [], introLine: 'x {captorName}', victoryLine: 'y' },
      { id: 'bunker', hookNouns: ['airlock', 'armory'], captorFactionId: 'SMERSH', captorName: 'Handler', defaultBreed: 'mongrel', startingProfile: 'mongrel', archetypes: [], introLine: 'x {captorName}', victoryLine: 'y' },
      { id: 'snare', hookNouns: ['snare', 'snare pit'], captorFactionId: null, captorName: 'Poacher', defaultBreed: 'mutt', startingProfile: 'mutt', archetypes: [], introLine: 'x {captorName}', victoryLine: 'y' },
    ]),
  );

  it('intended targets fire', () => {
    expect(matchRescueScenarioId('the containment unit')).toBe('lab');
    expect(matchRescueScenarioId('airlock')).toBe('bunker');
    expect(matchRescueScenarioId('snare')).toBe('snare');          // single-word entry
    expect(matchRescueScenarioId('the snare pit')).toBe('snare');  // full phrase entry
  });

  it('previously-false targets no longer fire anything', () => {
    expect(matchRescueScenarioId('pit')).toBeNull();   // "snare pit" no longer fires on "pit"
    expect(matchRescueScenarioId('lock')).toBeNull();
    expect(matchRescueScenarioId('arm')).toBeNull();
    expect(matchRescueScenarioId('trash')).toBeNull();
    expect(matchRescueScenarioId('strap')).toBeNull();
  });
});

describe('spawnRescueCaptor — author-overridable combat', () => {
  afterEach(() => clearAllOverrides());

  it('honors captorHp / captorAttack / captorDamage / captorLoot, else defaults', () => {
    setDogScenariosOverride([
      {
        id: 'lab', hookNouns: ['containment'], captorFactionId: 'FringeTech', captorName: 'Researcher',
        defaultBreed: 'mongrel', startingProfile: 'mongrel', archetypes: [], introLine: 'x', victoryLine: 'y',
        captorHp: 30, captorAttack: '7', captorDamage: '2d6', captorLoot: ['Lab Keycard', 'Sedative'],
      },
      {
        id: 'snare', hookNouns: ['snare'], captorFactionId: null, captorName: 'Poacher',
        defaultBreed: 'mutt', startingProfile: 'mutt', archetypes: [], introLine: 'x', victoryLine: 'y',
      },
    ]);
    const lab = spawnRescueCaptor('lab', 'someone_else');
    expect(lab.hp).toBe(30);
    expect(lab.attack).toBe('7');
    expect(lab.damage).toBe('2d6');
    expect(lab.loot).toEqual(['Lab Keycard', 'Sedative']);
    // the fallback row defines no overrides → engine defaults
    const fb = spawnRescueCaptor('snare', null);
    expect(fb.hp).toBe(14);
    expect(fb.loot).toEqual(['Scrap Metal', 'Hardtack', 'Mud Cloth']);
  });

  it('a player of the captor faction fights the unaligned row WITH the unaligned row’s stats', () => {
    setDogScenariosOverride([
      {
        id: 'lab', hookNouns: ['containment'], captorFactionId: 'FringeTech', captorName: 'Researcher',
        defaultBreed: 'mongrel', startingProfile: 'mongrel', archetypes: [], introLine: 'x', victoryLine: 'y',
        captorHp: 30, captorLoot: ['Lab Keycard'],
      },
      {
        id: 'snare', hookNouns: ['snare'], captorFactionId: null, captorName: 'Poacher',
        defaultBreed: 'mutt', startingProfile: 'mutt', archetypes: [], introLine: 'x', victoryLine: 'y',
        captorHp: 9, captorLoot: ['Snared Rabbit'],
      },
    ]);
    const swapped = spawnRescueCaptor('lab', 'FringeTech'); // player IS FringeTech
    expect(swapped.name).toBe('Poacher');
    expect(swapped.hp).toBe(9);                 // unaligned row's stats
    expect(swapped.loot).toEqual(['Snared Rabbit']);
  });
});
