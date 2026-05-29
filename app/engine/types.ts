import type { InvestigationEntry } from './investigationTable';

export type Rarity = 'Common' | 'Uncommon' | 'Rare' | 'Legendary';

export type Intent =
  | 'stealth'
  | 'attack'
  | 'diplomacy'
  | 'escape'
  | 'investigate'
  | 'rest'
  | 'inventory'
  | 'travel'
  | 'use_relic'
  | 'cast'
  | 'wait'
  | 'ask'
  | 'craft'
  | 'equip'
  | 'gift'
  | 'steal'
  | 'join'
  | 'dodge'
  | 'block'
  | 'advance'
  | 'retreat'
  | 'repair'
  | 'accept'
  | 'turn_in'
  | 'dig'
  | 'throw'
  | 'climb'
  | 'swim'
  | 'jump'
  | 'dash'
  | 'disengage'
  | 'help'
  | 'ready'
  | 'mount'
  | 'take_cover'
  | 'aim'
  | 'reload'
  | 'maneuver'
  | 'quick_fire'
  | 'multi_fire'
  | 'fight_back'
  | 'recruit'
  | 'drop'
  | 'pickup'
  | 'open'
  // OTA 004 — Phase 3 water bottles. Fill an empty bottle from a
  // water source in the current scene (puddle / lake / waterfall /
  // crevice / stream / well).
  | 'fill'
  // OTA-125 — drink. Was previously a `rest` synonym, which produced
  // an absurd 8-hour-rest outcome for "drink water" (playtester
  // surfaced this on Day 32). Now its own intent: routes "drink
  // <consumable>" through the existing consumable-eat flow, "drink
  // water" with a scene water source to a small stamina restore.
  | 'drink'
  // OTA-129 — hook-puzzle verbs. These route through the puzzle
  // resolver in engine/hookPuzzles.ts when an active hook in the
  // scene has a puzzle definition. The classic case: sealed vault
  // door narration ("three rotations, in the right order") + player
  // types "rotate the ring left." Pre-OTA-129 these all parsed as
  // intent=unknown and fell to the generic inventory-chatter line
  // even though the narrative had asked for the action.
  | 'rotate'
  | 'knock'
  | 'turn'
  | 'twist'
  | 'press'
  | 'push'
  | 'pull'
  // OTA-120 — Dog Companion combat verbs. Both intents require an
  // active dog in combat (player.dog.status === 'with_player' AND
  // currentScene.enemies.length > 0). Bite is a direct attack;
  // distract applies a 'distracted' status to one enemy for the
  // player's next action. See engine/dogCompanion.ts for the
  // mechanics and handleDogCombat in gameStore.ts for the dispatch.
  | 'dog_bite'
  | 'dog_distract'
  | 'unknown';

export interface ParsedInput {
  intent: Intent;
  raw: string;
  normalized: string;
  target?: string;
  resolvedItemId?: string;
  resolvedNoun?: string;
  matchedVerb?: string;
  confidence: number;
  suggestions: string[];
  /** OTA 204 — predicate-argument structure. Each entry is one
   *  argument the verb takes (direct object, instrument, recipient,
   *  etc.) along with its resolution (catalog item / scene noun /
   *  enemy). Populated alongside the legacy `target` / `resolvedNoun`
   *  / `resolvedItemId` fields, which now mirror `args[0]` for back-
   *  compat with the 25+ gameStore handlers that already read them.
   *
   *  Role names map to linguistic conventions (J&M Ch.12 §12.7
   *  dependency labels / Universal Dependencies):
   *    direct      ≈ obj  (patient/theme)
   *    instrument  ≈ obl:instr
   *    recipient   ≈ iobj / obl:to (goal)
   *    destination ≈ obl:to  (locative goal)
   *    source      ≈ obl:from
   *    manner      ≈ advmod  (adverbial) */
  args?: ParsedArg[];
  /** OTA 204 — non-empty when the parser rejected this input for
   *  validation reasons (meta-talk feedback, frame-required arg
   *  missing, junk nouns in a required slot). Sibling to `intent:
   *  'unknown'` returns. Lets the engine surface useful feedback
   *  instead of silently rewriting state. */
  validationIssues?: string[];
}

/** OTA 204 — argument role taxonomy. See ParsedInput.args for the
 *  mapping to linguistic conventions (Jurafsky & Martin Ch.12 §12.7,
 *  Universal Dependencies labels). */
export type ArgRole =
  | 'direct'       // patient/theme — "attack the DRONE"
  | 'instrument'   // tool / means — "with the BOLT-CASTER"
  | 'recipient'    // give-to / for-whom — "to YULKA"
  | 'destination'  // movement goal — "into the HALL"
  | 'source'       // origin — "from the CRATE"
  | 'manner';      // adverbial — "CAREFULLY"

export interface ParsedArg {
  role: ArgRole;
  /** Raw segment text (joined tokens after stopword strip). */
  text: string;
  /** Set when the segment resolved to a catalog item in the player's
   *  inventory. */
  resolvedItemId?: string;
  /** Set when the segment resolved to a scene noun / enemy / ambient
   *  noun / hook. */
  resolvedNoun?: string;
  /** The preposition that introduced this segment, if any
   *  ('with' / 'to' / 'from' / 'into'). Undefined for the direct
   *  object and for manner adverbs. */
  preposition?: string;
}

export interface Stats {
  strength: number;
  dexterity: number;
  intelligence: number;
  wisdom: number;
  charisma: number;
}

export interface Race {
  id: string;
  name: string;
  baseAC: number;
  /** Free-form description shown in lore screens. Author-prose. */
  racialACBonus: string;
  /** OTA 038 — structured AC bonus rules applied at runtime in
   *  effectiveAC(player, scene). Empty array = no conditional bonus. */
  racialACBonusRules?: Array<{
    condition: 'underground' | 'dark' | 'confined' | 'runic_gear' | 'aether_powers' | 'constructed_environment' | 'relic_armor';
    delta: number;
  }>;
  /** OTA 038 — always-on racial stat bumps applied at every
   *  effectiveStats read. Context-conditional bonuses stay in
   *  `traits` strings for now. */
  racialStatBonuses?: {
    strength?: number;
    dexterity?: number;
    intelligence?: number;
    wisdom?: number;
    charisma?: number;
  };
  startingTCFormula: string;
  startingHPBonus: number;
  barehandDamage: string;
  tags: string[];
  traits: string[];
  description: string;
  /** Short second-person flavor blurb shown on the character-creation
   *  screen under the mechanical description. 2-3 sentences max. Voice:
   *  what it feels like to wake up as this race. */
  flavor?: string;
}

