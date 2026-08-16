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
import locationsData from '../data/locations/locations.json';
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

/** ⚠⚠ OTA-1218 — THE POSTER STOPS LYING ABOUT THE MAP. 15 of 18 hunts NAME a
 *  real, walkable location on their poster ("Drakova", "Yuldra-Tul", "the
 *  Obsidian Pillars"...) while the anchor sat at the generic BIOME cell — a
 *  player who read the poster and walked to the named place got the "Not here"
 *  refusal, and SET COURSE routed them somewhere else entirely. The named place
 *  IS the hunt's ground now: strip the poster's parenthetical flavor, resolve
 *  the name (or an alias) against the static atlas, and only a pure-flavor name
 *  ("the Sentinel Ward (inner archive)") falls back to the biome anchor. Static
 *  locations only, by construction — a hunt poster cannot name a place that is
 *  born at runtime. */
let _posterIndex: Map<string, string> | null = null;
function posterLocationIndex(): Map<string, string> {
  if (!_posterIndex) {
    const raw = locationsData as unknown as
      | { locations: Array<{ id: string; name: string; aliases?: string[] }> }
      | Array<{ id: string; name: string; aliases?: string[] }>;
    const list = Array.isArray(raw) ? raw : raw.locations;
    const idx = new Map<string, string>();
    for (const l of list) {
      idx.set(l.name.toLowerCase(), l.id);
      for (const a of l.aliases ?? []) idx.set(a.toLowerCase(), l.id);
    }
    _posterIndex = idx;
  }
  return _posterIndex;
}

/** The location a hunt poster actually names, if it names one at all. */
export function resolvePosterLocation(targetLocationName: string | null | undefined): string | undefined {
  if (!targetLocationName) return undefined;
  const cleaned = targetLocationName.replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
  if (!cleaned) return undefined;
  const idx = posterLocationIndex();
  return idx.get(cleaned) ?? idx.get(cleaned.replace(/^the\s+/, '')) ?? idx.get(`the ${cleaned}`);
}

/** OTA-1213 — THE hunt's anchor, exported: the same tile the card's "You're at",
 *  the atlas pin, and the stage-advancement gate all read. One spelling of
 *  "where this hunt happens" — the gate and the pin can never disagree.
 *  OTA-1218 — and that one spelling now honors the place the POSTER names. */
/** ⚠⚠ THE SAME RULE, FOR THE FAMILIES THAT NEVER HAD IT. Hunts have honored the
 *  place their poster names since OTA-1218; mysteries, storylines and faction quests
 *  pinned on the posting faction's HOME OUTPOST instead — so 97 of the game's side
 *  missions resolved to just 10 tiles, and 26 of 36 locations never received a single
 *  contract pin. Measured before the change; the map could not develop because the
 *  contract board only ever pointed at ten places.
 *
 *  The prose was already doing the work: 31 of 32 mysteries and storylines NAME a
 *  real, resolvable location in their own poster or stage text. They simply had no
 *  field to carry it. Reading it here takes side-mission coverage from 10 tiles to 27.
 *
 *  ⚠ The faction home stays as the fallback, because some contracts genuinely have no
 *  place — a six-name silencing run happens wherever the names are. */
export function contractAnchorId(def: {
  factionId?: string | null;
  targetLocationName?: string | null;
}): string {
  return resolvePosterLocation(def.targetLocationName) ?? anchorForFaction(def.factionId);
}

export function huntAnchorId(def: {
  biomeTag?: string;
  factionId?: string | null;
  targetLocationName?: string | null;
}): string {
  return (
    resolvePosterLocation(def.targetLocationName) ??
    (def.biomeTag ? BIOME_ANCHOR[def.biomeTag] : undefined) ??
    anchorForFaction(def.factionId)
  );
}

/** ⚠⚠ P19 — the same walking pin for the CONTRACT families (mysteries, storylines,
 *  faction quests). `contractAnchorId` reads the def, so the marker sat on the poster's
 *  ground for the whole chapter; a mystery that sends you three places still routed you
 *  back to the first one. */
export function contractStageAnchorId(
  def: {
    factionId?: string | null;
    targetLocationName?: string | null;
    stages?: ReadonlyArray<{ locationName?: string }>;
  },
  stageIndex: number,
): string {
  const stage = def.stages?.[stageIndex];
  return (
    (stage?.locationName ? resolvePosterLocation(stage.locationName) : undefined) ??
    contractAnchorId(def)
  );
}

/** ⚠⚠ P19 — WHERE THE HUNT IS RIGHT NOW, not where it was posted. `huntAnchorId` reads
 *  the contract DEF, so the atlas pin and the ROUTE TO button pointed at the poster's
 *  ground for the whole hunt — a seven-stage chase that crosses the map still routed you
 *  back to stage one's tile every single time. Owner: *"there's no way to auto route to
 *  anything or at least even guess where it's supposed to be."*
 *
 *  ⚠ The contract anchor stays the fallback, so a hunt whose stages name no ground of
 *  their own points exactly where it always did. */
