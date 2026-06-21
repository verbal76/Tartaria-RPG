// Per-noun salvage outcome pools. When the player salvages a wagon,
// they should get rations / climbing rope / scrap metal — not the
// same generic small-finds pool every other salvageable noun rolls
// from. This module pattern-matches the noun against a curated set
// of category pools and produces an outcome flavored for the thing
// being broken down.
//
// Returns null when no pool matches; callers fall through to the
// generic rollAreaSearch so the existing pipeline keeps working
// for nouns we haven't classified.

import type { Rarity } from './types';
import materialsData from '../data/items/materials.json';
import { resolveTable, hasTableOverride, getWastelandOverride, getCustomBosses, getCustomMainQuest } from './contentPack';

// arb61 — salvage yields MATERIALS ONLY (player verb-economy: take = gear,
// salvage = materials, investigate = clues/hooks). The hand-authored pools
// historically mixed in gear (Aetheric Locket/Torch, Throwing Knife, Rusted
// Blade, Climbing Rope), food (Trail Rations), and clues (Map Fragment, Sealed
// Letter). We now filter every pool roll down to names that are TRUE materials
// (present in materials.json — which includes Worn Tartarian Coin, a fine
// salvage byproduct). Weight redistributes naturally among the survivors; if a
// pool has no material entries we fall back to the all-material JUNK_POOL.
// engine_Dev — built-in default materials, normalized to a name array. The
// salvage-material set resolves through resolveTable() at CALL time so an
// uploaded materials override actually drives what salvage can yield.
const BUILTIN_MATERIAL_NAMES: string[] = (() => {
  const v = materialsData as unknown as Array<string | { name?: string }> | { materials?: unknown[]; items?: unknown[] };
  const arr: Array<string | { name?: string }> = Array.isArray(v)
    ? v
    : ((v.materials as Array<string | { name?: string }>) ?? (v.items as Array<string | { name?: string }>) ?? []);
  return arr.map((m) => (typeof m === 'string' ? m : m?.name)).filter((n): n is string => !!n);
})();
function materialNameSet(): ReadonlySet<string> {
  const rows = resolveTable<string | { name?: string }>('materials', BUILTIN_MATERIAL_NAMES);
  return new Set(rows.map((m) => (typeof m === 'string' ? m : m?.name)).filter((n): n is string => !!n));
}
export const isSalvageMaterial = (name: string): boolean => materialNameSet().has(name);

// engine_Dev — keep salvage data-driven: the built-in POOLS / JUNK_POOL hold
// Tartaria material names, so a re-skin that uploads its OWN materials would still
// get Mud Cloth / Bent Nail / Aether Crystal. When a materials override is loaded
// AND the rolled name isn't in it, substitute a material FROM the re-skin catalog
// (preferring the same rarity) so salvage yields the author's materials, not ours.
interface MatRow { name?: string; rarity?: Rarity; tags?: string[] }
const BUILTIN_MATERIAL_ROWS: MatRow[] = (() => {
  const v = materialsData as unknown as MatRow[] | { materials?: MatRow[]; items?: MatRow[] };
  return Array.isArray(v) ? v : (v.materials ?? v.items ?? []);
})();
function pickCatalogMaterial(pref: Rarity, rng: () => number): { name: string; rarity: Rarity } | null {
  const rows = (resolveTable<MatRow>('materials', BUILTIN_MATERIAL_ROWS)).filter((m) => m && m.name);
  if (rows.length === 0) return null;
  const same = rows.filter((m) => (m.rarity ?? 'Common') === pref);
  const pool = same.length > 0 ? same : rows;
  const m = pool[Math.floor(rng() * pool.length)]!;
  return { name: m.name!, rarity: (m.rarity as Rarity) ?? 'Common' };
}
/** Swap a built-in (Tartaria) material name for one from the re-skin catalog when
 *  the author has uploaded materials and the rolled name isn't one of theirs. */