export interface Faction {
  id: string;
  name: string;
  subtitle: string;
  alignment: string;
  goal: string;
  philosophy: string;
  structure: string;
  rivals: string[];
  allies: string[];
  joinRequirements: string;
  tags: string[];
  startingStanding: number;
  /** Short second-person flavor blurb shown on the character-creation
   *  screen under the faction goal. 2-3 sentences max. Voice: what it
   *  feels like to wear this colors. */
  flavor?: string;
}

export interface Enemy {
  name: string;
  type: string;
  abilityPoint: string;
  attack: string;
  damage: string;
  hp: number;
  rarity: Rarity;
  loot: string[];
  /** OTA-120 — set true on captors spawned by a dog-rescue scenario.
   *  The kill-handling site short-circuits the faction-standing
   *  delta and the witness-cascade hostility logic when this flag
   *  is set, so the captor's faction doesn't punish the player for
   *  freeing a chained dog. Combat XP, loot, kill counters, stat
   *  training all still fire normally — only the rep + cascade
   *  paths are skipped. See engine/dogCompanion.ts for the spawn
   *  site and the framework spec entry in HANDOFF.md §0.A. */
  factionNeutralFight?: boolean;
  /** Synonyms the parser accepts for this enemy. "Architectural Sentinel"
   *  might list ["sentinel", "guardian", "statue"] so `attack the sentinel`
   *  resolves to the canonical entity. Lowercase, no punctuation. */
  aliases?: string[];
  /** Per-enemy perks layered on top of the macro type-resistance map.
   *  Supported ids live in engine/enemyTraits.ts; examples:
   *  - "armored"            (+2 AC)
   *  - "quick"              (+1 attack roll)
   *  - "slow"               (−1 attack roll)
   *  - "regenerate"         (+1 HP per round, capped at starting HP)
   *  - "bleeder"            (50% chance to apply bleed on hit)
   *  - "resist:slashing"    (halve incoming slashing damage)
   *  - "vulnerable:burn"    (1.5× incoming burn damage)
   *  - "ambush_strike"      (+2 to the first hit on a target)
   *  Unknown ids are ignored — safe to extend the catalog. */
  traits?: string[];
  /** Boss tier — a named, story-class threat. Engine treats boss
   *  enemies as: AC +6, +1d6 bonus damage per swing, TWO counter-attacks
   *  per round, arrival narration warns the player ("not a fight you
   *  can win head-on — find another way, or run"), and the kill always
   *  drops a Resurrection Gem. Bosses are absent from the random
   *  encounter pools — they only spawn from explicit story triggers
   *  or the boss-spawn gate (~1% on wasteland encounters once the
   *  player has cleared 3+ Legendaries). */
  boss?: boolean;
}

export interface WeatherEntry {
  id: string;
  name: string;
  description: string;
  visibility: number;
  travelPenalty: number;
  corruptionChance: number;
  tags: string[];
  source?: string;
}

export interface Hazard {
  id: string;
  name: string;
  description: string;
  severity: number;
  effect: string;
  tags: string[];
  source?: string;
}

export interface Relic {
  id: string;
  name: string;
  rarity: Rarity;
  description: string;
  effect: string;
  tags: string[];
  source?: string;
}

export interface Location {
  id: string;
  name: string;
  type: string;
  description: string;
  danger: number;
  tags: string[];
  discoverable: boolean;
  parent?: string;
  controlledBy?: string;
  /** Synonyms the parser will accept when the player references this
   *  location. "tartarian arch" might list ["arch", "workroom", "hollow"]
   *  so `search workroom` resolves correctly even when the canonical name
   *  is verbose. Lowercase, no punctuation. */
  aliases?: string[];
  /** Author-declared interactable nouns surfaced as Search / Approach
   *  chips and as parser target candidates. Replaces the heuristic
   *  noun-extraction pass for hand-authored content (the extractor
   *  stays as a fallback when this field is missing). Every entry
   *  should be something the player could plausibly point at — concrete
   *  nouns, no verbs / abstractions / measurements. Lowercase,
   *  no punctuation, singular preferred. */
  interactables?: string[];
}

export interface QuestObjective { id: string; verb: string; target: string; tags: string[]; }
export interface QuestComplication { id: string; text: string; severity: number; tags: string[]; }
export interface QuestReward {
  id: string;
  type: 'currency' | 'standing' | 'relic' | 'knowledge';
  label: string;
  amount?: number;
  faction?: string;
  tier?: string;
  tags: string[];
}

export interface Quest {
  id: string;
  objective: QuestObjective;
  location: Location;
  complication: QuestComplication;
  reward: QuestReward;
  generatedAt: number;
  state: 'open' | 'in_progress' | 'completed' | 'failed';
}

export interface Runecaster {
  id: string;
  name: string;
  tier: Rarity;
  intelligenceRequired: number;
  description: string;
  damage: string | null;
  effect: string;
  tags: string[];
  source?: string;
}

export interface NPC {
  id: string;
  name: string;
  title: string;
  affiliation: string;
  status: string;
  role: string;
  summary: string;
  tags: string[];
}

export interface TimelineEvent {
  year: number;
  name: string;
  location: string;
  factions: string[];
  outcome: string;
  summary: string;
}

export interface InventoryItem {
  id: string;
  name: string;
  kind: 'weapon' | 'armor' | 'relic' | 'consumable' | 'misc' | 'runecaster' | 'dog_armor';
  rarity?: Rarity;
  description?: string;
  quantity: number;
  tags: string[];
  /** Per-instance durability for wear-prone gear. Absent for stackable/consumable items. */
  durability?: { current: number; max: number };
  /** OTA 23-009 — set on items obtained via stealFromVendor. The
   *  sellToVendor path refuses to buy this specific instance back
   *  (it's recognisably the vendor's own). The player can still
   *  USE the item or SCRAP it; the scrap outputs are clean. */
  stolen?: boolean;
  /** OTA-194 — player-tapped heart marker that locks an inferred
   *  item out of OTA-193's auto-substitute crafting drain. Only
   *  inferred items (no hand-authored catalog row) can carry this
   *  flag; the inventory UI gates the heart-tap on that predicate.
   *  Reserved items are saved for the fusion bench (planned). */
  reservedForFusion?: boolean;
}

