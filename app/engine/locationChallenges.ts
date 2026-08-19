// locationChallenges — the Tier-C "title challenge" registry. Each of the 6
// deferred Arbiter titles is a place on the map with a challenge attached.
// This module PLOTS them (location ids), declares how the player would reach
// them (entry hooks), and maps the Guild Broker faction→coveted-item chart.
//
// arb46/arb54/arb55 — ALL SIX Tier-C challenges are now LIVE. The master
// `TIER_C_ENABLED` flag is on and every challenge's `enabled` is true, so
// `challengeActive` returns true for all of them and their entry-hook /
// completion sites (gated on `challengeActive(id)`) are reachable in play.
// challengeActive still requires BOTH switches, so a single per-challenge
// `enabled:false` (or flipping the master off) cleanly disables one/all again.
//
// The titles themselves (engine/titles.ts) read counters that increment ONLY
// from these completion sites, so the 6 Tier-C titles became earnable exactly
// when their challenges went live.

import { JOIN_THRESHOLD } from './factions';

export type ChallengeEntryKind = 'storyline' | 'encounter' | 'whisper' | 'found_map';

export interface LocationChallenge {
  /** Stable id; also the gating key used by challengeActive(). */
  id: string;
  /** The title this challenge awards (id in arbiter-titles.json + titles.ts). */
  titleId: string;
  /** Where it lives — a locations.json id (existing or newly plotted). */
  locationId: string;
  /** Per-challenge switch. ALL false until the user reviews + provides layout. */
  enabled: boolean;
  /** How the player discovers / reaches the challenge. */
  entryKind: ChallengeEntryKind;
  /** True when the challenge needs a hand-drawn interior/scene before it can
   *  be turned on (Labyrinth room graph, enclave defense map, brokering scene). */
  needsLayout: boolean;
  /** Path to the supplied layout data, once plotted. Set on a formerly
   *  `needsLayout` challenge when its graph/map has been authored; the
   *  challenge still stays OFF until reviewed and the enabled flags flip. */
  layout?: string;
  /** One-line designer note. */
  note: string;
}

/** MASTER KILL-SWITCH. While false, no Tier-C challenge can ever activate,
 *  regardless of per-challenge `enabled`. arb48 — flipped ON now that the
 *  first challenge (the Labyrinth of Shadows) is fully built; the other 5 stay
 *  inert via their own `enabled:false` (challengeActive requires BOTH). */
export const TIER_C_ENABLED = true;

export const LOCATION_CHALLENGES: readonly LocationChallenge[] = [
  {
    id: 'labyrinth_of_shadows',
    titleId: 'wayfarer_of_the_lost_paths',
    locationId: 'iskan_veil', // the maze/hidden Conspiracy-Architects capital
    enabled: true, // arb48 — fully built (engine/labyrinth.ts + store handler); LIVE
    entryKind: 'found_map',
    needsLayout: false, // arb47 — layout supplied; arb48 — built + turned on
    layout: 'app/data/maze/labyrinth-of-shadows.json',
    note: 'A found map opens the Labyrinth of Shadows. Walk it start→finish within the wrong-turn budget for a clean run → Wayfarer of the Lost Paths.',
  },
  {
    id: 'tongue_of_the_red_tower',
    titleId: 'speaker_of_forgotten_tongues',
    locationId: 'red_tower_of_nimari', // "last structures with functional Etheric tech"
    enabled: true, // arb50 — built (engine/titleChallenges.ts + store handler); LIVE
    entryKind: 'whisper',
    needsLayout: false,
    note: 'Examine the runes to recover the Glyph-Key (free), then DECIPHER RUNES — a one-shot d20+INT trial → Speaker of Forgotten Tongues.',
  },
  {
    id: 'warden_of_the_cathedral',
    titleId: 'warden_of_the_old_world',
    locationId: 'sinking_cathedral', // collapsing ruin (objective, no_returns)
    enabled: true, // arb50 — built (engine/titleChallenges.ts + store handler); LIVE
    entryKind: 'storyline',
    needsLayout: false,
    note: 'Bring 3× Scrap Metal, then STABILIZE CATHEDRAL — a one-shot d20+INT(Engineering) check → Warden of the Old World. Scouting is free.',
  },
  {
    id: 'trap_dives_of_the_stair',
    titleId: 'shadow_diver',
    locationId: 'endless_stair', // Reclaimer trap-dive ruin (etheric_lock)
    enabled: true, // arb55 — built (store handleTrapDive); LIVE
    entryKind: 'encounter',
    needsLayout: false, // arb55 — a per-dive d20+DEX check needs no drawn room graph
    note: '3 clean trap-free dives (retryable d20+DEX vs DC13; a miss springs 1d6, banks nothing) → Shadow Diver.',
  },
  {
    id: 'defense_of_the_enclave',
    titleId: 'protector_of_the_forgotten',
    locationId: 'tartarian_enclave', // deep True-Tartarian enclave under the Buried Cities
    enabled: true, // arb54 — built (store handleTitleChallenge, one-shot d20+STR); LIVE
    entryKind: 'storyline',
    needsLayout: false, // arb54 — a single hold-the-breach STR check needs no drawn map
    note: 'One-shot d20+STR DC15 to hold the breach against raiders → Protector of the Forgotten.',
  },
  {
    id: 'parley_of_factions',
    titleId: 'guild_broker',
    locationId: 'parley_ground', // NEW tile — neutral meeting ground
    enabled: true, // arb53 — built (engine/broker.ts + store handler); LIVE
    entryKind: 'encounter',
    needsLayout: false, // arb53 — built as a fetch-two-items encounter (no drawing)
    note: 'Two non-allied faction leaders each demand their coveted relic; fetch both → broker an alliance → Guild Broker.',
  },
];

