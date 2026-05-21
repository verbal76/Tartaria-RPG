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

export function getInteractionTags(noun: string): Set<InteractionTag> {
  if (!noun) return new Set();
  const lower = noun.toLowerCase().trim();
  if (!lower) return new Set();
  const cached = TAG_CACHE.get(lower);
  if (cached) return cached;
  const tags = new Set<InteractionTag>();
  for (const rule of TAG_RULES) {
    for (const pat of rule.patterns) {
      if (lower.includes(pat)) {
        tags.add(rule.tag);
        break;
      }
    }
  }
  TAG_CACHE.set(lower, tags);
  return tags;
}

export function isClimbable(noun: string): boolean {
  return getInteractionTags(noun).has('climbable');
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