export type CombatRange = 'arm' | 'close' | 'far';

export interface FactionStanding { factionId: string; standing: number; }

/** A Whisper — a tip the player overheard from a non-vendor NPC,
 *  tracked per-character. Distinct from posted Contracts: no faction
 *  signs you up, no rep changes, the source might be lying. Each
 *  whisper has a target (where to go), an optional time window
 *  (when to go), and a stage that advances as the player follows it.
 *  Expire on their own after `expiresAtHour` so the Whispers panel
 *  doesn't pile up forever. */
export interface WhisperRecord {
  /** Unique chain id (e.g. 'yulka_discs'). Each whisper has authored
   *  text + spawn rules in the engine; this field is the lookup key. */
  id: string;
  /** Where the player is in the chain. Values are chain-specific —
   *  the engine looks up the chain definition by id and consults
   *  its stage table to know what 'met_yulka' should do. */
  stage: string;
  /** In-game hour the whisper was planted. Used for expiry math and
   *  the Whispers-panel "heard 3 hours ago" line. */
  plantedAtHour: number;
  /** Vestigial — Whispers no longer expire as of 2026-05-21 per
   *  playtester request ("I don't think the quest expiration is a
   *  good idea, keep them open"). Kept on the type so old saves
   *  with the field deserialize cleanly; the reaping pass in
   *  whispers.ts is a no-op. */
  expiresAtHour?: number;
  /** Map tile the player should travel to. The chain's planting
   *  step resolves the offset against the player's location at
   *  plant-time so each character gets its own randomised location
   *  (a different patron in a different visit might point at a
   *  different patch of silt). */
  targetMapX: number;
  targetMapY: number;
  /** Macro location id the target tile is in (usually the player's
   *  current location when planted; the chain doesn't currently
   *  cross macro boundaries). */
  targetLocationId: string;
  /** Active hour window for the rendezvous, [from, to] inclusive.
   *  When to is < from, the window wraps midnight (e.g. [20, 4] =
   *  8pm to 4am). Both inclusive in 0-23 hour-of-day terms. Null
   *  on both = no time gating. */
  activeFromHour?: number;
  activeToHour?: number;
  /** Chain-specific extra state — e.g. for the Yulka fetch, this
   *  carries the thief's tile coords so the chain knows where to
   *  spawn the combat encounter. */
  ctx?: Record<string, number | string>;
}

export interface PlayerMilestones {
  enemiesDefeated: number;
  travelsCompleted: number;
  checksSucceeded: number;
  /** Number of accepted quests / hunts / mysteries / storylines / faction
   *  quests. Used to fire a one-time "first contract" Arbiter callback. */
  questsAccepted?: number;
  /** Latched once when the player first crosses out of a hub into open
   *  silt. The next scene-rebuild surfaces a one-shot tip about
   *  digging for rocks / sticks / scraps so the player learns the
   *  basic crafting-stock loop without having to read the wiki. */
  firstSiltCrossed?: boolean;
  /** Latched once when the player sees the "ask me what X is" Arbiter
   *  affordance. Opens the door to the 158-entry concepts.json layer
   *  for players who would never otherwise discover the Q&A path. */
  firstQAHintShown?: boolean;
  /** Latched once when the player sees the "you're inside an outpost,
   *  leave it before traveling to another city" Arbiter hint. Fires
   *  on first hub entry so a new player understands the inside-building
   *  state. */
  firstOutpostHintShown?: boolean;
}

export type EquipSlot =
  | 'main'
  | 'off'
  | 'head'
  | 'chest'
  | 'legs'
  | 'feet'
  | 'amulet'
  | 'ring';

export interface PlayerEquipped {
  /** Catalog name of the weapon in the main (dominant) hand.
   *  Kept as the canonical display + catalog-lookup key. */
  main?: string;
  /** Catalog name of the weapon in the off-hand. */
  off?: string;
  head?: string;
  chest?: string;
  legs?: string;
  feet?: string;
  amulet?: string;
  ring?: string;

  /** Per-slot instance id (matches InventoryItem.id). When set, the
   *  durability-wear path and InventoryScreen dedupe shim use this
   *  to identify exactly WHICH copy of a same-named item is equipped.
   *  Set alongside the name field by equipItem; populated for legacy
   *  saves by backfillPlayer. */
  mainId?: string;
  offId?: string;
  headId?: string;
  chestId?: string;
  legsId?: string;
  feetId?: string;
  amuletId?: string;
  ringId?: string;

  // Legacy fields kept on the type so existing saves still deserialize
  // cleanly. backfillPlayer migrates them to the new slot shape.
  weaponName?: string;
  armorName?: string;
  armor?: string;
}

export type DamageType =
  | 'degradation'
  | 'bludgeoning'
  | 'burn'
  | 'aetheric'
  | 'electrical'
  | 'piercing'
  | 'poison'
  | 'radiation'
  | 'slashing'
  | 'stun';

