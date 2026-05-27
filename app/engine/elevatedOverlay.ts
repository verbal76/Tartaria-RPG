// 2026-05-27 OTA-089 — Elevated overlay scenes. When the
// player climbs to the top of a multi-tier obstacle (spire,
// tower, statue, etc.) there's a chance the engine surfaces
// a mini-area at the apex — a nook, a vantage post, an
// Aether collector, a sealed door — with its own ambient
// nouns and (usually) an encounter. The player resolves
// whatever's up there and then `climb down` from the overlay
// to restore the original scene (no detour back to "the
// pillar" first — the climb mark is written at the descent
// step regardless).
//
// Pure module: no React, no zustand. The gameStore's climb
// handler calls rollElevatedOverlay() after the top-tier
// write, and if it returns non-null, calls buildOverlayScene
// to construct the swap-in scene. Climb-down detection in
// the engine reads CurrentScene.preservedSceneOnDescent +
// elevatedOverlayMeta to know it's in an overlay and
// restore the base scene.
//
// Enemies are picked from the existing app/data/enemies/
// enemies.json roster by name — no new enemy authoring
// needed. The overlay just spawns at the same scale the
// player's current world ladder calls for; HP / damage /
// AC are read from the enemy's catalog entry.

import type { Enemy } from './types';
import type { Hook } from './hooks';
import type { VendorInstance } from './vendors';

/** OTA-090 — overlay kinds.
 *
 *  'encounter' — hostile spawn, fight or bail (the OTA-089 default).
 *  'trader'    — peaceful vendor hiding on top of the climb.
 *                Tier-gated: only fires when totalTiers ≥ template.
 *                minTiers (4 in practice). Each trader template
 *                has a hand-authored name + funny "why are they
 *                up here" reason + a small fixed offer pool.
 *  'lookout'   — peaceful NPC who plants a one-stage hook with
 *                a rumor / lore beat. Pays out a small reward
 *                or faction nudge on engagement.
 */
export type OverlayKind = 'encounter' | 'trader' | 'lookout';

export interface OverlayTraderTemplate {
  vendorName: string;
  vendorTitle: string;
  vendorDescription: string;
  faction: string | null;
  demeanor: 'honest' | 'sketchy';
  offers: Array<{ itemName: string; priceMin: number; priceMax: number }>;
}

export interface OverlayLookoutTemplate {
  /** Hook kind for the planted thread. Reuses existing
   *  HookKind values from app/engine/hooks.ts so the rumor
   *  plays through the standard hook pipeline. */
  hookKind: Hook['kind'];
  /** The line that fires on entry — the NPC's pitch. */
  pitchLine: string;
  /** Nouns the player can tap to engage the lookout. The
   *  hook intercept picks these up. */
  hookNouns: string[];
}

/** OTA-091 — tiered encounter pool. Pre-OTA-091 the
 *  encounterPool was a flat string[] mixing Common-tier
 *  enemies (~12-18 HP) with Rare-tier enemies (130-160 HP)
 *  — a roost roll could surface an Aetheric Harpy (158 HP)
 *  against a 32-HP early-game player and crit them to
 *  zero. Now each overlay declares per-tier pools (common,
 *  uncommon, rare); rollOverlayEncounter picks the band
 *  appropriate to player.hpMax so the encounter scales to
 *  whatever the player can survive. */
export interface TieredEnemyPool {
  /** ≤ 30 HP enemies. Always populated — used as the floor
   *  when the player is fresh, and as fallback when higher
   *  tiers are empty for this overlay. */
  common: string[];
  /** 30-80 HP enemies. Mid game. May be empty for overlays
   *  that thematically never produce a mid-tier creature. */
  uncommon: string[];
  /** 80+ HP enemies. Late game. May be empty for low-stakes
   *  overlays. */
  rare: string[];
}

