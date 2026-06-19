// arbiterKnowledge — deterministic, app-grounded answers to world-knowledge
// questions ("list the factions", "name the capitals", "how many races",
// "what city am I headed to"). The Arbiter answers from REAL game data and
// CORRECTS a wrong premise in the question — "name the eleven factions" →
// "There are not eleven. There are nine…" — in his gruff, terse voice.
//
// Forgiving keyword routing: the phrasing need not be exact (you don't have
// to say the magic word "capital"; "list the cities" works too). Anything
// this can't answer returns null so the caller falls through to the lore
// lookup / Qwen persona.
//
// arb43 — pairs with the Qwen persona fallback + introspection bug-fix in
// gameStore's `case 'ask'`. All three data files are top-level ARRAYS.

import { getNarratorName } from './contentPack';
import factionsData from '../data/factions/factions.json';
import racesData from '../data/races/races.json';
import locationsData from '../data/locations/locations.json';

interface NamedThing { id?: string; name?: string; tags?: string[]; discoverable?: boolean }
export interface KnowledgePlayer {
  travelTarget?: { locationId: string; distanceRemaining?: number } | null;
  currentLocationId?: string;
  /** How many distinct sites the player has discovered so far (worldMemory
   *  .discoveredLocationIds.length). Optional — when present, the "how many
   *  sites can I visit" answer reports progress. */
  discoveredSiteCount?: number;
}

const FACTION_NAMES: string[] = (factionsData as NamedThing[])
  .map((f) => f.name ?? '')
  .filter(Boolean);

const RACE_NAMES: string[] = (racesData as NamedThing[])
  .map((r) => r.name ?? '')
  .filter(Boolean);

// Capitals = every tile the engine tags `capital` or `lost_capital` — the
// world's actual named capital cities (6 today). The lore name-drops a few
// more (Samarran, Nimari, Voronov) that aren't real locations; we answer
// from what the engine actually has, so the count the Arbiter corrects you
// with is true. Standing capitals first, then the drowned ones.
const CAPITAL_NAMES: string[] = (() => {
  const locs = locationsData as NamedThing[];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const tag of ['capital', 'lost_capital']) {
    for (const l of locs) {
      if ((l.tags ?? []).includes(tag) && l.name && !seen.has(l.name)) {
        seen.add(l.name);
        out.push(l.name);
      }
    }
  }
  return out;
})();

// Visitable sites = every location the engine marks discoverable (the places
// the player can find + travel to). 25 today; rises as new tiles open.
const VISITABLE_SITE_COUNT: number = (locationsData as NamedThing[])
  .filter((l) => l.discoverable === true).length;

const NUM_WORDS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13,
  fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
  nineteen: 19, twenty: 20,
};
const WORD_FOR = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight',
  'nine', 'ten', 'eleven', 'twelve',
];

function numberWord(n: number): string {
  return WORD_FOR[n] ?? String(n);
}

/** Pull a count the player asserted in the question, if any. Digits win;
 *  otherwise the first number-word 0–20. Returns null when no count given. */
function assertedCount(q: string): number | null {
  const digit = q.match(/\b(\d{1,3})\b/);
  if (digit) return parseInt(digit[1] as string, 10);
  for (const [w, n] of Object.entries(NUM_WORDS)) {
    if (new RegExp(`\\b${w}\\b`).test(q)) return n;
  }
  return null;
}

function locName(id: string | undefined): string | null {
  if (!id) return null;
  return (locationsData as NamedThing[]).find((l) => l.id === id)?.name ?? null;
}

