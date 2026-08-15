// Climb-readiness — pure helper that mirrors the engine's climb refusal order
// (gameStore climb handler) so the CLIMB button's colour + haptics can never
// disagree with what actually happens when you climb.
//
// Refusal order MUST match the engine (on the ground / not elevated):
//   1. no climb-gate item at all          → 'no_rope'    (red, no buzz)
//   2. stamina < per-tier climb cost       → 'no_stamina' (red, BUZZ)
//   3. active rope SPENT (durability ≤ 0)   → 'frayed_rope' (red, no buzz)
//   else                                    → null (ready / green)
//
// The engine checks stamina BEFORE the rope-snap, so a spent rope + empty tank
// reads as 'no_stamina' (rest first) — same as the engine's "rest first" refusal.
//
// OTA-779 — the rope is usable down to its LAST point: the button stays GREEN
// while the rope has any durability (a low rope climbs and breaks gracefully at
// 0, with a fraying warning first). Only a spent rope (≤ 0) blocks. Was ≤ 15
// (one climb's wear), which stranded a whole climb and read the button red while
// the rope could still take a pull.

/** Wear consumed per climbed tier. Kept in sync with ROPE_WEAR_PER_TIER in the
 *  gameStore climb handler — also the fraying-warning threshold (a rope at/below
 *  this has roughly one climb left before it breaks). */
export const ROPE_WEAR_PER_TIER = 15;

export type ClimbBlockReason = 'no_rope' | 'no_stamina' | 'frayed_rope' | null;

export interface ClimbReadinessInputs {
  /** Is there at least one not-yet-cleared climbable in the scene? */
  hasClimbable: boolean;
  /** inventoryHasGate(..., 'climb_steep') — any item that unlocks steep climbs
   *  (rope, treads, straps, grippers, …). */
  hasGate: boolean;
  /** Does the pack hold a Reclaimer's Rope (halves the per-tier stamina cost)? */
  hasReclaimersRope: boolean;
  /** Is a Hardened Climbing Strap worn (climbing costs 1 stamina — as cheap as a
   *  Reclaimer's Rope, and it never wears out or snaps)? */
  wearsClimbStrap: boolean;
  /** Current stamina. */
  stamina: number;
  /** Current durability of the active rope instance the engine would wear/snap
   *  (highest-durability Reclaimer's Rope if held, else Climbing Rope), or null
   *  when no such rope instance exists (e.g. the gate is treads/straps only). */
  activeRopeDurability: number | null;
}

/** Per-tier stamina cost, mirroring gameStore: strap → 1, Reclaimer's → 1, else 2.
 *  The worn strap is the cheapest climb at 1 stamina/tier (tied with the
 *  Reclaimer's Rope) AND never wears out or snaps — but it's no longer free. */
export function climbStaminaCost(hasReclaimersRope: boolean, wearsClimbStrap: boolean): number {
  if (wearsClimbStrap) return 1;
  return hasReclaimersRope ? 1 : 2;
}

/**
 * Why the CLIMB button can't currently climb (or null if it can / nothing to
 * climb). null also covers "nothing climbable here" — the button is neutral,
 * not blocked, in that case.
 */
export function climbBlockReason(inp: ClimbReadinessInputs): ClimbBlockReason {
  if (!inp.hasClimbable) return null;       // neutral — nothing to climb
  if (!inp.hasGate) return 'no_rope';        // engine: "Not without rope"
  const cost = climbStaminaCost(inp.hasReclaimersRope, inp.wearsClimbStrap);
  if (inp.stamina < cost) return 'no_stamina'; // engine: "rest first" (checked first)
  if (inp.activeRopeDurability != null && inp.activeRopeDurability <= 0) {
    return 'frayed_rope';                    // OTA-779: only a SPENT rope blocks
  }
  return null;                               // ready
}
