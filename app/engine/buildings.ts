// Enterable-building templates (arb24). A small pool of generic interiors
// the world can "pull from" — found via encounter hooks, entered from a
// tile, and navigated room-to-room on the same travel row the faction
// outpost uses (up to 4 rooms + EXIT).
//
// DESIGN NOTES
//   - FLAT access, not a cardinal graph. A 3-4 room house doesn't need
//     path-plotting; the player taps a room and steps into it. Spatial
//     "plotting" stays at the overworld (the world map between locations).
//     So a building is just an ordered list of rooms; the nav row shows
//     every (visible) room. This is deliberate — see the player's note
//     that cardinal-less room hops "feel like teleporting": inside a
//     small building that's the correct, low-friction feel.
//   - SECRET rooms (the shed's hidden cellar) carry `secret: true` and a
//     `revealOnInvestigate` noun. They're hidden from the room list until
//     the player INVESTIGATEs that noun, at which point the building's
//     revealed-set gains the room id and it joins the nav row.
//   - MARKET stalls are ordinary rooms with a `stallCategory`; the vendor
//     wiring (which trader stands in each stall) is layered on top later
//     via the existing vendor system — the template just reserves the
//     stall and its category.
//
// These templates reuse the same room shape ideas as HubRoom (id / name /
// shortName / description / interactables) so the scene pipeline can treat
// a building room exactly like a hub room once entry/exit is wired in.

export type StallCategory = 'weapons' | 'armor' | 'food' | 'materials';

export interface BuildingRoom {
  /** Unique within the building. */
  id: string;
  /** Full name for narration ("The Kitchen"). */
  name: string;
  /** Short label for the nav-row button ("Kitchen"). Keep ≤ ~8 chars. */
  shortName: string;
  description: string;
  /** Author-declared searchable / approachable / takeable nouns. */
  interactables: string[];
  /** Vendor anchor (market stalls / inhabited rooms). null = empty room. */
  anchorNpc?: string | null;
  /** Market stall category, when this room is a stall. */
  stallCategory?: StallCategory;
  /** Hidden from the room list until revealed. */
  secret?: boolean;
  /** Hidden from the nav-row tab list, but still enterable as the entry room.
   *  The market square uses this: you LAND here on entry (flavor + a choice of
   *  stalls) but it isn't itself a tab — the tabs are the four stalls + EXIT. */
  navHidden?: boolean;
  /** The interactable noun whose INVESTIGATE reveals this (secret) room.
   *  Lives as an interactable on another room in the same building. */
  revealOnInvestigate?: string;
  /** ⚠⚠ OTA-1430 — THIS ROOM HAS A DOOR TO THE OUTSIDE. Owner: *"I want the
   *  exit tied to the correct room."* The entry room ALWAYS has one (you walked
   *  in through it) and does not need the flag; this marks the EXTRA doors a
   *  painting shows — the shack's second gate into the storage is the first.
   *  See buildingExitRooms(). */
  exitDoor?: boolean;
}

export interface BuildingTemplate {
  /** Stable id, e.g. 'flooded_house'. */
  id: string;
  /** Display name for the building itself ("Flooded House"). */
  name: string;
  /** Article-friendly noun for hooks ("a flooded house"). */
  hookLabel: string;
  /** Room the player lands in on entry (first non-secret room). */
  entryRoomId: string;
  rooms: BuildingRoom[];
}