export type StatusEffectKind =
  | 'bleed'
  | 'stun'
  | 'burn_scar'
  | 'armor_severed'
  | 'paralyzed'
  | 'poisoned'
  | 'dodging'
  | 'blocking'
  // Action-card status effects. Each one is a one-round die modifier
  // routed through rollMods() in combatRules.ts.
  | 'aiming'         // +2 on next ranged attack vs the same target
  | 'sprinting'      // -2 on attack rolls this turn (post-sprint penalty)
  | 'in_cover'       // +4 AC vs ranged (partial cover)
  | 'in_cover_full'  // ranged attacks against you auto-miss (full cover)
  | 'ready'          // bonus die on the held action when its trigger fires
  | 'helping'        // bonus die for an ally next check (single-player: narrative)
  | 'overwhelmed'    // -2 on dodge/evade after multiple hits in one round
  | 'surprised'      // -2 on first reaction; consumed once
  | 'fighting_back'  // next enemy counter resolves as opposed Fighting roll
  | 'quick_fire'    // +2 on the next ranged attack THIS turn (initiative bonus surrogate)
  // v2.4.1 (OTA 034) — successful stealth approach in combat grants
  // the player advantage on the next attack roll. Consumed on use.
  | 'stealthed'      // +5 to the next melee or ranged attack; consumed once
  // OTA 003 — timed stat boost from eating a food / drinking a
  // potion. buffStat + buffBonus carry the actual modifier;
  // effectiveStats sums every active food_buff matching the stat.
  | 'food_buff'
  // OTA 039 — Aethercraft shape outcome. shaped_stone_ward grants a
  // one-round +4 AC. The companion-style 'golem_companion' kind was
  // retired 2026-05-25 (MECHANIC-1b OTA-011) — replaced by
  // player.golem + handleGolemCommand. Removed from the union now
  // that the unreachable handler block was deleted.
  | 'shaped_stone_ward'
  // 2026-05-24 — stamina-driven combat statuses. tired and exhausted
  // are auto-applied/cleared by tickPlayerStaminaStatuses based on
  // current stamina (no persistence drift). power_attack_pending and
  // defensive_stance are player-chosen tactical statuses.
  // well_fed is granted by eating any food consumable; provides +3
  // temp stamina above max that decays over 5 rounds in combat.
  | 'tired'                  // stamina < 25% → -1 atk, -1 AC
  | 'exhausted'              // stamina === 0 → -2 atk, ½ damage, no active dodge/parry
  | 'power_attack_pending'   // next attack +2 to hit, +1 damage die (consumed)
  | 'defensive_stance'       // +2 AC per round; 2 stamina per round drain
  | 'well_fed'               // temp stamina above max from food
  // OTA-120 — dog distract success applies this to one enemy for
  // the player's NEXT action. The next attack hit roll, dodge
  // parry, or flee from THAT enemy gets +2. Consumed when applied.
  | 'distracted';

export interface StatusEffect {
  kind: StatusEffectKind;
  remainingRounds: number;
  /** Per-round damage for DOT effects (bleed, etc.). */
  perRoundDamage?: number;
  /** Display label, defaulted from kind. */
  label?: string;
  /** OTA 003 — food_buff payload. Which stat is boosted and by
   *  how much. effectiveStats reads these when summing buffs. */
  buffStat?: 'strength' | 'dexterity' | 'intelligence' | 'wisdom' | 'charisma';
  buffBonus?: number;
}

// v2.4.1 (OTA 033) — Mud Flood Nexus main quest arc.
//
// Universal spine: every character eventually pursues the same
// end-game (recover 5 Aetheric Cores → descend the Endless Stair →
// reach the Mud Flood Nexus → choose Seal / Unleash / Preserve).
// The player's faction colors HOW they pursue each Core (route
// flavor) but the bones are shared.
//
// Phase machine:
//   hook        Arbiter has mentioned the Nexus once; no objective yet
//   revelation  Player learned about the 5 Cores (triggered on first
//               Lost Capital visit)
//   cores       Actively recovering Cores (5 to collect)
//   descent     All 5 recovered; Endless Stair is now passable
//   nexus       Player has arrived at the Mud Flood Nexus
//   choice      Awaiting the ending decision
//   ended       Player has made The Choice
export type MainQuestPhase =
  | 'hook'
  | 'revelation'
  | 'cores'
  | 'descent'
  | 'nexus'
  | 'choice'
  | 'ended';

export type MainQuestEnding = 'seal' | 'unleash' | 'preserve';

export interface MainQuestState {
  phase: MainQuestPhase;
  /** Lost Capital location ids of Cores already recovered. */
  coresRecovered: string[];
  ending?: MainQuestEnding;
  /** v2.4.1 (OTA 042) — fired-once flags for mid-arc twist beats. */
  twistsFired?: string[];
  /** v2.4.1 (OTA 052) — Capitals whose Core Guardian has been
   *  beaten. Distinct from coresRecovered for one purpose: a
   *  Guardian can be killed AT the moment the Core is granted in
   *  the same step, but the spawn-vs-grant decision needs a
   *  pre-kill flag. Optional — saves predating the Guardian
   *  system act as if every Capital they've already recovered
   *  also defeated the (then-nonexistent) Guardian, so legacy
   *  saves don't see fresh Guardian fights on already-cleared
   *  Capitals. */
  guardiansDefeated?: string[];
}