function joinList(items: string[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0] as string;
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

/** Opens the Arbiter's reply, correcting the count first when the player
 *  asserted a wrong one. Leaves an open quote for the list body. */
function open(q: string, real: number, nounPlural: string): string {
  const asked = assertedCount(q);
  if (asked !== null && asked !== real) {
    return `The ${getNarratorName()}'s eyes narrow. "There are not ${numberWord(asked)} ${nounPlural}. There are ${numberWord(real)}. `;
  }
  return `The ${getNarratorName()} answers, flat and certain. "`;
}

/** Free-text → a deterministic, data-grounded Arbiter answer, or null. */
export function answerWorldKnowledge(query: string, player: KnowledgePlayer): string | null {
  const q = query.toLowerCase();

  // 1) Current course / destination — checked BEFORE the city/capital list,
  //    because "what city am I headed to" mentions "city".
  const headingCue = /\b(head|heading|headed|bound|going|travel(?:l)?ing|en\s*route)\b/.test(q)
    || /\b(my|current)\s+(destination|course|heading)\b/.test(q)
    || /\bwhere\s+am\s+i\s+(going|headed|bound|travel(?:l)?ing)\b/.test(q);
  if (headingCue && /\b(where|city|town|place|destination|head|going|bound|course|route)\b/.test(q)) {
    const tt = player.travelTarget;
    const name = tt ? locName(tt.locationId) : null;
    if (name) {
      const tiles = tt?.distanceRemaining;
      const dist = typeof tiles === 'number' && tiles > 0
        ? (tiles <= 1 ? ' A day out, no more.' : ` Some ${tiles} days of road remain.`)
        : '';
      return `The ${getNarratorName()} looks to the horizon. "You are bound for ${name}.${dist} Keep your legs under you."`;
    }
    return `The ${getNarratorName()} shrugs. "You are bound nowhere. You hold where you stand — name a place and we walk."`;
  }

  // 2) Current location — "where am I" (not a heading question).
  if (/\bwhere\s+(am\s+i|i\s+am)\b/.test(q) && !headingCue) {
    const here = locName(player.currentLocationId);
    if (here) return `The ${getNarratorName()} taps the ground. "You stand in ${here}."`;
  }

  const wantsList = /\b(list|name|all|every|each|how\s+many|which|what\s+are|who\s+are|count)\b/.test(q)
    || assertedCount(q) !== null;

  // 3) Factions
  if (/\bfactions\b/.test(q) || (/\bfaction\b/.test(q) && wantsList)) {
    return `${open(q, FACTION_NAMES.length, 'factions')}${joinList(FACTION_NAMES)}. Each calls the buried country its own."`;
  }

  // 4) Capitals / cities / towns
  if (/\bcapitals\b|\bcities\b/.test(q) || (/\b(capital|city|town)\b/.test(q) && wantsList)) {
    return `${open(q, CAPITAL_NAMES.length, 'capitals')}${joinList(CAPITAL_NAMES)}. The flood took the rest before they were worth a name."`;
  }

  // 5) Races / bloodlines
  if (/\b(races|bloodlines|peoples)\b/.test(q) || (/\b(race|bloodline)\b/.test(q) && wantsList)) {
    return `${open(q, RACE_NAMES.length, 'bloodlines')}${joinList(RACE_NAMES)}. That is every blood that still walks Tartaria."`;
  }

  // 6) Sites / places to visit — a COUNT of discoverable locations (+ progress).
  //    "how many sites can I visit", "how many places are there", etc.
  if (/\b(sites?|locations?|destinations?|landmarks?|places?)\b/.test(q) && wantsList) {
    const total = VISITABLE_SITE_COUNT;
    const asked = assertedCount(q);
    const lead = (asked !== null && asked !== total)
      ? `The ${getNarratorName()}'s eyes narrow. "Not ${numberWord(asked)}. There are ${numberWord(total)} places in the buried country worth your boots`
      : `The ${getNarratorName()} sweeps a hand at the dark. "There are ${numberWord(total)} places in the buried country worth your boots`;
    const found = player.discoveredSiteCount;
    const tail = (typeof found === 'number' && found >= 0)
      ? ` — you have set foot in ${numberWord(found)}. The rest still wait."`
      : `. Walk, and find them."`;
    return `${lead}${tail}`;
  }

  return null;
}

/** Test-only accessors so counts stay locked to the data. */
export const _knowledgeCounts = {
  factions: FACTION_NAMES.length,
  races: RACE_NAMES.length,
  capitals: CAPITAL_NAMES.length,
  sites: VISITABLE_SITE_COUNT,
};
