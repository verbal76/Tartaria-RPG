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
  // OTA-080 expansion — landmark covers tall standing
  // architecture (spire, tower, obelisk, pillar...) and
  // chandelier-class hanging features. Categories that
  // would otherwise fall through to the generic catchall
  // even though they're clearly distinct scene anchors.
  | 'landmark'
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
  // OTA-080 — light keywords add chandelier (was falling to
  // generic in the playtest log).
  { keywords: /\b(torch|lantern|candle|brazier|flame|ember|sconce|glowstone|chandelier)\b/i, category: 'light' },
  { keywords: /\b(chest|crate|box|sack|bag|satchel|pouch|coffer|trunk|strongbox)\b/i, category: 'container' },
  // OTA-077 + OTA-080 — text keywords add chalkboard /
  // blackboard / slate / writ / ledger / journal + mosaic /
  // tapestry / tome / parchment.
  { keywords: /\b(sign|plaque|scroll|tablet|inscription|mural|painting|banner|poster|notice|manuscript|book|chalkboard|blackboard|slate|ledger|journal|writ|map|note|mosaic|tapestry|tome|parchment|fresco)\b/i, category: 'text' },
  // OTA-080 — NEW landmark category for tall architecture
  // that previously fell through to the generic catchall:
  // spire / tower / dome / cupola / steeple / minaret +
  // pillar / column / obelisk. These are scene anchors, not
  // generic objects; they deserve a category with their own
  // template + yield instead of the catchall flavor line.
  { keywords: /\b(spire|tower|dome|cupola|steeple|minaret|pillar|column|obelisk|pylon|standing[- ]stone)\b/i, category: 'landmark' },
  { keywords: /\b(stone|boulder|monolith|megalith|slab|brick|cobble|pebble|plinth|sarcophagus|tile)\b/i, category: 'stone' },
  // OTA-071 original 5.
  { keywords: /\b(bench|chair|table|stool|cushion|couch|seat|desk|cot|bed|pew|throne|counter|lectern)\b/i, category: 'furniture' },
  { keywords: /\b(shelf|shelves|rack|bookcase|cabinet|cupboard|locker)\b/i, category: 'shelf' },
  // OTA-077 + OTA-080 — machinery keywords expanded with
  // spool / reel / bobbin / coil / gear / cog / sprocket /
  // lever / pipe / cable / wire / runecaster / capacitor /
  // dial / gauge + anvil / forge / loom / instrument /
  // fuel cell.
  { keywords: /\b(conduit|console|sentinel|generator|mechanism|machine|device|panel|terminal|engine|motor|pump|valve|spool|reel|bobbin|coil|gear|cog|sprocket|lever|pipe|cable|wire|runecaster|capacitor|dial|gauge|anvil|forge|loom|instrument|fuel[- ]cell)\b/i, category: 'machinery' },
  // OTA-080 — vessel keywords add fountain / bottle / glass /
  // dish (common in interior + ruined-fountain scenes).
  { keywords: /\b(vat|drum|urn|jar|pot|container|barrel|cask|crucible|basin|trough|fountain|bottle|glass|dish)\b/i, category: 'vessel' },
  // OTA-080 — debris keywords add plank / board / catwalk.
  { keywords: /\b(rubble|scrap|debris|wreckage|fragments?|shards?|pile|heap|husk|plank|board|catwalk)\b/i, category: 'debris' },
];

