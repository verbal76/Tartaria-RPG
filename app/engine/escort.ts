// Escort-contract mechanic — "a real escort mission."
//
// An escort faction quest spawns 2-3 same-faction low-level NPC escortees on
// accept. They live on the active-quest record (`escortees`), show under the
// player's name in the HUD, and take REAL combat damage every round an enemy
// connects. If any escortee's hp reaches 0 the escort quest FAILS; delivering
// the party (any survivor) to the destination completes it.
//
// Everything here is content-agnostic: escortee names come from
// data/escortNames.json or a pack's `flavor.escortNames`, never hardcoded to a
// setting. Detection is by an explicit `escort` field on the quest OR an
// `_escort` id suffix, so authored packs opt in without re-writing every quest.

import type { Escortee } from './types';
import type { FactionQuestDef } from './factionQuests';
import { resolveFlavor } from './contentPack';
import escortNamesData from '../data/escortNames.json';

const DEFAULT_ESCORT_NAMES: string[] = (escortNamesData as { names: string[] }).names;

/** Chance, per enemy hit that connects, that a given living escortee gets caught
 *  in the exchange and takes damage. Tuned so a 2-3 turn fight rarely kills an
 *  escortee outright but a drawn-out brawl genuinely threatens them. */
export const ESCORT_HIT_CHANCE = 0.35;

/** Resolve the escort spec for a quest, or null if it isn't an escort contract.
 *  Explicit `escort` field wins; otherwise an `_escort` id suffix opts in with
 *  defaults (matches the bundled Philadelphia faction-quest ids). */
export function escortSpecForQuest(def: FactionQuestDef | null | undefined): { count: number } | null {
  if (!def) return null;
  if (def.escort) {
    const c = def.escort.count;
    return { count: clampCount(typeof c === 'number' ? c : randomPartySize()) };
  }
  if (/_escort$/.test(def.id)) return { count: randomPartySize() };
  return null;
}

export function isEscortQuest(def: FactionQuestDef | null | undefined): boolean {
  return escortSpecForQuest(def) != null;
}

function randomPartySize(): number {
  // "two or three random low-level characters."
  return Math.random() < 0.5 ? 2 : 3;
}

function clampCount(n: number): number {
  return Math.max(1, Math.min(5, Math.round(n)));
}

/** Per-escortee max HP. Derived from the player's own max HP so escortees scale
 *  with progression but stay clearly squishier than the player (~35%, floored so
 *  early-game escortees aren't one-shot, capped so they don't become tanks). */
export function escorteeMaxHp(playerHpMax: number): number {
  const base = Math.round((playerHpMax || 20) * 0.35);
  // ±3 jitter so the party members aren't identical.
  const jitter = Math.floor(Math.random() * 7) - 3;
  return Math.max(8, Math.min(45, base + jitter));
}

/** Build a fresh escort party for an accepted quest. Names are drawn without
 *  repetition from the active pack's escort-name pool. */
export function spawnEscortees(count: number, playerHpMax: number, acceptedAt: number): Escortee[] {
  const pool = escortNamePool();
  const chosen = pickDistinct(pool, count);
  const party: Escortee[] = [];
  for (let i = 0; i < count; i++) {
    const hpMax = escorteeMaxHp(playerHpMax);
    party.push({
      id: `esc_${acceptedAt}_${i}`,
      name: chosen[i] ?? `Escortee ${i + 1}`,
      hp: hpMax,
      hpMax,
    });
  }
  return party;
}

function escortNamePool(): string[] {
  const override = resolveFlavor<string[]>('escortNames', DEFAULT_ESCORT_NAMES);
  const pool = Array.isArray(override) && override.length > 0 ? override : DEFAULT_ESCORT_NAMES;
  return pool.filter((n) => typeof n === 'string' && n.trim().length > 0);
}

function pickDistinct(pool: string[], n: number): string[] {
  const copy = [...pool];
  const out: string[] = [];
  for (let i = 0; i < n && copy.length > 0; i++) {
    const idx = Math.floor(Math.random() * copy.length);
    out.push(copy.splice(idx, 1)[0]!);
  }
  return out;
}

/** All living escortees across every active escort quest, flattened for the HUD. */
export function livingEscortees(
  active: readonly { id: string; escortees?: Escortee[] }[] | undefined,
): Escortee[] {
  if (!active) return [];
  const out: Escortee[] = [];
  for (const q of active) {
    for (const e of q.escortees ?? []) {
      if (e.hp > 0) out.push(e);
    }
  }
  return out;
}
