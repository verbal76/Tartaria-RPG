// ⚠ OTA-1351 — WHERE EACH ROOM'S NAME IS PAINTED, PER OUTPOST SKIN.
//
// The nine outpost interiors share one floor plan (outpostGraph.ts) but the
// artist did NOT paint every skin's labels in the same chambers: Monarch
// Court and Order Cloister draw the chapel ABOVE the quarters where the
// Reclaimers' art draws it below; Order Cloister floats its workshop label
// in the corridor and its armory label in the northeast chamber; Tomb Vigil
// paints its refectory in the southwest chamber and leaves the chapel's
// chamber unlabeled. The marker must land where the label the player READS
// is — a marker on the "correct" structural chamber under someone else's
// label would read as a bug — so the coordinates here were taken from each
// PNG's painted label, by eye, one skin at a time. Fractions of the square
// 1254×1254 art, same convention as the world atlas.
//
// ⚠ If an outpost PNG is ever redrawn, re-read THAT skin's fifteen labels —
// do not assume the other eight moved.

import type { StructuralId } from './outpostGraph';

type Frac = { fx: number; fy: number };
export type OutpostMarkTable = Record<StructuralId, Frac>;

const RECLAIMERS: OutpostMarkTable = {
  R01: { fx: 0.500, fy: 0.350 }, // The Central Square
  R02: { fx: 0.500, fy: 0.080 }, // The Relic Vault
  R03: { fx: 0.245, fy: 0.150 }, // The Aether Lab
  R04: { fx: 0.740, fy: 0.135 }, // The Workshop
  R05: { fx: 0.300, fy: 0.330 }, // The Mess Hall
  R06: { fx: 0.755, fy: 0.300 }, // The Armory
  R07: { fx: 0.130, fy: 0.310 }, // Sleeping Quarters
  R08: { fx: 0.140, fy: 0.490 }, // The Chapel
  R09: { fx: 0.755, fy: 0.495 }, // The Culvert Descent
  R10: { fx: 0.500, fy: 0.535 }, // The Gate
  R11: { fx: 0.497, fy: 0.680 }, // First Landing
  R12: { fx: 0.497, fy: 0.800 }, // Second Landing
  R13: { fx: 0.307, fy: 0.780 }, // The Pump Room
  R14: { fx: 0.705, fy: 0.780 }, // Storage Halls
  R15: { fx: 0.497, fy: 0.906 }, // The Shallow Digs
};

