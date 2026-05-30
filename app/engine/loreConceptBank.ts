// loreConceptBank — unified searchable index over every lore source
// in the game. Each LoreConcept carries:
//   - id / category / label / definition (display + routing)
//   - searchText — a natural sentence shaped for MiniLM cosine
//     similarity (mirrors the anchor sentence pattern used by
//     CognitiveOrchestrator's emotion + intent inference).
//
// OTA-233 — first wave of "Ask the Arbiter." The concept bank is
// the corpus the MiniLM embedder queries against. Pulled from:
//   - canon-events.json        (18 timeline events, OTA-232)
//   - arbiter-titles.json      (20 player titles, OTA-232)
//   - canon-food-drink.json    (20 food/drink items, OTA-232)
//   - glossary.json            (74 entries: mechanics + lore terms +
//                               factions + people + places + events)
//
// Roughly 132 concepts total. Embedding cost is bounded — concepts
// embed lazily on first query (~10ms per concept on the device) and
// the result is cached in-memory for the session. Restart re-warms;
// nothing persists to disk because the embedding model can change
// across builds.

import canonEventsData from '../data/lore/canon-events.json';
import canonFoodDrinkData from '../data/lore/canon-food-drink.json';
import arbiterTitlesData from '../data/lore/arbiter-titles.json';
import glossaryData from '../data/lore/glossary.json';

export type LoreCategory =
  | 'event'
  | 'title'
  | 'food_drink'
  | 'mechanic'
  | 'lore_term'
  | 'faction'
  | 'person'
  | 'place'
  | 'timeline';

export interface LoreConcept {
  id: string;
  label: string;
  /** Display string surfaced when the Arbiter answers. */
  definition: string;
  category: LoreCategory;
  /** Sentence-shaped prose for MiniLM cosine. Mirrors the anchor
   *  pattern in CognitiveOrchestrator.ts:12 — full sentences embed
   *  much better than keyword soup. */
  searchText: string;
}

interface CanonEvent {
  id: string; year: number; title: string;
  factions: string[]; location: string; outcome: string;
  summary: string; tags: string[];
}

interface CanonFoodDrink {
  id: string; name: string; type: string; rarity: string;
  source: string; effect: string; tcValue: number;
}

interface ArbiterTitle {
  id: string; title: string; requirement: string; perk: string; tags: string[];
}

interface GlossaryEntry { id: string; term: string; definition: string; }
interface GlossaryTimeline { id: string; year: number; name: string; summary: string; }

let cachedBank: LoreConcept[] | null = null;

export function loadLoreConceptBank(): LoreConcept[] {
  if (cachedBank) return cachedBank;
  const concepts: LoreConcept[] = [];

  // Canon events (OTA-232)
  for (const e of (canonEventsData as { events: CanonEvent[] }).events) {
    concepts.push({
      id: `event_${e.id}`,
      label: `${e.year} · ${e.title}`,
      definition: `${e.summary} (Factions: ${e.factions.join(', ')}. Location: ${e.location}. Outcome: ${e.outcome}.)`,
      category: 'event',
      searchText: `The ${e.title} happened in ${e.year} at ${e.location} involving ${e.factions.join(' and ')}. ${e.summary}`,
    });
  }

  // Arbiter titles (OTA-232)
  for (const t of (arbiterTitlesData as { titles: ArbiterTitle[] }).titles) {
    concepts.push({
      id: `title_${t.id}`,
      label: t.title,
      definition: `Earned by: ${t.requirement}. Perk: ${t.perk}`,
      category: 'title',
      searchText: `${t.title} is an Arbiter title earned by ${t.requirement.toLowerCase()}. It grants ${t.perk.toLowerCase()}`,
    });
  }

  // Canon food / drink (OTA-232)
  for (const it of (canonFoodDrinkData as { items: CanonFoodDrink[] }).items) {
    concepts.push({
      id: `item_${it.id}`,
      label: it.name,
      definition: `${it.rarity} ${it.type}. ${it.effect}. Source: ${it.source}. Value: ${it.tcValue} TC.`,
      category: 'food_drink',
      searchText: `${it.name} is a ${it.rarity} ${it.type} from ${it.source}. ${it.effect}`,
    });
  }

  // Glossary — mechanics / lore_terms / factions / important_people / important_places
  const glossary = glossaryData as {
    mechanics: GlossaryEntry[];
    lore_terms: GlossaryEntry[];
    factions: GlossaryEntry[];
    important_people: GlossaryEntry[];
    important_places: GlossaryEntry[];
    timeline_events: GlossaryTimeline[];
  };
  const glossaryBuckets: Array<[GlossaryEntry[], LoreCategory]> = [
    [glossary.mechanics, 'mechanic'],
    [glossary.lore_terms, 'lore_term'],
    [glossary.factions, 'faction'],
    [glossary.important_people, 'person'],
    [glossary.important_places, 'place'],
  ];
  for (const [bucket, category] of glossaryBuckets) {
    for (const entry of bucket) {
      concepts.push({
        id: `glossary_${category}_${entry.id}`,
        label: entry.term,
        definition: entry.definition,
        category,
        searchText: `${entry.term}. ${entry.definition}`,
      });
    }
  }

  // Glossary timeline (separate shape — overlaps with canon-events but
  // glossary entries are summarized differently; include both so
  // either query phrasing resolves).
  for (const e of glossary.timeline_events) {
    concepts.push({
      id: `glossary_timeline_${e.id}`,
      label: `${e.year} · ${e.name}`,
      definition: e.summary,
      category: 'timeline',
      searchText: `In ${e.year} the ${e.name} occurred. ${e.summary}`,
    });
  }

  cachedBank = concepts;
  return concepts;
}

/** Format an Arbiter response line for a matched concept. Centralized
 *  so the wording stays consistent across the parser path and any
 *  future button-driven query surface. */
export function formatArbiterAnswer(concept: LoreConcept): string {
  switch (concept.category) {
    case 'event':
    case 'timeline':
      return `The Arbiter recalls the ${concept.label}. ${concept.definition}`;
    case 'title':
      return `The Arbiter speaks of the title — ${concept.label}. ${concept.definition}`;
    case 'food_drink':
      return `The Arbiter remembers — ${concept.label}. ${concept.definition}`;
    case 'mechanic':
      return `The Arbiter explains — ${concept.label}: ${concept.definition}`;
    case 'lore_term':
    case 'faction':
    case 'person':
    case 'place':
    default:
      return `The Arbiter says, "${concept.label}: ${concept.definition}"`;
  }
}

/** Reset the cache. Test-only — production code never calls this. */
export function _resetConceptBankCache(): void {
  cachedBank = null;
}