export interface ElevatedOverlay {
  id: string;
  kind: OverlayKind;
  /** Single-paragraph arrival narration. Printed when the
   *  player enters the overlay (right after the climb-top
   *  "you reach the top" line). */
  arrivalLine: string;
  /** Ambient noun pool for the overlay scene. These become
   *  the SearchModal chips while the player is up there.
   *  Investigates resolve through the standard OTA-071+
   *  table seed using these nouns. */
  ambientNouns: string[];
  /** Minimum totalTiers of the climbed obstacle for this
   *  overlay to fire. Traders are gated to 4+ ('larger
   *  locations' per playtester); encounters + lookouts
   *  default to 0 (any tier). */
  minTiers?: number;
  /** 0..1. Chance the overlay spawns an encounter on entry.
   *  Only applies when kind === 'encounter'. */
  encounterChance?: number;
  /** Enemy name pool, tiered by enemy rarity. Must match
   *  entries in app/data/enemies/enemies.json by exact
   *  .name. rollOverlayEncounter picks the band that fits
   *  the player's hpMax. Only applies when kind ===
   *  'encounter'. */
  encounterPool?: TieredEnemyPool;
  /** Trader template — only applies when kind === 'trader'. */
  trader?: OverlayTraderTemplate;
  /** Lookout template — only applies when kind === 'lookout'. */
  lookout?: OverlayLookoutTemplate;
}

