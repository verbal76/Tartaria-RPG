// Phase 7 — bounded apparatus repair qualification (owner-authorized, ahead
// of CANONICAL LIFE 2). Pure unit tests of policy.ts's decide(): no boot, no
// store, no telemetry — decide() is a pure function of (view, options,
// memory), so these construct minimal-but-valid PlayerView fixtures directly.
//
// Each test targets one of the general capable-human principles the Life 1
// postmortem + human-Sentry study established (see harness-history.md):
//   A. flee is legitimate at ANY HP given a genuine visible danger signal
//   B. HP alone does not force ATTACK or FLEE — context decides
//   C. hpDelta (damage trajectory) can drive a flee decide() previously had
//      no way to reach
//   D/E/F. dodge/block/heal are real contextual candidates, not afterthoughts
//   G. no manual target selection is introduced (decide() never receives or
//      needs a target — confirmed structurally: it only ever returns an
//      option id already offered by the caller)

import { decide, type DecisionOption, type LifeMemory } from '../test-utils/canonical/policy';
import type { PlayerView, PlayerViewEnemy } from '../test-utils/canonical/playerView';

function makeEnemy(overrides: Partial<PlayerViewEnemy> = {}): PlayerViewEnemy {
  return {
    name: 'Test Enemy',
    type: 'Automation',
    currentHp: 20,
    hpMax: 20,
    ac: 12,
    power: 20,
    matchup: 'even',
    dealsType: 'bludgeoning',
    traits: [],
    // Phase 11 — range/reach observability. Default in-range so every
    // existing fixture in this file keeps its pre-Phase-11 'engage'
    // behavior unless a test explicitly overrides it.
    rangeLabel: 'close / arm\'s reach',
    mainHandReach: { label: 'test weapon', inRange: true },
    ...overrides,
  };
}

function makeView(overrides: Partial<PlayerView> = {}, enemies: PlayerViewEnemy[] = [], threatWord: PlayerView['scene'] extends null ? never : NonNullable<PlayerView['scene']>['threatWord'] = 'MANAGEABLE'): PlayerView {
  const hp = overrides.hp ?? 35;
  const hpMax = overrides.hpMax ?? 35;
  return {
    hp,
    hpMax,
    hpDelta: null,
    stamina: 12,
    staminaMax: 12,
    staminaDelta: null,
    canBlock: false,
    stats: {} as PlayerView['stats'],
    statProgress: {} as PlayerView['statProgress'],
    statusEffects: [],
    power: 20,
    ac: 15,
    tc: 0,
    corruption: 0,
    inventory: [],
    equipped: {},
    factionStanding: {},
    earnedTitles: [],
    dog: undefined,
    golem: undefined,
    dead: false,
    // ota1484's "minimal argument objects for pure predicates" class: decide()
    // reads no gridX/gridY, and PlayerView.position leaves both optional.
    position: { currentLocationId: 'test_loc' },
    mainQuest: undefined,
    arbiter: [],
    scene: enemies.length
      ? { weather: { id: 'clear' } as PlayerView['scene'] extends null ? never : NonNullable<PlayerView['scene']>['weather'], dangerRating: 3, threatWord, enemies }
      : null,
    ...overrides,
  } as PlayerView;
}

const ATTACK: DecisionOption = { id: 'attack', category: 'engage', label: 'attack' };
const FLEE: DecisionOption = { id: 'flee', category: 'survive-flee', label: 'flee' };
const DODGE: DecisionOption = { id: 'dodge', category: 'dodge', label: 'dodge' };
const BLOCK: DecisionOption = { id: 'block', category: 'block', label: 'block' };
const HEAL: DecisionOption = { id: 'heal', category: 'survive-heal', label: 'heal' };

