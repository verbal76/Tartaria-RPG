// Phase 14 — LIFE 5 COMBAT POLICY REPAIR: unit-level proof for
// tacticalReconsideration.ts. Pure-function tests only (no store, no RNG,
// no game boot) — the driver-integration proof lives in
// canonicalTacticalReconsiderationIntegration.test.ts.

import type { PlayerView } from '../test-utils/canonical/playerView';
import type { ThreatWord } from '../app/engine/threatWord';
import { EMPTY_MEMORY, type DecisionOption } from '../test-utils/canonical/policy';
import {
  decideInCombat,
  recordTacticalOutcome,
  isTacticFutile,
  classifyRepositionProgress,
  rangeSnapshotOf,
  REPEATED_FAILURE_THRESHOLD,
  EMPTY_ENCOUNTER_TACTICAL_MEMORY,
  type EncounterTacticalMemory,
} from '../test-utils/canonical/tacticalReconsideration';

// A minimal, generic (never Silt-Thief-named) fixture PlayerView shaped
// exactly like the real driver's own buildOptions input: mid-range melee
// standoff, attack unavailable, advance/retreat/flee/heal legal.
function fixtureView(overrides: Partial<PlayerView> = {}): PlayerView {
  return {
    hp: 29,
    hpMax: 29,
    hpDelta: null,
    stamina: 17,
    staminaMax: 17,
    staminaDelta: null,
    canBlock: false,
    stats: {} as PlayerView['stats'],
    statProgress: {} as PlayerView['statProgress'],
    statusEffects: [],
    power: 10,
    ac: 11,
    tc: 0,
    corruption: 0,
    inventory: [],
    equipped: {} as PlayerView['equipped'],
    factionStanding: {} as PlayerView['factionStanding'],
    earnedTitles: [],
    dog: null as PlayerView['dog'],
    golem: null as PlayerView['golem'],
    dead: false,
    position: { currentLocationId: 'fixture_ground' },
    mainQuest: {} as PlayerView['mainQuest'],
    arbiter: {} as PlayerView['arbiter'],
    scene: {
      weather: null,
      dangerRating: 5,
      threatWord: 'SEVERE',
      enemies: [
        {
          name: 'Generic Ordinary Melee Enemy',
          type: 'Human',
          currentHp: 20,
          hpMax: 20,
          ac: 11,
          power: 10,
          matchup: 'even',
          dealsType: 'physical',
          traits: [],
          rangeLabel: 'mid-range',
          mainHandReach: { label: 'melee', inRange: false },
        },
      ],
    } as unknown as NonNullable<PlayerView['scene']>,
    ...overrides,
  } as PlayerView;
}

function fixtureOptions(): DecisionOption[] {
  return [
    { id: 'advance', category: 'engage-approach', label: 'advance' },
    { id: 'dodge', category: 'dodge', label: 'dodge' },
    { id: 'flee', category: 'survive-flee', label: 'flee' },
    { id: 'retreat', category: 'survive-retreat', label: 'retreat' },
  ];
}

