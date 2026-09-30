// Strategic repair — Phase 12. Pure OPTION CONSTRUCTOR for "which
// unrecovered Lost Capital should this Tartarian head toward next", the
// proven Life 4 fixed-array-order gap (postmortem primary/contributing
// cause). Never decides — policy.ts's existing, UNMODIFIED 'route' branch
// (§3 of its priority hierarchy) already picks the option with the lowest
// `meta.danger` among whatever 'route' options it's handed; this module's
// only job is to offer one option per legitimate candidate with an honest,
// player-derivable risk figure instead of a single hardcoded destination.
//
// STRUCTURAL FIREWALL: imports only production's own world-atlas fractional
// coordinates (LOCATION_ATLAS_COORDS — the exact pin positions the real map
// screen paints; see atlasCoords.ts's own header) and policy's
// DecisionOption type. Never the store, never a hidden difficulty table,
// never Guardian tier internals.

import type { DecisionOption } from './policy';
import { LOCATION_ATLAS_COORDS } from '../../app/engine/atlasCoords';

export interface DestinationCandidate {
  locationId: string;
  /** A player-visible display name, if known (falls back to the id). */
  label?: string;
}

/**
 * LEARNED_DURING_THIS_LIFE — danger this Tartarian has PERSONALLY observed
 * at a capital it already visited earlier in this life (the caller builds
 * this from its own recorded scene.dangerRating observations, the same
 * pattern as policy.ts's dangerousEnemyNames). Never populated from
 * source-only knowledge of an unvisited location.
 */
export type VisitedCapitalDanger = ReadonlyMap<string, number>;

function distance(a: { fx: number; fy: number }, b: { fx: number; fy: number }): number {
  return Math.hypot(a.fx - b.fx, a.fy - b.fy);
}

/**
 * Builds one 'route' option per legitimate candidate destination. Risk
 * ordering prefers a capital this Tartarian has personally scouted and
 * knows to be less dangerous; absent that direct experience, it falls back
 * to a distance-derived estimate from the SAME world-map pin positions a
 * human reads off the map screen — never a hidden difficulty score, and
 * never simply "whichever the array lists first". Ties (equal risk figure)
 * break alphabetically by id — a deterministic, non-authorial tiebreak,
 * never the candidate list's own input order.
 */
export function buildDestinationOptions(
  currentLocationId: string,
  candidates: readonly DestinationCandidate[],
  visitedDanger: VisitedCapitalDanger,
): DecisionOption[] {
  const here = LOCATION_ATLAS_COORDS[currentLocationId];
  const scored = candidates.map((c) => {
    const known = visitedDanger.get(c.locationId);
    let risk: number;
    let basis: string;
    if (typeof known === 'number') {
      risk = known;
      basis = 'previously observed danger';
    } else {
      const there = LOCATION_ATLAS_COORDS[c.locationId];
      const d = here && there ? distance(here, there) : null;
      // A bounded 1-5 proxy from map distance alone (0..~1.2 fractional
      // range on this atlas) — never claimed to be the real danger rating,
      // only an honest player-visible substitute when no direct
      // observation exists yet.
      risk = d === null ? 3 : Math.max(1, Math.min(5, 1 + d * 4));
      basis = d === null ? 'unknown map position — neutral estimate' : 'estimated from map distance (no direct visit yet)';
    }
    return { c, risk, basis };
  });

  scored.sort((a, b) => (a.risk - b.risk) || a.c.locationId.localeCompare(b.c.locationId));

  return scored.map(({ c, risk, basis }) => ({
    id: `route:${c.locationId}`,
    category: 'route' as const,
    label: `set course to ${c.label ?? c.locationId}`,
    meta: { danger: Math.round(risk * 100) / 100, locationId: c.locationId, basis },
  }));
}
