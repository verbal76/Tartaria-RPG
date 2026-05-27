// OTA-071 — Per-room investigation table. Every ambient noun
// added to a scene gets a persistent entry with attributes
// (category, lore line, yield, hook potential, consumed flag,
// recorded result). Investigation always produces a specific
// outcome the first time, and a specific callback line on
// repeat taps — no more meaningless "Nothing more to find"
// first taps.
//
// This OTA ships the foundational layer:
//   - Schema (InvestigationEntry interface)
//   - Categorizer + 5 curated templates
//   - Pure helpers: makeEntry, seedInvestigationTable,
//     resolveLore, callbackLine, rollOutcome
// All entries start with loreLine=null and the resolver returns
// the template's fallback string. OTA-072 will replace the
// null-branch with a lazy Qwen call. OTA-073 will activate
// the yield-roll mechanics (this OTA produces flavor-only
// outcomes — no items granted).
//
// Pure module — no React, no zustand, no async work. The
// engine integration in gameStore.ts calls into here for
// every investigate intent the table knows about.

export type NounCategory =
  | 'furniture'
  | 'shelf'
  | 'machinery'
  | 'vessel'
  | 'debris'
  | 'generic';

export interface InvestigationYield {
  itemName: string;
  qty: number;
  /** 0..1 — chance the yield drops on first investigate. */
  chance: number;
}

export type InvestigationResultKind = 'item' | 'hook' | 'flavor';

export interface InvestigationResult {
  kind: InvestigationResultKind;
  /** Item name for kind='item', hook id for kind='hook',
   *  empty for kind='flavor'. Used by callbackLine to build a
   *  specific repeat-tap message. */
  detail: string;
  /** The exact line printed on the FIRST investigate. Stored so
   *  the callback line on repeat taps can reference what was
   *  found ("...the cushion was the only thing of value"). */
  line: string;
}

export interface InvestigationEntry {
  /** Canonical noun as it appears in scene.ambientNouns. */
  noun: string;
  category: NounCategory;
  /** Unix ms at seed time. */
  generatedAt: number;
  /** Curated or Qwen-generated lore string. Null until first
   *  resolved — OTA-072 will lazily fill via Qwen, OTA-071
   *  resolves to the template fallback every time. */
  loreLine: string | null;
  /** Item yield + drop chance. Null if the category has no
   *  yield. OTA-071 holds the data but does NOT roll yields;
   *  OTA-073 activates the roll. */
  yield: InvestigationYield | null;
  /** Reserved for OTA-073/075 hook seeding. */
  hookKind: string | null;
  consumed: boolean;
  consumedAt: number | null;
  /** Recorded on first investigate; replayed by callbackLine on
   *  repeat taps so the callback is SPECIFIC, not generic. */
  result: InvestigationResult | null;
}

interface Template {
  category: NounCategory;
  /** Fallback lore string used when loreLine is null. OTA-072
   *  replaces the null-resolve path with a Qwen call that
   *  caches into loreLine; this string remains the fallback
   *  when Qwen is unavailable or errors. */
  fallbackLore: string;
  yield: InvestigationYield | null;
  hookKind: string | null;
}

// Keyword → category mapping. First match wins. Ordered by
// specificity (machinery before generic-shaped words). Tested
// against the noun as a whole; word-boundary anchors keep
// "shelf" from matching "myself" etc.
const KEYWORD_MAP: Array<{ keywords: RegExp; category: NounCategory }> = [
  { keywords: /\b(bench|chair|table|stool|cushion|couch|seat|desk|cot|bed|pew)\b/i, category: 'furniture' },
  { keywords: /\b(shelf|shelves|rack|bookcase|cabinet|cupboard|locker)\b/i, category: 'shelf' },
  { keywords: /\b(conduit|console|sentinel|generator|mechanism|machine|device|panel|terminal|engine|motor|pump|valve)\b/i, category: 'machinery' },
  { keywords: /\b(vat|drum|urn|jar|pot|container|barrel|cask|crucible|basin|trough)\b/i, category: 'vessel' },
  { keywords: /\b(rubble|scrap|debris|wreckage|fragments?|shards?|pile|heap|husk)\b/i, category: 'debris' },
];

const TEMPLATES: Record<NounCategory, Template> = {
  furniture: {
    category: 'furniture',
    fallbackLore: 'You run your hands over the worn surface. Faint indentations — the shape of past use — refuse to tell their story.',
    yield: { itemName: 'Cushion Scraps', qty: 1, chance: 0.20 },
    hookKind: null,
  },
  shelf: {
    category: 'shelf',
    fallbackLore: 'Empty hooks and dust marks where things used to rest. The shelf remembers what was taken; you do not.',
    yield: { itemName: 'Paper Scraps', qty: 1, chance: 0.25 },
    hookKind: null,
  },
  machinery: {
    category: 'machinery',
    fallbackLore: 'The metal is cold and unresponsive. A faint Aetheric hum, fading, says the mechanism was alive within the last decade.',
    yield: { itemName: 'Machine Part', qty: 1, chance: 0.15 },
    hookKind: null,
  },
  vessel: {
    category: 'vessel',
    fallbackLore: 'You tilt the rim. A residue of something long-evaporated coats the inside — sour, organic, old.',
    yield: { itemName: 'Liquid Sample', qty: 1, chance: 0.18 },
    hookKind: null,
  },
  debris: {
    category: 'debris',
    fallbackLore: 'Broken stone and dried mortar. The wreckage gives up no secrets — the secrets fell with the building that owned them.',
    yield: { itemName: 'Useful Scrap', qty: 1, chance: 0.30 },
    hookKind: null,
  },
  generic: {
    category: 'generic',
    fallbackLore: 'You look it over. Nothing about it sings, nothing about it warns. Tartaria is full of objects waiting to be remembered.',
    yield: null,
    hookKind: null,
  },
};

