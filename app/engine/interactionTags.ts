// Tag-based classifier for ambient nouns. A single noun can carry
// multiple tags — 'door' is both openable and breakable; 'wagon' is
// salvageable and openable; 'pillar' is climbable and salvageable.
// The verb handlers in gameStore consult these helpers to decide
// whether the action makes sense for the target the player named.
//
// Heuristic / substring-based on purpose: with 700+ authored nouns
// across the world index, hand-tagging each is impractical. Substring
// rules cover the canonical kinds (anything with 'wall' in the name
// is climbable AND breakable, anything with 'water' is swimmable,
// etc.) and the false-positive rate stays low because the world's
// noun vocabulary is consistent.
//
// 'openable' is intentionally NOT a tag here — that lives in
// containerLoot.classifyContainer, which is the source of truth
// for what archetype a container belongs to and what loot drops.
// 'pickup' is also separate — findCatalogItem in crafting.ts decides
// whether a noun resolves to a real inventory item.

export type InteractionTag =
  | 'climbable'
  | 'swimmable'
  | 'breakable'
  | 'searchable'
  | 'salvageable';

interface TagRule {
  tag: InteractionTag;
  patterns: string[];
}

const TAG_RULES: TagRule[] = [
  {
    tag: 'climbable',
    patterns: [
      'pole', 'ladder', 'wall', 'window', 'stair', 'staircase', 'scaffold',
      'vine', 'rope', 'tower', 'spire', 'column', 'pillar', 'steeple',
      'balcony', 'rail', 'beam', 'crag', 'bridge', 'arch', 'obelisk',
      'tree', 'cliff', 'ledge', 'rung', 'walkway',
    ],
  },
  {
    tag: 'swimmable',
    patterns: [
      'water', 'tunnel', 'current', 'tide', 'pool', 'sea', 'river',
      'flood', 'cistern', 'basin', 'channel', 'sludge', 'bog',
      'lagoon', 'reservoir', 'mud sea', 'underwater',
    ],
  },
  {
    tag: 'breakable',
    patterns: [
      'door', 'barricade', 'plank', 'lock', 'seal', 'gate', 'window',
      'scaffold', 'shutter', 'crate lid', 'planking',
      'portcullis', 'beam', 'panel',
    ],
  },
  {
    tag: 'searchable',
    // OTA 185 — widened to cover the physical-mechanism nouns players
    // actually try to search in The Gate / Outskirts (chain, lever,
    // spike, emitter, portcullis, etc.). Broken machinery in the
    // wreck regularly carries identifying plates, etched serial
    // numbers, faction stamps — fair game for the hidden-text
    // reveal. Original pure-writing-surface list (wall, tablet,
    // scroll, etc.) preserved at the top so the rare-relic reveals
    // still trigger on the original nouns.
    //
    // 2026-05-25 OTA-039 — widened again so the basic hub-room
    // furniture (table, brick, gate, door, bench, banner, monolith,
    // obelisk, pedestal, reliquary, etc.) qualifies for the hidden-
    // text reveal. Playtester ran 5 investigates on common hub
    // nouns and saw zero substantive outcomes because only ~15
    // nouns were eligible. Wider pool + higher rate per OTA-039
    // brings investigate up from "flavor button" to "find things".
    patterns: [
      // Writing surfaces — original list
      'wall', 'inscription', 'mural', 'archive', 'tablet', 'tome',
      'ledger', 'slate', 'book', 'letter', 'parchment', 'log',
      'journal', 'blueprint', 'map', 'paper', 'note', 'scroll',
      'tapestry', 'sign', 'header', 'marker', 'flagstone',
      'placard', 'shelf', 'cabinet', 'drawer',
      // Physical mechanisms — playtester noted these were the
      // verbs they actually used. Often have manufacturer plates,
      // ID stamps, paint marks, etched lore.
      'lever', 'emitter', 'spike', 'chain', 'portcullis', 'valve',
      'gear', 'conduit', 'machinery', 'pipe', 'panel', 'coil',
      'circuit', 'cable', 'console', 'pillar', 'arch', 'beam',
      'fissure', 'pulse emitter', 'broken chain',
      // 2026-05-25 OTA-039 — hub furniture + relic-site surfaces.
      // All carry plausible markings (faction sigils carved into a
      // gate, a coin pressed into a brick, an inscription on a
      // pedestal, a dedication on an altar).
      'table', 'brick', 'gate', 'door', 'doorway', 'bench', 'rack',
      'chair', 'stool', 'frame', 'banner', 'standard', 'sigil',
      'monolith', 'obelisk', 'pedestal', 'plinth', 'reliquary',
      'casket', 'altar', 'shrine', 'vault', 'relic', 'statue',
      'plaque', 'urn', 'crate', 'chest', 'box', 'lockbox',
      'strongbox', 'coffer', 'safe', 'barrel', 'jar', 'bottle',
      'stone', 'masonry', 'pylon',
    ],
  },
  {
    tag: 'salvageable',
    patterns: [
      'wagon', 'drone', 'sentinel', 'automaton', 'husk', 'frame',
      'machinery', 'scrap', 'rifle', 'blade', 'sword', 'axe', 'bow',
      'spear', 'pike', 'rod', 'staff', 'gear', 'engine', 'console',
      'conduit', 'panel', 'cable', 'wire', 'coil', 'battery', 'core',
      'circuit', 'pipe', 'valve', 'pump', 'motor', 'cart', 'sled',
      'plate', 'armor', 'chain', 'mast', 'hull', 'shell', 'rifle',
      'cog', 'capacitor', 'relay', 'lever', 'lantern', 'torch',
    ],
  },
];