// Pool. Roughly tuned so the average overlay has ~50%
// encounter chance, and an open-sky outcome is the rare
// rest beat. Per-template ambientNouns hit the OTA-080
// keyword map where possible (vessel for 'copper bowl',
// vegetation for 'roost feathers', etc.) so the
// investigation table seeds useful entries.
const OVERLAYS: ElevatedOverlay[] = [
  // ============ ENCOUNTERS (OTA-089 + OTA-091 tiering) ============
  // Each pool is tiered by enemy rarity so rollOverlayEncounter
  // can pick the band that matches player.hpMax. The pre-OTA-091
  // pool was a flat string[] mixing 12-HP Common enemies with
  // 158-HP Rare Harpies — a 32-HP early player could roll the
  // Harpy and get 5-9 damage per crit. Now: tier-banded pools so
  // a 32-HP player only sees Common enemies (≤25 HP), a 60-HP
  // player sees Common+Uncommon, and a 100+ HP player sees the
  // full ladder. Enemy names verified against app/data/enemies/
  // enemies.json — pre-OTA-091 'Aetheric Bat' was misspelled
  // and silently failed to spawn; corrected to 'Aetherbat'.
  {
    id: 'nook',
    kind: 'encounter',
    arrivalLine: 'At the top you find a nook carved into the structure — sheltered, lived-in, currently occupied.',
    ambientNouns: ['nook', 'scratched markings', 'dried bones', 'scraps of cloth'],
    encounterChance: 0.65,
    encounterPool: {
      common: ['Aetherbat', 'Aetheric Raven', 'Aetheric Spider'],
      uncommon: ['Mud Lurker', 'Aetheric Scarab'],
      rare: ['Aetheric Apparition'],
    },
  },
  {
    id: 'vantage',
    kind: 'encounter',
    arrivalLine: 'A wind-scoured ledge. Someone watched the road from here, and not long ago — the charcoal sketches are barely smudged.',
    ambientNouns: ['ledge', 'scope stand', 'charcoal sketches', 'spent flare'],
    encounterChance: 0.30,
    encounterPool: {
      common: ['Aetheric Raven'],
      uncommon: ['Aetheric Shrike', 'Mud Harpy'],
      rare: ['Aetheric Harpy'],
    },
  },
  {
    id: 'collector',
    kind: 'encounter',
    arrivalLine: 'A copper bowl is bolted to the apex, half-filled with Aether residue. The air shimmers, like heat over a road.',
    ambientNouns: ['copper bowl', 'aether residue', 'ozone tang', 'bent rivets'],
    encounterChance: 0.50,
    encounterPool: {
      common: ['Aetheric Ooze', 'Aetheric Leech'],
      uncommon: ['Aetheric Salamander'],
      rare: ['Aetheric Apparition'],
    },
  },
  {
    id: 'sealed_door',
    kind: 'encounter',
    arrivalLine: 'A door at the top of the climb. The hinges are mounted on this side — as if to keep something IN.',
    ambientNouns: ['sealed door', 'rusted hinges', 'pry marks', 'sigil'],
    encounterChance: 0.20,
    encounterPool: {
      common: ['Aetheric Spider'],
      uncommon: ['Iron Spider', 'Aetheric Drone', 'Rust Lurker'],
      rare: ['Stone Warden', 'Aetheric Gargoyle'],
    },
  },
  {
    id: 'roost',
    kind: 'encounter',
    arrivalLine: 'A bowl-shaped roost matted with feathers and bone fragments. The smell is still warm.',
    ambientNouns: ['roost', 'feathers', 'bone fragments', 'matted nest'],
    encounterChance: 0.80,
    encounterPool: {
      common: ['Aetheric Raven', 'Aetherbat'],
      uncommon: ['Aetheric Shrike', 'Mud Harpy'],
      rare: ['Aetheric Harpy'],
    },
  },
  {
    id: 'open_sky',
    kind: 'encounter',
    arrivalLine: 'Just sky. The view, and nothing else but the wind, and what the wind knows.',
    ambientNouns: ['sky', 'wind', 'view', 'distant spires'],
    encounterChance: 0.05,
    encounterPool: {
      common: ['Aetheric Raven'],
      uncommon: ['Aetheric Shrike'],
      rare: ['Aetheric Apparition'],
    },
  },
  // ============ TRADERS (OTA-090, 4+ tier climbs only) ============
  // Player asked: traders only on larger locations + funny
  // reason they're hiding. Each template has a hand-authored
  // pitch tying the trader to the Tartaria lore + a small
  // offer pool that fits the trader's archetype. minTiers=4
  // gates these to spires / towers / pillars / capacitors —
  // not low walls or fences.
  {
    id: 'ledger_keeper',
    kind: 'trader',
    minTiers: 4,
    arrivalLine:
      'Up at the top, perched in a thrown-together shack, sits a man surrounded by ledger books. He looks up. "Don\'t ask how I got the wagon up here. Don\'t ask why my own name is in red in three of the volumes. Just say what you want." He pats a small lockbox. "Discount if you tell anyone who asks that you saw me in Voronov."',
    ambientNouns: ['shack', 'ledger books', 'lockbox', 'overturned crate'],
    trader: {
      vendorName: 'Olek the Ledger Keeper',
      vendorTitle: 'Tax Collector (Lapsed)',
      vendorDescription:
        'A man who collected from the Mud Monarchs once, then collected from himself by mistake, and is now hiding from both ledgers.',
      faction: null,
      demeanor: 'honest',
      offers: [
        { itemName: 'Worn Tartarian Coin', priceMin: 1, priceMax: 2 },
        { itemName: 'Sealed Tartarian Letter', priceMin: 15, priceMax: 22 },
        { itemName: 'Aether Dust', priceMin: 8, priceMax: 14 },
        { itemName: 'Bent Nail', priceMin: 2, priceMax: 4 },
      ],
    },
  },
  {
    id: 'wind_priest',
    kind: 'trader',
    minTiers: 4,
    arrivalLine:
      'A figure in stained robes is bent over a pile of bone-charms, mumbling to the wind. They look up, completely unsurprised. "The wind told me you were coming. The wind also said your bootlaces are uneven. The wind is petty up here." They sweep a hand at a flat stone covered in wares.',
    ambientNouns: ['bone charms', 'flat stone', 'stained robes', 'wind chimes'],
    trader: {
      vendorName: 'Sister Yelena of the Tall Air',
      vendorTitle: 'Servants of the Giants — Wind Branch',
      vendorDescription:
        'A Servants acolyte who climbed up to "hear the Giants more clearly." She has been here three years. The wind has not yet said anything actionable.',
      faction: 'servants_of_giants',
      demeanor: 'honest',
      offers: [
        { itemName: 'Aether Residue', priceMin: 6, priceMax: 10 },
        { itemName: 'Aether Dust', priceMin: 10, priceMax: 16 },
        { itemName: 'Bone Sliver', priceMin: 3, priceMax: 6 },
        { itemName: 'Trail Rations', priceMin: 5, priceMax: 8 },
      ],
    },
  },
  {
    id: 'reclaimer_hiding',
    kind: 'trader',
    minTiers: 4,
    arrivalLine:
      'A man with a Reclaimer\'s coat hangs off the edge, peering down. "You\'re not Hass, are you? Tell me you\'re not Hass. If you are, I have a really good explanation about a shipment of Aether Lockets." He sees you\'re empty-handed of any Hass-related authority and relaxes. "Anyway. Half price. Don\'t tell Hass."',
    ambientNouns: ['reclaimer\'s coat', 'half-empty satchel', 'spyglass', 'rope-end'],
    trader: {
      vendorName: 'Pavel (allegedly)',
      vendorTitle: 'Reclaimer — Unemployed by Choice',
      vendorDescription:
        'A Reclaimer who lost a shipment of Aether Lockets in a card game and is now hiding from the guild\'s collector, a woman named Hass. He sells salvage at half price out of desperation.',
      faction: 'reclaimers_guild',
      demeanor: 'sketchy',
      offers: [
        { itemName: 'Aetheric Locket', priceMin: 20, priceMax: 28 },
        { itemName: 'Scrap Metal', priceMin: 3, priceMax: 5 },
        { itemName: 'Aether Shard', priceMin: 18, priceMax: 26 },
        { itemName: 'Cloth Scrap', priceMin: 1, priceMax: 3 },
      ],
    },
  },
  {
    id: 'forgotten_scholar',
    kind: 'trader',
    minTiers: 4,
    arrivalLine:
      'A scholar surrounded by parchment is annotating the air with a quill. "I am compiling The Definitive Catalogue Of What Spires Look Like From The Top. Yours is page 4,711." They blink. "Do you wish to purchase a copy, or are you only here to enrich my dataset? Either is acceptable. The dataset is enriched either way."',
    ambientNouns: ['parchment stack', 'inkwell', 'spyglass', 'rolled scrolls'],
    trader: {
      vendorName: 'Adept Ireneus of the Catalogue',
      vendorTitle: 'Forgotten Order — Tall-Things Division',
      vendorDescription:
        'A Forgotten Order scholar three years into a fifty-year project to catalogue every spire in Tartaria from its top. He pays well for collectables and sells lore at a markup.',
      faction: 'forgotten_order',
      demeanor: 'honest',
      offers: [
        { itemName: 'Sealed Tartarian Letter', priceMin: 12, priceMax: 18 },
        { itemName: 'Aetheric Shard', priceMin: 25, priceMax: 38 },
        { itemName: 'Worn Tartarian Coin', priceMin: 1, priceMax: 2 },
        { itemName: 'Aether Dust', priceMin: 9, priceMax: 14 },
      ],
    },
  },
  {
    id: 'drunk_drifter',
    kind: 'trader',
    minTiers: 4,
    arrivalLine:
      'A drifter is sprawled at the top, surrounded by empty flasks. "I climbed up here three days ago to win a bet. Then I forgot which direction down was. You wouldn\'t happen to know which way is down, would you?" He squints at the horizon, then at you. "Anyway. I have things to sell. Don\'t mind the prices, I made them up just now."',
    ambientNouns: ['empty flasks', 'sleeping mat', 'tin cup', 'overcoat'],
    trader: {
      vendorName: 'Mikola the Lost-On-Purpose',
      vendorTitle: 'Drifter — Currently Stationary',
      vendorDescription:
        'A drifter who climbed up on a bet he can no longer remember. His prices are random; his goods are real. He will eventually figure out which way is down.',
      faction: null,
      demeanor: 'sketchy',
      offers: [
        { itemName: 'Speckled Egg', priceMin: 4, priceMax: 9 },
        { itemName: 'Wild Onion', priceMin: 2, priceMax: 6 },
        { itemName: 'Firewood', priceMin: 1, priceMax: 4 },
        { itemName: 'Trail Rations', priceMin: 4, priceMax: 11 },
        { itemName: 'Mud Essence', priceMin: 5, priceMax: 12 },
      ],
    },
  },
  // ============ LOOKOUTS (OTA-090, any tier) ============
  // Peaceful NPC at the top, plants a one-stage rumor hook.
  // Lower frequency than traders + encounters so the player
  // doesn't burn out on "another scout has a tip for you".
  {
    id: 'rumor_scout',
    kind: 'lookout',
    arrivalLine:
      'A scout in faded leathers turns from the horizon as you crest. "Took you long enough. I saw something on the wind worth telling. Hear me out, and it costs you nothing — not yet."',
    ambientNouns: ['scout', 'wind-faded leathers', 'spyglass', 'folded map'],
    lookout: {
      hookKind: 'thread',
      pitchLine:
        'The scout points east. "Three days ago a Mud Monarch caravan crossed under this spire and dropped a satchel. Whatever was in it, they sent two of theirs back for it. The two didn\'t come back." They tap the map. "Worth the walk if you have a strong stomach."',
      hookNouns: ['scout', 'caravan', 'satchel', 'wind-faded leathers'],
    },
  },
  {
    id: 'rumor_pilgrim',
    kind: 'lookout',
    arrivalLine:
      'An old pilgrim sits cross-legged, palms up to the sky. They don\'t open their eyes as you arrive. "Sit. I won\'t make you stay long. I have something you should know before the Aether tells you the harder way."',
    ambientNouns: ['pilgrim', 'walking-staff', 'prayer beads', 'small fire'],
    lookout: {
      hookKind: 'whisper_crystal',
      pitchLine:
        'The pilgrim opens one eye. "There is a crystal humming in the south. It hums in a name. I am too old to walk to it, but you are young, and the name is one of yours." They pause. "Or it was. Names rot up here."',
      hookNouns: ['pilgrim', 'crystal', 'humming', 'name'],
    },
  },
];

