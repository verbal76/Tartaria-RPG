// engine_Dev — the faction systems must read the AUTHOR'S uploaded Factions table, not the
// built-in. findFaction()/liveFactions() resolve through the content-pack override, so a
// reskin's factions drive name lookups + reputation propagation (allies/rivals).

import { findFaction, liveFactions, applyRepChange, FACTIONS } from '../app/engine/factions';
import { setTableOverride } from '../app/engine/contentPack';
import type { Faction, FactionStanding } from '../app/engine/types';

const OVERRIDE: Faction[] = [
  { id: 'wardens', name: 'The Wardens', allies: ['seekers'], rivals: ['raiders'] },
  { id: 'seekers', name: 'The Seekers', allies: ['wardens'], rivals: ['raiders'] },
  { id: 'raiders', name: 'The Raiders', allies: [], rivals: ['wardens', 'seekers'] },
] as unknown as Faction[];

afterEach(() => setTableOverride('factions', null));

describe('engine_Dev — faction lookups honor the uploaded Factions override', () => {
  it('with no override, findFaction reads the built-in table', () => {
    expect(liveFactions()).toBe(FACTIONS);
    expect(findFaction(FACTIONS[0]!.id)?.id).toBe(FACTIONS[0]!.id);
  });

  it('with an override, findFaction resolves the AUTHOR ids/names (built-in ids gone)', () => {
    setTableOverride('factions', OVERRIDE);
    expect(findFaction('wardens')?.name).toBe('The Wardens');
    expect(findFaction('mud_monarchs')).toBeNull(); // a built-in id no longer resolves
    expect(liveFactions().map((f) => f.id).sort()).toEqual(['raiders', 'seekers', 'wardens']);
  });

  it('reputation propagation uses the override\'s allies/rivals', () => {
    setTableOverride('factions', OVERRIDE);
    const standing: FactionStanding[] = [
      { factionId: 'wardens', standing: 0 },
      { factionId: 'seekers', standing: 0 },
      { factionId: 'raiders', standing: 0 },
    ];
    const r = applyRepChange(standing, 'wardens', 10);
    expect(r.standing.find((s) => s.factionId === 'wardens')!.standing).toBe(10);
    expect(r.standing.find((s) => s.factionId === 'seekers')!.standing).toBe(5);  // ally +half
    expect(r.standing.find((s) => s.factionId === 'raiders')!.standing).toBe(-5); // rival -half
  });
});