function finalizeMaterial(name: string, rarity: Rarity, rng: () => number): { name: string; rarity: Rarity } {
  if (hasTableOverride('materials') && !materialNameSet().has(name)) {
    const sub = pickCatalogMaterial(rarity, rng);
    if (sub) return sub;
  }
  return { name, rarity };
}

/** CENTRAL material-leak guard (called from grantItem). Returns a re-skin material
 *  to grant INSTEAD of `name`, or null to keep `name`. Only fires when: a materials
 *  override is loaded, `name` is a BUILT-IN (Tartaria) material, and it isn't in the
 *  re-skin catalog — so quest items / encounter loot / weapons / armor are never
 *  touched, only built-in materials leaking through dig / forage / loot / dog / etc. */
// Names the AUTHOR intends — their encounter loot, boss drops/quest items, and
// main-quest rewards. These must NEVER be substituted even though they're off the
// item-table catalog (they're authored, on-purpose drops). Rebuilt cheaply per call.
function authoredItemNames(): Set<string> {
  const s = new Set<string>();
  const add = (n?: unknown) => { if (typeof n === 'string' && n.trim()) s.add(n.trim()); };
  const wl = getWastelandOverride();
  if (wl) for (const a of Object.values(wl)) for (const L of ((a as { loot?: Array<{ name?: string }> })?.loot ?? [])) add(L.name);
  for (const b of (getCustomBosses() as Array<{ questItem?: string; drops?: string[] }>)) { add(b.questItem); for (const d of (b.drops ?? [])) add(d); }
  const mq = getCustomMainQuest();
  if (mq) for (const st of ((mq.steps as Array<{ reward?: string; target?: string }>) ?? [])) { add(st.reward); }
  return s;
}

/** CENTRAL material-leak guard. Substitute ONLY a built-in (Tartaria) CRAFTING
 *  MATERIAL (a name from materials.json) when: a materials override is loaded, the
 *  grant is a material-ish kind, the name isn't in the re-skin catalog, and it isn't
 *  an authored drop. So the built-in materials that flood a re-skin's pack (Bent
 *  Nail, Aether Crystal, Smooth Stone, Spider Silk, …) become the author's
 *  materials — while quest items, collectables, food, weapons and armor are never
 *  touched (they aren't materials). */
export function substituteLeakedMaterial(
  name: string,
  rarity: Rarity = 'Common',
  rng: () => number = Math.random,
  kind?: string,
): { name: string; rarity: Rarity } | null {
  if (!name || !hasTableOverride('materials')) return null;
  if (kind && kind !== 'misc' && kind !== 'material') return null; // material-ish only
  if (!BUILTIN_MATERIAL_NAMES.includes(name)) return null; // only built-in materials
  if (materialNameSet().has(name)) return null;            // already one of theirs
  if (authoredItemNames().has(name)) return null;          // intentional authored drop
  return pickCatalogMaterial(rarity, rng);
}

interface PoolEntry {
  name: string;
  rarity: Rarity;
  weight: number;
  min: number;
  max: number;
}

interface SalvagePool {
  /** Pool identifier — for debug logging + test introspection. */
  id: string;
  /** Substring patterns; the FIRST pool whose any-pattern matches
   *  the noun (case-insensitive) is selected. Order matters —
   *  more specific pools should come before general ones. */
  patterns: string[];
  /** Weighted item pool. Weights need not sum to 100; the picker
   *  normalises. min/max set the quantity range (inclusive). */
  items: PoolEntry[];
}

