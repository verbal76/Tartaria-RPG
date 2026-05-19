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
  racialACBonus: string;
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
  kind: 'weapon' | 'armor' | 'relic' | 'consumable' | 'misc' | 'runecaster';
  rarity?: Rarity;
  description?: string;
  quantity: number;
  tags: string[];
  /** Per-instance durability for wear-prone gear. Absent for stackable/consumable items. */
  durability?: { current: number; max: number };
}

export type CombatRange = 'arm' | 'close' | 'far';

export interface FactionStanding { factionId: string; standing: number; }

export interface PlayerMilestones {
  enemiesDefeated: number;
  travelsCompleted: number;
  checksSucceeded: number;
  /** Number of accepted quests / hunts / mysteries / storylines / faction
   *  quests. Used to fire a one-time "first contract" Arbiter callback. */
  questsAccepted?: number;
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
  | 'quick_fire';    // +2 on the next ranged attack THIS turn (initiative bonus surrogate)

export interface StatusEffect {
  kind: StatusEffectKind;
  remainingRounds: number;
  /** Per-round damage for DOT effects (bleed, etc.). */
  perRoundDamage?: number;
  /** Display label, defaulted from kind. */
  label?: string;
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
  /** Currently-equipped weapon and armor (by catalog name). */
  equipped?: PlayerEquipped;
  /** Active combat status effects; tick down each player action. */
  statusEffects?: StatusEffect[];
  /** Hours elapsed since the character entered Tartaria. Day = 24 hours. */
  hoursElapsed?: number;
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
  /** Deterministic seed used to generate this character's procedural world map. */
  mapSeed?: string;
  /** Last spot key the player dug at (`locationId:x:y`). Must move away
   *  before digging again — prevents stand-still spam farming. */
  lastDugSpot?: string;
  /** True after the player has finished (or skipped) the new-player intro
   *  tutorial. Set once, never reset; ensures the walkthrough only runs
   *  on the first session of a fresh character. */
  hasSeenIntro?: boolean;
  /** Current (x, y) on the procedural grid. Defaults to map center. */
  mapX?: number;
  mapY?: number;
  /** Last cardinal direction the player traveled. Lets "continue" /
   *  "keep going" / "onward" repeat the previous step without forcing the
   *  player to retype the direction. Cleared on travelTo() to a named
   *  destination since the player has explicitly broken the cardinal flow.
   *  String-typed (not Direction) to avoid pulling in worldMap.ts here. */
  lastTravelDirection?: 'north' | 'east' | 'south' | 'west';
}

export type LogChannel = 'player' | 'arbiter' | 'system' | 'world' | 'combat' | 'reward' | 'cognitive' | 'debug';

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
}

export interface PendingRollState {
  actionText: string;
  steps: RollStep[];
  currentStep: number;
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
    | 'first_quest';
  text: string;
  timestamp: number;
  factionId?: string;
  enemyName?: string;
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
  /** Audit fix — in-game hours elapsed at the most recent visit.
   *  Used by respawn-quiet calculation so idling for 6 real hours
   *  doesn't accidentally trigger respawn even when no in-game time
   *  passed. Wall-clock fallback (lastVisitAt) remains for legacy
   *  saves that don't carry this field. */
  hoursElapsedAtVisit?: number;
}

export type ScreenName =
  | 'title'
  | 'character_creation'
  | 'exploration'
  | 'log'
  | 'lore'
  | 'about'
  | 'inventory'
  | 'crafting'
  | 'vendor'
  | 'actions'
  | 'contracts';

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
}
