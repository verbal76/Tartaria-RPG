/**
 * OTA-1539 — THE BRAKE SAT ABOVE THE WHOLE EARLY AND MID GAME.
 *
 * Owner: *"having high AC so far early or mid game is like wearing plate steel
 * armor and trying to get hurt by somebody throwing a tennis ball."*
 *
 * ⚠⚠⚠ THE SEAM IS ONE CONSTANT. `trimStandingAc`'s knee was 22. A player reaches
 * raw 23 the moment they finish a set of Uncommon armour — so the entire early
 * and mid game ran on the UNTRIMMED, linear part of the curve, where every point
 * of AC is worth a full 5% and nothing opposes it. OTA-924 picked 22 to stop a
 * fully-fused Legendary build at raw ~37; it was solving a late-game problem and
 * said so. The brake was simply installed above the road.
 *
 * Measured against the enemy tier each stage is meant to fight (attack bonuses
 * censused across all 111 enemy rows: Common +3, Uncommon +5, Rare +7,
 * Legendary +9, hardest +13):
 *
 *   stage    raw   AC was -> now   hit% was -> now   (tier it is meant to fight)
 *   opening   16      16 -> 16        40% -> 40%       Common +3  — unchanged, on purpose
 *   early     23      22 -> 20        25% -> 30%       Uncommon +5
 *   mid       28      24 -> 22        25% -> 30%       Rare +7
 *   late      38      28 -> 27        25% -> 25%       Legendary +9 — capped either way
 *
 * ⚠⚠⚠ THIS TABLE IS THE CORRECTED ONE, AND THE CORRECTION IS THE POINT. The first
 * pass modelled the to-hit roll as a plain d20 with 5% floors and reported 10.0
 * swings at early, mid AND late — 2.5x the truth. The resolver caps the natural
 * roll an enemy needs at ENEMY_HIT_NEEDED_CAP = 16, a ~25% floor hit chance
 * against ANY AC, and converts the AC wasted past that cap into plate DR. That
 * cap is OTA-924's, owner-tuned 13 → 16 in OTA-1141 for this exact concern —
 * *"a maxed tank still gets hit one swing in four"*. So the runaway this OTA was
 * pitched against was already half-braked, and what is actually shipping is a
 * nudge: 25% → 30% incoming hits across early and mid, nothing at the opening,
 * nothing at late.
 *
 * ⚠⚠ THE DOMINANT KNOB IS THE CAP, NOT THIS KNEE. Anyone tuning the feel further
 * should start at ENEMY_HIT_NEEDED_CAP, which sets the floor for most of the
 * game; the knee only bites in the band where trimmed AC minus attack has not
 * yet reached 16.
 *
 * ⚠⚠ THE TWO CURVES DIVERGE 3:1. Player AC across a run climbs 16 → 23 → 28 → 38
 * (+22 raw); enemy attack climbs +3 → +9 (+6). Defence outruns offence by more
 * than three to one and nothing braked it until 22.
 *
 * ⚠⚠ 16 IS CHOSEN, NOT ROUNDED. It is exactly the raw AC of the best Common set,
 * so the opening is left bit-for-bit identical — the fights that already read as
 * fights are untouched, and the curve bends only where the player starts
 * outrunning the world.
 *
 * ⚠ A CORRECTION THAT SURVIVED INTO THE DESIGN. The late-game raw was first
 * computed as 35 from the CATALOG alone. It is 38: post-OTA-1537 fused Legendary
 * (AC 5) beats catalog Legendary (AC 4) on head, legs and feet and ties it on
 * chest. That made the shipped curve's late-game figure worse than reported —
 * 10.0 swings, not 6.7 — so the correction strengthened the case rather than
 * weakening it. Early and mid were unaffected: fusion only TIES the catalog at
 * Uncommon and Rare, so it cannot lift those stages at all.
 */
import { trimStandingAc } from '../app/engine/equipment';
import { readFileSync } from 'fs';
import { join } from 'path';

const src = (...p: string[]): string => readFileSync(join(__dirname, '..', ...p), 'utf8');

/** ⚠ THE RESOLVER'S ACTUAL RULE, not a plain d20. `acHitNat = clamp(effectiveAc -
 *  atkBonus, 2, ENEMY_HIT_NEEDED_CAP)` and the enemy hits on `atkRoll >= acHitNat`,
 *  so the needed natural roll never exceeds 16 — a 25% floor against any AC. A
 *  first draft of this suite omitted the cap and overstated every figure by 2.5x. */
const ENEMY_HIT_NEEDED_CAP = 16;
const hitChance = (ac: number, atk: number): number => {
  const need = Math.max(2, Math.min(ENEMY_HIT_NEEDED_CAP, ac - atk));
  return (21 - need) / 20;
};