// Pool definitions, ordered most-specific → most-general. The
// matcher walks top-down and stops at the first hit, so weapons
// land in WEAPON_SCRAP before they leak into the broader METAL
// fallback.
const POOLS: SalvagePool[] = [
  {
    id: 'mechanical',
    patterns: [
      'drone', 'sentinel', 'automaton', 'circuit', 'scrap drone',
      'clockwork', 'mechanical', 'machine', 'machinery', 'construct',
      'robot', 'husk', 'chassis', 'frame', 'exoframe', 'rig',
      'plating', 'wreck', 'wreckage',
    ],
    items: [
      { name: 'Automaton Circuit', rarity: 'Common', weight: 30, min: 1, max: 2 },
      { name: 'Scrap Metal', rarity: 'Common', weight: 30, min: 2, max: 4 },
      { name: 'Aether Crystal', rarity: 'Common', weight: 15, min: 1, max: 2 },
      { name: 'Aether Dust', rarity: 'Common', weight: 15, min: 1, max: 3 },
      { name: 'Sentinel Core Plate', rarity: 'Uncommon', weight: 10, min: 1, max: 1 },
    ],
  },
  {
    id: 'wagon',
    patterns: ['wagon', 'cart', 'sled', 'caravan', 'axle', 'vessel'],
    items: [
      { name: 'Trail Rations', rarity: 'Common', weight: 25, min: 1, max: 2 },
      { name: 'Scrap Metal', rarity: 'Common', weight: 25, min: 1, max: 3 },
      { name: 'Climbing Rope', rarity: 'Common', weight: 20, min: 1, max: 1 },
      { name: 'Worn Tartarian Coin', rarity: 'Common', weight: 20, min: 3, max: 8 },
      { name: 'Aetheric Torch', rarity: 'Common', weight: 10, min: 1, max: 1 },
    ],
  },
  {
    id: 'weapon_scrap',
    patterns: [
      'blade', 'sword', 'axe', 'pike', 'rifle', 'spear', 'rod',
      'knife', 'cleaver', 'maul', 'hammer', 'gun', 'gauntlet',
      'staff', 'bow', 'harpoon',
    ],
    items: [
      { name: 'Scrap Metal', rarity: 'Common', weight: 40, min: 1, max: 2 },
      { name: 'Rusted Blade', rarity: 'Common', weight: 20, min: 1, max: 1 },
      { name: 'Aether Dust', rarity: 'Common', weight: 20, min: 1, max: 2 },
      { name: 'Throwing Knife', rarity: 'Common', weight: 15, min: 1, max: 2 },
      { name: 'Aether Crystal', rarity: 'Common', weight: 5, min: 1, max: 1 },
    ],
  },
  {
    id: 'engine_parts',
    patterns: [
      'engine', 'console', 'conduit', 'capacitor', 'coil', 'panel',
      'battery', 'core', 'pipe', 'valve', 'pump', 'motor', 'cable',
      'wire', 'relay', 'gear', 'cog', 'reactor', 'terminal', 'circuit panel',
      'observatory', 'scope', 'lens', 'telescope', 'array', 'dish',
      'antenna',
    ],
    items: [
      { name: 'Automaton Circuit', rarity: 'Common', weight: 25, min: 1, max: 2 },
      { name: 'Aether Crystal', rarity: 'Common', weight: 25, min: 1, max: 2 },
      { name: 'Scrap Metal', rarity: 'Common', weight: 25, min: 1, max: 3 },
      { name: 'Aether Dust', rarity: 'Common', weight: 15, min: 1, max: 3 },
      { name: 'Aetheric Shard', rarity: 'Uncommon', weight: 10, min: 1, max: 1 },
    ],
  },
  {
    id: 'nautical',
    patterns: [
      'hull', 'mast', 'anchor', 'chain', 'hook', 'harpoon', 'rigging',
      'sail', 'plank', 'beam', 'driftwood', 'ship', 'boat',
    ],
    items: [
      { name: 'Scrap Metal', rarity: 'Common', weight: 35, min: 1, max: 3 },
      { name: 'Climbing Rope', rarity: 'Common', weight: 25, min: 1, max: 2 },
      { name: 'Trail Rations', rarity: 'Common', weight: 20, min: 1, max: 2 },
      { name: 'Worn Tartarian Coin', rarity: 'Common', weight: 20, min: 5, max: 12 },
    ],
  },
  {
    id: 'light',
    patterns: ['lantern', 'torch', 'lamp', 'flare', 'beacon'],
    items: [
      { name: 'Aether Dust', rarity: 'Common', weight: 40, min: 1, max: 3 },
      { name: 'Aether Crystal', rarity: 'Common', weight: 25, min: 1, max: 1 },
      { name: 'Scrap Metal', rarity: 'Common', weight: 20, min: 1, max: 2 },
      { name: 'Aetheric Torch', rarity: 'Common', weight: 15, min: 1, max: 1 },
    ],
  },
  {
    id: 'tomb',
    patterns: [
      'sarcophagus', 'coffin', 'urn', 'burial', 'skeleton', 'remains',
      'bone', 'skull', 'corpse', 'cadaver', 'tomb', 'crypt', 'grave',
      'ossuary', 'rib',
      // 2026-05-25 OTA-041 — hook-revealed corpse nouns (preserved_corpse
      // hook plants body / satchel / robes as resolvers). Routes the
      // body chip to tomb-style loot when the player salvages it.
      'body', 'satchel', 'robes',
    ],
    items: [
      { name: 'Worn Tartarian Coin', rarity: 'Common', weight: 35, min: 3, max: 10 },
      { name: 'Aetheric Locket', rarity: 'Common', weight: 25, min: 1, max: 1 },
      { name: 'Aether Dust', rarity: 'Common', weight: 20, min: 1, max: 2 },
      { name: 'Aether Crystal', rarity: 'Common', weight: 20, min: 1, max: 1 },
    ],
  },
  {
    id: 'archive',
    patterns: [
      'archive', 'tome', 'tablet', 'ledger', 'slate', 'blueprint',
      'map', 'parchment', 'scroll', 'journal', 'paper', 'letter',
    ],
    items: [
      { name: 'Worn Tartarian Coin', rarity: 'Common', weight: 30, min: 2, max: 6 },
      { name: 'Tartarian Map Fragment', rarity: 'Common', weight: 25, min: 1, max: 1 },
      { name: 'Sealed Tartarian Letter', rarity: 'Common', weight: 25, min: 1, max: 1 },
      { name: 'Aether Dust', rarity: 'Common', weight: 20, min: 1, max: 2 },
    ],
  },
  {
    id: 'rubble',
    patterns: [
      'rubble', 'debris', 'mound', 'pile', 'rock', 'stone', 'shard',
      'fragment', 'flagstone', 'masonry', 'brick',
    ],
    items: [
      { name: 'Scrap Metal', rarity: 'Common', weight: 30, min: 1, max: 3 },
      { name: 'Mud Fragment', rarity: 'Common', weight: 25, min: 1, max: 3 },
      { name: 'Aether Crystal', rarity: 'Common', weight: 20, min: 1, max: 1 },
      { name: 'Worn Tartarian Coin', rarity: 'Common', weight: 15, min: 2, max: 6 },
      { name: 'Aether Dust', rarity: 'Common', weight: 10, min: 1, max: 2 },
    ],
  },
  // 2026-05-25 OTA-037 — relic-site pool for hub-thematic salvageables.
  // A playtester hit SALVAGE ALL on "salt-crusted vault relic pedestal,
  // weathered forgotten order reliquary, gate" inside The Crown Gate
  // and got zero output — pickPool returned null for all three because
  // no existing pool had patterns for pedestal / reliquary / vault /
  // gate / shelf / altar / shrine / monolith / obelisk / plinth /
  // library / doorway. Drops thematic relic stock so the player walks
  // away with something thematic (coins, lockets, dust, shards).
  {
    id: 'relic_site',
    patterns: [
      'pedestal', 'reliquary', 'altar', 'shrine', 'vault', 'monolith',
      'obelisk', 'plinth', 'library', 'doorway', 'gate', 'shelf',
      'banner', 'standard', 'sigil', 'relic', 'spire', 'pylon', 'pillar',
    ],
    items: [
      { name: 'Worn Tartarian Coin', rarity: 'Common', weight: 30, min: 2, max: 8 },
      { name: 'Aetheric Locket', rarity: 'Common', weight: 20, min: 1, max: 1 },
      { name: 'Aether Dust', rarity: 'Common', weight: 20, min: 1, max: 3 },
      { name: 'Aether Crystal', rarity: 'Common', weight: 15, min: 1, max: 1 },
      { name: 'Aetheric Shard', rarity: 'Uncommon', weight: 10, min: 1, max: 1 },
      { name: 'Sealed Tartarian Letter', rarity: 'Common', weight: 5, min: 1, max: 1 },
    ],
  },
  // 2026-05-25 OTA-038 — container pool. Lockboxes, crates, jars, etc.
  // Containers historically routed through container_loot.json on
  // direct "break open <X>" verbs, but tapping SALVAGE on a container
  // chip routed nowhere. Now drops standard container-style loot.
  {
    id: 'container',
    patterns: [
      'lockbox', 'strongbox', 'coffer', 'safe', 'crate', 'chest',
      'box', 'cache', 'stash', 'barrel', 'locker', 'jar', 'bottle',
      'casket', 'case', 'urn',
    ],
    items: [
      { name: 'Worn Tartarian Coin', rarity: 'Common', weight: 30, min: 3, max: 10 },
      { name: 'Trail Rations', rarity: 'Common', weight: 20, min: 1, max: 2 },
      { name: 'Aether Crystal', rarity: 'Common', weight: 15, min: 1, max: 1 },
      { name: 'Aether Dust', rarity: 'Common', weight: 15, min: 1, max: 2 },
      { name: 'Scrap Metal', rarity: 'Common', weight: 10, min: 1, max: 2 },
      { name: 'Aetheric Shard', rarity: 'Uncommon', weight: 10, min: 1, max: 1 },
    ],
  },
  // 2026-05-25 OTA-038 — fabric pool. Cloth-y nouns the player might
  // strip for material: shrouds, curtains, tarps, etc. Drops cloth
  // scraps + light Aetheric stock.
  {
    id: 'fabric',
    patterns: [
      'shroud', 'curtain', 'tarp', 'cloak', 'cloth', 'rag',
    ],
    items: [
      { name: 'Cloth Scrap', rarity: 'Common', weight: 50, min: 1, max: 3 },
      { name: 'Spider Silk', rarity: 'Common', weight: 20, min: 1, max: 1 },
      { name: 'Worn Tartarian Coin', rarity: 'Common', weight: 15, min: 1, max: 3 },
      { name: 'Aether Dust', rarity: 'Common', weight: 10, min: 1, max: 2 },
      { name: 'Aetheric Cloth', rarity: 'Rare', weight: 5, min: 1, max: 1 },
    ],
  },
  // 2026-05-25 OTA-038 — furniture pool. Hub-room benches, tables,
  // doors, racks: low-value but the player should still get a tick of
  // wood scrap, nails, sometimes a coin.
  {
    id: 'furniture',
    patterns: [
      'bench', 'rack', 'table', 'door', 'chair', 'stool', 'cabinet',
    ],
    items: [
      { name: 'Bent Nail', rarity: 'Common', weight: 35, min: 1, max: 3 },
      { name: 'Stick', rarity: 'Common', weight: 30, min: 1, max: 2 },
      { name: 'Cloth Scrap', rarity: 'Common', weight: 20, min: 1, max: 2 },
      { name: 'Worn Tartarian Coin', rarity: 'Common', weight: 15, min: 1, max: 3 },
    ],
  },
  // 2026-05-25 OTA-038 — trap-salvage pool. Disarmed traps yield
  // springs, wire, the occasional Aetheric component.
  {
    id: 'trap_salvage',
    patterns: [
      'trap', 'snare', 'tripwire', 'deadfall', 'defenses', 'defense',
      'golem',
    ],
    items: [
      { name: 'Scrap Metal', rarity: 'Common', weight: 30, min: 1, max: 2 },
      { name: 'Bent Nail', rarity: 'Common', weight: 25, min: 1, max: 2 },
      { name: 'Spider Silk', rarity: 'Common', weight: 20, min: 1, max: 1 },
      { name: 'Aether Crystal', rarity: 'Common', weight: 15, min: 1, max: 1 },
      { name: 'Aether Dust', rarity: 'Common', weight: 10, min: 1, max: 2 },
    ],
  },
  // 2026-05-25 OTA-038 — junk-salvage catch-all for modifier-only nouns
  // (rust, broken, fallen, toppled, scrap, etc.) and any noun the
  // other pools missed. ALWAYS matches anything in SALVAGE_PATTERN —
  // any future pattern added without a more specific pool falls here
  // by design, so the player never sees a silent SALVAGE ALL again.
  // Kept LAST in the array so more specific pools win first.
  {
    id: 'junk_salvage',
    patterns: [
      'rust', 'rusted', 'broken', 'fallen', 'toppled', 'scrap',
      'cracked', 'shattered', 'stripped', 'weathered', 'tilted',
      'salt-crusted', 'dust-buried', 'mud-glazed', 'half-buried',
      'buried', 'hidden', 'crashed',
    ],
    items: [
      { name: 'Bent Nail', rarity: 'Common', weight: 30, min: 1, max: 3 },
      { name: 'Cloth Scrap', rarity: 'Common', weight: 25, min: 1, max: 2 },
      { name: 'Stick', rarity: 'Common', weight: 20, min: 1, max: 2 },
      { name: 'Smooth Stone', rarity: 'Common', weight: 15, min: 1, max: 2 },
      { name: 'Worn Tartarian Coin', rarity: 'Common', weight: 10, min: 1, max: 2 },
    ],
  },
];

