// engine_Dev — the built-in (Tartaria) "Mud Flood Nexus" main quest phase machine
// was REMOVED (it's an RPG engine — a main quest is authored as data; see
// customMainQuest.ts). All that remains in mainQuest.ts is the vestigial
// player.mainQuest field helpers + the reference-game capital list used by
// worldgen. This test covers only that surviving surface.

import {
  initMainQuest,
  ensureMainQuest,
  LOST_CAPITAL_LOCATIONS,
} from '../app/engine/mainQuest';

describe('mainQuest — vestigial state helpers', () => {
  it('initMainQuest starts at hook with no Cores', () => {
    const mq = initMainQuest();
    expect(mq.phase).toBe('hook');
    expect(mq.coresRecovered).toEqual([]);
  });

  it('ensureMainQuest returns a well-formed state for a fresh/undefined save', () => {
    const backfilled = ensureMainQuest(undefined);
    expect(backfilled.phase).toBe('hook');
    expect(Array.isArray(backfilled.coresRecovered)).toBe(true);
  });

  it('ensureMainQuest passes through an existing well-formed state', () => {
    const existing = { phase: 'ended' as const, coresRecovered: ['asgardar'] };
    expect(ensureMainQuest(existing)).toBe(existing);
  });

  it('LOST_CAPITAL_LOCATIONS lists the reference game capitals (lower-case ids)', () => {
    expect(LOST_CAPITAL_LOCATIONS.length).toBe(9);
    expect(new Set(LOST_CAPITAL_LOCATIONS).size).toBe(LOST_CAPITAL_LOCATIONS.length);
    for (const id of LOST_CAPITAL_LOCATIONS) {
      expect(id).toBe(id.toLowerCase());
    }
  });
});
