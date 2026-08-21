// ⚠⚠ OTA-1428 — THE FOUND HALL: ITS NAMES, ITS MAP, AND WHICH WAY EACH ROOM LIES.
//
// Owner, after walking one: *"what type of building has a hall and armory a
// cellar in a vault?"* — then, on being told it was the template named
// `Abandoned Outpost`: *"can we keep a list of multiple names for this and just
// have it randomly pull one as we find it? and use this image for both the
// mini-map like we do the Outpost and for the atlas. also use the ✓ symbol for
// visited rooms and directional arrows."*
//
// ⚠ WHY IT NEEDED A NEW NAME AT ALL. The template was called "Abandoned
// Outpost", and the faction home base is also an outpost. `buildings.ts` carried
// a comment saying so — *"(NOT the faction home base — a found one)"* — which is
// the tell that the name had already misled somebody. It misled this session
// too: asked what the building was, the first answer described the faction hub's
// rooms and NPCs, none of which are in it. One word doing two jobs, the same
// species as `preview` (OTA-1418/1419), `empty` (OTA-1119) and `hunger`
// (OTA-1118). Every one of those was fixed by splitting the word, not by adding
// a comment.
//
// ⚠ WHAT THE BUILDING ACTUALLY IS, from its own four rooms: a great hall with
// trestle tables and a cold central fire pit, an armory, a cellar of casks, and
// a strongbox vault. That is a HALL-HOUSE — the seat of an armed company that
// ate together, armed itself, and kept a treasury. Not a police station (no
// cells, no watch room) and not an armoury (the armoury is one room of four and
// the hall dominates). The names below are all readings of that one plan.

import type { BuildingRoom } from './buildings';

/** ⚠ Every name here has to fit ALL FOUR ROOMS, because the floor plan is fixed
 *  and the art is one painting. A "Drowned Chapel" would promise a chapel the
 *  player will never find — the OTA-1402 failure (the game saying a thing it
 *  cannot do) applied to signage. Each of these reads as a hall a company kept. */
export const MUSTER_HALL_NAMES: readonly string[] = [
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
] as const;

/** The lowercase form used in the world-map hook line ("you spot …"). */
export function musterHallHookLabel(name: string): string {
  const lower = name.replace(/^The\s+/i, '').toLowerCase();
  return /^[aeiou]/.test(lower) ? `an ${lower}` : `a ${lower}`;
}

/** ⚠⚠ STABLE PER PLACE, NOT PER LOOK. The owner asked for a name pulled "as we
 *  find it" — but a name re-rolled on every entry would rename a hall the player
 *  had already walked out of and come back to, which reads as a different
 *  building on the same tile. Hashed from the tile key instead: random ACROSS
 *  the world, fixed for any one hall, and free of any save migration because
 *  nothing has to be stored. Same reasoning as the fusion namer's input hash. */
export function musterHallNameFor(tileKey: string): string {
  let h = 2166136261;
  for (let i = 0; i < tileKey.length; i++) {
    h ^= tileKey.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return MUSTER_HALL_NAMES[Math.abs(h) % MUSTER_HALL_NAMES.length]!;
}

// ── The map ────────────────────────────────────────────────────────────────

/** Painting aspect (1122 × 1402). Mirrors OUTPOST_ASPECT's role: the minimap and
 *  the atlas both need it to letterbox without stretching the art. */
export const MUSTER_HALL_ASPECT = 1122 / 1402;

export type Frac = { fx: number; fy: number };

/** ⚠ Fractional room centres on the painting, hand-placed against the labelled
 *  chambers exactly as `outpostRoomMarks.ts` does. The great hall's mark sits at
 *  its LABEL rather than at the geometric centre of the spine: the spine runs
 *  almost the full height, so its true centre would put the player marker in a
 *  corridor with no furniture and read as nowhere. */
export const MUSTER_HALL_ROOM_MARKS: Readonly<Record<string, Frac>> = {
  hall: { fx: 0.497, fy: 0.405 },
  armory: { fx: 0.220, fy: 0.428 },
  cellar: { fx: 0.784, fy: 0.430 },
  vault: { fx: 0.497, fy: 0.858 },
};

/** ⚠⚠ THE DIRECTIONS ARE READ OFF THE PAINTING, not invented. The hall is the
 *  spine; the armory is the west wing, the cellar the east wing, the vault the
 *  south end past the double doors. A player looking at the art and a player
 *  reading the chips must agree, or the arrows are worse than none. */
const MUSTER_HALL_DIR: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  hall: { armory: 'W', cellar: 'E', vault: 'S' },
  armory: { hall: 'E', cellar: 'E', vault: 'SE' },
  cellar: { hall: 'W', armory: 'W', vault: 'SW' },
  vault: { hall: 'N', armory: 'NW', cellar: 'NE' },
};

const ARROW: Readonly<Record<string, string>> = {
  N: '↑', S: '↓', E: '→', W: '←', NE: '↗', NW: '↖', SE: '↘', SW: '↙',
};

/** The compass letter from one room to another, or '' when they are the same
 *  room or either id is unknown. */
export function musterHallDirection(fromRoomId: string, toRoomId: string): string {
  if (fromRoomId === toRoomId) return '';
  return MUSTER_HALL_DIR[fromRoomId]?.[toRoomId] ?? '';
}

/** The arrow glyph for a travel chip, or '' when there is nothing to point at.
 *  ⚠ Returns EMPTY rather than a placeholder: a chip with no arrow reads as "no
 *  direction known", where a wrong arrow reads as a direction and sends the
 *  player the wrong way. */
export function musterHallArrow(fromRoomId: string, toRoomId: string): string {
  return ARROW[musterHallDirection(fromRoomId, toRoomId)] ?? '';
}

/** ⚠ The chip label the player taps: arrow, room name, and a ✓ once the room has
 *  been walked THIS VISIT. Building state is transient by design (see gameStore's
 *  activeBuildingId comment — saving inside a building reloads you outside), so
 *  these marks are per-visit, which is also what outpost marks became at
 *  OTA-1410 after the owner reported a new outpost arriving pre-ticked. */
export function musterHallChipLabel(
  fromRoomId: string,
  room: Pick<BuildingRoom, 'id' | 'shortName' | 'name'>,
  visitedRoomIds: readonly string[],
): string {
  const arrow = musterHallArrow(fromRoomId, room.id);
  const tick = visitedRoomIds.includes(room.id) && room.id !== fromRoomId ? ' ✓' : '';
  return `${arrow ? `${arrow} ` : ''}${room.shortName || room.name}${tick}`;
}
