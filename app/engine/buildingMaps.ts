// ⚠⚠ OTA-1429 — ONE TABLE FOR EVERY PAINTED BUILDING.
//
// OTA-1428 gave the found hall a name pool, a floor plan, direction arrows and
// per-visit ✓ marks, and wrote all of it as `musterHall.ts` — a module named
// after one building because there was only one. The owner then sent the flooded
// house's painting, and a second copy of that file would have been the start of
// the drift this session has repaired six times: two tables, two direction maps,
// two chip builders, and the first bug fixed in only one of them.
//
// So the shape moved into a table keyed by building id. Adding a third painted
// building is now an entry — art, aspect, marks, directions, names — and every
// consumer (minimap, atlas, chips, the approach line) picks it up untouched.
//
// ⚠ AS OF OTA-1430 EVERY BUILDING TEMPLATE IS IN HERE — the owner sent all five
// paintings. The `buildingMap() === undefined` branches in the minimap, the
// atlas and the chip row are therefore UNEXERCISED IN PRODUCTION but must stay:
// they are what a sixth template gets on the day it lands and before its art
// does. An arrow needs a plan to point at, and inventing one for a flat room
// list would put a direction on screen that nothing on the floor agrees with —
// so an unpainted building falls back to plain chips, not to a guess.

import type { BuildingRoom } from './buildings';

export type Frac = { fx: number; fy: number };
export type Compass = 'N' | 'S' | 'E' | 'W' | 'NE' | 'NW' | 'SE' | 'SW';

export interface BuildingMap {
  /** The painting, required from both the minimap and the atlas. */
  art: number;
  /** width / height of that painting. The atlas letterboxes against it, and the
   *  glyph scale divides by its width — a shared constant would draw one
   *  building's marks at another's size. */
  aspect: number;
  /** Natural pixel width, for the overlay glyph scale. */
  artWidth: number;
  /** Fractional room centres, hand-placed against the painted chambers. */
  marks: Readonly<Record<string, Frac>>;
  /** from → to → compass point, read OFF the painting. */
  dirs: Readonly<Record<string, Readonly<Record<string, Compass>>>>;
  /** ⚠ Names this building can be found under. Every one must fit EVERY room in
   *  the template — a name promising a room the player will never find is
   *  OTA-1402's defect (the game saying a thing it cannot do) applied to
   *  signage. EMPTY means "one fixed place, keep the template's own name" —
   *  see MARKET. */
  names: readonly string[];
}

/** ⚠ THE FOUND HALL — great hall, armory, cellar, vault. A hall-house: the seat
 *  of an armed company that ate together, armed itself and kept a treasury.
 *  Renamed away from "Abandoned Outpost" at OTA-1428 because the faction home
 *  base is also an outpost, and the shared word had already misled a reader. */
const MUSTER_HALL: BuildingMap = {
  art: require('../../assets/buildings/muster_hall.png'),
  aspect: 1122 / 1402,
  artWidth: 1122,
  // ⚠ The great hall's mark sits at its LABEL, not the geometric centre of the
  // spine: the spine runs nearly the full height, so its true centre lands in
  // bare corridor and reads as nowhere.
  marks: {
    hall: { fx: 0.497, fy: 0.405 },
    armory: { fx: 0.220, fy: 0.428 },
    cellar: { fx: 0.784, fy: 0.430 },
    vault: { fx: 0.497, fy: 0.858 },
  },
  dirs: {
    hall: { armory: 'W', cellar: 'E', vault: 'S' },
    armory: { hall: 'E', cellar: 'E', vault: 'SE' },
    cellar: { hall: 'W', armory: 'W', vault: 'SW' },
    vault: { hall: 'N', armory: 'NW', cellar: 'NE' },
  },
  names: [
    'Abandoned Muster Hall',
    'Derelict Company Hall',
    'The Empty Garrison',
    'Ruined Chapter House',
    'The Silent Muster',
    'Forsaken Warden Hall',
    'The Hollow Barracks-Hall',
    'Old Retainer Hall',
    'The Stripped Garrison',
    'Abandoned Levy Hall',
    'The Quiet Commandery',
    'Ruined Banner Hall',
  ],
};

/** ⚠ THE FLOODED HOUSE — attic, bedroom, study, kitchen. A drowned family home,
 *  not a ruin of anything grander: the painting's beds, cookpots and desk are a
 *  household's, and every name below has to stay a HOUSE. "Sunken Manor" would
 *  promise wings and servants' stairs the four rooms do not have. */
