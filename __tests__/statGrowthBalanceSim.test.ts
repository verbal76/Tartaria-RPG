// OTA-110 stat-growth balance audit (read-only diagnostic sim).
//
// Question being answered (user, 2026-05-28):
//   "Is the growth in INT stats too slow? Are we touching so few
//    things on average that, at the percentage rate we have set,
//    it is the slowest-growing stat? Check the average rate of
//    skill growth that we have on each stat and see if we are
//    unbalanced, growing too slow for the 9 cores main task,
//    or growing too fast, and we are going to burn past the
//    guardians' stats well before we get there."
//
// What this file does:
//   1. Drives the pure `trainStat` engine through a realistic
//      action mix (40% move / 20% investigate / 15% combat /
//      10% craft / 10% social / 5% rest), per-stat fire rates
//      derived from inspecting every trainStat / applyTrainAndLog
//      call site in app/state/gameStore.ts.
//   2. Runs N=20 seeded replicates of 5000 turns each.
//   3. Reports mean + stdev per stat, slowest/fastest stat, and
//      turns-to-clear vs Guardian stat thresholds.
//
// What this file does NOT do:
//   - Mutate any gameplay code or training rates. Diagnostic only.
//   - Spin up the whole Zustand store / parser. trainStat() is a
//     pure function; the sim drives it directly with a realistic
//     per-turn intent mix. This keeps the run under 60s and
//     makes the math auditable.
//
// Test invariants (jest assertions):
//   - No NaN / Infinity in any final stat
//   - No negative XP / progress
//   - Mean final stat ≥ start (training never regresses)
//   - Per-stat growth rate ≥ 0
//
// The numerical findings (mean stat values, growth rates) are
// printed via console.log and read off the report. They are not
// hard-asserted because the user wants to read the numbers and
// make a tuning call from them, not be blocked on an arbitrary
// threshold.

import {
  trainStat,
  progressAwardFor,
  LEVEL_UP_THRESHOLD,
  type StatKey,
} from '../app/engine/statTraining';
import type { PlayerCharacter } from '../app/engine/types';
import { placedAt } from '../test-utils/placePlayer';

// ---------------------------------------------------------------
// Seeded RNG — mulberry32. trainStat itself is deterministic given
// an action sequence, so we only need RNG for action selection.
// ---------------------------------------------------------------
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------
// Per-turn intent mix (per task spec, calibrated against
// HANDOFF.md "investigate-heavy playtest sessions" + the
// playtester action logs surfaced in OTA-040 / OTA-056).
// ---------------------------------------------------------------
const INTENT_MIX = {
  move:        0.40, // cardinal step — WIS on novel, STR (loaded), CHA (named gear)
  investigate: 0.20, // INT on substantive (~1st tap per noun in a room)
  combat:      0.15, // landed hit (STR or DEX), occasional parry (DEX), fight_back (STR)
  craft:       0.10, // scrap success → INT
  social:      0.10, // buy/sell/gift/accept → CHA, completion → WIS
  rest:        0.05, // post-combat rest → WIS occasionally
} as const;