/** Map a noun string to the category whose template applies.
 *  Falls back to 'generic' if no keyword matches. */
export function categorizeNoun(noun: string): NounCategory {
  for (const entry of KEYWORD_MAP) {
    if (entry.keywords.test(noun)) return entry.category;
  }
  return 'generic';
}

export function templateFor(category: NounCategory): Template {
  return TEMPLATES[category];
}

/** Seed a single entry for a noun. Pure function — no side
 *  effects, no Qwen calls. */
export function makeEntry(noun: string): InvestigationEntry {
  const category = categorizeNoun(noun);
  const tpl = templateFor(category);
  return {
    noun,
    category,
    generatedAt: Date.now(),
    loreLine: null,
    yield: tpl.yield ? { ...tpl.yield } : null,
    hookKind: tpl.hookKind,
    consumed: false,
    consumedAt: null,
    result: null,
  };
}

// Pinned surface chips ('the ground' / 'the floor' / 'the mud')
// are handled by the existing dig-here path in the investigate
// handler; they get their own loot-roll mechanics. Skip them in
// the table so we don't double-handle.
const PINNED_GROUND_RE = /^(the\s+)?(ground|floor|mud)$/i;

/** Build the per-room table from an array of ambient nouns.
 *  Returns a Record keyed by lowercase noun for fast lookup.
 *  Skips pinned ground surfaces (handled elsewhere). Skips
 *  duplicates (case-insensitive). */
export function seedInvestigationTable(
  nouns: readonly string[],
): Record<string, InvestigationEntry> {
  const table: Record<string, InvestigationEntry> = {};
  for (const n of nouns) {
    const trimmed = n.trim();
    if (!trimmed) continue;
    if (PINNED_GROUND_RE.test(trimmed)) continue;
    const key = trimmed.toLowerCase();
    if (table[key]) continue;
    table[key] = makeEntry(trimmed);
  }
  return table;
}

/** Resolve the lore line for an entry. Returns the cached
 *  loreLine if set; otherwise falls back to the curated template
 *  string. OTA-072 will replace the null-branch with an async
 *  Qwen call that caches the generated lore into loreLine for
 *  next time. */
export function resolveLore(entry: InvestigationEntry): string {
  if (entry.loreLine && entry.loreLine.length > 0) return entry.loreLine;
  return templateFor(entry.category).fallbackLore;
}

/** Build the callback line printed on repeat investigates. Uses
 *  the result that was recorded on the first investigate so the
 *  callback is SPECIFIC ("the cushion was the only thing of
 *  value") instead of the pre-OTA generic "Nothing more to
 *  find" refusal. Defensive fallback if entry.result is missing
 *  (shouldn't happen on a properly-consumed entry but guarded
 *  anyway). */
export function callbackLine(noun: string, entry: InvestigationEntry): string {
  if (!entry.result) {
    return `You've already turned the ${noun} over here. The lore stays put.`;
  }
  switch (entry.result.kind) {
    case 'item':
      return `You've already turned the ${noun} over here. ${entry.result.detail} was the only thing of value.`;
    case 'hook':
      return `You've already studied the ${noun} carefully. The thread you pulled is still warm in your mind.`;
    case 'flavor':
    default:
      return `You've already turned the ${noun} over here. It keeps its lore but offers nothing new.`;
  }
}

/** Roll the first-investigate outcome. Pure: takes the entry
 *  and an optional rand fn (for test determinism); returns the
 *  result envelope without mutating. The caller marks consumed
 *  and applies side effects (inventory grant, log writes).
 *
 *  OTA-071: yield-roll path is INTENTIONALLY DISABLED — every
 *  outcome is kind='flavor' with the resolved lore line. The
 *  yield data is held on the entry but never rolled. OTA-073
 *  flips the roll on so first investigates of a yield-bearing
 *  noun can drop the curated item with the template's chance. */
export function rollOutcome(
  entry: InvestigationEntry,
  _rand: () => number = Math.random,
): InvestigationResult {
  const lore = resolveLore(entry);
  // OTA-071 — yield mechanics deferred to OTA-073. Always
  // returns flavor outcome with the lore line.
  return {
    kind: 'flavor',
    detail: '',
    line: lore,
  };
}