const FLOODED_HOUSE: BuildingMap = {
  art: require('../../assets/buildings/flooded_house.png'),
  aspect: 1370 / 1148,
  artWidth: 1370,
  // ⚠ Landscape, unlike the hall — the stair runs up the middle, the attic sits
  // ABOVE it in the painting rather than beside it. Attic north, bedroom west,
  // study east, kitchen south.
  marks: {
    attic: { fx: 0.518, fy: 0.145 },
    bedroom: { fx: 0.312, fy: 0.470 },
    study: { fx: 0.723, fy: 0.415 },
    kitchen: { fx: 0.487, fy: 0.735 },
  },
  dirs: {
    attic: { bedroom: 'SW', study: 'SE', kitchen: 'S' },
    bedroom: { attic: 'NE', study: 'E', kitchen: 'SE' },
    study: { attic: 'NW', bedroom: 'W', kitchen: 'SW' },
    kitchen: { attic: 'N', bedroom: 'NW', study: 'NE' },
  },
  names: [
    'A Flooded House',
    'The Drowned Cottage',
    'A Silted Farmhouse',
    'The Sunken Homestead',
    'A Waterlogged Croft',
    'The Abandoned Steading',
    'A Mud-Choked House',
    'The Empty Freeholding',
    'A Ruined Smallhold',
    'The Quiet Tenement',
  ],
};

/** ⚠ THE SHACK — den, bedroom, storage. Three rooms and a stove: somebody was
 *  LIVING here, recently enough that the lamp is still on the table. The names
 *  stay small and lived-in; "Ruined Lodge" or "Abandoned Hall" would promise a
 *  building three times this size. */
const SHACK: BuildingMap = {
  art: require('../../assets/buildings/shack.png'),
  aspect: 1402 / 1122,
  artWidth: 1402,
  // ⚠ Not a cross like the other two: the den takes the whole west side, and
  // the bedroom and storage stack down the east. So den→bedroom is NE and
  // den→storage SE, where a naive "left/right" reading would call both E.
  marks: {
    den: { fx: 0.345, fy: 0.374 },
    bedroom: { fx: 0.693, fy: 0.349 },
    storage: { fx: 0.694, fy: 0.610 },
  },
  dirs: {
    den: { bedroom: 'NE', storage: 'SE' },
    bedroom: { den: 'SW', storage: 'S' },
    storage: { den: 'NW', bedroom: 'N' },
  },
  names: [
    'A Leaning Shack',
    'The Tin-Roof Shack',
    'A Squatter\'s Shack',
    'The Last Holdout',
    'A Driftwood Shack',
    'The Patchwork Hovel',
    'A Scavenger\'s Shack',
    'The Bolt-Hole',
    'A Tar-Paper Shack',
    'The Quiet Hovel',
  ],
};

/** ⚠ THE HIDDEN MARKET — square, weapons, armor, food, materials. Five rooms,
 *  not four, and the only painted building with a room the nav row hides: the
 *  square is `navHidden` (OTA-787 — its "exits" are the four stall tabs), so it
 *  never appears as a chip but DOES need a mark, because it is where the player
 *  is standing when they open the atlas on arrival.
 *
 *  ⚠⚠ AND IT IS THE ONLY ONE WITH NO NAME POOL, DELIBERATELY. The other three
 *  are found — a different one on every tile that rolls them, so a pool reads as
 *  variety. The market is force-attached at the hidden_market location and
 *  nowhere else (buildings.ts excludes it from the wild pick pool), so it is ONE
 *  place in the world. Rolling a name for it would rename a landmark the player
 *  has been told about and routed to. Empty pool → `foundBuildingName` falls
 *  through to the template's own name and hookLabel, which is the old behaviour
 *  exactly. */
const MARKET: BuildingMap = {
  art: require('../../assets/buildings/market.png'),
  aspect: 1402 / 1122,
  artWidth: 1402,
  // ⚠ Four stalls on the corners with the square in the middle — the only plan
  // so far where every room is diagonal from the room you start in.
  marks: {
    market_square: { fx: 0.494, fy: 0.456 },
    weapons_stall: { fx: 0.274, fy: 0.178 },
    armor_stall: { fx: 0.745, fy: 0.181 },
    food_stall: { fx: 0.217, fy: 0.595 },
    materials_stall: { fx: 0.774, fy: 0.587 },
  },
  dirs: {
    market_square: { weapons_stall: 'NW', armor_stall: 'NE', food_stall: 'SW', materials_stall: 'SE' },
    weapons_stall: { market_square: 'SE', armor_stall: 'E', food_stall: 'S', materials_stall: 'SE' },
    armor_stall: { market_square: 'SW', weapons_stall: 'W', food_stall: 'SW', materials_stall: 'S' },
    food_stall: { market_square: 'NE', weapons_stall: 'N', armor_stall: 'NE', materials_stall: 'E' },
    materials_stall: { market_square: 'NW', weapons_stall: 'NW', armor_stall: 'N', food_stall: 'W' },
  },
  names: [],
};

/** ⚠ THE SHED — shed, bedroom, storage, and the hidden cellar. The only plan
 *  with a SECRET room on it: the cellar is drawn as a dashed inset off the
 *  bottom-right of the painting, because it is under the floor rather than
 *  beside anything. Its mark sits inside that inset, so the ✓ and the marker
 *  land where the reader's eye already is.
 *
 *  ⚠⚠ Two of these four rooms did not exist until OTA-1430. The painting named
 *  them; the template had only shed + cellar. See buildings.ts. */
