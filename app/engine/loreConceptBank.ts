// loreConceptBank — unified searchable index over every lore source
// in the game. Each LoreConcept carries:
//   - id / category / label / definition (display + routing)
//   - searchText — a natural sentence shaped for MiniLM cosine
//     similarity (mirrors the anchor sentence pattern used by
//     CognitiveOrchestrator's emotion + intent inference).
//
// OTA-233 — "Ask the Arbiter." The concept bank is the corpus the MiniLM embedder queries
// against. engine_Dev-831 — the built-in Tartaria canon files (canon-events / food-drink /
// glossary / canon-armor·weapons·skills·currency·loot) were DELETED; the bank is now built
// ENTIRELY from the active LORE DOCUMENT (author override or the installed generic default).
// An empty lore doc → an empty bank (the Arbiter simply has no lore to recall). The bank
// caches against the lore-doc array identity, so a fresh upload rebuilds it.

import { getNarratorName, resolveTable } from './contentPack';

export type LoreCategory =
  | 'event'
  | 'title'
  | 'food_drink'
  | 'mechanic'
  | 'lore_term'
  | 'faction'
  | 'person'
  | 'place'
  | 'timeline'
  | 'skill'
  | 'weapon'
  | 'armor'
  | 'currency_good'
  | 'loot'
  | 'task_tier'
  | 'action_tier'
  | 'lore_doc';

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

let cachedBank: LoreConcept[] | null = null;
let cachedLoreRef: unknown = Symbol('uninit');

// engine_Dev — author "Lore document" passages → queryable concepts. When a
// 'lore' override is loaded, the "ask the narrator" corpus is built from the
// author's passages INSTEAD of the built-in Tartaria lore, so questions answer
// from the uploaded world. Ids are content-hashed so a re-upload never collides
// with a stale embedding cache (askArbiter caches vectors by concept id).
interface LorePassage { tags?: unknown; keywords?: unknown; text?: unknown }
const EMPTY_LORE: readonly LorePassage[] = [];

function hashStr(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

function passageTags(p: LorePassage): string[] {
  const raw = Array.isArray(p.tags) ? p.tags : Array.isArray(p.keywords) ? p.keywords : [];
  return raw.filter((t): t is string => typeof t === 'string');
}

function loreDocConcepts(passages: readonly LorePassage[]): LoreConcept[] {
  const out: LoreConcept[] = [];
  for (const p of passages) {
    if (!p || typeof p.text !== 'string' || !p.text.trim()) continue;
    const text = p.text.trim();
    const tags = passageTags(p);
    const label = (tags[0] ?? 'Lore').replace(/\b\w/g, (c) => c.toUpperCase());
    out.push({
      id: `lore_${hashStr(tags.join('|') + '::' + text)}`,
      label,
      definition: text,
      category: 'lore_doc',
      // tags + text gives MiniLM both the topic words and the prose to match on.
      searchText: `${tags.join(', ')}. ${text}`,
    });
  }
  return out;
}

export function loadLoreConceptBank(): LoreConcept[] {
  const loreDoc = resolveTable<LorePassage>('lore', EMPTY_LORE);
  // Cache by the lore-doc reference: a fresh upload swaps the array identity and rebuilds.
  if (cachedBank && cachedLoreRef === loreDoc) return cachedBank;
  // engine_Dev — the Ask-the-Arbiter corpus is built ENTIRELY from the active lore document
  // (author override or the installed generic default — always present). There is no built-in
  // Tartaria fallback; an empty lore doc yields an empty bank ("the Arbiter has no lore yet").
  cachedLoreRef = loreDoc;
  cachedBank = loreDoc.length > 0 ? loreDocConcepts(loreDoc) : [];
  return cachedBank;
}


/** Format an Arbiter response line for a matched concept. Centralized
 *  so the wording stays consistent across the parser path and any
 *  future button-driven query surface. */
export function formatArbiterAnswer(concept: LoreConcept): string {
  switch (concept.category) {
    case 'lore_doc':
      return `The ${getNarratorName()} recalls: ${concept.definition}`;
    case 'event':
    case 'timeline':
      return `The ${getNarratorName()} recalls the ${concept.label}. ${concept.definition}`;
    case 'title':
      return `The ${getNarratorName()} speaks of the title — ${concept.label}. ${concept.definition}`;
    case 'food_drink':
    case 'currency_good':
    case 'loot':
      return `The ${getNarratorName()} remembers — ${concept.label}. ${concept.definition}`;
    case 'weapon':
      return `The ${getNarratorName()} speaks of the weapon — ${concept.label}. ${concept.definition}`;
    case 'armor':
      return `The ${getNarratorName()} speaks of the armor — ${concept.label}. ${concept.definition}`;
    case 'skill':
      return `The ${getNarratorName()} explains the skill — ${concept.label}: ${concept.definition}`;
    case 'mechanic':
    case 'task_tier':
    case 'action_tier':
      return `The ${getNarratorName()} explains — ${concept.label}: ${concept.definition}`;
    case 'lore_term':
    case 'faction':
    case 'person':
    case 'place':
    default:
      return `The ${getNarratorName()} says, "${concept.label}: ${concept.definition}"`;
  }
}

/** Reset the cache. Test-only — production code never calls this. */
export function _resetConceptBankCache(): void {
  cachedBank = null;
  cachedLoreRef = Symbol('reset');
}
