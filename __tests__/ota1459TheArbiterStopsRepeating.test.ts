/**
 * OTA-1459 — THREE THINGS THE OWNER'S LOG ASKED FOR, PINNED ON WHAT THEY CLAIM.
 *
 *   1. The Arbiter stops saying the same thing all day.
 *   2. Running costs something.
 *   3. One active contract stops being buried in nineteen parked ones.
 *
 * ⚠⚠ NOTHING HERE MATCHES BUTTON COPY OR PROSE. Six pins broke on label changes in
 * two days (ota1194, ota1271, two in ota1454, ota1379, and both ota1186 suites),
 * every one of them asserting a string as a stand-in for a property nobody had
 * written down. The wording of the Arbiter's line, the chip labels and the refusal
 * text are all free to keep improving.
 */
import {
  takeBountyNudge, _resetBountyNudge, BOUNTY_NUDGE_COOLDOWN_HOURS,
} from '../app/engine/arbiterNudge';
import { FLEE_STAMINA_COST } from '../app/engine/combatRules';

const read = (...p: string[]) =>
  require('fs').readFileSync(require('path').join(__dirname, '..', ...p), 'utf8') as string;
const STORE = read('app', 'state', 'gameStore.ts');
const CONTRACTS = read('app', 'screens', 'ContractsScreen.tsx');

/** ⚠⚠ CODE ONLY — comment lines removed.
 *
 * Written after two assertions in this very file failed on PROSE rather than code:
 * one searched a window that turned out to be entirely my own comment, and the
 * "no cap logic rides on this filter" check tripped over a comment EXPLAINING that
 * MAX_ACTIVE_BOUNTIES already exists elsewhere. A negative assertion that a comment
 * can trip is not measuring the code, and a positive one a comment can satisfy is
 * worse — it passes when the implementation is gone and only the explanation is
 * left. Same family as the chevron gate matching its own header. */
const codeOnly = (src: string): string => src
  .split('\n')
  .filter((l) => {
    const t = l.trim();
    return !(t.startsWith('//') || t.startsWith('*') || t.startsWith('/*') || t.startsWith('*/'));
  })
  .join('\n');
const STORE_CODE = codeOnly(STORE);
const CONTRACTS_CODE = codeOnly(CONTRACTS);

describe('OTA-1459 — the Arbiter stops repeating itself', () => {
  beforeEach(() => { _resetBountyNudge(); });

  it('⚠⚠⚠ THE SECOND MENTION INSIDE THE WINDOW IS HELD — the owner heard it seven times', () => {
    expect(takeBountyNudge(0)).toBe(true);
    expect(takeBountyNudge(1)).toBe(false);
    expect(takeBountyNudge(BOUNTY_NUDGE_COOLDOWN_HOURS - 1)).toBe(false);
  });

  it('⚠⚠⚠ …AND THE WINDOW IS IN GAME HOURS, WHICH IS THE WHOLE POINT', () => {
    // The trigger is the world tick, and the world ticks when TIME passes. The owner
    // advanced time in 8-hour rests — fifteen of them in about four real minutes. A
    // wall-clock cooldown would have let every one of those through; measured in game
    // hours, fifteen rests is 120h and buys him exactly two mentions, not fifteen.
    expect(takeBountyNudge(0)).toBe(true);
    let spoken = 1;
    for (let rest = 1; rest <= 15; rest++) {
      if (takeBountyNudge(rest * 8)) spoken += 1;
    }
    expect(spoken).toBeLessThanOrEqual(3);
  });

  it('⚠⚠ it speaks again once the window has genuinely passed — not silenced forever', () => {
    // A companion that goes permanently quiet is a worse bug than one that repeats.
    expect(takeBountyNudge(0)).toBe(true);
    expect(takeBountyNudge(BOUNTY_NUDGE_COOLDOWN_HOURS)).toBe(true);
    expect(takeBountyNudge(BOUNTY_NUDGE_COOLDOWN_HOURS * 2)).toBe(true);
  });

  it('⚠⚠ A CLOCK THAT GOES BACKWARDS HOLDS, rather than firing on every tick', () => {
    // Reachable: restore-from-backup rewinds hoursElapsed. A naive `now - last > gap`
    // with a rewound clock yields a negative gap, and the guard must read that as
    // "too soon", not "long overdue".
    expect(takeBountyNudge(100)).toBe(true);
    expect(takeBountyNudge(10)).toBe(false);
    expect(takeBountyNudge(0)).toBe(false);
  });

  it('⚠ a non-finite hour speaks and does NOT latch the cooldown', () => {
    // A NaN slipping in must never be able to silence the Arbiter permanently.
    expect(takeBountyNudge(Number.NaN)).toBe(true);
    expect(takeBountyNudge(0)).toBe(true);   // nothing was recorded
  });

  it('⚠⚠⚠ AND THE CALL SITE ACTUALLY GOES THROUGH IT — the bug was a bypassed choke point', () => {
    // `narration.ts` has had a flavour choke point all along; this line never joined
    // it, calling appendLog('arbiter', …) straight from the world tick. Pinning the
    // module in isolation would prove nothing about the line the player reads.
    const i = STORE.indexOf('if (ev.effect.offerBounty');
    expect(i).toBeGreaterThan(-1);
    expect(STORE.slice(i, i + 200)).toContain('takeBountyNudge(hour)');
  });
});