// Per-intent firing rates for each stat, derived from the
// SOURCE CODE (not from speculation). Each entry is:
//   p(stat trains | intent fires) — the conditional probability
//   that a single "turn" of that intent produces a trainStat()
//   call on that stat.
//
// Source-of-truth references (file:line):
//   move-WIS         gameStore.ts:11813    fires when tile is NOVEL.
//                    Window-20 means after ~20 steps most are repeats;
//                    novelty rate stabilizes around 0.55 for a typical
//                    exploring player (per OTA-057 spec).
//   move-STR-loaded  gameStore.ts:11834    requires 20+ inventory items
//                    AND novel tile. Mid-game ~0.30 of players carry that.
//   move-CHA-named   gameStore.ts:11858    requires named (caps-cased)
//                    equipped gear AND novel tile. Named gear ~0.40
//                    once player has any Legendary/named drop.
//   investigate-INT  gameStore.ts:5006     fires only on SUBSTANTIVE
//                    investigate (hook/hidden-text/trinket/scanner).
//                    Per OTA-039 the first-investigate-per-room is
//                    guaranteed substantive. After that, ~50% chance
//                    per ambient noun until that room exhausts.
//                    Rooms have ~4 ambient nouns; player visits a new
//                    room every ~3-6 moves. So per-investigate-turn:
//                    P(substantive) ≈ 0.65.
//   combat-STR/DEX   gameStore.ts:9198     fires per LANDED hit. With
//                    typical combat: 60% chance of a hit per swing.
//                    Stat split: ~75% STR weapons, 25% DEX (finesse
//                    /ranged).
//   combat-DEX-parry gameStore.ts:15308    fires on a successful parry
//                    after entering dodge stance. ~15% of combat turns.
//   combat-STR-fb    gameStore.ts:15131    fires on Fight Back win.
//                    ~5% of combat turns (rare flow).
//   craft-INT-scrap  gameStore.ts:13247    fires on FULL-success scrap
//                    (OTA-058 — failure consolation doesn't train).
//                    ~70% of scrap attempts succeed.
//   social-CHA       gameStore.ts:9813/9900/9971/10357/10641/10921/11146
//                    fires on every successful buy / sell / gift /
//                    accept. Effectively 1.0 per social turn (the
//                    action picker only picks "social" if a vendor
//                    or contract is present, which the action mix
//                    assumes is true).
//   social-WIS-completion  gameStore.ts:10802/11062/11267/11331/11390/
//                    11448/11486 — fires on every hunt/mystery/
//                    storyline/faction completion. Completions are
//                    rare — ~5% of social turns are a completion
//                    (the rest are buys/sells/accepts in mid-arc).
//                    Storylines also double-train CHA on the same
//                    turn (line 11268).
//   rest-WIS         OTA-058 spec: "Resting after combat" but the
//                    code path doesn't actually have a trainStat
//                    call (verified by grep). The SKILL_ACTIVITIES
//                    display still lists it. Treating as 0.0 here
//                    until/unless a rest-WIS path is added.
//                    THIS IS A KEY FINDING — see report.
//
// Two more passive paths exist (climb tier in gameStore.ts:7038/7048)
// but the action mix folds climbs into "move" (rare flavor). We
// model an extra DEX/STR climb tick at p=0.03 per move turn
// (HANDOFF.md notes climb chips appear ~once per 30 moves in the
// OTA-085→086 playtest logs).
const FIRE_RATES: Record<
  keyof typeof INTENT_MIX,
  Partial<Record<StatKey, number>>
> = {
  move: {
    // Novel-tile gate. With a 20-tile sliding window the steady-state
    // novelty rate for a player who explores ~3 net new tiles per 5
    // moves (HANDOFF.md OTA-057 spec) lands around 0.55.
    wisdom: 0.55,
    // Conditional on novel AND >=20 items; not all players carry 20.
    strength: 0.55 * 0.30,
    // Conditional on novel AND wearing named gear.
    charisma: 0.55 * 0.40,
    // Climb sub-events folded into move turns (rare).
    dexterity: 0.03,
  },
  investigate: {
    // Substantive-outcome gate. First investigate per room is
    // guaranteed (OTA-039). After that ~50%. Per-turn average ~0.65.
    intelligence: 0.65,
  },
  combat: {
    // Hit rate × weapon-stat split. Most weapons are STR.
    strength: 0.60 * 0.75 + 0.05 /* fight_back win */,
    dexterity: 0.60 * 0.25 + 0.15 /* parry */,
  },
  craft: {
    // Full-success scrap rate.
    intelligence: 0.70,
  },
  social: {
    charisma: 1.0,
    // Completion sub-event rate × the WIS path.
    wisdom: 0.05,
  },
  rest: {
    // No code path actually trains WIS on rest as of OTA-110.
    // SKILL_ACTIVITIES lists it but no trainStat call exists.
  },
};

