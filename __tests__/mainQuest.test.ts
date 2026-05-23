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

  describe('Phase 4b — mid-arc twists', () => {
    it('shouldFireThreeCoreTwist returns true at exactly 3 Cores once', () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { shouldFireThreeCoreTwist, markTwistFired } = require('../app/engine/mainQuest');
      const state = { phase: 'cores', coresRecovered: ['asgardar', 'samarran', 'nimari'] };
      expect(shouldFireThreeCoreTwist(state)).toBe(true);
      const fired = markTwistFired(state, 'three_core_pressure');
      expect(shouldFireThreeCoreTwist(fired)).toBe(false);
    });
    it('shouldFireThreeCoreTwist returns false at 2 or 4 Cores', () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { shouldFireThreeCoreTwist } = require('../app/engine/mainQuest');
      expect(shouldFireThreeCoreTwist({ phase: 'cores', coresRecovered: ['a', 'b'] })).toBe(false);
      expect(shouldFireThreeCoreTwist({ phase: 'cores', coresRecovered: ['a', 'b', 'c', 'd'] })).toBe(false);
    });
    it('threeCoreTwistLine names the faction-specific rival', () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { threeCoreTwistLine } = require('../app/engine/mainQuest');
      expect(threeCoreTwistLine('reclaimers_guild')).toMatch(/Monarch/);
      expect(threeCoreTwistLine('forgotten_order')).toMatch(/Monarch/);
      expect(threeCoreTwistLine('mud_monarchs')).toMatch(/Order/);
      expect(threeCoreTwistLine('servants_of_giants')).toMatch(/Builder/);
    });
    it('markTwistFired is idempotent', () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { markTwistFired } = require('../app/engine/mainQuest');
      const s = { phase: 'cores', coresRecovered: [], twistsFired: ['three_core_pressure'] };
      const s2 = markTwistFired(s, 'three_core_pressure');
      expect(s2).toBe(s);
    });
  });

  describe('Phase 4a — variant pools', () => {
    it('every faction has 3 variants for hook + revelation + descent', () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { narrationForPhase } = require('../app/engine/mainQuest');
      const factions = [
        'reclaimers_guild', 'forgotten_order', 'mud_monarchs', 'true_tartarians',
        'eternal_dynasty', 'conspiracy_architects', 'servants_of_giants',
        'stone_builders', 'tartarian_revivalists',
      ];
      const phases = ['hook', 'revelation', 'descent'];
      for (const f of factions) {
        for (const ph of phases) {
          // Use 5 different seeds; expect at least 2 distinct lines back
          // (proves the variant pool exists and the picker is selecting
          // different entries for different seeds).
          const seen = new Set<string>();
          for (const seed of ['A', 'B', 'C', 'Bob', 'Verbal']) {
            seen.add(narrationForPhase(ph, f, { seed }));
          }
          expect(seen.size).toBeGreaterThanOrEqual(2);
        }
      }
    });

    it('same seed always returns the same variant (deterministic)', () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { narrationForPhase } = require('../app/engine/mainQuest');
      const a1 = narrationForPhase('hook', 'reclaimers_guild', { seed: 'Bob' });
      const a2 = narrationForPhase('hook', 'reclaimers_guild', { seed: 'Bob' });
      const a3 = narrationForPhase('hook', 'reclaimers_guild', { seed: 'Bob' });
      expect(a1).toBe(a2);
      expect(a2).toBe(a3);
    });

    it('different phases of the same character yield phase-tagged variant picks', () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { narrationForPhase } = require('../app/engine/mainQuest');
      // The same seed but different phase tags should select
      // independently (no collision between hook + descent picks).
      const hook = narrationForPhase('hook', 'reclaimers_guild', { seed: 'Bob' });
      const desc = narrationForPhase('descent', 'reclaimers_guild', { seed: 'Bob' });
      expect(hook).toBeTruthy();
      expect(desc).toBeTruthy();
      expect(hook).not.toBe(desc);
    });
  });

  describe('Phase 3 — faction-reactive endings', () => {
    it('endingLine returns faction-specific text for every faction × ending', () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { endingLine } = require('../app/engine/mainQuest');
      const factions = [
        'reclaimers_guild', 'forgotten_order', 'mud_monarchs', 'true_tartarians',
        'eternal_dynasty', 'conspiracy_architects', 'servants_of_giants',
        'stone_builders', 'tartarian_revivalists',
      ];
      const endings = ['seal', 'unleash', 'preserve'] as const;
      const seen = new Set<string>();
      for (const f of factions) {
        for (const e of endings) {
          const line = endingLine(e, f);
          expect(line.length).toBeGreaterThan(80);
          // Distinct lines across the 27 combinations.
          expect(seen.has(line)).toBe(false);
          seen.add(line);
        }
      }
      expect(seen.size).toBe(27);
    });
    it('endingLine falls back to universal for unknown faction', () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { endingLine } = require('../app/engine/mainQuest');
      const line = endingLine('seal', 'made_up');
      expect(line).toMatch(/SEAL/);
    });
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
