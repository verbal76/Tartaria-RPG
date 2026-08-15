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

// ⚠⚠ OTA-1194 (PUNCHLIST P11) — PORTED UP FROM golem-line, WHERE IT HAS LIVED SINCE
// 2026-06-27 (`fix(golem-line): EXIT chip only in the gate room`, e04a6ed5).
//
// It was never brought across, so the LIVE line — the one with the Apple testers on it —
// has been letting players walk out of an outpost through the armory or the mess hall.
// The outpost is a 15-room interior entered and left through the Gate; leaving from any
// room is not a shortcut, it is a hole in the geography. `verify-parity` has flagged
// `InputBox.tsx` on every port that touched it since, which is how it surfaced.
//
// Owner, on being shown that the better version was on the branch nobody plays:
// *"ok then bring hal up to the better version."*

/** True when this room has a way OUT of the hub — the gate (tagged `entrance`) or a room
 *  with its own door to the outside (tagged `exterior_door`).
 *
 *  ⚠⚠ OTA-1271 — THE OWNER OVERRULED THE GATE-ONLY RULE FROM HIS OWN PLAYTEST. OTA-1194
 *  restricted the EXIT chip to the gate ("leaving through the armory is not how the
 *  outpost is laid out") — and then he spent a session stranded in the workshop cluster
 *  typing "why is there no exit button". His ruling: *"add an exit button there [the
 *  anchor rooms] or find a room named after a room that would normally have an exit...
 *  all outposts should have at least 1 exit."* The Workshop now carries `exterior_door`
 *  (a working shop would have a service door); the layout invariant — at least one
 *  exit-bearing room per hub — is pinned by ota1271's test, not by hope.
 *
 *  ⚠ Tags survive the per-faction string overrides — `hubRoomFor` re-skins name,
 *  shortName and description and nothing else — so this holds for every faction's hub,
 *  including under OTA-1186's skin-by-site. */
export function roomIsExit(room: HubRoom | null | undefined): boolean {
  return !!room && Array.isArray(room.tags)
    && (room.tags.includes('entrance') || room.tags.includes('exterior_door'));
}

/** True when the hub layout marks an explicit exit/gate room at all.
 *
 *  ⚠ THE FALLBACK IS THE POINT: when no room is tagged `entrance` — a legacy layout, or a
 *  future one that forgets — EXIT stays available everywhere rather than nowhere. A gating
 *  rule whose failure mode is "the player cannot leave the building" would be a far worse
 *  defect than the one it fixes. */
export function hubDefinesExitRoom(): boolean {
  return HUB.rooms.some((r) => roomIsExit(r));
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
  // ⚠ OTA-1274 — the SKIN the player is actually reading. Name matching below
  // used to check only the base layout's names, so a Dynasty player typing
  // 'go promenade' (the name on their screen) never matched 'Square' (the
  // name in the base file). Optional so older callers keep their behaviour.
  skinFactionId?: string | null,
): { roomId: string; via: 'cardinal' | 'adjacent' | 'fast_travel' } | null {
  const here = findHubRoom(fromRoomId);
  if (!here) return null;
  const text = rawInput.toLowerCase();
  const namesFor = (roomId: string): string[] => {
    const base = findHubRoom(roomId);
    const skinned = hubRoomFor(roomId, skinFactionId ?? null);
    const out: string[] = [roomId.toLowerCase()];
    for (const r of [base, skinned]) {
      if (r) { out.push(r.shortName.toLowerCase(), r.name.toLowerCase()); }
    }
    return out;
  };
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
    if (namesFor(targetId).some((n) => text.includes(n))) {
      return { roomId: targetId, via: 'adjacent' };
    }
  }
  // Fast-travel — any room the player has already visited.
  for (const room of HUB.rooms) {
    if (room.id === fromRoomId) continue;
    if (!visitedRoomIds.has(room.id)) continue;
    if (namesFor(room.id).some((n) => text.includes(n))) {
      return { roomId: room.id, via: 'fast_travel' };
    }
  }
  return null;
}

/** ⚠⚠ OTA-1274 — a bare room name, matched STRICTLY, for the pre-parser
 *  intercept. The owner asked for an odd-name audit ("there was a room called
 *  break") and the audit found the real defect class underneath: room chips
 *  whose names ARE parser verbs. Typing `vault` jumped (conf 1.00), `break`
 *  attacked, `forge` opened crafting, `chamber` climbed via fuzzy 'clamber' —
 *  in every skin the typed name of some room did something other than walk.
 *
 *  resolveHubTravel cannot gate the intercept: it substring-matches, so
 *  "break the door" would walk to the Break Room instead of attacking the
 *  door. This matcher demands the WHOLE input be the room (after an optional
 *  go/visit/enter lead-in and articles), and only offers rooms the travel
 *  rules could actually reach: adjacent always, elsewhere only if visited
 *  (the same earned-fast-travel rule resolveHubTravel enforces). */
export function matchHubRoomName(
  rawInput: string,
  fromRoomId: string,
  visitedRoomIds: ReadonlySet<string>,
  skinFactionId?: string | null,
): string | null {
  const here = findHubRoom(fromRoomId);
  if (!here) return null;
  const text = rawInput.toLowerCase().trim()
    .replace(/^(go\s+to|goto|go|enter|visit|to)\s+/, '')
    .replace(/^the\s+/, '')
    .trim();
  if (!text) return null;
  const isMatch = (roomId: string): boolean => {
    for (const r of [findHubRoom(roomId), hubRoomFor(roomId, skinFactionId ?? null)]) {
      if (!r) continue;
      const name = r.name.toLowerCase().replace(/^the\s+/, '');
      if (text === r.shortName.toLowerCase() || text === name || text === roomId.toLowerCase()) return true;
    }
    return false;
  };
  for (const dir of ['north', 'south', 'east', 'west'] as const) {
    const targetId = here.exits[dir];
    if (targetId && isMatch(targetId)) return targetId;
  }
  for (const room of HUB.rooms) {
    if (room.id === fromRoomId || !visitedRoomIds.has(room.id)) continue;
    if (isMatch(room.id)) return room.id;
  }
  return null;
}

/** True when the input is asking to leave the hub entirely. */
export function isLeaveHubCommand(rawInput: string): boolean {
  return /\b(leave|exit)\s+(the\s+)?(outpost|hub|camp|reclaimers'?)\b/i.test(rawInput) ||
         /\bleave\s+the\s+gate\b/i.test(rawInput) ||
         /\b(head|go|walk|travel)\s+(out|outside|into the wild)\b/i.test(rawInput);
}

/** ⚠⚠ OTA-1269 — a bare "get me out of here", with no container named.
 *  Owner's device run: he typed `exit`, then `leave`, four attempts — bare
 *  `exit` fell through the hub gate into overland travel with no target and
 *  narrated a floorboard search (+1h); bare `leave` was refused by the wander
 *  path's hook-thread block; only the taught phrase `leave outpost` worked.
 *  The bare-word rule ALREADY existed twice before this function — the
 *  tutorial's explore_or_leave allowance and the building-interior EXIT each
 *  carried their own inline regex, and neither agreed with the travel path —
 *  the session's recurring rule-computed-twice failure, in its ninth suit.
 *  One predicate now, three callers, and bare `leave` counts everywhere. */
export function isBareExitCommand(rawInput: string): boolean {
  return /^\s*(exit|leave|outside|step\s+out|get\s+out(\s+of\s+here)?|leave\s+here)\s*$/i.test(rawInput);
}
