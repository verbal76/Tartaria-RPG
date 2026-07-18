// OTA-628 — the CLIMB button's red/green tone + no-stamina haptic are driven by
// climbBlockReason, which must mirror the engine's climb refusal order exactly:
//   no rope  → 'no_rope'    (red, no buzz)
//   stamina  → 'no_stamina' (red, BUZZ)   [checked BEFORE the rope snap]
//   frayed   → 'frayed_rope'(red, no buzz)
//   else     → null (green)

import { climbBlockReason, climbStaminaCost, ROPE_WEAR_PER_TIER } from '../app/engine/climbReadiness';

const base = {
  hasClimbable: true,
  hasGate: true,
  hasReclaimersRope: false,
  wearsClimbStrap: false,
  stamina: 10,
  activeRopeDurability: 50,
};

describe('OTA-628 — climbBlockReason', () => {
  it('nothing climbable → null (neutral, not blocked)', () => {
    expect(climbBlockReason({ ...base, hasClimbable: false })).toBeNull();
  });

  it('no climb-gate item → no_rope', () => {
    expect(climbBlockReason({ ...base, hasGate: false })).toBe('no_rope');
  });

  it('plain rope, stamina below the per-tier cost (2) → no_stamina', () => {
    expect(climbBlockReason({ ...base, stamina: 1 })).toBe('no_stamina');
    expect(climbBlockReason({ ...base, stamina: 0 })).toBe('no_stamina');
  });

  it("Reclaimer's Rope halves the cost to 1 — stamina 1 is enough, stamina 0 is not", () => {
    expect(climbBlockReason({ ...base, hasReclaimersRope: true, stamina: 1 })).toBeNull();
    expect(climbBlockReason({ ...base, hasReclaimersRope: true, stamina: 0 })).toBe('no_stamina');
  });

  it('Hardened Climbing Strap → cost 1 (as cheap as a Reclaimer\'s Rope) — stamina 1 is enough, 0 is not', () => {
    expect(climbBlockReason({ ...base, wearsClimbStrap: true, stamina: 1 })).toBeNull();
    expect(climbBlockReason({ ...base, wearsClimbStrap: true, stamina: 0 })).toBe('no_stamina');
  });

  // OTA-779 — a rope is usable down to its LAST point. Only a SPENT rope
  // (durability ≤ 0) blocks; a low-but-usable rope is green (it climbs and
  // breaks gracefully at 0, with a fraying warning first). Was ≤ wear-per-tier
  // (15), which stranded a whole climb and read red while the rope could pull.
  it('rope SPENT (≤ 0) → frayed_rope; any positive durability → green', () => {
    expect(climbBlockReason({ ...base, activeRopeDurability: 0 })).toBe('frayed_rope');
    expect(climbBlockReason({ ...base, activeRopeDurability: 1 })).toBeNull();
    expect(climbBlockReason({ ...base, activeRopeDurability: ROPE_WEAR_PER_TIER })).toBeNull();
    expect(climbBlockReason({ ...base, activeRopeDurability: ROPE_WEAR_PER_TIER + 1 })).toBeNull();
  });

  it('stamina is checked BEFORE the frayed rope — empty tank + spent rope reads as no_stamina', () => {
    expect(
      climbBlockReason({ ...base, stamina: 0, activeRopeDurability: 0 }),
    ).toBe('no_stamina');
  });

  it('gate via treads/strap with no rope instance (durability null) → not frayed', () => {
    expect(climbBlockReason({ ...base, activeRopeDurability: null })).toBeNull();
  });

  it('all clear → null (green)', () => {
    expect(climbBlockReason(base)).toBeNull();
  });

  it('climbStaminaCost matches the engine ladder', () => {
    expect(climbStaminaCost(false, false)).toBe(2);
    expect(climbStaminaCost(true, false)).toBe(1);
    expect(climbStaminaCost(false, true)).toBe(1); // worn strap: 1 stamina/tier, not free
    expect(climbStaminaCost(true, true)).toBe(1); // strap + Reclaimer's both land at 1
  });
});
