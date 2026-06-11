// arb100 — plot OPEN contracts on the world atlas as distinct, numbered pins.
// Unlike the "?" markers (genuinely unknown/objective tiles, app/engine/
// questionMarkers.ts), a contract sits on an ALREADY-NAMED place — so it gets its
// own glyph (a diamond "◆", not "?") and its own number sequence. Markers are
// DERIVED from the player's live open contracts each render — nothing is persisted
// — so every contract that is open right now shows up automatically (no migration,
// no back-population step) and a marker clears the instant its contract closes.
//
// Contracts don't all carry a precise location, so each family resolves to the
// cleanest available anchor cell:
//   • LEADS          → the lead's own Location id (exact)
//   • HUNTS          → a representative cell for the hunt's biomeTag
//   • FACTION QUESTS → the posting faction's home outpost
//   • MYSTERIES /
//     STORYLINES     → the faction's home outpost (or a neutral anchor if none)
// The number sequence follows the SAME order the Contracts screen lists them
// (hunts → mysteries → storylines → faction quests → leads) so a card reads 1..N
// top-to-bottom and each map pin carries its card's number.

import type { PlayerCharacter } from './types';
import { canonicalCellOf } from './worldMap';
import { findHuntById } from './hunts';
import { findMysteryById } from './mysteries';
import { findStorylineById } from './factionStorylines';
import { findFactionQuestById } from './factionQuests';
import { startingLocationForFaction } from './character';

/** hunt biomeTag → a representative, install-fixed location to anchor the pin on.
 *  (hunts.json only carries a biome + decorated prose location text, never an id.) */
const BIOME_ANCHOR: Record<string, string> = {
  buried_capital: 'asgardar',
  mud_seas: 'mud_seas',
  outskirts: 'tartarian_outskirts',
  sentinel_ward: 'obsidian_pillars',
};
/** Fallback anchor when a contract has neither a location, a known biome, nor a
 *  faction to pin to (e.g. a null-faction mystery). The starter region. */
const NEUTRAL_ANCHOR = 'tartarian_outskirts';

export type ContractFamily = 'hunt' | 'mystery' | 'storyline' | 'faction' | 'lead';

export interface ContractMarker {
  /** `${family}:${id}` — stable, unique; the card looks up its number by this. */
  key: string;
  family: ContractFamily;
  /** Display title for the card badge / route button. */
  label: string;
  /** A routable, install-fixed location id the pin sits on (setTravelCourse target). */
  anchorId: string;
  /** The pin's canon grid cell (anchor's cell). */
  x: number;
  y: number;
  /** 1-based number, in Contracts-screen list order. */
  number: number;
}

function anchorForFaction(factionId: string | null | undefined): string {
  if (!factionId) return NEUTRAL_ANCHOR;
  try {
    return startingLocationForFaction(factionId) || NEUTRAL_ANCHOR;
  } catch {
    return NEUTRAL_ANCHOR;
  }
}

/** Every OPEN contract as a numbered atlas pin, in Contracts-screen list order. */
export function openContractMarkers(player: PlayerCharacter | null | undefined): ContractMarker[] {
  if (!player) return [];
  const draft: Omit<ContractMarker, 'number'>[] = [];
  const add = (family: ContractFamily, id: string, label: string, anchorId: string): void => {
    const c = canonicalCellOf(anchorId);
    draft.push({ key: `${family}:${id}`, family, label, anchorId, x: c.x, y: c.y });
  };

  for (const h of player.activeHunts ?? []) {
    const def = findHuntById(h.id);
    if (!def) continue;
    const anchor = BIOME_ANCHOR[def.biomeTag] ?? anchorForFaction(def.factionId);
    add('hunt', h.id, def.title, anchor);
  }
  for (const m of player.activeMysteries ?? []) {
    const def = findMysteryById(m.id);
    if (!def) continue;
    add('mystery', m.id, def.title, anchorForFaction(def.factionId));
  }
  for (const s of player.activeStorylines ?? []) {
    const def = findStorylineById(s.id);
    if (!def) continue;
    add('storyline', s.id, def.title, anchorForFaction(def.factionId));
  }
  for (const fq of player.activeFactionQuests ?? []) {
    const def = findFactionQuestById(fq.id);
    if (!def) continue;
    add('faction', fq.id, def.title, anchorForFaction(def.factionId));
  }
  for (const q of player.activeQuests ?? []) {
    if (q.state !== 'open' && q.state !== 'in_progress') continue;
    const anchorId = q.location?.id;
    if (!anchorId) continue;
    const label = q.objective ? `${q.objective.verb} ${q.objective.target}` : (q.location?.name ?? 'Lead');
    add('lead', q.id, label, anchorId);
  }

  return draft.map((d, i) => ({ ...d, number: i + 1 }));
}

/** key (`${family}:${id}`) → 1-based number, for the Contracts cards to read so a
 *  card and its atlas pin always carry the same number. */
export function contractMarkerNumbers(player: PlayerCharacter | null | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of openContractMarkers(player)) out[m.key] = m.number;
  return out;
}
