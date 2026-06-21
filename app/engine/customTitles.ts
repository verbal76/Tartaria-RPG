// customTitles — engine_Dev IMPORTABLE TITLES.
//
// The built-in titles (titles.ts) are a hard-coded counter model. This module
// makes titles DATA-DRIVEN: a re-skin uploads an array of titles, each one tied to
// a TRACKABLE VARIABLE and a threshold ("name a title, pick a variable, set the
// number to reach"). The dev console lists the trackable variables so they can be
// built with a checkbox + a name + a threshold, or authored as JSON wholesale.
//
// A custom title is earned the instant the player's tracked variable reaches its
// threshold; the engine announces it and stores it on player.earnedTitles by its
// custom id. Optional flat stat perk applies while earned.

import type { PlayerCharacter } from './types';
import { getCustomTitles } from './contentPack';

/** A variable the engine can read off the live player for title thresholds. The
 *  list is intentionally UNIVERSAL — these increment from generic play regardless
 *  of setting, so an author can build achievements without engine changes. */
export interface TrackableVar {
  id: string;
  label: string;
  get: (p: PlayerCharacter) => number;
}

const ms = (p: PlayerCharacter) => p.milestones ?? { enemiesDefeated: 0, travelsCompleted: 0, checksSucceeded: 0 };
const tp = (p: PlayerCharacter) => (p.titleProgress ?? {}) as unknown as Record<string, number>;

export const TRACKABLE_VARS: readonly TrackableVar[] = [
  // ── lifetime milestones (increment from generic play) ──────────────────
  { id: 'enemiesDefeated', label: 'Enemies defeated (lifetime kills)', get: (p) => ms(p).enemiesDefeated ?? 0 },
  { id: 'travelsCompleted', label: 'Journeys completed (arrivals)', get: (p) => ms(p).travelsCompleted ?? 0 },
  { id: 'checksSucceeded', label: 'Skill checks passed', get: (p) => ms(p).checksSucceeded ?? 0 },
  // ── economy / condition ────────────────────────────────────────────────
  { id: 'tc', label: 'Currency held (TC)', get: (p) => p.tc ?? 0 },
  { id: 'corruption', label: 'Corruption level', get: (p) => p.corruption ?? 0 },
  { id: 'hpMax', label: 'Max HP', get: (p) => p.hpMax ?? 0 },
  { id: 'staminaMax', label: 'Max stamina', get: (p) => p.staminaMax ?? 0 },
  { id: 'inventoryCount', label: 'Items carried (total)', get: (p) => (p.inventory ?? []).reduce((n, it) => n + (it.quantity ?? 1), 0) },
  // ── attributes ─────────────────────────────────────────────────────────
  { id: 'strength', label: 'Strength', get: (p) => p.stats?.strength ?? 0 },
  { id: 'dexterity', label: 'Dexterity', get: (p) => p.stats?.dexterity ?? 0 },
  { id: 'intelligence', label: 'Intelligence', get: (p) => p.stats?.intelligence ?? 0 },
  { id: 'wisdom', label: 'Wisdom', get: (p) => p.stats?.wisdom ?? 0 },
  { id: 'charisma', label: 'Charisma', get: (p) => p.stats?.charisma ?? 0 },
  { id: 'stealth', label: 'Stealth', get: (p) => p.stats?.stealth ?? 0 },
  // ── activity counters (titleProgress — fire from generic actions) ───────
  { id: 'relicsFound', label: 'Relics / rare items found', get: (p) => tp(p).relicsFound ?? 0 },
  { id: 'relicsTraded', label: 'Relics sold to vendors', get: (p) => tp(p).relicsTraded ?? 0 },
  { id: 'fusionsCompleted', label: 'Fusions completed', get: (p) => tp(p).fusionsCompleted ?? 0 },
  { id: 'repairsCompleted', label: 'Items repaired', get: (p) => tp(p).repairsCompleted ?? 0 },
  { id: 'loreRead', label: 'Lore / collectibles read', get: (p) => tp(p).loreRead ?? 0 },
  { id: 'stormsSurvived', label: 'Hazard storms survived', get: (p) => tp(p).stormsSurvived ?? 0 },
  { id: 'sentinelsDefeated', label: 'Construct-type enemies defeated', get: (p) => tp(p).sentinelsDefeated ?? 0 },
];

const TRACKABLE_BY_ID: ReadonlyMap<string, TrackableVar> = new Map(TRACKABLE_VARS.map((v) => [v.id, v]));

/** Read a tracked variable's current value off the player (0 when unknown). */
export function getTrackedValue(player: PlayerCharacter, varId: string): number {
  const v = TRACKABLE_BY_ID.get(varId);
  return v ? v.get(player) : 0;
}

/** An uploaded title definition. */
export interface CustomTitle {
  /** Stable id stored on earnedTitles. */
  id: string;
  /** Display name shown to the player ("Veteran of the Fold"). */
  name: string;
  /** Flavor / the line announced and shown on the Character screen. */
  description?: string;
  /** Trackable variable id (one of TRACKABLE_VARS). */
  track: string;
  /** Value of `track` at/above which the title is earned. */
  threshold: number;
  /** Optional always-on flat attribute bonus while the title is held. */
  perk?: { stat?: string; amount?: number };
}

function isValidTitle(t: unknown): t is CustomTitle {
  if (!t || typeof t !== 'object') return false;
  const c = t as Record<string, unknown>;
  return typeof c.id === 'string' && c.id.length > 0
    && typeof c.name === 'string' && c.name.length > 0
    && typeof c.track === 'string' && TRACKABLE_BY_ID.has(c.track)
    && typeof c.threshold === 'number';
}

/** The live custom titles (uploaded override), filtered to valid entries. */
export function liveCustomTitles(): CustomTitle[] {
  const raw = getCustomTitles();
  if (!Array.isArray(raw)) return [];
  return raw.filter(isValidTitle);
}

/** Custom title ids the player meets the threshold for RIGHT NOW. */
export function evaluateCustomTitles(player: PlayerCharacter): string[] {
  return liveCustomTitles()
    .filter((t) => getTrackedValue(player, t.track) >= t.threshold)
    .map((t) => t.id);
}

/** Newly-earned custom titles (met now, not already on earnedTitles). */
export function newlyEarnedCustomTitles(player: PlayerCharacter): CustomTitle[] {
  const already = new Set(player.earnedTitles ?? []);
  return liveCustomTitles().filter(
    (t) => !already.has(t.id) && getTrackedValue(player, t.track) >= t.threshold,
  );
}

/** Display name for a title id when it's a custom one (else null). */
export function customTitleName(id: string): string | null {
  return liveCustomTitles().find((t) => t.id === id)?.name ?? null;
}

/** Aggregate flat attribute bonuses from earned custom titles. */
export function customTitleStatBonuses(player: PlayerCharacter): Record<string, number> {
  const earned = new Set(player.earnedTitles ?? []);
  const out: Record<string, number> = {};
  for (const t of liveCustomTitles()) {
    if (!earned.has(t.id) || !t.perk?.stat || !t.perk.amount) continue;
    out[t.perk.stat] = (out[t.perk.stat] ?? 0) + t.perk.amount;
  }
  return out;
}
