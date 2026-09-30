// Phase 8 — qualification for the Life 2 postmortem repair (owner ruling
// "REPAIR THE GENERAL ADAPTATION GAP" §11). Pure decide() unit tests, same
// pattern as canonicalContextualCombatPolicy.test.ts — no store, no
// gameplay, no NEW TARTARIAN triggered by this file. Each test is labeled
// with the qualification letter(s) from the owner's ruling it satisfies.

import { decide, EMPTY_MEMORY, capabilitySignature, type DecisionOption, type LifeMemory, type AttemptRecord } from '../test-utils/canonical/policy';
import type { PlayerView, PlayerViewEnemy } from '../test-utils/canonical/playerView';

function makeEnemy(over: Partial<PlayerViewEnemy> = {}): PlayerViewEnemy {
  return {
    name: 'Asgardar Guardian',
    type: 'Construct',
    currentHp: 300,
    hpMax: 300,
    ac: 14,
    power: 40,
    matchup: 'danger',
    dealsType: 'bludgeoning',
    traits: ['core_guardian'],
    // Phase 11 — range/reach observability. Default in-range so this
    // fixture's pre-Phase-11 'engage' behavior is unaffected unless a test
    // explicitly overrides it.
    rangeLabel: 'close / arm\'s reach',
    mainHandReach: { label: 'test weapon', inRange: true },
    ...over,
  };
}

function makeView(over: Partial<PlayerView> = {}): PlayerView {
  return {
    hp: 30,
    hpMax: 30,
    hpDelta: null,
    stamina: 12,
    staminaMax: 12,
    staminaDelta: null,
    canBlock: false,
    stats: {} as PlayerView['stats'],
    statProgress: {} as PlayerView['statProgress'],
    statusEffects: [],
    power: 20,
    ac: 10,
    tc: 0,
    corruption: 0,
    inventory: [],
    equipped: { main: 'Mud-Rend Blade' },
    factionStanding: {} as PlayerView['factionStanding'],
    earnedTitles: [],
    dog: null,
    golem: null,
    dead: false,
    // ota1484's "minimal argument objects for pure predicates" class: decide()
    // reads no gridX/gridY, and PlayerView.position leaves both optional.
    position: { currentLocationId: 'asgardar' },
    mainQuest: {} as PlayerView['mainQuest'],
    arbiter: [] as unknown as PlayerView['arbiter'],
    scene: { weather: {} as PlayerView['scene'] extends null ? never : NonNullable<PlayerView['scene']>['weather'], dangerRating: 5, threatWord: 'LETHAL', enemies: [makeEnemy()] },
    ...over,
  };
}

const RETRY_OPT: DecisionOption = { id: 'summon', category: 'critical-path', label: '★ SUMMON', meta: { isRetryableObjective: true, objectiveId: 'guardian:asgardar' } };
const ALT_OPT: DecisionOption = { id: 'retreat-to-hub', category: 'reassess', label: 'retreat to hub to prepare' };

function withdrawalAttempt(over: Partial<AttemptRecord> = {}): AttemptRecord {
  const sig = capabilitySignature(makeView());
  return {
    objectiveId: 'guardian:asgardar',
    result: 'withdrawal',
    startCapability: sig,
    endCapability: sig,
    roundsSpent: 173,
    healsConsumed: 3,
    ...over,
  };
}