export const OUTPOST_ROOM_MARKS: Record<string, OutpostMarkTable> = {
  reclaimers_guild: RECLAIMERS,
  mud_monarchs: {
    R01: { fx: 0.497, fy: 0.330 }, // The Court of Standards
    R02: { fx: 0.497, fy: 0.080 }, // The Royal Strongroom
    R03: { fx: 0.277, fy: 0.140 }, // The Cabinet of Curiosities
    R04: { fx: 0.710, fy: 0.145 }, // The Cabinet Workshop
    R05: { fx: 0.310, fy: 0.335 }, // The Banquet Floor
    R06: { fx: 0.745, fy: 0.305 }, // The Court Arsenal
    R07: { fx: 0.163, fy: 0.505 }, // The Retainers' Quarters — painted BELOW the chapel on this skin
    R08: { fx: 0.143, fy: 0.335 }, // The Family Chapel — painted ABOVE the quarters on this skin
    R09: { fx: 0.747, fy: 0.502 }, // The Sub-Court Descent
    R10: { fx: 0.497, fy: 0.512 }, // The Atrium (The Gate)
    R11: { fx: 0.497, fy: 0.685 },
    R12: { fx: 0.495, fy: 0.808 },
    R13: { fx: 0.312, fy: 0.790 },
    R14: { fx: 0.703, fy: 0.784 },
    R15: { fx: 0.497, fy: 0.917 },
  },
  forgotten_order: {
    R01: { fx: 0.492, fy: 0.365 }, // The Sanctum Hall
    R02: { fx: 0.497, fy: 0.090 }, // The Sealed Archive
    R03: { fx: 0.260, fy: 0.180 }, // The High Reading Room
    R04: { fx: 0.494, fy: 0.218 }, // The Vellum Workshop — label floats in the corridor on this skin
    R05: { fx: 0.300, fy: 0.368 }, // The Refectory
    R06: { fx: 0.732, fy: 0.180 }, // The Reliquary Armory — painted in the NE chamber on this skin
    R07: { fx: 0.138, fy: 0.512 }, // The Scriptorium Dormitory — below the cell on this skin
    R08: { fx: 0.136, fy: 0.325 }, // The Reading Cell — above the dormitory on this skin
    R09: { fx: 0.737, fy: 0.497 }, // The Archive Descent
    R10: { fx: 0.490, fy: 0.588 }, // The Threshold
    R11: { fx: 0.495, fy: 0.675 },
    R12: { fx: 0.492, fy: 0.792 },
    R13: { fx: 0.307, fy: 0.783 },
    R14: { fx: 0.697, fy: 0.770 },
    R15: { fx: 0.490, fy: 0.905 },
  },
  true_tartarians: {
    R01: { fx: 0.512, fy: 0.362 }, // The Memorial Hall
    R02: { fx: 0.512, fy: 0.088 }, // The Ancestor Crypt
    R03: { fx: 0.265, fy: 0.152 }, // The Glyph Chamber
    R04: { fx: 0.742, fy: 0.147 }, // The Ancestor Workshop
    R05: { fx: 0.307, fy: 0.342 }, // The Common Hearth
    R06: { fx: 0.755, fy: 0.302 }, // The Forge Shrine
    R07: { fx: 0.135, fy: 0.315 }, // The Ancestor Bunks
    R08: { fx: 0.148, fy: 0.498 }, // The Ancestor Chapel
    R09: { fx: 0.762, fy: 0.497 }, // The Catacomb Descent
    R10: { fx: 0.507, fy: 0.527 }, // The Threshold Stair
    R11: { fx: 0.507, fy: 0.678 },
    R12: { fx: 0.507, fy: 0.798 },
    R13: { fx: 0.312, fy: 0.787 },
    R14: { fx: 0.723, fy: 0.782 },
    R15: { fx: 0.502, fy: 0.912 },
  },
  eternal_dynasty: {
    R01: { fx: 0.505, fy: 0.332 }, // The Throne Promenade
    R02: { fx: 0.502, fy: 0.086 }, // The Imperial Vault
    R03: { fx: 0.267, fy: 0.152 }, // The Library of the Line
    R04: { fx: 0.722, fy: 0.148 }, // The Heir's Workshop
    R05: { fx: 0.317, fy: 0.348 }, // The Imperial Hall
    R06: { fx: 0.735, fy: 0.297 }, // The Heir's Armory
    R07: { fx: 0.148, fy: 0.298 }, // The Royal Quarters
    R08: { fx: 0.153, fy: 0.497 }, // The Coronation Chamber
    R09: { fx: 0.755, fy: 0.480 }, // The Crypt Stair
    R10: { fx: 0.503, fy: 0.531 }, // The Crown Gate
    R11: { fx: 0.503, fy: 0.672 },
    R12: { fx: 0.500, fy: 0.793 },
    R13: { fx: 0.305, fy: 0.777 },
    R14: { fx: 0.712, fy: 0.771 },
    R15: { fx: 0.500, fy: 0.907 },
  },
  conspiracy_architects: {
    R01: { fx: 0.512, fy: 0.371 }, // The Operations Room
    R02: { fx: 0.518, fy: 0.117 }, // The Evidence Vault
    R03: { fx: 0.272, fy: 0.152 }, // The Document Room
    R04: { fx: 0.757, fy: 0.203 }, // The Lab
    R05: { fx: 0.302, fy: 0.328 }, // The Break Room
    R06: { fx: 0.777, fy: 0.328 }, // The Secured Storage
    R07: { fx: 0.257, fy: 0.515 }, // The Safehouse Bunks — inner-south chamber on this skin
    R08: { fx: 0.120, fy: 0.371 }, // The Quiet Office — west-outer chamber on this skin
    R09: { fx: 0.767, fy: 0.522 }, // The Sublevel Access
    R10: { fx: 0.512, fy: 0.559 }, // The Reception
    R11: { fx: 0.512, fy: 0.675 },
    R12: { fx: 0.507, fy: 0.792 },
    R13: { fx: 0.307, fy: 0.782 },
    R14: { fx: 0.727, fy: 0.777 },
    R15: { fx: 0.512, fy: 0.922 },
  },
  servants_of_giants: {
    R01: { fx: 0.497, fy: 0.383 }, // The Tomb-Lit Court
    R02: { fx: 0.503, fy: 0.090 }, // The Reliquary of the Sleepers
    R03: { fx: 0.262, fy: 0.155 }, // The Tomb Records
    R04: { fx: 0.735, fy: 0.158 }, // The Vigil Workshop
    R05: { fx: 0.205, fy: 0.523 }, // The Vigil Refectory — painted in the SW chamber on this skin
    R06: { fx: 0.757, fy: 0.322 }, // The Vigil Forge
    R07: { fx: 0.152, fy: 0.320 }, // The Vigil Cells
    R08: { fx: 0.300, fy: 0.370 }, // The Vigil Chamber — its chamber is UNLABELED on this skin; the
                                   // center-west hall is the only chamber left, so the marker stands there
    R09: { fx: 0.755, fy: 0.517 }, // The Vault Descent
    R10: { fx: 0.497, fy: 0.562 }, // The Vigil Door
    R11: { fx: 0.512, fy: 0.702 },
    R12: { fx: 0.500, fy: 0.817 },
    R13: { fx: 0.300, fy: 0.812 },
    R14: { fx: 0.712, fy: 0.807 },
    R15: { fx: 0.495, fy: 0.933 },
  },
  stone_builders: {
    R01: { fx: 0.512, fy: 0.363 }, // The Plan Floor
    R02: { fx: 0.512, fy: 0.125 }, // The Materials Vault
    R03: { fx: 0.275, fy: 0.148 }, // The Drafting Office
    R04: { fx: 0.753, fy: 0.152 }, // The Aethercraft Smithy
    R05: { fx: 0.310, fy: 0.352 }, // The Mess Bench
    R06: { fx: 0.762, fy: 0.308 }, // The Forge Shrine
    R07: { fx: 0.140, fy: 0.313 }, // The Crew Bunks
    R08: { fx: 0.143, fy: 0.507 }, // The Plan Room
    R09: { fx: 0.770, fy: 0.512 }, // The Foundation Descent
    R10: { fx: 0.513, fy: 0.527 }, // The Tool Threshold (The Gate)
    R11: { fx: 0.515, fy: 0.677 },
    R12: { fx: 0.512, fy: 0.793 },
    R13: { fx: 0.315, fy: 0.790 },
    R14: { fx: 0.730, fy: 0.782 },
    R15: { fx: 0.508, fy: 0.910 },
  },
  tartarian_revivalists: {
    R01: { fx: 0.512, fy: 0.387 }, // The Rally Hall
    R02: { fx: 0.522, fy: 0.105 }, // The Field Vault
    R03: { fx: 0.258, fy: 0.157 }, // The Evidence Room
    R04: { fx: 0.750, fy: 0.155 }, // The Field Shop
    R05: { fx: 0.310, fy: 0.365 }, // The Cell Mess
    R06: { fx: 0.765, fy: 0.322 }, // The Cell Cache
    R07: { fx: 0.133, fy: 0.320 }, // The Cell Bunks — the art paints this chamber "The Crash Room" (the
                                   // known label mismatch from the R07 audit); the marker stands on it anyway
    R08: { fx: 0.140, fy: 0.513 }, // The Cell Sanctum
    R09: { fx: 0.772, fy: 0.518 }, // The Storage Descent
    R10: { fx: 0.512, fy: 0.578 }, // The Stand-Down
    R11: { fx: 0.508, fy: 0.687 },
    R12: { fx: 0.508, fy: 0.815 },
    R13: { fx: 0.307, fy: 0.812 },
    R14: { fx: 0.728, fy: 0.805 },
    R15: { fx: 0.505, fy: 0.933 },
  },
};

/** Where a room's marker stands on the given faction's outpost art. Falls back
 *  to the Reclaimers' (base-skin) table for an unknown faction id, so a marker
 *  is always drawn somewhere sensible rather than not at all. */
export function outpostRoomMark(factionId: string | null | undefined, structuralId: StructuralId): Frac {
  const table = (factionId && OUTPOST_ROOM_MARKS[factionId]) || RECLAIMERS;
  return table[structuralId];
}