const TEMPLATES: Record<NounCategory, Template> = {
  furniture: {
    category: 'furniture',
    fallbackLore: 'You run your hands over the worn surface. Faint indentations — the shape of past use — refuse to tell their story.',
    // OTA-078 — yield remapped from "Cushion Scraps" (not in
    // catalog → silent grantItem failure) to Stick (confirmed
    // in materials.json). Same fix applied across all five
    // OTA-071 originals where the named yield item never
    // existed in app/data/items/*.json.
    yield: { itemName: 'Stick', qty: 1, chance: 0.20 },
    hookKind: null,
  },
  shelf: {
    category: 'shelf',
    fallbackLore: 'Empty hooks and dust marks where things used to rest. The shelf remembers what was taken; you do not.',
    yield: { itemName: 'Worn Tartarian Coin', qty: 1, chance: 0.25 },
    hookKind: null,
  },
  machinery: {
    category: 'machinery',
    fallbackLore: 'The metal is cold and unresponsive. A faint residual hum, fading, says the mechanism was alive within the last decade.',
    yield: { itemName: 'Bent Nail', qty: 1, chance: 0.15 },
    hookKind: null,
  },
  vessel: {
    category: 'vessel',
    fallbackLore: 'You tilt the rim. A residue of something long-evaporated coats the inside — sour, organic, old.',
    yield: { itemName: 'Mud Fragment', qty: 1, chance: 0.18 },
    hookKind: null,
  },
  debris: {
    category: 'debris',
    fallbackLore: 'Broken stone and dried mortar. The wreckage gives up no secrets — the secrets fell with the building that owned them.',
    yield: { itemName: 'Small Rock', qty: 1, chance: 0.30 },
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
    fallbackLore: 'Old stone. Granular, slightly warm where something once saturated the matrix decades ago — not enough to be useful, just enough to remind you the strangeness here runs deep.',
    yield: { itemName: 'Small Rock', qty: 1, chance: 0.25 },
    hookKind: null,
  },
  // OTA-080 — landmark category. Spires / towers / pillars
  // are scene anchors. Yield Aether Residue (catalog confirmed
  // present) at 0.10 — low chance, but possible payoff for
  // climbing/investigating the most visible feature in a
  // scene.
  landmark: {
    category: 'landmark',
    fallbackLore: 'The {noun} rises out of the ground like a memory the world refuses to bury. Up close, the surface is scored with old weathering and finer marks — names, prayers, accounts no one closed.',
    yield: { itemName: 'Aether Residue', qty: 1, chance: 0.10 },
    hookKind: null,
  },
  generic: {
    category: 'generic',
    // OTA-077 — noun-aware. Pre-OTA the line read "you look it
    // over" which made every generic-category investigate
    // look identical in the log, hiding which noun the IIFE
    // was actually resolving when async lines interleaved.
    fallbackLore: 'You look the {noun} over. Nothing about it sings, nothing about it warns — the world is full of objects waiting to be remembered.',
    yield: null,
    hookKind: null,
  },
};

/** engine_Dev — per-category default lore (neutral), exported so the flavor system
 *  can document/override it. Overridable from the uploaded `flavor` block under the
 *  key `investigateLore` (a record of category -> single lore line). */
export const INVESTIGATE_LORE_DEFAULT: Partial<Record<NounCategory, string>> =
  Object.fromEntries(
    Object.entries(TEMPLATES).map(([k, t]) => [k, (t as Template).fallbackLore]),
  ) as Partial<Record<NounCategory, string>>;

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

// OTA-080 — Creepy variant pool. Per-category alternate
// lores that occasionally surface in place of the standard
// fallbackLore. Player said: "the flavor text we discussed
// earlier where odd things are found on a object like
// creepy statements marked on them or something just isnt
// right about it". Tone is uncanny, not horror — quiet,
// specific, off-putting. Frequency is bounded (≈17% via the
// CREEPY_RATE constant) and deterministic per noun (seeded
// hash on entry.noun) so the same bench in the same room
// consistently resolves to the same line within a session
// — not a re-roll each render.
// engine_Dev — already lore-neutral (uncanny, no proper nouns). Overridable from
// the uploaded `flavor` block under the key `investigateCreepy` (a record of
// category -> lines).
export const CREEPY_VARIANTS: Partial<Record<NounCategory, readonly string[]>> = {
  furniture: [
    'The bench has someone\'s last meal still on it — a tin plate, untouched, the food perfectly preserved. The fork is laid down mid-bite.',
    'The chair faces the wall. Long scratches in the floor show it was dragged there from across the room, by someone who wanted to sit very still.',
  ],
  shelf: [
    'Every jar on the shelf is labeled in the same hand: ANNA, ANNA, ANNA. The dust on them is fresh. The dust on the floor is not.',
  ],
  machinery: [
    'The dial moves a hair while you watch it. Nothing is powering it. When you look away and back, it has moved again — toward you.',
  ],
  vessel: [
    'Inside the jar: a single tooth in clear liquid. The tooth is too large to be a child\'s, and the liquid is faintly warm.',
    'The pot is full to the rim with something that holds the shape of fingers pressed into it from the inside.',
  ],
  debris: [
    'Among the rubble: a child\'s shoe, still laced. Beside it, a second shoe — the same size, but for the opposite foot of the same child.',
  ],
  door: [
    'The door has been opened from the inside many times. The handle on this side is polished smooth. The handle on the other side is rusted shut.',
  ],
  corpse: [
    'The remains are arranged. Hands folded, ankles crossed, a stone placed gently on the sternum. Whoever did this did it slowly, and afterward.',
  ],
  statue: [
    'The statue\'s eyes have been chiseled out and refilled with wet clay. The clay is still soft. You did not pass anyone on the way in.',
  ],
  altar: [
    'The altar holds a list of names carved in a child\'s hand. The last name on the list is unfinished — the carver stopped partway through a letter you recognize.',
  ],
  vegetation: [
    'The moss grows only where someone has knelt. Five patches, evenly spaced, all facing the same blank wall.',
  ],
  bone: [
    'The bone has teeth-marks at one end and a name scratched at the other — not carved, scratched, by a fingernail, over a long time.',
  ],
  light: [
    'The candle is unlit but the wax is warm. The wick has been pinched between two fingers very recently. Yours are clean.',
  ],
  text: [
    'The chalkboard has a child\'s name carved over and over: ANNA. The chalk dust on the floor is fresh. There is no chalk in the room.',
    'The ledger\'s final entry, in a different hand: "Whoever finds this, I am sorry. I left the door open."',
  ],
  stone: [
    'The stone is warm on one face — handprint-warm — and cold on the other. The warm face is the one against the wall.',
  ],
  landmark: [
    'The spire leans a fraction more each time you blink. You have not walked any closer to it — but it has walked closer to you.',
  ],
};

