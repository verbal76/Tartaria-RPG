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
// eslint-disable-next-line @typescript-eslint/no-require-imports
import arbiterTitlesData from '../data/lore/arbiter-titles.json';
import { TITLE_PASSIVE_PERK } from './titles';

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

// ── Built-in title customization ─────────────────────────────────────────────
// engine_Dev — the 20 built-in earnable titles (exploring/killing/etc.) carry their
// EARNING logic in titles.ts (predicates + perks) but their DISPLAY (name / requirement
// text / perk text) lives in arbiter-titles.json. An author who uploads a titles JSON can
// now AMEND any built-in title: include an entry whose `id` matches a built-in id, and its
// `name` / `requirement` / `description` re-skin that title WITHOUT changing when/how it's
// earned ("fully customizable if wanted"). Entries with a NEW id + track/threshold remain
// new data-driven achievements (liveCustomTitles, unchanged). So an upload now MERGES with
// the built-ins rather than replacing them.

/** One title row as the Character / titles UI renders it. */
export interface TitleRosterEntry {
  id: string;
  /** Earned-state name shown to the player. */
  title: string;
  /** Locked-state line (what to do to earn it). */
  requirement: string;
  /** Earned-state line (the passive effect / flavor). */
  perk: string;
  /** True for the 20 engine titles; false for author-added achievements. */
  builtin: boolean;
}

const BUILTIN_TITLES = (arbiterTitlesData as {
  titles: Array<{ id: string; title: string; requirement: string; perk: string }>;
}).titles;
const BUILTIN_TITLE_IDS: ReadonlySet<string> = new Set(BUILTIN_TITLES.map((t) => t.id));

/** True when an id names one of the 20 built-in earnable titles (so an uploaded entry with
 *  this id is a DISPLAY override, valid without a track/threshold). */
export function isBuiltinTitleId(id: string): boolean {
  return BUILTIN_TITLE_IDS.has(id);
}

/** Find a raw uploaded entry by id (no track/threshold requirement — built-in
 *  overrides only need the display fields the author wants to change). */
function findUploadedTitle(id: string): Record<string, unknown> | null {
  const raw = getCustomTitles();
  if (!Array.isArray(raw)) return null;
  const hit = raw.find((t) => t && typeof t === 'object' && (t as Record<string, unknown>).id === id);
  return (hit as Record<string, unknown>) ?? null;
}

const strField = (o: Record<string, unknown> | null, key: string): string | null => {
  const v = o?.[key];
  return typeof v === 'string' && v.trim() ? v.trim() : null;
};

/** Display (earned-state name + perk text) for a built-in title id, with any author
 *  override applied. Used by the earn announcement. Falls back to the honest passive
 *  text (TITLE_PASSIVE_PERK) then the arbiter-titles.json perk string. */
export function builtinTitleDisplay(id: string): { title: string; perk: string } {
  const base = BUILTIN_TITLES.find((t) => t.id === id);
  const ov = findUploadedTitle(id);
  const title = strField(ov, 'name') ?? base?.title ?? id;
  const perk = strField(ov, 'description')
    ?? (TITLE_PASSIVE_PERK as Record<string, string>)[id]
    ?? base?.perk
    ?? '';
  return { title, perk };
}

/** The full title roster the Character screen renders: every built-in title (with author
 *  overrides applied) PLUS any author-added data-driven titles. Replaces the old either/or
 *  that hid the built-ins whenever a custom set was uploaded. */
export function resolveTitleRoster(): TitleRosterEntry[] {
  const out: TitleRosterEntry[] = BUILTIN_TITLES.map((t) => {
    const ov = findUploadedTitle(t.id);
    return {
      id: t.id,
      title: strField(ov, 'name') ?? t.title,
      requirement: strField(ov, 'requirement') ?? t.requirement,
      perk: strField(ov, 'description') ?? (TITLE_PASSIVE_PERK as Record<string, string>)[t.id] ?? t.perk,
      builtin: true,
    };
  });
  // Author-added achievements: uploaded valid titles whose id ISN'T a built-in.
  for (const t of liveCustomTitles()) {
    if (BUILTIN_TITLE_IDS.has(t.id)) continue;
    const v = TRACKABLE_BY_ID.get(t.track);
    out.push({
      id: t.id,
      title: t.name,
      requirement: `${v?.label ?? t.track} ≥ ${t.threshold}`,
      perk: t.description?.trim() || '◆ earned',
      builtin: false,
    });
  }
  return out;
}
