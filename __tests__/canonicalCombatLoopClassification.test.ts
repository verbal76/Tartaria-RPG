// Phase 9 — focused regression for the combat-loop observability repair.
//
// Proves, with tiny artificial round budgets and fake deps (no store, no
// production doors, no Jest timeout risk), that resolveCombatRounds()
// structurally distinguishes what the old inline resolveCombat() in
// canonicalLife3.test.ts conflated into one 'stalled' string:
//   - decide() returning no action  -> NO_LEGAL_ACTION
//   - the round budget elapsing while legitimate options kept being offered
//     -> ROUND_BUDGET_EXHAUSTED
// and that the two remain distinguishable to an outer caller, with
// ROUND_BUDGET_EXHAUSTED never worded as "no legitimate option remained"
// and never self-classified as a production defect.

import { resolveCombatRounds, describeCombatOutcome, type CombatLoopDeps, type CombatRoundTrace } from '../test-utils/canonical/combatLoop';
import type { PlayerView } from '../test-utils/canonical/playerView';
import type { Decision, DecisionOption } from '../test-utils/canonical/policy';
import type { ActionRecord } from '../test-utils/canonical/actionExecutor';

function fakeView(hp: number, enemyHp: number): PlayerView {
  return {
    hp,
    hpMax: 100,
    hpDelta: null,
    stamina: 20,
    staminaMax: 20,
    staminaDelta: null,
    canBlock: false,
    stats: {} as PlayerView['stats'],
    statProgress: {} as PlayerView['statProgress'],
    statusEffects: [] as unknown as PlayerView['statusEffects'],
    power: 10,
    ac: 12,
    tc: 12,
    corruption: 0,
    inventory: [],
    equipped: {} as PlayerView['equipped'],
    factionStanding: {} as PlayerView['factionStanding'],
    earnedTitles: [],
    dog: undefined,
    golem: undefined,
    dead: hp <= 0,
    position: { currentLocationId: 'test_ground' },
    mainQuest: undefined as unknown as PlayerView['mainQuest'],
    arbiter: [] as unknown as PlayerView['arbiter'],
    scene: enemyHp > 0
      ? {
          weather: 'clear' as unknown as PlayerView['scene'] extends { weather: infer W } ? W : never,
          dangerRating: 1,
          threatWord: 'MODERATE' as unknown as PlayerView['scene'] extends { threatWord: infer T } ? T : never,
          enemies: [{
            name: 'Test Stump', type: 'training_dummy', currentHp: enemyHp, hpMax: 100, ac: 10, power: 5,
            matchup: 'even', dealsType: 'bludgeoning', traits: [],
            // Phase 11 — range/reach observability defaults (in-range).
            rangeLabel: 'close / arm\'s reach', mainHandReach: { label: 'test weapon', inRange: true },
          }],
        }
      : { weather: 'clear' as never, dangerRating: 1, threatWord: 'MODERATE' as never, enemies: [] },
  };
}

function fakeRecord(): ActionRecord {
  return {
    actionSeq: 1,
    family: 'COMBAT',
    playerViewHashBefore: { hp: 0, inventoryCount: 0, locationId: '', sceneEnemyCount: 0 },
    optionsShown: ['attack'],
    policyChoice: 'attack',
    reason: 'test',
    uiActionRepresented: 'attack',
    productionDoor: 'test',
    rngRange: null,
    stateDiffRange: null,
    logRange: null,
    result: 'ok',
    playerViewHashAfter: { hp: 0, inventoryCount: 0, locationId: '', sceneEnemyCount: 0 },
  };
}

