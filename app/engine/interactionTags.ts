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
  for (const rule of TAG_RULES) {
    for (const pat of rule.patterns) {
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
  // OTA-993 — #113: great-climb props are checked FIRST — "the Great Fang of
  // Zharak" is BOTH the climb and a Legendary weapon row, and the climb
  // outranks the item-name collision below.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { isGreatClimbNoun, isGreatClimbExactNoun } = require('./greatClimbs');
  // OTA-1016 — landmark precedence holds only when the noun IS the landmark
  // (exact authored noun). A TOKEN match ("Skyreacher Map 2 of 5 — Asgardar
  // Spire" contains "asgardar") must not outrank the catalog exclusion below,
  // or bought maps become climbable paper — #113 reopened through the very
  // fix that closed it. The Great Fang of Zharak, weapon AND landmark by
  // name, still climbs via the exact form; token-level props resume below,
  // after the catalog has had its say.
  if (isGreatClimbExactNoun(noun)) return true;
  // OTA-993 — #113: a takeable ITEM lying in the scene is never a wall (owner:
  // "make sure it is something actually climbable first"). "Rail Saber"
  // word-matched the climbable patterns and became a tier-1 perch with
  // summit loot. Exclusion is by EXACT full-name catalog match only, so
  // structural nouns that merely contain an item word ("rope bridge",
  // plain "rope") keep their grip.
  {
    // OTA-1016 — normalize the curly apostrophe: narration and LLM rephrases emit
    // U+2019, and "Reclaimer’s Rope" must match the catalog either way.
    const n = (noun ?? '').trim().toLowerCase().replace(/’/g, "'");
    if (n) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { findWeaponByName, findArmorByName, findGearByName, findExplorationItemByName } = require('./crafting');
      for (const look of [findWeaponByName, findArmorByName, findGearByName, findExplorationItemByName]) {
        try {
          const row = look(n);
          if (row && String(row.name).toLowerCase() === n) return false;
        } catch { /* catalog unavailable — fall through to the tag rules */ }
      }
    }
  }
  // OTA-1016 — token-level great-climb props (scene nouns like "great obsidian")
  // resume their precedence here, once the exact-catalog exclusion has ruled
  // out purchasable items that merely CONTAIN a landmark token.
  if (isGreatClimbNoun(noun)) return true;
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