describe('policy.ts contextual combat branch (Phase 7)', () => {
  it('A: flees at FULL HP when threatWord is LETHAL, even though attack is also offered', () => {
    const view = makeView({ hp: 35, hpMax: 35 }, [makeEnemy({ matchup: 'danger' })], 'LETHAL');
    const d = decide(view, [ATTACK, FLEE]);
    expect(d.optionId).toBe('flee');
    expect(d.category).toBe('survive-flee');
  });

  it('B: does NOT flee merely because HP is moderate and no danger signal is present', () => {
    const view = makeView({ hp: 20, hpMax: 35 }, [makeEnemy({ matchup: 'favored' })], 'MANAGEABLE');
    const d = decide(view, [ATTACK, FLEE]);
    expect(d.optionId).toBe('attack');
  });

  it('B: keeps attacking at very low HP (13%) when no danger signal outweighs it — the exact human-observed pattern, not a static cliff', () => {
    const view = makeView({ hp: 5, hpMax: 38, hpDelta: -5 }, [makeEnemy({ matchup: 'favored', currentHp: 2 })], 'MANAGEABLE');
    const d = decide(view, [ATTACK, FLEE]);
    expect(d.optionId).toBe('attack');
  });

  it('C: flees on a big single-round HP loss (hpDelta) even without a LETHAL label', () => {
    const view = makeView({ hp: 18, hpMax: 35, hpDelta: -17 }, [makeEnemy({ matchup: 'even' })], 'MANAGEABLE');
    const d = decide(view, [ATTACK, FLEE]);
    expect(d.optionId).toBe('flee');
    expect(d.reason).toMatch(/lost 17 HP last round/);
  });

  it('C: flees when a previously-learned dangerous enemy is present, LEARNED_DURING_THIS_LIFE', () => {
    const view = makeView({ hp: 30, hpMax: 35 }, [makeEnemy({ name: 'Grudge Hound', matchup: 'even' })], 'MANAGEABLE');
    const memory: LifeMemory = { dangerousEnemyNames: new Set(['Grudge Hound']), lastDodgeSucceeded: null };
    const d = decide(view, [ATTACK, FLEE], memory);
    expect(d.optionId).toBe('flee');
    expect(d.reason).toMatch(/hurt this Tartarian badly before/);
  });

  it('D: prefers block over dodge when a shield is equipped and multiple enemies are present', () => {
    const view = makeView({ hp: 30, hpMax: 35, canBlock: true }, [makeEnemy(), makeEnemy({ name: 'Second' })], 'MANAGEABLE');
    const d = decide(view, [ATTACK, DODGE, BLOCK]);
    expect(d.optionId).toBe('block');
  });

  it('E: uses dodge against multiple enemies when no shield is available', () => {
    const view = makeView({ hp: 30, hpMax: 35, canBlock: false }, [makeEnemy(), makeEnemy({ name: 'Second' })], 'MANAGEABLE');
    const d = decide(view, [ATTACK, DODGE]);
    expect(d.optionId).toBe('dodge');
  });

  it('E: does not dodge again immediately after a dodge already succeeded — presses the opening instead', () => {
    const view = makeView({ hp: 30, hpMax: 35 }, [makeEnemy(), makeEnemy({ name: 'Second' })], 'MANAGEABLE');
    const memory: LifeMemory = { dangerousEnemyNames: new Set(), lastDodgeSucceeded: true };
    const d = decide(view, [ATTACK, DODGE], memory);
    expect(d.optionId).toBe('attack');
  });

  it('F: heals mid-fight below the heal-consider ratio even without an acute danger signal', () => {
    const view = makeView({ hp: 10, hpMax: 35 }, [makeEnemy({ matchup: 'favored' })], 'MANAGEABLE');
    const d = decide(view, [ATTACK, HEAL, FLEE]);
    expect(d.optionId).toBe('heal');
  });

  it('emergency floor: heals/flees near-certain death regardless of any other signal', () => {
    const view = makeView({ hp: 2, hpMax: 35 }, [], 'MANAGEABLE');
    const d = decide(view, [HEAL]);
    expect(d.optionId).toBe('heal');
    expect(d.category).toBe('survive-heal');
  });

  it('G: decide() never returns an option id it was not given — no manual target selection exists', () => {
    const view = makeView({ hp: 30, hpMax: 35 }, [makeEnemy({ name: 'Alpha' }), makeEnemy({ name: 'Beta' })], 'MANAGEABLE');
    const d = decide(view, [ATTACK]);
    expect(['attack', null]).toContain(d.optionId);
  });
});