export interface PlayerCharacter {
  name: string;
  raceId: string;
  factionId: string;
  stats: Stats;
  hp: number;
  hpMax: number;
  stamina: number;
  staminaMax: number;
  /** 2026-05-24 — hunger penalty. Increments by 1 every 8 in-game hours
   *  without eating, capped at 5. effectiveStaminaMax = staminaMax - this.
   *  Eating any food consumable resets to 0. Absent for legacy saves,
   *  backfilled to 0 in backfillPlayer. */
  hungerStaminaPenalty?: number;
  ac: number;
  tc: number;
  corruption: number;
  inventory: InventoryItem[];
  factionStanding: FactionStanding[];
  currentLocationId: string;
  activeQuests: Quest[];
  /** Set when HP hits 0; the character is barred from play until a Resurrection Gem revives them. */
  dead?: boolean;
  /** Lifetime counters; thresholds trigger stat growth. */
  milestones?: PlayerMilestones;
  /** OTA 058 — Skyrim-style use-based stat progression. Each stat
   *  accumulates "progress" from every action that uses it (combat
   *  attack with that stat, skill check, climb, cast, etc.). When
   *  progress hits 100, the base stat increments by 1 and progress
   *  rolls over the overshoot. Default threshold 50 per +1 — see
   *  engine/statTraining.ts STAT_TRAIN_THRESHOLD. */
  statProgress?: Partial<Record<keyof Stats, number>>;
  /** v2.4.1 (OTA 033) — Mud Flood Nexus main quest progress. Optional
   *  because legacy saves predate the arc; backfilled on hydrate. */
  mainQuest?: MainQuestState;
  /** HANDOFF #13 — first-cut companion system. A single NPC follower
   *  the player recruits from a vendor scene. Persists across scenes.
   *  Currently narrative-only; mechanical effects (advantage dice on
   *  skill checks, combat assist) are a follow-on session. Keep
   *  optional so old saves keep loading. */
  companion?: {
    name: string;
    title?: string;
    factionId?: string | null;
    recruitedAt: number;  // hoursElapsed snapshot
  } | null;
  /** HANDOFF #15b — current hub room id when the player is at the
   *  hand-authored hub location. Null/undefined when wandering the
   *  procedural world. Set on first hub entry (defaults to entry
   *  room), cleared on "leave outpost". */
  hubRoomId?: string | null;
  /** OTA 039 — Hollowed corruption-tier forced-Purifier counter.
   *  Increments on every outdoor cardinal step while Hollowed; when
   *  it hits 5, the engine spawns a Mud Monarch Purifier and resets
   *  to 0. Defaults to 0; legacy saves load as undefined and the
   *  step handler treats undefined as 0. */
  stepsSinceLastPurifier?: number;
  /** Currently-equipped weapon and armor (by catalog name). */
  equipped?: PlayerEquipped;
  /** Active combat status effects; tick down each player action. */
  statusEffects?: StatusEffect[];
  /** Hours elapsed since the character entered Tartaria. Day = 24 hours. */
  hoursElapsed?: number;
  /** 2026-05-25 OTA-046 — unix ms when this player's last persist
   *  fired. Approximates "session ended at" because persist runs on
   *  every meaningful action. Used on slot-load to compute real-time
   *  elapsed since last play — if ≥6 hours, the loadSlot path fires
   *  one "while you were away" beat so the world feels like it has
   *  breathed without the player. */
  lastSessionEndedAt?: number;
  /** 2026-05-26 OTA-057 — sliding window of recent tile keys
   *  (`${locationId}:${mapX}:${mapY}`), capped at 20 entries.
   *  stepDirection gates the WIS train + the STR-passive train on
   *  tile novelty against this window: a step landing on a tile
   *  already in history doesn't train. Kills the pacing-between-
   *  two-screens WIS exploit (both tiles always in the window, no
   *  train) while leaving genuine long-traverse exploration to
   *  still train. Optional — older saves default to empty so the
   *  first 20 steps after load are all novel by construction. */
  recentTileHistory?: string[];
  /** IDs of faction quests the player has accepted but not finished.
   *  LEGACY: pre-refactor saves used this flat string array. New saves
   *  populate `activeFactionQuests` (with stage tracking) instead.
   *  backfillPlayer migrates the legacy list into the new shape on
   *  load. The flat array is kept here so old serialized state still
   *  deserializes cleanly. */
  activeFactionQuestIds?: string[];
  /** Active faction quests with per-stage progress. Mirrors activeHunts
   *  / activeMysteries / activeStorylines so all four contract types
   *  share the same accept / advance / turn-in flow. */
  activeFactionQuests?: { id: string; stage: number; postedByFaction: string; acceptedAt: number }[];
  /** IDs of faction quests the player has turned in. */
  completedFactionQuestIds?: string[];
  /** Active monster hunts with per-stage progress. */
  activeHunts?: { id: string; stage: number; postedByFaction: string | null; acceptedAt: number }[];
  /** IDs of hunts that have been turned in. */
  completedHuntIds?: string[];
  /** Active mystery-object quests. */
  activeMysteries?: { id: string; stage: number; postedByFaction: string | null; acceptedAt: number }[];
  /** IDs of mystery quests turned in. */
  completedMysteryIds?: string[];
  /** Active long-form faction storylines (5-10 step). */
  activeStorylines?: { id: string; stage: number; postedByFaction: string | null; acceptedAt: number }[];
  /** IDs of storylines completed. */
  completedStorylineIds?: string[];
  /** Active Whispers — informal NPC-to-NPC tips the player has
   *  overheard, not posted contracts. Time-of-day + tile-targeted,
   *  expire after a window (default ~48 in-game hours). The
   *  Pittsburgh loop: bar-patron drops a tip, player follows it to
   *  a rendezvous, finds a fetch quest, returns, gets paid, walks
   *  home, gets jumped. Tracked per-character, separate from
   *  Contracts so a Whisper feels like rumour, not employment. */
  activeWhispers?: WhisperRecord[];
  /** IDs of Whispers the player has resolved (any terminal stage:
   *  completed, expired, declined). Prevents re-planting the same
   *  whisper twice on the same character. */
  completedWhisperIds?: string[];
  /** Deterministic seed used to generate this character's procedural world map. */
  mapSeed?: string;
  /** Last spot key the player dug at (`locationId:x:y`). Must move away
   *  before digging again — prevents stand-still spam farming. */
  lastDugSpot?: string;
  /** True after the player has finished (or skipped) the new-player intro
   *  tutorial. Set once, never reset; ensures the walkthrough only runs
   *  on the first session of a fresh character. */
  hasSeenIntro?: boolean;
  /** Story-fragment ids the player has collected. Each fragment id maps
   *  to an entry in app/data/collectables/character_stories.json under
   *  one of the 10 character stories. The Collectables tab in
   *  ContractsScreen reads this list to compute per-character progress
   *  and reveal which fragments are still in the field. */
  collectables?: string[];
  /** Current (x, y) on the procedural grid. Defaults to map center. */
  mapX?: number;
  mapY?: number;
  /** Last cardinal direction the player traveled. Lets "continue" /
   *  "keep going" / "onward" repeat the previous step without forcing the
   *  player to retype the direction. Cleared on travelTo() to a named
   *  destination since the player has explicitly broken the cardinal flow.
   *  String-typed (not Direction) to avoid pulling in worldMap.ts here. */
  lastTravelDirection?: 'north' | 'east' | 'south' | 'west';
  /** v2.4.1 (OTA 049) — multi-step travel to a named location.
   *  Set when the player issues `travel to <city>` and replaces the
   *  cardinal-direction buttons with CONTINUE TRAVEL / STOP TRAVEL.
   *  Each CONTINUE tap steps ONE tile toward the target on the
   *  procedural grid. Cleared when the player either arrives (the
   *  step lands on the target tile and travelTo fires) or taps
   *  STOP TRAVEL. */
  // OTA-126 — `distanceRemaining` snapshots the tile count at
  // travel-start and decrements once per step (continueTravel and
  // the first setTravelCourse step). The badge reads this directly
  // instead of recomputing Manhattan distance from coords — the
  // worldMap regenerates with `currentLocationId` at center on
  // every step, so the destination's coords (and therefore the
  // Manhattan distance) shift when the player crosses a location
  // boundary. Playtester report: "23 spaces → counted down to 2,
  // crossed into the mud flats, jumped back to 26 spaces."
  // Optional so older saves don't crash; missing field falls back
  // to the legacy Manhattan calc in the ExplorationScreen badge.
  travelTarget?: { locationId: string; distanceRemaining?: number };
  /** 2026-05-25 [MECHANIC-1b] — active golem sidekick. Persists on
   *  the player so it survives cardinal moves + scene transitions
   *  (the "follows until needed again" requirement). null when no
   *  golem is summoned or after dismissal / death. Named 'golem'
   *  to avoid colliding with the existing optional 'companion'
   *  NPC follower field above. */
  golem?: Companion | null;
  /** OTA-120 — Dog Companion. One per save, acquired via a rescue
   *  scenario (or the puppy-vendor / rubble-puppy safety net). null
   *  on character creation and on legacy saves (backfilled to null
   *  in loadSlotIntoGame). See DogCompanion interface above and the
   *  framework spec in HANDOFF.md §0.A. */
  dog?: DogCompanion | null;
}

