// engine_Dev — the uploaded titles JSON now MERGES with the 20 built-in earnable
// titles instead of replacing them: an entry whose id matches a built-in re-skins
// that title's display (name / requirement / perk) while its earning predicate is
// untouched; an entry with a new id + track/threshold is an added achievement.

import {
  resolveTitleRoster,
  builtinTitleDisplay,
  liveCustomTitles,
} from '../app/engine/customTitles';
import { setCustomTitlesOverride } from '../app/engine/contentPack';

afterEach(() => setCustomTitlesOverride(null));

describe('engine_Dev — title roster merge + built-in override', () => {
  it('with no upload, surfaces all 20 built-in titles and nothing else', () => {
    const roster = resolveTitleRoster();
    expect(roster).toHaveLength(20);
    expect(roster.every((t) => t.builtin)).toBe(true);
    expect(roster.find((t) => t.id === 'bane_of_constructs')).toBeTruthy();
  });

  it('an uploaded entry matching a built-in id re-skins its display', () => {
    setCustomTitlesOverride([
      { id: 'bane_of_constructs', name: 'Machine Breaker', requirement: 'Smash 5 machines', description: 'Hits robots harder.' },
    ]);
    const row = resolveTitleRoster().find((t) => t.id === 'bane_of_constructs')!;
    expect(row.title).toBe('Machine Breaker');
    expect(row.requirement).toBe('Smash 5 machines');
    expect(row.perk).toBe('Hits robots harder.');
    expect(row.builtin).toBe(true);
    // still 20 built-ins (override does not add a row)
    expect(resolveTitleRoster().filter((t) => t.builtin)).toHaveLength(20);
    // and the earn announcement resolves the same override
    expect(builtinTitleDisplay('bane_of_constructs')).toEqual({ title: 'Machine Breaker', perk: 'Hits robots harder.' });
  });

  it('a partial override only replaces the fields provided', () => {
    setCustomTitlesOverride([{ id: 'seeker_of_lost_relics', name: 'Treasure Hound' }]);
    const row = resolveTitleRoster().find((t) => t.id === 'seeker_of_lost_relics')!;
    expect(row.title).toBe('Treasure Hound');
    // requirement + perk fall back to the built-in text
    expect(row.requirement.length).toBeGreaterThan(5);
    expect(row.perk.length).toBeGreaterThan(5);
  });

  it('a new id with track + threshold appends as a non-builtin achievement', () => {
    setCustomTitlesOverride([
      { id: 'fold_veteran', name: 'Veteran of the Fold', track: 'enemiesDefeated', threshold: 50, description: 'Seasoned.' },
    ]);
    const roster = resolveTitleRoster();
    expect(roster).toHaveLength(21);
    const added = roster.find((t) => t.id === 'fold_veteran')!;
    expect(added.builtin).toBe(false);
    expect(added.title).toBe('Veteran of the Fold');
    expect(added.requirement).toContain('≥ 50');
    // it also drives the earning path
    expect(liveCustomTitles().map((t) => t.id)).toContain('fold_veteran');
  });

  it('built-in override entries are NOT treated as earnable custom titles', () => {
    setCustomTitlesOverride([{ id: 'bane_of_constructs', name: 'Machine Breaker' }]);
    // no track/threshold → not a valid data-driven CustomTitle, so the earning
    // path ignores it (the built-in predicate still earns bane_of_constructs).
    expect(liveCustomTitles()).toHaveLength(0);
  });
});