describe('resolveCombatRounds — outcome classification', () => {
  it('player death -> DEAD, before the budget is touched', async () => {
    const deps: CombatLoopDeps = {
      isDead: () => true,
      view: () => fakeView(0, 50),
      buildOptions: () => [{ id: 'attack', category: 'engage', label: 'attack' }],
      decide: () => ({ optionId: 'attack', category: 'engage', reason: 'x' }),
      execute: async () => fakeRecord(),
    };
    const result = await resolveCombatRounds(deps, 10);
    expect(result.outcome.kind).toBe('DEAD');
    expect(result.roundsConsumed).toBe(0);
    expect(result.trace).toHaveLength(0);
  });

  it('enemy list empties after a non-flee action -> CLEARED', async () => {
    let hp = 100;
    let enemyHp = 10;
    const deps: CombatLoopDeps = {
      isDead: () => false,
      view: () => fakeView(hp, enemyHp),
      buildOptions: (v) => (v.scene!.enemies.length > 0 ? [{ id: 'attack', category: 'engage', label: 'attack' }] : []),
      decide: (v, opts) => ({ optionId: opts[0]!.id, category: opts[0]!.category, reason: 'attacking' }),
      execute: async () => { enemyHp = 0; return fakeRecord(); },
    };
    const result = await resolveCombatRounds(deps, 10);
    expect(result.outcome.kind).toBe('CLEARED');
    expect(result.roundsConsumed).toBe(1);
    expect(result.trace).toHaveLength(1);
    expect(result.trace[0]!.enemiesBefore).toHaveLength(1);
    expect(result.trace[0]!.enemiesAfter).toHaveLength(0);
  });

  it('enemy list empties after a flee action -> FLED, not CLEARED', async () => {
    let enemyHp = 10;
    const deps: CombatLoopDeps = {
      isDead: () => false,
      view: () => fakeView(100, enemyHp),
      buildOptions: (v) => (v.scene!.enemies.length > 0 ? [{ id: 'flee', category: 'survive-flee', label: 'flee' }] : []),
      decide: (v, opts) => ({ optionId: opts[0]!.id, category: opts[0]!.category, reason: 'fleeing' }),
      execute: async () => { enemyHp = 0; return fakeRecord(); },
    };
    const result = await resolveCombatRounds(deps, 10);
    expect(result.outcome.kind).toBe('FLED');
    expect(result.roundsConsumed).toBe(1);
  });

  it('decide() returns no option -> NO_LEGAL_ACTION (a genuine deadlock)', async () => {
    const deps: CombatLoopDeps = {
      isDead: () => false,
      view: () => fakeView(100, 10),
      buildOptions: () => [{ id: 'attack', category: 'engage', label: 'attack' }],
      decide: () => ({ optionId: null, category: 'stop', reason: 'nothing legitimate' }),
      execute: async () => fakeRecord(),
    };
    const result = await resolveCombatRounds(deps, 10);
    expect(result.outcome.kind).toBe('NO_LEGAL_ACTION');
    expect(result.roundsConsumed).toBe(0);
  });

  it('empty option construction -> NO_LEGAL_ACTION (same deadlock family, never reaches decide())', async () => {
    let decideCalls = 0;
    const deps: CombatLoopDeps = {
      isDead: () => false,
      view: () => fakeView(100, 10),
      buildOptions: () => [],
      decide: () => { decideCalls++; return { optionId: 'attack', category: 'engage', reason: 'x' }; },
      execute: async () => fakeRecord(),
    };
    const result = await resolveCombatRounds(deps, 10);
    expect(result.outcome.kind).toBe('NO_LEGAL_ACTION');
    expect(decideCalls).toBe(0);
  });

  it('⚠⚠⚠ legal actions continue through the final configured round, enemy survives -> ROUND_BUDGET_EXHAUSTED, NOT NO_LEGAL_ACTION', async () => {
    // A small artificial budget (5), not hundreds — proves the classification
    // logic, not endurance. Enemy HP never reaches 0; every round a real
    // legal option is offered and chosen.
    const rounds: CombatRoundTrace[] = [];
    const deps: CombatLoopDeps = {
      isDead: () => false,
      view: () => fakeView(100, 1000), // enemy never dies within the budget
      buildOptions: () => [{ id: 'attack', category: 'engage', label: 'attack' }],
      decide: (v, opts) => ({ optionId: opts[0]!.id, category: opts[0]!.category, reason: 'pressing the attack' }),
      execute: async () => fakeRecord(),
    };
    const result = await resolveCombatRounds(deps, 5, (row) => rounds.push(row));
    expect(result.outcome.kind).toBe('ROUND_BUDGET_EXHAUSTED');
    expect(result.roundsConsumed).toBe(5);
    expect(result.trace).toHaveLength(5);
    expect(rounds).toHaveLength(5);
    // ⚠ The one requirement the whole repair exists for: the two outcomes
    // must be structurally distinguishable, not just differently worded.
    expect(result.outcome.kind).not.toBe('NO_LEGAL_ACTION');
  });

  it('⚠⚠⚠ describeCombatOutcome never claims "no legitimate option remained" for a budget exhaustion, and never says PRODUCTION/defect', () => {
    const text = describeCombatOutcome({ kind: 'ROUND_BUDGET_EXHAUSTED' }, 300, 300);
    expect(text).not.toMatch(/no legitimate option remained/i);
    expect(text).not.toMatch(/production/i);
    expect(text).not.toMatch(/defect/i);
    expect(text).toMatch(/observation/i);
  });

  it('describeCombatOutcome DOES say "no legitimate option remained" for NO_LEGAL_ACTION — the sentence stays true where it is actually true', () => {
    const text = describeCombatOutcome({ kind: 'NO_LEGAL_ACTION' }, 3, 300);
    expect(text).toMatch(/no legitimate option remained/i);
  });

  it('⚠⚠⚠ NO_LEGAL_ACTION and ROUND_BUDGET_EXHAUSTED remain distinguishable to an outer caller across a realistic call pattern', async () => {
    async function runWith(budget: number, stallsOnNoOption: boolean) {
      const deps: CombatLoopDeps = {
        isDead: () => false,
        view: () => fakeView(100, 1000),
        buildOptions: () => [{ id: 'attack', category: 'engage', label: 'attack' }],
        decide: (v, opts) => (stallsOnNoOption
          ? { optionId: null, category: 'stop', reason: 'no option' }
          : { optionId: opts[0]!.id, category: opts[0]!.category, reason: 'x' }),
        execute: async () => fakeRecord(),
      };
      return resolveCombatRounds(deps, budget);
    }
    const deadlock = await runWith(5, true);
    const budgetOut = await runWith(5, false);
    expect(deadlock.outcome.kind).toBe('NO_LEGAL_ACTION');
    expect(budgetOut.outcome.kind).toBe('ROUND_BUDGET_EXHAUSTED');
    expect(deadlock.outcome.kind).not.toBe(budgetOut.outcome.kind);
  });
});

