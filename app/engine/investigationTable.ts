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
  // OTA-071 seeds
  | 'furniture'
  | 'shelf'
  | 'machinery'
  | 'vessel'
  | 'debris'
  // OTA-073 expansion
  | 'door'
  | 'corpse'
  | 'statue'
  | 'altar'
  | 'vegetation'
  | 'stone'
  | 'text'
  | 'bone'
  | 'light'
  | 'container'
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
// Keyword → category mapping. First match wins. Ordered by
// specificity (the OTA-073 expansions go BEFORE the original 5
// where their keywords overlap — e.g., 'shrine altar' should
// hit altar, not furniture-via-"shrine"; 'bone shelf' should
// hit bone, not shelf-via-"shelf"). Word-boundary anchors keep
// substring false positives at bay.
const KEYWORD_MAP: Array<{ keywords: RegExp; category: NounCategory }> = [
  // OTA-073 — more specific categories first.
  { keywords: /\b(door|doorway|gate|portal|archway|arch|entrance|passage|hatch)\b/i, category: 'door' },
  { keywords: /\b(corpse|body|remains|skeleton|cadaver|carcass|dead)\b/i, category: 'corpse' },
  { keywords: /\b(statue|sculpture|monument|effigy|idol|bust)\b/i, category: 'statue' },
  { keywords: /\b(altar|shrine|sigil|reliquary|tabernacle)\b/i, category: 'altar' },
  { keywords: /\b(root|vine|fungus|mushroom|moss|sprout|growth|fern|weed|bramble)\b/i, category: 'vegetation' },
  { keywords: /\b(bone|skull|ribcage|ribs|jaw|claw|fang|tusk|vertebra)\b/i, category: 'bone' },
  { keywords: /\b(torch|lantern|candle|brazier|flame|ember|sconce|glowstone)\b/i, category: 'light' },
  { keywords: /\b(chest|crate|box|sack|bag|satchel|pouch|coffer|trunk|strongbox)\b/i, category: 'container' },
  { keywords: /\b(sign|plaque|scroll|tablet|inscription|mural|painting|banner|poster|notice|manuscript|book)\b/i, category: 'text' },
  { keywords: /\b(stone|boulder|monolith|megalith|slab|brick|cobble|pebble|standing[- ]stone)\b/i, category: 'stone' },
  // OTA-071 original 5.
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
  // OTA-073 expansion. All yield item names are confirmed
  // present in the catalog (app/data/items/scrap*.json or
  // material*.json) so grantItem accepts them cleanly. Drop
  // chances range from 0.08 (rare flavor-driven categories like
  // statues / altars) to 0.30 (debris that's clearly material).
  door: {
    category: 'door',
    fallbackLore: 'The frame is warped where the hinge anchored — long-dried iron, blooming with patient rust.',
    yield: { itemName: 'Bent Nail', qty: 1, chance: 0.15 },
    hookKind: null,
  },
  corpse: {
    category: 'corpse',
    fallbackLore: 'The remains are quiet. Bone-meal mixed with cloth and a faint sour note that\'s long past urgent.',
    yield: { itemName: 'Bone Sliver', qty: 1, chance: 0.25 },
    hookKind: null,
  },
  statue: {
    category: 'statue',
    fallbackLore: 'Carved features blurred by weather, but the posture is still legible — someone took the time to be remembered, even if the world forgot why.',
    yield: { itemName: 'Smooth Stone', qty: 1, chance: 0.12 },
    hookKind: null,
  },
  altar: {
    category: 'altar',
    fallbackLore: 'A residue of old offerings still rings the surface — wax, ash, a single bent coin no one came back for.',
    yield: { itemName: 'Worn Tartarian Coin', qty: 1, chance: 0.18 },
    hookKind: null,
  },
  vegetation: {
    category: 'vegetation',
    fallbackLore: 'It grows where it shouldn\'t — adapted to the bad air and the silence, threading itself through the cracks like it owns the place.',
    yield: { itemName: 'Stick', qty: 1, chance: 0.20 },
    hookKind: null,
  },
  bone: {
    category: 'bone',
    fallbackLore: 'Bleached and porous. Tooth-marks at one end, deliberate cuts at the other — something used it before it was discarded.',
    yield: { itemName: 'Bone Sliver', qty: 1, chance: 0.35 },
    hookKind: null,
  },
  light: {
    category: 'light',
    fallbackLore: 'The flame is long out, but the residue tells you what it burned and roughly when — probably the night the world ended here.',
    yield: { itemName: 'Firewood', qty: 1, chance: 0.20 },
    hookKind: null,
  },
  container: {
    category: 'container',
    fallbackLore: 'The lid is warped, the contents are unknown until you try. The latch held — that\'s either reassuring or sinister, depending on what\'s inside.',
    yield: null, // Containers are handled by the existing open/disarm verb path; the table only narrates them.
    hookKind: null,
  },
  text: {
    category: 'text',
    fallbackLore: 'The script is half-faded. Most of it is a name, or a list of names, or a debt no one paid.',
    yield: null, // Lore-only — text nouns give story, not material.
    hookKind: null,
  },
  stone: {
    category: 'stone',
    fallbackLore: 'Tartarian stone. Granular, slightly warm where the Aether saturated the matrix decades ago — not enough to be useful, just enough to remind you the Aether is everywhere.',
    yield: { itemName: 'Small Rock', qty: 1, chance: 0.25 },
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

// OTA-074 — callback variant pools. Per-kind line templates
// that take the noun and (for item results) the item name.
// rotatingPick keeps consecutive callbacks varied even when
// the player chains investigates on multiple consumed nouns
// in a row. Each pool is keyed on the same 'investigation.
// callback.{kind}' string so the rotation is global per kind
// — fine here because the player rarely re-investigates more
// than a handful of consumed nouns per scene; collision with
// the variety budget is acceptable.

const CALLBACK_ITEM_LINES: Array<(noun: string, item: string) => string> = [
  (n, i) => `You've already turned the ${n} over here. The ${i.toLowerCase()} was the only thing of value.`,
  (n, i) => `The ${n} is empty now — you took the ${i.toLowerCase()} on your first pass.`,
  (n, i) => `Nothing more in the ${n}. The ${i.toLowerCase()} you found was tucked deep.`,
  (n, i) => `You've already worked the ${n}. The ${i.toLowerCase()} was the harvest.`,
  (n, i) => `The ${n} keeps its silence now. The ${i.toLowerCase()} was the prize.`,
];

const CALLBACK_FLAVOR_LINES: Array<(noun: string) => string> = [
  (n) => `You've already turned the ${n} over here. It keeps its lore but offers nothing new.`,
  (n) => `The ${n} has surrendered what it can to your attention. Nothing fresh.`,
  (n) => `You read the ${n} the same way you did before. Same story, no addendum.`,
  (n) => `Your hands settle on the ${n} again. It's still telling the same quiet story.`,
  (n) => `The ${n} is familiar now. Whatever it had to say to a stranger, it already said.`,
];

const CALLBACK_HOOK_LINES: Array<(noun: string) => string> = [
  (n) => `You've already studied the ${n} carefully. The thread you pulled is still warm in your mind.`,
  (n) => `Looking at the ${n} again brings the lead back into focus, but nothing new.`,
  (n) => `The ${n} suggested its thread on your first pass — it isn't suggesting another.`,
];

const CALLBACK_DEFAULT_LINES: Array<(noun: string) => string> = [
  (n) => `You've already turned the ${n} over here. The lore stays put.`,
  (n) => `Whatever the ${n} held, you've already pulled it loose.`,
];

// Lazy require to avoid circular import. rotatingPick lives in
// rng.ts which doesn't import from investigationTable, so the
// direct import would be fine — but keeping the require here
// matches the pattern other call sites use and makes the pure
// module a touch easier to unit test (the require can be
// stubbed).
function pickCallback<T>(pool: readonly T[], kind: string): T {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { rotatingPick } = require('./rng') as typeof import('./rng');
  return rotatingPick(pool, `investigation.callback.${kind}`);
}

/** Build the callback line printed on repeat investigates. Uses
 *  the result that was recorded on the first investigate so the
 *  callback is SPECIFIC ("the cushion was the only thing of
 *  value") instead of the pre-OTA generic "Nothing more to
 *  find" refusal. OTA-074 adds variant pools per kind so
 *  consecutive callbacks don't read identical. Defensive
 *  fallback if entry.result is missing (shouldn't happen on a
 *  properly-consumed entry but guarded anyway). */
export function callbackLine(noun: string, entry: InvestigationEntry): string {
  if (!entry.result) {
    return pickCallback(CALLBACK_DEFAULT_LINES, 'default')(noun);
  }
  switch (entry.result.kind) {
    case 'item':
      return pickCallback(CALLBACK_ITEM_LINES, 'item')(noun, entry.result.detail);
    case 'hook':
      return pickCallback(CALLBACK_HOOK_LINES, 'hook')(noun);
    case 'flavor':
    default:
      return pickCallback(CALLBACK_FLAVOR_LINES, 'flavor')(noun);
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
  rand: () => number = Math.random,
): InvestigationResult {
  const lore = resolveLore(entry);
  // OTA-073 — yield-roll activated. When the template has a
  // yield AND the roll lands under the chance, return an item
  // outcome; the caller is responsible for the grantItem call
  // + reward log. Otherwise, flavor-only outcome with the
  // lore line. The yield line appends the item naturally to
  // the end of the lore so a single log entry conveys both
  // "what you found out about the noun" and "what you found
  // hidden in it".
  if (entry.yield && rand() < entry.yield.chance) {
    return {
      kind: 'item',
      detail: entry.yield.itemName,
      line: `${lore} Tucked into the seam: a ${entry.yield.itemName.toLowerCase()}.`,
    };
  }
  return {
    kind: 'flavor',
    detail: '',
    line: lore,
  };
}

// ===========================================================
// OTA-072 — Lazy Qwen lore generation.
// ===========================================================
//
// Signature: a function that takes a chat-style messages array
// + generation options, returns the generated string. Matches
// the QwenGenerativeEngine.generate shape but kept narrow
// so we don't pull the whole engine type into the pure module
// (avoids circular imports + simplifies the unit-test surface).
export type LoreGenerator = (
  messages: ReadonlyArray<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  opts: { maxNewTokens?: number; temperature?: number },
) => Promise<string>;

// Default timeout for a single Qwen lore call. Empirically
// Qwen2.5-0.5B inference for ~50 new tokens takes 50-300ms on
// a mid-range Android; 2500ms gives plenty of headroom for a
// slow device or cold context while still keeping the UI
// responsive (player taps INVESTIGATE → modal closes → at most
// 2.5s before the line appears). On timeout we fall back to
// the curated template lore.
const LORE_TIMEOUT_MS = 2500;

// Hard cap on the generated lore string. Qwen sometimes runs
// long; we want a 1-2 sentence atmospheric line, not a
// paragraph. Truncate at the first sentence boundary past 60
// chars, or hard-cut at 240.
const LORE_MAX_CHARS = 240;

function buildLorePrompt(
  entry: InvestigationEntry,
  locationName: string,
): ReadonlyArray<{ role: 'system' | 'user' | 'assistant'; content: string }> {
  return [
    {
      role: 'system',
      content:
        'You are the Arbiter, a laconic narrator in a post-flood fantasy world called Tartaria. ' +
        'Produce ONE short atmospheric sentence (max 30 words) describing what the player notices ' +
        'when investigating a scene object. Sensory and specific. No second-person address ("you"), ' +
        'just the description. No setup phrases ("you see"). No metaphors about time or memory unless ' +
        'they ground in a physical detail. Plain prose, no quotation marks, no markdown.',
    },
    {
      role: 'user',
      content: `Object: ${entry.noun} (category: ${entry.category})\nLocation: ${locationName}\nNarrate one sentence:`,
    },
  ];
}

function trimLore(raw: string): string {
  let s = raw.trim();
  // Strip leading/trailing quotation marks Qwen sometimes
  // wraps the output in.
  s = s.replace(/^["“'`]+|["”'`]+$/g, '').trim();
  if (s.length === 0) return '';
  // Sentence-boundary cut past 60 chars when we're over the
  // max — keeps the line atmospheric without truncating mid-
  // word.
  if (s.length > LORE_MAX_CHARS) {
    const slice = s.slice(0, LORE_MAX_CHARS);
    const lastPeriod = slice.lastIndexOf('.');
    if (lastPeriod >= 60) return slice.slice(0, lastPeriod + 1);
    return slice + '…';
  }
  return s;
}

/** Generate a Qwen lore line for an investigation entry. Falls
 *  back to the curated template lore on timeout / error /
 *  empty output. The returned string is what should be shown
 *  to the player AND cached into entry.loreLine for callback
 *  reference.
 *
 *  Caller is responsible for actually mutating entry.loreLine
 *  (this fn stays pure beyond the async Qwen call). */
export async function generateLoreAsync(
  entry: InvestigationEntry,
  locationName: string,
  generator: LoreGenerator | null,
): Promise<string> {
  const fallback = templateFor(entry.category).fallbackLore;
  if (!generator) return fallback;
  const messages = buildLorePrompt(entry, locationName);
  try {
    const racePromise = generator(messages, { maxNewTokens: 60, temperature: 0.85 });
    const timeoutPromise = new Promise<string>((_resolve, reject) => {
      setTimeout(() => reject(new Error('Qwen lore timeout')), LORE_TIMEOUT_MS);
    });
    const raw = await Promise.race([racePromise, timeoutPromise]);
    const trimmed = trimLore(raw);
    if (trimmed.length === 0) return fallback;
    return trimmed;
  } catch {
    return fallback;
  }
}
