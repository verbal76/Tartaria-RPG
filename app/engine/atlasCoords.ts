// OTA 053 — Atlas dot calibration for the redrawn world map.
// OTA 052 hit 20/21 coverage on the redrawn landscape atlas; this
// revision adds the previously-missing Obsidian Pillars icon (now
// drawn with the Tartarian observatory alongside it). Full coverage:
// every one of the 21 named locations resolves to a canonical icon
// position.
//
// Image: assets/world-atlas.png. ⚠ THE PIXEL SIZE OF THAT FILE IS EXPORTED FROM HERE
// (`ATLAS_PIXEL_W` / `ATLAS_PIXEL_H`, just below) because THREE separate things need it and
// must never disagree: the letterbox maths that turns a fraction into a screen position, the
// overlay-label scale, and the name-label solver in `atlasLabels.ts`. It used to be typed
// out again inside MapScreen.tsx, where the comment said in as many words that the two
// copies MUST match — a rule with no mechanism behind it. Now there is one number.
//
// Fractional coordinates are measured against that pixel canvas. They are aspect-agnostic:
// a landmark at fx 0.5 is half way across whatever the art's real dimensions turn out to be.
//
// The new map is geographic (locations placed by lore canon) rather
// than concentric (the old map's danger rings around a central
// Outpost). The Outpost sits in the upper-left at (0.10, 0.13).
// For the player's procedural-grid offset fallback, the dot still
// anchors at the Outpost icon and walks outward by mapX/mapY
// offsets — east-of-Outpost moves the dot right, south moves it
// down, etc. The dot is clamped to the visible image area so it
// can never drift into the insets or off-screen.

// ⚠⚠ THE LIVE ASSET'S REAL PIXEL DIMENSIONS. If the artwork is replaced, these change with
// it in the same commit. The dot maths is aspect-driven — a wrong ratio here does not throw,
// it silently slides every marker off the landmark it is supposed to be standing on.
//
// History: 1408×768 (hand-drawn) → 1774×887 / 2.0:1 (first commission) → 1619×971 / 1.6674:1
// (the redrawn atlas, which is 5:3 to within 0.04% — the map spec asked for exactly 5:3).
export const ATLAS_PIXEL_W = 1619;
export const ATLAS_PIXEL_H = 971;

export interface AtlasCoord {
  /** X position as a fraction of image width (0..1). */
  fx: number;
  /** Y position as a fraction of image height (0..1). */
  fy: number;
}

// The Outpost icon — also the anchor for the grid-offset fallback.
export const OUTPOST_ATLAS_COORD: AtlasCoord = { fx: 0.10, fy: 0.13 };

// ⚠⚠ OTA-1338 SCRUB — the per-tile marker-drift constants (STEP_FRAC_X/Y, DOT_TILE_FRAC)
// lived here from OTA 019 to OTA-1332. They fed the "you are here" dot the map has not
// drawn since OTA-182 removed it, and their anisotropy maths was computed for artwork two
// generations old (1408×768 / 1.83:1 — the live art is 1619×971 / 5:3). Deleted with the
// rest of the dead marker pipeline rather than recalibrated for a dot nobody draws.

