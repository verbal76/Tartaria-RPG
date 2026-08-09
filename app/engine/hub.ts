// HANDOFF #15b — hub engine integration. Loads the hand-authored hub
// data from static_hub.json and provides lookups the gameStore wires
// into beginScene / travel handling.
//
// Design:
//   - Player gains a `hubRoomId` field. When set, scene rendering
//     pulls from the hub room (description / exits) instead of the
//     procedural Micro-Micro picker.
//   - On first entry to a hub location, hubRoomId defaults to the
//     hub's entry room id (Gate).
//   - Cardinal travel (`go north`) resolves through hub.rooms[*].exits.
//   - Named travel (`go armory`, `take the workshop`) matches against
//     room shortName / name / id.
//   - "leave outpost" / "exit hub" clears hubRoomId and resumes the
//     procedural world.

import staticHubData from '../data/world/static_hub.json';
import variantsData from '../data/world/hub_faction_variants.json';

export interface HubRoom {
  id: string;
  name: string;
  shortName: string;
  description: string;
  exits: {
    north: string | null;
    south: string | null;
    east: string | null;
    west: string | null;
  };
  anchorNpc: string | null;
  tags: string[];
  /** Author-declared searchable / approachable nouns in this room.
   *  Surfaced as Search / Approach modal chips and recognised as
   *  parser targets. Replaces the noun extractor for hub rooms.
   *  Lowercase, no punctuation, singular preferred. */
  interactables?: string[];
}

interface HubData {
  hubId: string;
  hubName: string;
  hubLocationId: string;
  // v2.4.1 (OTA 030) — same room layout reused across all 9 factions.
  // hubLocationIds lists every macro-location where the hub interior
  // should render; factionHubNames maps the player's factionId to the
  // display title shown on the minimap + opening narrative ("Monarch
  // Court" for Mud Monarchs, "Order Cloister" for Forgotten Order,
  // etc.). The room layout itself (rooms[]) is shared.
  hubLocationIds?: string[];
  factionHubNames?: Record<string, string>;
  rooms: HubRoom[];
}

export const HUB: HubData = staticHubData as HubData;

const HUB_LOCATION_SET: ReadonlySet<string> = new Set(
  HUB.hubLocationIds ?? [HUB.hubLocationId],
);

/** True when the given location id is any faction's hub macro location.
 *  v2.4.1 (OTA 030) — was single-location (tartarian_outskirts only);
 *  now any of the 9 faction-start tiles renders the hub interior. */
export function isHubLocation(locationId: string | null | undefined): boolean {
  if (!locationId) return false;
  return HUB_LOCATION_SET.has(locationId);
}

/** Display title for the hub minimap + opening narrative, scoped to
 *  the player's faction. Falls back to "Reclaimers' Outpost" if the
 *  factionId is missing or unmapped (legacy saves predating per-
 *  faction hubs). */
export function hubNameForFaction(factionId: string | null | undefined): string {
  const fallback = HUB.hubName;
  if (!factionId) return fallback;
  const map = HUB.factionHubNames ?? {};
  return map[factionId] ?? fallback;
}

// ⚠⚠ OTA-1186 — WHOSE COLOURS A HUB SITE WEARS. It used to be the PLAYER'S, everywhere.
//
// `hubRoomFor` and `hubNameForFaction` were called with `player.factionId` at all 17 of
// their call sites, so a Mud Monarch saw "The Atrium" and "Monarch Court" at every outpost
// in the world — including the Architects' own. One map wearing your colours wherever you
// went, which is precisely why the world did not read as though factions held ground.
//
// ⚠ AND THE WORLD MAP ALREADY DISAGREED WITH IT. `MapScreen.OUTPOST_NAME_BY_LOCATION`
// (arb105) tags each of the nine faction tiles with its OWNER'S outpost name, so the travel
// list has always said "Monarch Waystation (Monarch Court)" — and then the interior called
// itself yours. This makes the inside agree with the list that already shipped.
//
// ⚠ THE LAYOUT DOES NOT MOVE. This changes which set of NAMES is applied, nothing else:
// `hubRoomFor` merges only name/shortName/description/open_air and takes exits,
// interactables, tags and **anchorNpc** from the base room. Same graph, same doors, same
// people. Who those people ANSWER FOR is a separate job and is PUNCHLIST P9.
let OWNER_BY_LOCATION: Record<string, string> | null = null;
function ownerByLocation(): Record<string, string> {
  if (!OWNER_BY_LOCATION) {
    // Lazy so `hub.ts` does not pull `character.ts`'s whole import chain at module load;
    // it is a plain constant map, read once and cached.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { FACTION_STARTING_LOCATION } = require('./character') as typeof import('./character');
    OWNER_BY_LOCATION = Object.fromEntries(
      Object.entries(FACTION_STARTING_LOCATION).map(([factionId, locId]) => [locId, factionId]),
    );
  }
  return OWNER_BY_LOCATION;
}

