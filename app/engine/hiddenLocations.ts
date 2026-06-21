// hiddenLocations — OTA-498. Locations that start as an unknown "?" on the atlas
// AND in the travel list, and reveal their real name only after the player has
// TRAVELED there once (the id lands in worldMemory.discoveredLocationIds via the
// travelTo → discoverLocation path).
//
// The Hidden Market has no icon painted into the atlas art, so the "?" both marks
// it on the map and explains the blank: it's a place that keeps no name on any map
// until you've found it yourself. Once visited, the "?" flips to the real name in
// the travel list AND on the map overlay.
//
// engine_Dev — a hidden location is only "hidden" (drawn as a "?") when it ACTUALLY
// EXISTS in the active location catalog. The built-in `hidden_market` is Tartaria
// content; a re-skin that uploads its own locations (no `hidden_market`) must not
// see a phantom "?" for a place its game doesn't have. getHiddenLocations() is the
// resolver every render path reads — it filters the built-in set to ids present in
// the live (uploaded or built-in) locations table.

import { resolveTable } from './contentPack';
import locationsJson from '../data/locations/locations.json';
import type { Location } from './types';

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

// Cache the active location-id set keyed on the resolved array's identity, so the
// per-location reveal checks (called a lot during a map render) don't rebuild a Set
// every call. resolveTable returns a stable reference until the locations table is
// re-uploaded, at which point the ref changes and the cache rebuilds on its own.
let _activeIdCache: { ref: unknown; ids: Set<string> } | null = null;
function activeLocationIds(): Set<string> {
  const locs = resolveTable('locations', locationsJson as unknown as Location[]);
  if (_activeIdCache && _activeIdCache.ref === locs) return _activeIdCache.ids;
  const ids = new Set(locs.map((l) => l.id));
  _activeIdCache = { ref: locs, ids };
  return ids;
}

/** The hidden locations that apply to the LIVE game: the built-in set filtered to
 *  ids that actually exist in the active location catalog. A re-skin whose uploaded
 *  locations don't include `hidden_market` gets an empty map here — so no phantom
 *  "?" for a place its game doesn't have. */
export function getHiddenLocations(): Record<string, { placeholder: string; fx: number; fy: number }> {
  const ids = activeLocationIds();
  const out: Record<string, { placeholder: string; fx: number; fy: number }> = {};
  for (const [id, h] of Object.entries(HIDDEN_LOCATIONS)) {
    if (ids.has(id)) out[id] = h;
  }
  return out;
}

export function isHiddenLocation(id: string | null | undefined): boolean {
  return !!id && id in getHiddenLocations();
}

/** True for ordinary locations always; for a hidden one, only once discovered. */
export function isLocationRevealed(
  id: string | null | undefined,
  discoveredIds: readonly string[] | undefined,
): boolean {
  if (!id || !(id in getHiddenLocations())) return true;
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
  const h = getHiddenLocations()[id];
  if (!h) return realName;
  return isLocationRevealed(id, discoveredIds) ? realName : h.placeholder;
}