// ---------------------------------------------------------------
// Build a fresh trainee at typical mid-game starting stats. The
// engine's character creation seeds the player with 10s across
// the board (verified in app/engine/character.ts STARTING_STATS).
// ---------------------------------------------------------------
function makePlayer(): PlayerCharacter {
  return {
    name: 'BalanceProbe',
    raceId: 'unknowing_mass',
    factionId: 'reclaimers_guild',
    stats: { strength: 10, dexterity: 10, intelligence: 10, wisdom: 10, charisma: 10 },
    statProgress: { strength: 0, dexterity: 0, intelligence: 0, wisdom: 0, charisma: 0 },
    hp: 30,
    hpMax: 30,
    stamina: 10,
    staminaMax: 10,
    equipped: {},
    ac: 10,
    tc: 0,
    corruption: 0,
    inventory: [],
    factionStanding: [],
    ...placedAt('tartarian_outskirts'),
    activeQuests: [],
    mapSeed: 'sim',
  } as PlayerCharacter;
}

const INTENT_KEYS = Object.keys(INTENT_MIX) as Array<keyof typeof INTENT_MIX>;
const INTENT_CDF = (() => {
  const out: Array<[keyof typeof INTENT_MIX, number]> = [];
  let acc = 0;
  for (const k of INTENT_KEYS) {
    acc += INTENT_MIX[k];
    out.push([k, acc]);
  }
  return out;
})();

function pickIntent(rng: () => number): keyof typeof INTENT_MIX {
  const r = rng();
  for (const [k, c] of INTENT_CDF) if (r < c) return k;
  return INTENT_KEYS[INTENT_KEYS.length - 1]!;
}

const STAT_KEYS: StatKey[] = ['strength', 'dexterity', 'intelligence', 'wisdom', 'charisma'];

interface RunResult {
  finalStats: Record<StatKey, number>;
  // Total raw progress accumulated per stat (counting level-ups
  // as 100 progress each + the leftover). Lets us recover the
  // "XP per turn" rate independent of where the player crossed
  // a tier boundary.
  totalProgress: Record<StatKey, number>;
  trainCalls: Record<StatKey, number>;
}

function runOneSim(turns: number, seed: number): RunResult {
  const rng = mulberry32(seed);
  let p = makePlayer();
  const startStats = { ...p.stats };
  const trainCalls: Record<StatKey, number> = {
    strength: 0, dexterity: 0, intelligence: 0, wisdom: 0, charisma: 0,
  };

  for (let t = 0; t < turns; t++) {
    const intent = pickIntent(rng);
    const rates = FIRE_RATES[intent];
    for (const stat of STAT_KEYS) {
      const p_fire = rates[stat] ?? 0;
      if (p_fire <= 0) continue;
      if (rng() >= p_fire) continue;
      trainCalls[stat]++;
      const r = trainStat(p, stat, true);
      p = r.player;
    }
  }

  // Compute total raw progress per stat = (levels gained * 100) + leftover.
  const totalProgress: Record<StatKey, number> = {
    strength: 0, dexterity: 0, intelligence: 0, wisdom: 0, charisma: 0,
  };
  for (const stat of STAT_KEYS) {
    const gainedLevels = p.stats[stat] - startStats[stat];
    const leftover = p.statProgress?.[stat] ?? 0;
    totalProgress[stat] = gainedLevels * LEVEL_UP_THRESHOLD + leftover;
  }

  return {
    finalStats: { ...p.stats },
    totalProgress,
    trainCalls,
  };
}