export const BUILDINGS: Record<string, BuildingTemplate> = {
  // ── Flooded house — half-drowned in the Aetherstone Flood's leavings.
  flooded_house: {
    id: 'flooded_house',
    name: 'Flooded House',
    hookLabel: 'a flooded house',
    entryRoomId: 'kitchen',
    rooms: [
      {
        id: 'kitchen',
        name: 'The Kitchen',
        shortName: 'Kitchen',
        description:
          'Floodwater laps at a tilted hearth. Swollen cupboards hang open, their contents long since taken by the silt. A cast pot still sits on the cold stove.',
        interactables: ['cupboard', 'hearth', 'pot', 'stove', 'floodwater'],
      },
      {
        id: 'attic',
        name: 'The Attic',
        shortName: 'Attic',
        description:
          'Above the waterline at last, all dust and dry rot. A trunk sits beneath the rafters, and a small round window looks out over the drowned street.',
        interactables: ['trunk', 'rafters', 'window', 'dust'],
      },
      {
        id: 'bedroom',
        name: 'The Bedroom',
        shortName: 'Bedroom',
        description:
          'A bed frame furred with mildew floats half off the floor. A wardrobe leans against the wall, its warped doors swollen shut.',
        interactables: ['bed', 'wardrobe', 'mildew'],
      },
      {
        id: 'study',
        name: 'The Study',
        shortName: 'Study',
        description:
          'Waterlogged books pulp on a sagging shelf. A writing desk holds a single drawer that has not yet given up its secrets.',
        interactables: ['desk', 'drawer', 'shelf', 'books'],
      },
    ],
  },

  // ── Generic abandoned outpost (NOT the faction home base — a found one).
  outpost: {
    id: 'outpost',
    name: 'Abandoned Outpost',
    hookLabel: 'an abandoned outpost',
    entryRoomId: 'hall',
    rooms: [
      {
        id: 'hall',
        name: 'The Great Hall',
        shortName: 'Hall',
        description:
          'A long hall under a sagging roof. Trestle tables run its length, a central fire pit sits cold, and banners hang gone to rags.',
        interactables: ['table', 'fire pit', 'banner', 'bench'],
      },
      {
        id: 'armory',
        name: 'The Armory',
        shortName: 'Armory',
        description:
          'Weapon racks, mostly stripped bare. A whetstone, a barrel of broken hafts, and a weapons chest with a stubborn lock.',
        interactables: ['rack', 'whetstone', 'barrel', 'chest'],
      },
      {
        id: 'cellar',
        name: 'The Cellar',
        shortName: 'Cellar',
        description:
          'Cool dark under the stone. Casks line the walls; a few have not been tapped. Crates molder in the corner.',
        interactables: ['cask', 'crate', 'shelf'],
      },
      {
        id: 'vault',
        name: 'The Vault',
        shortName: 'Vault',
        description:
          'An iron door stands ajar. Strongboxes line the floor, most pried open long ago, one still sealed.',
        interactables: ['strongbox', 'iron door', 'lockbox'],
      },
    ],
  },

  // ── Shack — a three-room hovel.
  shack: {
    id: 'shack',
    name: 'Shack',
    hookLabel: 'a leaning shack',
    entryRoomId: 'den',
    rooms: [
      {
        id: 'den',
        name: 'The Den',
        shortName: 'Den',
        description:
          'A low room with a dead stove and a threadbare rug. A board creaks loose underfoot near the wall.',
        interactables: ['stove', 'rug', 'board'],
      },
      {
        id: 'bedroom',
        name: 'The Bedroom',
        shortName: 'Bedroom',
        description:
          'A single cot, a stool, and a stub of candle burned to the holder. Someone left in a hurry.',
        interactables: ['cot', 'stool', 'candle'],
      },
      {
        id: 'storage',
        name: 'The Storage',
        shortName: 'Storage',
        description:
          'Shelves of odds and ends. Sacks slumped against the wall, dented tins, a loose coil of wire. A plank gate at the back of the room hangs open on the yard.',
        interactables: ['shelf', 'sack', 'tin', 'wire', 'gate'],
        // ⚠ OTA-1430 — the painting shows a SECOND way out here, a gate at the
        // bottom right of the shack, so the storage carries the EXIT chip too.
        exitDoor: true,
      },
    ],
  },

  // ── Shed — a work room, two side rooms, and a hidden cellar revealed by
  //    INVESTIGATE.
  //
  // ⚠⚠ OTA-1430 — THE ART AND THE TEMPLATE DISAGREED, AND THE ART WON. The
  // owner's painting labels FOUR rooms — The Shed, The Bedroom, The Storage and
  // the inset Hidden Cellar — where this template carried only two. Marking a
  // bedroom on the map for a room the player can never walk into is OTA-1402's
  // defect (the game showing a thing it cannot do), so the choice was: leave the
  // shed unmapped, or build the rooms. Owner: *"if it's a mismatch of rooms we
  // might just update the game to match the artwork"*. Built.
  shed: {
    id: 'shed',
    name: 'Shed',
    hookLabel: 'a weathered shed',
    entryRoomId: 'shed',
    rooms: [
      {
        id: 'shed',
        name: 'The Shed',
        shortName: 'Shed',
        description:
          'Tools hang on pegs over a scarred workbench; the air is oil and dust. The floorboards by the bench sit oddly proud, as if something underneath pushes them up.',
        interactables: ['workbench', 'tools', 'pegs', 'floorboards'],
      },
      {
        id: 'bedroom',
        name: 'The Bedroom',
        shortName: 'Bedroom',
        description:
          'Somebody slept in here long after the shed stopped being a shed — a low bed under the eaves, a cupboard of stoppered jars, and a lamp burned down to its socket.',
        interactables: ['bed', 'cupboard', 'jars', 'lamp'],
      },
      {
        id: 'storage',
        name: 'The Storage',
        shortName: 'Storage',
        description:
          'Shelves run the length of the wall, stacked with bottles, tins and sacking. Whatever was worth keeping was kept here, and most of it is still keeping.',
        interactables: ['shelves', 'bottles', 'tins', 'sacking'],
      },
      {
        id: 'cellar',
        name: 'The Hidden Cellar',
        shortName: 'Cellar',
        description:
          'Beneath the lifted boards, a ladder drops into a cramped stone cellar. Whoever dug it did not want it found.',
        interactables: ['ladder', 'crate', 'strongbox'],
        secret: true,
        revealOnInvestigate: 'floorboards',
      },
    ],
  },

  // ── Market — up to four trading stalls. Vendors are layered on later;
  //    the template reserves each stall + its category.
  market: {
    id: 'market',
    name: 'Market',
    hookLabel: 'a roadside market',
    // OTA-787 — you land in the SQUARE first (flavor + a choice of stalls), not
    // straight into a shop. The square isn't a tab (navHidden); its "exits" are
    // the four stall tabs + EXIT.
    entryRoomId: 'market_square',
    rooms: [
      {
        id: 'market_square',
        name: 'The Market Square',
        shortName: 'Square',
        description:
          'You push past the outer carts into the market proper — a press of canvas awnings, lantern smoke, and haggling voices. Stalls ring the square on every side: weapons, armor, food, and materials. Step up to whichever you like, or slip back out the way you came.',
        interactables: ['crowd', 'lanterns'],
        // ⚠⚠ OTA-1430 — THE SQUARE BECAME A TAB. It was navHidden (OTA-787: you
        // land here, and the row is "the four stalls + EXIT"). That was safe
        // only while EXIT stood in every room. Now the exit is tied to the room
        // with the door — which for the market IS the square — so a hidden
        // square would leave a player at the food stall with no tappable way
        // back to it and no EXIT: stranded. Un-hidden, the market reads like
        // every other building: the rooms you can walk to, plus EXIT where the
        // way out actually is.
        anchorNpc: null,
      },
      {
        id: 'weapons_stall',
        name: 'The Weapons Stall',
        shortName: 'Weapons',
        description:
          'A canvas stall hung with blades, hafts, and a crossbow or two on a leather strap.',
        interactables: ['blade', 'haft', 'crossbow', 'rack'],
        stallCategory: 'weapons',
        anchorNpc: null,
      },
      {
        id: 'armor_stall',
        name: 'The Armor Stall',
        shortName: 'Armor',
        description:
          'Mail, plate scraps, and hide rigs hang from a wooden frame, sorted by what still turns a blade.',
        interactables: ['mail', 'plate', 'hide', 'frame'],
        stallCategory: 'armor',
        anchorNpc: null,
      },
      {
        id: 'food_stall',
        name: 'The Food Stall',
        shortName: 'Food',
        description:
          'Smoke and spice. Dried meat on hooks, a kettle of root mash, and sealed rations stacked in a crate.',
        interactables: ['meat', 'kettle', 'rations', 'crate'],
        stallCategory: 'food',
        anchorNpc: null,
      },
      {
        id: 'materials_stall',
        name: 'The Materials Stall',
        shortName: 'Materials',
        description:
          'Bins of scrap, coils of fiber, cut stone, and a tray of salvaged Aetheric bits that hum faintly.',
        interactables: ['scrap', 'fiber', 'stone', 'aetheric bits'],
        stallCategory: 'materials',
        anchorNpc: null,
      },
    ],
  },
};

