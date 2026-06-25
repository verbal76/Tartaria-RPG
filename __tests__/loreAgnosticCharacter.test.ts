// engine_Dev — character creation is lore-agnostic: getRaces()/getFactions() (the
// source for the creation screen, stats, race mechanics, faction init) read through
// the content-pack registry, so an uploaded races/factions table replaces the
// Tartaria built-ins. createCharacter() builds from the resolved tables too.

import { getRaces, getFactions, createCharacter } from '../app/engine/character';
import { setTableOverride, clearAllOverrides } from '../app/engine/contentPack';

describe('engine_Dev — lore-agnostic character creation', () => {
  afterEach(() => clearAllOverrides());

  it('getRaces / getFactions return the built-in Tartaria tables by default', () => {
    expect(getRaces().length).toBeGreaterThan(0);
    expect(getFactions().length).toBeGreaterThan(0);
  });

  it('an uploaded races table replaces the creation roster', () => {
    setTableOverride('races', [
      { id: 'sailor', name: 'US Navy Sailor', description: 'Crew of the USS Eldridge.' },
      { id: 'scientist', name: 'Project Scientist', description: 'Rainbow Project staff.' },
    ]);
    const ids = getRaces().map((r) => r.id);
    expect(ids).toEqual(['sailor', 'scientist']);
    expect(ids).not.toContain('unknowing_mass'); // Tartaria race is gone
  });

  it('createCharacter builds faction standings from the uploaded factions table', () => {
    setTableOverride('factions', [
      { id: 'navy', name: 'US Navy', startingStanding: 0 },
      { id: 'crew', name: 'Eldridge Crew', startingStanding: 5 },
    ]);
    const builtinRace = getRaces()[0]!.id; // races NOT overridden here
    const pc = createCharacter({ raceId: builtinRace, factionId: 'navy' });
    const standings = pc.factionStanding.map((s) => s.factionId).sort();
    expect(standings).toEqual(['crew', 'navy']);
    // The chosen faction gets the +10 bump.
    expect(pc.factionStanding.find((s) => s.factionId === 'navy')!.standing).toBeGreaterThanOrEqual(10);
  });

  it('clearing the override restores the Tartaria roster', () => {
    setTableOverride('races', [{ id: 'sailor', name: 'x' }]);
    clearAllOverrides();
    expect(getRaces().map((r) => r.id)).toContain('unknowing_mass');
  });
});
