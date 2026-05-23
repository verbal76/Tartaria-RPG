// v2.4.1 (OTA 033) — Mud Flood Nexus main quest phase-machine tests.
//
// Pins the universal spine: hook -> revelation (first Lost Capital)
// -> cores (subsequent recoveries) -> descent (5/5) -> nexus (arrival
// at mud_flood_nexus) -> choice (UI prompt) -> ended (choice made).
// Each transition is a no-op when invoked out of order.

import {
  initMainQuest,
  ensureMainQuest,
  advanceMainQuest,
  LOST_CAPITAL_LOCATIONS,
  NEXUS_LOCATION_ID,
  phaseLabel,
  phaseHint,
  remainingCapitals,
  canRecoverCore,
  coreGateHint,
  coreGateNextAction,
  FACTION_CORE_GATES,
} from '../app/engine/mainQuest';
import type { PlayerCharacter } from '../app/engine/types';

function makePlayer(overrides: Partial<PlayerCharacter> = {}): PlayerCharacter {
  return {
    name: 'Test',
    raceId: 'reclaimer',
    factionId: 'reclaimers_guild',
    stats: { strength: 10, dexterity: 10, intelligence: 10, wisdom: 10, charisma: 10 },
    hp: 30,
    hpMax: 30,
    stamina: 8,
    staminaMax: 8,
    milestones: { enemiesDefeated: 0, travelsCompleted: 0, checksSucceeded: 0 },
    ac: 12,
    tc: 0,
    corruption: 0,
    inventory: [],
    factionStanding: [],
    currentLocationId: 'tartarian_outskirts',
    activeQuests: [],
    mapSeed: 'test',
    mapX: 20,
    mapY: 20,
    mainQuest: initMainQuest(),
    ...overrides,
  } as PlayerCharacter;
}