// Phase 11 — the range-repair option. buildOptions offers ADVANCE INSTEAD OF
// ATTACK (never both) exactly when the equipped attack cannot reach the
// active enemy's displayed band — the fix for the proven Mud-Wracked
// Aetherkin stalemate. These tests exercise decide() with that shape of
// option set directly (pure unit tests, same convention as the file above).
describe('policy.ts contextual combat branch — engage-approach (Phase 11)', () => {
  const ADVANCE: DecisionOption = {
    id: 'advance',
    category: 'engage-approach',
    label: 'advance',
    meta: { rangeLabel: 'mid-range', reachLabel: 'Cudgel' },
  };
  const RETREAT: DecisionOption = { id: 'retreat', category: 'survive-retreat', label: 'retreat' };

  it('picks ADVANCE, not a stall, when the equipped attack cannot reach the enemy (ATTACK not offered)', () => {
    const view = makeView({ hp: 30, hpMax: 35 }, [makeEnemy({ matchup: 'even' })], 'MANAGEABLE');
    const d = decide(view, [ADVANCE, DODGE, FLEE]);
    expect(d.optionId).toBe('advance');
    expect(d.category).toBe('engage-approach');
  });

  it('the chosen reason names the displayed range/reach text from meta — the same words the refusal itself already showed', () => {
    const view = makeView({ hp: 30, hpMax: 35 }, [makeEnemy({ matchup: 'even' })], 'MANAGEABLE');
    const d = decide(view, [ADVANCE, DODGE, FLEE]);
    expect(d.reason).toMatch(/mid-range/);
    expect(d.reason).toMatch(/Cudgel/);
  });

  it('⚠⚠⚠ never re-selects a stalled ATTACK: when only ADVANCE is offered for the engage slot (no ATTACK in the option list), decide() never returns an id that was not offered', () => {
    const view = makeView({ hp: 30, hpMax: 35 }, [makeEnemy({ matchup: 'even' })], 'MANAGEABLE');
    const d = decide(view, [ADVANCE, DODGE, FLEE]);
    expect(d.optionId).not.toBe('attack');
    expect(['advance', 'dodge', 'flee', null]).toContain(d.optionId);
  });

  it('ATTACK still wins over ADVANCE on the rare round both are offered — engage keeps priority over engage-approach', () => {
    const view = makeView({ hp: 30, hpMax: 35 }, [makeEnemy({ matchup: 'even' })], 'MANAGEABLE');
    const d = decide(view, [ATTACK, ADVANCE, DODGE]);
    expect(d.optionId).toBe('attack');
  });

  it('negative space — already in range: when only ATTACK is offered (no ADVANCE in the option list, matching a buildOptions that saw inRange=true), decide() cannot pick or invent an approach', () => {
    const view = makeView({ hp: 30, hpMax: 35 }, [makeEnemy({ matchup: 'even' })], 'MANAGEABLE');
    const d = decide(view, [ATTACK, DODGE, FLEE]);
    expect(d.optionId).not.toBe('advance');
    expect(d.category).not.toBe('engage-approach');
  });

  it('danger signal still overrides ADVANCE exactly as it overrides ATTACK — approach is not a survival-logic bypass', () => {
    const view = makeView({ hp: 35, hpMax: 35 }, [makeEnemy({ matchup: 'danger' })], 'LETHAL');
    const d = decide(view, [ADVANCE, FLEE]);
    expect(d.optionId).toBe('flee');
  });

  it('block/dodge still take priority over ADVANCE against multiple enemies, same as they do over ATTACK', () => {
    const view = makeView({ hp: 30, hpMax: 35, canBlock: true }, [makeEnemy(), makeEnemy({ name: 'Second' })], 'MANAGEABLE');
    const d = decide(view, [ADVANCE, DODGE, BLOCK]);
    expect(d.optionId).toBe('block');
  });

  it('heal-consider ratio still fires ahead of ADVANCE, same as it does ahead of ATTACK', () => {
    const view = makeView({ hp: 10, hpMax: 35 }, [makeEnemy({ matchup: 'favored' })], 'MANAGEABLE');
    const d = decide(view, [ADVANCE, HEAL, FLEE]);
    expect(d.optionId).toBe('heal');
  });

  it('RETREAT (survive-retreat) is a distinct category from FLEE (survive-flee) and from ADVANCE — the emergency floor reaches for retreat only when heal/flee are absent', () => {
    const view = makeView({ hp: 1, hpMax: 35 }, [], 'MANAGEABLE');
    const d = decide(view, [RETREAT]);
    expect(d.optionId).toBe('retreat');
    expect(d.category).toBe('survive-retreat');
  });

  it('RETREAT is never preferred over an available FLEE at the emergency floor — retreat only fills in when flee is not offered', () => {
    const view = makeView({ hp: 1, hpMax: 35 }, [], 'MANAGEABLE');
    const d = decide(view, [FLEE, RETREAT]);
    expect(d.optionId).toBe('flee');
  });
});