/** OTA-120 — Dog Companion. A one-at-a-time canine sidekick the player
 *  rescues early-game (one of 4 scenarios: smelter / wagon / cellar /
 *  snare). Lives on player.dog. Survives across scenes, takes a slice
 *  of enemy retaliation in combat, follows on cardinal moves + travel,
 *  decouples on climbs, sniffs out hidden investigation nouns on scene
 *  entry, eats food (raises loyalty), abandons at loyalty 0, and dies
 *  in combat if HP hits 0 mid-fight-lost. Coexists with golems
 *  side-by-side (the earlier mutex rule was overridden). See HANDOFF.md
 *  §0.A "Dog Companion system" for the full design framework. */
export type DogStartingProfile = 'mongrel' | 'shepherd' | 'hound' | 'mutt' | 'puppy';
export type DogStatus = 'with_player' | 'waiting_at_base' | 'abandoned' | 'dead';
export interface DogCompanion {
  id: string;
  /** Player free-text, capped at 16 chars. */
  name: string;
  /** Player free-text, capped at 24 chars. Pure flavor — no mechanical effect. */
  breed: string;
  /** 3-token answer + derived pronoun. The raw input is preserved for
   *  any flavor narration that wants to echo what the player typed
   *  ("whatever Marrow is, he's down"). */
  sex: {
    raw: string;
    pronoun: 'he' | 'she' | 'they';
  };
  /** Starting profile from the rescue scenario; drives baseline stats.
   *  mongrel = balanced (10/10/10), shepherd = +STR, hound = +DEX,
   *  mutt = +INT, puppy = lower across the board (8/9/9). */
  startingProfile: DogStartingProfile;
  hp: number;
  hpMax: number;
  stats: { strength: number; dexterity: number; intelligence: number };
  statProgress: { strength: number; dexterity: number; intelligence: number };
  /** 0-100; decays without feeding. Thresholds 50/30/15/0 fire
   *  escalating Arbiter beats; 0 = abandoned permanently. */
  loyalty: number;
  /** Game-clock hour of the last feed. lastFedAtHour and the player's
   *  hoursElapsed drive the -1-per-4-hour decay. */
  lastFedAtHour: number;
  equipped: { vest: string | null };
  /** with_player follows; waiting_at_base = at the climb origin or
   *  in 24h auto-heal recovery; abandoned = walked off at loyalty 0;
   *  dead = combat-death (puppyVendorOwed flag flips true). */
  status: DogStatus;
  /** Latched true once after the dog co-activates with a golem the
   *  first time, so the "wide arc" flavor only fires once per save. */
  coexistedWithGolem?: boolean;
}

/** OTA-120 — three-step Arbiter onboarding state machine. ALL player
 *  input routes through the onboarding handler when this is non-null
 *  (the normal verb parser is skipped). Each stage fills one field,
 *  advances, and finalizes after the sex stage. Once finalized, ALL
 *  four rescue hooks die globally — the player can't re-roll. */
export type DogOnboardingStage = 'breed' | 'name' | 'sex';
export interface PendingDogOnboarding {
  stage: DogOnboardingStage;
  rescueData: {
    scenario: 'smelter' | 'wagon' | 'cellar' | 'snare' | 'puppy_vendor' | 'puppy_rubble';
    startingProfile: DogStartingProfile;
  };
  breed?: string;
  name?: string;
}

/** 2026-05-25 [MECHANIC-1b] — Golem sidekick companion. Summoned
 *  via the Aethercraft `summon <type> golem` path, commanded via a
 *  golem QuickBtn in combat. Survives until HP ≤ 0 or until the
 *  player dismisses. */
export type GolemKind = 'mud_golem' | 'iron_golem' | 'aether_golem' | 'crystal_golem';
export interface Companion {
  kind: GolemKind;
  /** Display label. "Mud Golem" / "Iron Golem" / etc. */
  name: string;
  hp: number;
  hpMax: number;
  /** Damage dice — parsed by rollDie / inline. "1d8", "1d6", "1d10". */
  attackDie: string;
  /** Flat damage modifier added on top of the die roll. */
  attackMod: number;
  damageType: 'bludgeoning' | 'slashing' | 'piercing' | 'aetheric';
  /** Flat bonus added to the d20 attack roll (Crystal Golem has +2). */
  hitBonus: number;
  /** ISO ms — diagnostic only. */
  summonedAt: number;
}

export type LogChannel = 'player' | 'arbiter' | 'system' | 'world' | 'combat' | 'reward' | 'cognitive' | 'debug' | 'feedback' | 'dog_quest';

