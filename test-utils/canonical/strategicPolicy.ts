// Strategic repair — Phase 12 (owner-authorized, following the read-only
// Life 4 postmortem + equipment/build-intelligence audit).
//
// This module is a NEW, ADDITIVE sibling to policy.ts — it does not modify
// policy.ts's decide() in any way, and the qualified in-combat contextual
// reasoning (Phase 7/8/11 branches) remains byte-identical. Per the owner's
// explicit architecture instruction (§21): "Strategic improvements should
// sit primarily between encounters... If any implementation necessarily
// touches a qualified in-combat file/path, identify that explicitly." This
// repair does NOT touch policy.ts, combatLoop.ts, or guardianApproachOptions.ts
// — see the qualification receipt for the resulting (empty) Guardian-combat
// re-qualification requirement.
//
// decideBetweenEncounters() is called ONLY outside active combat (the same
// boundary the old driver's travelTo()/leg-arrival logic already respected).
// It adds exactly two NEW gates — deliberate HP-aware recovery (§4 of the
// owner's spec) and deliberate retreat-on-a-bad-trip (§5) — and delegates
// everything else, completely unchanged, to policy.ts's own decide(), so
// every already-proven priority (contextual combat is never reached here;
// route/journey/equip/buy/etc.) behaves exactly as it did before this
// repair when neither new gate fires.
//
// STRUCTURAL FIREWALL: imports only playerView's PlayerView type and
// policy's own exported types/decide() — never the store or telemetry.
// No RNG, no mutation. Every field on StrategicMemory below is built by the
// CALLER from this Tartarian's own observed production consequences this
// life (LEARNED_DURING_THIS_LIFE, the same category policy.ts's LifeMemory
// already uses) — never from a hidden future or another life.

import type { PlayerView } from './playerView';
import { decide, type DecisionOption, type Decision, type LifeMemory } from './policy';

export interface StrategicMemory {
  /** How many rests this Tartarian has taken in a row at the current stop
   *  without yet reaching the readiness threshold. Bounds "no infinite rest
   *  loop" (§4) — once this hits MAX_CONSECUTIVE_RESTS, resting here is no
   *  longer offered as the answer; retreat becomes the fallback instead. The
   *  caller resets this to 0 whenever a rest attempt is interrupted by a
   *  fresh encounter or whenever the Tartarian moves to a new stop. */
  consecutiveRestsThisStop: number;
  /** Whether the MOST RECENT rest attempt was ambushed — a real,
   *  player-visible production consequence (the caller reads it off the
   *  same production log/state a human sees when a rest is interrupted),
   *  never a hidden probability. null if no rest has been attempted yet at
   *  the current stop. */
  lastRestWasAmbushed: boolean | null;
  /** Count of severe-danger combat encounters (the caller's own definition
   *  — e.g. a big single-round HP loss, or a near-death) observed since
   *  this Tartarian last stood somewhere safe. The caller resets this to 0
   *  on reaching a hub/capital/other safe stop. */
  severeDangerEventsThisTrip: number;
}

export const EMPTY_STRATEGIC_MEMORY: StrategicMemory = {
  consecutiveRestsThisStop: 0,
  lastRestWasAmbushed: null,
  severeDangerEventsThisTrip: 0,
};

/** Below this HP ratio, a capable human traveling between fights considers
 *  resting even with no active threat on screen — deliberately not the same
 *  number as policy.ts's in-combat HEAL_CONSIDER_RATIO (0.4): the
 *  between-encounter decision is made with more information (no live enemy
 *  to react to) and a real player budgets recovery earlier rather than
 *  waiting for a fight to force the issue. */
const RECOVER_HP_RATIO = 0.5;
/** "Recovered enough to stop resting" — reuses policy.ts's own
 *  READY_HP_RATIO figure (0.85, isReadyForGuardian) so "ready" means the
 *  same thing everywhere in this apparatus rather than introducing a
 *  second, silently-different definition. */
const READY_HP_RATIO = 0.85;
/** Bounded — resting is never offered as the answer more than this many
 *  times in a row at the same stop; see StrategicMemory.consecutiveRestsThisStop. */
const MAX_CONSECUTIVE_RESTS = 3;
/** How many severe-danger encounters since last safety before a capable
 *  human concludes "this trip is going badly" and turns back. */
const SEVERE_DANGER_RETREAT_THRESHOLD = 2;