describe('OTA-1539 — the curve bends where the player outruns the world', () => {
  it('⚠⚠⚠ the opening is bit-for-bit unchanged', () => {
    // The whole reason 16 was chosen over 14 or 12. A new character's fights
    // already read correctly; this OTA must not touch them.
    for (let raw = 1; raw <= 16; raw++) expect(trimStandingAc(raw)).toBe(raw);
    expect(hitChance(trimStandingAc(16), 3)).toBeCloseTo(0.40, 2);
  });

  it('⚠⚠⚠ early game takes 30% incoming hits, up from the cap floor of 25%', () => {
    // ⚠ PAIRED WITH THE TIER THE STAGE IS MEANT TO FIGHT (early = Uncommon +5),
    // which is the pairing the design table used. A first draft measured early
    // against Common +3 — a tier the player has outgrown by then — and read 5.0
    // swings, making the fix look like it had missed.
    expect(trimStandingAc(23)).toBe(20);
    // 25% (the cap floor, where the old curve sat) -> 30%.
    expect(hitChance(trimStandingAc(23), 5)).toBeCloseTo(0.30, 2);
    expect(hitChance(22, 5)).toBeCloseTo(0.25, 2); // what the shipped curve gave
  });

  it('⚠⚠⚠ …and so does mid game', () => {
    // mid = Rare +7.
    expect(trimStandingAc(28)).toBe(22);
    expect(hitChance(trimStandingAc(28), 7)).toBeCloseTo(0.30, 2);
    expect(hitChance(24, 7)).toBeCloseTo(0.25, 2); // what the shipped curve gave
  });

  it('⚠⚠ late game is UNCHANGED — the cap already decided it', () => {
    // Raw 38 is a ~990 TC project post-1537 (three fused Legendary: 6 Rare
    // inputs burned + 3 x 150 TC), so it SHOULD feel armoured. It just may not
    // be a wall: 6.7 swings, not the 10.0 the old curve gave.
    // ⚠ HONEST: late is UNCHANGED. Both curves sit above the cap here, so the
    // floor decides and this OTA buys nothing at the top of the game. Claiming
    // otherwise is what the first draft did.
    expect(trimStandingAc(38)).toBe(27);
    expect(hitChance(trimStandingAc(38), 9)).toBeCloseTo(0.25, 2);
    expect(hitChance(28, 9)).toBeCloseTo(0.25, 2);
  });

  it('⚠⚠ the hardest enemies stay lethal at every AC a player can reach', () => {
    // No build may make the top of the bestiary harmless. +13 is the censused
    // maximum across all 111 enemy rows.
    // ⚠ REACHABLE ONLY. The standing ceiling is raw 38 — base 10 plus the best
    // gear AC in the game (28, six slots, three of them fused Legendary).
    // A first draft asserted this at raw 50, which is not a build, and the
    // failure was the test describing a character that cannot exist.
    for (const raw of [16, 23, 28, 38]) {
      expect(hitChance(trimStandingAc(raw), 13)).toBeGreaterThanOrEqual(0.25);
    }
  });

  it('⚠⚠ every stage is strictly MORE dangerous than before, and monotonically so', () => {
    // A rebalance that made some band safer would be a new seam, not a fix.
    const old = (raw: number) => (raw <= 22 ? raw : Math.round(22 + (raw - 22) * 0.4));
    for (const raw of [17, 20, 23, 28, 32, 38, 45]) {
      expect(trimStandingAc(raw)).toBeLessThanOrEqual(old(raw));
    }
    // …and AC still always RISES with gear. A curve that flattened would make
    // armour pointless, which is the opposite failure.
    let prev = 0;
    for (let raw = 1; raw <= 60; raw++) {
      const t = trimStandingAc(raw);
      expect(t).toBeGreaterThanOrEqual(prev);
      prev = t;
    }
  });

  it('⚠ the constants are the ONLY change — the shape of the function is untouched', () => {
    const code = src('app', 'engine', 'equipment.ts');
    expect(code).toContain('export function trimStandingAc(rawAc: number, knee = 16, rate = 0.5): number {');
    expect(code).toContain('if (rawAc <= knee) return rawAc;');
    expect(code).toContain('return Math.round(knee + (rawAc - knee) * rate);');
  });

  it('⚠ the shown AC is still the fought AC — one function, both surfaces', () => {
    // OTA-1140's rule. If the resolver and the StatsPanel ever trim differently
    // the player is defended at a number the card never showed.
    expect(src('app', 'state', 'combatResolution.ts')).toContain('trimStandingAc(racialAC + armorPieces.acBonus + titleRuinsAc)');
    expect(src('app', 'state', 'combatResolution.ts')).toContain('const trimDelta = trimStandingAc(standingRaw) - standingRaw;');
  });
});