// 2026-05-25 — NOTHING_LINES removed. POLISH-2 (OTA-003) repurposed
// the would-be-nothing branch in rollSalvagePool to roll from
// JUNK_POOL + JUNK_LINES, so this pool's "nothing" narration was
// orphaned. The kind:'nothing' SalvageOutcome variant is kept in
// the type because the rollAreaSearch fallback (areaSearch.ts) can
// still return that kind, and the gameStore salvage handler at
// :3878 unions both outcomes via the shared kind discriminator.

const MATERIAL_LINES = [
  'You strip {target} carefully. Something usable comes free in your hand.',
  'You break {target} apart. Among the pieces, something worth keeping.',
  'You salvage {target}. The take is small but real.',
  'You work {target} over. A part of it comes loose, intact.',
];

export interface SalvageOutcome {
  kind: 'nothing' | 'material';
  /** Pre-formatted narration line. */
  line: string;
  /** Pool id for debug + tests. */
  poolId: string;
  /** Only set when kind === 'material'. */
  itemName?: string;
  rarity?: Rarity;
  quantity?: number;
}

/** Probability that the normal weighted pick would have rolled
 *  "nothing." 2026-05-25 [VERIFY-1] dropped this from 0.25 → 0.05.
 *  2026-05-25 [POLISH-2] then repurposed the "nothing" branch
 *  entirely — instead of returning an empty outcome, the engine
 *  rolls from JUNK_POOL so the player ALWAYS walks away with
 *  something. Variable name kept for backwards compatibility with
 *  test naming + the surrounding probability comment.
 *  Result: ~5% of matched-pool salvages yield a thematic junk item
 *  (stick / pebble / nail / cloth scrap) instead of the original
 *  weighted material. RNG still feels meaningful — junk vs. real
 *  loot is a perceptible difference — but the action never empties. */