const BY_ID: Record<string, LocationChallenge> =
  Object.fromEntries(LOCATION_CHALLENGES.map((c) => [c.id, c]));

/** Single gate every gameStore hook/completion site must check. Returns true
 *  ONLY when the master switch AND the per-challenge switch are both on. */
export function challengeActive(id: string): boolean {
  return TIER_C_ENABLED && BY_ID[id]?.enabled === true;
}

/** Entry hooks that should be offered at a location right now. Empty while the
 *  challenges are OFF, so gameStore.beginScene can call this unconditionally. */
export function activeChallengesAt(locationId: string): LocationChallenge[] {
  return LOCATION_CHALLENGES.filter((c) => c.locationId === locationId && challengeActive(c.id));
}

// ── Guild Broker: faction → coveted item chart ──────────────────────────────
// Each of the 9 factions has ONE lore-coveted, LOW-TIER item, placed at a
// lore-fitting canonical tile. The brokering mission picks two ELIGIBLE
// factions (not the player's, not ones the player is affiliated with) and asks
// for their items.

export interface CovetedItem {
  /** Item id authored in app/data/items/*.json (low-tier / accessible). */
  itemId: string;
  /** Display name. */
  name: string;
  /** Canonical location id where the item can be obtained. */
  sourceLocationId: string;
}

export const FACTION_COVETED_ITEM: Record<string, CovetedItem> = {
  // arb53 — upgraded to canon Tartarian relics (see docs/lore + canon-loot-
  // treasure.json). Each is a low-tier broker token authored in exploration.json
  // under the same name; the full artifact lore lives in canon-loot-treasure.
  mud_monarchs:          { itemId: 'mud_flood_pulse_key',       name: 'Mud Flood Nexus Pulse-Key', sourceLocationId: 'mud_flood_nexus' },
  forgotten_order:       { itemId: 'architects_master_blueprint', name: "Architect's Master Blueprint", sourceLocationId: 'red_tower_of_nimari' },
  reclaimers_guild:      { itemId: 'fragment_of_endless_stair', name: 'Fragment of the Endless Stair', sourceLocationId: 'endless_stair' },
  true_tartarians:       { itemId: 'mask_of_the_last_king',     name: "Mask of Tartaria's Last King", sourceLocationId: 'buried_cities' },
  eternal_dynasty:       { itemId: 'dynasty_blood_signet',      name: "Eternal Dynasty's Blood-Signet", sourceLocationId: 'asgardar' },
  conspiracy_architects: { itemId: 'timeworn_ether_compass',    name: 'Timeworn Ether Compass', sourceLocationId: 'cradle_of_dusk' },
  servants_of_giants:    { itemId: 'entombeds_prayer_tablet',   name: "The Entombed's Prayer Tablet", sourceLocationId: 'buried_cities' },
  stone_builders:        { itemId: 'obsidian_siphon',           name: 'Obsidian Siphon', sourceLocationId: 'obsidian_pillars' },
  tartarian_revivalists: { itemId: 'aetheric_phoenix_feather',  name: 'Aetheric Phoenix Feather', sourceLocationId: 'sinking_cathedral' },
};

/** Standing at/above which the player counts as "affiliated" with a faction
 *  (mirrors the join threshold). Affiliated factions + the player's own faction
 *  are excluded from brokering. */
// ⚠ OTA-1179 — DERIVED, not a fourth copy of 20. The comment always said it
// "mirrors the join threshold"; now it does, so moving JOIN_THRESHOLD moves this
// with it instead of leaving a silent disagreement about what "allied" means.
export const AFFILIATED_STANDING = JOIN_THRESHOLD;

/** Factions eligible to be brokered: not the player's faction, and not ones the
 *  player is already affiliated with. `standings` is the player's
 *  factionStanding array ({ factionId, standing }). */
export function eligibleBrokerFactions(
  playerFactionId: string,
  standings: ReadonlyArray<{ factionId: string; standing: number }>,
): string[] {
  const standingOf = (fid: string) => standings.find((s) => s.factionId === fid)?.standing ?? 0;
  return Object.keys(FACTION_COVETED_ITEM).filter(
    (fid) => fid !== playerFactionId && standingOf(fid) < AFFILIATED_STANDING,
  );
}

/** Convenience for tests / future wiring. */
export function challengeById(id: string): LocationChallenge | undefined {
  return BY_ID[id];
}
