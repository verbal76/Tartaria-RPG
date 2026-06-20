// canonFacts — picks 0-2 canon lore facts to inject into the Qwen
// system prompt based on the current scene.
//
// OTA-232 — first wave of canon ingestion. The 3 docs (Canon Event
// Log, Arbiter Titles, Food & Drink Table) live as structured JSON
// in `app/data/lore/*.json`. This helper surfaces a small slice into
// the LLM context so the Arbiter can:
//   - Reference real historical events when the scene's location or
//     tags match an event's keywords (Berlin scene → 1998 Berlin
//     Betrayal nudge).
//   - Mention canonical food / drink names when the scene is at a
//     vendor / market / Mud Dweller camp.
//   - Foreshadow earnable titles when the player's action profile
//     suggests they're close.
//
// Authoring rule (matches the FirstTimeHint cap): the injected facts
// section is a single compact paragraph, ~50 words max. Anything
// bigger eats the model's already-tight 90-token narration budget.

import canonEventsData from '../data/lore/canon-events.json';
import canonFoodDrinkData from '../data/lore/canon-food-drink.json';
import arbiterTitlesData from '../data/lore/arbiter-titles.json';
import { resolveTable } from './contentPack';

interface CanonEvent {
  id: string;
  year: number;
  title: string;
  factions: string[];
  location: string;
  outcome: string;
  summary: string;
  tags: string[];
}

interface CanonFoodDrink {
  id: string;
  name: string;
  type: 'food' | 'drink';
  rarity: string;
  source: string;
  effect: string;
  tcValue: number;
}

interface ArbiterTitle {
  id: string;
  title: string;
  requirement: string;
  perk: string;
  tags: string[];
}

export const CANON_EVENTS = (canonEventsData as { events: CanonEvent[] }).events;
export const CANON_FOOD_DRINK = (canonFoodDrinkData as { items: CanonFoodDrink[] }).items;
export const ARBITER_TITLES = (arbiterTitlesData as { titles: ArbiterTitle[] }).titles;

export interface CanonFactQuery {
  /** Lowercase scene location name + tags + biome — keyword soup for tag matching. */
  sceneKeywords: string[];
  /** True when a vendor is staged in the scene. Unlocks the food/drink line. */
  hasVendor: boolean;
  /** Player faction id, if any. Used to surface events that involved that faction. */
  playerFactionId?: string;
}

/** Build the compact CANON FACTS paragraph for Qwen system prompt
 *  injection. Returns null when no facts apply — the caller skips
 *  the section entirely rather than print a stub. */
// engine_Dev — author "Lore document" passages. When the dev has uploaded a
// 'lore' table, it REPLACES the built-in Tartaria canon entirely: the narrator
// surfaces the passage whose tags best match the scene (or nothing if none do).
interface LorePassage { tags?: unknown; keywords?: unknown; text?: unknown }
const EMPTY_LORE: readonly LorePassage[] = [];

function passageTags(p: LorePassage): string[] {
  const raw = Array.isArray(p.tags) ? p.tags : Array.isArray(p.keywords) ? p.keywords : [];
  return raw.filter((t): t is string => typeof t === 'string').map((t) => t.toLowerCase());
}

function truncateWords(s: string, n: number): string {
  const w = s.trim().split(/\s+/);
  return w.length <= n ? s.trim() : `${w.slice(0, n).join(' ')}…`;
}

function pickLorePassage(passages: readonly LorePassage[], q: CanonFactQuery): string | null {
  let best: { text: string; score: number } | null = null;
  for (const p of passages) {
    if (!p || typeof p.text !== 'string' || !p.text.trim()) continue;
    let score = 0;
    for (const tag of passageTags(p)) {
      for (const k of q.sceneKeywords) {
        if (k.includes(tag) || tag.includes(k)) score += 1;
      }
    }
    if (score > 0 && (!best || score > best.score)) best = { text: p.text, score };
  }
  return best ? truncateWords(best.text, 60) : null;
}

export function buildCanonFactsParagraph(q: CanonFactQuery): string | null {
  // Author lore document wins outright when present.
  const loreDoc = resolveTable<LorePassage>('lore', EMPTY_LORE);
  if (loreDoc.length > 0) return pickLorePassage(loreDoc, q);

  const lines: string[] = [];

  const event = pickCanonEvent(q);
  if (event) {
    const factions = event.factions.join(', ');
    lines.push(`${event.year} · ${event.title} (${factions}): ${event.summary}`);
  }

  if (q.hasVendor) {
    const item = pickFoodDrinkForVendor(q);
    if (item) {
      lines.push(`Canonical wares may include "${item.name}" (${item.rarity} ${item.type}, ${item.tcValue} TC): ${item.effect}.`);
    }
  }

  if (lines.length === 0) return null;
  return lines.join(' ');
}

function pickCanonEvent(q: CanonFactQuery): CanonEvent | null {
  let best: { event: CanonEvent; score: number } | null = null;
  for (const event of CANON_EVENTS) {
    let score = 0;
    for (const tag of event.tags) {
      const t = tag.toLowerCase();
      for (const k of q.sceneKeywords) {
        if (k.includes(t) || t.includes(k)) score += 1;
      }
    }
    if (q.playerFactionId) {
      const f = q.playerFactionId.toLowerCase();
      if (event.factions.some((x) => x.toLowerCase().includes(f) || f.includes(x.toLowerCase()))) {
        score += 1;
      }
    }
    if (score > 0 && (!best || score > best.score)) best = { event, score };
  }
  return best?.event ?? null;
}

function pickFoodDrinkForVendor(q: CanonFactQuery): CanonFoodDrink | null {
  const keywords = q.sceneKeywords.join(' ');
  const isMudDweller = /mud.?dweller|mud.?monarch/.test(keywords);
  const isTartarianMarket = /tartarian|market|ruin/.test(keywords);
  const isUnknowingMasses = /unknowing|surface|wasteland/.test(keywords);
  const matches = CANON_FOOD_DRINK.filter((it) => {
    const src = it.source.toLowerCase();
    if (isMudDweller && /mud.?dweller|mud.?monarch/.test(src)) return true;
    if (isTartarianMarket && /tartarian/.test(src)) return true;
    if (isUnknowingMasses && /unknowing|surface|wasteland/.test(src)) return true;
    return false;
  });
  if (matches.length === 0) return null;
  // Deterministic from keyword joint hash so the same scene tends to
  // surface the same canonical item (avoids prompt-jitter between turns).
  let hash = 5381;
  for (let i = 0; i < keywords.length; i++) {
    hash = ((hash << 5) + hash + keywords.charCodeAt(i)) >>> 0;
  }
  return matches[hash % matches.length] ?? null;
}

/** Look up a title by free-text. Phase 1 — used by the future
 *  Arbiter Titles screen / "ask the arbiter about <title>" path.
 *  Substring-insensitive match against title name or tags. */
export function findArbiterTitle(query: string): ArbiterTitle | null {
  const q = query.toLowerCase().trim();
  if (!q) return null;
  for (const t of ARBITER_TITLES) {
    if (t.title.toLowerCase().includes(q) || q.includes(t.title.toLowerCase())) return t;
  }
  for (const t of ARBITER_TITLES) {
    if (t.tags.some((tag) => tag.includes(q) || q.includes(tag))) return t;
  }
  return null;
}