export interface RollStep {
  id: string;
  label: string;
  sides: number;
  count: number;
  bonus: number;
  bonusLabel: string;
  target?: number;
  targetLabel?: string;
  context: string;
  values?: number[];
  total?: number;
  success?: boolean;
  /** HANDOFF #14b — when set, the dice prompt rolls 2 dice on this
   *  step instead of `count` and keeps the higher ('advantage') or
   *  lower ('disadvantage') one. Used for player attack rolls when
   *  the player is aiming (advantage) or surprised (disadvantage).
   *  Mirrors the defense-side handling in applyEnemyCounter. The
   *  bonus / target arithmetic still applies to the kept die. */
  rollMode?: 'advantage' | 'disadvantage';
  /** Optional source-of-truth label so the dice card can name WHY
   *  the player has advantage/disadvantage on this swing. Surfaces
   *  next to the kept die in the post-roll readout. */
  rollModeLabel?: string;
  /** Set true when the attack step rolled a natural 20 — the
   *  attack hits regardless of bonuses, and the follow-up damage
   *  step doubles its dice (classic crit). Also set on natural-1
   *  to force a miss; the damage step is skipped. */
  critical?: boolean;
}

export interface PendingRollState {
  actionText: string;
  steps: RollStep[];
  currentStep: number;
  // OTA-125 — snapshot of player.hoursElapsed + stamina BEFORE the
  // skill-check time/stamina charge was applied. Set when the roll
  // is created so cancelPendingRolls can refund the cost — players
  // who back out of a flee / cast / stealth / etc. modal shouldn't
  // lose 15 minutes and stamina for nothing.
  refundOnCancel?: { hoursElapsed: number; stamina: number };
}

export interface GameLogEntry {
  id: string;
  ts: number;
  channel: LogChannel;
  text: string;
  meta?: Record<string, unknown>;
}

export interface MemorableEvent {
  id: string;
  kind:
    | 'faction_join'
    | 'death_revive'
    | 'rare_kill'
    | 'theft_caught'
    | 'first_travel'
    | 'first_kill'
    | 'first_quest'
    // v2.4.1 (OTA 052) — main-quest milestones for the Contracts
    // Milestones tab. Recorded by the gameStore's main-quest
    // pipeline so the player can review the arc in one place.
    | 'mq_capital_first_visit'
    | 'mq_guardian_spawned'
    | 'mq_guardian_defeated'
    | 'mq_guardian_fled'
    | 'mq_core_recovered'
    | 'mq_descent_unlocked'
    | 'mq_nexus_reached'
    | 'mq_ending_chosen';
  text: string;
  timestamp: number;
  factionId?: string;
  enemyName?: string;
  /** v2.4.1 (OTA 052) — optional structured fields for the
   *  Milestones tab to render an expanded row. None of the legacy
   *  kinds populate these; only the new mq_* kinds do. */
  locationId?: string;
  locationName?: string;
  hoursElapsed?: number;
  detail?: string;
}

export interface WorldMemory {
  tagCounts: Record<string, number>;
  discoveredLocationIds: string[];
  defeatedEnemies: string[];
  completedQuestIds: string[];
  memorableEvents?: MemorableEvent[];
  /** Active multi-scene hook chains — a hook resolution may queue a follow-up
   *  hook kind to plant in a future wander. plantedAtHour lets beginScene
   *  expire chains that have sat unused too long (combat-heavy biomes
   *  used to strand them forever, since chains only fire on peaceful
   *  scenes). */
  pendingChains?: { kind: string; chainId: string; plantedInLocationId?: string; plantedAtHour?: number }[];
  /** Short narrative memos surfaced during chain resolutions. The Arbiter can
   *  reference these in remarks, and they help the player keep narrative thread. */
  chainMemos?: { text: string; ts: number }[];
  /** Scenes since the player last fought. Used to enforce a peaceful cooldown
   *  after combat — gives the player room to wander, dig, search, inspect
   *  without immediately rolling another encounter. */
  scenesSinceCombat?: number;
  /** HANDOFF #15 — first cut MapGraph. Tracks every room the player has
   *  set foot in, keyed by `locationId@microMicroId@mapX,mapY`. First
   *  use is "you've been here before" narration on look + scene entry.
   *  Future: persist enemiesCleared, lootGrabbed, hooksResolved so a
   *  re-entry doesn't re-roll a fresh scene. Optional + defaulted so
   *  legacy saves load cleanly. */
  visitedRooms?: Record<string, VisitedRoom>;
  /** HANDOFF #15b — hub rooms the player has visited at least once.
   *  Used by hub fast-travel to gate "jump to the workshop" against
   *  rooms the player actually knows. Stored separately from
   *  visitedRooms because hub rooms have stable string ids, not the
   *  composite map key. */
  hubVisited?: string[];
  /** OTA 454 — every named NPC the player has met at least once.
   *  Populated by vendor encounters, Core Guardian first-sight,
   *  faction-quest givers, and any other named-NPC interaction. The
   *  Contracts → Milestones tab lists this so the player can see
   *  who they've actually spoken with. Optional + defaulted so
   *  legacy saves load cleanly. */
  npcsMet?: NpcMet[];
  /** OTA-120 — dog acquisition state machine, lives on world memory
   *  so it survives across screens. ALL player input routes through
   *  the onboarding handler when this is non-null. Cleared on
   *  finalize (after the sex stage). */
  pendingDogOnboarding?: PendingDogOnboarding | null;
  /** OTA-120 — set true ONLY when player.dog.status transitions to
   *  'dead' via the combat-death path (HP 0 + fight lost; gem-revive
   *  skips). Drives the Phase 6 puppy-vendor safety net trigger.
   *  Hunger-abandonment does NOT set this flag. */
  puppyVendorOwed?: boolean;
  /** OTA-120 — set true on EITHER outcome of the puppy-vendor encounter
   *  (accept OR decline) AND on rubble-puppy resolution. Permanently
   *  locks the safety-net path so the player can never get a third dog
   *  via this mechanic. */
  puppyVendorUsed?: boolean;
  /** OTA-120 — set true when the puppy vendor has been queued for the
   *  player's next outdoor scene entry after a Core Guardian victory.
   *  The next outdoor scene-entry consumes this flag and spawns the
   *  vendor; clearing prevents double-spawning. */
  puppyVendorQueued?: boolean;
  /** OTA-120 — set true on the first co-activation of a dog and a
   *  golem in combat, so the "wide arc" flavor only fires once. */
  dogGolemCoActivated?: boolean;
  /** OTA-139 — rumor-of-trapped-dog Arbiter hint. Set true after
   *  the hint fires once. Discoverability nudge for players who
   *  pass day 5 without ever tapping a rescue-hook noun (smelter /
   *  cage / wagon / cellar / snare / trap / pit). The Arbiter
   *  drops one rumor line pointing the player toward the genre of
   *  scene where a captor + dog encounter could be found. Single-
   *  shot per save so the hint doesn't become noise. */
  dogRescueTipFired?: boolean;
}

