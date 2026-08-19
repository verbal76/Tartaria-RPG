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
import {
  DIRECTIONS,
  OUTPOST_EXITS,
  outpostFirstStep,
  type Direction,
  type StructuralId,
} from './outpostGraph';

export interface HubRoom {
  id: string;
  /** ⚠⚠ OTA-1282 (port of golem OTA-1279) — which node of the universal outpost
   *  graph this room IS. Navigation is decided by this, never by the room's
   *  name, its faction skin, or where an artist drew it. See outpostGraph.ts. */
  structuralId: StructuralId;
  name: string;
  shortName: string;
  description: string;
  /** ⚠⚠ DERIVED, NOT AUTHORED. Composed from OUTPOST_EXITS at module load —
   *  static_hub.json no longer carries exits, because hand-typed exits are what
   *  rotted into 10 one-way doors and 2 unreachable rooms (Chapel, Culvert)
   *  before the golem-line audit that produced the graph. */
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

export const HUB: HubData = staticHubData as unknown as HubData;

// ⚠⚠ OTA-1282 (port of golem OTA-1279) — COMPOSE THE EXIT TABLE FROM THE GRAPH,
// ONCE, AT LOAD. static_hub.json declares only which structural node each room
// occupies; the connections come from outpostGraph.ts and are stamped onto the
// room objects here, so every existing reader (exit chips, resolveHubTravel,
// beginScene) keeps working against `room.exits` unchanged while there is now
// exactly one place a connection can be written. The self-check throws at
// import rather than shipping a map the player can get lost in.
const ROOM_BY_STRUCTURAL: Map<StructuralId, string> = (() => {
  const map = new Map<StructuralId, string>();
  for (const room of HUB.rooms) {
    if (!room.structuralId) {
      throw new Error(`hub layout: room '${room.id}' declares no structuralId`);
    }
    if (!OUTPOST_EXITS[room.structuralId]) {
      throw new Error(`hub layout: room '${room.id}' claims unknown node '${room.structuralId}'`);
    }
    const taken = map.get(room.structuralId);
    if (taken) {
      throw new Error(`hub layout: '${room.id}' and '${taken}' both claim node ${room.structuralId}`);
    }
    map.set(room.structuralId, room.id);
  }
  return map;
})();

for (const room of HUB.rooms) {
  const canon = OUTPOST_EXITS[room.structuralId];
  const exits = { north: null, south: null, east: null, west: null } as HubRoom['exits'];
  for (const dir of DIRECTIONS) {
    const node = canon[dir];
    exits[dir] = node ? (ROOM_BY_STRUCTURAL.get(node) ?? null) : null;
  }
  room.exits = exits;
}

/** The room occupying a given structural node, or null if this layout omits it. */
export function hubRoomAtNode(node: StructuralId): HubRoom | null {
  const id = ROOM_BY_STRUCTURAL.get(node);
  return id ? (HUB.rooms.find((r) => r.id === id) ?? null) : null;
}

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

// ⚠⚠ OTA-1209 — WHOSE COLOURS A HUB SITE WEARS. It used to be the PLAYER'S, everywhere.
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
  /** OTA-1126 — whether THIS faction's skin of the room stands under open
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

/** OTA-1126 — is this hub room open to the sky for THIS faction's skin?
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

// ⚠⚠ OTA-1217 (PUNCHLIST P11) — PORTED UP FROM golem-line, WHERE IT HAS LIVED SINCE
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

/** True when this room is the hub's way OUT — the gate/entrance (tagged "entrance" in the
 *  layout; the Gate is the only one). The EXIT chip belongs only here.
 *
 *  ⚠ Tags survive the per-faction string overrides — `hubRoomFor` re-skins name,
 *  shortName and description and nothing else — so this holds for every faction's hub,
 *  including under OTA-1209's skin-by-site. */
export function roomIsExit(room: HubRoom | null | undefined): boolean {
  // ⚠ OTA-1282 — widened to `exterior_door`: the owner's map ruling puts an
  // exit in the CENTRAL room ("there's a central room that's where the exit
  // should be"), carried by that tag in the shared layout.
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

export type HubTravel =
  | { roomId: string; via: 'cardinal' | 'adjacent' }
  /** ⚠⚠ The player named a real room that is NOT one step away. A REFUSAL
   *  carrying directions, not a move: `roomId` is where they asked to go and
   *  `firstStep` is the adjacent room that heads that way. */
  | { roomId: string; via: 'not_adjacent'; firstStep: string | null }
  /** ⚠⚠ The player asked for a cardinal this room has no door on. Refused HERE
   *  so it cannot fall through to overland travel — pre-port, a wrong
   *  `go north` inside the outpost walked the player out of the building, and
   *  under the corrected topology 8 of 15 rooms are dead ends with one door. */
  | { roomId: null; via: 'no_exit_that_way'; dir: Direction };

/** Resolve a player input against the current hub room's exits. Returns null if
 *  the input names nothing in the outpost.
 *
 *  ⚠⚠ OTA-1282 (port of golem OTA-1279/1281) — FAST-TRAVEL IS GONE, per the
 *  owner's navigation spec: "move ONE GRAPH EDGE AT A TIME"; "dead ends must
 *  behave as dead ends." A named room that is out of reach answers with the
 *  door that leads toward it. Name matching is LONGEST-NAME-WINS in both
 *  phases: first-substring-found walked Order players typing `cells` (their
 *  screen's word for the Quarters) into the Chapel ("Cell"). */
export function resolveHubTravel(
  fromRoomId: string,
  rawInput: string,
  skinFactionId?: string | null,
): HubTravel | null {
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
  let deadCardinal: Direction | null = null;
  for (const dir of DIRECTIONS) {
    if (new RegExp(`\\b${dir}\\b`).test(text)) {
      const target = here.exits[dir];
      if (target) return { roomId: target, via: 'cardinal' };
      deadCardinal ??= dir;
    }
  }
  const bestMatch = (roomIds: string[]): string | null => {
    let best: { roomId: string; len: number } | null = null;
    for (const roomId of roomIds) {
      for (const n of namesFor(roomId)) {
        if (text.includes(n) && (!best || n.length > best.len)) best = { roomId, len: n.length };
      }
    }
    return best?.roomId ?? null;
  };
  // Adjacent named room (any exit).
  const adjacent = bestMatch(
    DIRECTIONS.map((d) => here.exits[d]).filter((x): x is string => !!x),
  );
  if (adjacent) return { roomId: adjacent, via: 'adjacent' };
  // A real room, further off. Refused — with the first step named.
  const far = bestMatch(HUB.rooms.map((r) => r.id).filter((id) => id !== fromRoomId));
  if (far) {
    return { roomId: far, via: 'not_adjacent', firstStep: hubFirstStepToward(fromRoomId, far) };
  }
  if (deadCardinal) return { roomId: null, via: 'no_exit_that_way', dir: deadCardinal };
  return null;
}

/** ⚠ The adjacent room that starts the shortest walk from one room to another —
 *  a signpost, never a shortcut. */
export function hubFirstStepToward(fromRoomId: string, toRoomId: string): string | null {
  const from = findHubRoom(fromRoomId);
  const to = findHubRoom(toRoomId);
  if (!from || !to) return null;
  const node = outpostFirstStep(from.structuralId, to.structuralId);
  return node ? (hubRoomAtNode(node)?.id ?? null) : null;
}

/** ⚠⚠ OTA-1284 (port of golem OTA-1274/1279/1281) — a bare room name, matched STRICTLY, for the pre-parser
 *  intercept. The owner asked for an odd-name audit ("there was a room called
 *  break") and the audit found the real defect class underneath: room chips
 *  whose names ARE parser verbs. Typing `vault` jumped (conf 1.00), `break`
 *  attacked, `forge` opened crafting, `chamber` climbed via fuzzy 'clamber' —
 *  in every skin the typed name of some room did something other than walk.
 *
 *  resolveHubTravel cannot gate the intercept: it substring-matches, so
 *  "break the door" would walk to the Break Room instead of attacking the
 *  door. This matcher demands the WHOLE input be the room (after an optional
 *  go/visit/enter lead-in and articles).
 *
 *  ⚠⚠ Matches EVERY room, not only visited ones (golem OTA-1279's widening).
 *  The old visited-gate was inherited from fast-travel, and fast-travel is gone.
 *  Leaving it in place would mean a room's name still fired a parser verb right
 *  up until the first time you walked in — `vault` jumping, `forge` opening
 *  crafting — which is the exact hole OTA-1274 was opened to close. Naming an
 *  unreachable room is no longer a jump anywhere; resolveHubTravel refuses it
 *  and points at the right door instead. */
export function matchHubRoomName(
  rawInput: string,
  fromRoomId: string,
  skinFactionId?: string | null,
): string | null {
  const here = findHubRoom(fromRoomId);
  if (!here) return null;
  const text = rawInput.toLowerCase().trim()
    .replace(/^(go\s+to|goto|go|enter|visit|to)\s+/, '')
    .replace(/^the\s+/, '')
    .trim();
  if (!text) return null;
  // ⚠ The SKIN pass outranks the BASE pass (golem OTA-1280-era layering). One faction can label a
  // room with another room's base name (conspiracy: the Workshop reads "Lab",
  // while outpost_lab's base shortName is also "Lab"). The player types what is
  // on their screen, so the screen name must win the tie — previously it won by
  // array-index luck, which is not a rule.
  const isMatch = (roomId: string, layer: 'skin' | 'base'): boolean => {
    const r = layer === 'skin'
      ? (skinFactionId ? VARIANTS.factions?.[skinFactionId]?.[roomId] : undefined)
      : findHubRoom(roomId);
    if (!r || typeof r.shortName !== 'string' || typeof r.name !== 'string') {
      return layer === 'base' && text === roomId.toLowerCase();
    }
    const name = r.name.toLowerCase().replace(/^the\s+/, '');
    return text === r.shortName.toLowerCase() || text === name
      || (layer === 'base' && text === roomId.toLowerCase());
  };
  for (const layer of ['skin', 'base'] as const) {
    for (const dir of DIRECTIONS) {
      const targetId = here.exits[dir];
      if (targetId && isMatch(targetId, layer)) return targetId;
    }
    for (const room of HUB.rooms) {
      if (room.id === fromRoomId) continue;
      if (isMatch(room.id, layer)) return room.id;
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

/** ⚠⚠ OTA-1285 (port of golem OTA-1269) — a bare "get me out of here", with no container named.
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