const CREEPY_RATE = 0.17;

// Deterministic per-noun hash for the creepy roll. Same noun
// in the same session resolves to the same lore, so the
// player isn't confused by the bench rotating between normal
// and creepy text on every render.
function nounSeed(noun: string): number {
  let h = 0;
  for (let i = 0; i < noun.length; i++) {
    h = (h * 31 + noun.charCodeAt(i)) >>> 0;
  }
  return h;
}

function pickCreepyVariant(pool: readonly string[], category: NounCategory): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { rotatingPick } = require('./rng') as typeof import('./rng');
  return rotatingPick(pool, `investigation.creepy.${category}`);
}

// OTA-125 — generic-category variant pool. Playtest log showed 4
// uncategorized nouns (siren egg, echo chamber, flood seal, water
// current) all hitting the same fallbackLore line in a row, which
// reads as broken. KEYWORD_MAP can't realistically cover every
// noun the world authors throw at it, so the generic catchall
// gets its own variety: 8 distinct lines, picked deterministically
// per noun via nounSeed. Same noun always resolves to the same
// line (player sanity), different nouns get different beats
// (immersion).
// engine_Dev — NEUTRAL defaults (no setting-specific proper nouns). Overridable
// from the uploaded `flavor` block under the key `investigateGeneric`; the engine
// keeps the ambience but a re-skin replaces the lines wholesale.
export const GENERIC_VARIANTS: readonly string[] = [
  'You look the {noun} over. Nothing about it sings, nothing about it warns — the world is full of objects waiting to be remembered.',
  'You turn the {noun} in your hands and find no answer. The silence here is patient; whatever it knew, it has decided to keep.',
  'The {noun} reads as ordinary, which out here is a small kind of relief. You let it go.',
  'You weigh the {noun} and consider it. The haze does not gather; the dust does not stir. Just a thing, in a place.',
  'You give the {noun} your full attention. It returns the gesture by being exactly what it appears to be.',
  'The {noun} resists your reading. Not hostile — just closed. Some things don\'t open for the curious.',
  'You study the {noun}. It bears no marks worth naming — no glyph, no fingerprint, no trace worth cataloguing.',
  'The {noun} sits the way ordinary things sit. Nothing leans in. You move on.',
];

/** Resolve the lore line for an entry. Returns the cached
 *  loreLine if set; otherwise picks from the category's
 *  CREEPY_VARIANTS at the OTA-080 creepy rate (deterministic
 *  per noun) or falls back to the curated template fallback.
 *  Templates use '{noun}' as a placeholder which this
 *  resolver substitutes with entry.noun. */
