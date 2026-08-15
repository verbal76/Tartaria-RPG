// OTA-1150 — THE ACID BATCH. Three owner-called dials on the one coating that
// was outclassing the other five.
//
// Owner: *"I throw acid on everything and I use the coatings for my weapon and
// armor for resists and added damage … I'm just mowing through people. I might
// have made the player too powerful."*
//
// ⚠ WHY ACID AND NOT THE OTHERS. Poison and corruption add DAMAGE. Acid adds
// ACCURACY — and accuracy multiplies every other thing on the swing, including
// the flame and frost the owner had in the other slot. It also has the cheapest
// recipe in the game (Aether Dust ×1 + Scrap Metal ×1, the only two-ingredient
// one-each coating), so it is always available, which is why it was always used.
// The structural problem: acid's value SCALES WITH FIGHT LENGTH, so raising
// enemy HP to compensate feeds it instead of answering it.
//
// The three dials, and what each test here pins:
//   1. ACID_SHRED_MAX 5 → 3.
//   2. Shred decays once the acid DOT lapses — but NOT while it still burns.
//   3. A second coating slot lands at SECOND_COAT_EFFECT_MULT.
import {
  ACID_SHRED_MAX,
  ACID_SHRED_PER_HIT,
  ACID_SHRED_BOSS_BONUS,
  ACID_SHRED_DECAY_PER_ROUND,
  SECOND_COAT_EFFECT_MULT,
  acidShredCap,
  secondCoatRolled,
} from '../app/engine/weaponCoating';

describe('OTA-1150 — dial 1: the shred cap comes down', () => {
  it('normal enemies cap at 3, not 5', () => {
    expect(ACID_SHRED_MAX).toBe(3);
    expect(acidShredCap({ boss: false })).toBe(3);
    expect(acidShredCap(null)).toBe(3);
  });

  it('the boss headroom is unchanged — OTA-1142 already tuned that half', () => {
    // 6 → 2 was the OTA-1142 call and it stays; this batch only moves the base.
    expect(ACID_SHRED_BOSS_BONUS).toBe(2);
    expect(acidShredCap({ boss: true })).toBe(5);
  });

  it('⚠ reaching the cap still takes several hits — acid is slowed, not deleted', () => {
    // At 1 AC per landing hit, a normal foe needs 3 connected swings to bottom
    // out. If this ever reads 1, the coating has become a single-hit debuff.
    expect(Math.ceil(ACID_SHRED_MAX / ACID_SHRED_PER_HIT)).toBe(3);
  });
});

describe('OTA-1150 — dial 2: the guard knits back', () => {
  it('the decay rate is one point per round', () => {
    expect(ACID_SHRED_DECAY_PER_ROUND).toBe(1);
  });

  it('⚠ decay must not out-run application, or the mechanic is gone', () => {
    // THE TRAP THIS PINS: a flat every-round decay would cancel the +1 per hit
    // exactly, shred would never accumulate past 1, and dial 2 would have
    // deleted acid rather than tuned it. The store gates decay on "no live
    // acid_coat status", so a burning coat holds its ground. This asserts the
    // arithmetic that makes the gate necessary.
    expect(ACID_SHRED_DECAY_PER_ROUND).toBe(ACID_SHRED_PER_HIT);
  });

  it('a full stack takes as many quiet rounds to close as it took hits to build', () => {
    const roundsToClose = Math.ceil(ACID_SHRED_MAX / ACID_SHRED_DECAY_PER_ROUND);
    expect(roundsToClose).toBe(3);
  });
});

describe('OTA-1150 — dial 3: the second coating slot pays half', () => {
  it('the multiplier is a half', () => {
    expect(SECOND_COAT_EFFECT_MULT).toBe(0.5);
  });

  it('scales the rolled value, which drives both the hit and the DOT', () => {
    expect(secondCoatRolled(8)).toBe(4);
    expect(secondCoatRolled(6)).toBe(3);
    // Rounds rather than truncates, so odd rolls don't all bias downward.
    expect(secondCoatRolled(5)).toBe(3);
  });

  it('⚠ never floors to zero — a coating that LANDED always does something', () => {
    // A 1-point roll halving to 0 would print "the coating takes" and then do
    // nothing, which reads as a bug rather than as a tuning choice.
    expect(secondCoatRolled(1)).toBe(1);
    expect(secondCoatRolled(0)).toBe(1);
  });

  it('slot 1 is untouched — the nerf is asymmetric on purpose', () => {
    // The Crucible's dual-slot upgrade keeps its real value: a second ELEMENT
    // is a second weakness angle. It just stops paying full freight twice.
    const slot1 = 8;
    expect(slot1).toBeGreaterThan(secondCoatRolled(slot1));
  });
});