describe('tacticalReconsideration — encounter memory (pure)', () => {
  it('starts empty and marks nothing futile', () => {
    expect(isTacticFutile(EMPTY_ENCOUNTER_TACTICAL_MEMORY, 'survive-flee')).toBe(false);
  });

  it('one no-progress observation does not reach the threshold', () => {
    const m1 = recordTacticalOutcome(EMPTY_ENCOUNTER_TACTICAL_MEMORY, 'survive-flee', 'no-progress');
    expect(isTacticFutile(m1, 'survive-flee')).toBe(false);
  });

  it(`REPEATED_FAILURE_THRESHOLD (${REPEATED_FAILURE_THRESHOLD}) consecutive no-progress observations makes a tactic futile`, () => {
    let m: EncounterTacticalMemory = EMPTY_ENCOUNTER_TACTICAL_MEMORY;
    for (let i = 0; i < REPEATED_FAILURE_THRESHOLD; i++) {
      expect(isTacticFutile(m, 'survive-flee')).toBe(false);
      m = recordTacticalOutcome(m, 'survive-flee', 'no-progress');
    }
    expect(isTacticFutile(m, 'survive-flee')).toBe(true);
  });

  it('a progress observation resets the counter even after a long failure streak', () => {
    let m: EncounterTacticalMemory = EMPTY_ENCOUNTER_TACTICAL_MEMORY;
    for (let i = 0; i < REPEATED_FAILURE_THRESHOLD + 3; i++) m = recordTacticalOutcome(m, 'survive-retreat', 'no-progress');
    expect(isTacticFutile(m, 'survive-retreat')).toBe(true);
    const recovered = recordTacticalOutcome(m, 'survive-retreat', 'progress');
    expect(isTacticFutile(recovered, 'survive-retreat')).toBe(false);
  });

  it('categories are tracked independently — retreat failure does not mark flee futile', () => {
    let m: EncounterTacticalMemory = EMPTY_ENCOUNTER_TACTICAL_MEMORY;
    for (let i = 0; i < REPEATED_FAILURE_THRESHOLD; i++) m = recordTacticalOutcome(m, 'survive-retreat', 'no-progress');
    expect(isTacticFutile(m, 'survive-retreat')).toBe(true);
    expect(isTacticFutile(m, 'survive-flee')).toBe(false);
  });

  it('non-reconsiderable categories are never recorded', () => {
    const m = recordTacticalOutcome(EMPTY_ENCOUNTER_TACTICAL_MEMORY, 'equip', 'no-progress');
    expect(m).toBe(EMPTY_ENCOUNTER_TACTICAL_MEMORY);
  });
});

describe('tacticalReconsideration — classifyRepositionProgress (pure)', () => {
  it('a range-label change is progress', () => {
    expect(classifyRepositionProgress({ rangeLabel: 'mid-range', inRange: false }, { rangeLabel: 'far', inRange: false })).toBe('progress');
  });
  it('an in-range flip is progress even if the label text matches', () => {
    expect(classifyRepositionProgress({ rangeLabel: 'mid-range', inRange: false }, { rangeLabel: 'mid-range', inRange: true })).toBe('progress');
  });
  it('an unchanged snapshot is no-progress', () => {
    expect(classifyRepositionProgress({ rangeLabel: 'far', inRange: false }, { rangeLabel: 'far', inRange: false })).toBe('no-progress');
  });
  it('a missing before/after snapshot is treated as no-progress, never assumed favorable', () => {
    expect(classifyRepositionProgress(null, { rangeLabel: 'far', inRange: false })).toBe('no-progress');
    expect(classifyRepositionProgress({ rangeLabel: 'far', inRange: false }, null)).toBe('no-progress');
  });
});

describe('tacticalReconsideration — rangeSnapshotOf (pure)', () => {
  it('reads the active enemy exactly as the real driver already does', () => {
    expect(rangeSnapshotOf(fixtureView())).toEqual({ rangeLabel: 'mid-range', inRange: false });
  });
  it('null with no active enemy', () => {
    expect(rangeSnapshotOf(fixtureView({ scene: null }))).toBeNull();
  });
});