/**
 * Should this Tartarian rest right now, purely because it is hurt — not
 * because stamina ran out (the pre-existing stamina<25% trigger is
 * untouched and keeps firing independently in the caller's travel loop)?
 * Bounded: refuses once healthy, refuses after MAX_CONSECUTIVE_RESTS, and
 * refuses immediately after an observed rest ambush at this exact stop
 * (the risk a human would just have learned about firsthand).
 */
export function shouldRecoverBeforeContinuing(view: PlayerView, memory: StrategicMemory): { rest: boolean; reason: string } {
  if (view.hp / view.hpMax >= READY_HP_RATIO) {
    return { rest: false, reason: `HP ${view.hp}/${view.hpMax} is already at/above the readiness threshold — no reason to rest further.` };
  }
  if (memory.lastRestWasAmbushed === true) {
    return { rest: false, reason: 'The last rest attempt at this stop was ambushed — resting again here is not obviously safe; not reaching for it reflexively.' };
  }
  if (memory.consecutiveRestsThisStop >= MAX_CONSECUTIVE_RESTS) {
    return { rest: false, reason: `Already rested ${memory.consecutiveRestsThisStop} times in a row here without reaching readiness — resting further here is not working.` };
  }
  if (view.hp / view.hpMax < RECOVER_HP_RATIO) {
    return { rest: true, reason: `HP ${view.hp}/${view.hpMax} is low enough to be worth resting before continuing, even with no active threat on screen.` };
  }
  return { rest: false, reason: `HP ${view.hp}/${view.hpMax} is not low enough to justify resting yet.` };
}

/**
 * Should this Tartarian abandon the current destination and head somewhere
 * safe instead — a deliberate, BETWEEN-ENCOUNTER strategic choice, distinct
 * from policy.ts's in-combat 'survive-retreat' emergency floor (which stays
 * untouched and still fires from mid-fight, at any HP, exactly as before).
 * Fires on a genuine PATTERN of danger (repeated severe encounters, or
 * wilderness rest visibly failing to restore this Tartarian) — never on one
 * ordinary scrape.
 */
export function shouldRetreatToSafety(view: PlayerView, memory: StrategicMemory): { retreat: boolean; reason: string } {
  if (memory.severeDangerEventsThisTrip >= SEVERE_DANGER_RETREAT_THRESHOLD) {
    return {
      retreat: true,
      reason: `${memory.severeDangerEventsThisTrip} severe-danger encounter(s) since this Tartarian last stood somewhere safe — this trip is going badly; returning to safety rather than pressing on.`,
    };
  }
  if (view.hp / view.hpMax < RECOVER_HP_RATIO && memory.consecutiveRestsThisStop >= MAX_CONSECUTIVE_RESTS) {
    return {
      retreat: true,
      reason: `HP ${view.hp}/${view.hpMax} remains low after ${memory.consecutiveRestsThisStop} rest attempts at this stop — wilderness rest is not restoring this Tartarian; returning somewhere safe instead of resting again.`,
    };
  }
  return { retreat: false, reason: 'No pattern of severe or repeated danger justifies abandoning the current journey yet.' };
}

/**
 * The between-encounter decision wrapper — called ONLY outside active
 * combat. Checks the two new strategic gates first (retreat takes priority
 * over recovery: a trip already judged to be going badly should not spend
 * more time resting in the same dangerous place first); if neither fires,
 * or the option they'd need isn't actually on offer, delegates unchanged to
 * policy.ts's own decide(), so ordinary continue/route/equip/buy reasoning
 * is exactly what it was before this repair.
 */
export function decideBetweenEncounters(
  view: PlayerView,
  options: readonly DecisionOption[],
  memory: LifeMemory,
  strategic: StrategicMemory,
): Decision {
  const retreatCheck = shouldRetreatToSafety(view, strategic);
  const retreatOpt = options.find((o) => o.category === 'survive-retreat');
  if (retreatCheck.retreat && retreatOpt) {
    return { optionId: retreatOpt.id, category: 'survive-retreat', reason: retreatCheck.reason };
  }

  const restCheck = shouldRecoverBeforeContinuing(view, strategic);
  const restOpt = options.find((o) => o.id === 'rest');
  if (restCheck.rest && restOpt) {
    return { optionId: restOpt.id, category: restOpt.category, reason: restCheck.reason };
  }

  return decide(view, options, memory);
}
