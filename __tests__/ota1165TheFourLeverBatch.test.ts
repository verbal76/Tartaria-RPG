// OTA-1165 — THE FOUR-LEVER BATCH, from the master tuning list.
//
// After the MASTER TUNING REFERENCE went into HANDOFF §8, the owner asked
// which levers to touch NOW, heard the case for four, and called it:
//
//   "yes run the 4 level batch"
//
// All four are pure number/gate turns — no new mechanics — and each one is
// pinned here so a future refactor can't quietly walk them back:
//
//   1. Tier-1 Guardian hpMult 1.4 → 1.0. The ×1.4 was tuned against
//      pre-OTA-926 per-Capital bases (30-50 HP). When OTA-926 flattened the
//      base to a canonical 42, the first rung silently inherited a 40% raise
//      (59 HP) nothing re-derived. Your first Guardian is now the base: 42.
//   2. MILESTONE_KILL_STEP 5 → 3. The sim: one-round-death risk stays above
//      5% until ~28 max HP and a fresh arrival has 24. Faster HP drip is the
//      cleanest "arrivals are too thin" lever. Travel milestone stays 5.
//   3. ACID_SHRED_BOSS_BONUS 6 → 2. Acid could shred a boss 11 AC — combined
//      with weakness-stagger it turned bosses into training dummies
//      (stagger-lock, exploit report E1). Cap is now 5+2=7.
//   4. Bosses fight the person in front of them: the 25% random dog soak no
//      longer fires on a boss (it skipped the second-swing block AND rolled
//      no boss +1d6 — an invisible difficulty coin-flip every round). A
//      FAILED DISTRACT still redirects on a boss: commanding the dog at a
//      boss and blowing the roll is a consequence the player chose (OTA-795).
import { readFileSync } from 'fs';
import { join } from 'path';
import type { PlayerCharacter } from '../app/engine/types';
import { spawnGuardianForCapital, monotoneTierHp } from '../app/engine/coreGuardians';
import type { GuardianTier } from '../app/engine/coreGuardians';
import { LOST_CAPITAL_LOCATIONS } from '../app/engine/mainQuest';
import { acidShredCap, ACID_SHRED_MAX } from '../app/engine/weaponCoating';

const gameStoreSrc = readFileSync(join(__dirname, '..', 'app', 'state', 'gameStore.ts'), 'utf8');
const guardiansSrc = readFileSync(join(__dirname, '..', 'app', 'engine', 'coreGuardians.ts'), 'utf8');

// Same fixture shape as ota954: hpMax 100 → power = strength + 10.
function makePlayer(strength: number, cores: string[]): PlayerCharacter {
  return {
    name: 'Batch', raceId: 'human', factionId: 'reclaimers_guild',
    stats: { strength, dexterity: 1, intelligence: 1, wisdom: 8, charisma: 8, stealth: 1 },
    hp: 100, hpMax: 100, stamina: 10, staminaMax: 10, ac: 12, tc: 0, corruption: 0,
    inventory: [], factionStanding: [], currentLocationId: 'asgardar', activeQuests: [],
    mainQuest: { phase: 'cores', coresRecovered: cores },
  } as unknown as PlayerCharacter;
}

const TARGET = LOST_CAPITAL_LOCATIONS[LOST_CAPITAL_LOCATIONS.length - 1]!;

