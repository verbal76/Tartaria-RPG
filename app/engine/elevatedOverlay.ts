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

/** OTA-092 — flat thematic pool. Each entry is an enemy name
 *  from app/data/enemies/enemies.json. rollOverlayEncounter
 *  filters at runtime by the enemy's HP relative to player.
 *  hpMax, so a wide-range pool (Common-tier Bat to Rare-tier
 *  Harpy in the same overlay) can serve every player level
 *  cleanly — the system picks the band of enemies that
 *  matches the player's capacity.
 *
 *  Replaces OTA-091's TieredEnemyPool which used rarity as
 *  the band axis. Player asked: "2x is ok, 3x if you want
 *  to scare them" — so the runtime band is HP-ratio, not
 *  rarity. */
export type EncounterPool = string[];

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
  /** Flat thematic enemy pool. Must match entries in
   *  app/data/enemies/enemies.json by exact .name. Runtime
   *  filters by HP relative to player.hpMax so a wide-range
   *  pool serves every player level. Only applies when
   *  kind === 'encounter'. */
  encounterPool?: EncounterPool;
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
  // Each pool is a flat list spanning low-HP to high-HP
  // thematically-fitting enemies. The runtime band filter
  // (0.5x easy → 1-2x standard → 2-3x scare, cap at 3x)
  // picks what fits the player. Wide pools let a single
  // overlay serve early, mid, and late game.
  {
    id: 'nook',
    kind: 'encounter',
    arrivalLine: 'At the top you find a nook carved into the structure — sheltered, lived-in, currently occupied.',
    ambientNouns: ['nook', 'scratched markings', 'dried bones', 'scraps of cloth'],
    encounterChance: 0.65,
    encounterPool: [
      'Aetheric Spider',   // 12 HP
      'Aetherbat',         // 15 HP
      'Aetheric Raven',    // 18 HP
      'Mud Spider',        // 18 HP
      'Mud Lurker',        // 25 HP
      'Aetheric Scarab',   // 58 HP
      'Aetheric Apparition', // 131 HP
    ],
  },
  {
    id: 'vantage',
    kind: 'encounter',
    arrivalLine: 'A wind-scoured ledge. Someone watched the road from here, and not long ago — the charcoal sketches are barely smudged.',
    ambientNouns: ['ledge', 'scope stand', 'charcoal sketches', 'spent flare'],
    encounterChance: 0.30,
    encounterPool: [
      'Gutter Rat',        // 8 HP
      'Aetheric Raven',    // 18 HP
      'Aetheric Shrike',   // 47 HP
      'Mud Harpy',         // 76 HP
      'Aetheric Harpy',    // 158 HP
    ],
  },
  {
    id: 'collector',
    kind: 'encounter',
    arrivalLine: 'A copper bowl is bolted to the apex, half-filled with Aether residue. The air shimmers, like heat over a road.',
    ambientNouns: ['copper bowl', 'aether residue', 'ozone tang', 'bent rivets'],
    encounterChance: 0.50,
    encounterPool: [
      'Aetheric Ooze',       // 12 HP
      'Aetheric Leech',      // 16 HP
      'Aetheric Salamander', // 66 HP
      'Aetheric Apparition', // 131 HP
    ],
  },
  {
    id: 'sealed_door',
    kind: 'encounter',
    arrivalLine: 'A door at the top of the climb. The hinges are mounted on this side — as if to keep something IN.',
    ambientNouns: ['sealed door', 'rusted hinges', 'pry marks', 'sigil'],
    encounterChance: 0.20,
    encounterPool: [
      'Aetheric Spider',  // 12 HP
      'Iron Spider',      // 39 HP
      'Aetheric Drone',   // 44 HP
      'Rust Lurker',      // 55 HP
      'Aetheric Gargoyle',// 135 HP
      'Stone Warden',     // 142 HP
    ],
  },
  {
    id: 'roost',
    kind: 'encounter',
    arrivalLine: 'A bowl-shaped roost matted with feathers and bone fragments. The smell is still warm.',
    ambientNouns: ['roost', 'feathers', 'bone fragments', 'matted nest'],
    encounterChance: 0.80,
    encounterPool: [
      'Aetherbat',         // 15 HP
      'Aetheric Raven',    // 18 HP
      'Aetheric Shrike',   // 47 HP
      'Mud Harpy',         // 76 HP
      'Aetheric Harpy',    // 158 HP
    ],
  },
  {
    id: 'open_sky',
    kind: 'encounter',
    arrivalLine: 'Just sky. The view, and nothing else but the wind, and what the wind knows.',
    ambientNouns: ['sky', 'wind', 'view', 'distant spires'],
    encounterChance: 0.05,
    encounterPool: [
      'Aetheric Raven',     // 18 HP
      'Aetheric Shrike',    // 47 HP
      'Aetheric Apparition',// 131 HP
    ],
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
  // 2026-05-27 OTA-102 — minTiers default bumped from 0 to 2.
  // Playtest log showed a 1-tier 'cracked walkway' climb
  // surfacing a "copper bowl is bolted to the apex" collector
  // overlay — flavor implies a tall structure but the noun is
  // a walkway. 1-tier climbs (ledges, walkways, pedestals, low
  // arches) now get the standard climb-top loot beat but no
  // overlay surface. 2+ tier climbs still surface overlays as
  // before. Traders keep their explicit minTiers=4 so the
  // larger-location gate is unchanged.
  const OVERLAY_MIN_TIERS_DEFAULT = 2;
  const eligible = OVERLAYS.filter((o) => (o.minTiers ?? OVERLAY_MIN_TIERS_DEFAULT) <= totalTiers);
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
/** OTA-092 — HP-ratio band selection. Picks an encounter
 *  whose HP fits the player's capacity. Bands are defined
 *  relative to player.hpMax so the system scales as the
 *  player grows.
 *
 *  Player asked: "I still want a challenge they need to flee
 *  every now and then but not 5x. 2x is ok, 3x if you want
 *  to scare them." So:
 *
 *    easy band     0.5x – 1.0x player.hpMax  (light)
 *    standard band 1.0x – 2.0x player.hpMax  (normal challenge)
 *    scare band    2.0x – 3.0x player.hpMax  (might need to flee)
 *
 *  Above 3x: never spawn. Below 0.5x: too trivial; skip
 *  unless nothing else qualifies (fallback).
 *
 *  Weights tuned so most rolls land in the "standard"
 *  middle band, with a smaller scare slice for the flee-
 *  worthy spike and an easy slice for the breather.
 *
 *  Enemy HP looked up at runtime from enemies.json so a
 *  pool entry's actual stats drive the placement. Pools
 *  can list a wide HP range (Common → Rare in the same
 *  array) and the filter handles the scaling — the
 *  per-overlay thematic identity stays intact regardless
 *  of player level. */
const BAND_EASY_LOW = 0.5;
const BAND_EASY_HIGH = 1.0;
const BAND_STANDARD_LOW = 1.0;
const BAND_STANDARD_HIGH = 2.0;
const BAND_SCARE_LOW = 2.0;
const BAND_SCARE_HIGH = 3.0;
const WEIGHT_STANDARD = 0.60;
const WEIGHT_EASY = 0.25;
// scare = 1 - 0.60 - 0.25 = 0.15

export function rollOverlayEncounter(
  overlay: ElevatedOverlay,
  playerHpMax: number,
  rand: () => number = Math.random,
): string | null {
  if (overlay.kind !== 'encounter') return null;
  const chance = overlay.encounterChance ?? 0;
  if (rand() >= chance) return null;
  const pool = overlay.encounterPool;
  if (!pool || pool.length === 0) return null;
  const hpMax = Math.max(1, playerHpMax);
  // Lazy require to avoid a top-of-file circular concern
  // with enemies.json (the JSON data is also imported by
  // encounter.ts elsewhere; lazy keeps this module's
  // imports clean).
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const enemiesData = require('../data/enemies/enemies.json') as Array<{ name: string; hp: number }>;
  const scored = pool
    .map((name) => {
      const e = enemiesData.find((x) => x.name === name);
      if (!e) return null;
      return { name, hp: e.hp, ratio: e.hp / hpMax };
    })
    .filter((x): x is { name: string; hp: number; ratio: number } => x !== null);
  if (scored.length === 0) return null;
  const easy = scored.filter((x) => x.ratio >= BAND_EASY_LOW && x.ratio < BAND_EASY_HIGH);
  const standard = scored.filter((x) => x.ratio >= BAND_STANDARD_LOW && x.ratio < BAND_STANDARD_HIGH);
  const scare = scored.filter((x) => x.ratio >= BAND_SCARE_LOW && x.ratio <= BAND_SCARE_HIGH);
  // Pick band by weighted roll, falling through to whatever
  // band has entries if the preferred band is empty.
  const bandRoll = rand();
  const ordered: Array<typeof scored> = [];
  if (bandRoll < WEIGHT_STANDARD) {
    ordered.push(standard, easy, scare);
  } else if (bandRoll < WEIGHT_STANDARD + WEIGHT_EASY) {
    ordered.push(easy, standard, scare);
  } else {
    ordered.push(scare, standard, easy);
  }
  for (const band of ordered) {
    if (band.length > 0) {
      return band[Math.floor(rand() * band.length)]!.name;
    }
  }
  // No enemy in any in-range band. Pick the closest-to-1.5x
  // option from the full scored list — degrades gracefully
  // rather than returning null and silently dropping the
  // encounter. Above-3x entries DO get picked here as a last
  // resort, but only when no in-range enemy exists; in
  // practice the pool widths prevent this.
  scored.sort((a, b) => Math.abs(a.ratio - 1.5) - Math.abs(b.ratio - 1.5));
  return scored[0]?.name ?? null;
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