describe('mainQuest phase machine', () => {
  it('initMainQuest starts at hook with no Cores', () => {
    const s = initMainQuest();
    expect(s.phase).toBe('hook');
    expect(s.coresRecovered).toEqual([]);
    expect(s.ending).toBeUndefined();
  });

  it('ensureMainQuest backfills missing state', () => {
    expect(ensureMainQuest(undefined).phase).toBe('hook');
    expect(ensureMainQuest({ phase: 'cores', coresRecovered: ['asgardar'] }).phase).toBe('cores');
  });

  describe('first_capital_visit', () => {
    it('hook -> revelation on first Lost Capital arrival', () => {
      const p = makePlayer();
      const next = advanceMainQuest(p, { kind: 'first_capital_visit', locationId: 'asgardar' });
      expect(next.phase).toBe('revelation');
    });
    it('ignores non-Lost-Capital locations', () => {
      const p = makePlayer();
      const next = advanceMainQuest(p, { kind: 'first_capital_visit', locationId: 'cradle_of_dusk' });
      expect(next.phase).toBe('hook');
    });
    it('no-op once past hook', () => {
      const p = makePlayer({ mainQuest: { phase: 'cores', coresRecovered: ['asgardar'] } });
      const next = advanceMainQuest(p, { kind: 'first_capital_visit', locationId: 'samarran' });
      expect(next.phase).toBe('cores');
    });
  });

  describe('core_recovered', () => {
    it('revelation -> cores after first Core', () => {
      const p = makePlayer({ mainQuest: { phase: 'revelation', coresRecovered: [] } });
      const next = advanceMainQuest(p, { kind: 'core_recovered', locationId: 'asgardar' });
      expect(next.phase).toBe('cores');
      expect(next.coresRecovered).toEqual(['asgardar']);
    });
    it('cores -> descent on 5th Core', () => {
      const p = makePlayer({
        mainQuest: { phase: 'cores', coresRecovered: ['asgardar', 'samarran', 'nimari', 'drakova'] },
      });
      const next = advanceMainQuest(p, { kind: 'core_recovered', locationId: 'voronov' });
      expect(next.phase).toBe('descent');
      expect(next.coresRecovered).toHaveLength(5);
    });
    it('duplicate Core recovery is a no-op', () => {
      const p = makePlayer({ mainQuest: { phase: 'cores', coresRecovered: ['asgardar'] } });
      const next = advanceMainQuest(p, { kind: 'core_recovered', locationId: 'asgardar' });
      expect(next.coresRecovered).toEqual(['asgardar']);
      expect(next).toBe(p.mainQuest); // unchanged reference for no-op
    });
  });

  describe('reached_nexus + chose_ending', () => {
    it('descent -> choice when arriving at Nexus with all 5 Cores', () => {
      const all5 = [...LOST_CAPITAL_LOCATIONS];
      const p = makePlayer({ mainQuest: { phase: 'descent', coresRecovered: all5 } });
      const next = advanceMainQuest(p, { kind: 'reached_nexus' });
      expect(next.phase).toBe('choice');
    });
    it('reached_nexus is a no-op without 5 Cores', () => {
      const p = makePlayer({ mainQuest: { phase: 'cores', coresRecovered: ['asgardar'] } });
      const next = advanceMainQuest(p, { kind: 'reached_nexus' });
      expect(next.phase).toBe('cores');
    });
    it('choice -> ended on chose_ending', () => {
      const p = makePlayer({ mainQuest: { phase: 'choice', coresRecovered: [...LOST_CAPITAL_LOCATIONS] } });
      const next = advanceMainQuest(p, { kind: 'chose_ending', ending: 'seal' });
      expect(next.phase).toBe('ended');
      expect(next.ending).toBe('seal');
    });
    it('chose_ending is a no-op when not in choice phase', () => {
      const p = makePlayer({ mainQuest: { phase: 'cores', coresRecovered: [] } });
      const next = advanceMainQuest(p, { kind: 'chose_ending', ending: 'seal' });
      expect(next.phase).toBe('cores');
    });
  });

  describe('UI helpers', () => {
    it('phaseLabel returns a non-empty string for every phase', () => {
      const phases = ['hook', 'revelation', 'cores', 'descent', 'nexus', 'choice', 'ended'] as const;
      for (const p of phases) {
        expect(phaseLabel(p).length).toBeGreaterThan(0);
      }
    });
    it('phaseHint includes core count for cores phase', () => {
      expect(phaseHint('cores', 2)).toMatch(/2\/5/);
    });
    it('remainingCapitals excludes already-recovered', () => {
      const r = remainingCapitals({ phase: 'cores', coresRecovered: ['asgardar', 'samarran'] });
      expect(r).not.toContain('asgardar');
      expect(r).not.toContain('samarran');
      expect(r).toHaveLength(3);
    });
  });

  it('NEXUS_LOCATION_ID and LOST_CAPITAL_LOCATIONS match the engine schema', () => {
    expect(NEXUS_LOCATION_ID).toBe('mud_flood_nexus');
    expect(LOST_CAPITAL_LOCATIONS).toEqual(['asgardar', 'samarran', 'nimari', 'drakova', 'voronov']);
  });

  describe('Phase 5 — Nexus cinematic', () => {
    it('NEXUS_SLOT_BEATS covers all 5 Cores in canonical order', () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { NEXUS_SLOT_BEATS, nexusArrivalCinematic } = require('../app/engine/mainQuest');
      expect(NEXUS_SLOT_BEATS).toHaveLength(5);
      expect(NEXUS_SLOT_BEATS.map((b: { capitalId: string }) => b.capitalId))
        .toEqual(['asgardar', 'samarran', 'nimari', 'drakova', 'voronov']);
      // Each beat has a substantial line (not a placeholder).
      for (const b of NEXUS_SLOT_BEATS) {
        expect(b.line.length).toBeGreaterThan(40);
      }
      // Cinematic returns arrival + 5 slot beats + choice prompt = 7 lines.
      expect(nexusArrivalCinematic()).toHaveLength(7);
    });
  });

  describe('Phase 2 — Core-recovery gates', () => {
    it('every faction has a CoreGate mapping', () => {
      const factions = [
        'reclaimers_guild', 'forgotten_order', 'mud_monarchs', 'true_tartarians',
        'eternal_dynasty', 'conspiracy_architects', 'servants_of_giants',
        'stone_builders', 'tartarian_revivalists',
      ];
      for (const f of factions) {
        expect(FACTION_CORE_GATES[f]).toBeDefined();
        expect(FACTION_CORE_GATES[f]!.intents.length).toBeGreaterThan(0);
        expect(coreGateNextAction(f)).toBeTruthy();
        expect(coreGateHint(f, 'asgardar')).toMatch(/Asgardar/);
      }
    });

    it('canRecoverCore returns true for Reclaimer + investigate at unrecovered Capital', () => {
      const p = makePlayer({
        currentLocationId: 'asgardar',
        mainQuest: { phase: 'revelation', coresRecovered: [] },
      });
      expect(canRecoverCore(p, 'investigate')).toBe(true);
    });

    it('canRecoverCore returns false when the verb does not match faction gate', () => {
      const p = makePlayer({
        currentLocationId: 'asgardar',
        mainQuest: { phase: 'revelation', coresRecovered: [] },
      });
      expect(canRecoverCore(p, 'attack')).toBe(false);
    });

    it('canRecoverCore returns false outside revelation/cores phase', () => {
      const p = makePlayer({
        currentLocationId: 'asgardar',
        mainQuest: { phase: 'hook', coresRecovered: [] },
      });
      expect(canRecoverCore(p, 'investigate')).toBe(false);
      const p2 = makePlayer({
        currentLocationId: 'asgardar',
        mainQuest: { phase: 'descent', coresRecovered: ['asgardar', 'samarran', 'nimari', 'drakova', 'voronov'] },
      });
      expect(canRecoverCore(p2, 'investigate')).toBe(false);
    });

    it('canRecoverCore returns false at non-Capital locations', () => {
      const p = makePlayer({
        currentLocationId: 'cradle_of_dusk',
        mainQuest: { phase: 'revelation', coresRecovered: [] },
      });
      expect(canRecoverCore(p, 'investigate')).toBe(false);
    });

    it('canRecoverCore returns false at already-recovered Capital', () => {
      const p = makePlayer({
        currentLocationId: 'asgardar',
        mainQuest: { phase: 'cores', coresRecovered: ['asgardar'] },
      });
      expect(canRecoverCore(p, 'investigate')).toBe(false);
    });

    it('Mud Monarchs gate accepts attack OR diplomacy', () => {
      const p = makePlayer({
        factionId: 'mud_monarchs',
        currentLocationId: 'asgardar',
        mainQuest: { phase: 'revelation', coresRecovered: [] },
      });
      expect(canRecoverCore(p, 'attack')).toBe(true);
      expect(canRecoverCore(p, 'diplomacy')).toBe(true);
      expect(canRecoverCore(p, 'investigate')).toBe(false);
    });

    it('Conspiracy Architects gate accepts steal', () => {
      const p = makePlayer({
        factionId: 'conspiracy_architects',
        currentLocationId: 'drakova',
        mainQuest: { phase: 'cores', coresRecovered: ['asgardar'] },
      });
      expect(canRecoverCore(p, 'steal')).toBe(true);
    });

    it('Servants of Giants gate accepts rest (vigil)', () => {
      const p = makePlayer({
        factionId: 'servants_of_giants',
        currentLocationId: 'voronov',
        mainQuest: { phase: 'revelation', coresRecovered: [] },
      });
      expect(canRecoverCore(p, 'rest')).toBe(true);
    });

    it('coreGateHint produces faction-specific text for each Capital', () => {
      const reclaimHint = coreGateHint('reclaimers_guild', 'samarran');
      expect(reclaimHint).toMatch(/Samarran/);
      expect(reclaimHint).toMatch(/SALVAGE/i);
      const orderHint = coreGateHint('forgotten_order', 'samarran');
      expect(orderHint).toMatch(/Samarran/);
      expect(orderHint).toMatch(/READ/i);
    });

    it('coreGateHint returns null for unknown faction', () => {
      expect(coreGateHint('made_up_faction', 'asgardar')).toBeNull();
    });
  });
});
