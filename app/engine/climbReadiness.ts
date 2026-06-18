// Climb-readiness — pure helper that mirrors the engine's climb refusal order
// (gameStore climb handler) so the CLIMB button's colour + haptics can never
// disagree with what actually happens when you climb.
//
// Refusal order MUST match the engine (on the ground / not elevated):
//   1. no climb-gate item at all          → 'no_rope'    (red, no buzz)
//   2. stamina < per-tier climb cost       → 'no_stamina' (red, BUZZ)
//   3. active rope worn to ≤ wear-per-tier  → 'frayed_rope' (red, no buzz)
//   else                                    → null (ready / green)
//
// The engine checks stamina BEFORE the rope-snap, so a frayed rope + empty tank
// reads as 'no_stamina' (rest first) — same as the engine's "rest first" refusal.

/** Wear consumed per climbed tier. Kept in sync with ROPE_WEAR_PER_TIER in the
 *  gameStore climb handler — a rope at/below this can't survive the next tier. */
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
  /** Is a Hardened Climbing Strap worn (climbing costs 0 stamina)? */
  wearsClimbStrap: boolean;
  /** Current stamina. */
  stamina: number;
  /** Current durability of the active rope instance the engine would wear/snap
   *  (highest-durability Reclaimer's Rope if held, else Climbing Rope), or null
   *  when no such rope instance exists (e.g. the gate is treads/straps only). */
  activeRopeDurability: number | null;
}

/** Per-tier stamina cost, mirroring gameStore: strap → 0, Reclaimer's → 1, else 2. */
export function climbStaminaCost(hasReclaimersRope: boolean, wearsClimbStrap: boolean): number {
  if (wearsClimbStrap) return 0;
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
  if (inp.activeRopeDurability != null && inp.activeRopeDurability <= ROPE_WEAR_PER_TIER) {
    return 'frayed_rope';                    // engine OTA-625: "too frayed"
  }
  return null;                               // ready
}
