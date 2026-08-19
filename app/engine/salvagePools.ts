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
import curiosData from '../data/relics/curios.json';

// arb61 — salvage yields MATERIALS ONLY (player verb-economy: take = gear,
// salvage = materials, investigate = clues/hooks). The hand-authored pools
// historically mixed in gear (Aetheric Locket/Torch, Throwing Knife, Rusted
// Blade, Climbing Rope), food (Trail Rations), and clues (Map Fragment, Sealed
// Letter). We now filter every pool roll down to names that are TRUE materials
// (present in materials.json — which includes Worn Tartarian Coin, a fine
// salvage byproduct). Weight redistributes naturally among the survivors; if a
// pool has no material entries we fall back to the all-material JUNK_POOL.
const MATERIAL_NAMES: ReadonlySet<string> = new Set(
  (() => {
    const v = materialsData as unknown as Array<string | { name?: string }> | { materials?: unknown[]; items?: unknown[] };
    const arr: Array<string | { name?: string }> = Array.isArray(v)
      ? v
      : ((v.materials as Array<string | { name?: string }>) ?? (v.items as Array<string | { name?: string }>) ?? []);
    return arr.map((m) => (typeof m === 'string' ? m : m?.name)).filter((n): n is string => !!n);
  })(),
);
export const isSalvageMaterial = (name: string): boolean => MATERIAL_NAMES.has(name);

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
  /** ⚠⚠ THE ONE ESCAPE FROM THE MATERIALS FILTER, AND IT IS DELIBERATELY NARROW.
   *
   *  `arb61` filters every pool roll down to TRUE materials, which is right: pools
   *  had drifted into handing out gear, food and clues. But it also silently killed
   *  the entries that were gear ON PURPOSE — the `light` pool's Aetheric Torch has
   *  been unreachable since that filter landed, so the comment above it ("a broken
   *  lantern only occasionally yields a still-working one") described a thing that
   *  could not happen.
   *
   *  A rare find is rolled BEFORE the material pick and REPLACES it, so the take per
   *  salvage is unchanged — only its nature, exactly like the curio valve. Keep
   *  `chance` small: this is the only door in the whole salvage system that can
   *  produce a real item, and it exists so a scarce tool stays findable, not
   *  farmable. */
  rareFind?: { name: string; rarity: Rarity; chance: number };
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
      // OTA-752 — the Aetheric Torch is a managed resource now (its use is a
      // scarce Rare/Legendary gamble); it no longer falls out of generic
      // rubble. It stays craftable + purchasable, plus a low-rate thematic
      // find in the 'light' salvage pool below.
    ],
  },
  {
    id: 'weapon_scrap',
    patterns: [
      'blade', 'sword', 'axe', 'pike', 'rifle', 'spear', 'rod',
      'knife', 'cleaver', 'maul', 'hammer', 'gun', 'gauntlet',
      'staff', 'bow', 'harpoon',
      'dagger',   // ⚠ OTA-1242 — the census caught `ritual dagger` sitting homeless.
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
      // ⚠⚠ THE TORCH USED TO SIT HERE AS A WEIGHT-4 ENTRY AND COULD NEVER COME OUT.
      // OTA-752 trimmed it 15 → 4 because "torches are a managed resource; a broken
      // lantern only occasionally yields a still-working one" — and then arb61's
      // materials filter removed it from every roll, because a torch is gear and not
      // a material. Measured: 3000 lantern salvages, 2488 reaching this pool, ZERO
      // torches. The rationing comment outlived the thing it rationed.
      //
      // Owner: *"reduce the free lantern spawn rate, they should be a rare find,
      // mostly crafted."* A rare find is what this now is — declared below where the
      // filter cannot eat it, at the rate OTA-752 was reaching for.
    ],
    rareFind: { name: 'Aetheric Torch', rarity: 'Common', chance: 0.045 },
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

  // ═══════════════════════════════════════════════════════════════════════════
  // ⚠⚠ OTA-1242 — THE CENSUS POOLS. Owner, working out the model out loud:
  // *"take is for carryable items that might be scrapped later... all the rest
  // are just smaller items that can be salvaged."*
  //
  // ⚠⚠ THAT RULE WAS NOT TRUE, AND THE CENSUS IS HOW WE FOUND OUT BY HOW MUCH.
  // Measured across every noun the world can place — 975 of them from
  // locations.json — the split was:
  //
  //     take (a real catalog item)   69
  //     salvage (a pool matched)    453
  //     climb                        44
  //     water source                 15
  //     NO HOME AT ALL              394     ← 40% of the vocabulary
  //
  // Those 394 were silently DROPPED from the loot picker by OTA-1234, which was
  // the right call at the time (the SALVAGE button was promising to break them and
  // finding nothing) but papered over the real problem: an anvil is a lump of iron
  // and the game pretended it was not there.
  //
  // ⚠ THESE POOLS SIT LAST ON PURPOSE. `pickPool` walks top-down and stops at the
  // first hit, so every pool above still wins its own nouns — these only catch what
  // nothing else claimed. They are broad by design: patterns, not enumerations, so
  // a noun added to the world next year lands somewhere instead of vanishing.
  //
  // ⚠⚠ WHAT IS DELIBERATELY *NOT* GIVEN A POOL, because the owner's rule has a real
  // boundary: you cannot strip a stain, a footprint, an echo, a fog bank, a
  // corridor or a vent. Those are places and traces, not objects, and handing them
  // a material would be the "button that lies" all over again in the other
  // direction. They stay out of the picker, and INVESTIGATE remains their verb.
  {
    id: 'fixture_metal',
    // Ironmongery and instruments: the anvil that started this, plus everything
    // bolted to a wall that is fundamentally a lump of worked metal.
    patterns: [
      'anvil', 'bell', 'bellows', 'chisel', 'grate', 'lever', 'lock', 'keyway',
      'hinge', 'clamp', 'ring', 'hook', 'chandelier', 'sconce', 'kettle',
      'pot', 'pan', 'gauge', 'meter', 'dial', 'siren', 'horn', 'drum',
      'vane', 'tripod', 'clip', 'buckle', 'nail', 'bolt', 'screw', 'spring',
      'sphere', 'weight', 'clock', 'compass', 'stabilizer', 'emitter',
      'detector', 'sensor', 'scanner', 'filter', 'portcullis', 'harness',
      // ⚠ SECOND PASS. The first census pass left 218 nouns homeless and the
      // remainder was read by hand rather than declared finished — these are the
      // obvious metal objects it had missed.
      'armor', 'greaves', 'shield', 'glove', 'gauntlet', 'knuckles', 'plate',
      'crown', 'necklace', 'pendant', 'insignia', 'badge', 'seal', 'coin',
      'key', 'tank', 'vat', 'wheel', 'crampon', 'piton', 'stake', 'mask',
      'knight', 'scale', 'grenade', 'elevator', 'platform', 'monitor',
      'slide rule', 'shaft', 'spark', 'signal',
      'cage',     // ⚠ OTA-1243 — the rescue prop; after the dog quest it is iron bars.
    ],
    items: [
      { name: 'Scrap Metal', rarity: 'Common', weight: 40, min: 1, max: 3 },
      { name: 'Bent Nail', rarity: 'Common', weight: 25, min: 1, max: 3 },
      { name: 'Aether Dust', rarity: 'Common', weight: 15, min: 1, max: 2 },
      { name: 'Worn Tartarian Coin', rarity: 'Common', weight: 12, min: 1, max: 3 },
      { name: 'Aether Crystal', rarity: 'Common', weight: 8, min: 1, max: 1 },
    ],
  },
  {
    id: 'stonework',
    // Masonry and monuments. ⚠ These are the ones the portability rules already
    // refuse to let you TAKE ("centuries-old stonework doesn't fit in any pack
    // ever made") — so a refusal pointed at SALVAGE finally has somewhere to land.
    patterns: [
      'statue', 'idol', 'font', 'dais', 'plinth', 'pedestal', 'tile', 'mosaic',
      'pavement', 'cairn', 'post', 'marker', 'step', 'fence', 'archway',
      'barricade', 'fountain', 'stalactite', 'pebble', 'carving', 'engraving',
      'plaque', 'throne', 'pew', 'kneeler', 'lectern', 'pulpit', 'stand',
      'counter', 'masonry', 'obelisk', 'monument', 'waypoint',
      // ⚠ Second pass — hearths, wells and the shaped-ground family.
      'firepit', 'fire pit', 'hearth', 'well', 'cistern', 'reef', 'ridge',
      'hatch',    // ⚠ a metal lid in a stone floor — `drain hatch` was homeless.
      'circle', 'perch', 'sign', 'pier', 'seat', 'header', 'stall',
    ],
    items: [
      { name: 'Smooth Stone', rarity: 'Common', weight: 35, min: 1, max: 3 },
      { name: 'Mud Fragment', rarity: 'Common', weight: 25, min: 1, max: 3 },
      { name: 'Scrap Metal', rarity: 'Common', weight: 15, min: 1, max: 2 },
      { name: 'Worn Tartarian Coin', rarity: 'Common', weight: 15, min: 1, max: 2 },
      { name: 'Aether Crystal', rarity: 'Common', weight: 10, min: 1, max: 1 },
    ],
  },
  {
    id: 'textile',
    // Cloth, cord and leather. Broader than the existing `fabric` pool, which
    // only claims a handful of specific nouns.
    patterns: [
      'pack', 'bedroll', 'canvas', 'cord', 'line', 'net', 'tapestry', 'flag',
      'cushion', 'vestment', 'leather', 'strap', 'sail', 'awning', 'tarp',
      'blanket', 'wrapping', 'bandage', 'satchel', 'pouch', 'basket',
      // ⚠ Second pass — sacks, tents and the paper family (paper is a fibre).
      'sack', 'tent', 'toy', 'kit', 'papyrus', 'wares', 'cargo', 'flotsam',
      'blackboard', 'loft', 'trellis', 'desk', 'skiff',
    ],
    items: [
      { name: 'Cloth Scrap', rarity: 'Common', weight: 40, min: 1, max: 3 },
      { name: 'Spider Silk', rarity: 'Common', weight: 20, min: 1, max: 2 },
      { name: 'Climbing Rope', rarity: 'Common', weight: 15, min: 1, max: 1 },
      { name: 'Stick', rarity: 'Common', weight: 15, min: 1, max: 2 },
      { name: 'Aetheric Cloth', rarity: 'Uncommon', weight: 10, min: 1, max: 1 },
    ],
  },
  {
    id: 'glassware',
    patterns: [
      'glass', 'mirror', 'prism', 'vial', 'chalice', 'cup', 'basin', 'bowl',
      'flask', 'lens', 'pane', 'bottle', 'jar', 'decanter', 'monstrance',
      'censer', 'crucible',
      // ⚠ Second pass — raw crystal is glassware's nearest family.
      'crystal', 'rune glass', 'instrument',
    ],
    items: [
      { name: 'Aether Crystal', rarity: 'Common', weight: 30, min: 1, max: 2 },
      { name: 'Aether Dust', rarity: 'Common', weight: 25, min: 1, max: 3 },
      { name: 'Smooth Stone', rarity: 'Common', weight: 20, min: 1, max: 2 },
      { name: 'Scrap Metal', rarity: 'Common', weight: 15, min: 1, max: 2 },
      { name: 'Aetheric Shard', rarity: 'Uncommon', weight: 10, min: 1, max: 1 },
    ],
  },
  {
    id: 'growth',
    // Living matter — the one family whose yield is deliberately NOT metal.
    patterns: [
      'moss', 'fungus', 'fungal', 'mushroom', 'spore', 'root', 'bloom',
      'blossom', 'kelp', 'seaweed', 'coral', 'tendril', 'bramble', 'vine',
      'overgrowth', 'nest', 'shell', 'claw', 'tooth', 'anemone', 'lichen',
      'weed', 'thicket', 'creeper', 'egg',
      // ⚠ Second pass.
      'crab', 'oyster', 'shedding', 'patch', 'bed',
    ],
    items: [
      { name: 'Stick', rarity: 'Common', weight: 30, min: 1, max: 3 },
      { name: 'Spider Silk', rarity: 'Common', weight: 20, min: 1, max: 2 },
      { name: 'Bone Sliver', rarity: 'Common', weight: 20, min: 1, max: 2 },
      { name: 'Mud Fragment', rarity: 'Common', weight: 20, min: 1, max: 2 },
      { name: 'Aether Crystal', rarity: 'Common', weight: 10, min: 1, max: 1 },
    ],
  },
  {
    id: 'devotional',
    // Shrine goods. ⚠ Kept as its own pool rather than folded into stonework so
    // the yields can read as offerings — wax, coin, a little worked metal — which
    // is what a vigil-shrine actually leaves behind.
    patterns: [
      'candle', 'offering', 'beads', 'cross', 'reliquary', 'shrine ',
      'prayer', 'votive', 'vigil', 'hymnal', 'missal', 'incense',
    ],
    items: [
      { name: 'Worn Tartarian Coin', rarity: 'Common', weight: 30, min: 1, max: 4 },
      { name: 'Cloth Scrap', rarity: 'Common', weight: 25, min: 1, max: 2 },
      { name: 'Stick', rarity: 'Common', weight: 20, min: 1, max: 2 },
      { name: 'Scrap Metal', rarity: 'Common', weight: 15, min: 1, max: 2 },
      { name: 'Aether Dust', rarity: 'Common', weight: 10, min: 1, max: 2 },
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

// OTA-982 — CURIOS: the Fusing Crucible's fuel. Catalog-ABSENT names (that absence
// is what makes them inferred, and inferred is the only thing the Crucible
// accepts). Salvage rolls one instead of a catalog material CURIO_CHANCE of the
// time. Because the bulk `salvage all` path calls rollSalvagePool ONCE PER NOUN,
// every item in a ten-noun sweep gets its own independent roll — the owner's
// ask: "if there's 10 things that I'm salvaging all then all 10 things should
// have a random chance to drop inferred items."
//
// KNOB: 18% (owner's number). Each curio roll REPLACES a catalog material that
// would have fed crafting/repair, so this is the dial between the two economies
// — raise it if fusion still feels gated, lower it if repair starts pinching.
const CURIO_CHANCE = 0.18;
const CURIOS = (curiosData as { curios: { name: string; rarity: string }[] }).curios;

// The curio's own flavor — it should read as an oddity, not as stock material,
// so the player can feel the difference between "this feeds the forge" and
// "this feeds a recipe".
const CURIO_LINES = [
  'You lever something loose from {target} — not standard salvage. Odd enough that the Crucible would know what to do with it.',
  'Tucked inside {target}: an oddment that matches no quartermaster\'s list. The kind of thing that fuses well.',
  'You work {target} apart and come away with a curiosity — no catalog name, but real weight in the hand.',
  '{target} gives up something irregular. Nobody authored this piece; the forge will take it all the same.',
];

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
  '{target} yields little of value, though a {item} ends up in your pack.',
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

/** ⚠⚠ OTA-1368 — THE ARTICLE IS ADDED HERE, SO NO TEMPLATE MAY ADD ITS OWN.
 *  The owner's 4.29.260 log caught both halves of the same slip:
 *
 *    "The the lantern yields little of value…"     ← template also said "The"
 *    "the desk gives up something irregular."      ← template starts on {target}
 *
 *  `display` always carries an article, so a template that opens with one
 *  doubles it, and a template that opens with {target} starts the sentence in
 *  lower case. The templates are the wrong place to fix that — there are twelve
 *  of them and the next one written will get it wrong again. Instead: this
 *  function owns the article (as it always did) AND owns the capital, so a
 *  template may now begin however it likes and read correctly either way. The
 *  one line that carried its own "The" has had it removed. */
function format(lines: string[], noun: string, rng: () => number): string {
  const t = noun.trim();
  const hasLeadingArticle = /^(the|a|an|some|my|your|this|that)\s/i.test(t);
  const display = hasLeadingArticle ? t : `the ${t}`;
  const line = lines[Math.floor(rng() * lines.length)] ?? lines[0]!;
  const filled = line.replace(/\{target\}/g, display);
  return filled.charAt(0).toUpperCase() + filled.slice(1);
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
/** ⚠⚠ OTA-1232 — DOES THIS NOUN HAVE A SALVAGE YIELD AT ALL? Pure, deterministic,
 *  and rolls nothing — the question a REFUSAL LINE has to answer before it tells
 *  the player to go and salvage something.
 *
 *  Owner, after the take/salvage audit: the eight scene-feature refusals all ended
 *  with "(Try SALVAGE.)" unconditionally (OTA-137 made it universal so a hoarder
 *  would learn the verb). Measured against the shipped pools, `sign` and `arch`
 *  match NO pool — so on those nouns the advice sent the player somewhere empty,
 *  which is the same defect class as the contract refusal that used to blame
 *  travel: a message that costs the player a turn doing the one thing that
 *  provably cannot help.
 *
 *  ⚠ It mirrors `rollSalvagePool`'s FIRST TWO decisions and nothing after them —
 *  the sigil head-noun gate, then `pickPool`. Everything past that point is the
 *  random half (nothing-chance, curio valve, weighted pick), which changes WHAT
 *  you get, never WHETHER there is anything. Reproducing more of it here would
 *  make the two drift; reproducing less would make this lie. */
export function hasSalvageYield(noun: string): boolean {
  if (/(?:^|[\s-])(sigil|crest)s?\s*$/i.test(noun.trim())) return true;
  return pickPool(noun) !== null;
}

export function rollSalvagePool(noun: string, rng: () => number = Math.random): SalvageOutcome | null {
  // OTA-977 — a SIGIL/CREST noun is a faction's mark, not scrap (owner: "a pried
  // sigil awards coin? it should give me a faction sigil"). Faction inferred
  // from the noun's own words (the sigils.ts keyword map — "architect sigil"
  // → Architect Sigil), otherwise rolled across the nine. The turn-in economy
  // (sigils.ts, +1 standing at that faction's agent) takes it from there.
  // OTA-991 — HEAD-NOUN gate: the thing being salvaged must BE the sigil/crest
  // ("seal sigil", "mud crest"), not merely mention one ("sigil floor",
  // "sigil-etched door"). Prying a floor should yield floor scrap.
  if (/(?:^|[\s-])(sigil|crest)s?\s*$/i.test(noun.trim())) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { FACTION_SIGIL_NAME, inferEnemyFaction } = require('./sigils') as typeof import('./sigils');
    const fids = Object.keys(FACTION_SIGIL_NAME);
    const fid = inferEnemyFaction(noun) ?? fids[Math.floor(rng() * fids.length)]!;
    const sigilName = FACTION_SIGIL_NAME[fid]!;
    return {
      kind: 'material',
      poolId: 'sigil',
      itemName: sigilName,
      rarity: 'Uncommon',
      quantity: 1,
      line: `You work the ${noun} free of the stone. A faction's mark, whole — someone will pay standing to see it come home.`,
    };
  }
  const pool = pickPool(noun);
  if (!pool) return null;
  if (rng() < NOTHING_CHANCE) {
    const junk = pickWeighted(JUNK_POOL, rng);
    const line = format(JUNK_LINES, noun, rng).replace(/\{item\}/g, junk.name);
    return {
      kind: 'material',
      poolId: pool.id,
      itemName: junk.name,
      rarity: junk.rarity,
      quantity: 1,
      line,
    };
  }
  // OTA-982 — the CURIO VALVE (see CURIO_CHANCE). Rolled AFTER the nothing-branch
  // (that one is the failure path) and BEFORE the ordinary material pick, so a
  // curio REPLACES the material you would otherwise have got — the take per
  // salvage is unchanged, only its nature. Effective rate is CURIO_CHANCE of
  // the YIELDING rolls, ~17% of all salvages once the 5% consolation path is
  // excluded. The ordering also keeps the existing constant-rng suites honest:
  // they drive this function with a fixed LOW rng to force the consolation
  // branch, and a curio roll placed first would intercept them.
  if (rng() < CURIO_CHANCE) {
    const curio = CURIOS[Math.floor(rng() * CURIOS.length)]!;
    return {
      kind: 'material',
      poolId: 'curio',
      itemName: curio.name,
      rarity: (curio.rarity as Rarity) ?? 'Common',
      quantity: 1,
      line: format(CURIO_LINES, noun, rng),
    };
  }
  // ⚠ The rare find, rolled where the curio valve is and for the same reason: it
  // REPLACES the material rather than adding to it, so a salvage still yields
  // exactly one thing. See SalvagePool.rareFind for why this escape exists at all.
  if (pool.rareFind && rng() < pool.rareFind.chance) {
    return {
      kind: 'material',
      poolId: pool.id,
      itemName: pool.rareFind.name,
      rarity: pool.rareFind.rarity,
      quantity: 1,
      line: format(MATERIAL_LINES, noun, rng),
    };
  }
  // arb61 — restrict to true materials; fall back to the all-material junk
  // pool if this pool's only entries were the now-excluded gear/food/clues.
  const materialItems = pool.items.filter((e) => isSalvageMaterial(e.name));
  if (materialItems.length === 0) {
    const junk = pickWeighted(JUNK_POOL, rng);
    return {
      kind: 'material', poolId: pool.id, itemName: junk.name, rarity: junk.rarity,
      quantity: 1, line: format(MATERIAL_LINES, noun, rng),
    };
  }
  const entry = pickWeighted(materialItems, rng);
  const span = entry.max - entry.min;
  const quantity = entry.min + (span > 0 ? Math.floor(rng() * (span + 1)) : 0);
  return {
    kind: 'material',
    poolId: pool.id,
    itemName: entry.name,
    rarity: entry.rarity,
    quantity,
    line: format(MATERIAL_LINES, noun, rng),
  };
}

/** Exposed for tests. */
export const __TEST_ONLY__ = { POOLS, NOTHING_CHANCE };
