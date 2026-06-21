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

// Cache the resolved hidden-locations map keyed on the locations array's identity,
// so the per-location reveal checks (called a lot during a map render) don't rebuild
// it every call. resolveTable returns a stable reference until the locations table is
// re-uploaded, at which point the ref changes and the cache rebuilds on its own.
let _hiddenCache: { ref: unknown; map: Record<string, { placeholder: string; fx: number; fy: number }> } | null = null;

/** The hidden locations that apply to the LIVE game:
 *   1. the built-in set (HIDDEN_LOCATIONS) filtered to ids present in the active
 *      catalog — so a re-skin without `hidden_market` gets no phantom "?"; plus
 *   2. EVERY active location flagged `hidden: true` by the author — flag any
 *      uploaded place to make it a discoverable "?" (still routable; reveals its
 *      real name once visited).
 *  A flagged location renders as a normal map pin/travel row whose NAME is gated
 *  through revealedLocationName, so it needs no fx/fy of its own — those fields are
 *  only used by the built-in Hidden Market's bespoke atlas overlay. */
export function getHiddenLocations(): Record<string, { placeholder: string; fx: number; fy: number }> {
  const locs = resolveTable('locations', locationsJson as unknown as Location[]);
  if (_hiddenCache && _hiddenCache.ref === locs) return _hiddenCache.map;
  const out: Record<string, { placeholder: string; fx: number; fy: number }> = {};
  const ids = new Set(locs.map((l) => l.id));
  for (const [id, h] of Object.entries(HIDDEN_LOCATIONS)) {
    if (ids.has(id)) out[id] = h;
  }
  for (const l of locs) {
    if ((l as Location).hidden) out[l.id] = { placeholder: '?', fx: 0.5, fy: 0.5 };
  }
  _hiddenCache = { ref: locs, map: out };
  return out;
}

// 32-bit string hash (xmur3-lite) for a stable per-id color.
function hashId(s: string): number {
  let h = 1779033703 ^ s.length;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return (h ^= h >>> 16) >>> 0;
}

/** A stable, vivid "?" color for a hidden place, derived from its id so each
 *  mystery reads as its own marker (the author asked for "a random color"). HSL
 *  with a fixed high saturation + mid lightness keeps every result legible on the
 *  dark atlas. Non-hidden / unknown ids fall back to the classic amber. */
export function hiddenMarkerColor(id: string | null | undefined): string {
  if (!id) return '#e6c96a';
  const hue = hashId(id) % 360;
  return `hsl(${hue}, 85%, 62%)`;
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