// Locations the new atlas depicts as labeled icons. Coordinates
// are measured against each icon's visual center.
//
// v2.4.1 (OTA 029) — historical note: first calibrated against a 140×78 grid overlay on
// the ORIGINAL 1408×768 hand-drawn art. Fractions are canvas-agnostic, which is why they
// survived two artwork replacements. Largest shifts back then: asgardar +
// drakova + giant_vault + etheric_chamber + mud_flood_nexus all
// nudged south/east a few percent to match the actual icon centers.
// Smaller (~1-2%) adjustments to the upper band as well.
export const LOCATION_ATLAS_COORDS: Record<string, AtlasCoord> = {
  // The Outpost / Outskirts cluster
  tartarian_outskirts: { fx: 0.10, fy: 0.13 },

  // arb92 — themed low-danger frontier outposts (faction starts). Plotted
  // along the safe top frontier band, each roughly above the capital region
  // its faction will journey down toward.
  monarch_waystation: { fx: 0.14, fy: 0.08 },
  dynasty_border_post: { fx: 0.23, fy: 0.09 },
  pilgrim_waycamp: { fx: 0.32, fy: 0.08 },
  builders_survey_camp: { fx: 0.41, fy: 0.09 },
  giant_watch_shrine: { fx: 0.55, fy: 0.08 },
  revivalist_field_camp: { fx: 0.70, fy: 0.09 },
  reclaimer_stake: { fx: 0.06, fy: 0.16 },
  architect_blind: { fx: 0.10, fy: 0.20 },

  // Northern band — surface ruins and weather lines
  sinking_cathedral: { fx: 0.36, fy: 0.12 },
  cradle_of_dusk: { fx: 0.62, fy: 0.17 },
  buried_cities: { fx: 0.31, fy: 0.22 },
  great_tartary_plains: { fx: 0.48, fy: 0.20 },
  mud_seas: { fx: 0.71, fy: 0.22 },
  obsidian_pillars: { fx: 0.38, fy: 0.33 },
  zharaks_teeth: { fx: 0.53, fy: 0.29 },

  // ⚠⚠ OTA-1496 — THE CAPITALS SPREAD OUT. OWNER, 2026-08-25: *"I would like to
  // see at least 20 spaces between the capitals… nothing is nailed down, we just
  // made it so that the capitals were roughly arranged correctly and filled onto
  // one of the city looking pieces on the map — can we spread them out?"*
  //
  // ⚠⚠ THE MEASUREMENT FIRST: Drakova↔Voronov sat 2 tiles apart, Asgardar↔Samarran
  // 6, and 18 of the 36 capital pairs were under 20. The drawable pin band
  // (fx 0.05–0.95 / fy 0.05–0.97 — the atlas guard) maps to a 37×21-tile box at
  // SPREAD 40/22, and 9 points pairwise ≥20 tiles PROVABLY cannot fit in it (z3
  // UNSAT; at 20 only 7 fit). ≥16 fits only as a ring that exiles Nimari from the
  // centre; **14** is the most the map gives while Nimari keeps the middle seat
  // and every capital keeps its compass identity. So: every pair of Lost Capitals
  // is now ≥14 tiles apart (worst pair was 2), the mutual east/west/north/south
  // ordering of every clearly-ordered pair is preserved, and each moved pin was
  // re-seated on painted art where the geometry allowed (ota1496 suite holds the
  // spacing as a ratchet).
  //
  // ⚠ NIMARI DID NOT MOVE, deliberately — it is the centre capital, and its Red
  // Tower (42,22) is pinned by id in tests and lore. The three satellite towers
  // move WITH their capitals (owner, same day: "one of the spires is tied to one
  // of the capitals as it's in the outskirts — it moves too"): the Asgardar spire
  // stays exactly two tiles south of Asgardar, Thametan's Tower keeps its (+2,+2)
  // to Samarran, the Red Tower its (+1,+2) to Nimari.

  // West arc — Asgardar now the south-west seat, on the scorched ground just
  // below the walled ruin at the painted west edge; its collector-spire two
  // tiles south, at the round spire-platform the art conveniently keeps there
  // (grid (23,25) / (23,27); the atlasCoords adjacency test holds capital and
  // tower within 0.10 of each other per axis, which is why both pins hug the
  // near edges of their cells).
  asgardar: { fx: 0.058, fy: 0.744 },
  grand_spire_of_asgardar: { fx: 0.0585, fy: 0.805 },
  // Samarran west-mid on the long colonnade ruin (grid (30,17)); Thametan's
  // Tower two east / two south of it — which lands the tower on the domed city
  // that used to be Samarran's own silhouette. The tower keeps the old city.
  samarran: { fx: 0.235, fy: 0.379 },
  thametans_tower: { fx: 0.265, fy: 0.470 },

  // Center & east — capitals + buried cities
  nimari: { fx: 0.50, fy: 0.50 },
  red_tower_of_nimari: { fx: 0.52, fy: 0.60 },
  // Drakova on the gate-tower city north-east of centre (grid (51,16));
  // Voronov on the bastion tower in the scorched south-east (grid (48,27)).
  // They were the 2-tile pair; they are now 14 apart and Voronov is properly
  // SOUTH of Drakova rather than its next-door neighbour.
  drakova: { fx: 0.750, fy: 0.318 },
  voronov: { fx: 0.670, fy: 0.813 },

  // Southern arc — Forgotten Order stronghold + deep frontier
  varakush: { fx: 0.28, fy: 0.74 },
  endless_stair: { fx: 0.59, fy: 0.76 },

  // v2.4.1 (OTA 052) — four additional Lost Capitals so the count
  // matches the 9 playable factions. OTA-1496 pushed each further into its own
  // corner of the compass so no capital pair is under 14 tiles.
  iskan_veil:  { fx: 0.057, fy: 0.060 },  // far northwest corner — Architect's hidden city; the pin sits on bare veil-marsh beside a tented camp, which is exactly how a hidden city should read (grid (23,10))
  yuldra_tul:  { fx: 0.944, fy: 0.060 },  // northeast peaks — Giants' tomb-gate, now high in the painted mountain range above the great mountain city (grid (59,10))
  ostragar:    { fx: 0.9445, fy: 0.663 }, // far east cliffs — river-dynasty city, at the southern approach of the lit cliff-city (grid (59,24))
  karok_sa:    { fx: 0.386, fy: 0.887 },  // deep south — Forgotten Order ritual seat, the southern grounds of the round ritual arena (grid (36,29))

  // arb46 — Tier-C challenge tiles (plotted but discoverable:false until the
  // challenges are reviewed + turned on). Placed in previously-empty regions.
  tartarian_enclave: { fx: 0.24, fy: 0.40 },  // deep beneath the Buried Cities
  parley_ground:     { fx: 0.64, fy: 0.36 },  // east-central contested flats (neutral)

  // The Deep — Aetherstone-tier sites at the map's bottom
  giant_vault: { fx: 0.78, fy: 0.86 },
  etheric_chamber: { fx: 0.88, fy: 0.87 },
  // ⚠ NUDGED NORTH ONE ROW (was fy 0.94 → cell (55,30)). Nothing was wrong with the old
  // spot; it was simply the southernmost row a pin can occupy and still sit inside the
  // painted area, and the Black Reach has to be BELOW it. See the note directly below.
  mud_flood_nexus: { fx: 0.84, fy: 0.905 },
  // ⚠⚠ OWNER, 2026-08-17: *"The black reach is the most southern point on the map. it's at
  // the 6:00 position directly under the mud flood Nexus"* — and *"let's move the etheria
  // spire 2 tiles west of the the black reach."* Both hold literally on the grid, which is
  // why they are recorded here as coordinates rather than described in prose: the Nexus sits
  // at (55,29), the Reach at (55,30) — same column, one row further south, and no static
  // location is south of it. The spire lands at (53,30): same row, exactly two columns west.
  //
  // ⚠⚠ THE FIRST ATTEMPT PUT THESE AT fy 0.98 AND THE ATLAS SUITE WAS RIGHT TO REJECT IT.
  // `atlasCoords.test.ts` holds every overworld pin inside fx 0.05–0.95 / fy 0.05–0.97, so a
  // marker always lands on real image rather than hanging off an edge — a glyph is drawn
  // centred on its point, so at 0.98 half of it is simply not on the canvas. Since row 30
  // was the last row inside that band and the Nexus already held it, the honest fix was to
  // move the Nexus up one and put the Reach beneath it, NOT to loosen the guard. Cost: one
  // tile of travel distance to the Nexus. That is the whole price, and it is worth paying to
  // keep every pin drawable.
  black_reach: { fx: 0.85, fy: 0.955 },
  grand_spire_of_etheria: { fx: 0.80, fy: 0.955 },
  // NOTE: the Hidden Market is deliberately NOT here — its "?" overlay coord lives
  // on the hidden-location record (engine/hiddenLocations.ts) so it doesn't perturb
  // the IDW player-dot interpolation that uses every entry in this table as an anchor.
};

