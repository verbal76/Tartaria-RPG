// Faction-mission ROUTE CHAIN support (Tartaria line).
//
// Faction contracts carry no structured destination — their stages advance on
// ANY kill / ANY travel and the place-names in the text are flavor. To give the
// player a "route to the objective, then auto-route to turn-in" flow, the engine
// derives an OBJECTIVE location for each contract: an explicit
// `objectiveLocationId` author field if valid, else the location whose name (or
// id) is named in the mission text. Returns null when nothing matches and the
// caller falls back to the faction home (which is also the turn-in hub). Most of
// the shipped gather-quests name no location, so they route straight to turn-in;
// any quest that does name a place routes there first.

import type { FactionQuestDef } from './factionQuests';
import type { Location } from './types';
import locationsData from '../data/locations/locations.json';

const LOCATIONS = locationsData as Location[];

/** Normalize for fuzzy name/id matching: lowercase, treat -/_ as spaces, drop
 *  punctuation, collapse whitespace. */
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
  const explicit = def.objectiveLocationId;
  if (explicit && LOCATIONS.some((l) => l.id === explicit)) return explicit;
  const hay = norm(
    [def.objective, def.description, ...((def.stages ?? []).map((s) => s.narration))]
      .filter(Boolean)
      .join(' '),
  );
  if (!hay) return null;
  const stripArticle = (s: string): string => s.replace(/^(the|a|an) /, '');
  let best: string | null = null;
  let bestLen = 0;
  for (const l of LOCATIONS) {
    if (!l.id) continue;
    const raw = [l.name, l.id];
    const candidates = raw.flatMap((r) => { const n = norm(r); return [n, stripArticle(n)]; });
    for (const c of candidates) {
      if (c.length >= 4 && c.length > bestLen && hay.includes(c)) {
        best = l.id;
        bestLen = c.length;
      }
    }
  }
  return best;
}
