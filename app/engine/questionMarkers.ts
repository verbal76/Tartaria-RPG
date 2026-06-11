// arb99 — numbered "?" markers. When more than one unknown "?" place is on the
// atlas at once, each gets an ascending number so the map marks (1? 2? 3?) and
// the travel/route rows can be matched up. A "?" place is:
//   • a HIDDEN location not yet revealed (the Hidden Market), and
//   • a PENDING grid-event objective (whisper/contract "?" — resolved "X" events
//     don't count; they're done).
// Numbers are assigned in spatial reading order (top→bottom, then left→right) so
// "1?" is the upper-most mark, and are ONLY assigned when there's more than one —
// a lone "?" stays an un-numbered "?". This module is the single source of truth
// both the MapScreen overlay and the route rows read, so they never disagree.

import { canonicalCellOf } from './worldMap';
import { HIDDEN_LOCATIONS, isLocationRevealed } from './hiddenLocations';
import type { WorldMemory } from './types';

export interface QuestionPlace {
  id: string;
  x: number;
  y: number;
}

/** The slice of world memory the "?" numbering reads. Kept structural so callers
 *  can pass either the full WorldMemory or just these two fields. */
type QuestionMemory = Pick<WorldMemory, 'discoveredLocationIds' | 'canonLocations'>;

/** Every place currently drawn as a pending "?" on the world atlas, in the order
 *  the numbers are assigned (top→bottom, left→right, id-tiebroken for stability). */
export function questionMarkerPlaces(wm: QuestionMemory | null | undefined): QuestionPlace[] {
  const discovered = wm?.discoveredLocationIds;
  const list: QuestionPlace[] = [];
  // Hidden locations that haven't been visited yet still read as "?".
  for (const id of Object.keys(HIDDEN_LOCATIONS)) {
    if (isLocationRevealed(id, discovered)) continue;
    const c = canonicalCellOf(id);
    list.push({ id, x: c.x, y: c.y });
  }
  // Pending grid-event objectives are "?"; resolved ones ("done" → "X") are not.
  for (const ev of wm?.canonLocations ?? []) {
    if (ev.marker !== 'pending') continue;
    // Number.isFinite (not typeof === 'number') so a corrupt NaN cell falls back
    // to the id's canon cell instead of leaking a non-finite marker off-map.
    const c = (Number.isFinite(ev.gx) && Number.isFinite(ev.gy))
      ? { x: ev.gx as number, y: ev.gy as number }
      : canonicalCellOf(ev.id);
    list.push({ id: ev.id, x: c.x, y: c.y });
  }
  list.sort((a, b) => (a.y - b.y) || (a.x - b.x) || a.id.localeCompare(b.id));
  return list;
}

/** id → 1-based number for each "?" place, but ONLY when more than one exists (a
 *  lone "?" returns an empty map → no number). The map overlay and the route rows
 *  both read this so a given mark and its row always carry the same number. */
export function questionMarkerNumbers(wm: QuestionMemory | null | undefined): Record<string, number> {
  const places = questionMarkerPlaces(wm);
  const out: Record<string, number> = {};
  if (places.length > 1) {
    places.forEach((p, i) => { out[p.id] = i + 1; });
  }
  return out;
}

/** The glyph for a "?" place's marker/row: "N?" when numbered, else a plain "?". */
export function questionGlyph(id: string, numbers: Record<string, number>): string {
  const n = numbers[id];
  return n ? `${n}?` : '?';
}

/** The canon id a whisper/lead objective is registered under when its course is
 *  set (gameStore.setWhisperCourse uses the same slug). Lets the Contracts screen
 *  look up a whisper route's "?" number so its SET COURSE block matches the atlas. */
export function mentionIdForLabel(label: string): string {
  return `mention_${label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')}`;
}
