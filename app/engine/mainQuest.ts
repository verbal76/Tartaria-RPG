// engine_Dev — the built-in (Tartaria) "Mud Flood Nexus" main quest was REMOVED.
//
// This is an RPG engine, not a Tartaria game: a main quest is authored as data
// (see customMainQuest.ts / customMainQuestEngine.ts) and surfaced through the
// data-driven Primary Objective card. The legacy hardcoded phase machine, Core
// Guardians, faction gate verbs, ending cinematics, and all their Tartaria prose
// have been deleted.
//
// What remains here is intentionally tiny:
//   • the `player.mainQuest` field helpers (initMainQuest / ensureMainQuest), kept
//     so the vestigial state object on every PlayerCharacter stays well-formed for
//     saves, titles, and the buried-skyscraper gate; and
//   • LOST_CAPITAL_LOCATIONS — the reference game's named capitals, used by worldgen
//     to guarantee a named-vendor greeting on arrival. These are lower-case content
//     ids; a re-skin's own locations simply won't match, so the guarantee degrades
//     gracefully to the ordinary roadside-trader roll.

import type { MainQuestState } from './types';

/** The reference game's nine named capitals. Worldgen always greets the arriving
 *  player with a named vendor at one of these (see beginScene's atCoreCapital). */
export const LOST_CAPITAL_LOCATIONS: readonly string[] = [
  'asgardar',
  'samarran',
  'nimari',
  'drakova',
  'voronov',
  'karok_sa',
  'yuldra_tul',
  'ostragar',
  'iskan_veil',
] as const;

/** Initial (vestigial) main-quest state for a fresh character. */
export function initMainQuest(): MainQuestState {
  return { phase: 'hook', coresRecovered: [] };
}

/** Backfill helper for legacy saves — guarantees a well-formed state object. */
export function ensureMainQuest(mq: MainQuestState | undefined): MainQuestState {
  if (mq && typeof mq.phase === 'string') return mq;
  return initMainQuest();
}
