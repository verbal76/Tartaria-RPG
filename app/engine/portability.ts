// Portability check. Some ambient nouns resolve to real catalog
// entries OR look like they should — but no human-sized character
// is putting a wagon in their backpack. This module gates the
// take path with a 'too big' heuristic and produces tactful
// in-character refusals when the player tries to pocket the
// unpocketable.
//
// Used by:
//   - takeAmbientNoun (TAKE button modal + verb-routed pickup)
//   - TakeModal chip filter (hides oversized chips so the modal
//     stays honest about what it's promising)
//
// Matching is WORD-BOUNDARY based ('wagon', 'buried wagon', 'mud cart' all
// match the vehicle rule) with an exact CATALOG-ITEM exemption — raw
// substring matching over-excluded: 'mud' swallowed every Mud-* weapon and
// armor name, 'arch' swallowed "Architect's" gear, 'rain' matched
// "training". An exact catalog item is by definition pocketable; true
// substances and masses ("wet mud", "fog bank", "ash drift") stay put.
// Refusal lines rotate to keep the blocked-take from reading as a flat
// error.

interface PortabilityRule {
  /** Substring patterns that flag the noun as oversized. */
  patterns: string[];
  /** In-character refusal lines, one is picked at random when the
   *  rule fires. {target} gets substituted with the noun. */
  refusals: string[];
}

const RULES: PortabilityRule[] = [
  {
    // Vehicles, carts, sleds
    patterns: ['wagon', 'cart', 'sled', 'caravan', 'carriage', 'skiff', 'boat', 'ship'],
    refusals: [
      `The Arbiter snorts. "I like your style, but I don't think you'll fit the {target} in your pack."`,
      `The {target} isn't going anywhere — not with you, anyway. Not without a team of mules and a long road.`,
      `You consider the {target}. You consider your shoulders. The math doesn't work.`,
    ],
  },
  {
    // Architecture, monuments, big stonework
    patterns: [
      'pillar', 'column', 'arch', 'archway', 'obelisk', 'spire', 'tower',
      'statue', 'throne', 'plinth', 'pedestal', 'monument', 'gate',
      'portcullis', 'wall', 'door', 'barricade', 'fountain', 'altar',
      'pulpit', 'lectern', 'organ', 'sarcophagus', 'coffin', 'font',
      'baptismal',
    ],
    refusals: [
      `The {target} is staying right where it is. Centuries-old stonework doesn't fit in any pack ever made.`,
      `The Arbiter raises an eyebrow. "The {target}? With what — a second {target} to carry it in?"`,
      `You eye the {target}. Whatever you'd need to move it, you do not have.`,
      `The {target} is part of the building, not a thing you take. Try the SALVAGE button if you want pieces of it.`,
    ],
  },
  {
    // Furniture & fixed implements
    patterns: [
      'table', 'bench', 'chair', 'desk', 'rack', 'shelf', 'cabinet',
      'hearth', 'anvil', 'scaffold', 'loft', 'kiln', 'forge', 'brazier',
      'banquet', 'workbench', 'rocking chair', 'dining chair',
    ],
    refusals: [
      `The {target} is heavier than it looks, and it looks heavy.`,
      `You can lift one end of the {target} maybe. Carry the whole thing — not happening.`,
      `The Arbiter shakes their head. "Take the small things off the {target}. Not the {target}."`,
    ],
  },
  {
    // Industrial machinery / vehicles / large mechanical bodies
    patterns: [
      'engine', 'reactor', 'console', 'capacitor tube', 'gear assembly',
      'pump housing', 'forge hammer', 'generator', 'turbine',
      'rotating platform', 'cooling vat', 'molten', 'gravity valve',
      'siege', 'experiment table', 'observation chair',
    ],
    refusals: [
      `The {target} weighs more than you, by a wide margin. Strip parts off it instead — SALVAGE button.`,
      `You set hands on the {target}. The {target} does not move. You let go before it notices.`,
    ],
  },
  {
    // Full-body automatons / sentinels / drones (parts are salvageable,
    // the whole unit is not pocket-sized)
    patterns: [
      'sentinel', 'automaton', 'clockwork knight', 'mud golem', 'forge sentinel',
      'sentinel shell', 'sentinel debris', 'sentinel wreckage', 'fallen sentinel',
      'dormant sentinel', 'guardian',
    ],
    refusals: [
      `The {target} is taller than you and twice the mass. Pieces of it are yours — try SALVAGE.`,
      `You're not picking up a {target}. You're not picking up most things shaped like that.`,
    ],
  },
  {
    // Geological mass — boulders, slabs, big rubble
    patterns: [
      'boulder', 'slab', 'masonry', 'aetherstone rubble', 'rubble pile',
      'rubble mound', 'mud wave', 'petrified mud', 'cliff', 'crag',
      'mound', 'mountain bridge',
    ],
    refusals: [
      `The {target} is rock. Rock is heavy. You are not.`,
      `The Arbiter glances at the {target}. "That boulder might be a bit much for you to carry, don't you think?"`,
      `You can chip at the {target} for fragments — pick CHIPS via SALVAGE — but the whole thing stays.`,
    ],
  },
  {
    // Bodies & remains too large to carry whole
    patterns: [
      'skeleton', 'corpse', 'body', 'frozen explorer', 'frozen corpse',
      'frozen skeleton', 'frozen giant skeleton', 'titan skull',
      'whale bone',
    ],
    refusals: [
      `The {target} stays where it lay. Out of respect, or weight, or both. Search it instead.`,
      `You consider taking the {target} with you. You stop considering it.`,
    ],
  },
  {
    // Open/wet/atmospheric (you can't "take" water or fog)
    patterns: [
      'water', 'mud', 'silt', 'sludge', 'fog', 'mist', 'smoke', 'ash',
      'dust cloud', 'rain', 'storm', 'current', 'tide', 'fissure',
      'rift', 'crack', 'vent', 'sinkhole', 'puddle',
    ],
    refusals: [
      `You can't pocket {target}. The Arbiter waits politely for you to figure that out.`,
      `Nothing about the {target} fits in a pack. It's a feature of the place, not a thing.`,
    ],
  },
];