const SHED: BuildingMap = {
  art: require('../../assets/buildings/shed.png'),
  aspect: 1402 / 1122,
  artWidth: 1402,
  marks: {
    shed: { fx: 0.330, fy: 0.380 },
    bedroom: { fx: 0.660, fy: 0.256 },
    storage: { fx: 0.683, fy: 0.464 },
    cellar: { fx: 0.735, fy: 0.835 },
  },
  dirs: {
    shed: { bedroom: 'NE', storage: 'E', cellar: 'SE' },
    bedroom: { shed: 'SW', storage: 'S', cellar: 'S' },
    storage: { shed: 'W', bedroom: 'N', cellar: 'S' },
    cellar: { shed: 'NW', bedroom: 'N', storage: 'N' },
  },
  names: [
    'A Weathered Shed',
    'The Tool Shed',
    'A Leaning Outbuilding',
    'The Back Shed',
    'A Tin-Roof Shed',
    'The Old Workshed',
    'A Storm Shed',
    'The Quiet Outbuilding',
    'A Salvager\'s Shed',
    'The Boarded Shed',
  ],
};

export const BUILDING_MAPS: Readonly<Record<string, BuildingMap>> = {
  outpost: MUSTER_HALL,
  flooded_house: FLOODED_HOUSE,
  shack: SHACK,
  market: MARKET,
  shed: SHED,
};

/** The painted plan for a building, or undefined when it has none. Every
 *  consumer branches on this rather than on a hard-coded id, so a third
 *  painting is one table entry and no UI edits. */
export function buildingMap(buildingId: string | null | undefined): BuildingMap | undefined {
  return buildingId ? BUILDING_MAPS[buildingId] : undefined;
}

// ── Names ──────────────────────────────────────────────────────────────────

/** ⚠⚠ STABLE PER PLACE, NOT PER LOOK. The owner asked for a name pulled "as we
 *  find it" — but a fresh roll per entry renames the same building on the same
 *  tile every time the player walks out and back in, which reads as a different
 *  building. Hashed from the tile key instead: random ACROSS the world, fixed
 *  for any one place, and stored nowhere, so no save migration and no new field.
 *  Same reasoning as the fusion namer's input hash. */
export function buildingNameFor(buildingId: string, tileKey: string): string | undefined {
  const map = buildingMap(buildingId);
  if (!map || map.names.length === 0) return undefined;
  let h = 2166136261;
  for (let i = 0; i < tileKey.length; i++) {
    h ^= tileKey.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return map.names[Math.abs(h) % map.names.length];
}

/** The lowercase, article-carrying form for the approach line ("you spot …").
 *  ⚠ Strips a leading article the name already carries, so "A Flooded House"
 *  and "The Empty Garrison" both come out with exactly one. */
export function buildingHookLabel(name: string): string {
  const lower = name.replace(/^(the|a|an)\s+/i, '').toLowerCase();
  return /^[aeiou]/.test(lower) ? `an ${lower}` : `a ${lower}`;
}

// ── Directions ─────────────────────────────────────────────────────────────

const ARROW: Readonly<Record<Compass, string>> = {
  N: '↑', S: '↓', E: '→', W: '←', NE: '↗', NW: '↖', SE: '↘', SW: '↙',
};

export function buildingDirection(buildingId: string, from: string, to: string): Compass | '' {
  if (from === to) return '';
  return buildingMap(buildingId)?.dirs[from]?.[to] ?? '';
}

/** The arrow glyph for a travel chip, or '' when there is nothing to point at.
 *  ⚠ EMPTY rather than a placeholder: a chip with no arrow reads as "direction
 *  unknown", where a wrong arrow reads as a direction and walks the player the
 *  wrong way. */
export function buildingArrow(buildingId: string, from: string, to: string): string {
  const d = buildingDirection(buildingId, from, to);
  return d ? ARROW[d] : '';
}

/** The chip the player taps: arrow, room name, and a ✓ once the room has been
 *  walked THIS VISIT. Building state is transient by design (gameStore's
 *  activeBuildingId comment — a save made inside reloads you outside), so the
 *  marks are per-visit, which is also what outpost marks became at OTA-1410
 *  after the owner found a brand-new outpost already ticked. */
export function buildingChipLabel(
  buildingId: string,
  fromRoomId: string,
  room: Pick<BuildingRoom, 'id' | 'shortName' | 'name'>,
  visitedRoomIds: readonly string[],
): string {
  const arrow = buildingArrow(buildingId, fromRoomId, room.id);
  const tick = visitedRoomIds.includes(room.id) && room.id !== fromRoomId ? ' ✓' : '';
  return `${arrow ? `${arrow} ` : ''}${room.shortName || room.name}${tick}`;
}
