// OTA-907 — faction-mission ROUTE CHAIN support.
//
// Faction contracts carry no structured destination — their stages advance on
// ANY kill / ANY travel and the place-names in the text are flavor. To give the
// player a real "route to the objective, then auto-route to turn-in" flow, the
// engine derives an OBJECTIVE location for each contract from the active world:
// an explicit `objectiveLocationId` author field if valid, else the live
// location whose name (or id) is named in the mission text. Content-agnostic —
// it matches against the LIVE (possibly uploaded) locations table, never a
// hardcoded place. Returns null when nothing matches, and the caller falls back
// to the faction home (which is also the turn-in hub).

import type { FactionQuestDef } from './factionQuests';
import type { Location } from './types';
import { resolveTable } from './contentPack';
import locationsData from '../data/locations/locations.json';

const activeLocations = (): readonly Location[] =>
  resolveTable('locations', locationsData as unknown as Location[]) as Location[];

/** Normalize for fuzzy name/id matching: lowercase, treat -/_ as spaces, drop
 *  punctuation, collapse whitespace. So "Rome-Milan sector" and the id
 *  "sector_rome_milan" both reduce to "...rome milan...". */
function norm(s: string | undefined | null): string {
  return (s ?? '')
    .toLowerCase()
    .replace(/[-_]/g, ' ')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The objective destination for a contract, or null if none can be inferred. */
export function missionObjectiveLocationId(def: FactionQuestDef | null | undefined): string | null {
  if (!def) return null;
  const locs = activeLocations();
  const explicit = def.objectiveLocationId;
  if (explicit && locs.some((l) => l.id === explicit)) return explicit;
  const hay = norm(
    [def.objective, def.description, ...((def.stages ?? []).map((s) => s.narration))]
      .filter(Boolean)
      .join(' '),
  );
  if (!hay) return null;
  const stripArticle = (s: string): string => s.replace(/^(the|a|an) /, '');
  let best: string | null = null;
  let bestLen = 0;
  for (const l of locs) {
    if (!l.id) continue;
    // Candidate keys: the display name and the id (minus a `sector_` prefix),
    // each also with a leading article stripped so "Pentagon Crater" in the
    // objective still matches the location "The Pentagon Crater".
    const raw = [l.name, l.id.replace(/^sector[_-]?/i, '')];
    const candidates = raw.flatMap((r) => { const n = norm(r); return [n, stripArticle(n)]; });
    for (const c of candidates) {
      // require a reasonably specific match (>= 4 chars) and prefer the longest
      // so "Rome-Milan" wins over a stray short token.
      if (c.length >= 4 && c.length > bestLen && hay.includes(c)) {
        best = l.id;
        bestLen = c.length;
      }
    }
  }
  return best;
}