// Phase 10 — focused regression for the log-delta observability extension.
//
// Tiny synthetic round counts, a fake in-memory "log mirror" (a plain
// string array standing in for the real getLogMirror()), and fake deps —
// no store, no production doors, no long simulation. Proves the exact
// properties the zero-damage-stalemate investigation depends on: a round's
// logDelta is the text THAT round's action actually produced, never a
// neighbor's, never fabricated when none was produced, and capturing it
// changes nothing about what was decided or what state exists.
describe('resolveCombatRounds — log-delta capture (Phase 10)', () => {
  // Mirrors the real convention: logRange is a 1-indexed inclusive
  // [start, end] window such that getLogMirror().slice(start - 1, end)
  // (or here, logLines.slice(start - 1, end)) yields exactly the lines
  // appended between the "before" and "after" reads of the log.
  function makeLogMirrorDeps(logLines: string[]) {
    return {
      resolveLogDelta: (range: readonly [number, number] | null): readonly string[] => {
        if (!range) return [];
        const [start, end] = range;
        return logLines.slice(start - 1, end);
      },
    };
  }

  it('log entries generated by one action are attached to that round', async () => {
    const logLines: string[] = [];
    const { resolveLogDelta } = makeLogMirrorDeps(logLines);
    let enemyHp = 10;
    const deps: CombatLoopDeps = {
      isDead: () => false,
      view: () => fakeView(100, enemyHp),
      buildOptions: () => [{ id: 'attack', category: 'engage', label: 'attack' }],
      decide: (v, opts) => ({ optionId: opts[0]!.id, category: opts[0]!.category, reason: 'x' }),
      execute: async () => {
        const start = logLines.length + 1;
        logLines.push('YOU ATTACK.', 'A HIT LANDS FOR 5 DAMAGE.');
        enemyHp = 0;
        return { ...fakeRecord(), logRange: [start, logLines.length] as const };
      },
      resolveLogDelta,
    };
    const result = await resolveCombatRounds(deps, 10);
    expect(result.trace).toHaveLength(1);
    expect(result.trace[0]!.logDelta).toEqual(['YOU ATTACK.', 'A HIT LANDS FOR 5 DAMAGE.']);
  });

  it('pre-existing log entries are not falsely attributed to the new action', async () => {
    // Seed the mirror with lines that existed BEFORE this loop ever ran —
    // e.g. travel narration, a prior encounter's tail. None of it should
    // ever appear in a round's logDelta.
    const logLines: string[] = ['(pre-existing) YOU ARRIVE AT THE CLEARING.', '(pre-existing) SOMETHING STIRS.'];
    const { resolveLogDelta } = makeLogMirrorDeps(logLines);
    let enemyHp = 10;
    const deps: CombatLoopDeps = {
      isDead: () => false,
      view: () => fakeView(100, enemyHp),
      buildOptions: () => [{ id: 'attack', category: 'engage', label: 'attack' }],
      decide: (v, opts) => ({ optionId: opts[0]!.id, category: opts[0]!.category, reason: 'x' }),
      execute: async () => {
        const start = logLines.length + 1;
        logLines.push('YOU ATTACK.');
        enemyHp = 0;
        return { ...fakeRecord(), logRange: [start, logLines.length] as const };
      },
      resolveLogDelta,
    };
    const result = await resolveCombatRounds(deps, 10);
    expect(result.trace[0]!.logDelta).toEqual(['YOU ATTACK.']);
    expect(result.trace[0]!.logDelta).not.toContain('(pre-existing) YOU ARRIVE AT THE CLEARING.');
    expect(result.trace[0]!.logDelta).not.toContain('(pre-existing) SOMETHING STIRS.');
  });

  it('consecutive rounds receive their own correct deltas, with no cross-round bleed', async () => {
    const logLines: string[] = [];
    const { resolveLogDelta } = makeLogMirrorDeps(logLines);
    let round = 0;
    let enemyHp = 3; // dies on the 3rd round (1 dmg/round via a 4th, unrelated mechanic below)
    const deps: CombatLoopDeps = {
      isDead: () => false,
      view: () => fakeView(100, enemyHp),
      buildOptions: () => [{ id: 'attack', category: 'engage', label: 'attack' }],
      decide: (v, opts) => ({ optionId: opts[0]!.id, category: opts[0]!.category, reason: 'x' }),
      execute: async () => {
        round++;
        const start = logLines.length + 1;
        logLines.push(`ROUND ${round}: YOU ATTACK.`);
        enemyHp -= 1;
        return { ...fakeRecord(), logRange: [start, logLines.length] as const };
      },
      resolveLogDelta,
    };
    const result = await resolveCombatRounds(deps, 10);
    expect(result.trace).toHaveLength(3);
    expect(result.trace[0]!.logDelta).toEqual(['ROUND 1: YOU ATTACK.']);
    expect(result.trace[1]!.logDelta).toEqual(['ROUND 2: YOU ATTACK.']);
    expect(result.trace[2]!.logDelta).toEqual(['ROUND 3: YOU ATTACK.']);
    // No round's delta contains another round's line.
    for (let i = 0; i < result.trace.length; i++) {
      for (let j = 0; j < result.trace.length; j++) {
        if (i === j) continue;
        for (const line of result.trace[i]!.logDelta) {
          expect(result.trace[j]!.logDelta).not.toContain(line);
        }
      }
    }
  });

  it('empty log delta is represented honestly: [] not undefined, both when logRange is null and when no resolver is supplied', async () => {
    let enemyHp = 10;
    // A well-behaved resolver — same null-guard the real canonicalLife3.test.ts
    // wrapper uses (`if (!range) return [];`) — is handed the raw range and
    // is responsible for honoring a null range itself; the loop does not
    // special-case null before calling it. That is what this asserts.
    const depsNullRange: CombatLoopDeps = {
      isDead: () => false,
      view: () => fakeView(100, enemyHp),
      buildOptions: () => [{ id: 'attack', category: 'engage', label: 'attack' }],
      decide: (v, opts) => ({ optionId: opts[0]!.id, category: opts[0]!.category, reason: 'x' }),
      execute: async () => { enemyHp = 0; return { ...fakeRecord(), logRange: null }; },
      resolveLogDelta: (range) => (range ? ['SHOULD NEVER BE REACHED — range was null'] : []),
    };
    const result1 = await resolveCombatRounds(depsNullRange, 10);
    expect(result1.trace[0]!.logDelta).toEqual([]);
    expect(result1.trace[0]!.logDelta).not.toBeUndefined();

    let enemyHp2 = 10;
    const depsNoResolver: CombatLoopDeps = {
      isDead: () => false,
      view: () => fakeView(100, enemyHp2),
      buildOptions: () => [{ id: 'attack', category: 'engage', label: 'attack' }],
      decide: (v, opts) => ({ optionId: opts[0]!.id, category: opts[0]!.category, reason: 'x' }),
      execute: async () => { enemyHp2 = 0; return { ...fakeRecord(), logRange: [1, 3] as const }; },
      // resolveLogDelta deliberately omitted.
    };
    const result2 = await resolveCombatRounds(depsNoResolver, 10);
    expect(result2.trace[0]!.logDelta).toEqual([]);
    expect(result2.trace[0]!.logDelta).not.toBeUndefined();
  });

  it('⚠⚠⚠ log-delta capture does not alter the action selected, nor the outcome, with vs. without a resolver supplied', async () => {
    async function run(withResolver: boolean) {
      const logLines: string[] = [];
      let enemyHp = 1000; // never dies within the small budget — proves the mechanism, not endurance
      const base = {
        isDead: () => false,
        view: () => fakeView(100, enemyHp),
        buildOptions: (): DecisionOption[] => [{ id: 'attack', category: 'engage', label: 'attack' }],
        decide: (v: PlayerView, opts: DecisionOption[]) => ({ optionId: opts[0]!.id, category: opts[0]!.category, reason: 'pressing the attack' }),
        execute: async () => {
          const start = logLines.length + 1;
          logLines.push('YOU ATTACK. NO EFFECT.');
          return { ...fakeRecord(), logRange: [start, logLines.length] as const };
        },
      };
      const deps: CombatLoopDeps = withResolver
        ? { ...base, resolveLogDelta: (range) => (range ? logLines.slice(range[0] - 1, range[1]) : []) }
        : base;
      return resolveCombatRounds(deps, 4);
    }
    const withDelta = await run(true);
    const withoutDelta = await run(false);
    expect(withDelta.outcome.kind).toBe(withoutDelta.outcome.kind);
    expect(withDelta.roundsConsumed).toBe(withoutDelta.roundsConsumed);
    expect(withDelta.trace.map((r) => r.optionSelected)).toEqual(withoutDelta.trace.map((r) => r.optionSelected));
    expect(withDelta.trace.map((r) => r.policyCategory)).toEqual(withoutDelta.trace.map((r) => r.policyCategory));
    // The only difference the resolver is permitted to make: richer forensic text.
    expect(withDelta.trace.every((r) => r.logDelta.length > 0)).toBe(true);
    expect(withoutDelta.trace.every((r) => r.logDelta.length === 0)).toBe(true);
  });

  it('⚠⚠⚠ resolving the log delta does not mutate the log mirror or production state — it only reads a bounded slice', async () => {
    const logLines: string[] = ['seed line one', 'seed line two'];
    const { resolveLogDelta } = makeLogMirrorDeps(logLines);
    let enemyHp = 10;
    let rngDraws = 0; // stand-in for "RNG consumption" — execute() is the only place allowed to touch it
    const deps: CombatLoopDeps = {
      isDead: () => false,
      view: () => fakeView(100, enemyHp),
      buildOptions: () => [{ id: 'attack', category: 'engage', label: 'attack' }],
      decide: (v, opts) => ({ optionId: opts[0]!.id, category: opts[0]!.category, reason: 'x' }),
      execute: async () => {
        rngDraws++;
        const start = logLines.length + 1;
        logLines.push('YOU ATTACK.');
        enemyHp = 0;
        return { ...fakeRecord(), logRange: [start, logLines.length] as const };
      },
      resolveLogDelta,
    };
    const lengthBefore = logLines.length;
    await resolveCombatRounds(deps, 10);
    // The resolver itself never pushes to the mirror — only execute() (the
    // real production door in canonicalLife3.test.ts) is allowed to grow it.
    // logLines grew by exactly one line (the one execute() pushed).
    expect(logLines.length).toBe(lengthBefore + 1);
    expect(rngDraws).toBe(1);
    // Calling the resolver again with the same range is side-effect-free and
    // idempotent — reading forensic evidence after the fact cannot itself
    // consume anything.
    const first = resolveLogDelta([lengthBefore + 1, lengthBefore + 1]);
    const second = resolveLogDelta([lengthBefore + 1, lengthBefore + 1]);
    expect(first).toEqual(second);
    expect(logLines.length).toBe(lengthBefore + 1);
  });
});