/** The faction that OWNS this hub site, or `null` where nobody does. */
export function hubOwnerFaction(locationId: string | null | undefined): string | null {
  if (!locationId) return null;
  return ownerByLocation()[locationId] ?? null;
}

/** Whose colours to draw this hub site in.
 *
 *  ⚠⚠ AN OWNED SITE WEARS ITS OWNER'S COLOURS; EVERYWHERE ELSE IS UNCHANGED. Only nine of
 *  the fourteen hub macro-locations have an owner in `FACTION_STARTING_LOCATION`. The
 *  other five — the starter outskirts and the four lost capitals — fall back to the
 *  player's faction, which is exactly today's behaviour, so this OTA moves nine sites and
 *  regresses none.
 *
 *  ⚠ THE FIRST VERSION RETURNED `null` FOR THOSE FIVE, reasoning that neutral ground
 *  should read as neutral. That is wrong on the data: `hubNameForFaction(null)` resolves to
 *  `HUB.hubName`, which is **"Reclaimers' Outpost"** (the pre-OTA-030 single hub, still
 *  anchored at `tartarian_outskirts` in `static_hub.json`). It would therefore have
 *  renamed Asgardar, the Buried Cities, the Giant Vault and Drakova — four LOST CAPITALS,
 *  owned by nobody and Reclaimer in no sense — to the Reclaimers' Outpost. Making a change
 *  that improves nine places and spoils four is not an improvement. */
export function hubSkinFactionFor(
  locationId: string | null | undefined,
  playerFactionId: string | null | undefined,
): string | null {
  return hubOwnerFaction(locationId) ?? playerFactionId ?? null;
}

export function findHubRoom(roomId: string | null | undefined): HubRoom | null {
  if (!roomId) return null;
  return HUB.rooms.find((r) => r.id === roomId) ?? null;
}

// v2.4.1 (OTA 031) — per-faction room name + description overrides.
// hub_faction_variants.json holds the 8 non-Reclaimer factions' room
// re-skins (same exits, same anchorNpc, same interactables — only
// the player-facing strings change). Fall back to the base room
// when the faction has no override for that room id.
interface FactionRoomOverride {
  name?: string;
  shortName?: string;
  description?: string;
  /** OTA-1103 — whether THIS faction's skin of the room stands under open
   *  sky. The weather engine's open-air default is keyed on the base hub
   *  graph (gate / square / culvert are Reclaimer courtyards), but a
   *  faction re-skin can move the same room indoors: the Architects' gate
   *  is "a clerical office with filing cabinets", and a device log showed
   *  Aetheric arcs biting the player inside it. Omitted = fall back to
   *  the base graph's call. */
  open_air?: boolean;
}
interface FactionVariantsFile {
  factions: Record<string, Record<string, FactionRoomOverride>>;
}
const VARIANTS = variantsData as FactionVariantsFile;

export function hubRoomFor(
  roomId: string | null | undefined,
  factionId: string | null | undefined,
): HubRoom | null {
  const base = findHubRoom(roomId);
  if (!base || !factionId) return base;
  const factionRooms = VARIANTS.factions?.[factionId];
  if (!factionRooms) return base;
  const override = factionRooms[base.id];
  if (!override) return base;
  // Merge: the override wins for the player-facing strings; every
  // other field (exits, anchorNpc, tags, interactables) stays at
  // the base.
  return {
    ...base,
    name: override.name ?? base.name,
    shortName: override.shortName ?? base.shortName,
    description: override.description ?? base.description,
  };
}

