// customMainQuestEngine — runtime execution for the data-driven main quest.
//
// Turns an uploaded { title, steps } + bosses into a playable loop:
//   - boss spawning: the active "kill" step injects its boss at the step's location
//   - kill detection: defeating that boss advances the step (its loot already
//     carries the quest item, so the player picks up the dog tags normally)
//   - location steps: reach / return_to / claim advance on arrival; hand_in checks
//     the player is carrying the quest items collected so far
//   - win: reaching past the last step (a "claim") completes the quest

import type { PlayerCharacter, Enemy } from './types';
import { liveMainQuest, describeStep, type MainQuestStep } from './customMainQuest';
import { bossById, bossAtLocation, bossToEnemy } from './customBosses';

export function questStepIndex(p: PlayerCharacter): number { return p.customQuestStep ?? 0; }

/** engine_Dev — does this step apply to the player's FACTION? A step is skipped when
 *  the player's faction is in `skipForFactions` (e.g. a German player never gets the
 *  kill-the-German-boss step), or when `onlyForFactions` is set and excludes them.
 *  Steps with no gate apply to everyone. */
export function stepApplies(step: MainQuestStep, p: PlayerCharacter): boolean {
  const f = (p.factionId ?? '').toLowerCase();
  const only = (step.onlyForFactions ?? []).map((x) => String(x).toLowerCase());
  if (only.length > 0 && !only.includes(f)) return false;
  const skip = (step.skipForFactions ?? []).map((x) => String(x).toLowerCase());
  if (skip.includes(f)) return false;
  return true;
}

/** The first index >= `from` whose step applies to this player (skipping gated-out
 *  steps), or steps.length when none remain. */
function nextApplicableIndex(steps: MainQuestStep[], from: number, p: PlayerCharacter): number {
  let i = Math.max(0, from);
  while (i < steps.length && !stepApplies(steps[i]!, p)) i++;
  return i;
}

/** The EFFECTIVE current step index — the stored index advanced past any steps gated
 *  out for the player's faction. All the readers below key off this so gated steps
 *  are invisible to the player (never spawn, never gate a hand-in). */
export function effectiveStepIndex(p: PlayerCharacter): number {
  const q = liveMainQuest();
  if (!q) return 0;
  return nextApplicableIndex(q.steps, questStepIndex(p), p);
}

export function activeQuestStep(p: PlayerCharacter): MainQuestStep | null {
  const q = liveMainQuest();
  if (!q) return null;
  return q.steps[effectiveStepIndex(p)] ?? null;
}

export function questIsComplete(p: PlayerCharacter): boolean {
  const q = liveMainQuest();
  return !!q && effectiveStepIndex(p) >= q.steps.length;
}

/** The boss the active KILL step wants at this location, if any. */
export function questBossAt(p: PlayerCharacter, locationId: string): ReturnType<typeof bossById> {
  const step = activeQuestStep(p);
  if (!step || step.action !== 'kill') return null;
  if (step.locationId && step.locationId !== locationId) return null;
  return step.bossId ? bossById(step.bossId) : bossAtLocation(locationId);
}

/** The active kill-step boss as an Enemy ready to drop into a scene (null when the
 *  step isn't a kill here, or the boss is already on the field / defeated). */
export function questBossEnemyAt(p: PlayerCharacter, locationId: string): Enemy | null {
  const b = questBossAt(p, locationId);
  return b ? (bossToEnemy(b) as unknown as Enemy) : null;
}

/** Was the defeated enemy the active kill-step boss? */
export function isActiveQuestBoss(p: PlayerCharacter, enemyName: string): boolean {
  const b = questBossAt(p, p.currentLocationId);
  return !!b && b.name.trim().toLowerCase() === enemyName.trim().toLowerCase();
}

export interface QuestAdvance {
  /** New current-step index to store on the player. */
  nextStep: number;
  /** Player-facing log line. */
  line: string;
  /** True when this advance completed the whole quest. */
  won: boolean;
}

/** Advance to the next step. Returns the new index + a line, or null if no quest /
 *  already done. `won` is true when the quest is now finished. */
export function advanceQuest(p: PlayerCharacter): QuestAdvance | null {
  const q = liveMainQuest();
  if (!q) return null;
  const cur = effectiveStepIndex(p);
  if (cur >= q.steps.length) return null;
  // Advance to the next step that APPLIES to this player's faction (skip gated ones).
  const next = nextApplicableIndex(q.steps, cur + 1, p);
  const won = next >= q.steps.length;
  if (won) {
    return { nextStep: next, line: `★ MAIN QUEST COMPLETE — ${q.title ?? 'your quest'} is won. You are sent home.`, won: true };
  }
  return { nextStep: next, line: `★ Objective complete. Next: ${describeStep(q.steps[next]!)}`, won: false };
}

/** The quest items the player should be carrying by now (rewards from completed,
 *  APPLICABLE kill/collect steps) — used to gate a hand_in step. Rewards from steps
 *  skipped for the player's faction are never required. */
export function questItemsSoFar(p: PlayerCharacter): string[] {
  const q = liveMainQuest();
  if (!q) return [];
  return q.steps.slice(0, effectiveStepIndex(p))
    .filter((s) => stepApplies(s, p))
    .map((s) => (s.reward ?? '').trim())
    .filter((r): r is string => r.length > 0);
}

/** Can the active LOCATION step (reach / return_to / claim / hand_in) be completed
 *  by being here now? `ownsItem` checks the player's inventory by name. */
export function locationStepSatisfied(
  p: PlayerCharacter,
  locationId: string,
  ownsItem: (name: string) => boolean,
): boolean {
  const step = activeQuestStep(p);
  if (!step) return false;
  if (step.locationId && step.locationId !== locationId) return false;
  switch (step.action) {
    case 'reach':
    case 'return_to':
    case 'claim':
      return true;
    case 'hand_in': {
      const needed = questItemsSoFar(p);
      return needed.length === 0 || needed.every((n) => ownsItem(n));
    }
    default:
      return false; // kill / collect / talk_to / deliver handled elsewhere
  }
}

/** Current objective line for the HUD / log. */
export function currentObjectiveLine(p: PlayerCharacter): string | null {
  const step = activeQuestStep(p);
  return step ? describeStep(step) : null;
}