const WORD_RE_CACHE = new Map<string, RegExp>();
function ruleMatches(lower: string, pat: string): boolean {
  let re = WORD_RE_CACHE.get(pat);
  if (!re) {
    re = new RegExp(`\\b${pat.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
    WORD_RE_CACHE.set(pat, re);
  }
  return re.test(lower);
}

/** True when the noun is the exact name of a catalog item — which is by
 *  definition pocketable, whatever words its name contains. */
function isExactCatalogItem(lower: string): boolean {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { findWeaponByName, findArmorByName, findGearByName, findExplorationItemByName, findMaterialByName } = require('./crafting');
  for (const look of [findWeaponByName, findArmorByName, findGearByName, findExplorationItemByName, findMaterialByName]) {
    try {
      const row = look(lower);
      if (row && String(row.name).toLowerCase() === lower) return true;
    } catch { /* catalog unavailable — fall through to the rules */ }
  }
  return false;
}

function pickLine(lines: string[]): string {
  return lines[Math.floor(Math.random() * lines.length)] ?? lines[0]!;
}

/** Returns true if the noun is too big / too abstract / too fixed
 *  to be carried in a backpack. Falls through to false for items
 *  the player can plausibly pocket. */
export function isOversized(noun: string): boolean {
  if (!noun) return false;
  const lower = noun.toLowerCase();
  if (isExactCatalogItem(lower)) return false;
  for (const rule of RULES) {
    for (const pat of rule.patterns) {
      if (ruleMatches(lower, pat)) return true;
    }
  }
  return false;
}

/** Returns a tactful, in-character refusal line for an oversized
 *  noun. The noun is substituted via {target}; an article is
 *  added when the noun reads as a bare phrase. */
export function refusalLine(noun: string): string {
  const lower = noun.toLowerCase();
  let matched: PortabilityRule | null = null;
  for (const rule of RULES) {
    for (const pat of rule.patterns) {
      if (ruleMatches(lower, pat)) {
        matched = rule;
        break;
      }
    }
    if (matched) break;
  }
  const line = matched ? pickLine(matched.refusals) : `You can't carry the ${noun}.`;
  return line.replace(/\{target\}/g, noun);
}

/** Exposed for tests. */
export const __TEST_ONLY__ = { RULES };

// 2026-05-24 — playtester ask: replace the diagnostic
// "X is part of the scene, not a loose drop" line with an in-character
// refusal that reads as world-flavor rather than an engine error.
// Used at the two pickup paths in gameStore.ts where a noun resolves
// in the scene but not in the item catalog.
// OTA-160 — stress sweep (collectAll) flagged: a hoarder who types
// `take rubble` repeatedly only sees SALVAGE-redirect copy on 3 of
// 8 refusal lines. Across a long hoarding stretch the player never
// learns the verb they should be using. All 8 refusals now end with
// an explicit "(Try SALVAGE.)" or equivalent so any single tap on a
// scene-feature noun teaches the salvage path.
const SCENE_FEATURE_REFUSALS: string[] = [
  `You reach for the {target}, but a bolt of Aetheric energy snaps across the ground beside you. You decide that's not the best idea. (Try SALVAGE.)`,
  `Your fingers close on the {target} — and pass through where you thought a handhold was. It's part of the world here, not a thing to take. (Try SALVAGE.)`,
  `You start to lift the {target} and the silt shifts beneath your boots; you let go. Some things belong to the ground — but they can be pried loose. (Try SALVAGE.)`,
  `The {target} is fused to the stone around it. You'd need to break it loose, not just pick it up. (Try SALVAGE.)`,
  `An Aetheric hum rises from the {target} the moment you touch it. You step back, breathing. The world's keeping that one for itself. (Try SALVAGE.)`,
  `The {target} weighs more than you do. The Arbiter watches you try anyway, then mercifully looks away. (Try SALVAGE.)`,
  `You wrap your hands around the {target} and your shoulders argue. It's part of the bones of this place. Whatever it gives up, it'll give to a pry, not a lift. (Try SALVAGE.)`,
  `Dust rises off the {target} when you touch it — and settles right back. Whatever it is, it's been here longer than your race. Leave it. Or salvage it.`,
];

export function sceneFeatureRefusalLine(noun: string): string {
  return pickLine(SCENE_FEATURE_REFUSALS).replace(/\{target\}/g, noun);
}