export function huntStageAnchorId(
  def: {
    biomeTag?: string;
    factionId?: string | null;
    targetLocationName?: string | null;
    stages?: ReadonlyArray<{ locationName?: string }>;
  },
  stageIndex: number,
): string {
  const stage = def.stages?.[stageIndex];
  return (
    (stage?.locationName ? resolvePosterLocation(stage.locationName) : undefined) ??
    huntAnchorId(def)
  );
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
  const seen = new Set<string>();
  const add = (family: ContractFamily, id: string, label: string, anchorId: string): void => {
    const key = `${family}:${id}`;
    if (seen.has(key)) return; // a corrupt save with a duplicate id must not double-number
    seen.add(key);
    const c = canonicalCellOf(anchorId);
    draft.push({ key, family, label, anchorId, x: c.x, y: c.y });
  };

  for (const h of player.activeHunts ?? []) {
    const def = findHuntById(h.id);
    if (!def) continue;
    // ⚠ P19 — the pin walks WITH the hunt. `h.stage` is the stage the player owes next.
    add('hunt', h.id, def.title, huntStageAnchorId(def, h.stage));
  }
  for (const m of player.activeMysteries ?? []) {
    const def = findMysteryById(m.id);
    if (!def) continue;
    // ⚠ P19 — the pin walks with the mystery.
    add('mystery', m.id, def.title, contractStageAnchorId(def, m.stage));
  }
  for (const s of player.activeStorylines ?? []) {
    const def = findStorylineById(s.id);
    if (!def) continue;
    // ⚠ P19 — the pin walks with the storyline.
    add('storyline', s.id, def.title, contractStageAnchorId(def, s.stage));
  }
  for (const fq of player.activeFactionQuests ?? []) {
    const def = findFactionQuestById(fq.id);
    if (!def) continue;
    add('faction', fq.id, def.title, contractAnchorId(def));
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

// B2 (player) — with remote "send word" turn-ins killed, EVERY contract is a face-to-face
// hand-in you must TRAVEL to. So a far turn-in has to be worth the trek — "I don't want a
// 32-time trip worth 20 TC." A LONG-HAUL BONUS scales the TC reward by how remote the
// turn-in anchor is from the starter region (a Manhattan grid-cell distance on the canon
// atlas — the same cells the map pins + SET COURSE use). A hand-in next door adds nothing;
// a hand-in in a deep capital pays a real premium. Capped so it can't dwarf the base.
const JOURNEY_HUB = 'tartarian_outskirts';   // the starter region — distance is measured from here
const JOURNEY_TC_PER_CELL = 6;               // TC added per grid cell of remoteness
const JOURNEY_BONUS_CAP_FRAC = 1.5;          // bonus never exceeds 1.5× the base reward

/** Grid-cell remoteness of a turn-in anchor from the starter hub (Manhattan distance). */
export function contractTurnInRemoteness(anchorId: string): number {
  const a = canonicalCellOf(anchorId);
  const hub = canonicalCellOf(JOURNEY_HUB);
  return Math.abs(a.x - hub.x) + Math.abs(a.y - hub.y);
}

/** ⚠⚠ OTA-1187 (PUNCHLIST P7) — THE BONUS NOW MEASURES THE TRIP THE PLAYER MADE.
 *
 *  The requirement is in OTA-824's own commit body: *"make the journey worth the loot — no
 *  32-time trip worth 20 TC."* What shipped measured `contractTurnInRemoteness` — how far
 *  the TURN-IN TILE sits from the starter hub — and never looked at where the player came
 *  from. Three consequences, all live until this OTA:
 *
 *    1. Accept, kill and hand in without leaving a deep capital → MAXIMUM bonus, no travel.
 *    2. Haul a contract from a deep capital back to the starter hub → ZERO.
 *    3. Every contract belonging to a starter-region faction under-paid, forever.
 *
 *  It now measures `accept cell → turn-in cell`. Same 6 TC/cell, same 1.5× cap, so no
 *  tuning number moves — only which players get paid.
 *
 *  ⚠ `acceptedAtCell` is optional and its absence is NOT an error: a contract accepted
 *  before this OTA carries no stamp. Those fall back to the old remoteness read, so a trip
 *  already half-made still pays something rather than silently dropping to zero for a
 *  journey the player really did make. Every new accept stamps it. */
export function contractJourneyBonusTc(
  anchorId: string,
  baseTc: number,
  acceptedAtCell?: { x: number; y: number } | null,
): number {
  const dist = acceptedAtCell
    ? (() => {
        const a = canonicalCellOf(anchorId);
        return Math.abs(a.x - acceptedAtCell.x) + Math.abs(a.y - acceptedAtCell.y);
      })()
    : contractTurnInRemoteness(anchorId);
  const raw = dist * JOURNEY_TC_PER_CELL;
  const cap = Math.round(Math.max(0, baseTc) * JOURNEY_BONUS_CAP_FRAC);
  return Math.max(0, Math.min(raw, cap));
}
