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

// OTA-298 (Cobalt Drift) — canon-*.json imports lazy-loaded via
// `require()` inside `loadLoreConceptBank()` instead of top-level
// `import`. The Arbiter lookup is rare (player has to type "ask
// the arbiter X"), and parsing ~120 KB of JSON on every cold start
// to support an action that may never happen in a session is the
// kind of bundle-load weight Hermes on Tensor G4 chokes on. Lazy-
// loading moves that parse to first-Arbiter-query time, which is
// always mid-session when Hermes is warm. The bank still caches
// across queries via `cachedBank`, so the parse runs at most once
// per app session, same as today.

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
  | 'action_tier';

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
  // OTA-298 — lazy require() so the ~120 KB of canon-*.json + glossary
  // is parsed on first Arbiter query rather than at cold-start.
  const canonEventsData = require('../data/lore/canon-events.json');
  const canonFoodDrinkData = require('../data/lore/canon-food-drink.json');
  const arbiterTitlesData = require('../data/lore/arbiter-titles.json');
  const glossaryData = require('../data/lore/glossary.json');
  const canonSkillsData = require('../data/lore/canon-skills.json');
  const canonWeaponsData = require('../data/lore/canon-weapons.json');
  const canonArmorData = require('../data/lore/canon-armor.json');
  const canonCurrencyData = require('../data/lore/canon-currency-goods.json');
  const canonLootData = require('../data/lore/canon-loot-treasure.json');
  const canonTaskData = require('../data/lore/canon-task-difficulty.json');
  const canonActionData = require('../data/lore/canon-action-difficulty.json');

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

  // OTA-234 — canon skills (19, lore-only since app uses its own
  // stat system).
  for (const s of (canonSkillsData as { skills: Array<{ id: string; name: string; ability: string; affects: string }> }).skills) {
    concepts.push({
      id: `skill_${s.id}`,
      label: s.name,
      definition: `Skill tied to ${s.ability[0]!.toUpperCase()}${s.ability.slice(1)}. ${s.affects}`,
      category: 'skill',
      searchText: `${s.name} is a ${s.ability}-based skill. ${s.affects}`,
    });
  }

  // OTA-234 — canon weapons (60), armor (59), currency/trade goods (50),
  // loot/treasure (48). Lore-only; the shipped catalogs (weapons.json,
  // armor.json, materials.json, loot tables) win on conflicts per the
  // user's directive. Each entry becomes a queryable concept so the
  // Arbiter can describe canonical items even when the player hasn't
  // encountered them in-game yet.
  for (const w of (canonWeaponsData as { weapons: Array<{ id: string; name: string; category: string; rarity: string; source: string; damage: string; special: string; tcValue: number }> }).weapons) {
    concepts.push({
      id: `weapon_${w.id}`,
      label: w.name,
      definition: `${w.rarity} ${w.category}. Damage: ${w.damage}. ${w.special}. Source: ${w.source}. Value: ${w.tcValue} TC.`,
      category: 'weapon',
      searchText: `${w.name} is a ${w.rarity} ${w.category} weapon. It deals ${w.damage}. ${w.special}. Found via ${w.source}`,
    });
  }
  for (const a of (canonArmorData as { armor: Array<{ id: string; name: string; category: string; rarity: string; source: string; defense: number; special: string; tcValue: number }> }).armor) {
    concepts.push({
      id: `armor_${a.id}`,
      label: a.name,
      definition: `${a.rarity} ${a.category}. Defense bonus: ${a.defense}. ${a.special}. Source: ${a.source}. Value: ${a.tcValue} TC.`,
      category: 'armor',
      searchText: `${a.name} is a ${a.rarity} ${a.category} armor piece. Defense bonus ${a.defense}. ${a.special}. Found via ${a.source}`,
    });
  }
  for (const c of (canonCurrencyData as { items: Array<{ id: string; name: string; category: string; rarity: string; source: string; tcValue: number; notes: string }> }).items) {
    concepts.push({
      id: `currency_${c.id}`,
      label: c.name,
      definition: `${c.rarity} ${c.category}. ${c.notes}. Source: ${c.source}. Value: ${c.tcValue} TC.`,
      category: 'currency_good',
      searchText: `${c.name} is a ${c.rarity} ${c.category}. ${c.notes}. Found via ${c.source}`,
    });
  }
  for (const l of (canonLootData as { items: Array<{ id: string; name: string; category: string; rarity: string; source: string; tcValue: number; notes: string }> }).items) {
    concepts.push({
      id: `loot_${l.id}`,
      label: l.name,
      definition: `${l.rarity} ${l.category}. ${l.notes}. Source: ${l.source}. Value: ${l.tcValue} TC.`,
      category: 'loot',
      searchText: `${l.name} is a ${l.rarity} ${l.category}. ${l.notes}. Found via ${l.source}`,
    });
  }

  // OTA-234 — task difficulty tiers (8 NPC + 8 faction) and Arbiter
  // action difficulty tiers (10). Lore-only since the app has its own
  // dc_table.json and per-quest payouts; the Arbiter can answer
  // questions like "what's a moderate task pay" or "what's a Very
  // Hard difficulty" against these canonical ladders.
  const taskData = canonTaskData as {
    npcTaskTiers: Array<{ tier: string; description: string; examples: string; tcMin: number; tcMax: number }>;
    factionTaskTiers: Array<{ tier: string; description: string; examples: string; fpMin: number; fpMax: number }>;
  };
  for (const t of taskData.npcTaskTiers) {
    const tierLabel = t.tier.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    concepts.push({
      id: `npc_task_${t.tier}`,
      label: `${tierLabel} NPC Task`,
      definition: `${t.description} TC payout ${t.tcMin}–${t.tcMax}. Examples: ${t.examples}`,
      category: 'task_tier',
      searchText: `A ${tierLabel} NPC task pays ${t.tcMin} to ${t.tcMax} TC. ${t.description}. Examples include ${t.examples}`,
    });
  }
  for (const t of taskData.factionTaskTiers) {
    const tierLabel = t.tier.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    concepts.push({
      id: `faction_task_${t.tier}`,
      label: `${tierLabel} Faction Task`,
      definition: `${t.description} Faction Points payout ${t.fpMin}–${t.fpMax}. Examples: ${t.examples}`,
      category: 'task_tier',
      searchText: `A ${tierLabel} faction task pays ${t.fpMin} to ${t.fpMax} Faction Points. ${t.description}. Examples include ${t.examples}`,
    });
  }
  const actionData = canonActionData as {
    tiers: Array<{ level: number; name: string; dc: number; description: string; examples: string }>;
  };
  for (const t of actionData.tiers) {
    concepts.push({
      id: `action_tier_${t.level}`,
      label: `${t.name} (DC ${t.dc})`,
      definition: `${t.description} Roll needed: ${t.dc}+. Examples: ${t.examples}`,
      category: 'action_tier',
      searchText: `A ${t.name} action requires a roll of ${t.dc} or higher. ${t.description}. Examples include ${t.examples}`,
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
    case 'currency_good':
    case 'loot':
      return `The Arbiter remembers — ${concept.label}. ${concept.definition}`;
    case 'weapon':
      return `The Arbiter speaks of the weapon — ${concept.label}. ${concept.definition}`;
    case 'armor':
      return `The Arbiter speaks of the armor — ${concept.label}. ${concept.definition}`;
    case 'skill':
      return `The Arbiter explains the skill — ${concept.label}: ${concept.definition}`;
    case 'mechanic':
    case 'task_tier':
    case 'action_tier':
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