export function resolveLore(entry: InvestigationEntry): string {
  if (entry.loreLine && entry.loreLine.length > 0) return entry.loreLine;
  const tmpl = templateFor(entry.category);
  // engine_Dev — every pool below is overridable from the uploaded `flavor` block,
  // so a re-skin replaces the investigation ambience wholesale (the in-code
  // defaults are lore-neutral). Keys: investigateGeneric (string[]),
  // investigateCreepy (category -> string[]), investigateLore (category -> string).
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { resolveFlavor } = require('./contentPack') as typeof import('./contentPack');
  const genericPool = resolveFlavor('investigateGeneric', GENERIC_VARIANTS) as readonly string[];
  const creepyAll = resolveFlavor('investigateCreepy', CREEPY_VARIANTS) as Partial<Record<NounCategory, readonly string[]>>;
  const loreOverrides = resolveFlavor('investigateLore', {} as Partial<Record<NounCategory, string>>);
  const fallbackLore = loreOverrides[entry.category] ?? tmpl.fallbackLore;
  // OTA-080 — creepy variant roll. Bounded to ≈17% via
  // CREEPY_RATE, deterministic per noun so the same entry
  // resolves to the same line each render. Falls back to the
  // standard fallbackLore when the category has no creepy
  // pool or the deterministic roll missed.
  const creepyPool = creepyAll[entry.category];
  let line: string;
  if (creepyPool && creepyPool.length > 0) {
    const roll = (nounSeed(entry.noun.toLowerCase()) % 1000) / 1000;
    if (roll < CREEPY_RATE) {
      line = pickCreepyVariant(creepyPool, entry.category);
    } else {
      line = fallbackLore;
    }
  } else if (entry.category === 'generic') {
    // OTA-125 — generic-category variant pool. Deterministic per
    // noun so the same noun stays consistent across re-reads.
    const idx = nounSeed(entry.noun.toLowerCase()) % genericPool.length;
    line = genericPool[idx]!;
  } else {
    line = fallbackLore;
  }
  return line.replace(/\{noun\}/g, entry.noun);
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
  // engine_Dev — persona + setting come from the content pack (getNarratorPersona
  // defaults to the narrator's name; getWorldSetting is the authored setting),
  // so a reskin's investigate-narration isn't hardcoded "the Arbiter / Tartaria".
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const cp = require('./contentPack') as typeof import('./contentPack');
  const setting = cp.getWorldSetting();
  return [
    {
      role: 'system',
      content:
        cp.getNarratorPersona() + ' ' +
        (setting ? `Setting: ${setting}. ` : '') +
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
  // OTA-078 — fallback now substitutes the {noun} placeholder
  // before returning. Pre-OTA-078 the fallback path returned
  // the raw template literal "You look the {noun} over..." and
  // the IIFE's skip check at gameStore.ts compared against
  // `baseOutcome.line` (which was already substituted via
  // resolveLore). They were never equal, so the patch IIFE
  // overwrote the cached lore with the raw {noun} text — which
  // then rendered LITERALLY in the next callback or echo hook
  // ("You've already turned the {noun} over here…"). Now the
  // returned string is always render-ready and the skip-check
  // works.
  const fallback = templateFor(entry.category).fallbackLore.replace(/\{noun\}/g, entry.noun);
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

// ===========================================================
// OTA-075 — Cross-room investigation echo hooks.
// ===========================================================
//
// When the player enters a new scene, occasionally plant a
// hook that references a past investigation from a different
// room. Makes discoveries feel connected across the world —
// the bench you took cushion scraps from three rooms ago
// echoes back here as a callback hook line ("you think back
// to the bench from earlier — the cushion scraps you took.
// Something here reminds you of it.").
//
// The scan is bounded: only consumed entries with kind='item'
// or kind='hook' are eligible (flavor-only investigates would
// produce a weak callback). Sorted by consumedAt descending
// so recent investigations echo before stale ones. Returns
// null when no eligible entry exists, leaving the existing
// hook-plant logic untouched.

// Minimal room shape we read for the scan — keeps the pure
// module decoupled from the full VisitedRoom type in
// engine/types.ts (which already imports InvestigationEntry
// from here; the duck-typed shape avoids the circular import
// loop).
interface ScanRoomShape {
  roomInvestigationTable?: Record<string, InvestigationEntry>;
}

export function findReferenceableInvestigation(
  visitedRooms: Record<string, ScanRoomShape>,
  excludeRoomKey: string,
): InvestigationEntry | null {
  const candidates: InvestigationEntry[] = [];
  for (const [key, room] of Object.entries(visitedRooms)) {
    if (key === excludeRoomKey) continue;
    if (!room.roomInvestigationTable) continue;
    for (const entry of Object.values(room.roomInvestigationTable)) {
      if (!entry.consumed) continue;
      if (!entry.result) continue;
      // Flavor-only investigates would produce a weak echo;
      // only items and hooks make for a callback worth
      // surfacing.
      if (entry.result.kind === 'flavor') continue;
      candidates.push(entry);
    }
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => (b.consumedAt ?? 0) - (a.consumedAt ?? 0));
  return candidates[0] ?? null;
}

/** Build the echo hook plantedLine for a referenced past
 *  investigation entry. Per-kind variants so item echoes name
 *  the item taken, hook echoes acknowledge the thread. */
export function buildEchoHookLine(entry: InvestigationEntry): string {
  const noun = entry.noun;
  if (entry.result?.kind === 'item') {
    const item = entry.result.detail.toLowerCase();
    return `You think back to the ${noun} from earlier — the ${item} you pulled from it. Something here reminds you of it.`;
  }
  if (entry.result?.kind === 'hook') {
    return `The ${noun} from a room back surfaces in memory. The thread you pulled is still warm — and now it's tugging again.`;
  }
  return `The ${noun} from earlier comes back to mind. You're not sure why — but the connection is real.`;
}