const TAG_CACHE = new Map<string, Set<InteractionTag>>();

// engine_Dev — drop the per-noun tag cache when the uploaded interaction-tag
// keyword override changes, so re-skin keyword additions take effect immediately.
export function invalidateInteractionTagCache(): void {
  TAG_CACHE.clear();
}

// v2.4.1 (OTA 023) — word-boundary match.
//
// The prior `lower.includes(pat)` was too greedy: short patterns
// embedded inside larger nouns triggered false positives. Examples:
//   "dust trail" → matched "rail" → climbable + tier-1 climb height
//                  → player could climb a footprint trail (visible
//                  bug in Bob's session log at 04:47:40)
//   "rope coil"  → matched "rope" — still correct
//   "pillar"     → would match "wall" via "wall" being in "pillar"?
//                  no, "pillar".includes("wall") is false; but
//                  "wall" appears inside compound nouns elsewhere.
//
// Word-boundary regex requires the pattern to appear as a discrete
// word (surrounded by start-of-string, end-of-string, or a non-word
// character). Cached per pattern to avoid re-compiling.
const PATTERN_REGEX_CACHE = new Map<string, RegExp>();
function patternMatches(noun: string, pattern: string): boolean {
  let re = PATTERN_REGEX_CACHE.get(pattern);
  if (!re) {
    // Escape regex meta-chars in the pattern (none today, but safe).
    const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    re = new RegExp(`\\b${escaped}\\b`, 'i');
    PATTERN_REGEX_CACHE.set(pattern, re);
  }
  return re.test(noun);
}

export function getInteractionTags(noun: string): Set<InteractionTag> {
  if (!noun) return new Set();
  const lower = noun.toLowerCase().trim();
  if (!lower) return new Set();
  const cached = TAG_CACHE.get(lower);
  if (cached) return cached;
  const tags = new Set<InteractionTag>();
  // engine_Dev — uploaded interaction-tag override. The override object may carry
  // BOTH forms: the 5 tag-name keys → keyword lists (added to the built-in set),
  // and any OTHER key → an EXPLICIT per-noun tag list (exact match wins). The
  // per-noun form is what the "tag your interactables" template produces.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ov = (require('./contentPack') as typeof import('./contentPack')).getInteractionTagsOverride() as Record<string, unknown> | null;
  const TAG_NAMES = new Set<string>(['climbable', 'swimmable', 'breakable', 'searchable', 'salvageable']);
  if (ov) {
    // Explicit per-noun tags: a key equal to this noun that isn't a tag-name.
    const explicit = ov[lower] ?? ov[noun.trim()];
    if (Array.isArray(explicit)) {
      for (const t of explicit) if (typeof t === 'string' && TAG_NAMES.has(t)) tags.add(t as InteractionTag);
      TAG_CACHE.set(lower, tags);
      return tags;
    }
  }
  for (const rule of TAG_RULES) {
    const ovList = ov?.[rule.tag];
    const extra: string[] = Array.isArray(ovList) ? ovList.filter((x): x is string => typeof x === 'string') : [];
    const patterns = extra.length > 0 ? [...rule.patterns, ...extra] : rule.patterns;
    for (const pat of patterns) {
      if (patternMatches(lower, pat)) {
        tags.add(rule.tag);
        break;
      }
    }
  }
  TAG_CACHE.set(lower, tags);
  return tags;
}

export function isClimbable(noun: string): boolean {
  if (getInteractionTags(noun).has('climbable')) return true;
  // 2026-05-24 — curated climbable spawns (climbableSpawns.ts) carry
  // nouns like "ruined skyscraper" / "petrified mud wave" that don't
  // overlap the substring matcher above. Check the curated pool too
  // so the climb verb accepts the new spawns as valid targets.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { curatedClimbHeight } = require('./climbableSpawns');
  return curatedClimbHeight(noun) != null;
}
export function isSwimmable(noun: string): boolean {
  return getInteractionTags(noun).has('swimmable');
}
export function isBreakable(noun: string): boolean {
  return getInteractionTags(noun).has('breakable');
}
export function isSearchable(noun: string): boolean {
  return getInteractionTags(noun).has('searchable');
}
export function isSalvageable(noun: string): boolean {
  return getInteractionTags(noun).has('salvageable');
}