/** All building template ids. */
export function buildingIds(): string[] {
  return Object.keys(BUILDINGS);
}

/** Out of 100 — how many wilderness tiles carry an enterable structure.
 *  Tuned for "stumble on one every several tiles of exploring" rather than
 *  a building on every screen.
 *  OTA-408 — bumped 12 → 22. Playtester crossed a whole planned route without
 *  running into a single house / shed / structure; at 12% a several-tile course
 *  could miss them entirely. ~22% lands one roughly every 4-5 tiles — frequent
 *  enough to actually encounter on a journey, still not every screen. Buildings
 *  already surface per travel step (the approach line in beginScene), so a higher
 *  rate is all that's needed for them to show up on a course. */
export const BUILDING_TILE_CHANCE = 22;

/** Deterministic "is there an enterable structure standing on this tile?"
 *  Pure function of (locationId, mapX, mapY): the SAME tile always yields
 *  the SAME structure (or none), so buildings persist across revisits and
 *  never flicker in/out when a scene re-rolls — no stored state needed.
 *  Returns a building id, or null for an empty tile. The caller is
 *  responsible for only consulting this on outdoor, peaceful, non-anchor
 *  tiles (we don't want a shed sitting on top of a capital). */
export function buildingForTile(
  locationId: string,
  mapX: number,
  mapY: number,
): string | null {
  // xmur3-style string hash over the tile key — stable and well-mixed.
  const key = `${locationId}:${mapX}:${mapY}`;
  let h = 1779033703 ^ key.length;
  for (let i = 0; i < key.length; i++) {
    h = Math.imul(h ^ key.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = (h ^ (h >>> 16)) >>> 0;
  if (h % 100 >= BUILDING_TILE_CHANCE) return null;
  // OTA-774 — the 'market' template is the Hidden Market's own 4-stall bazaar;
  // it is force-attached ONLY at the hidden_market location (see beginScene).
  // It must never spawn on a random wild tile, or the player finds the same
  // market — off its (47,15) grid home — at ~1-in-5 of every building tile in
  // every location. Exclude it from the generic pick pool.
  const ids = Object.keys(BUILDINGS).filter((id) => id !== 'market');
  // A second, decorrelated draw picks WHICH structure, so the presence
  // roll and the type roll don't move together.
  const pick = Math.imul(h ^ 0x9e3779b9, 2654435761) >>> 0;
  return ids[pick % ids.length] ?? null;
}

/** Look up a building template by id. */
export function getBuilding(id: string | null | undefined): BuildingTemplate | null {
  if (!id) return null;
  return BUILDINGS[id] ?? null;
}

/** Look up a room within a building. */
export function getBuildingRoom(
  buildingId: string | null | undefined,
  roomId: string | null | undefined,
): BuildingRoom | null {
  const b = getBuilding(buildingId);
  if (!b || !roomId) return null;
  return b.rooms.find((r) => r.id === roomId) ?? null;
}

/** The room the player lands in on entry. */
export function buildingEntryRoom(id: string | null | undefined): BuildingRoom | null {
  const b = getBuilding(id);
  if (!b) return null;
  return getBuildingRoom(b.id, b.entryRoomId) ?? b.rooms[0] ?? null;
}

/** ⚠⚠ OTA-1430 — WHICH ROOMS YOU CAN LEAVE FROM. Owner: *"I want the exit tied
 *  to the correct room."* Before this, EXIT stood in every room of a found
 *  building, so the player could step out of a sealed vault or a cellar under
 *  the floorboards straight into the weather.
 *
 *  ⚠ The ENTRY ROOM IS ALWAYS ONE, unconditionally — you walked in through it,
 *  so it has a door by construction, and making it implicit means a new template
 *  is correct with no flag to remember. `exitDoor: true` adds the extra doors a
 *  painting shows. The result is never empty, which is the whole point: OTA-1271
 *  is the record of the owner's own playtest stranded in the outpost workshop by
 *  an exit rule with no floor under it. */
export function buildingExitRooms(id: string | null | undefined): BuildingRoom[] {
  const b = getBuilding(id);
  if (!b) return [];
  const entry = buildingEntryRoom(b.id);
  const out = b.rooms.filter((r) => r.exitDoor && r.id !== entry?.id);
  return entry ? [entry, ...out] : out;
}

/** Can the player step outside from where they are standing? */
export function roomHasExitDoor(
  id: string | null | undefined,
  roomId: string | null | undefined,
): boolean {
  if (!id || !roomId) return false;
  return buildingExitRooms(id).some((r) => r.id === roomId);
}

/** Rooms to show on the nav row: every non-secret room, plus any secret
 *  room whose id is in `revealed`. Order is preserved (entry room first).
 *  This is what the "up to 4 rooms + EXIT" row renders. */
export function visibleBuildingRooms(
  id: string | null | undefined,
  revealed: ReadonlySet<string>,
): BuildingRoom[] {
  const b = getBuilding(id);
  if (!b) return [];
  return b.rooms.filter((r) => !r.secret || revealed.has(r.id));
}

/** If INVESTIGATE-ing `noun` in this building reveals a secret room,
 *  return that room's id (so the caller can add it to the revealed-set).
 *  Matches loosely (substring) so "investigate the floorboards" works. */
export function secretRoomRevealedBy(
  id: string | null | undefined,
  noun: string,
): string | null {
  const b = getBuilding(id);
  if (!b) return null;
  const text = noun.toLowerCase();
  for (const room of b.rooms) {
    if (room.secret && room.revealOnInvestigate) {
      const trigger = room.revealOnInvestigate.toLowerCase();
      if (text.includes(trigger) || trigger.includes(text)) return room.id;
    }
  }
  return null;
}

/** Resolve a tapped/typed room target to a room id within the building.
 *  Buildings are flat (every visible room is directly reachable), so this
 *  matches the input against each visible room's shortName / name / id. */
export function resolveBuildingRoom(
  id: string | null | undefined,
  revealed: ReadonlySet<string>,
  rawInput: string,
): string | null {
  const text = rawInput.toLowerCase();
  for (const room of visibleBuildingRooms(id, revealed)) {
    if (
      text.includes(room.shortName.toLowerCase()) ||
      text.includes(room.name.toLowerCase()) ||
      text.includes(room.id.toLowerCase())
    ) {
      return room.id;
    }
  }
  return null;
}
