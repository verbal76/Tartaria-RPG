// customMainQuest — engine_Dev DATA-DRIVEN MAIN QUEST.
//
// A main quest is an ordered list of objective STEPS, each composed from a small
// vocabulary of actions + a target + a location (+ an optional reward to collect).
// The dev console builds it line-by-line ("I want the player to {kill} a {boss} at
// {location} and collect {dog tags}, then {return to} {location}"). This module is
// the data model + the action vocabulary the dropdowns read + a natural-language
// preview. In-game execution wiring is layered on separately.

import type { Location } from './types';
import { resolveTable, getCustomMainQuest } from './contentPack';
import locationsData from '../data/locations/locations.json';

/** One objective in the main quest. */
export interface MainQuestStep {
  id: string;
  /** One of MAIN_QUEST_ACTIONS' ids. */
  action: string;
  /** What the action acts on — a boss/enemy name, an item, an npc. Free text;
   *  some actions (reach/return/clear) ignore it and use the location itself. */
  target?: string;
  /** Where the step happens — a Locations-table id. */
  locationId?: string;
  /** Optional item to collect after the step completes ("...and collect dog tags"). */
  reward?: string;
}

export interface MainQuestDef {
  title?: string;
  steps: MainQuestStep[];
}

/** The action vocabulary the builder's first dropdown offers. `needsTarget`
 *  decides whether the target field applies; `phrase` renders the preview. */
export interface MainQuestAction {
  id: string;
  label: string;
  needsTarget: boolean;
  phrase: (s: MainQuestStep, locName: string) => string;
}

const tgt = (s: MainQuestStep) => (s.target && s.target.trim() ? s.target.trim() : 'the objective');

export const MAIN_QUEST_ACTIONS: readonly MainQuestAction[] = [
  { id: 'kill', label: 'Kill', needsTarget: true, phrase: (s, l) => `Kill ${tgt(s)} at ${l}` },
  { id: 'clear', label: 'Clear all enemies at', needsTarget: false, phrase: (_s, l) => `Clear all enemies at ${l}` },
  { id: 'reach', label: 'Reach / enter', needsTarget: false, phrase: (_s, l) => `Reach ${l}` },
  { id: 'collect', label: 'Collect', needsTarget: true, phrase: (s, l) => `Collect ${tgt(s)} at ${l}` },
  { id: 'talk_to', label: 'Talk to', needsTarget: true, phrase: (s, l) => `Talk to ${tgt(s)} at ${l}` },
  { id: 'deliver', label: 'Deliver', needsTarget: true, phrase: (s, l) => `Deliver ${tgt(s)} to ${l}` },
  { id: 'return_to', label: 'Return to', needsTarget: false, phrase: (_s, l) => `Return to ${l}` },
];

const ACTION_BY_ID: ReadonlyMap<string, MainQuestAction> = new Map(MAIN_QUEST_ACTIONS.map((a) => [a.id, a]));

/** Live locations for the location dropdown (resolves an uploaded override). */
export function mainQuestLocations(): Array<{ id: string; name: string }> {
  const rows = resolveTable('locations', locationsData as Location[]) as Location[];
  return rows.filter((l) => l && l.id).map((l) => ({ id: l.id, name: l.name ?? l.id }));
}

function locName(locationId?: string): string {
  if (!locationId) return 'a location';
  return mainQuestLocations().find((l) => l.id === locationId)?.name ?? locationId;
}

/** Render one step as a readable line. */
export function describeStep(s: MainQuestStep): string {
  const a = ACTION_BY_ID.get(s.action);
  const base = a ? a.phrase(s, locName(s.locationId)) : `${s.action} ${tgt(s)} at ${locName(s.locationId)}`;
  return s.reward && s.reward.trim() ? `${base}, and collect ${s.reward.trim()}` : base;
}

/** Render the whole quest as a numbered objective list (preview / log). */
export function describeMainQuest(q: MainQuestDef): string[] {
  return (q.steps ?? []).map((s, i) => `${i + 1}. ${describeStep(s)}`);
}

/** The live uploaded main quest, validated, or null. */
export function liveMainQuest(): MainQuestDef | null {
  const q = getCustomMainQuest();
  if (!q || !Array.isArray(q.steps) || q.steps.length === 0) return null;
  const steps = (q.steps as MainQuestStep[]).filter((s) => s && typeof s === 'object' && typeof s.action === 'string');
  return steps.length > 0 ? { title: typeof q.title === 'string' ? q.title : undefined, steps } : null;
}