const NOTHING_CHANCE = 0.05;

/** Fallback pool used when the weighted roll would have produced
 *  nothing. Tiny set of low-value, evocative materials authored in
 *  materials.json. Always min=max=1 — you get exactly one piece of
 *  junk, never a stack. */
const JUNK_POOL: PoolEntry[] = [
  { name: 'Stick',        rarity: 'Common', weight: 5, min: 1, max: 1 },
  { name: 'Smooth Stone', rarity: 'Common', weight: 5, min: 1, max: 1 },
  { name: 'Cloth Scrap',  rarity: 'Common', weight: 4, min: 1, max: 1 },
  { name: 'Bent Nail',    rarity: 'Common', weight: 4, min: 1, max: 1 },
  { name: 'Bone Sliver',  rarity: 'Common', weight: 3, min: 1, max: 1 },
];

/** Flavor lines for junk-pool drops. Conveys "you searched
 *  thoroughly but the haul was small" without using the harsher
 *  "nothing salvageable" wording that misled players into thinking
 *  the salvage failed. */
const JUNK_LINES: string[] = [
  'You strip {target} down. Mostly debris — but a {item} comes loose at the bottom of the pile.',
  'The {target} yields little of value, though a {item} ends up in your pack.',
  'Slim pickings on {target}. You pocket a {item} on the way out.',
  'You scavenge {target} thoroughly. One {item} survives the sorting.',
];

