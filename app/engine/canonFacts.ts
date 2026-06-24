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

import arbiterTitlesData from '../data/lore/arbiter-titles.json';
import { resolveTable } from './contentPack';

interface ArbiterTitle {
  id: string;
  title: string;
  requirement: string;
  perk: string;
  tags: string[];
}

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
  let fallback: string | null = null; // first passage tagged "always"
  for (const p of passages) {
    if (!p || typeof p.text !== 'string' || !p.text.trim()) continue;
    const tags = passageTags(p);
    if (tags.includes('always') && fallback === null) fallback = p.text;
    let score = 0;
    for (const tag of tags) {
      if (tag === 'always') continue; // a routing flag, not a scene keyword
      for (const k of q.sceneKeywords) {
        if (k.includes(tag) || tag.includes(k)) score += 1;
      }
    }
    if (score > 0 && (!best || score > best.score)) best = { text: p.text, score };
  }
  // Scene-specific passage wins; else the "always" baseline; else nothing.
  const chosen = best?.text ?? fallback;
  return chosen ? truncateWords(chosen, 60) : null;
}

export function buildCanonFactsParagraph(q: CanonFactQuery): string | null {
  // engine_Dev — canon facts come ENTIRELY from the active lore document (author override or
  // the installed generic default — always present). No built-in Tartaria fallback.
  const loreDoc = resolveTable<LorePassage>('lore', EMPTY_LORE);
  return loreDoc.length > 0 ? pickLorePassage(loreDoc, q) : null;
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
