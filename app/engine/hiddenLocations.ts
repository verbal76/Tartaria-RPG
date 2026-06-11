// hiddenLocations — OTA-498. Locations that start as an unknown "?" on the atlas
// AND in the travel list, and reveal their real name only after the player has
// TRAVELED there once (the id lands in worldMemory.discoveredLocationIds via the
// travelTo → discoverLocation path).
//
// The Hidden Market has no icon painted into the atlas art, so the "?" both marks
// it on the map and explains the blank: it's a place that keeps no name on any map
// until you've found it yourself. Once visited, the "?" flips to the real name in
// the travel list AND on the map overlay.

/** Map of locationId → its pre-discovery placeholder glyph + the atlas fraction
 *  to pin the "?"/name overlay at. The coord lives HERE (not in
 *  atlasCoords.LOCATION_ATLAS_COORDS) on purpose: that table is the IDW anchor set
 *  for the player-dot interpolation, and a hidden marker must not perturb it. */
export const HIDDEN_LOCATIONS: Record<string, { placeholder: string; fx: number; fy: number }> = {
  // OTA-501 — moved 6 grid cells east + 1 south from the original spot (player
  // tuning). fx/fy drive BOTH the canonical grid cell (canonicalCellFor) AND the
  // "?" overlay, so the grid coordinate and the visual location move together.
  // gridX = CENTER+round((0.66-0.5)*40) = +6 east; gridY = CENTER+round((0.275-0.5)*22) = +1 south.
  hidden_market: { placeholder: '?', fx: 0.66, fy: 0.275 },
};

export function isHiddenLocation(id: string | null | undefined): boolean {
  return !!id && id in HIDDEN_LOCATIONS;
}

/** True for ordinary locations always; for a hidden one, only once discovered. */
export function isLocationRevealed(
  id: string | null | undefined,
  discoveredIds: readonly string[] | undefined,
): boolean {
  if (!id || !(id in HIDDEN_LOCATIONS)) return true;
  return (discoveredIds ?? []).includes(id);
}

/** The display name to show: the placeholder ("?") until discovered, then the
 *  real name. Ordinary locations always return their real name. */
export function revealedLocationName(
  id: string | null | undefined,
  realName: string,
  discoveredIds: readonly string[] | undefined,
): string {
  if (!id) return realName;
  const h = HIDDEN_LOCATIONS[id];
  if (!h) return realName;
  return isLocationRevealed(id, discoveredIds) ? realName : h.placeholder;
}