const OVERLAY_BY_ID: Record<string, ElevatedOverlay> = Object.fromEntries(
  OVERLAYS.map((o) => [o.id, o]),
);

/** Probability of any overlay firing at all on a top-tier
 *  climb. Below this rolls, the player just gets the
 *  existing climb-top loot beat and the cleared chip — no
 *  overlay. ~30% keeps overlays as a flavor moment, not a
 *  guaranteed combat tax per climb. */
const OVERLAY_TRIGGER_CHANCE = 0.30;

/** Returns an overlay template when the trigger roll fires
 *  AND a random pick (filtered by minTiers) lands. Caller
 *  passes totalTiers from the climb so traders are gated to
 *  4+ tier obstacles ('larger locations' per playtester
 *  spec). minTiers defaults to 0 for encounters/lookouts so
 *  the filter is a no-op for them.
 *
 *  OTA-090: accepts totalTiers param. Pre-OTA-090 the pool
 *  was uniform-pick from all entries; now the trader subset
 *  is excluded on short climbs so a 1-tier ledge doesn't
 *  surface an absurd "a man with a wagon and three ledgers
 *  is up here" beat. */
export function rollElevatedOverlay(
  totalTiers: number = 0,
  rand: () => number = Math.random,
): ElevatedOverlay | null {
  if (rand() >= OVERLAY_TRIGGER_CHANCE) return null;
  const eligible = OVERLAYS.filter((o) => (o.minTiers ?? 0) <= totalTiers);
  if (eligible.length === 0) return null;
  const pick = eligible[Math.floor(rand() * eligible.length)] ?? null;
  return pick;
}