function pickPool(noun: string): SalvagePool | null {
  const lower = noun.toLowerCase();
  for (const pool of POOLS) {
    for (const pat of pool.patterns) {
      if (lower.includes(pat)) return pool;
    }
  }
  return null;
}

function format(lines: string[], noun: string, rng: () => number): string {
  const t = noun.trim();
  const hasLeadingArticle = /^(the|a|an|some|my|your|this|that)\s/i.test(t);
  const display = hasLeadingArticle ? t : `the ${t}`;
  const line = lines[Math.floor(rng() * lines.length)] ?? lines[0]!;
  return line.replace(/\{target\}/g, display);
}

function pickWeighted(items: PoolEntry[], rng: () => number): PoolEntry {
  const total = items.reduce((a, e) => a + e.weight, 0);
  const roll = rng() * total;
  let cum = 0;
  for (const e of items) {
    cum += e.weight;
    if (roll < cum) return e;
  }
  return items[items.length - 1]!;
}

/** Roll a salvage outcome for the named noun. Returns null when no
 *  pool matches — caller should fall through to rollAreaSearch.
 *  2026-05-25 [POLISH-2] — the "nothing" branch now rolls from
 *  JUNK_POOL so the player always walks away with at least one
 *  item; the empty outcome is gone from this path. */