/** OTA-1103 — is this hub room open to the sky for THIS faction's skin?
 *  `fallback` is the base hub graph's call (the gameStore's open-air room
 *  set); a faction variant that declares `open_air` overrides it in either
 *  direction. The weather tick is the consumer: a Conspiracy "gate" is a
 *  clerical office and must not take Aetheric arcs, while a faction that
 *  re-skins an interior room into a courtyard would become exposed. */
export function hubRoomOpenAir(
  roomId: string | null | undefined,
  factionId: string | null | undefined,
  fallback: boolean,
): boolean {
  if (!roomId) return fallback;
  const override = factionId ? VARIANTS.factions?.[factionId]?.[roomId] : undefined;
  return override?.open_air ?? fallback;
}

/** Default entry-room id for the hub — the first room in the rooms[]
 *  list. By convention that's the Gate. */
export function hubEntryRoomId(): string {
  return HUB.rooms[0]?.id ?? '';
}

/** True when this room is the hub's way OUT — the gate/entrance (tagged
 *  "entrance" in the layout; the Gate is the only one). The EXIT chip
 *  belongs only here: you leave the outpost through the gate, not the
 *  armory or the mess. Tags survive the per-faction string overrides
 *  (hubRoomFor only re-skins name/description), so this holds for every
 *  faction's hub. */
export function roomIsExit(room: HubRoom | null | undefined): boolean {
  return !!room && Array.isArray(room.tags) && room.tags.includes('entrance');
}

/** True when the hub layout marks an explicit exit/gate room at all. When it
 *  does, the EXIT chip is gated to that room; when it doesn't (a legacy layout
 *  that never tagged a gate), EXIT stays available from every room so no one
 *  is ever stranded. */
export function hubDefinesExitRoom(): boolean {
  return HUB.rooms.some((r) => Array.isArray(r.tags) && r.tags.includes('entrance'));
}

/** Resolve a player input against the current hub room's exits. Returns
 *  the target room id, or null if no exit matches. Supports:
 *    - Cardinal direction in the input ('go north')
 *    - shortName / name / id of an adjacent room ('go armory')
 *    - shortName / name / id of ANY hub room ('go to the workshop') —
 *      jumps directly to that room. Useful for fast-travel within the
 *      hub once the player has visited a room.
 */
export function resolveHubTravel(
  fromRoomId: string,
  rawInput: string,
  visitedRoomIds: ReadonlySet<string>,
): { roomId: string; via: 'cardinal' | 'adjacent' | 'fast_travel' } | null {
  const here = findHubRoom(fromRoomId);
  if (!here) return null;
  const text = rawInput.toLowerCase();
  // Cardinal first.
  for (const dir of ['north', 'south', 'east', 'west'] as const) {
    if (new RegExp(`\\b${dir}\\b`).test(text)) {
      const target = here.exits[dir];
      if (target) return { roomId: target, via: 'cardinal' };
    }
  }
  // Adjacent named room (any exit).
  for (const dir of ['north', 'south', 'east', 'west'] as const) {
    const targetId = here.exits[dir];
    if (!targetId) continue;
    const room = findHubRoom(targetId);
    if (!room) continue;
    if (
      text.includes(room.shortName.toLowerCase()) ||
      text.includes(room.name.toLowerCase()) ||
      text.includes(room.id.toLowerCase())
    ) {
      return { roomId: targetId, via: 'adjacent' };
    }
  }
  // Fast-travel — any room the player has already visited.
  for (const room of HUB.rooms) {
    if (room.id === fromRoomId) continue;
    if (!visitedRoomIds.has(room.id)) continue;
    if (
      text.includes(room.shortName.toLowerCase()) ||
      text.includes(room.name.toLowerCase()) ||
      text.includes(room.id.toLowerCase())
    ) {
      return { roomId: room.id, via: 'fast_travel' };
    }
  }
  return null;
}

/** True when the input is asking to leave the hub entirely. */
export function isLeaveHubCommand(rawInput: string): boolean {
  return /\b(leave|exit)\s+(the\s+)?(outpost|hub|camp|reclaimers'?)\b/i.test(rawInput) ||
         /\bleave\s+the\s+gate\b/i.test(rawInput) ||
         /\b(head|go|walk|travel)\s+(out|outside|into the wild)\b/i.test(rawInput);
}