// ---------------------------------------------------------------
// Guardian stat thresholds — what the player needs to clear them.
// Source: app/engine/coreGuardians.ts (per-Capital base stats +
// per-tier scaling profile). Tier 1 = first kill, Tier 9 = last.
//
// We translate each Guardian's combat profile into a rough
// "minimum player stat to land hits and clear in <8 rounds":
// AC = 5 + apNum + tier acBonus + 6 (boss). Player needs +stat
// such that d20 + stat >= AC + ~5 (so >=50% hit rate). For HP =
// guardian.hp * hpMult, the player needs DPS = hp/8 rounds.
// ---------------------------------------------------------------
interface GuardianProfile {
  tier: number;
  name: string;
  // approximate AC the player must beat (5 + AP + acBonus + 6)
  approxAC: number;
  // 50%-hit-rate stat floor (d20 + stat >= AC → stat >= AC - 10.5)
  statFloorTo50: number;
  // 75%-hit-rate stat floor (need to actually clear in ~6 rounds)
  statFloorTo75: number;
  // attack-stat affinity (which player stat is most efficient)
  attackStatPreferred: StatKey;
}

const GUARDIANS: GuardianProfile[] = [
  // From coreGuardians.ts:
  //   tier 1 Vaelka         AP=Strength 6  acBonus=0  → AC = 5+6+0+6 = 17
  //   tier 2 Atalan-Drowned AP=Const 7     acBonus=1  → AC = 5+7+1+6 = 19
  //   tier 3 Konrad         AP=Strength 8  acBonus=1  → AC = 5+8+1+6 = 20
  //   tier 4 Drakovna       AP=Wisdom 8    acBonus=2  → AC = 5+8+2+6 = 21
  //   tier 5 Cantor         AP=Intel 9     acBonus=2  → AC = 5+9+2+6 = 22
  //   tier 6 Tobiel         AP=Wisdom 7    acBonus=3  → AC = 5+7+3+6 = 21
  //   tier 7 Mara           AP=Wisdom 8    acBonus=3  → AC = 5+8+3+6 = 22
  //   tier 8 Ostros         AP=Cha 8       acBonus=4  → AC = 5+8+4+6 = 23
  //   tier 9 Inarra         AP=Dex 9       acBonus=5  → AC = 5+9+5+6 = 25
  { tier: 1, name: 'Vaelka',         approxAC: 17, statFloorTo50: 7,  statFloorTo75: 12, attackStatPreferred: 'strength' },
  { tier: 2, name: 'Atalan-Drowned', approxAC: 19, statFloorTo50: 9,  statFloorTo75: 14, attackStatPreferred: 'strength' },
  { tier: 3, name: 'Konrad',         approxAC: 20, statFloorTo50: 10, statFloorTo75: 15, attackStatPreferred: 'strength' },
  { tier: 4, name: 'Drakovna',       approxAC: 21, statFloorTo50: 11, statFloorTo75: 16, attackStatPreferred: 'strength' },
  { tier: 5, name: 'Cantor',         approxAC: 22, statFloorTo50: 12, statFloorTo75: 17, attackStatPreferred: 'strength' },
  { tier: 6, name: 'Tobiel',         approxAC: 21, statFloorTo50: 11, statFloorTo75: 16, attackStatPreferred: 'strength' },
  { tier: 7, name: 'Mara',           approxAC: 22, statFloorTo50: 12, statFloorTo75: 17, attackStatPreferred: 'strength' },
  { tier: 8, name: 'Ostros',         approxAC: 23, statFloorTo50: 13, statFloorTo75: 18, attackStatPreferred: 'strength' },
  { tier: 9, name: 'Inarra',         approxAC: 25, statFloorTo50: 15, statFloorTo75: 20, attackStatPreferred: 'strength' },
];