/** OTA 454 — record of a single named NPC encounter. */
export interface NpcMet {
  /** Stable id when available (vendor id, guardian id, etc.); otherwise
   *  a lowercase-slug of the name. Used to dedupe re-encounters. */
  id: string;
  /** Display name as the player saw it. */
  name: string;
  /** Optional short label ("Asgardar vendor", "Core Guardian", "quest-giver"). */
  role?: string;
  /** Optional faction id if the NPC is faction-aligned. */
  factionId?: string;
  /** Location id where the meeting happened. */
  locationId?: string;
  /** hoursElapsed at first meeting. */
  hoursElapsed?: number;
  /** Unix ms timestamp of first meeting. */
  firstMetAt?: number;
}

export interface VisitedRoom {
  /** Unix ms of first visit. */
  firstVisitAt: number;
  /** Unix ms of most recent visit. */
  lastVisitAt: number;
  /** How many distinct visits — useful for "you've been here many times". */
  visitCount: number;
  /** Names of enemies the player has defeated in this room on prior
   *  visits. The next scene roll can use this to suppress respawns
   *  feel rather than re-spawning fresh waves. */
  enemiesCleared?: string[];
  /** HANDOFF #15c — keys identifying loot the player has already
   *  collected from this room. Used to suppress re-grants of the same
   *  rare drop on re-entry (the dagger you dug up shouldn't keep being
   *  diggable). Each key is the lowercased item name; cheap to compare
   *  without changing the catalog. */
  lootGrabbed?: string[];
  /** Items the player dropped on the floor of this room (via the
   *  drop verb). Each item is a full InventoryItem so quantity / kind
   *  / rarity round-trip cleanly back into player.inventory when the
   *  player picks them up. Persists across re-entry so the Tourist
   *  and Vandal stress test can validate object state serialization. */
  droppedItems?: InventoryItem[];
  /** Names of containers / props the player has explicitly opened or
   *  disarmed in this room (chest, crate, trap, etc.). The
   *  area-search / open / disarm handlers consult this to keep
   *  containers from re-closing themselves on re-entry. */
  containersOpened?: string[];
  /** Ambient nouns the player has already area-searched in this
   *  room. The investigate handler checks this BEFORE rolling fresh
   *  area-search dice — a repeat search hits a hard "already
   *  searched, nothing more to do" line instead of looping the
   *  player on the same prop. */
  searchedAmbientNouns?: string[];
  /** 2026-05-25 [POLISH-3] — ambient nouns whose investigate
   *  outcome was pure flavor (no item / no XP / no hook produced).
   *  Kept SEPARATE from searchedAmbientNouns so other verbs
   *  (take, salvage, break) can still act on these nouns — only
   *  the investigate verb consults this list to refuse a repeat
   *  flavor-only outcome, and the Search modal reads it to render
   *  the chip greyed + ✓ at the right side of the row. The
   *  long-standing "investigate the bench → break the bench"
   *  cross-verb flow is preserved because break never touches
   *  this list. */
  flavorExhaustedNouns?: string[];
  /** 2026-05-25 OTA-039 — latched once the player runs their first
   *  investigate in this room. The investigate handler uses it to
   *  force a substantive outcome on the very first investigate per
   *  room visit (hook plant > hidden text > trinket > lore beat),
   *  so a new room never reads as "nothing here to find". Subsequent
   *  investigates fall back to the normal RNG rates. */
  firstInvestigateDone?: boolean;
  /** Audit fix — in-game hours elapsed at the most recent visit.
   *  Used by respawn-quiet calculation so idling for 6 real hours
   *  doesn't accidentally trigger respawn even when no in-game time
   *  passed. Wall-clock fallback (lastVisitAt) remains for legacy
   *  saves that don't carry this field. */
  hoursElapsedAtVisit?: number;
  /** 2026-05-26 OTA-071 — per-room investigation table. Seeded
   *  on first scene generation from ambientNouns. Each entry
   *  has a category, curated/Qwen lore, optional yield, hook
   *  potential, consumed flag, and recorded result. The
   *  investigate handler consults this BEFORE the existing
   *  alreadySearched / requirement / catalog paths, so any
   *  noun in the table gets a specific outcome on first tap
   *  and a specific callback on repeat. Pinned ground
   *  surfaces (ground/floor/mud) are intentionally excluded —
   *  the dig-here path owns those. See
   *  app/engine/investigationTable.ts. */
  roomInvestigationTable?: Record<string, InvestigationEntry>;
  /** OTA-120 — true once the dog has run its smell-find roll in this
   *  room. Prevents the player from farming dog INT by walking in and
   *  out of the same room. Cleared back to false when all visible
   *  nouns in the room's investigation table have been consumed
   *  (a fresh sniff is plausible once the player has cleared the
   *  room's visible content). */
  dogSmelledHere?: boolean;
}

export type ScreenName =
  | 'title'
  | 'character_creation'
  | 'exploration'
  | 'log'
  | 'lore'
  | 'about'
  | 'inventory'
  | 'character'
  | 'map'
  | 'crafting'
  | 'vendor'
  | 'actions'
  | 'contracts'
  | 'ending';

export interface SaveState {
  version: 1;
  savedAt: number;
  player: PlayerCharacter | null;
  worldMemory: WorldMemory;
  gameLog: GameLogEntry[];
  currentScreen: ScreenName;
  /** Scene the player was in when they saved. Optional for back-compat
   *  with older saves that did not capture it — those still fall back to
   *  beginScene() on load. When present, loadSlotIntoGame restores it
   *  as-is so the player resumes exactly where they left off without a
   *  fresh Arbiter narration or a re-rolled scene. Typed `unknown` here
   *  because the CurrentScene shape lives in the game store; the load
   *  flow casts it back at boundary. */
  currentScene?: unknown;
  /** 2026-05-25 — persisted step counter since the last wasteland
   *  encounter. Optional for back-compat with older saves (load
   *  defaults to 0). Persisting prevents a save-load cheese that
   *  reset the counter and delayed the next encounter by `threshold`
   *  cardinal steps. */
  wastelandStepsSinceEncounter?: number;
}