/**
 * Look up the atlas coordinate for a location id.
 * Returns null when the location has no depicted icon on the atlas
 * (caller should fall back to the grid-offset model).
 */
export function atlasCoordForLocation(locationId: string | null | undefined): AtlasCoord | null {
  if (!locationId) return null;
  return LOCATION_ATLAS_COORDS[locationId] ?? null;
}

/**
 * The set of location ids the atlas depicts as icons.
 */
export function depictedLocationIds(): string[] {
  return Object.keys(LOCATION_ATLAS_COORDS);
}

// ⚠⚠ OTA-1338 SCRUB — EVERYTHING BELOW THIS LINE IN THE OLD FILE IS GONE, AND WHY MATTERS.
//
// From here down this module used to carry an entire positioning pipeline for the player
// marker: cardinalOffsetFromAnchor / cardinalOffsetFromOutpost (per-tile drift), the
// OFF_LIMITS_RECTS no-go rectangles with pushOutOfRect and clampToMapArea, the
// HUB_ROOM_MINIMAP_COORDS inset table with hubRoomMinimapCoord, and the OTA-054 IDW
// interpolator. Four hundred-odd lines, all of it feeding a "you are here" dot that
// OTA-182 removed at the owner's request ("we were never able to make it accurate so
// let's let the map just be a map") — MapScreen was still COMPUTING a dotStyle from this
// chain on every render and then never drawing it.
//
// Worse than dead: the no-go rectangles were traced from the ORIGINAL hand-drawn art's
// legend boxes and inset minimap. On the redrawn atlas those rectangles cover plain
// terrain — the top-right one sat exactly over Yuldra-Tul — so any future caller would
// have inherited a clamp that pushes markers off a mountain to dodge a legend that no
// longer exists. The insets themselves (outpost minimap, timeline ribbon) are not on the
// new art at all; hub interiors have had their own full-screen maps since arb106.
//
// If a player marker ever comes back, it should be drawn from canonicalCellFor /
// cellToAtlasFraction like every other overlay — one coordinate system, not two.