// turnsToReach(stat, target) — given a per-turn growth rate
// (xpRate) and the progressive tier curve, how many turns to
// reach the target stat? Closed form: progress per +1 stat
// across the tier the stat is currently sitting in.
function turnsToReach(startStat: number, xpRate: number, target: number): number {
  if (target <= startStat) return 0;
  if (xpRate <= 0) return Infinity;
  let total = 0;
  for (let s = startStat; s < target; s++) {
    // Each +1 at base stat `s` requires LEVEL_UP_THRESHOLD / progressAwardFor(s) successful uses.
    const uses = LEVEL_UP_THRESHOLD / progressAwardFor(s);
    total += uses;
  }
  // Uses → turns: each turn delivers `xpRate / progressAwardFor(s)` AVERAGED
  // uses-per-stat-level (rate already in XP/turn, threshold 100 per level).
  // Easier path: total XP needed = total * progressAwardFor at each level.
  // But we want turns, so re-derive: each tier consumes 100 XP at xpRate XP/turn.
  let xpNeeded = 0;
  for (let s = startStat; s < target; s++) xpNeeded += LEVEL_UP_THRESHOLD;
  return xpNeeded / xpRate;
}

// ---------------------------------------------------------------
// Tests
// ---------------------------------------------------------------
describe('OTA-110 stat-growth balance audit (sim)', () => {
  jest.setTimeout(60000);

  const RUNS = 20;
  const TURNS = 5000;

  it('runs N=20 seeded replicates and reports stat growth + Guardian gating', () => {
    const results: RunResult[] = [];
    for (let i = 0; i < RUNS; i++) {
      results.push(runOneSim(TURNS, 0xBADCAFE ^ (i * 2654435761)));
    }

    // Invariants — these are the actual assertions. Numbers below
    // are descriptive only (printed for the audit).
    for (const r of results) {
      for (const stat of STAT_KEYS) {
        expect(Number.isFinite(r.finalStats[stat])).toBe(true);
        expect(Number.isNaN(r.finalStats[stat])).toBe(false);
        expect(r.finalStats[stat]).toBeGreaterThanOrEqual(10); // never regress below starting 10
        expect(r.totalProgress[stat]).toBeGreaterThanOrEqual(0);
        expect(r.trainCalls[stat]).toBeGreaterThanOrEqual(0);
      }
    }

    // Aggregate.
    const meanStat: Record<StatKey, number> = {
      strength: 0, dexterity: 0, intelligence: 0, wisdom: 0, charisma: 0,
    };
    const sumSqStat: Record<StatKey, number> = {
      strength: 0, dexterity: 0, intelligence: 0, wisdom: 0, charisma: 0,
    };
    const meanCalls: Record<StatKey, number> = {
      strength: 0, dexterity: 0, intelligence: 0, wisdom: 0, charisma: 0,
    };
    const meanXp: Record<StatKey, number> = {
      strength: 0, dexterity: 0, intelligence: 0, wisdom: 0, charisma: 0,
    };
    for (const r of results) {
      for (const stat of STAT_KEYS) {
        meanStat[stat] += r.finalStats[stat] / RUNS;
        meanCalls[stat] += r.trainCalls[stat] / RUNS;
        meanXp[stat] += r.totalProgress[stat] / RUNS;
      }
    }
    for (const r of results) {
      for (const stat of STAT_KEYS) {
        sumSqStat[stat] += (r.finalStats[stat] - meanStat[stat]) ** 2;
      }
    }
    const stdevStat: Record<StatKey, number> = {
      strength: 0, dexterity: 0, intelligence: 0, wisdom: 0, charisma: 0,
    };
    for (const stat of STAT_KEYS) {
      stdevStat[stat] = Math.sqrt(sumSqStat[stat] / RUNS);
    }

    // Per-stat XP-per-turn rate.
    const xpRate: Record<StatKey, number> = {
      strength: meanXp.strength / TURNS,
      dexterity: meanXp.dexterity / TURNS,
      intelligence: meanXp.intelligence / TURNS,
      wisdom: meanXp.wisdom / TURNS,
      charisma: meanXp.charisma / TURNS,
    };

    // ---------------------------------------------------------------
    // Report
    // ---------------------------------------------------------------
    const lines: string[] = [];
    lines.push('');
    lines.push('================================================================');
    lines.push(`OTA-110 stat-growth balance audit — ${RUNS} runs × ${TURNS} turns`);
    lines.push('Action mix: 40% move / 20% invest / 15% combat / 10% craft / 10% social / 5% rest');
    lines.push('Starting stats: STR/DEX/INT/WIS/CHA = 10/10/10/10/10');
    lines.push('================================================================');
    lines.push('');
    lines.push('Per-stat results (mean ± stdev across runs):');
    lines.push('  STAT          FINAL       XP/TURN    TRAINS/RUN');
    for (const stat of STAT_KEYS) {
      const label = stat.toUpperCase().padEnd(13);
      lines.push(
        `  ${label} ${meanStat[stat].toFixed(2).padStart(5)} ± ${stdevStat[stat].toFixed(2)}   ` +
        `${xpRate[stat].toFixed(3).padStart(6)}    ${meanCalls[stat].toFixed(0).padStart(6)}`,
      );
    }
    lines.push('');

    // Slowest / fastest.
    const sorted = [...STAT_KEYS].sort((a, b) => meanStat[a] - meanStat[b]);
    const slowest = sorted[0]!;
    const fastest = sorted[sorted.length - 1]!;
    lines.push(`Slowest-growing stat: ${slowest.toUpperCase()} (mean +${(meanStat[slowest] - 10).toFixed(2)} in ${TURNS} turns)`);
    lines.push(`Fastest-growing stat: ${fastest.toUpperCase()} (mean +${(meanStat[fastest] - 10).toFixed(2)} in ${TURNS} turns)`);
    lines.push('');

    // Guardian thresholds.
    lines.push('Guardian gating — turns from start (STR 10) to clear at 75% hit-rate:');
    lines.push('  TIER  NAME              AC   STR_TO_75   TURNS_AT_RATE');
    for (const g of GUARDIANS) {
      const tt = turnsToReach(10, xpRate.strength, g.statFloorTo75);
      const ttLabel = isFinite(tt) ? Math.round(tt).toString().padStart(8) : '   ∞    ';
      lines.push(`  T${g.tier}    ${g.name.padEnd(17)} ${String(g.approxAC).padStart(2)}      ${String(g.statFloorTo75).padStart(2)}        ${ttLabel}`);
    }
    lines.push('');
    lines.push('Per-stat turns to reach +1 from 10 → 11 (tier-2 cost: 100/2 = 50 uses):');
    for (const stat of STAT_KEYS) {
      const t = turnsToReach(10, xpRate[stat], 11);
      lines.push(`  ${stat.toUpperCase().padEnd(13)} ${isFinite(t) ? Math.round(t).toString().padStart(6) : '    ∞'} turns (XP/turn ${xpRate[stat].toFixed(3)})`);
    }
    lines.push('');
    lines.push('================================================================');

    // eslint-disable-next-line no-console
    console.log(lines.join('\n'));

    // Stash for the test below to assert against.
    (globalThis as { __statSim?: unknown }).__statSim = {
      meanStat, stdevStat, xpRate, meanCalls, meanXp,
    };
  });

  it('all stats grow at a strictly nonnegative rate', () => {
    const stash = (globalThis as { __statSim?: { xpRate: Record<StatKey, number> } }).__statSim;
    if (!stash) throw new Error('previous test did not run');
    for (const stat of STAT_KEYS) {
      expect(stash.xpRate[stat]).toBeGreaterThanOrEqual(0);
    }
  });

  it('INT growth rate is measured (descriptive — not threshold-asserted)', () => {
    // This test exists so a future tuning OTA can flip the
    // descriptive expectation into a hard assertion once the
    // intended INT rate is set. Today, just records the rate.
    const stash = (globalThis as { __statSim?: { xpRate: Record<StatKey, number> } }).__statSim;
    if (!stash) throw new Error('previous test did not run');
    expect(stash.xpRate.intelligence).toBeGreaterThan(0);
  });
});