describe('tacticalReconsideration — decideInCombat wrapper', () => {
  it('F. FIRST-FLEE PRESERVATION — fresh SEVERE threat, empty tactical memory, produces the identical decision raw decide() would', () => {
    const view = fixtureView();
    const options = fixtureOptions();
    const { decision, reconsidered } = decideInCombat(view, options, EMPTY_MEMORY, EMPTY_ENCOUNTER_TACTICAL_MEMORY);
    expect(reconsidered).toBe(false);
    expect(decision.category).toBe('survive-flee');
    expect(decision.reason).toMatch(/visible danger signal/);
  });

  it('one observed flee failure alone does not force reconsideration (§11)', () => {
    const view = fixtureView();
    const options = fixtureOptions();
    const oneFail = recordTacticalOutcome(EMPTY_ENCOUNTER_TACTICAL_MEMORY, 'survive-flee', 'no-progress');
    const { decision, reconsidered } = decideInCombat(view, options, EMPTY_MEMORY, oneFail);
    expect(reconsidered).toBe(false);
    expect(decision.category).toBe('survive-flee');
  });

  it('A. LIFE-5 FAILURE SHAPE — repeated observed flee failure reconsiders toward a legal, not-yet-futile alternative', () => {
    const view = fixtureView();
    const options = fixtureOptions();
    let m: EncounterTacticalMemory = EMPTY_ENCOUNTER_TACTICAL_MEMORY;
    for (let i = 0; i < REPEATED_FAILURE_THRESHOLD; i++) m = recordTacticalOutcome(m, 'survive-flee', 'no-progress');
    const { decision, reconsidered } = decideInCombat(view, options, EMPTY_MEMORY, m);
    expect(reconsidered).toBe(true);
    expect(decision.category).not.toBe('survive-flee');
    expect(['survive-retreat', 'engage-approach']).toContain(decision.category);
    expect(decision.reason).toMatch(/no observable progress/);
  });

  it('C/E. NO-PROGRESS ALTERNATIVE IS ITSELF SKIPPED — if the preferred alternative (retreat) is already shown futile, the next one (advance) is tried instead', () => {
    const view = fixtureView();
    const options = fixtureOptions();
    let m: EncounterTacticalMemory = EMPTY_ENCOUNTER_TACTICAL_MEMORY;
    for (let i = 0; i < REPEATED_FAILURE_THRESHOLD; i++) {
      m = recordTacticalOutcome(m, 'survive-flee', 'no-progress');
      m = recordTacticalOutcome(m, 'survive-retreat', 'no-progress');
    }
    const { decision, reconsidered } = decideInCombat(view, options, EMPTY_MEMORY, m);
    expect(reconsidered).toBe(true);
    expect(decision.category).toBe('engage-approach');
  });

  it('L. NO-ALTERNATIVE FALLBACK — every reconsiderable category already futile returns the original decision unchanged, never inventing an action', () => {
    const view = fixtureView();
    const options = fixtureOptions();
    let m: EncounterTacticalMemory = EMPTY_ENCOUNTER_TACTICAL_MEMORY;
    for (let i = 0; i < REPEATED_FAILURE_THRESHOLD; i++) {
      m = recordTacticalOutcome(m, 'survive-flee', 'no-progress');
      m = recordTacticalOutcome(m, 'survive-retreat', 'no-progress');
      m = recordTacticalOutcome(m, 'engage-approach', 'no-progress');
    }
    const raw = decideInCombat(view, options, EMPTY_MEMORY, EMPTY_ENCOUNTER_TACTICAL_MEMORY).decision;
    const { decision, reconsidered } = decideInCombat(view, options, EMPTY_MEMORY, m);
    expect(reconsidered).toBe(false);
    expect(decision).toEqual(raw);
  });

  it('M. ANTI-CYCLE — flee, retreat, and advance all independently futile: wrapper returns exactly one deterministic answer, not a rotating cycle, across repeated calls', () => {
    const view = fixtureView();
    const options = fixtureOptions();
    let m: EncounterTacticalMemory = EMPTY_ENCOUNTER_TACTICAL_MEMORY;
    for (let i = 0; i < REPEATED_FAILURE_THRESHOLD; i++) {
      m = recordTacticalOutcome(m, 'survive-flee', 'no-progress');
      m = recordTacticalOutcome(m, 'survive-retreat', 'no-progress');
      m = recordTacticalOutcome(m, 'engage-approach', 'no-progress');
    }
    const first = decideInCombat(view, options, EMPTY_MEMORY, m).decision;
    const second = decideInCombat(view, options, EMPTY_MEMORY, m).decision;
    const third = decideInCombat(view, options, EMPTY_MEMORY, m).decision;
    expect(first).toEqual(second);
    expect(second).toEqual(third);
  });

  it('H. EMERGENCY-HEAL PRESERVATION — emergency-floor heal decision is never overridden regardless of tactical failure history', () => {
    const view = fixtureView({ hp: 2, hpMax: 29 }); // well below SURVIVE_HP_RATIO
    const options: DecisionOption[] = [...fixtureOptions(), { id: 'heal', category: 'survive-heal', label: 'heal' }];
    let m: EncounterTacticalMemory = EMPTY_ENCOUNTER_TACTICAL_MEMORY;
    for (let i = 0; i < REPEATED_FAILURE_THRESHOLD + 5; i++) m = recordTacticalOutcome(m, 'survive-flee', 'no-progress');
    const { decision, reconsidered } = decideInCombat(view, options, EMPTY_MEMORY, m);
    expect(reconsidered).toBe(false);
    expect(decision.category).toBe('survive-heal');
  });

  it('K. ORDINARY COMBAT PRESERVATION — attack-in-range, low-threat fixture is completely unaffected by this module (identical to raw decide())', () => {
    const view = fixtureView({
      scene: {
        weather: null,
        dangerRating: 1,
        threatWord: 'MANAGEABLE' as ThreatWord,
        enemies: [
          {
            name: 'Weak Enemy',
            type: 'Human',
            currentHp: 5,
            hpMax: 10,
            ac: 9,
            power: 2,
            matchup: 'favored',
            dealsType: 'physical',
            traits: [],
            rangeLabel: "close / arm's reach",
            mainHandReach: { label: 'melee', inRange: true },
          },
        ],
      } as unknown as NonNullable<PlayerView['scene']>,
    });
    const options: DecisionOption[] = [
      { id: 'attack', category: 'engage', label: 'attack' },
      { id: 'dodge', category: 'dodge', label: 'dodge' },
      { id: 'flee', category: 'survive-flee', label: 'flee' },
      { id: 'retreat', category: 'survive-retreat', label: 'retreat' },
    ];
    const withHistory = decideInCombat(view, options, EMPTY_MEMORY, {
      'survive-flee': { consecutiveNoProgress: 9 },
      'survive-retreat': { consecutiveNoProgress: 9 },
    });
    expect(withHistory.reconsidered).toBe(false);
    expect(withHistory.decision.category).toBe('engage');
  });

  it('RNG NONPERTURBATION — the wrapper is a pure function: identical inputs produce byte-identical outputs across many calls, and it never touches anything beyond its four parameters', () => {
    const view = fixtureView();
    const options = fixtureOptions();
    let m: EncounterTacticalMemory = EMPTY_ENCOUNTER_TACTICAL_MEMORY;
    for (let i = 0; i < REPEATED_FAILURE_THRESHOLD; i++) m = recordTacticalOutcome(m, 'survive-flee', 'no-progress');
    const results = Array.from({ length: 25 }, () => decideInCombat(view, options, EMPTY_MEMORY, m));
    for (const r of results) expect(r).toEqual(results[0]);
  });

  it('FALSIFIER (§15/§16) — identical current view/options, with vs. without the accumulated encounter history, produce different decisions; behavior change is attributable to the observed history, not option reordering', () => {
    const view = fixtureView();
    const options = fixtureOptions();
    let failed: EncounterTacticalMemory = EMPTY_ENCOUNTER_TACTICAL_MEMORY;
    for (let i = 0; i < REPEATED_FAILURE_THRESHOLD; i++) failed = recordTacticalOutcome(failed, 'survive-flee', 'no-progress');

    const withHistory = decideInCombat(view, options, EMPTY_MEMORY, failed);
    expect(withHistory.reconsidered).toBe(true);
    expect(withHistory.decision.category).not.toBe('survive-flee');

    const withFreshHistory = decideInCombat(view, options, EMPTY_MEMORY, EMPTY_ENCOUNTER_TACTICAL_MEMORY);
    expect(withFreshHistory.reconsidered).toBe(false);
    expect(withFreshHistory.decision.category).toBe('survive-flee');
  });
});