export function rollSalvagePool(noun: string, rng: () => number = Math.random): SalvageOutcome | null {
  const pool = pickPool(noun);
  if (!pool) return null;
  if (rng() < NOTHING_CHANCE) {
    const junk = pickWeighted(JUNK_POOL, rng);
    const fin = finalizeMaterial(junk.name, junk.rarity, rng);
    const line = format(JUNK_LINES, noun, rng).replace(/\{item\}/g, fin.name);
    return {
      kind: 'material',
      poolId: pool.id,
      itemName: fin.name,
      rarity: fin.rarity,
      quantity: 1,
      line,
    };
  }
  // arb61 — restrict to true materials; fall back to the all-material junk
  // pool if this pool's only entries were the now-excluded gear/food/clues.
  const materialItems = pool.items.filter((e) => isSalvageMaterial(e.name));
  if (materialItems.length === 0) {
    const junk = pickWeighted(JUNK_POOL, rng);
    const fin = finalizeMaterial(junk.name, junk.rarity, rng);
    return {
      kind: 'material', poolId: pool.id, itemName: fin.name, rarity: fin.rarity,
      quantity: 1, line: format(MATERIAL_LINES, noun, rng),
    };
  }
  const entry = pickWeighted(materialItems, rng);
  const span = entry.max - entry.min;
  const quantity = entry.min + (span > 0 ? Math.floor(rng() * (span + 1)) : 0);
  const fin = finalizeMaterial(entry.name, entry.rarity, rng);
  return {
    kind: 'material',
    poolId: pool.id,
    itemName: fin.name,
    rarity: fin.rarity,
    quantity,
    line: format(MATERIAL_LINES, noun, rng),
  };
}

/** Exposed for tests. */
export const __TEST_ONLY__ = { POOLS, NOTHING_CHANCE };