export function overlayById(id: string): ElevatedOverlay | null {
  return OVERLAY_BY_ID[id] ?? null;
}

/** Pick an enemy NAME from the overlay's encounter pool, or
 *  null when the encounter roll didn't fire. Caller looks up
 *  the actual catalog entry via app/data/enemies/enemies.json
 *  and instantiates the Enemy + hp. */
/** OTA-091 — tier-band selection. Picks the enemy pool that
 *  matches the player's hpMax so a 32-HP early player can't
 *  roll a 158-HP Aetheric Harpy out of a roost.
 *
 *  Thresholds:
 *    hpMax < 40   → common only            (~early game)
 *    hpMax < 80   → common + uncommon      (~mid game)
 *    hpMax >= 80  → uncommon + rare        (~late game)
 *
 *  The late-game band intentionally drops common-tier so
 *  high-level players don't roll trash mobs; the early-game
 *  band intentionally caps at common so squishy players
 *  don't roll Rares. Mid-game blends. If the chosen band is
 *  empty for this overlay's template (some overlays don't
 *  have a rare entry), we fall back to common to guarantee
 *  a spawn. */
const COMMON_HP_CEILING = 40;
const UNCOMMON_HP_CEILING = 80;

export function rollOverlayEncounter(
  overlay: ElevatedOverlay,
  playerHpMax: number,
  rand: () => number = Math.random,
): string | null {
  if (overlay.kind !== 'encounter') return null;
  const chance = overlay.encounterChance ?? 0;
  if (rand() >= chance) return null;
  const pool = overlay.encounterPool;
  if (!pool) return null;
  let candidates: string[];
  if (playerHpMax < COMMON_HP_CEILING) {
    candidates = pool.common;
  } else if (playerHpMax < UNCOMMON_HP_CEILING) {
    candidates = [...pool.common, ...pool.uncommon];
  } else {
    candidates = pool.rare.length > 0
      ? [...pool.uncommon, ...pool.rare]
      : [...pool.uncommon, ...pool.common];
  }
  if (candidates.length === 0) candidates = pool.common;
  if (candidates.length === 0) return null;
  return candidates[Math.floor(rand() * candidates.length)] ?? null;
}