describe('OTA-1165 lever 1 — first Guardian IS the base (hpMult 1.0)', () => {
  it('tier 1 spawns at the canonical 42 HP on-curve, not the drifted 59', () => {
    const g = spawnGuardianForCapital(makePlayer(2, []), TARGET)!;
    expect(g.hp).toBe(42);
  });

  it('tier 2+ are untouched — the on-curve ladder above tier 1 is the OTA-926 curve', () => {
    const expected = [67, 76, 84, 92, 101, 168, 231]; // tiers 2..8 at 42 × {1.6,1.8,2.0,2.2,2.4,4.0,5.5}
    for (let cores = 1; cores <= 7; cores++) {
      const g = spawnGuardianForCapital(makePlayer(2, LOST_CAPITAL_LOCATIONS.slice(0, cores)), TARGET)!;
      expect(g.hp).toBe(expected[cores - 1]);
    }
  });

  it('the ladder stays strictly monotone with the smaller first rung', () => {
    const p = makePlayer(2, []);
    let prev = 0;
    for (let t = 1; t <= 9; t++) {
      const hp = monotoneTierHp(p, t as GuardianTier);
      expect(hp).toBeGreaterThan(prev);
      prev = hp;
    }
  });

  it('source pins tier 1 at hpMult 1.0 with the OTA-1165 drift explanation', () => {
    expect(guardiansSrc).toMatch(/1:\s*\{\s*hpMult:\s*1\.0,/);
    const comment = guardiansSrc.slice(0, guardiansSrc.indexOf('hpMult: 1.0'));
    expect(comment).toContain('OTA-1165');
  });
});

describe('OTA-1165 lever 2 — HP milestone every 3 distinct kills', () => {
  it('MILESTONE_KILL_STEP is 3', () => {
    expect(gameStoreSrc).toContain('const MILESTONE_KILL_STEP = 3;');
  });

  it('the travel milestone deliberately stays at 5', () => {
    expect(gameStoreSrc).toContain('const MILESTONE_TRAVEL_STEP = 5;');
  });

  it('the kill milestone still keys off DISTINCT kills (the arb119 farm guard survives)', () => {
    // The step got smaller, so the no-farm guard matters MORE: re-killing a
    // respawnable enemy must not tick the milestone counter.
    expect(gameStoreSrc).toContain('firstOfType && checkMilestone(distinctKills, MILESTONE_KILL_STEP)');
  });
});

describe('OTA-1165 lever 3 — acid shreds a boss on a +2 headroom, not +6', () => {
  it('boss cap is ACID_SHRED_MAX + 2', () => {
    expect(acidShredCap({ boss: true })).toBe(ACID_SHRED_MAX + 2);
    // ⚠ Retargeted by OTA-1173. The absolute was 7 back when ACID_SHRED_MAX was
    // 5; that batch took the BASE cap 5 → 3, so the same +2 headroom now totals
    // 5. OTA-1165's actual claim — the boss BONUS is 2, not 6 — is the relative
    // assertion above and is untouched. Only the arithmetic downstream moved.
    expect(acidShredCap({ boss: true })).toBe(5);
  });

  it('non-boss and missing-enemy caps are unchanged at ACID_SHRED_MAX', () => {
    expect(acidShredCap({ boss: false })).toBe(ACID_SHRED_MAX);
    expect(acidShredCap(null)).toBe(ACID_SHRED_MAX);
    expect(acidShredCap(undefined)).toBe(ACID_SHRED_MAX);
  });
});

describe('OTA-1165 lever 4 — bosses fight the person in front of them', () => {
  // The redirect condition in runEnemyGroupCounters. Grab the exact line so
  // both halves of the owner's call are pinned: no RANDOM soak on a boss,
  // but a FAILED DISTRACT (forcedOnDog) still redirects unconditionally.
  const redirectLine = gameStoreSrc
    .split('\n')
    .find((l) => l.includes('applyEnemyCounterToDog') === false && l.includes('DOG_TARGET_CHANCE') && l.includes('forcedOnDog'));

  it('the random soak roll is gated on !enemy.boss', () => {
    expect(redirectLine).toBeDefined();
    expect(redirectLine).toContain('!enemy.boss && Math.random() < DOG_TARGET_CHANCE');
  });

  it('forcedOnDog sits OUTSIDE the boss gate — a blown distract still redirects on a boss', () => {
    // forcedOnDog || (!enemy.boss && ...): the forced branch must not be
    // inside the parenthesized boss-gated clause.
    expect(redirectLine).toContain('forcedOnDog || (!enemy.boss');
  });

  it('forcedOnDog itself carries no boss condition (OTA-795 semantics intact)', () => {
    const def = gameStoreSrc.split('\n').find((l) => l.includes('const forcedOnDog ='));
    expect(def).toBeDefined();
    expect(def).not.toContain('boss');
    expect(def).toContain('forceDogEnemyIdx');
  });
});