describe('Phase 8 — attempt-memory / repeat-attempt policy qualification', () => {
  // A — a failed/withdrawn attempt can create legitimate attempt memory
  // that changes the policy's later behavior (vs. no memory at all).
  it('[A] a recorded withdrawal changes the retry decision vs. no attempt memory', () => {
    const v = makeView();
    const noMemory = decide(v, [RETRY_OPT, ALT_OPT], EMPTY_MEMORY);
    expect(noMemory.optionId).toBe('summon');

    const withMemory: LifeMemory = { ...EMPTY_MEMORY, attempts: [withdrawalAttempt()] };
    const withHistory = decide(v, [RETRY_OPT, ALT_OPT], withMemory);
    expect(withHistory.optionId).toBe('retreat-to-hub');
  });

  // B — AttemptRecord carries only the documented, player-visible/derivable
  // fields — nothing snuck in from a hidden/telemetry source.
  it('[B] AttemptRecord exposes exactly its documented player-visible fields', () => {
    const record = withdrawalAttempt();
    expect(Object.keys(record).sort()).toEqual(
      ['endCapability', 'healsConsumed', 'objectiveId', 'result', 'roundsSpent', 'startCapability'].sort(),
    );
  });

  // C — a fresh life (EMPTY_MEMORY) begins with no attempt history and no
  // observed resets — nothing carried over from a prior life or dev run.
  it('[C] EMPTY_MEMORY has no attempts and no observed resets', () => {
    expect(EMPTY_MEMORY.attempts).toEqual([]);
    expect(EMPTY_MEMORY.observedResets?.size ?? 0).toBe(0);
  });

  // E — sustained attritional failure (no single round ever crossed a
  // damage-spike threshold — this IS Life 2's actual Asgardar shape) can
  // still be remembered as a failed attempt and inform the next decision,
  // via attempt-outcome memory rather than a per-round damage threshold.
  it('[E] a long chip-damage withdrawal (no single big hit) still defers an unchanged retry', () => {
    const v = makeView();
    const memory: LifeMemory = {
      ...EMPTY_MEMORY,
      // dangerousEnemyNames deliberately EMPTY — reproduces Life 2 exactly:
      // no round ever crossed the 25%-hpMax single-hit threshold.
      attempts: [withdrawalAttempt({ roundsSpent: 173, healsConsumed: 3 })],
    };
    const d = decide(v, [RETRY_OPT, ALT_OPT], memory);
    expect(d.optionId).toBe('retreat-to-hub');
    expect(d.reason).toMatch(/withdrawal/);
  });

  // F / G — a Guardian reset is mentioned in the policy's own reasoning
  // only once observedResets actually contains it (i.e., only after the
  // caller recorded a personal in-life observation), never before.
  it('[F] once observedResets contains the objective, the reset is cited in the reasoning', () => {
    const v = makeView();
    const memory: LifeMemory = {
      ...EMPTY_MEMORY,
      attempts: [withdrawalAttempt()],
      observedResets: new Set(['guardian:asgardar']),
    };
    const d = decide(v, [RETRY_OPT, ALT_OPT], memory);
    expect(d.reason).toMatch(/known to reset/);
  });

  it('[G] before any observation, the reset is never claimed in the reasoning', () => {
    const v = makeView();
    const memory: LifeMemory = { ...EMPTY_MEMORY, attempts: [withdrawalAttempt()] };
    const d = decide(v, [RETRY_OPT, ALT_OPT], memory);
    expect(d.reason).not.toMatch(/known to reset/);
  });

  // H — an unchanged failed attempt does NOT automatically force another
  // retry when a real alternative exists.
  it('[H] unchanged capability + prior withdrawal + a real alternative -> defers, does not force retry', () => {
    const v = makeView();
    const memory: LifeMemory = { ...EMPTY_MEMORY, attempts: [withdrawalAttempt({ endCapability: capabilitySignature(v) })] };
    const d = decide(v, [RETRY_OPT, ALT_OPT], memory);
    expect(d.optionId).not.toBe('summon');
  });

  // I — a materially improved character (different equipment since the
  // last attempt) may rationally retry immediately.
  it('[I] materially changed capability since the last attempt -> retries immediately', () => {
    const v = makeView({ equipped: { main: 'Legendary Golem Hammer' } });
    const staleSignature = capabilitySignature(makeView({ equipped: { main: 'Mud-Rend Blade' } }));
    const memory: LifeMemory = { ...EMPTY_MEMORY, attempts: [withdrawalAttempt({ endCapability: staleSignature })] };
    const d = decide(v, [RETRY_OPT, ALT_OPT], memory);
    expect(d.optionId).toBe('summon');
    expect(d.reason).toMatch(/materially changed/);
  });

  // J — a real alternative already tried since the last attempt (recorded
  // via deferredAfter) justifies retrying even with no numeric/equipment
  // change — "a different tactic was tried" is itself enough, once.
  it('[J] deferredAfter already set on the last attempt -> retries without requiring a capability change', () => {
    const v = makeView();
    const memory: LifeMemory = {
      ...EMPTY_MEMORY,
      attempts: [withdrawalAttempt({ endCapability: capabilitySignature(v), deferredAfter: true })],
    };
    const d = decide(v, [RETRY_OPT, ALT_OPT], memory);
    expect(d.optionId).toBe('summon');
    expect(d.reason).toMatch(/already tried/);
  });

  // K / M — decide() never invents an option outside what it was actually
  // given: with no real alternative offered, an otherwise-deferrable retry
  // still proceeds (summon remains available; nothing fabricated).
  it('[K, M] with no real alternative offered, an unchanged failed retry still proceeds (never invents one)', () => {
    const v = makeView();
    const memory: LifeMemory = { ...EMPTY_MEMORY, attempts: [withdrawalAttempt({ endCapability: capabilitySignature(v) })] };
    const d = decide(v, [RETRY_OPT], memory); // no ALT_OPT this time
    expect(d.optionId).toBe('summon');
  });

  it('[M] decide() never returns an optionId absent from the options it was given (retry branch)', () => {
    const v = makeView();
    const memory: LifeMemory = { ...EMPTY_MEMORY, attempts: [withdrawalAttempt({ endCapability: capabilitySignature(v) })] };
    const options = [RETRY_OPT, ALT_OPT];
    const d = decide(v, options, memory);
    if (d.optionId !== null) {
      expect(options.some((o) => o.id === d.optionId)).toBe(true);
    }
  });

  // A prior SUCCESS never defers — a capable human doesn't hesitate to
  // repeat a fight/objective it already won (a second Guardian at a
  // different capital, same objectiveId shape, is a fresh objective in
  // practice since objectiveId is capital-specific, but this proves the
  // 'success' branch of the why-string / no-defer path directly).
  it('a prior success at this exact objective never defers', () => {
    const v = makeView();
    const memory: LifeMemory = { ...EMPTY_MEMORY, attempts: [withdrawalAttempt({ result: 'success' })] };
    const d = decide(v, [RETRY_OPT, ALT_OPT], memory);
    expect(d.optionId).toBe('summon');
    expect(d.reason).toMatch(/succeeded/);
  });

  // A death record is treated as a failure for retry-deferral purposes,
  // same as a withdrawal.
  it('a prior death at this objective defers an unchanged retry just like a withdrawal', () => {
    const v = makeView();
    const memory: LifeMemory = { ...EMPTY_MEMORY, attempts: [withdrawalAttempt({ result: 'death', endCapability: capabilitySignature(v) })] };
    const d = decide(v, [RETRY_OPT, ALT_OPT], memory);
    expect(d.optionId).toBe('retreat-to-hub');
  });
});