/** Convenience type matching the gameStore's CurrentScene
 *  shape — kept narrow so this module doesn't have to import
 *  the full interface (which lives inside gameStore.ts). The
 *  caller builds the overlay scene by spreading the base
 *  scene and overriding these fields. */
export interface OverlaySceneOverrides {
  ambientNouns: string[];
  displayedAmbientNouns: string[];
  enemies: Enemy[];
  enemyHps: number[];
  enemyAmbushUsed: boolean[];
  activeEnemyIdx: number;
  hooks: never[];
  // OTA-088's roomInvestigationTable seed is handled by the
  // gameStore's existing beginScene-style seed path called
  // explicitly post-swap; this module just sets up the noun
  // pool.
}

export function buildOverlayOverrides(
  overlay: ElevatedOverlay,
  encounterEnemy: Enemy | null,
): OverlaySceneOverrides {
  const enemies = encounterEnemy ? [encounterEnemy] : [];
  return {
    ambientNouns: [...overlay.ambientNouns],
    displayedAmbientNouns: [...overlay.ambientNouns],
    enemies,
    enemyHps: enemies.map((e) => e.hp),
    enemyAmbushUsed: enemies.map(() => false),
    activeEnemyIdx: 0,
    hooks: [] as never[],
  };
}

/** OTA-090 — build a VendorInstance from a trader-overlay
 *  template. Randomizes each offer's price within its min/max
 *  range so the prices feel hand-rolled per visit. Demeanor +
 *  faction pass through so steal mechanics + standing changes
 *  fire normally on engagement. */
export function buildOverlayTrader(
  overlay: ElevatedOverlay,
  rand: () => number = Math.random,
): VendorInstance | null {
  if (overlay.kind !== 'trader' || !overlay.trader) return null;
  const t = overlay.trader;
  const offers = t.offers.map((o) => ({
    itemName: o.itemName,
    price: o.priceMin + Math.floor(rand() * (o.priceMax - o.priceMin + 1)),
  }));
  return {
    id: `overlay_${overlay.id}_${Date.now().toString(36)}`,
    name: t.vendorName,
    title: t.vendorTitle,
    faction: t.faction,
    description: t.vendorDescription,
    offers,
    demeanor: t.demeanor,
  };
}

/** OTA-090 — build a Hook from a lookout-overlay template.
 *  The hook plants on the overlay scene's hooks array so the
 *  player can tap any of the lookout's nouns to engage the
 *  rumor thread. The hook itself drives all the standard
 *  hook-progression mechanics (stages, rewards, dedup). */
export function buildOverlayLookoutHook(overlay: ElevatedOverlay): Hook | null {
  if (overlay.kind !== 'lookout' || !overlay.lookout) return null;
  const l = overlay.lookout;
  return {
    id: `overlay_hook_${overlay.id}_${Date.now().toString(36)}`,
    kind: l.hookKind,
    nouns: [...l.hookNouns],
    plantedLine: l.pitchLine,
    stage: 0,
    resolved: false,
  };
}