describe('OTA-1459 — running costs something', () => {
  it('⚠⚠ fleeing has a real, non-zero price', () => {
    expect(FLEE_STAMINA_COST).toBeGreaterThan(0);
  });

  it('⚠⚠ …but a modest one — it must not read as a punishment for retreating', () => {
    // The owner's stamina pool ran 8–17. A cost near the pool size would make one
    // escape the whole day, and retreat has to stay a legitimate tactic.
    expect(FLEE_STAMINA_COST).toBeLessThanOrEqual(5);
  });

  it('⚠⚠⚠ THE COST NEVER GATES THE ESCAPE — no softlock at zero stamina', () => {
    // THE property that decides whether this was safe to ship. A player cornered by
    // something that outclasses them, with an empty tank, must not be held in a fight
    // they cannot win by a resource rule. The escape resolves first; the cost lands
    // after, floored at zero.
    // ⚠ Anchored on the CODE, not on the comment above it: the first draft sliced
    // 700 characters from the comment's first line and never reached the statement.
    const i = STORE_CODE.indexOf('stamina: Math.max(0, s.player.stamina - FLEE_STAMINA_COST)');
    expect(i).toBeGreaterThan(-1);
    const block = STORE_CODE.slice(Math.max(0, i - 400), i + 200);
    // …and nothing around it refuses, returns early, or branches on the balance.
    expect(block).not.toMatch(/if\s*\(.*stamina\s*<[^]*\breturn\b/);
    expect(block).not.toContain('cannot flee');
  });

  it('⚠⚠ it is charged AFTER the enemies are cleared, so the escape has already resolved', () => {
    const clear = STORE.indexOf('OTA-1459 — RUNNING COSTS SOMETHING NOW');
    const enemiesCleared = STORE.lastIndexOf('enemies: [], enemyHps: [], activeEnemyIdx: 0, range: null }', clear);
    expect(enemiesCleared).toBeGreaterThan(-1);
    expect(clear).toBeGreaterThan(enemiesCleared);
  });
});

describe('OTA-1459 — the slate stops being a wall', () => {
  it('⚠⚠⚠ THE FILTER DEFAULTS TO SHOWING EVERYTHING', () => {
    // A filter that hides rows the player did not ask to hide is how a contract goes
    // missing and the screen starts lying — the same family as the atlas insisting
    // the player had not moved. Opt-in, never opt-out.
    expect(CONTRACTS).toContain("useState<'all' | 'active' | 'parked'>('all')");
  });

  it('⚠⚠ the predicate is total — every mode returns rows, none returns nothing', () => {
    const i = CONTRACTS.indexOf('const passesSlate =');
    expect(i).toBeGreaterThan(-1);
    const body = CONTRACTS.slice(i, CONTRACTS.indexOf(';', CONTRACTS.indexOf('!tracked', i)));
    expect(body).toContain("slate === 'all'");
    expect(body).toContain("slate === 'active' ? tracked : !tracked");
  });

  it('⚠⚠⚠ ALL FOUR FLOODED SECTIONS ARE FILTERED — not three of four', () => {
    // The flood in the log was eleven faction contracts, five mysteries and four
    // storylines, plus hunts. Filtering three of the four leaves a wall behind, and
    // "a rule applied at three of the four call sites leaves the fifth to ramble" is
    // this codebase's most repeated lesson.
    for (const list of ['hunts', 'mysteries', 'storylines', 'factionQuests']) {
      expect(CONTRACTS).toContain(`byMoves(${list}.filter((`);
    }
  });

  it('⚠⚠ the chip counts come from the SAME lists the filter acts on', () => {
    // A count derived from a different source than the rows it describes is a second
    // source of truth. This screen has been bitten by that twice today.
    const i = CONTRACTS.indexOf('const slateFlags');
    expect(i).toBeGreaterThan(-1);
    const block = CONTRACTS.slice(i, CONTRACTS.indexOf('};', CONTRACTS.indexOf('slateCounts', i)));
    for (const list of ['hunts', 'mysteries', 'storylines', 'factionQuests']) {
      expect(block).toContain(list);
    }
    expect(block).toContain('tracked !== false');
  });

  it('⚠ the control only appears when there is a wall to cut through', () => {
    expect(CONTRACTS).toContain('slateCounts.all > 3');
  });

  it('⚠ every chip is reachable to a screen reader', () => {
    const i = CONTRACTS.indexOf('OTA-1459 — the slate filter');
    expect(i).toBeGreaterThan(-1);
    const block = CONTRACTS.slice(i, i + 1400);
    expect(block).toContain('accessibilityRole="button"');
    expect(block).toContain('accessibilityLabel=');
    expect(block).toContain('accessibilityState={{ selected:');
  });

  it('⚠⚠ it changes PRESENTATION ONLY — no rule, cap or store call rides on it', () => {
    // The review that prompted this proposed a hard cap of three active contracts.
    // That cap already exists and is tighter (exactly one stage-run may be tracked;
    // MAX_ACTIVE_BOUNTIES = 3 since OTA-859). This must not quietly become a second,
    // disagreeing cap.
    const i = CONTRACTS_CODE.indexOf('const passesSlate =');
    expect(i).toBeGreaterThan(-1);
    const block = CONTRACTS_CODE.slice(Math.max(0, i - 400), i + 400);
    expect(block).not.toContain('setContractActive');
    expect(block).not.toContain('MAX_ACTIVE');
  });
});
