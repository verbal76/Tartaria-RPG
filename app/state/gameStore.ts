import { create } from 'zustand';
import type {
  PlayerCharacter,
  WorldMemory,
  GameLogEntry,
  ScreenName,
  Quest,
  Enemy,
  WeatherEntry,
  Hazard,
  Location,
  LogChannel,
  RollStep,
  PendingRollState,
  InventoryItem,
  CombatRange,
  Intent,
  VisitedRoom,
} from '../engine/types';
import { emptyMemory, recordTags, discoverLocation, recordEnemyDefeat } from '../engine/worldMemory';
import {
  listSlots,
  loadSlot,
  saveSlot,
  deleteSlot,
  setActiveSlot,
  loadActiveSlotId,
  newSlotId,
  migrateLegacySlotIfPresent,
  getActiveSlotId,
  loadGlobalStash,
  addResurrectionGems,
  type SlotSummary,
} from '../engine/saveSystem';
import { makeEntry, persistEntry } from '../engine/gameLog';
import { createCharacter, getRaces, getFactions, type CreateCharacterInput } from '../engine/character';
import { generateQuest } from '../engine/questGenerator';
import {
  pickWeather,
  pickHazardForLocation,
  pickEnemyForLocation,
  rollEncounter,
  getLocationById,
  pickEncounterFromLadder,
  findEnemyByName,
} from '../engine/encounter';
import {
  buildOpening,
  buildOpeningNarrative,
  buildScene,
  buildArbiterRemark,
  shouldArbiterSpeak,
  buildSoftArbiterFallback,
  buildArbiterSceneIntro,
  USE_RELIC_FAILURE_LINES,
  QWEN_ALLOWED_INTENTS,
  LOCATION_FLAVORS,
} from '../engine/narrativeGenerator';
import { parseInput, type ParseContext } from '../engine/parser';
import { parseInputViaLLM } from '../engine/llmParser';
import {
  classifyContainer,
  rollFromPool,
  narrate as containerNarrate,
} from '../engine/containerLoot';
import { pickWastelandEncounter } from '../engine/wastelandEncounters';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { OTA_BUILD_ID } from '../buildInfo';
import { rollDie, rollFromNotation, pick, chance, rotatingPick } from '../engine/rng';
import { buildCombatSteps, buildSkillSteps, rollMods, classifyManeuver } from '../engine/combatRules';
import { CognitiveOrchestrator, type BootStage } from '../ai/CognitiveOrchestrator';
import type { CognitiveResponse, WorldContext, ModelInfo } from '../ai/types';
import { QwenGenerativeEngine, type QwenStatus } from '../ai/generation/QwenGenerativeEngine';
import { buildLlmContext, buildSystemPrompt, type SceneSlice } from '../engine/contextInjector';
import {
  LOCATION_TO_MACRO,
  findMicroMicroAnywhere,
  pickRandomMicroMicroIn,
  pickSiblingMicroMicro,
} from '../engine/worldLadder';
import { getItemPreview } from '../components/itemPreview';
import {
  isInventoryQuestion,
  extractInventoryTarget,
  isContinueCommand,
  isCountQuestion,
  INVENTORY_CATEGORIES,
} from '../engine/askInventory';
import { mergeOrPushItem, grantItem } from '../engine/inventory';
import {
  parseDirectionQuestion,
  findNamedByQuery,
  findNearestNamed,
  describeAllDirections,
} from '../engine/worldDirections';
import locationsData from '../data/locations/locations.json';
import enemiesData from '../data/enemies/enemies.json';
import conceptsData from '../data/lore/concepts.json';
import {
  listCraftableRecipes,
  findRecipeByResult,
  consumeIngredients,
  lookupCraftedItem,
  RECIPES,
  fuzzyFindWeapon,
  fuzzyFindArmor,
  findArmorByName,
  findWeaponByName,
  applyDamageTypeModifier,
  applyArmorResistance,
  type Recipe,
} from '../engine/crafting';
import { getEquippedWeapon, isBareHandAttack } from '../engine/combatRules';
import { pickRandomVendor, findVendorByName, VENDORS, type VendorInstance } from '../engine/vendors';
import { findQuestFactionHint } from '../engine/factionHint';
import {
  HUB,
  isHubLocation,
  findHubRoom,
  hubEntryRoomId,
  resolveHubTravel,
  isLeaveHubCommand,
} from '../engine/hub';
import { sellPriceFor, isUnsellable } from '../engine/sellPrice';
import { validSlotsForItem, SLOT_LABEL, ARMOR_SLOTS, SLOT_ID_KEY, resolveEquippedItem, effectiveStats } from '../engine/equipment';
import { canScrap, scrapOutputFor } from '../engine/scrapEngine';
import { stampDurability, wearItemByName, wearItemById, repairCost, repairItem } from '../engine/durability';
import {
  type Hook,
  type HookEffect,
  getHookOutcome,
  matchHookNoun,
  matchAnyHookNoun,
  pickRandomHookKind,
  plantHookByKind,
} from '../engine/hooks';
import type { EquipSlot } from '../engine/types';
import {
  WEAPONS,
  ARMOR,
  GEAR,
  MATERIALS,
} from '../engine/crafting';
import {
  FACTIONS,
  findFaction,
  applyRepChange,
  getStanding,
  meetsJoinThreshold,
  JOIN_THRESHOLD,
} from '../engine/factions';
import {
  findFactionQuestById,
  availableFactionQuests,
  fuzzyFindFactionQuest,
  FACTION_QUESTS,
} from '../engine/factionQuests';
import {
  HUNTS,
  findHuntById,
  availableHunts,
  fuzzyFindHunt,
  scaleHuntBoss,
} from '../engine/hunts';
import {
  MYSTERIES,
  findMysteryById,
  availableMysteries,
  fuzzyFindMystery,
} from '../engine/mysteries';
import {
  STORYLINES,
  findStorylineById,
  availableStorylines,
  fuzzyFindStoryline,
} from '../engine/factionStorylines';
import { tickWeather, weatherBlocksRepositioning, weatherRepositionCost, weatherAttackPenalty, weatherStatModifiers, describeWeatherStatModifiers } from '../engine/weatherEffects';
import { traitAttackBonus, traitAmbushBonus, traitDamageMultiplier, traitOnHitStatus, traitRegen, traitDodgeChance, describeTraits } from '../engine/enemyTraits';
import { parseWeaponEffect, rollEffectBonusDamage } from '../engine/weaponEffects';
import { rollThrowDamage, weightLabel, itemWeight } from '../engine/itemWeight';
import { extractAmbientNouns, matchAmbientNoun } from '../engine/ambientNouns';
import { levenshtein } from '../engine/editDistance';
import { isAreaSearch, isGroundSearch, rollAreaSearch } from '../engine/areaSearch';
import { bestDigTool, rollDig } from '../engine/digging';
import {
  generateWorldMap,
  stepInDirection,
  surveyAll,
  WORLD_MAP_CENTER_X,
  WORLD_MAP_CENTER_Y,
  type Direction,
  type WorldMap,
} from '../engine/worldMap';
import {
  rollIncomingStatusEffect,
  applyEffect,
  tickEffects,
  statusAcAdjustment,
  statusAttackPenalty,
  isIncapacitated,
  hasFullCover,
  aethericVulnerabilityMultiplier,
} from '../engine/statusEffects';
import type { StatusEffect, MemorableEvent } from '../engine/types';
import { TUTORIAL_STEPS } from '../components/tutorialSteps';
import { findFragmentById, findStoryByFragmentId, pickFragmentForBiome } from '../engine/collectables';

interface Concept {
  id: string;
  keywords: string[];
  title: string;
  answer: string;
}
const ALL_CONCEPTS = (conceptsData as { concepts: Concept[] }).concepts;

// Match a player's "what is X / explain X / tell me about X" target text
// against the concepts knowledge base. First substring hit on any keyword
// wins; returns null if nothing matches so the caller can fall back.
function findConcept(targetText: string | undefined): Concept | null {
  if (!targetText) return null;
  const t = targetText.toLowerCase();
  if (!t.trim()) return null;
  // Prefer longer keyword matches (so "burn damage" matches before "burn").
  const sorted = [...ALL_CONCEPTS].sort(
    (a, b) => Math.max(...b.keywords.map((k) => k.length)) - Math.max(...a.keywords.map((k) => k.length)),
  );
  for (const c of sorted) {
    for (const kw of c.keywords) {
      if (t.includes(kw.toLowerCase())) return c;
    }
  }
  return null;
}

const allLocations = locationsData as Location[];

interface CurrentScene {
  weather: WeatherEntry;
  location: Location;
  hazard: Hazard | null;
  /** All enemies engaged in this scene. Empty when peaceful. */
  enemies: Enemy[];
  /** Current HP per enemy, aligned by index to `enemies`. */
  enemyHps: number[];
  /** Index of the enemy the player is currently targeting. */
  activeEnemyIdx: number;
  vendor: VendorInstance | null;
  /** Distance from the player to the enemy group. Null when peaceful. */
  range: CombatRange | null;
  /** Live narrative hooks the player can follow into multi-stage chains. */
  hooks: Hook[];
  /** Notable nouns extracted from location.description — the things the
   *  scene paragraph mentioned that the player can ask / investigate /
   *  search against. */
  ambientNouns: string[];
  /** A shuffled 10-noun subset of ambientNouns, fixed for this scene
   *  visit. look-around shows the first 8 of these; the chip pool
   *  (Search / Approach / Salvage) shows up to 10. Set once during
   *  beginScene so consecutive looks at the same room return a
   *  stable view of the scene — leave and come back to re-roll.
   *  When ambientNouns has ≤10 entries this just mirrors them in
   *  order; when the pool is larger (most macros now hold 50-100+
   *  authored interactables), it picks a fresh 10 per visit. */
  displayedAmbientNouns?: string[];
  /** When this Location maps to a Macro biome in worldLadder.json, the
   *  scene picks a specific Micro-Micro room to flavor the Arbiter's
   *  narration. Stored here (not regenerated each turn) so a single
   *  visit reads as one consistent room. Null for legacy/unmapped
   *  locations — the LLM context falls back to flat Location text. */
  microMicroId: string | null;
  /** Slow-weather repositioning progress (Iron Fog etc.). Counts player
   *  advance/retreat actions toward the next range change. Reset to 0
   *  whenever range actually changes, the player switches direction, or
   *  the weather clears. */
  repositionPartial?: number;
  /** Last advance/retreat direction the player committed under slow
   *  weather. Used to detect direction changes so partial progress
   *  doesn't carry from "advance" into a later "retreat". */
  repositionDir?: 'advance' | 'retreat';
  /** Whether each enemy in `enemies` has already used its
   *  ambush_strike trait this scene. Parallel to enemyHps. Trait
   *  fires only on the first counter; the +2 bonus is consumed and
   *  the flag set true. Initialized empty in beginScene. */
  enemyAmbushUsed?: boolean[];
}

// Helper: which enemy is the player currently targeting? Returns null
// when no enemies are present.
function activeEnemy(scene: CurrentScene | null): Enemy | null {
  if (!scene || scene.enemies.length === 0) return null;
  return scene.enemies[scene.activeEnemyIdx] ?? scene.enemies[0] ?? null;
}
function activeEnemyHp(scene: CurrentScene | null): number | null {
  if (!scene || scene.enemyHps.length === 0) return null;
  return scene.enemyHps[scene.activeEnemyIdx] ?? scene.enemyHps[0] ?? null;
}

function collectSceneNouns(scene: CurrentScene): string[] {
  // Locations are containers, not interactable targets — never include
  // scene.location.name here. The Location name shouldn't surface as
  // "investigate X" / "use torch on X" since it leads to nonsense
  // suggestions like "use torch on tartarian outskirts." The parser still
  // gets the Location name separately via ParseContext.currentLocationName
  // so it can recognize the name without treating it as a noun.
  const nouns = [scene.weather.name];
  if (scene.hazard) nouns.push(scene.hazard.name);
  for (const e of scene.enemies) {
    nouns.push(e.name, e.type);
    // Phase 4 §2.2 — aliases. Enemies can list synonyms ("sentinel",
    // "guardian", "statue" for an Architectural Sentinel) so the parser
    // matches what the player actually types, not just the canonical
    // name. Empty / missing arrays are safe — the spread is a no-op.
    if (e.aliases) nouns.push(...e.aliases);
  }
  // Location aliases — "workroom" / "arch" / "hollow" should resolve to
  // a Tartarian Arch even though we don't pool the canonical Location
  // name itself. The parser uses recentNouns for matchAmbientNoun, so
  // adding the aliases here lets a player type "search the workroom"
  // and have the engine recognize it.
  if (scene.location?.aliases) nouns.push(...scene.location.aliases);
  // Ambient nouns from the location description so the parser can resolve
  // "investigate the traps" / "ask about buried cities" against the same
  // content the player just read in the scene paragraph.
  if (scene.ambientNouns) nouns.push(...scene.ambientNouns);
  // Hook nouns so a search hits an active narrative thread.
  if (scene.hooks) {
    for (const h of scene.hooks) {
      if (!h.resolved) nouns.push(...h.nouns);
    }
  }
  // When a vendor is present, the scene has all the trappings of a market
  // even if the location description doesn't spell it out. Add the obvious
  // commerce vocabulary so the player can type "search the market" /
  // "investigate the stall" without getting the soft "I don't see a market
  // here" refusal. Cheap — 8 strings per vendor-bearing scene.
  if (scene.vendor) {
    nouns.push('market', 'stall', 'bazaar', 'shop', 'trader', 'trade', 'wares', 'counter');
  }
  return nouns;
}

export type CognitiveStatus = 'idle' | BootStage | 'failed' | 'skipped';

// Module-level singleton — class instances don't belong in zustand state.
const cognitive = new CognitiveOrchestrator();

// Second AI engine — the generative Arbiter narrator. Loaded lazily on demand;
// initialization is slow (~hundreds of MB download on first launch) so we keep
// it on a separate boot path from the MiniLM classifier above. Until it
// reports ready, the narrative pipeline keeps using the existing template
// pools — there is no degraded mode.
const qwen = new QwenGenerativeEngine();

// Casual-look narration: the player asked to look around but didn't target
// anything specific. We narrate the scene without a roll, and occasionally
// surface a hook the player can follow up on with a targeted action.
const CASUAL_LOOK_LINES = [
  'You scan the area. The stones are quiet for now.',
  'You take in your surroundings. Nothing the Arbiter would call a discovery.',
  'You let your gaze drift. The dust hangs the way dust does.',
  'Your eyes track across the ruins. Whatever was here has been here a long time.',
  'You look around. The hazard remains exactly as it was, no more, no less.',
];
const CASUAL_LOOK_HOOKS = [
  'Something dark, half-swallowed by mud, catches your eye.',
  'A faint resonance pulses from a collapsed corner.',
  'Fresh scrape marks across the stone where there should be none.',
  'A glint of metal — too small to name yet — lies in the rubble.',
  'A handprint pressed into Aetherstone dust, recent enough to still hold shape.',
  'The Aetheric haze thickens around one specific spot. You cannot tell why.',
  'A thread of cold air leaks from somewhere behind the rubble.',
];

// Wandering-journey narration: the player asked to walk / travel without
// naming a destination. Move the world forward, plant something in the
// distance the player can pursue.
const WANDERING_LEADS = [
  'After a while you set down on the next stretch of ground.',
  'You walk. Tartaria walks beside you.',
  'Your boots find the next stretch of ground.',
  'You set out on foot. The weather closes around you.',
];
const FEATURE_SIGHTINGS = [
  'A low shape resolves on the horizon — too regular to be a hill, too small to be a tower.',
  'You spot what looks like a stone arch, half-swallowed by old mud.',
  'A faint resonance pulses from the south. Something there is awake.',
  'A column of smoke or steam rises in the distance, thin and straight.',
  'A thread of footprints, not yours, crosses your path and trails off.',
  'A wagon, abandoned and broken-axled, leans into the mud ahead.',
  'A toppled obelisk lies on its side, runes faded but not yet silent.',
];

// Trigger phrases that switch an "investigate" intent from a generic look
// into a request for navigational options.
const DIRECTION_KEYWORDS = /\b(direction|way|paths?|exits?|route|where to go|which way)\b/i;

// Per-action stamina costs. Casual look, wait, inventory, talk = 0.
// Tuned down after playtest feedback: "stamina goes by a little bit too
// fast in this game. I shouldn't have to rest after I walk across the
// room." Wander/attack/skillCheck now cost half what they did, and
// intra-scene movement uses 1 stamina (handled at the call site).
const STAMINA_COSTS = {
  travel: 2,
  wander: 1,
  attack: 1,
  skillCheck: 1,
} as const;
/** Soft ceiling on accumulated corruption. Without this the weather
 *  tick can climb a player into thousands of corruption — the sim
 *  surfaced 7868 over 10 in-game days. 50 keeps it a meaningful
 *  gameplay signal (and within the range the narration / Arbiter
 *  remarks were authored to react to). */
const CORRUPTION_MAX = 50;
const TRAVEL_MIN_STAMINA = STAMINA_COSTS.travel;

/** Pick a single distinctive keyword from a contract title for the
 *  "Say 'accept X' to take it" hint. Returns the LAST word ≥ 4 chars
 *  that isn't a stopword — for English titles that's almost always
 *  the head noun. Examples:
 *    "Walk the buried road"           → "road"
 *    "The Bog Dragon of Old Drakova"  → "Drakova"
 *    "Cradle of Dusk Compass"         → "Compass"
 *    "The Path of the True Tartarian" → "Tartarian"
 *    "Field a scholar"                → "scholar"
 *    "Cut down a rare beast"          → "beast"
 *  The accept-handler uses substring fuzzy matching against the
 *  contract pool, so any unique-enough word in the title resolves.
 *  Replaces the previous "first three words" slice which produced
 *  awkward hints like "accept walk the". */
const ACCEPT_HINT_STOPWORDS = new Set([
  'a', 'an', 'the', 'of', 'in', 'on', 'to', 'for', 'with', 'from',
  'by', 'at', 'and', 'or', 'old', 'new', 'true', 'down', 'up',
]);
function acceptKeyword(title: string): string {
  const tokens = title.split(/\s+/).filter(Boolean);
  for (let i = tokens.length - 1; i >= 0; i--) {
    const raw = tokens[i]!;
    const clean = raw.replace(/[^a-zA-Z']/g, '');
    if (clean.length < 4) continue;
    if (ACCEPT_HINT_STOPWORDS.has(clean.toLowerCase())) continue;
    return clean.toLowerCase();
  }
  // Fallback — title was unusually short; just lowercase the first token.
  return (tokens[0] ?? title).toLowerCase();
}

function backfillPlayer(p: PlayerCharacter): PlayerCharacter {
  const stamMax = p.staminaMax ?? 8 + Math.floor((p.stats?.strength ?? 5) / 2);
  // Migrate legacy single-slot equipped fields to the multi-slot shape.
  // Old saves may have a single `armor` field — promote it to the chest slot.
  const eq = p.equipped ?? {};
  const legacyArmor = eq.chest ?? eq.armor ?? eq.armorName;
  // Stamp durability on any catalog item that doesn't already have it.
  // Older saves predate the durability field. Do this BEFORE id backfill
  // so newly-stamped items show up in the inventory lookup below.
  const inventory = (p.inventory ?? []).map((i) => stampDurability(i));
  // Backfill the per-slot instance ids. A pre-refactor save records only
  // the equipped name; we map each name to the first matching inventory
  // id so later wear / dedupe paths can point at a specific instance.
  // Skip slots that already have an id (newer saves).
  const findFirstId = (name: string | undefined): string | undefined => {
    if (!name) return undefined;
    const lower = name.toLowerCase();
    return inventory.find((i) => i.name.toLowerCase() === lower && i.quantity > 0)?.id;
  };
  const equipped: PlayerCharacter['equipped'] = {
    main: eq.main ?? eq.weaponName,
    off: eq.off,
    head: eq.head,
    chest: legacyArmor,
    legs: eq.legs,
    feet: eq.feet,
    amulet: eq.amulet,
    ring: eq.ring,
    mainId: eq.mainId ?? findFirstId(eq.main ?? eq.weaponName),
    offId: eq.offId ?? findFirstId(eq.off),
    headId: eq.headId ?? findFirstId(eq.head),
    chestId: eq.chestId ?? findFirstId(legacyArmor),
    legsId: eq.legsId ?? findFirstId(eq.legs),
    feetId: eq.feetId ?? findFirstId(eq.feet),
    amuletId: eq.amuletId ?? findFirstId(eq.amulet),
    ringId: eq.ringId ?? findFirstId(eq.ring),
  };
  return {
    ...p,
    inventory,
    staminaMax: stamMax,
    stamina: p.stamina ?? stamMax,
    milestones: p.milestones ?? { enemiesDefeated: 0, travelsCompleted: 0, checksSucceeded: 0 },
    equipped,
    statusEffects: p.statusEffects ?? [],
    hoursElapsed: p.hoursElapsed ?? 0,
    activeFactionQuestIds: p.activeFactionQuestIds ?? [],
    // Migrate legacy flat-id list into the new staged shape. We don't
    // know the original posting faction; pull it from the FactionQuestDef
    // catalog. Saves that already wrote activeFactionQuests pass through.
    activeFactionQuests: p.activeFactionQuests ?? (p.activeFactionQuestIds ?? []).map((id) => {
      const def = findFactionQuestById(id);
      return {
        id,
        stage: 0,
        postedByFaction: def?.factionId ?? 'unknown',
        acceptedAt: Date.now(),
      };
    }),
    completedFactionQuestIds: p.completedFactionQuestIds ?? [],
    collectables: p.collectables ?? [],
    activeHunts: p.activeHunts ?? [],
    completedHuntIds: p.completedHuntIds ?? [],
    activeMysteries: p.activeMysteries ?? [],
    completedMysteryIds: p.completedMysteryIds ?? [],
    activeStorylines: p.activeStorylines ?? [],
    completedStorylineIds: p.completedStorylineIds ?? [],
    mapSeed: p.mapSeed ?? `${p.name}|${p.raceId}|${p.factionId}|legacy`,
    mapX: p.mapX ?? 4,
    mapY: p.mapY ?? 4,
  };
}

// Convert a raw hours-elapsed counter into a friendly "Day N, time-of-day"
// label. 24 hours per day, four broad slots so the day/night cycle is
// readable but not granular enough to be annoying.
function describeTime(hours: number): string {
  const day = Math.floor(hours / 24) + 1;
  const hourOfDay = Math.floor(hours % 24);
  let part: string;
  if (hourOfDay < 6) part = 'night';
  else if (hourOfDay < 12) part = 'morning';
  else if (hourOfDay < 18) part = 'afternoon';
  else part = 'evening';
  return `Day ${day}, ${part}`;
}

// Record a discrete memorable event on the world memory. Used for the
// Arbiter's "I remember when you..." callbacks. Kept lightweight (string +
// kind + timestamp) — full per-event metadata isn't needed yet.
function recordMemorableEvent(
  get: () => GameStore,
  set: (fn: (s: GameStore) => Partial<GameStore>) => void,
  event: Omit<MemorableEvent, 'id' | 'timestamp'>,
): void {
  const e: MemorableEvent = {
    id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    timestamp: Date.now(),
    ...event,
  };
  set((s) => ({
    worldMemory: {
      ...s.worldMemory,
      memorableEvents: [...(s.worldMemory.memorableEvents ?? []), e].slice(-40),
    },
  }));
}

// Milestone thresholds. Hit one of these counters and the character gets a
// permanent stat bump. Numbers are intentionally generous so growth feels
// earned, not handed out.
const MILESTONE_KILL_STEP = 5;     // every 5 enemies defeated → +1 HP max
const MILESTONE_TRAVEL_STEP = 5;   // every 5 travels → +1 stamina max
const MILESTONE_CHECK_STEP = 10;   // every 10 successful skill checks → +1 to the relevant stat

function checkMilestone(
  counter: number,
  step: number,
): boolean {
  return counter > 0 && counter % step === 0;
}

// Which stat each skill-check intent trains. Mirrors the combatRules SKILL_STAT
// map but inlined here so the gameStore doesn't have to import from there.
const INTENT_TO_STAT: Record<string, keyof PlayerCharacter['stats']> = {
  stealth: 'dexterity',
  diplomacy: 'charisma',
  escape: 'dexterity',
  investigate: 'intelligence',
  cast: 'intelligence',
  use_relic: 'wisdom',
};

function spendStamina(player: PlayerCharacter, amount: number): PlayerCharacter {
  return { ...player, stamina: Math.max(0, player.stamina - amount) };
}

// Advance the in-game clock by `hours`. Used by anything that isn't a rest
// — travel (long), attack (short), skill check (short) — so the day/night
// cycle progresses naturally even without explicit camping.
function advanceTime(player: PlayerCharacter, hours: number): PlayerCharacter {
  return { ...player, hoursElapsed: (player.hoursElapsed ?? 0) + hours };
}

function restoreStamina(player: PlayerCharacter, amount: number): PlayerCharacter {
  return { ...player, stamina: Math.min(player.staminaMax, player.stamina + amount) };
}

interface GameStore {
  player: PlayerCharacter | null;
  worldMemory: WorldMemory;
  gameLog: GameLogEntry[];
  currentScreen: ScreenName;
  currentScene: CurrentScene | null;
  pendingRolls: PendingRollState | null;
  hydrated: boolean;
  /** Set when a slot load fails — UI surfaces this and offers recovery. */
  slotLoadError: string | null;
  /** Current tutorial step index, or null when no tutorial is active. */
  tutorialStep: number | null;
  /** When set, the vendor screen displays this stub vendor for the
   *  tutorial's trading-screen step. Cleared on tutorial end. */
  tutorialDemoVendor: VendorInstance | null;

  slots: SlotSummary[];
  activeSlotId: string | null;
  resurrectionGems: number;

  cognitiveStatus: CognitiveStatus;
  cognitiveFraction: number;
  cognitiveError: string | null;
  cognitiveLastResponse: CognitiveResponse | null;
  cognitiveModelInfo: ModelInfo | null;

  // Qwen generative model — separate lifecycle from the MiniLM classifier.
  // status mirrors the engine's internal state machine. `partialArbiterText`
  // is the streaming buffer the UI tail-renders while a generation is in
  // flight; `isGenerating` gates against overlapping generation calls.
  qwenStatus: QwenStatus | 'skipped';
  qwenFraction: number;
  qwenError: string | null;
  qwenModelId: string;
  partialArbiterText: string | null;
  isGenerating: boolean;
  /** Count of cardinal travel steps since the last wasteland
   *  encounter fired. stepDirection increments this every step;
   *  pickWastelandEncounter resets to 0 when an encounter lands.
   *  Tuned with a 3-step minimum gate so the world doesn't roll on
   *  every footstep. Transient. */
  wastelandStepsSinceEncounter: number;
  /** Last noun the player named in an action — used by the soft
   *  Arbiter fallback so "is there anything inside?" can reference
   *  the locket/wreck/etc. the player was working with, instead of
   *  pulling a random unrelated inventory item. */
  lastInteractedNoun: string | null;
  /** When the app boots on a different OTA bundle than the one
   *  recorded in AsyncStorage, this holds the PREVIOUS build id.
   *  TitleScreen reads it and surfaces a one-shot "Updated" modal
   *  so a sudden auto-reload doesn't look like a crash. Set by
   *  hydrate; cleared by dismissJustUpdated. */
  justUpdatedFromBuild: string | null;
  dismissJustUpdated: () => void;
  /** Set when the silent boot-time OTA check downloaded an update
   *  but did NOT apply it (auto-applying mid-boot crashes the
   *  process — native modules from the old session are still
   *  releasing while the new JS bundle tries to init). TitleScreen
   *  surfaces a banner offering to apply the update on the player's
   *  tap; that path tears down cleanly before reloadAsync. */
  pendingOTAUpdate: boolean;
  clearPendingOTAUpdate: () => void;
  /** Add a collectable story-fragment id to the player's set. Silent
   *  no-op if the fragment is unknown OR already owned. Safe to call
   *  from any loot path. Logs a reward line on first acquisition.
   *  See app/engine/collectables.ts for the fragment catalog. */
  grantCollectableFragment: (fragmentId: string) => void;
  /** Pre-fill text staged by ActionReferenceScreen (or any other
   *  helper screen) for the next mount of InputBox on the exploration
   *  screen. InputBox reads this once on mount + on changes, drops
   *  it into the TextInput, and consumes it via consumeInputDraft.
   *  Lets the player tap a help-card example like "ask about the"
   *  and have it appear in the input box ready to finish typing. */
  pendingInputDraft: string | null;
  queueInputDraft: (text: string) => void;
  consumeInputDraft: () => string | null;

  hydrate: () => Promise<void>;
  setScreen: (screen: ScreenName) => void;

  refreshSlots: () => Promise<void>;
  loadSlotIntoGame: (slotId: string) => Promise<void>;
  clearSlotLoadError: () => void;
  /** Tutorial controls — called by the overlay component. */
  startTutorial: () => void;
  advanceTutorial: () => void;
  skipTutorial: () => void;
  deleteSlotById: (slotId: string) => Promise<void>;
  resurrectSlot: (slotId: string) => Promise<boolean>;

  startNewGame: (input: CreateCharacterInput) => Promise<void>;
  abandonGame: () => Promise<void>;
  saveAndExitToTitle: () => Promise<void>;

  appendLog: (channel: LogChannel, text: string, meta?: Record<string, unknown>) => void;

  beginScene: (opts?: {
    openingPrefix?: string;
    microMicroId?: string;
    isOpening?: boolean;
    skipHubEntry?: boolean;
    /** Set by travelTo when the player just crossed a location boundary.
     *  Drives a single consolidated arrival flavor line in place of the
     *  multi-paragraph default scene narration, per playtest spec:
     *  "You've left the flats and have fully entered the endless stairs.
     *  No one has ever made it to the bottom. It's dusk and you see
     *  nobody around. The stairs go down…" — one paragraph synthesising
     *  departure + lore beat + time of day + presence + bearings. */
    arrivalFromName?: string;
  }) => void;
  /**
   * Submit a player action through the parse → dispatch pipeline.
   *
   * The optional `_opts.skipPreChecks` is set internally by the LLM
   * parse-fallback path when it re-submits a canonical "verb noun"
   * rephrasing — it suppresses the meta-comment guard and the second
   * status-effect tick so one player input still equals one game beat,
   * even when the dictionary parser only resolves it on the second
   * pass. External callers should never set this.
   */
  submitPlayerAction: (text: string, _opts?: { skipPreChecks?: boolean }) => void;
  resolveRollStep: (values: number[]) => void;
  cancelPendingRolls: () => void;
  concludeRolls: (steps: RollStep[], actionText: string) => void;
  travelTo: (locationId: string) => void;
  generateNewQuest: () => Quest;
  resolveEnemyDefeat: () => void;
  rest: () => void;
  buyFromVendor: (itemName: string) => void;
  sellToVendor: (itemName: string) => void;
  giftToVendor: (itemName: string) => void;
  stealFromVendor: (itemName: string) => void;
  repairWithVendor: (itemName: string) => void;
  acceptFactionQuest: (titleOrId: string) => void;
  turnInFactionQuest: (titleOrId: string) => void;
  acceptHunt: (titleOrId: string) => void;
  advanceHunt: (huntId: string) => void;
  turnInHunt: (titleOrId: string) => void;
  acceptMystery: (titleOrId: string) => void;
  advanceMystery: (mysteryId: string) => void;
  turnInMystery: (titleOrId: string) => void;
  acceptStoryline: (titleOrId: string) => void;
  advanceStoryline: (storylineId: string) => void;
  turnInStoryline: (titleOrId: string) => void;
  digHere: () => void;
  stepDirection: (dir: Direction) => void;
  setActiveEnemyIdx: (idx: number) => void;
  /** Craft a specific recipe directly (used by the CraftingScreen list). */
  craftRecipe: (recipeName: string) => void;
  dismissVendor: () => void;
  joinFaction: (factionId: string) => void;
  equipItem: (itemName: string, slot: EquipSlot) => void;
  unequipSlot: (slot: EquipSlot) => void;
  /** Drop one of the named item from the player's inventory onto the
   *  ground of the current room (worldMemory.visitedRooms[key].droppedItems).
   *  Mirrors the typed 'drop X' verb so InventoryScreen taps can
   *  invoke it without going through the parser. Refuses equipped items
   *  with an Arbiter line. */
  dropInventoryItem: (itemName: string) => void;
  /** Use the named item. Consumables call through the eat path (HP
   *  recovery + time advance). Anything else equips into the off-hand
   *  slot per playtest feedback ("to use it, it needs to replace the
   *  item in your offhand"). */
  useInventoryItem: (itemName: string) => void;
  /** Disassemble a built item (weapon / armor / relic / built gear)
   *  into stock materials via scrapEngine. Refuses raw materials. */
  scrapInventoryItem: (itemName: string) => void;

  bootCognitive: () => Promise<void>;
  shutdownCognitive: () => Promise<void>;
  resumeCognitive: () => Promise<void>;

  bootQwen: () => Promise<void>;
  shutdownQwen: () => Promise<void>;
  /** Discards the in-flight Arbiter generation buffer. The model keeps
   *  running but its output will be dropped on the floor instead of appended
   *  to the log. Used when a new player action arrives mid-stream. */
  cancelGeneration: () => void;

  persist: () => Promise<void>;
}

const MAX_LOG_IN_MEMORY = 500;

export const useGameStore = create<GameStore>((set, get) => ({
  player: null,
  worldMemory: emptyMemory(),
  gameLog: [],
  currentScreen: 'title',
  currentScene: null,
  pendingRolls: null,
  hydrated: false,
  slotLoadError: null,
  tutorialStep: null,
  tutorialDemoVendor: null,

  slots: [],
  activeSlotId: null,
  resurrectionGems: 0,

  cognitiveStatus: 'idle',
  cognitiveFraction: 0,
  cognitiveError: null,
  cognitiveLastResponse: null,
  wastelandStepsSinceEncounter: 0,
  lastInteractedNoun: null,
  justUpdatedFromBuild: null,
  pendingOTAUpdate: false,
  pendingInputDraft: null,
  cognitiveModelInfo: null,

  qwenStatus: 'idle',
  qwenFraction: 0,
  qwenError: null,
  qwenModelId: qwen.getModelId(),
  partialArbiterText: null,
  isGenerating: false,

  async hydrate() {
    // One-shot migration from the v1 single-slot save, if present.
    await migrateLegacySlotIfPresent();
    const activeId = await loadActiveSlotId();
    const slots = await listSlots();
    const stash = await loadGlobalStash();
    // Wire STT diagnostics into the game log so the next playtest log
    // includes a full trace of what the mic is actually doing — start,
    // speechstart, audiostart, result, error code, end. Without this,
    // STT can fail silently in half a dozen ways and the player sees
    // nothing on screen.
    try {
      // Lazy require so a build without the STT module never trips here.
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const stt = require('../voice/STTManager');
      if (typeof stt.setSTTDiag === 'function') {
        stt.setSTTDiag((channel: 'system' | 'debug', line: string) => {
          try { get().appendLog(channel, line); } catch { /* ignore */ }
        });
      }
    } catch { /* STT module not present — fine. */ }
    // Item-defaults inference flag. The engine falls back to
    // synthesized stats whenever an inventory item has no catalog
    // row (Mud-Rend Blade, Aetheric Locket, Golemstone Stabilizer,
    // etc.). Each unique inferred item name fires ONE debug-channel
    // log line so a future log capture can drive catalog backfill.
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const itemDefaults = require('../engine/itemDefaults');
      if (typeof itemDefaults.setOnInferred === 'function') {
        itemDefaults.setOnInferred((label: string) => {
          try { get().appendLog('debug', `inferred-stats: ${label} — engine guessed stats; add catalog row when convenient.`); } catch { /* ignore */ }
        });
      }
    } catch { /* ignore — module is small + always present */ }
    // Just-updated detection. checkAndApplyOTA → Updates.reloadAsync
    // can yank the app to a new bundle mid-stride and reading the
    // result feels like a crash. Compare current OTA_BUILD_ID against
    // the value stored last time we hydrated; if different (and a
    // value was stored — fresh installs skip), surface the previous
    // build via justUpdatedFromBuild and TitleScreen pops a one-shot
    // modal explaining the system was just updated.
    let justUpdatedFromBuild: string | null = null;
    try {
      const LAST_BUILD_KEY = 'tartaria.lastSeenOTA.v1';
      const lastSeen = await AsyncStorage.getItem(LAST_BUILD_KEY);
      if (lastSeen && lastSeen !== OTA_BUILD_ID) {
        justUpdatedFromBuild = lastSeen;
      }
      await AsyncStorage.setItem(LAST_BUILD_KEY, OTA_BUILD_ID);
    } catch { /* AsyncStorage hiccup — silently skip the popup. */ }
    // ALWAYS land on the title screen at app launch, regardless of what
    // currentScreen the active slot was last saved at. Tapping a character
    // in the slot list is one tap away — but the player chooses, not the
    // last session.
    set({
      slots,
      activeSlotId: activeId,
      resurrectionGems: stash.resurrectionGems,
      currentScreen: 'title',
      hydrated: true,
      justUpdatedFromBuild,
    });
  },

  dismissJustUpdated() {
    set({ justUpdatedFromBuild: null });
  },

  clearPendingOTAUpdate() {
    set({ pendingOTAUpdate: false });
  },

  grantCollectableFragment(fragmentId) {
    const player = get().player;
    if (!player) return;
    const frag = findFragmentById(fragmentId);
    if (!frag) return;
    const owned = player.collectables ?? [];
    if (owned.includes(fragmentId)) return;
    const story = findStoryByFragmentId(fragmentId);
    set((s) =>
      s.player
        ? {
            player: {
              ...s.player,
              collectables: [...(s.player.collectables ?? []), fragmentId],
            },
          }
        : s,
    );
    const storyLabel = story ? story.characterName : 'an unknown hand';
    get().appendLog(
      'reward',
      `✦ Found ${frag.title} — ${storyLabel}. (open Contracts → Collectibles to read)`,
    );
    void get().persist();
  },

  queueInputDraft(text) {
    set({ pendingInputDraft: text });
  },

  consumeInputDraft() {
    const draft = get().pendingInputDraft;
    if (draft !== null) set({ pendingInputDraft: null });
    return draft;
  },

  async refreshSlots() {
    const slots = await listSlots();
    set({ slots });
  },

  async loadSlotIntoGame(slotId) {
    set({ slotLoadError: null });
    let saved;
    try {
      saved = await loadSlot(slotId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      set({ slotLoadError: `Failed to read save: ${msg}` });
      return;
    }
    if (!saved) {
      set({ slotLoadError: 'No save data found for this character. The slot index may be out of sync with storage.' });
      return;
    }
    if (!saved.player) {
      set({ slotLoadError: 'Save file is missing the character record. Try a refresh, or delete the slot to clear it.' });
      return;
    }
    if (saved.player.dead === true) return; // Dead characters need a Resurrection Gem first.
    try {
      await setActiveSlot(slotId);
      const player = backfillPlayer(saved.player);
      // If the save captured the live scene (v1+ saves do, older saves
      // may not), drop the player back into it exactly as it was — no
      // Arbiter rehash, no fresh weather roll, no re-spawned enemies.
      // Resume is player-first: they take the next action.
      const restoredScene = (saved.currentScene ?? null) as CurrentScene | null;
      // Refresh ambientNouns from the canonical source. Prefer the
      // authored location.interactables list when present; fall back
      // to extractAmbientNouns(description) otherwise. Older saves
      // captured polluted noun lists that would otherwise resurface
      // as Search / Approach chips until beginScene fired again.
      if (restoredScene?.location) {
        const loc = restoredScene.location;
        restoredScene.ambientNouns = (loc.interactables && loc.interactables.length > 0)
          ? [...loc.interactables]
          : extractAmbientNouns(loc.description);
      }
      set({
        player,
        worldMemory: saved.worldMemory,
        gameLog: saved.gameLog,
        currentScreen: 'exploration',
        activeSlotId: slotId,
        currentScene: restoredScene,
        pendingRolls: null,
        wastelandStepsSinceEncounter: 0,
      });
      // Only fall back to beginScene when the save predates scene
      // capture. New saves restore the exact scene above and skip this.
      if (!restoredScene) {
        get().beginScene();
      } else {
        // Drop a small "back to the world" cue so the player can orient
        // without a fresh narration block dominating the feed. Just the
        // location name and a hint that they're resuming.
        get().appendLog(
          'world',
          `You step back into ${restoredScene.location.name}. The world waits for your move.`,
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Roll the active slot back so we don't leave a half-set state.
      // CRITICAL: also clear the in-memory activeSlotId — otherwise the
      // next persist() will write player=null over the slot's storage
      // and corrupt the save we were trying to recover.
      try { await setActiveSlot(null); } catch { /* ignore */ }
      set({
        player: null,
        currentScreen: 'title',
        activeSlotId: null,
        slotLoadError: `Failed to restore character: ${msg}`,
      });
    }
  },

  async resurrectSlot(slotId) {
    if (get().resurrectionGems <= 0) return false;
    const saved = await loadSlot(slotId);
    if (!saved || !saved.player || saved.player.dead !== true) return false;

    // Consume one gem from the install-wide stash first. If the write
    // fails, we abort before mutating the save.
    const remainingGems = await addResurrectionGems(-1);

    const revived: PlayerCharacter = {
      ...backfillPlayer(saved.player),
      dead: false,
      hp: saved.player.hpMax,
      stamina: saved.player.staminaMax ?? saved.player.stamina,
    };
    await saveSlot(slotId, { ...saved, player: revived });
    await setActiveSlot(slotId);
    set({
      player: revived,
      worldMemory: saved.worldMemory,
      gameLog: saved.gameLog,
      currentScreen: 'exploration',
      activeSlotId: slotId,
      resurrectionGems: remainingGems,
      currentScene: null,
      pendingRolls: null,
      wastelandStepsSinceEncounter: 0,
    });
    get().beginScene();
    get().appendLog(
      'reward',
      `✦ Resurrection. ${revived.name} returns to Tartaria, restored. The Aetherstone hums in recognition.`,
    );
    recordMemorableEvent(get, set, {
      kind: 'death_revive',
      text: `returned from death by a Resurrection Gem`,
    });
    await get().refreshSlots();
    return true;
  },

  async deleteSlotById(slotId) {
    await deleteSlot(slotId);
    const slots = await listSlots();
    const activeId = getActiveSlotId();
    set({
      slots,
      activeSlotId: activeId,
      // If we just deleted the currently-loaded character, drop player state too.
      ...(get().activeSlotId === slotId
        ? { player: null, gameLog: [], currentScene: null, pendingRolls: null }
        : {}),
    });
  },

  setScreen(screen) {
    set({ currentScreen: screen });
    void get().persist();
  },

  async startNewGame(input) {
    const player = createCharacter(input);
    const memory = discoverLocation(emptyMemory(), player.currentLocationId);
    // Each new character gets its own save slot; switch the active slot
    // pointer so subsequent persist() writes go to it.
    const slotId = newSlotId();
    await setActiveSlot(slotId);
    set({
      player,
      worldMemory: memory,
      gameLog: [],
      currentScreen: 'exploration',
      currentScene: null,
      pendingRolls: null,
      activeSlotId: slotId,
    });
    // Opening line + player name + weather get woven INTO the scene
    // paragraph rather than printed as their own log entries, so the
    // player sees one flowing intro instead of three stacked statements.
    // The isOpening flag also suppresses vendor spawn, the macro radar,
    // the system Weather effect line, and the random Arbiter intros.
    get().beginScene({ openingPrefix: buildOpening(), isOpening: true });
    await get().persist();
    const slots = await listSlots();
    set({ slots });
    // First-time tutorial — only on brand-new characters. Persists once
    // (hasSeenIntro) so it never reruns on load.
    if (!player.hasSeenIntro) {
      get().startTutorial();
    }
  },

  async abandonGame() {
    // "Abandon" deletes the active slot entirely — keeps the slot list
    // clean. Use saveAndExitToTitle() if you want to keep the character.
    const activeId = get().activeSlotId;
    if (activeId) {
      await deleteSlot(activeId);
    }
    const slots = await listSlots();
    set({
      player: null,
      worldMemory: emptyMemory(),
      gameLog: [],
      currentScene: null,
      pendingRolls: null,
      currentScreen: 'title',
      activeSlotId: null,
      slots,
    });
  },

  appendLog(channel, text, meta) {
    const entry = makeEntry(channel, text, meta);
    void persistEntry(entry);
    // Duplicate-chatter suppression. If the Arbiter just spoke the same
    // line within the last 16 entries, swallow the repeat. Was producing
    // "I'd place that at a Hard, if I had to guess." twice in 30 seconds
    // in the playtest log. Widened from 8 to 16 to catch the slower
    // duplicate-Arbiter cases like the same combat-flavor line firing
    // across two rounds of player-vs-monster turns.
    //
    // Callers can pass meta.skipDedup = true to force the line through —
    // direct-response Arbiter lines (bearings, concept answers, range
    // refusals) must always reach the player, even on repeat queries.
    if (channel === 'arbiter' && !meta?.skipDedup) {
      const recent = get().gameLog.slice(-16);
      for (const prev of recent) {
        if (prev.channel === 'arbiter' && prev.text === text) {
          // Log the suppression so a "nothing happened" playtest report
          // can be traced back to dedup eating the line.
          void persistEntry(makeEntry('debug', `dedup: suppressed arbiter repeat — "${text.slice(0, 60)}${text.length > 60 ? '…' : ''}"`));
          return;
        }
      }
    }
    // World channel: dedup bracket-prefixed banner lines (radar / direction
    // summaries / scene labels). Playtest log printed the same
    // "[Endless Stair] north: Nimari (2 days' travel)..." twice within 65
    // seconds with nothing in between to justify a repeat.
    if (channel === 'world' && text.startsWith('[')) {
      const recent = get().gameLog.slice(-8);
      for (const prev of recent) {
        if (prev.channel === 'world' && prev.text === text) {
          void persistEntry(makeEntry('debug', `dedup: suppressed banner repeat — "${text.slice(0, 60)}${text.length > 60 ? '…' : ''}"`));
          return;
        }
      }
    }
    set((state) => {
      const nextLog = [...state.gameLog, entry].slice(-MAX_LOG_IN_MEMORY);
      // HANDOFF #4 — same-channel debounce. When two `world` entries land
      // within 500ms (typical: dig outcome + hook callback firing in the
      // same handler), merge the second into the first so the feed reads
      // as one continuous beat instead of a stutter. Only world+system,
      // never arbiter (has dedup) or combat (one beat per d20) or reward
      // (player-positive notifications stay distinct).
      const lastEntry = state.gameLog[state.gameLog.length - 1];
      const canMerge =
        lastEntry &&
        lastEntry.channel === channel &&
        (channel === 'world' || channel === 'system') &&
        entry.ts - lastEntry.ts < 500 &&
        // Don't merge time-passed markers — they're discrete clock beats.
        !text.startsWith('⏳') &&
        !lastEntry.text.startsWith('⏳');
      if (canMerge) {
        const merged = { ...lastEntry, text: `${lastEntry.text}  ${text}`, ts: entry.ts };
        const mergedLog = [...state.gameLog.slice(0, -1), merged].slice(-MAX_LOG_IN_MEMORY);
        // NOTE: previously this branch extracted ambient nouns from
        // the merged text and pushed them into scene.ambientNouns.
        // Playtest report: the search modal's in-scene chips started
        // showing verbs and abstract nouns pulled out of Arbiter
        // refusal prose. Auto-extraction is gone. Authored
        // Location.interactables (Phase 2) is the canonical source
        // for the noun pool; extractAmbientNouns() is the fallback
        // for content without an authored list. Hook plants push
        // nouns via Hook.nouns explicitly.
        return { gameLog: mergedLog };
      }
      // NOTE: previously this extracted ambient nouns from every
      // world-channel log entry to fold into the scene's noun pool.
      // Same failure mode as above — disabled. Authored
      // Location.interactables / HubRoom.interactables /
      // MicroMicroLocation.interactables (Phase 2) is canonical;
      // extractAmbientNouns() is the fallback only.
      return { gameLog: nextLog };
    });
  },

  beginScene(opts?: {
    openingPrefix?: string;
    microMicroId?: string;
    isOpening?: boolean;
    skipHubEntry?: boolean;
    arrivalFromName?: string;
  }) {
    const { player, worldMemory } = get();
    if (!player) return;
    const location = getLocationById(player.currentLocationId);
    const weather = pickWeather(worldMemory);
    const hazard = pickHazardForLocation(location);
    // HANDOFF #15b — hub mode. When player is at the hub location AND
    // has a hubRoomId set (or default to entry), render the hub room
    // instead of the procedural scene. Disables encounters; pulls
    // vendor from the room's anchorNpc. Player is in their camp.
    const inHub = isHubLocation(location.id);
    let hubRoomId = player.hubRoomId ?? null;
    // Skip auto-entry when the caller is intentionally leaving the
    // hub. Without this flag, "leave outpost" would clear hubRoomId
    // then immediately re-enter the gate on the very next beginScene
    // call (the player's currentLocationId is still the hub's macro
    // location). QA sim caught this — `leave outpost` printed the
    // exit narration but the player stayed locked in the hub graph.
    if (inHub && !hubRoomId && !opts?.skipHubEntry) {
      hubRoomId = hubEntryRoomId();
      set((s) => (s.player ? { player: { ...s.player, hubRoomId } } : s));
    }
    const hubRoom = inHub && hubRoomId ? findHubRoom(hubRoomId) : null;
    if (!inHub && hubRoomId) {
      // Player left the hub — clear the hubRoomId.
      set((s) => (s.player ? { player: { ...s.player, hubRoomId: null } } : s));
    }
    // Resolve the Micro-Micro EARLY so encounter and loot rolls can use
    // the room's curated pools from worldLadder.json. Caller can pre-pick
    // (exit-follow path); otherwise we sample a random Micro-Micro from
    // the location's parent Macro biome.
    // In HUB mode, skip ladder resolution entirely — the hub room is
    // ground truth for description + exits, and the procedural ladder
    // would print a competing "Exits from this room" line.
    let microMicroId: string | null = null;
    if (!hubRoom) {
      if (opts?.microMicroId) {
        const resolved = findMicroMicroAnywhere(opts.microMicroId);
        if (resolved) microMicroId = resolved.microMicro.id;
      }
      if (!microMicroId) {
        const macroId = LOCATION_TO_MACRO[location.id];
        if (macroId) {
          const triple = pickRandomMicroMicroIn(macroId);
          if (triple) microMicroId = triple.microMicro.id;
        }
      }
    }
    const ladderTriple = microMicroId ? findMicroMicroAnywhere(microMicroId) : null;
    // Combat cooldown — after a fight resolves, give the player at least
    // 2 scenes of peace to dig / search / wander. Skip the encounter roll
    // entirely during the cooldown window.
    const peaceCounter = worldMemory.scenesSinceCombat ?? 99;
    const enforcePeace = peaceCounter < 2;
    // HANDOFF #15 — recent-clearance respawn suppression. If the player
    // is re-entering a room they cleared within the last 6 in-game
    // hours, skip the encounter roll. Older clearances (rooms you left
    // long ago) repopulate normally — Tartaria doesn't stay quiet
    // forever. Pulls from the visitedRooms MapGraph + player.hoursElapsed.
    const RESPAWN_QUIET_HOURS = 6;
    const candidateKey = makeRoomKey(player.currentLocationId, microMicroId, player.mapX, player.mapY);
    const priorVisit = worldMemory.visitedRooms?.[candidateKey];
    const hoursElapsed = player.hoursElapsed ?? 0;
    // Prefer the in-game hour delta when available so idling in real
    // time doesn't accidentally clear the respawn cooldown. Fall back
    // to the wall-clock heuristic for legacy saves that pre-date the
    // hoursElapsedAtVisit field.
    const hoursSinceLastVisit = priorVisit
      ? (typeof priorVisit.hoursElapsedAtVisit === 'number'
          ? hoursElapsed - priorVisit.hoursElapsedAtVisit
          : (Date.now() - priorVisit.lastVisitAt) / (1000 * 60 * 60))
      : Infinity;
    const recentlyCleared =
      !!priorVisit &&
      (priorVisit.enemiesCleared?.length ?? 0) > 0 &&
      hoursSinceLastVisit < RESPAWN_QUIET_HOURS;
    // Hub is universally peaceful — never roll encounters here.
    const suppressEncounter = enforcePeace || recentlyCleared || !!hubRoom;
    // Phase 4 §4.3 — biome-curated encounter pools. If the Micro-Micro
    // has a possibleEncounters list, pick rarity-weighted from THAT pool
    // (so the Buried Skyscraper Upper only spawns Aetherbats, Reclaimer
    // Ambushers, etc., not random global enemies). Falls back to the
    // legacy global roll when no ladder or when the curated pool returns
    // nothing (data drift safety).
    let encounter: Enemy[] = [];
    if (!suppressEncounter) {
      if (ladderTriple && chance(40 + location.danger * 8)) {
        const curated = pickEncounterFromLadder(ladderTriple);
        if (curated) encounter = [curated];
      }
      if (encounter.length === 0) {
        encounter = rollEncounter(location);
      }
    }
    const enemies: Enemy[] = encounter;
    const enemyHps: number[] = enemies.map((e) => e.hp);
    const activeEnemyIdx = 0;
    const hasEnemies = enemies.length > 0;
    // Vendor only appears in peaceful scenes. ~22% chance.
    // Hub mode: the anchor NPC for the current room takes the vendor
    // slot when one is defined. Deterministic — Halem at the gate is
    // always Halem, every visit.
    // Opening scene (brand-new character): no vendor. The first roll is
    // for the player to land in the world cleanly — vendors arrive on
    // the next scene or on travel.
    const vendor: VendorInstance | null = opts?.isOpening
      ? null
      : hubRoom && hubRoom.anchorNpc
        ? (findVendorByName(hubRoom.anchorNpc) ?? null)
        : (!hasEnemies && Math.random() < 0.22 ? pickRandomVendor() : null);
    // Enemies start at 'close' range — close enough to be a problem but not
    // already swinging. Players have to advance (or be charged) to land
    // melee, retreat to set up ranged shots.
    const range: CombatRange | null = hasEnemies ? 'close' : null;
    // Hooks — pending cross-scene chains land first; otherwise no hook is
    // planted at scene start. Wandering / exploration plants fresh hooks.
    const initialHooks: Hook[] = [];
    // Expire chains that have sat unused for too long. The QA pass
    // flagged that combat-heavy biomes stranded chains forever
    // because they only fire on peaceful scenes — chains with no
    // exit window kept stacking. 48 in-game hours is generous: a
    // narrative thread that hasn't found a quiet scene in two days
    // can be safely dropped.
    const playerHours = get().player?.hoursElapsed ?? 0;
    const STALE_CHAIN_HOURS = 48;
    const liveChains = (worldMemory.pendingChains ?? []).filter((c) => {
      // Chains without a plantedAtHour are pre-fix saves; treat as
      // fresh so we don't drop them silently on load.
      if (typeof c.plantedAtHour !== 'number') return true;
      return playerHours - c.plantedAtHour <= STALE_CHAIN_HOURS;
    });
    const expiredChainIds = (worldMemory.pendingChains ?? [])
      .filter((c) => !liveChains.includes(c))
      .map((c) => c.chainId);
    const pendingChains = liveChains;
    const consumedChainIds: string[] = [];
    if (pendingChains.length > 0 && !hasEnemies) {
      const next = pendingChains[0]!;
      const h = plantHookByKind(next.kind as Hook['kind'], next.chainId);
      initialHooks.push(h);
      consumedChainIds.push(next.chainId);
    }
    // Source the scene's interactable nouns. Preference order:
    //   1. Hand-authored `interactables` arrays on the location and
    //      (when in hub mode) the hub room. These are the canonical
    //      lists — every entry is a concrete noun the room actually
    //      contains, vetted by hand.
    //   2. Heuristic extraction from the description. Only fires when
    //      the authored list is missing — keeps procedural / future
    //      content working without forcing every new room author to
    //      remember the field. Kept tight via the verb / abstraction
    //      blocklist in ambientNouns.ts.
    //
    // The Search / Approach modal chips pull from this list (via
    // buildChipPool in ExplorationScreen) so authoring this field
    // directly controls what targets the player sees as one-tap
    // buttons. Phase 2 of the parser-treadmill cleanup: stop chasing
    // every abstract-noun false-positive the extractor surfaces and
    // just write down what the room contains.
    const locNouns = (location.interactables && location.interactables.length > 0)
      ? location.interactables
      : extractAmbientNouns(location.description);
    const hubNouns = hubRoom
      ? (hubRoom.interactables && hubRoom.interactables.length > 0
          ? hubRoom.interactables
          : extractAmbientNouns(hubRoom.description))
      : [];
    // Micro-Micro sub-room interactables — same author-declared
    // preference. When the player is in a specific sub-room
    // (skyscraper upper floor, royal vaults, dispatch board, etc.)
    // we merge its declared interactables into the chip pool so
    // search / approach surfaces what's actually in front of them
    // instead of just the macro-tier nouns.
    const microMicroNouns = ladderTriple?.microMicro
      ? ((ladderTriple.microMicro.interactables && ladderTriple.microMicro.interactables.length > 0)
          ? ladderTriple.microMicro.interactables
          : extractAmbientNouns(ladderTriple.microMicro.environmental_description))
      : [];
    const ambientNouns = Array.from(new Set([...locNouns, ...hubNouns, ...microMicroNouns]));
    // Lock the visible subset for THIS scene visit. Look-around and
    // the chip pool (Search/Approach/Salvage) both read from this
    // cache, so five consecutive looks at the same room show the
    // same nouns. Travel away + return fires beginScene again,
    // re-rolling a fresh subset — the "leave and come back to see
    // different things" model the player asked for. Cap at 10 to
    // fit the chip-pool ceiling; look-around takes the first 8.
    const displayedAmbientNouns = ambientNouns.length <= 10
      ? [...ambientNouns]
      : shuffleSlice(ambientNouns, 10);
    // microMicroId was resolved at the top of beginScene so the
    // encounter / loot rolls could use the ladder's curated pools.
    const scene: CurrentScene = {
      weather, location, hazard, enemies, enemyHps, activeEnemyIdx,
      vendor, range, hooks: initialHooks, ambientNouns, displayedAmbientNouns, microMicroId,
      enemyAmbushUsed: enemies.map(() => false),
    };
    // Vendor voice pool — lifecycle hooks on scene transitions.
    // When this scene introduces a new vendor, warm their Kokoro
    // voice in the background so the model graph is ready by the
    // time their first dialogue line lands (typically ~1 second
    // later). When the previous scene HAD a vendor and the new one
    // doesn't (or has a different vendor), evict the prior vendor's
    // slot. Net result: only the Arbiter + at most ONE vendor voice
    // is loaded at any moment (~200 MB peak), but every distinct
    // vendor the player meets gets their own voice on demand.
    //
    // Wrapped in a try / void so an executorch hiccup never blocks
    // scene setup. ONLY fires when the bundled (Kokoro) engine is
    // active — audit caught that system-engine players were paying
    // a ~100 MB Kokoro download the first time they walked past a
    // vendor because the lifecycle hooks ran unconditionally.
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const voiceSettings = require('../voice/voiceSettings');
      const engine = voiceSettings.getVoiceSettings?.().engine;
      if (engine === 'bundled') {
        const prevVendorVoice = get().currentScene?.vendor?.voiceId ?? null;
        const nextVendorVoice = vendor?.voiceId ?? null;
        if (prevVendorVoice && prevVendorVoice !== nextVendorVoice) {
          try {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const piper = require('../voice/PiperTTSManager');
            if (typeof piper.disposeVoice === 'function') piper.disposeVoice(prevVendorVoice);
          } catch { /* PiperTTSManager may not be loaded in tests */ }
        }
        if (nextVendorVoice) {
          try {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const piper = require('../voice/PiperTTSManager');
            if (typeof piper.warmVoice === 'function') void piper.warmVoice(nextVendorVoice);
          } catch { /* same */ }
        }
      }
    } catch { /* voice modules not present in tests */ }
    set({ currentScene: scene, pendingRolls: null });
    const dropIds = [...consumedChainIds, ...expiredChainIds];
    if (dropIds.length > 0) {
      set((s) => ({
        worldMemory: {
          ...s.worldMemory,
          pendingChains: (s.worldMemory.pendingChains ?? []).filter((c) => !dropIds.includes(c.chainId)),
        },
      }));
    }
    // For narration, use the first enemy as the scene representative.
    // The full group is surfaced via the EnemyPanel + a follow-up line
    // when it's actually a pack.
    const sceneEnemy = enemies[0] ?? null;
    // When an opening prefix is supplied (new-game intro), weave it into
    // the scene paragraph so the player sees ONE flowing line instead of
    // a stack of three separate log entries. We collapse the paragraph
    // breaks inside the scene text so it reads like prose.
    // Hub mode overrides the procedural scene with the room's authored
    // description, plus a header line that identifies the room and the
    // hub it belongs to. The procedural buildScene() ignores hub mode
    // entirely — its location-pool prose doesn't apply when you're
    // standing inside a hand-authored room.
    const sceneText = hubRoom
      ? `${HUB.hubName} — ${hubRoom.name}. ${hubRoom.description}`
      : buildScene({ weather, location, hazard, enemy: sceneEnemy, quest: player.activeQuests[0] });
    // Opening scene — emit a three-paragraph introduction narrative as
    // SEPARATE log entries so AdventureFeed renders real paragraph
    // breaks between them:
    //   P1. Character framing (name + race + faction + buried-world arc)
    //   P2. Setting (hub room or procedural location description)
    //   P3. Atmosphere (Arbiter line + weather pressure + agency cue)
    // The Paths: line below stays as its own utility entry.
    if (opts?.isOpening) {
      const raceName = getRaces().find((r) => r.id === player.raceId)?.name ?? 'Unknown';
      const factionName = getFactions().find((f) => f.id === player.factionId)?.name ?? 'no banner';
      const [p1, p2, p3] = buildOpeningNarrative({
        playerName: player.name,
        raceName,
        factionName,
        weather,
        weatherDescriptor: describeWeatherStatModifiers(weather),
        location,
        hubRoomName: hubRoom?.name ?? null,
        hubRoomDescription: hubRoom?.description ?? null,
        hubName: HUB.hubName,
      });
      get().appendLog('world', p1);
      get().appendLog('world', p2);
      get().appendLog('world', p3);
    } else if (opts?.openingPrefix) {
      const final = `${opts.openingPrefix.trim()} ${sceneText.replace(/\n\n+/g, ' ')}`;
      get().appendLog('world', final);
    } else if (opts?.arrivalFromName) {
      // Consolidated arrival flavor — one paragraph that synthesises
      // departure + lore beat + time of day + presence + bearings.
      // Replaces the default multi-paragraph sceneText so crossing
      // INTO a new location reads as a single coherent beat instead
      // of 6 lines of layered narration.
      const fromName = opts.arrivalFromName;
      const toName = location.name;
      // Time-of-day phrase from hoursElapsed % 24.
      const hourOfDay = Math.floor((player.hoursElapsed ?? 0) % 24);
      const timePhrase =
        hourOfDay < 5 ? 'pre-dawn dark' :
        hourOfDay < 8 ? 'dawn' :
        hourOfDay < 11 ? 'morning' :
        hourOfDay < 14 ? 'midday' :
        hourOfDay < 17 ? 'afternoon' :
        hourOfDay < 20 ? 'dusk' :
        'night';
      // One lore beat from the location pool. rotatingPick so two
      // arrivals at the same place don't repeat.
      const locPool = (LOCATION_FLAVORS as Record<string, string[]>)[location.id];
      const loreBeat = (locPool && locPool.length > 0)
        ? rotatingPick(locPool, `arrival.lore.${location.id}`)
        : null;
      // Presence read — enemies / vendor / nobody.
      let presenceLine: string;
      if (enemies.length > 0) {
        const groups = new Map<string, number>();
        for (const e of enemies) groups.set(e.name, (groups.get(e.name) ?? 0) + 1);
        const labels = Array.from(groups.entries()).map(([n, c]) => (c > 1 ? `${c} ${n}s` : `a ${n.toLowerCase()}`));
        presenceLine = `${labels.join(' and ')} ${enemies.length === 1 ? 'is' : 'are'} already here.`;
      } else if (vendor) {
        presenceLine = `${vendor.name} is the only soul in sight.`;
      } else {
        presenceLine = `Nobody else is in sight.`;
      }
      // Bearings — neighbour-tile names from the surrounding world map.
      const seed = player.mapSeed ?? `${player.name}|${player.raceId}|${player.factionId}|legacy`;
      const map = generateWorldMap(seed, location.id);
      const survey = surveyAll(map, player.mapX ?? WORLD_MAP_CENTER_X, player.mapY ?? WORLD_MAP_CENTER_Y);
      const directionLines: string[] = [];
      const emptyDirs: string[] = [];
      for (const dir of ['north', 'east', 'south', 'west'] as const) {
        const hit = survey[dir];
        if (hit) directionLines.push(`${dir} leads to ${hit.name}`);
        else emptyDirs.push(dir);
      }
      const bearingsLine =
        directionLines.length > 0
          ? `${directionLines.join('; ')}${emptyDirs.length > 0 ? `. ${emptyDirs.length === 4 ? 'Open ground all around' : 'Nothing named to the ' + emptyDirs.join(' or ')}` : ''}.`
          : `Open ground in every direction.`;
      const arrival =
        `You've left ${fromName} and entered ${toName}. ` +
        (loreBeat ? `${loreBeat} ` : '') +
        `It's ${timePhrase}. ${presenceLine} ` +
        bearingsLine;
      get().appendLog('world', arrival);
    } else {
      get().appendLog('world', sceneText);
    }
    // Track hub-room visits separately from the procedural visitedRooms
    // map so hub-specific UI can read it without scanning roomKeys.
    if (hubRoom) {
      set((s) => {
        const seen = new Set(s.worldMemory.hubVisited ?? []);
        seen.add(hubRoom.id);
        return { worldMemory: { ...s.worldMemory, hubVisited: Array.from(seen) } };
      });
    }
    // HANDOFF #15 — record this room visit in the MapGraph. The key
    // combines macro location + micro-micro id + map coords so two
    // visits to the SAME room get the same key, but two different
    // micro-micros within the same Macro stay distinct.
    const roomKey = candidateKey;
    const prevVisits = get().worldMemory.visitedRooms ?? {};
    const existing = prevVisits[roomKey];
    if (existing) {
      const tag = existing.visitCount >= 5 ? 'many times' : existing.visitCount >= 2 ? 'again' : 'before';
      const clearedNote = recentlyCleared
        ? ` The bodies you left are still here. Nothing has moved in to replace them.`
        : '';
      get().appendLog('world', `You've stood here ${tag}. (visit ${existing.visitCount + 1})${clearedNote}`);
      // Tourist-and-Vandal persistence — surface the room's leftover
      // state from prior visits so the narration reflects what's
      // actually on disk. Dropped items show as a "still on the
      // ground" line; opened containers as a "still open" line.
      if ((existing.droppedItems?.length ?? 0) > 0) {
        const itemList = existing
          .droppedItems!.map((d) => d.quantity > 1 ? `${d.name} x${d.quantity}` : d.name)
          .join(', ');
        get().appendLog('world', `On the ground: ${itemList}. (left here by you, type 'pick up' to retrieve.)`);
      }
      if ((existing.containersOpened?.length ?? 0) > 0) {
        get().appendLog('world', `Still open from before: ${existing.containersOpened!.join(', ')}.`);
      }
    }
    set((s) => ({
      worldMemory: {
        ...s.worldMemory,
        visitedRooms: {
          ...(s.worldMemory.visitedRooms ?? {}),
          [roomKey]: {
            firstVisitAt: existing?.firstVisitAt ?? Date.now(),
            lastVisitAt: Date.now(),
            visitCount: (existing?.visitCount ?? 0) + 1,
            enemiesCleared: existing?.enemiesCleared ?? [],
            lootGrabbed: existing?.lootGrabbed ?? [],
            // Persist the room's "vandal state" across re-entries —
            // dropped items + opened containers carry forward
            // unchanged. The drop / pickup / open handlers mutate
            // these arrays directly when the player acts.
            droppedItems: existing?.droppedItems ?? [],
            containersOpened: existing?.containersOpened ?? [],
            searchedAmbientNouns: existing?.searchedAmbientNouns ?? [],
            hoursElapsedAtVisit: hoursElapsed,
          },
        },
      },
    }));
    // When we're in a Micro-Micro room, surface its named exits on its own
    // line so the player has a deterministic list of things to type
    // ("take the stairwell", "out the broken window"). This is the room-
    // level navigation the macro-tier cardinal radar doesn't cover.
    if (ladderTriple?.microMicro.exits && ladderTriple.microMicro.exits.length > 0) {
      get().appendLog(
        'world',
        `Exits from this room: ${ladderTriple.microMicro.exits.join(' · ')}.`,
      );
    }
    // Hub-mode exits — show the cardinal neighbours by their shortName so
    // the player can type 'go armory' / 'north' interchangeably.
    if (hubRoom) {
      const dirs: Array<{ dir: string; id: string | null }> = [
        { dir: 'north', id: hubRoom.exits.north },
        { dir: 'south', id: hubRoom.exits.south },
        { dir: 'east', id: hubRoom.exits.east },
        { dir: 'west', id: hubRoom.exits.west },
      ];
      const labels = dirs
        .filter((d) => d.id)
        .map((d) => {
          const r = findHubRoom(d.id);
          return r ? `${d.dir} to ${r.shortName}` : null;
        })
        .filter(Boolean) as string[];
      if (labels.length > 0) {
        get().appendLog('world', `Paths: ${labels.join(' · ')}. (Type 'leave outpost' to head into the wilds.)`);
      }
    }
    // Surface the active weather's stat modifiers so the player can see
    // what's pressing on them this scene. Empty for "calm" or weathers
    // without modifiers. Suppressed on the opening scene — the weather
    // description is woven into the opening paragraph instead, so a
    // brand-new player isn't greeted with a mechanical line break.
    const weatherMods = describeWeatherStatModifiers(weather);
    if (weatherMods && !opts?.isOpening) {
      get().appendLog('system', `Weather effect — ${weather.name}: ${weatherMods}`);
    }
    // Phase 4 §3.3 — the "Radar" block. Deterministic compass summary so
    // the player ALWAYS knows where they are and what's in each cardinal
    // direction without needing a compass item or asking the Arbiter.
    // Pulls from the same character-seeded world map the travel system
    // uses, so the directions are consistent across the session.
    // Skipped on the opening scene — the player is being introduced;
    // the macro radar lands on their next move, when context is welcome.
    if (!opts?.isOpening) {
      try {
        const seed = player.mapSeed ?? `${player.name}|${player.raceId}|${player.factionId}|legacy`;
        const map = generateWorldMap(seed, player.currentLocationId);
        const fromX = player.mapX ?? 4;
        const fromY = player.mapY ?? 4;
        const radar = describeAllDirections(map, fromX, fromY);
        get().appendLog('world', `[${location.name}] ${radar}`);
      } catch {
        // best-effort radar — never block the scene on a map-generation hiccup
      }
    }
    if (enemies.length > 1) {
      get().appendLog(
        'combat',
        `${enemies.length} ${enemies[0]!.name}${enemies.length > 1 ? 's' : ''} close on you. Tap the right-side panel to cycle targets.`,
      );
    }
    // Announce any landed chain-hook so the player knows the thread continued.
    for (const h of initialHooks) {
      get().appendLog('world', h.plantedLine);
    }
    if (vendor) {
      // Return-visit gate: when this is an anchor NPC the player has
      // already met in this room, don't re-narrate the dramatic
      // "Hoofbeats on the silt — Irma draws up beside you" arrival on
      // every revisit. Playtest log caught this — Irma kept "arriving"
      // every time the player walked back to the Armory, which broke
      // the room's continuity. First visit gets the full arrival; later
      // visits get a quieter "still here" line. Random non-anchor
      // vendors always get the arrival line (they aren't permanent).
      const isAnchor = !!(hubRoom?.anchorNpc && vendor.name === hubRoom.anchorNpc);
      const isReturnVisit = isAnchor && !!existing && (existing.visitCount ?? 0) >= 1;
      if (isReturnVisit) {
        get().appendLog(
          'world',
          `${vendor.name} is still at their post — pack open, wares laid out. They nod without looking up.`,
        );
      } else {
      // Narrate the arrival in the world channel first — vendors don't
      // appear out of nowhere. The player should see they showed up
      // alongside the rest of the scene paragraph, with their
      // descriptive blurb. Then the Arbiter chimes in.
      const arrivalLines = [
        `A figure crests the rise — ${vendor.name}, ${vendor.title}, pack heavy across the shoulders. They set down to trade.`,
        `${vendor.name} (${vendor.title}) is already here when you arrive, stall half-unpacked. They look up and nod once.`,
        `Hoofbeats on the silt. ${vendor.name} draws up beside you, ${vendor.title}'s mark on the pack. "Trade?" they ask.`,
        `${vendor.name}, ${vendor.title}, sits at a folding table at the edge of the ground, wares laid out neat. They beckon.`,
        `You hear a kettle whistling before you see them. ${vendor.name}, ${vendor.title}, has made camp here.`,
      ];
      get().appendLog('world', pick(arrivalLines));
      get().appendLog(
        'arbiter',
        `The Arbiter inclines their head toward the newcomer. "${vendor.name}, ${vendor.title}. ${vendor.description}"`,
      );
      }
      // Faction vendors may offer a contract the player qualifies for.
      if (vendor.faction) {
        const pool = availableFactionQuests(
          vendor.faction,
          getStanding(player.factionStanding, vendor.faction),
          player.activeFactionQuestIds ?? [],
          player.completedFactionQuestIds ?? [],
        );
        if (pool.length > 0) {
          const q = pool[0]!;
          // Short summary line — playtest feedback: "the arbiter
          // shouldn't read the contracts. he can just say contract
          // accepted." Title + accept verb only; full description
          // lives in the Contracts screen if the player wants it.
          get().appendLog(
            'world',
            `${vendor.name} offers a contract: "${q.title}." (Say 'accept ${acceptKeyword(q.title)}' or open Contracts for details.)`,
          );
        }
        // Active quest with this faction's agent? Hint at the turn-in.
        const turnable = (player.activeFactionQuestIds ?? [])
          .map((id) => findFactionQuestById(id))
          .filter((q): q is NonNullable<typeof q> => !!q && q.factionId === vendor.faction);
        if (turnable.length > 0) {
          const t = turnable[0]!;
          get().appendLog(
            'arbiter',
            `${vendor.name} looks at you sideways. "You still owe us '${t.title}'. Say 'turn in ${t.title.split(' ').slice(0, 2).join(' ').toLowerCase()}' when you're ready."`,
          );
        }
        // Hunt board: post one hunt the vendor's faction has available.
        const huntPool = availableHunts(
          vendor.faction,
          getStanding(player.factionStanding, vendor.faction),
          (player.activeHunts ?? []).map((h) => h.id),
          player.completedHuntIds ?? [],
        );
        if (huntPool.length > 0) {
          const h = huntPool[0]!;
          get().appendLog(
            'world',
            `${vendor.name} points at the bounty board: "${h.title}." (Say 'accept ${acceptKeyword(h.title)}' or open Contracts.)`,
          );
        }
        // Active hunt with this faction's agent? Prompt for turn-in.
        const huntTurnable = (player.activeHunts ?? [])
          .map((rec) => ({ rec, def: findHuntById(rec.id) }))
          .filter(({ def }) => def && def.factionId === vendor.faction)
          .filter(({ rec, def }) => def && rec.stage >= def.stages.length);
        if (huntTurnable.length > 0) {
          const ht = huntTurnable[0]!.def!;
          get().appendLog(
            'arbiter',
            `${vendor.name} eyes the trophy on your belt. "You finished ${ht.title}? Turn it in — say 'turn in ${ht.title.split(' ').slice(1, 4).join(' ').toLowerCase()}'."`,
          );
        }
        // Mystery board.
        const mysteryPool = availableMysteries(
          vendor.faction,
          getStanding(player.factionStanding, vendor.faction),
          (player.activeMysteries ?? []).map((m) => m.id),
          player.completedMysteryIds ?? [],
        );
        if (mysteryPool.length > 0) {
          const m = mysteryPool[0]!;
          get().appendLog(
            'world',
            `${vendor.name} nods at a mystery notice: "${m.title}." (Say 'accept ${acceptKeyword(m.title)}' or open Contracts.)`,
          );
        }
        const mysteryTurnable = (player.activeMysteries ?? [])
          .map((rec) => ({ rec, def: findMysteryById(rec.id) }))
          .filter(({ def }) => def && def.factionId === vendor.faction)
          .filter(({ rec, def }) => def && rec.stage >= def.stages.length);
        if (mysteryTurnable.length > 0) {
          const mt = mysteryTurnable[0]!.def!;
          get().appendLog(
            'arbiter',
            `${vendor.name} eyes your pack. "You finished ${mt.title}? Turn it in — say 'turn in ${mt.title.split(' ').slice(0, 3).join(' ').toLowerCase()}'."`,
          );
        }
        // Storylines — heavyweight multi-step faction work.
        const storyPool = availableStorylines(
          vendor.faction,
          getStanding(player.factionStanding, vendor.faction),
          (player.activeStorylines ?? []).map((s) => s.id),
          player.completedStorylineIds ?? [],
        );
        if (storyPool.length > 0) {
          const s = storyPool[0]!;
          get().appendLog(
            'arbiter',
            `${vendor.name} unrolls a thick scroll. "Long-form work — ${s.title}. ${s.posterText} Say 'accept ${acceptKeyword(s.title)}' to take it."`,
          );
        }
        const storyTurnable = (player.activeStorylines ?? [])
          .map((rec) => ({ rec, def: findStorylineById(rec.id) }))
          .filter(({ def }) => def && def.factionId === vendor.faction)
          .filter(({ rec, def }) => def && rec.stage >= def.stages.length);
        if (storyTurnable.length > 0) {
          const st = storyTurnable[0]!.def!;
          get().appendLog(
            'arbiter',
            `${vendor.name} reads your face. "${st.title} finished? Turn it in — say 'turn in ${st.title.split(' ').slice(0, 3).join(' ').toLowerCase()}'."`,
          );
        }
      }
    }
    // Arbiter gets two voices on scene entry:
    //   1) ~45% chance — a proactive "scene intro" that gestures at what
    //      to do here. This is the Arbiter actively shaping the story
    //      rather than commenting after the fact.
    //   2) ~25% chance — a reactive remark (mood/intent/location pool).
    // Both can fire in rare cases but the intro tends to anchor first.
    // Two-channel Arbiter spawn: a higher-rate proactive scene intro, or a
    // lower-rate reactive remark. With Qwen ready, narrateViaArbiter replaces
    // the template string with an LLM-generated line that respects the
    // current location / inventory / hooks. The template string is still
    // computed eagerly — it carries the line when the model isn't ready.
    const unresolvedHookList = (initialHooks.length > 0 ? initialHooks : [])
      .filter((h) => !h.resolved)
      .map((h) => ({ kind: h.kind, nouns: h.nouns }));
    // Suppress the random Arbiter intros on the opening scene — the
    // openingPrefix already carries an authored Arbiter line; piling
    // another on top creates the "scene built twice" feel the playtest
    // log flagged.
    if (!opts?.isOpening) {
      if (chance(45)) {
        void narrateViaArbiter(
          get,
          set,
          buildArbiterSceneIntro({
            location,
            enemy: sceneEnemy,
            player,
            worldMemory: get().worldMemory,
          }),
          'scene_intro',
        );
      } else if (
        shouldArbiterSpeak({
          hasEnemy: !!sceneEnemy,
          hasUnresolvedHooks: unresolvedHookList.length > 0,
        })
      ) {
        void narrateViaArbiter(
          get,
          set,
          buildArbiterRemark({
            location,
            hazard,
            enemy: sceneEnemy,
            unresolvedHooks: unresolvedHookList,
          }),
          'scene_intro',
        );
      }
    }
    set((s) => {
      const taggedMem = recordTags(
        recordTags(recordTags(s.worldMemory, weather.tags), location.tags),
        hazard?.tags ?? [],
      );
      // Combat cooldown counter — bump every peaceful scene, reset to 0
      // when combat lands so the next 2 scenes are guaranteed peaceful.
      const nextSinceCombat = hasEnemies ? 0 : (taggedMem.scenesSinceCombat ?? 0) + 1;
      return {
        worldMemory: { ...taggedMem, scenesSinceCombat: nextSinceCombat },
      };
    });
    void get().persist();
  },

  submitPlayerAction(text, _opts) {
    const trimmed = text.trim();
    if (!trimmed || get().pendingRolls) return;

    // Meta-comment guard. Playtest log: the player typed a long
    // feedback note — "ok it doesn't realize I left the outpost.
    // also we should have a dismantle/loot button so I can RNG roll
    // for loot once I do something to an item, like how I opened a
    // lockbox and opened the trap" — and the parser found 'dismantle'
    // in the middle of the prose, fired the open intent, and the
    // game responded "You force the loot button can rng roll loot
    // once item like opened lockbox opened trap open." The fix:
    // when the input is long AND contains a conversational marker
    // ("ok ", "we should", "you should", "btw", etc.), don't route
    // through the verb parser — log the note so we can review it
    // later, surface a small Arbiter ack, and bail.
    if (
      !_opts?.skipPreChecks &&
      // Dropped from >100 to >60 chars — playtest log caught a 95-char
      // feature request ("we need to add salvage as a button like
      // search, it should also have a pop-up and pull on nouns.") that
      // sailed past the old length gate. Also added "we need" /
      // "could you" / "it should" / "add a" patterns to the regex.
      trimmed.length > 60 &&
      /^(ok\b|btw\b|fyi\b|hey\b|so\b|when (i|the)\b)|(\b(we|i) ((\w+)\s+)?(should|need|could|gotta|gonna|wish|want|really)\b|\byou should\b|\bi think\b|\bi'?d like\b|\bcan we\b|\bcould you\b|\bshould have\b|\bneeds? to be\b|\bit should (have|be|also)\b|\badd a\b|\bplease add\b)/i.test(trimmed)
    ) {
      get().appendLog('player', trimmed, { meta: true });
      get().appendLog(
        'arbiter',
        `The Arbiter studies you, plainly. "I'm not sure what you're trying to tell me. I'll keep your note in the log either way. If you mean to act, phrase it as a verb — 'search the rubble', 'go east', 'attack the figure'."`,
      );
      get().appendLog('debug', `meta-comment guard: skipped intent parse on ${trimmed.length}-char input`);
      return;
    }

    // A new player action invalidates any in-flight Arbiter generation. The
    // stale stream's tokens would land below the new scene, which feels
    // disjointed. cancelGeneration bumps the epoch so the dropped text is
    // discarded when the model finally returns.
    if (get().isGenerating) get().cancelGeneration();

    const player = get().player;
    if (!player) return;
    if (player.hp <= 0) {
      // Player is dead — the death handler is mid-flight (~3.5s timer
      // before screen transition). Swallow input rather than letting them
      // submit posthumous actions.
      return;
    }
    // Snapshot time-elapsed so we can surface "(took N hours)" at the end
    // of every action. Playtest log: player typed a long question begging
    // for time tracking ("how long does each encounter take? time is
    // important"). The engine has the data — just wasn't logging it.
    const hoursBefore = player.hoursElapsed ?? 0;

    // Tick all active status effects one round. Bleed-style DOTs deal
    // damage, expired effects drop off, and incapacitation (stun / paralyze)
    // wastes the player's action with a narrated line. EVERY player
    // action is one round — playtest report: "I was poisoned at the
    // start of combat (3r) and 20 turns later still poisoned." The
    // previous conditional skipped the state write unless DOT damage
    // landed OR an effect expired OR the array length changed —
    // statuses with no DOT and unchanged length (poisoned 3r → 2r,
    // dodging 2r → 1r) never persisted their decrement, so counters
    // were frozen until the array changed shape. Now: whenever the
    // player has ANY status going in, write the ticked result back.
    // skipPreChecks: the LLM parse-fallback re-submits a canonical
    // rephrasing of the same player input, and we don't want to tick
    // statuses twice for one action. The first pass already ran the
    // tick; the second pass jumps straight to the parser.
    const tick = _opts?.skipPreChecks
      ? { effects: player.statusEffects ?? [], dotDamage: 0, expired: [] as ReturnType<typeof tickEffects>['expired'] }
      : tickEffects(player.statusEffects ?? []);
    if (!_opts?.skipPreChecks && (player.statusEffects?.length ?? 0) > 0) {
      const incapacitated = isIncapacitated(player.statusEffects);
      const newHp = Math.max(0, player.hp - tick.dotDamage);
      set((s) =>
        s.player
          ? { player: { ...s.player, hp: newHp, statusEffects: tick.effects } }
          : s,
      );
      if (tick.dotDamage > 0) {
        get().appendLog('combat', `You bleed for ${tick.dotDamage} damage. (${newHp} HP)`);
      }
      for (const ex of tick.expired) {
        get().appendLog('system', `${ex.label ?? ex.kind} fades.`);
      }
      if (incapacitated) {
        get().appendLog('world', `You cannot move. Your action is lost.`);
        if (newHp <= 0) {
          void Promise.resolve().then(() => handlePlayerDeath(get, set));
        }
        void get().persist();
        return;
      }
      if (newHp <= 0) {
        void Promise.resolve().then(() => handlePlayerDeath(get, set));
        return;
      }
    }

    // Weather pressure — active weather has a chance to chip HP, drain
    // stamina, or notch corruption on every action. Lore makes weather
    // hostile in this world; the math reflects that.
    const wtick = tickWeather(get().currentScene?.weather ?? null, player);
    if (wtick.line) {
      // Rate-limit the weather-tick line: don't print the SAME line if
      // it already appeared within the last 6 log entries. The numeric
      // effect (hp/stam/corruption delta) still applies — only the
      // visible narration is suppressed so the feed doesn't read
      // "The fog whispers your name… The fog whispers your name…"
      // four entries in a row.
      const recent = get().gameLog.slice(-6);
      const recentlyShown = recent.some((e) => e.text === wtick.line);
      let weatherKilled = false;
      set((s) => {
        if (!s.player) return {};
        const newHp = Math.max(0, s.player.hp + wtick.hpDelta);
        const newStam = Math.max(0, Math.min(s.player.staminaMax, s.player.stamina + wtick.staminaDelta));
        // Cap corruption at CORRUPTION_MAX. QA sim showed a player
        // stuck in Whisper Fog accumulated 7868 corruption over 10
        // in-game days — well past the point where any number is
        // meaningful as a gameplay signal. 50 is the design ceiling
        // (matches the threshold at which Aetheric content opens
        // permadeath checks); anything beyond is decorative.
        const newCorr = Math.max(0, Math.min(CORRUPTION_MAX, s.player.corruption + wtick.corruptionDelta));
        weatherKilled = newHp <= 0;
        return { player: { ...s.player, hp: newHp, stamina: newStam, corruption: newCorr } };
      });
      if (!recentlyShown) {
        get().appendLog('world', wtick.line);
      }
      if (weatherKilled) {
        void Promise.resolve().then(() => handlePlayerDeath(get, set));
        return;
      }
    }

    // If the scene was lost (e.g. slot restore on an older save before this
    // fix) auto-recover before bailing — silent no-ops on submit are the
    // worst possible UX for a text RPG.
    if (!get().currentScene) {
      get().beginScene();
    }
    const currentScene = get().currentScene;
    if (!currentScene) return; // give up only if beginScene itself failed

    const parseCtx: ParseContext = {
      inventory: player.inventory,
      recentNouns: collectSceneNouns(currentScene),
      enemyPresent: currentScene.enemies.length > 0,
      currentLocationName: currentScene.location.name,
      enemyNames: [
        ...currentScene.enemies.map((e) => e.name),
        ...currentScene.enemies.flatMap((e) => e.aliases ?? []),
      ],
      hookNouns: (currentScene.hooks ?? [])
        .filter((h) => !h.resolved)
        .flatMap((h) => h.nouns),
      ambientNouns: currentScene.ambientNouns ?? [],
      vendorName: currentScene.vendor?.name,
    };
    const parsed = parseInput(trimmed, parseCtx);
    get().appendLog('player', trimmed, {
      intent: parsed.intent,
      confidence: parsed.confidence,
      resolvedNoun: parsed.resolvedNoun,
    });
    // Diagnostic — what the parser decided. Lands in the on-disk log
    // (LogScreen → COPY ALL) but not the in-game feed. Lets us trace
    // "I typed X and nothing happened" reports without guessing.
    get().appendLog(
      'debug',
      `parser: intent=${parsed.intent} conf=${parsed.confidence.toFixed(2)} verb=${parsed.matchedVerb ?? '-'} target=${parsed.target ?? '-'} resolved=${parsed.resolvedNoun ?? '-'} range=${currentScene.range ?? '-'} enemies=${currentScene.enemies.length} hooks=${currentScene.hooks?.length ?? 0}`,
    );

    // Track the noun the player just named so the soft Arbiter
    // fallback can ground follow-up questions ("is there anything
    // inside?") in the right object instead of pulling a random
    // inventory item. Only update on a confident parse with a target —
    // unknown/low-confidence inputs preserve the previous noun.
    if (parsed.confidence >= 0.5) {
      const noun = parsed.resolvedNoun ?? parsed.target ?? null;
      if (noun && noun.trim().length > 0) {
        set({ lastInteractedNoun: noun.trim() });
      }
    }

    if (parsed.intent === 'unknown' || parsed.confidence < 0.5) {
      // Qwen-backed parse fallback. The dictionary parser missed —
      // before showing the soft refusal, hand the input to Qwen with
      // the scene's noun pool and let it pick an intent + target. If
      // it resolves we re-submit a canonical "verb noun" rephrasing
      // which the dictionary parser CAN handle cleanly, so all the
      // intent dispatch below stays in one place. If Qwen isn't ready
      // or can't resolve, fall through to the existing soft refusal.
      // The skipPreChecks flag suppresses the second status tick on
      // the re-submission so one player action remains one game beat.
      if (qwen.isReady() && !_opts?.skipPreChecks) {
        get().appendLog('debug', `parse-fallback: handing "${trimmed}" to qwen`);
        // Snapshot the parse context once — it's a pure read of the
        // scene and inventory, both of which are stable for the
        // duration of the LLM call.
        const llmCtx = {
          recentNouns: collectSceneNouns(currentScene),
          enemyNames: parseCtx.enemyNames ?? [],
          vendorName: parseCtx.vendorName,
          inventoryNames: player.inventory.map((i) => i.name),
          locationName: currentScene.location.name,
        };
        // Visible "the Arbiter considers" placeholder. Without this
        // the player sits through a 200-400ms silent gap and tends to
        // re-submit the input thinking the game ate it. The resolved
        // action's narration lands AFTER this line and reads naturally
        // — the placeholder ends up being a tiny pause beat that hints
        // the parse was non-trivial. Hidden on re-submission (the
        // canonical rephrasing already went through this once).
        get().appendLog(
          'system',
          'The Arbiter considers your words…',
        );
        void parseInputViaLLM(trimmed, llmCtx, qwen).then((result) => {
          if (!result) {
            get().appendLog('debug', 'parse-fallback: qwen no usable result → soft refusal');
            const lastCog2 = get().cognitiveLastResponse;
            get().appendLog(
              'arbiter',
              buildSoftArbiterFallback({
                parsed,
                inventory: player.inventory,
                enemy: activeEnemy(currentScene),
                location: currentScene.location,
                hazard: currentScene.hazard,
                playerHpFraction: player.hpMax > 0 ? player.hp / player.hpMax : 1,
                mood: lastCog2?.inferredEmotions[0],
                lastInteractedNoun: get().lastInteractedNoun,
                rawText: trimmed,
              }),
            );
            if (parsed.suggestions.length) {
              get().appendLog('system', `Try: ${parsed.suggestions.slice(0, 3).join(' · ')}`);
            }
            void get().persist();
            return;
          }
          get().appendLog(
            'debug',
            `parse-fallback: qwen → intent=${result.intent} target="${result.target}" rephrase="${result.rephrasing}"`,
          );
          // Re-dispatch through the dictionary parser. skipPreChecks
          // prevents meta-guard re-evaluation + status-tick double-fire.
          get().submitPlayerAction(result.rephrasing, { skipPreChecks: true });
        }).catch((err) => {
          get().appendLog('debug', `parse-fallback: threw ${err instanceof Error ? err.message : String(err)}`);
          // Best-effort soft refusal even if the LLM crashed.
          const lastCog3 = get().cognitiveLastResponse;
          get().appendLog(
            'arbiter',
            buildSoftArbiterFallback({
              parsed,
              inventory: player.inventory,
              enemy: activeEnemy(currentScene),
              location: currentScene.location,
              hazard: currentScene.hazard,
              playerHpFraction: player.hpMax > 0 ? player.hp / player.hpMax : 1,
              mood: lastCog3?.inferredEmotions[0],
              lastInteractedNoun: get().lastInteractedNoun,
              rawText: trimmed,
            }),
          );
        });
        return; // async path now owns the rest
      }
      // Qwen not ready (or this is a re-submission already going through
      // the fallback once) — show the soft refusal immediately.
      const lastCog = get().cognitiveLastResponse;
      get().appendLog(
        'arbiter',
        buildSoftArbiterFallback({
          parsed,
          inventory: player.inventory,
          enemy: activeEnemy(currentScene),
          location: currentScene.location,
          hazard: currentScene.hazard,
          playerHpFraction: player.hpMax > 0 ? player.hp / player.hpMax : 1,
          mood: lastCog?.inferredEmotions[0],
          lastInteractedNoun: get().lastInteractedNoun,
          rawText: trimmed,
        }),
      );
      if (parsed.suggestions.length) {
        get().appendLog('system', `Try: ${parsed.suggestions.slice(0, 3).join(' · ')}`);
      }
      void get().persist();
      return;
    }

    // Hook routing: if the player's target noun (or resolved noun) names an
    // active hook in this scene, advance that hook's chain instead of
    // running the generic intent handler. Stealth / investigate / approach /
    // travel verbs are the most common ways to engage a hook; combat verbs
    // intentionally pass through to attack.
    // Verbs that should advance a multi-stage hook when the player names
    // one of its known nouns. Diplomacy added because "talk to the figure"
    // / "call out to them" was hitting the empty-scene refusal even though
    // the figure was a hook NPC mid-chain. Attack stays OUT — committing
    // violence is intentionally distinct from following the thread.
    const hookEligible: Intent[] = [
      'investigate',
      'stealth',
      'travel',
      'use_relic',
      'cast',
      'advance',
      'ask',
      'diplomacy',
      'gift',
      'steal',
    ];
    if (hookEligible.includes(parsed.intent) && currentScene.hooks && currentScene.hooks.length > 0) {
      const targetText = (parsed.resolvedNoun ?? parsed.target ?? trimmed).toLowerCase();
      const hook = matchHookNoun(targetText, currentScene.hooks);
      if (hook && !hook.resolved) {
        get().appendLog('debug', `route: hook intercept (kind=${hook.kind}, target="${targetText}") — original intent=${parsed.intent}`);
        // Small stamina cost for engaging a hook (same as a skill check).
        set({ player: advanceTime(spendStamina(player, STAMINA_COSTS.skillCheck), 0.25) });
        resolveHookOneStep(hook, get, set);
        void get().persist();
        return;
      }
    }

    switch (parsed.intent) {
      case 'attack': {
        const targetEnemy = activeEnemy(currentScene);
        if (targetEnemy) {
          const range = currentScene.range ?? 'close';
          const barehand = isBareHandAttack(trimmed);
          const reach = barehand
            ? { bands: ['arm'] as CombatRange[], label: 'Bare hands' }
            : playerWeaponReach(player);
          get().appendLog(
            'debug',
            `attack: target=${targetEnemy.name} range=${range} reach.bands=[${reach.bands.join(',')}] reach.label=${reach.label} bareHand=${barehand}`,
          );
          if (!reach.bands.includes(range)) {
            // Don't strand the player on a refusal — close the gap (or
            // pull back) automatically and treat THIS turn as the
            // movement. Iron Fog / Silent Blizzard slow the move to two
            // turns each but no longer block entirely, so the auto-move
            // always makes progress.
            const needArm = reach.bands.includes('arm') && range !== 'arm';
            const needRanged = !reach.bands.includes(range) && (reach.bands.includes('close') || reach.bands.includes('far'));
            if (needArm) {
              get().appendLog(
                'arbiter',
                `The Arbiter nods at the distance. "${reach.label} needs arm's reach — closing the gap for you."`,
              );
              runMoveCombatRange(get, set, player, currentScene, 'advance');
              break;
            }
            if (needRanged && range === 'arm') {
              get().appendLog(
                'arbiter',
                `The Arbiter steps back with you. "${reach.label} needs space — pulling you back."`,
              );
              runMoveCombatRange(get, set, player, currentScene, 'retreat');
              break;
            }
            // Last-resort refusal (e.g. a weapon with no bands matching
            // any reachable range) — keep the old message but exempt from
            // dedup so the player sees the diagnosis on every failed try.
            const remedy = range === 'arm'
              ? `type 'retreat' to step back for a ranged shot`
              : `type 'advance' to close in for melee`;
            get().appendLog(
              'arbiter',
              `The Arbiter holds up a hand. "${reach.label} can't reach at ${RANGE_LABEL[range]} range. ${remedy[0]!.toUpperCase()}${remedy.slice(1)}."`,
              { skipDedup: true },
            );
            break;
          }
          set({ player: advanceTime(spendStamina(player, STAMINA_COSTS.attack), 0.1) });
          const visPenalty = weatherAttackPenalty(currentScene.weather);
          if (visPenalty > 0) {
            get().appendLog(
              'arbiter',
              `${currentScene.weather!.name} hangs between you. "−${visPenalty} to the swing — see what you can," the Arbiter says.`,
              { skipDedup: true },
            );
            get().appendLog('debug', `attack: visibility penalty −${visPenalty} (${currentScene.weather!.name})`);
          }
          // Aggregate the player's status-effect modifiers (aim, sprint,
          // surprise, etc.) so the dice prompt and the final attack
          // total honor every action-card buff/penalty the player
          // earned. Ranged attacks get aim bonus, melee don't.
          const isRangedAttack = !barehand && (playerWeaponReach(player).bands.length > 1);
          const statusMods = rollMods(player.statusEffects, isRangedAttack ? 'attack_ranged' : 'attack_melee');
          // Point-blank bonus: ranged weapon at arm's reach is a bonus
          // die on the attack roll (offset by the disarm/melee risk
          // described in the action card).
          const pointBlankBonus = isRangedAttack && range === 'arm';
          if (statusMods.sources.length > 0) {
            get().appendLog('debug', `attack: status mods ${statusMods.sources.join(' · ')}`);
          }
          const steps = buildCombatSteps(trimmed, player, targetEnemy, {
            visibilityPenalty: visPenalty,
            visibilityLabel: currentScene.weather?.name,
            weatherMod: weatherStatModifiers(currentScene.weather),
            statusMods,
            pointBlankBonus,
          });
          // Drop one-shot status effects consumed by this roll (aiming
          // burns on use).
          if (statusMods.consume.length > 0) {
            set((s) =>
              s.player
                ? {
                    player: {
                      ...s.player,
                      statusEffects: (s.player.statusEffects ?? []).filter(
                        (e) => !statusMods.consume.includes(e.kind),
                      ),
                    },
                  }
                : s,
            );
          }
          set({ pendingRolls: { actionText: trimmed, steps, currentStep: 0 } });
          get().appendLog('world', attackOpener(targetEnemy.name, parsed.resolvedNoun));
        } else {
          // No enemy — the player might have meant "kick the rubble"
          // / "smash the wall" / "punch the ground" as a clumsy way
          // to search or dig. Route to the same handlers the
          // `investigate` case would. QA finding: previously a flat
          // refusal even when the target was a ground noun.
          // Prefer the resolved canonical noun when present so the
          // narration shows "the wagon" instead of "wagon down parts"
          // for inputs like "break the wagon down for parts".
          const rawTarget = (parsed.resolvedNoun ?? parsed.target ?? '').trim();
          if (rawTarget && isGroundSearch(rawTarget)) {
            get().digHere();
            break;
          }
          // Also treat ambient-noun hits as area-searchable in the
          // attack-fallback. "break the wagon" should harvest the
          // wagon, not silently miss because 'wagon' isn't in
          // AREA_TOKENS.
          const ambientHitInAttack = rawTarget
            ? matchAmbientNoun(rawTarget, currentScene.ambientNouns ?? [])
            : null;
          if (rawTarget && (isAreaSearch(rawTarget) || ambientHitInAttack)) {
            // Honor the same per-tile dedupe the canonical investigate
            // path uses. Without this, a player typing "smash the wall"
            // repeatedly could re-roll loot for free (audit caught
            // this as a free-loot exploit). Mirror the lookup +
            // gate + state-write so attack-fallback area searches
            // are indistinguishable from the canonical path.
            const fallbackRoomKey = makeRoomKey(
              player.currentLocationId,
              currentScene.microMicroId,
              player.mapX,
              player.mapY,
            );
            const fallbackPrior = get().worldMemory.visitedRooms?.[fallbackRoomKey];
            const loweredFallback = rawTarget.toLowerCase().trim();
            const fallbackAlreadySearched = (fallbackPrior?.searchedAmbientNouns ?? []).some(
              (n) => n === loweredFallback || loweredFallback.includes(n) || n.includes(loweredFallback),
            );
            if (fallbackAlreadySearched) {
              get().appendLog('world', `You've already worked over the ${rawTarget} here. Nothing more to find.`);
              break;
            }
            const outcome = rollAreaSearch(rawTarget);
            set({ player: advanceTime(spendStamina(player, STAMINA_COSTS.skillCheck), 0.25) });
            get().appendLog('world', outcome.line);
            // Record the search so subsequent attempts at the same
            // target on the same tile hit the dedupe gate.
            set((s) => {
              const room = s.worldMemory.visitedRooms?.[fallbackRoomKey] ?? {
                firstVisitAt: Date.now(),
                lastVisitAt: Date.now(),
                visitCount: 1,
              };
              const prevSearched = room.searchedAmbientNouns ?? [];
              return {
                worldMemory: {
                  ...s.worldMemory,
                  visitedRooms: {
                    ...(s.worldMemory.visitedRooms ?? {}),
                    [fallbackRoomKey]: {
                      ...room,
                      searchedAmbientNouns: [...prevSearched, loweredFallback],
                    },
                  },
                },
              };
            });
            // Actually grant the outcome — previously this path only
            // narrated the line ("A useful scrap turns up in your
            // hand") without ever calling grantItem / awarding TC /
            // planting the hook. Playtest log caught the disconnect:
            // narration claimed loot, inventory had none. Mirror the
            // canonical investigate path so attack-fallback finishes
            // what its narration promises.
            if (outcome.kind === 'material') {
              const itemCat = lookupCraftedItem(outcome.itemName);
              const newItem: InventoryItem = stampDurability({
                id: `search_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                name: outcome.itemName,
                kind: itemCat.kind === 'weapon' ? 'weapon' : itemCat.kind === 'armor' ? 'armor' : itemCat.kind,
                rarity: outcome.rarity,
                quantity: 1,
                tags: itemCat.tags,
              });
              const grantResult = grantItem(player.inventory, newItem);
              set((s) =>
                s.player ? { player: { ...s.player, inventory: grantResult.inventory } } : s,
              );
              if (grantResult.accepted > 0) {
                get().appendLog('reward', `✦ ${outcome.itemName} (${outcome.rarity}).`);
              } else {
                get().appendLog('world', `Found a ${outcome.itemName.toLowerCase()}, but your pack is already full of them.`);
              }
            } else if (outcome.kind === 'tc') {
              set((s) => (s.player ? { player: { ...s.player, tc: s.player.tc + outcome.amount } } : s));
              get().appendLog('reward', `+${outcome.amount} TC.`);
            } else if (outcome.kind === 'hook') {
              const activeUnresolved = (currentScene.hooks ?? []).some((h) => !h.resolved);
              if (!activeUnresolved) {
                const hook = plantHookByKind(pickRandomHookKind());
                set((s) => (s.currentScene
                  ? { currentScene: { ...s.currentScene, hooks: [...(s.currentScene.hooks ?? []), hook] } }
                  : s));
                get().appendLog('world', hook.plantedLine);
              }
            }
            break;
          }
          get().appendLog('world', 'Nothing in arm\'s reach answers your blade. The motion echoes off Aetherstone.');
        }
        break;
      }
      case 'investigate': {
        // 1) "find a way / look for a path / which direction" — surface options, no roll.
        if (DIRECTION_KEYWORDS.test(trimmed)) {
          narratePossibleDirections(get, currentScene);
          break;
        }
        // The target the player named (raw, before resolution).
        const rawTarget = (parsed.target ?? parsed.resolvedNoun ?? '').trim();

        // Sanity gate — if the player's "target" is clearly garbage
        // prose (4+ words, question mark, oversized) they were typing
        // a comment / question, not a noun. Don't narrate searching
        // it. Plainly admit confusion and let them rephrase. The
        // meta-comment guard above is the primary defense; this is
        // belt-and-suspenders for inputs that slip past the regex.
        if (rawTarget) {
          const wordCount = rawTarget.split(/\s+/).length;
          if (wordCount > 3 || rawTarget.length > 40 || /[?!]/.test(rawTarget)) {
            get().appendLog(
              'arbiter',
              `The Arbiter studies you, plainly. "I'm not sure what you're trying to tell me. Phrase it as the deed you mean to do — 'search the rubble', 'attack the figure', 'go east'."`,
            );
            break;
          }
        }

        // 1.5) Ground-type search ("search the mud", "search the ground")
        // routes to the dig path before ambient noun match. "ground" is
        // often in ambientNouns and would otherwise fire generic
        // narrate-ambient-find instead of the dig loot path.
        if (rawTarget && isGroundSearch(rawTarget)) {
          get().digHere();
          break;
        }
        // Harvest verbs (salvage / strip / pry / scavenge / comb) on
        // an ambient noun should ROLL FOR LOOT, not just narrate "you
        // look closer." When the matched verb is one of these AND
        // the target hits an ambient noun, treat it as an area-search
        // on that noun — grants material / TC / plants a hook, with
        // dedupe so a re-tap doesn't re-roll.
        const harvestVerbs = new Set(['salvage', 'strip', 'pry', 'scavenge', 'comb']);
        const isHarvestVerb = parsed.matchedVerb
          ? harvestVerbs.has(parsed.matchedVerb.toLowerCase())
          : false;
        if (rawTarget && isHarvestVerb) {
          const harvestAmbient = matchAmbientNoun(rawTarget, currentScene.ambientNouns ?? []);
          if (harvestAmbient) {
            const harvestRoomKey = makeRoomKey(
              player.currentLocationId,
              currentScene.microMicroId,
              player.mapX,
              player.mapY,
            );
            const harvestPrior = get().worldMemory.visitedRooms?.[harvestRoomKey];
            const harvestLowered = harvestAmbient.toLowerCase();
            const harvestAlreadyDone = (harvestPrior?.searchedAmbientNouns ?? []).some(
              (n) => n === harvestLowered || harvestLowered.includes(n) || n.includes(harvestLowered),
            );
            if (harvestAlreadyDone) {
              get().appendLog('world', `You've already worked over the ${harvestAmbient} here. Nothing more to find.`);
              break;
            }
            set({ player: advanceTime(spendStamina(player, STAMINA_COSTS.skillCheck), 0.25) });
            const outcome = rollAreaSearch(harvestAmbient);
            get().appendLog('world', outcome.line);
            set((s) => {
              const room = s.worldMemory.visitedRooms?.[harvestRoomKey] ?? {
                firstVisitAt: Date.now(),
                lastVisitAt: Date.now(),
                visitCount: 1,
              };
              const prevSearched = room.searchedAmbientNouns ?? [];
              return {
                worldMemory: {
                  ...s.worldMemory,
                  visitedRooms: {
                    ...(s.worldMemory.visitedRooms ?? {}),
                    [harvestRoomKey]: {
                      ...room,
                      searchedAmbientNouns: [...prevSearched, harvestLowered],
                    },
                  },
                },
              };
            });
            if (outcome.kind === 'material') {
              const itemCat = lookupCraftedItem(outcome.itemName);
              const newItem: InventoryItem = stampDurability({
                id: `salvage_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                name: outcome.itemName,
                kind: itemCat.kind === 'weapon' ? 'weapon' : itemCat.kind === 'armor' ? 'armor' : itemCat.kind,
                rarity: outcome.rarity,
                quantity: 1,
                tags: itemCat.tags,
              });
              const grantResult = grantItem(player.inventory, newItem);
              set((s) => (s.player ? { player: { ...s.player, inventory: grantResult.inventory } } : s));
              if (grantResult.accepted > 0) {
                get().appendLog('reward', `✦ ${outcome.itemName} (${outcome.rarity}).`);
              } else {
                get().appendLog('world', `Found a ${outcome.itemName.toLowerCase()}, but your pack is already full of them.`);
              }
            } else if (outcome.kind === 'tc') {
              set((s) => (s.player ? { player: { ...s.player, tc: s.player.tc + outcome.amount } } : s));
              get().appendLog('reward', `+${outcome.amount} TC.`);
            } else if (outcome.kind === 'hook') {
              const activeUnresolved = (currentScene.hooks ?? []).some((h) => !h.resolved);
              if (!activeUnresolved) {
                const hook = plantHookByKind(pickRandomHookKind());
                set((s) => (s.currentScene
                  ? { currentScene: { ...s.currentScene, hooks: [...(s.currentScene.hooks ?? []), hook] } }
                  : s));
                get().appendLog('world', hook.plantedLine);
              }
            }
            break;
          }
        }
        // 2) Ambient noun match — the player named something the scene
        // paragraph actually mentioned ("investigate the traps" → match).
        // Narrate a flavored find. May plant a hook.
        if (rawTarget) {
          const ambient = matchAmbientNoun(rawTarget, currentScene.ambientNouns ?? []);
          if (ambient) {
            narrateAmbientFind(get, set, currentScene, ambient);
            break;
          }
        }
        // 3) Targeted item/noun the parser DID resolve — skill check it.
        // If the resolved target is one of the player's inventory items, surface
        // its catalog preview FIRST so the player sees what the item actually
        // does ("inspect locket" → description + stats), then the skill check
        // rolls for deeper / hidden insight on top of that flavor.
        if (parsed.resolvedNoun || parsed.resolvedItemId) {
          const invItem = parsed.resolvedItemId
            ? player.inventory.find((i) => i.id === parsed.resolvedItemId)
            : null;
          if (invItem) {
            const preview = getItemPreview(invItem.name);
            const headline = preview.rarity
              ? `${preview.name} — ${preview.rarity} ${preview.kindLabel}.`
              : `${preview.name} — ${preview.kindLabel}.`;
            get().appendLog('world', `You turn the ${invItem.name} in your hands. ${headline}`);
            if (preview.description && preview.description.toLowerCase() !== 'no record of this item in the catalog.') {
              get().appendLog('world', preview.description);
            }
            // Skip stats lines that are tags-only ("Tags: detection, ...") —
            // they read as orphan metadata in the game log and the description
            // already conveys what the item is for. Real mechanical stats
            // (damage, AC, stat bonuses, durability) still surface.
            const meaningfulStats = preview.stats.filter(
              (s) => !/^Tags:/i.test(s),
            );
            if (meaningfulStats.length > 0) {
              get().appendLog('world', meaningfulStats.join(' · '));
            }
          }
          set({ player: advanceTime(spendStamina(player, STAMINA_COSTS.skillCheck), 0.25) });
          const steps = buildSkillSteps('investigate', player, {
            weatherMod: weatherStatModifiers(currentScene.weather),
            companionAssist: !!player.companion,
          });
          set({ pendingRolls: { actionText: trimmed, steps, currentStep: 0 } });
          break;
        }
        // (Ground search routing was moved earlier — step 1.5 — so it
        // takes priority over ambient-noun narration when the target is
        // a diggable surface noun.)
        // 4) Generic area / surface / direction search ("the doorway",
        // "the area to my left", "the wall", "the shelf"). Roll an
        // outcome on the spot — nothing, small material, small TC, or
        // an atmospheric hook plant. Always engaging, never reprompting
        // for these.
        if (rawTarget && isAreaSearch(rawTarget)) {
          // One-and-done — has the player already area-searched this
          // exact noun in this room? Hard-print the already-searched
          // line and bail (no stamina cost, no dice). Playtest
          // feedback on lockboxes / wagons / crates: repeat searches
          // were spinning loot rolls forever instead of telling the
          // player the prop was done.
          const searchRoomKey = makeRoomKey(
            player.currentLocationId,
            currentScene.microMicroId,
            player.mapX,
            player.mapY,
          );
          const priorVisit = get().worldMemory.visitedRooms?.[searchRoomKey];
          const loweredTarget = rawTarget.toLowerCase().trim();
          const alreadySearched = (priorVisit?.searchedAmbientNouns ?? []).some(
            (n) => n === loweredTarget || loweredTarget.includes(n) || n.includes(loweredTarget),
          );
          if (alreadySearched) {
            get().appendLog(
              'world',
              `You already searched the ${loweredTarget}. There is nothing more to do with it.`,
            );
            break;
          }
          set({ player: advanceTime(spendStamina(player, STAMINA_COSTS.skillCheck), 0.25) });
          const outcome = rollAreaSearch(rawTarget);
          get().appendLog('world', outcome.line);
          // Mark this noun as searched on the visited-room record so
          // a re-search hits the alreadySearched branch above. We
          // record every outcome kind — even materials/TC/hooks
          // count as "you've inspected this prop; come back when you
          // find something new to do with it".
          set((s) => {
            const room = s.worldMemory.visitedRooms?.[searchRoomKey] ?? {
              firstVisitAt: Date.now(),
              lastVisitAt: Date.now(),
              visitCount: 1,
            };
            const prevSearched = room.searchedAmbientNouns ?? [];
            if (prevSearched.includes(loweredTarget)) return s;
            return {
              worldMemory: {
                ...s.worldMemory,
                visitedRooms: {
                  ...(s.worldMemory.visitedRooms ?? {}),
                  [searchRoomKey]: {
                    ...room,
                    searchedAmbientNouns: [...prevSearched, loweredTarget],
                  },
                },
              },
            };
          });
          if (outcome.kind === 'material') {
            const itemCat = lookupCraftedItem(outcome.itemName);
            const isStackableCommodity = itemCat.kind === 'consumable' || itemCat.kind === 'misc';
            const searchRoomKey = makeRoomKey(
              player.currentLocationId,
              currentScene.microMicroId,
              player.mapX,
              player.mapY,
            );
            // HANDOFF #15c — same gate as digHere: a bespoke drop from
            // this room doesn't reappear if the player already grabbed it.
            if (!isStackableCommodity && roomLootAlreadyGrabbed(get().worldMemory, searchRoomKey, outcome.itemName)) {
              get().appendLog(
                'world',
                `Nothing new here — anything worth the bend in your back was already in your pack.`,
              );
              break;
            }
            const newItem: InventoryItem = stampDurability({
              id: `search_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              name: outcome.itemName,
              kind: itemCat.kind === 'weapon' ? 'weapon' : itemCat.kind === 'armor' ? 'armor' : itemCat.kind,
              rarity: outcome.rarity,
              quantity: 1,
              tags: itemCat.tags,
            });
            // grantItem honors per-name caps (Big Rock = 1, Small Rock = 10, etc.)
            // and tells us if anything got clamped so the player isn't gaslit
            // by a "✦ Recovered" line that didn't actually grant the item.
            const grantResult = grantItem(player.inventory, newItem);
            set((s) =>
              s.player
                ? { player: { ...s.player, inventory: grantResult.inventory } }
                : s,
            );
            if (!isStackableCommodity && grantResult.accepted > 0) {
              set((s) => recordRoomLootGrabbed(s, searchRoomKey, outcome.itemName));
            }
            if (grantResult.accepted > 0) {
              get().appendLog('reward', `✦ ${outcome.itemName} (${outcome.rarity}).`);
            } else {
              get().appendLog('world', `Found a ${outcome.itemName.toLowerCase()}, but your pack is already full of them.`);
            }
          } else if (outcome.kind === 'tc') {
            set((s) => (s.player ? { player: { ...s.player, tc: s.player.tc + outcome.amount } } : s));
            get().appendLog('reward', `+${outcome.amount} TC.`);
          } else if (outcome.kind === 'hook') {
            const activeUnresolved = (currentScene.hooks ?? []).some((h) => !h.resolved);
            if (!activeUnresolved) {
              const hook = plantHookByKind(pickRandomHookKind());
              set((s) => (s.currentScene
                ? { currentScene: { ...s.currentScene, hooks: [...(s.currentScene.hooks ?? []), hook] } }
                : s));
              get().appendLog('world', hook.plantedLine);
            }
          }
          break;
        }
        // 4.5) NPC hard-match — fires BEFORE MiniLM so "search tarek"
        // can't drift to "great tartary" via cosine similarity.
        // Playtest log: MiniLM resolved "tarek" → "tartary" at 0.66
        // and hijacked the action into a wilderness search. Hard-
        // matching the active vendor (which IS the hub-room anchor
        // NPC when in a hub room) catches the player's intent
        // cleanly and short-circuits the cognitive layer.
        if (rawTarget && currentScene.vendor?.name) {
          const lowered = rawTarget.toLowerCase().trim();
          const npcName = currentScene.vendor.name.toLowerCase();
          // First word of the NPC name (Tarek / Irma / Halem / Jorah)
          // is the common short form the player types.
          const firstName = npcName.split(/\s+/)[0] ?? npcName;
          const isNpcMatch = npcName.includes(lowered) || lowered.includes(firstName);
          if (isNpcMatch) {
            get().appendLog(
              'world',
              `You turn your attention to ${currentScene.vendor.name}. They glance up — focused on their own work, not yours. (Use 'gift', 'sell', 'accept', or 'recruit' if you mean to engage.)`,
            );
            break;
          }
        }
        // 4.6) Resolved-hook hard-print — if the player's target
        // matches a hook they've already exhausted (the wagon, the
        // lockbox, etc.), bypass loot tables / LLM flavor and tell
        // them straight up. Playtest feedback: "Lockbox / Wagon"
        // bug — players were getting noisy guess-text instead of a
        // definitive "you already searched this".
        if (rawTarget) {
          const anyHook = matchAnyHookNoun(rawTarget, currentScene.hooks ?? []);
          if (anyHook?.resolved) {
            const noun = anyHook.nouns[0] ?? 'it';
            get().appendLog('world', `You already searched the ${noun}. There is nothing more to do with it.`);
            break;
          }
        }
        // 5) Player aimed at something specific the engine can't recognise.
        // First try a semantic resolution via MiniLM — embed the raw target
        // + scene candidates, find the closest cosine match. If it lands
        // above threshold (0.85), re-run the action with the inferred
        // target. Otherwise re-prompt politely.
        if (rawTarget) {
          if (cognitive.isReady()) {
            const candidates = [
              ...(currentScene.ambientNouns ?? []),
              ...(currentScene.hooks ?? []).filter((h) => !h.resolved).flatMap((h) => h.nouns),
              ...currentScene.enemies.map((e) => e.name),
              // Vendor name in the candidate pool as a backstop —
              // hard-match above catches it first, but if a future
              // playtest finds an alias we haven't covered, MiniLM
              // can still resolve it (at the new 0.85 floor, only a
              // genuinely-confident match will land).
              ...(currentScene.vendor?.name ? [currentScene.vendor.name] : []),
              currentScene.location.name,
              ...(currentScene.hazard ? [currentScene.hazard.name] : []),
            ];
            void cognitive.inferTarget(rawTarget, candidates).then((match) => {
              if (match) {
                get().appendLog(
                  'cognitive',
                  `Resolved "${rawTarget}" → "${match.target}" (sim ${match.score.toFixed(2)}).`,
                );
                get().submitPlayerAction(`search the ${match.target}`);
              } else {
                repromptUnknownTarget(get, currentScene, rawTarget);
              }
            }).catch(() => repromptUnknownTarget(get, currentScene, rawTarget));
            break;
          }
          // MiniLM is not ready (model download failed, or still loading) —
          // log a one-time-per-action debug crumb so support / playtesters
          // can see why fuzzy match isn't firing. Hidden channel, won't
          // clutter the world view, but visible in COPY ALL.
          get().appendLog(
            'debug',
            `MiniLM unavailable — using heuristic match only for "${rawTarget}".`,
          );
          repromptUnknownTarget(get, currentScene, rawTarget);
          break;
        }
        // 5) Generic look-around — no roll, atmospheric narration with optional hook.
        narrateCasualLook(get, set, currentScene);
        break;
      }
      case 'stealth':
      case 'diplomacy':
      case 'escape':
      case 'cast':
      case 'use_relic': {
        set({ player: advanceTime(spendStamina(player, STAMINA_COSTS.skillCheck), 0.25) });
        const steps = buildSkillSteps(parsed.intent, player, {
          weatherMod: weatherStatModifiers(currentScene.weather),
          companionAssist: !!player.companion,
        });
        set({ pendingRolls: { actionText: trimmed, steps, currentStep: 0 } });
        break;
      }
      case 'rest': {
        // If the player resolved a consumable inventory item (e.g. "eat ration"),
        // consume one and heal from a 2d6 roll instead of a generic camp-rest.
        const consumable = parsed.resolvedItemId
          ? player.inventory.find((i) => i.id === parsed.resolvedItemId && i.kind === 'consumable')
          : undefined;
        if (consumable) {
          const room = player.hpMax - player.hp;
          const heal = Math.min(Math.max(0, room), rollDie(6) + rollDie(6));
          const newInventory = player.inventory
            .map((i) => (i.id === consumable.id ? { ...i, quantity: i.quantity - 1 } : i))
            .filter((i) => i.quantity > 0);
          // Eating still costs a slice of the day — half an hour to break
          // and chew a ration, so the clock advances too.
          set({
            player: advanceTime(
              { ...player, hp: player.hp + heal, inventory: newInventory },
              0.5,
            ),
          });
          const tail = heal > 0
            ? `2d6 → ${heal} HP recovered.`
            : 'You were already at full strength — the ration steadies you, nothing more.';
          get().appendLog('world', `You consume one ${consumable.name}. ${tail}`);
          void get().persist();
        } else {
          // Deterministic 8-hour rest. The old d4+3 prompt had no
          // gameplay surface — the player couldn't influence or fail the
          // roll, and the only difference between 4h and 7h was time
          // passing. Real cost of rest is the clock advance (which
          // matters when a hunt / mystery / storyline is timed); the
          // heal/stamina ceiling is a separate dial.
          const hpRoom = player.hpMax - player.hp;
          const stamRoom = player.staminaMax - player.stamina;
          if (hpRoom === 0 && stamRoom === 0) {
            get().appendLog(
              'world',
              'You are whole, breath steady, HP and stamina topped. No reason to lie down — the day still has road left.',
            );
            void get().persist();
            break;
          }
          const hours = 8;
          const heal = Math.min(hpRoom, hours * 2);
          const stamGain = Math.min(stamRoom, hours);
          // Corruption decay — clean rest sheds one point of
          // corruption ONLY when both of:
          //   - the current weather isn't corrupting (Whisper Fog /
          //     Silent Blizzard stain you back as fast as rest can
          //     clear; the lore is that those biomes attack the
          //     soul)
          //   - the player actually has corruption to lose
          // Original implementation decayed every rest regardless of
          // biome, which the year-sim showed effectively zeroed out
          // the long-term loop. Subsequent attempt added a 24h rate
          // limit which over-corrected (corruption climbed to 145
          // over a sim year because most rests were too close
          // together to qualify). Final balance: every clean-weather
          // rest decays one, every corrupting-weather rest decays
          // none. Players who spend their year in dangerous biomes
          // wear the stain; players who travel safely shed it
          // slowly.
          const newHours = (player.hoursElapsed ?? 0) + hours;
          const weatherIsCorrupting = (() => {
            const w = currentScene.weather;
            if (!w) return false;
            return /whisper.*fog|silent.*blizzard/i.test(w.name ?? '')
              || (w.corruptionChance ?? 0) > 0;
          })();
          // Decay scales with the current load — high corruption sheds
          // faster so a player who got stuck in Whisper Fog for a week
          // can recover in a few clean rests, but a single point still
          // lingers (lore: the Aether doesn't fully wash off). The
          // weather tick at the top of submitPlayerAction has already
          // fired before this branch, so resting in a corrupting biome
          // still nets nothing.
          const curCorr = player.corruption ?? 0;
          const corrDecay = !weatherIsCorrupting && curCorr > 0
            ? (curCorr > 30 ? 4 : curCorr > 10 ? 2 : 1)
            : 0;
          set({
            player: {
              ...player,
              hp: player.hp + heal,
              stamina: player.stamina + stamGain,
              corruption: Math.max(0, (player.corruption ?? 0) - corrDecay),
              hoursElapsed: newHours,
            },
          });
          const parts: string[] = [];
          if (heal > 0) parts.push(`+${heal} HP`);
          if (stamGain > 0) parts.push(`+${stamGain} stamina`);
          if (corrDecay > 0) parts.push(`−${corrDecay} corruption`);
          const tail = parts.length > 0 ? parts.join(', ') + ' recovered.' : 'Whole already — the Aetherstone hums steady.';
          get().appendLog('world', `You rest for ${hours} hours. ${tail} (${describeTime(newHours)})`);
          void get().persist();
        }
        break;
      }
      case 'travel': {
        if (player.stamina < TRAVEL_MIN_STAMINA) {
          get().appendLog(
            'world',
            `You take one step and the buried world refuses. Your legs will not. Type 'rest' to recover (≈4h), then the road will hold you again.`,
          );
          break;
        }
        const target = parsed.target?.toLowerCase() ?? '';
        // Combat redirect — when an enemy is on the field and the player
        // types "go to him" / "walk over" / "enter the fight" / any travel
        // verb without a cardinal direction or named destination, treat it
        // as combat advance instead of map travel. Playtest log: player
        // typed something that read as "approach the reclaimer" and the
        // travel handler dropped into narrateWanderingJourney while the
        // enemy still stood across the room.
        if (currentScene.enemies.length > 0) {
          const isCardinalTravel = /\b(north|south|east|west|northeast|northwest|southeast|southwest)\b/.test(target);
          if (!isCardinalTravel) {
            runMoveCombatRange(get, set, player, currentScene, 'advance');
            break;
          }
        }
        // Hub mode — when the player has a hubRoomId set, route travel
        // through the hand-authored room graph BEFORE the procedural
        // world handles cardinal/named-location lookups. This keeps
        // 'go north' meaning the gate→square step instead of a Macro
        // tile shift, and 'go armory' a direct room jump.
        if (player.hubRoomId) {
          if (isLeaveHubCommand(trimmed)) {
            set((s) => (s.player ? { player: { ...s.player, hubRoomId: null } } : s));
            set({ player: advanceTime(spendStamina(get().player!, STAMINA_COSTS.travel), 1) });
            get().appendLog(
              'world',
              `You walk back through the gate and out into the open ground. The outpost falls away behind you.`,
            );
            // skipHubEntry — otherwise beginScene re-enters the gate
            // because the player's currentLocationId is still the
            // hub's macro location.
            get().beginScene({ skipHubEntry: true });
            break;
          }
          const visited = new Set(get().worldMemory.hubVisited ?? []);
          const move = resolveHubTravel(player.hubRoomId, trimmed, visited);
          if (move) {
            set((s) => (s.player ? { player: { ...s.player, hubRoomId: move.roomId } } : s));
            const cost = move.via === 'fast_travel' ? 0.25 : 1;
            const stam = move.via === 'fast_travel' ? 1 : STAMINA_COSTS.travel;
            set({ player: advanceTime(spendStamina(get().player!, stam), cost) });
            const dest = findHubRoom(move.roomId);
            if (dest) {
              get().appendLog(
                'world',
                move.via === 'fast_travel'
                  ? `You cut across the outpost to the ${dest.shortName}.`
                  : `You head ${move.via === 'cardinal' ? 'on' : 'over'} to the ${dest.shortName}.`,
              );
            }
            get().beginScene();
            break;
          }
          // No hub-exit matched — fall through. This lets 'go to drakova'
          // still resolve via the wider location index, treating the hub
          // gate as a launch point.
        }
        // Continue / keep going / onward — repeat the player's last cardinal
        // direction without making them retype it. If there's no last
        // direction recorded (player just spawned, or last move was a named
        // travelTo), prompt them to point first.
        if (isContinueCommand(trimmed)) {
          const last = player.lastTravelDirection;
          if (last) {
            set({ player: advanceTime(spendStamina(player, STAMINA_COSTS.travel), 1) });
            get().stepDirection(last);
          } else {
            get().appendLog(
              'arbiter',
              `The Arbiter raises a brow. "Continue which way? You have not pointed yet."`,
            );
          }
          break;
        }
        // Directional travel: "go north" / "head east" / "walk south" /
        // "travel west" — walk one tile on the procedural map.
        const dirMatch = /\b(north|south|east|west)\b/.exec(target);
        if (dirMatch) {
          const dir = dirMatch[1] as Direction;
          // Hub-mode cleanup. If we reached this point the player was
          // in a hub room AND the hub-travel block above didn't match
          // a hub-internal exit. Cardinal travel out of a hub room
          // means the player is leaving the outpost into the wilds —
          // clear hubRoomId now so subsequent dig / search calls don't
          // get refused with "the outpost floors are board and brick."
          // Compute the next player from get() not the captured `player`
          // closure — otherwise the spendStamina/advanceTime set below
          // overwrites the cleared hubRoomId with the stale value.
          if (player.hubRoomId) {
            // Clear hubRoomId AND rebuild ambientNouns from just the
            // macro location description. Otherwise the scene keeps
            // the hub room's nouns (anvil, racks, kettle, map-stone)
            // even though the player has walked out the gate — and
            // "sneak up on racks" / "search the anvil" succeeds in
            // the open silt. Playtest log caught it: player went east
            // from the Armory then typed `sneak up on racks` in the
            // wilds and the parser happily resolved 'racks' as a hook
            // noun left over from the Armory hub room.
            set((s) => {
              if (!s.player) return s;
              const patch: Partial<GameStore> = {
                player: { ...s.player, hubRoomId: null },
              };
              if (s.currentScene?.location) {
                const loc = s.currentScene.location;
                patch.currentScene = {
                  ...s.currentScene,
                  ambientNouns: (loc.interactables && loc.interactables.length > 0)
                    ? [...loc.interactables]
                    : extractAmbientNouns(loc.description),
                };
              }
              return patch;
            });
            get().appendLog(
              'world',
              `You walk ${dir} past the gate. The outpost falls away behind you.`,
            );
          }
          const currentPlayer = get().player ?? player;
          set({ player: advanceTime(spendStamina(currentPlayer, STAMINA_COSTS.travel), 1) });
          get().stepDirection(dir);
          break;
        }
        // Exit-follow: when the player is in a Micro-Micro room and types
        // something that matches one of its narrated exits ("go through
        // the broken window", "take the stairwell", "down the maintenance
        // hatch"), step into a sibling room in the same Micro location.
        // Standard travel cost — 1 hour + STAMINA_COSTS.travel.
        const sceneMicroMicroId = currentScene.microMicroId;
        if (sceneMicroMicroId) {
          const here = findMicroMicroAnywhere(sceneMicroMicroId);
          if (here) {
            const lowered = (target || trimmed).toLowerCase();
            const matchedExit = here.microMicro.exits.find((exit) => {
              const e = exit.toLowerCase();
              if (lowered.includes(e)) return true;
              // Also match if the player picked one or two significant words
              // from the exit phrase: "take the catwalk" matches "across the
              // catwalk". Single-word match must be ≥4 chars to avoid noise.
              for (const w of lowered.split(/\s+/)) {
                if (w.length >= 4 && e.includes(w)) return true;
              }
              return false;
            });
            // Also allow a bare "go to the exit" / "take an exit" / "leave"
            // shortcut that doesn't match any specific phrase but should
            // still move the player to a sibling room.
            const genericExit = /\b(exit|leave|next room|onward)\b/.test(lowered);
            if (matchedExit || genericExit) {
              const sibling = pickSiblingMicroMicro(sceneMicroMicroId);
              if (sibling) {
                set({ player: advanceTime(spendStamina(player, STAMINA_COSTS.travel), 1) });
                get().appendLog(
                  'world',
                  matchedExit
                    ? `You take the ${matchedExit}. The next chamber opens up.`
                    : `You step through to the next chamber.`,
                );
                get().beginScene({ microMicroId: sibling.microMicro.id });
                break;
              }
            }
          }
        }
        // Vertical / "downward" navigation. When the player types "go
        // down" / "descend" / "into the depths" / "below ground", drop
        // into a Micro-Micro of the current Macro biome — the buried
        // sub-rooms the location's ladder defines. Picks a random one
        // since explicit downward-mapping isn't authored yet.
        const wantsDown = /\b(down|descend|below|under|into the depths|into the deep|beneath|sub[- ]level|basement|crypt|cellar|undercroft)\b/i.test(trimmed);
        if (wantsDown && !currentScene.microMicroId) {
          const macroId = LOCATION_TO_MACRO[currentScene.location.id];
          if (macroId) {
            const target = pickRandomMicroMicroIn(macroId);
            if (target) {
              set({ player: advanceTime(spendStamina(player, STAMINA_COSTS.travel), 1) });
              get().appendLog(
                'world',
                `You descend below the surface. The air thickens, the light fails, and the buried world opens around you.`,
              );
              get().beginScene({ microMicroId: target.microMicro.id });
              break;
            }
          }
          get().appendLog(
            'arbiter',
            `The Arbiter shrugs. "Nothing buried opens here. You'd need a vault door, a stairwell, a culvert — and this stretch has none."`,
          );
          break;
        }
        // Inverse — "go up" / "surface" / "back to the ground" when in a
        // Micro-Micro returns to the parent macro tile.
        const wantsUp = /\b(surface|aboveground|topside|back up|climb out|leave the depths)\b/i.test(trimmed);
        if (wantsUp && currentScene.microMicroId) {
          set({ player: advanceTime(spendStamina(player, STAMINA_COSTS.travel), 1) });
          get().appendLog(
            'world',
            `You climb back to the surface. The sky's gray weight returns to your shoulders.`,
          );
          // beginScene with no microMicroId — the random picker will choose,
          // but we want the flat macro view. Pass an empty string to force
          // the no-ladder path; beginScene's resolver will treat that as
          // "no specific room, sample fresh".
          get().beginScene();
          break;
        }
        // Fuzzy location lookup — playtest typed "Walk to dracova" (one
        // letter off from Drakova) and got narrateWanderingJourney instead
        // of a real route. Try exact-substring first, then a Levenshtein
        // fallback. TIGHTENED: target must be ≥5 chars and edit distance
        // ≤ 1 so "stall" no longer fuzzy-matches "stair" inside Endless
        // Stair and teleports the player out of a market scene they were
        // trying to navigate.
        let candidate = target
          ? allLocations.find((l) => l.name.toLowerCase().includes(target) || l.id === target)
          : undefined;
        if (!candidate && target && target.length >= 5) {
          let bestDist = 2;
          for (const l of allLocations) {
            const lname = l.name.toLowerCase();
            const words = lname.split(/\s+/);
            for (const w of words) {
              if (Math.abs(w.length - target.length) > 1) continue;
              const d = levenshtein(target, w);
              if (d < bestDist) {
                bestDist = d;
                candidate = l;
              }
            }
          }
        }
        if (candidate) {
          set({ player: advanceTime(spendStamina(player, STAMINA_COSTS.travel), 2) });
          get().travelTo(candidate.id);
          break;
        }
        // No external destination matched — but the player named something
        // the current scene mentioned (ambient noun / hook / enemy / item).
        // That's an INTRA-SCENE movement: walking across a room to a
        // stall, dagger, figure, etc. Low cost — 15 min, 1 stamina — not
        // a multi-hour map trek. Playtest: "Go to a stall" was teleporting
        // the player out of the market entirely because the engine treated
        // every walk verb as map travel.
        const ambientHit = target ? matchAmbientNoun(target, currentScene.ambientNouns ?? []) : null;
        const hookHit = target ? matchHookNoun(target, currentScene.hooks ?? []) : null;
        const enemyHit = target
          ? currentScene.enemies.find((e) => e.name.toLowerCase().includes(target) || (e.aliases ?? []).some((a) => target.includes(a)))
          : null;
        const intraSceneNoun = ambientHit ?? hookHit?.nouns[0] ?? enemyHit?.name ?? null;
        if (intraSceneNoun) {
          set({ player: advanceTime(spendStamina(player, 1), 0.25) });
          get().appendLog(
            'world',
            `You move across the ground to the ${intraSceneNoun.toLowerCase()}. Close enough now to act on it.`,
          );
          break;
        }
        // Fall-through: wander.
        set({ player: advanceTime(spendStamina(player, STAMINA_COSTS.wander), 1) });
        narrateWanderingJourney(get, set, currentScene);
        break;
      }
      case 'wait':
        get().appendLog('world', 'You hold still. Tartaria holds still longer.');
        break;
      case 'inventory':
        get().setScreen('inventory');
        break;
      case 'dodge': {
        // Defensive stance: +4 AC for one round, costs nothing else.
        // remainingRounds=2 so the stance survives the next turn's
        // tickEffects (2→1) AND is still active when that turn's
        // enemy counter resolves. Without this, tickEffects would
        // decrement 1→0 before the counter saw the +4 AC.
        //
        // Stance-already-active guard: chaos-sim flagged repeat
        // dodge / block / flee taps producing zero feedback because
        // applyEffect silently overwrites the existing effect and
        // the same-channel-debounce in appendLog merges the world
        // line into the prior one. Surface a clear ack so the
        // player knows the tap registered.
        const alreadyDodging = (player.statusEffects ?? []).some((e) => e.kind === 'dodging');
        if (alreadyDodging) {
          get().appendLog('world', `You're already in the dodging stance — no need to spend another beat on it.`);
          break;
        }
        const dodging: StatusEffect = {
          kind: 'dodging',
          remainingRounds: 2,
          label: 'dodging',
        };
        set((s) =>
          s.player
            ? {
                player: {
                  ...s.player,
                  statusEffects: applyEffect(s.player.statusEffects ?? [], dodging),
                },
              }
            : s,
        );
        get().appendLog(
          'world',
          currentScene.enemies.length > 0
            ? `You drop into a dodging stance. ${activeEnemy(currentScene)?.name ?? 'they'}'s next attack will have to find you.`
            : `You shift your weight, ready to evade. Nothing tests it.`,
        );
        break;
      }
      case 'block': {
        // Block stance: stake your equipped weapon on the next enemy
        // attack. If the block roll lands, damage is halved and there's
        // a small chance to riposte for 1d4. Weapon takes wear either
        // way — that's the cost.
        const alreadyBlocking = (player.statusEffects ?? []).some((e) => e.kind === 'blocking');
        if (alreadyBlocking) {
          get().appendLog('world', `You're already braced into a block — the stance holds.`);
          break;
        }
        const equippedMainName = player.equipped?.main ?? player.equipped?.weaponName;
        const blockWeapon = equippedMainName ? findWeaponByName(equippedMainName) : null;
        if (!blockWeapon || (blockWeapon.defense ?? 0) <= 0) {
          get().appendLog(
            'arbiter',
            `The Arbiter shakes their head. "${blockWeapon?.name ?? 'Bare hands'} is no shield. Try dodging instead."`,
          );
          break;
        }
        const blocking: StatusEffect = {
          kind: 'blocking',
          remainingRounds: 2,
          label: 'blocking',
        };
        set((s) =>
          s.player
            ? {
                player: {
                  ...s.player,
                  statusEffects: applyEffect(s.player.statusEffects ?? [], blocking),
                },
              }
            : s,
        );
        get().appendLog(
          'world',
          currentScene.enemies.length > 0
            ? `You raise the ${blockWeapon.name} into a block. (defense +${blockWeapon.defense})`
            : `You take a defensive stance, ${blockWeapon.name} raised. Nothing tests it.`,
        );
        break;
      }
      case 'advance':
      case 'retreat': {
        // Approach <enemy name> in a multi-enemy fight should switch
        // active focus to that enemy first, then close the gap.
        // Playtest spec: "if I'm getting attacked by a dragon, a
        // hellhound and a human I can hit approach human which might
        // take me out of damage range of the other two and put me in
        // striking range of that one."
        const advanceTarget = (parsed.target ?? parsed.resolvedNoun ?? '').trim();
        if (advanceTarget && currentScene.enemies.length > 1) {
          const t = advanceTarget.toLowerCase();
          const idx = currentScene.enemies.findIndex((e) =>
            e.name.toLowerCase().includes(t)
            || (e.aliases ?? []).some((a) => a.toLowerCase().includes(t)),
          );
          if (idx >= 0 && idx !== currentScene.activeEnemyIdx) {
            set((s) => (s.currentScene ? { currentScene: { ...s.currentScene, activeEnemyIdx: idx } } : s));
            get().appendLog('world', `You shift focus to ${currentScene.enemies[idx]!.name}.`);
          }
        }
        // Outside combat, advance with an in-scene target turns into
        // an intra-scene walk-to. Without a target it still hits the
        // "nothing to advance on" refusal in runMoveCombatRange.
        if (currentScene.enemies.length === 0 && advanceTarget) {
          const ambient = matchAmbientNoun(advanceTarget, currentScene.ambientNouns ?? []);
          const hookHit = matchHookNoun(advanceTarget, currentScene.hooks ?? []);
          const vendorHit = currentScene.vendor && advanceTarget.toLowerCase().includes((currentScene.vendor.name.toLowerCase().split(/\s+/)[0] ?? ''))
            ? currentScene.vendor.name
            : null;
          const noun = ambient ?? hookHit?.nouns[0] ?? vendorHit;
          if (noun) {
            set({ player: advanceTime(spendStamina(player, 1), 0.25) });
            get().appendLog('world', `You move across the ground to the ${noun.toLowerCase()}. Close enough now to act on it.`);
            break;
          }
        }
        runMoveCombatRange(get, set, player, currentScene, parsed.intent);
        break;
      }
      case 'ask': {
        const lookup = parsed.target ?? parsed.resolvedNoun ?? trimmed;
        // Spatial awareness — "where is Asgardar", "how far to Voronov",
        // "nearest town", "directions to the spire". The Arbiter knows the
        // map regardless of whether the player carries a compass; this is a
        // game-feel item, not gated content.
        const dirQ = parseDirectionQuestion(trimmed);
        if (dirQ && dirQ.kind !== 'survey') {
          const seed = player.mapSeed ?? `${player.name}|${player.raceId}|${player.factionId}|legacy`;
          const map = generateWorldMap(seed, player.currentLocationId);
          const fromX = player.mapX ?? 4;
          const fromY = player.mapY ?? 4;
          if (dirQ.kind === 'nearest') {
            const near = findNearestNamed(map, fromX, fromY, {
              excludeId: player.currentLocationId,
            });
            if (near) {
              get().appendLog(
                'arbiter',
                `The Arbiter points ${near.direction}. "Nearest is ${near.locationName} — ${near.travelPhrase} ${near.direction}, give or take. Vendors come and go, but that's the closest hub you'll find."`,
              );
            } else {
              get().appendLog(
                'arbiter',
                `The Arbiter scans the horizon. "Nothing named within reach. Walk and one will turn up."`,
              );
            }
            break;
          }
          // 'directional' — closest named tile in a SPECIFIC cardinal
          // direction. Uses surveyAll's per-direction sense to pull the
          // first named neighbor along that vector, then formats with
          // the existing travelPhrase math.
          if (dirQ.kind === 'directional') {
            const survey = surveyAll(map, fromX, fromY);
            const dir = dirQ.target as Direction;
            const hit = survey[dir];
            if (hit) {
              const days = hit.distance;
              const travelPhrase = days <= 1 ? 'a day\'s travel' : `${days} days' travel`;
              get().appendLog(
                'arbiter',
                `The Arbiter gestures ${dir}. "${hit.name} lies ${travelPhrase} ${dir}."`,
              );
            } else {
              get().appendLog(
                'arbiter',
                `The Arbiter looks ${dir}. "Empty horizon that way. Nothing named within reach."`,
              );
            }
            break;
          }
          // 'specific' — name lookup
          const found = findNamedByQuery(map, fromX, fromY, dirQ.target);
          if (found) {
            const here = found.tiles === 0;
            get().appendLog(
              'arbiter',
              here
                ? `The Arbiter taps the ground. "You're standing on ${found.locationName}."`
                : `The Arbiter gestures ${found.direction}. "${found.locationName} lies ${found.travelPhrase} ${found.direction}."`,
            );
          } else {
            get().appendLog(
              'arbiter',
              `The Arbiter scans the horizon. "I cannot place '${dirQ.target}'. Try a name I might recognize — Asgardar, Varakush, the Cradle."`,
            );
          }
          break;
        }
        // "where am I" / "what is around" / "compass" → directional survey
        // if the player has a compass; otherwise a vaguer answer.
        const wantsBearings = /where.*am|what.*around|what.*near|which way|compass|bearings|surroundings|describe|what.*here/i.test(trimmed);
        if (wantsBearings) {
          // Lead with the full structured scene description (location +
          // micro-room env + entities + room exits). The cardinal summary
          // then follows as the macro-tier answer.
          narrateCasualLook(get, set, currentScene);
          const hasCompass = player.inventory.some(
            (i) => /compass/i.test(i.name) && i.quantity > 0,
          );
          const seed = player.mapSeed ?? `${player.name}|${player.raceId}|${player.factionId}|legacy`;
          const map = generateWorldMap(seed, player.currentLocationId);
          const fromX = player.mapX ?? 4;
          const fromY = player.mapY ?? 4;
          if (hasCompass) {
            const survey = surveyAll(map, fromX, fromY);
            const fragments: string[] = [];
            for (const dir of ['north', 'east', 'south', 'west'] as Direction[]) {
              const s = survey[dir];
              if (s) fragments.push(`${dir}: ${s.name} (${s.distance} stretch${s.distance > 1 ? 'es' : ''})`);
            }
            const summary = fragments.length > 0
              ? fragments.join(' · ')
              : 'every direction reads open ground';
            get().appendLog(
              'arbiter',
              `The Arbiter watches you read the compass. "Bearings, then: ${summary}."`,
              { skipDedup: true },
            );
          } else {
            get().appendLog(
              'arbiter',
              `The Arbiter shrugs. "You have no compass. The mud-flood country looks the same in every direction — find one or guess."`,
              { skipDedup: true },
            );
          }
          break;
        }
        // Inventory question — "is the fungus in my pack", "do i have a
        // locket", "got any bandages". Matched before the concept lookup so
        // a real inventory check beats a no-match Aether trivia answer.
        // Pattern matching + target extraction live in engine/askInventory.ts
        // so they're testable without the store.
        if (isInventoryQuestion(trimmed)) {
          const target = extractInventoryTarget(trimmed);
          const countQuestion = isCountQuestion(trimmed);
          // Category fallback — "what armor do I have", "tell me about my
          // weapons", "show me my rings". The target word lines up with a
          // gear category, not an item name, so list everything that fits
          // the kind/slot instead of doing a substring match that would
          // come back empty and route to the d20 rules dump.
          const category = INVENTORY_CATEGORIES[target];
          if (category) {
            const owned = player.inventory.filter((i) => {
              if (i.quantity <= 0) return false;
              if (category.kind && category.kind.includes(i.kind)) return true;
              if (category.slot) {
                const validSlots = validSlotsForItem(i);
                if (validSlots.some((s) => category.slot!.includes(s))) return true;
              }
              return false;
            });
            if (owned.length > 0) {
              const itemized = owned
                .map((i) => (i.quantity > 1 ? `${i.name} (x${i.quantity})` : i.name))
                .join(', ');
              const equippedNames = Object.values(player.equipped ?? {}).filter(Boolean) as string[];
              const equippedSubset = owned
                .filter((i) => equippedNames.includes(i.name))
                .map((i) => i.name);
              const equippedNote = equippedSubset.length > 0
                ? ` Worn: ${equippedSubset.join(', ')}.`
                : '';
              get().appendLog(
                'arbiter',
                `The Arbiter glances at your pack. "${category.label.charAt(0).toUpperCase()}${category.label.slice(1)}: ${itemized}.${equippedNote}"`,
              );
            } else {
              get().appendLog(
                'arbiter',
                `The Arbiter shakes their head. "No ${category.label} on you."`,
              );
            }
            break;
          }
          // Bail to a clean message when the target survived as something
          // noisy (more than 3 words, or it still contains stray punctuation
          // /question fragments). Playtest log produced "No tell me . all of
          // it on you." because messy target text was echoed verbatim.
          const targetIsNoisy = target.split(/\s+/).length > 3 || /[.,;:!?]/.test(target);
          if (target && !targetIsNoisy) {
            const matches = player.inventory.filter(
              (i) => i.quantity > 0 && i.name.toLowerCase().includes(target),
            );
            if (matches.length > 0) {
              if (countQuestion) {
                // "how many rations do I have" → name the count by item, not
                // a "yes — N rations" phrasing that reads like a yes/no.
                const itemized = matches
                  .map((i) => `${i.quantity} ${i.name}`)
                  .join(', ');
                get().appendLog(
                  'arbiter',
                  `The Arbiter counts your pack. "${itemized}."`,
                );
              } else {
                const itemized = matches
                  .map((i) => (i.quantity > 1 ? `${i.name} (x${i.quantity})` : i.name))
                  .join(', ');
                get().appendLog(
                  'arbiter',
                  `The Arbiter glances at your pack. "Yes — ${itemized}."`,
                );
              }
            } else {
              // Count question with zero matches reads as "0 X" — keeps the
              // phrasing aligned with the count branch above.
              if (countQuestion) {
                get().appendLog(
                  'arbiter',
                  `The Arbiter shakes their head. "Zero ${target}."`,
                );
              } else {
                get().appendLog(
                  'arbiter',
                  `The Arbiter shakes their head. "No ${target} on you."`,
                );
              }
            }
            break;
          }
        }
        // Otherwise normal concept lookup.
        const concept = findConcept(lookup);
        if (concept) {
          get().appendLog('arbiter', `"${concept.title}." the Arbiter says. "${concept.answer}"`);
        } else {
          // Rotating concept-miss replies — playtest log showed the same
          // "I do not have a clean answer" line firing twice ~5 minutes
          // apart. Variety prevents the "broken record" feeling.
          const missReplies = [
            `The Arbiter considers. "I do not have a clean answer for that yet. Try a damage type, a faction, or one of the basic systems — HP, stamina, AC, corruption, the Aether."`,
            `The Arbiter tilts their head. "Not a thing I have words for. Try a faction name, a damage type, or a system like HP or AC."`,
            `The Arbiter exhales. "That sits outside what I know. Ask about HP, stamina, AC, corruption, the Aether — or a faction."`,
            `The Arbiter shrugs. "I cannot place that. The basic systems — HP, stamina, AC, corruption, the Aether — those I can answer."`,
          ];
          get().appendLog('arbiter', rotatingPick(missReplies, 'arbiter.concept-miss'));
        }
        break;
      }
      case 'equip': {
        const verb = parsed.matchedVerb?.toLowerCase() ?? '';
        const isUnequip = /^un|^remove|^sheathe/.test(verb) || /^un|^remove|^sheathe|take off/.test(trimmed.toLowerCase());
        if (isUnequip) {
          const target = (parsed.target ?? '').toLowerCase();
          const onlyHead = /helm|hood|cap|crown|circlet/.test(target);
          const onlyChest = /chest|plate|vest|robe|cloth|mantle|harness|breastplate|cuirass/.test(target);
          const onlyLegs = /legg|greav|pants|trouser|kilt/.test(target);
          const onlyFeet = /boot|shoe|sandal|sabaton/.test(target);
          const onlyAmulet = /amulet|locket|necklace|diadem|charm/.test(target);
          const onlyRing = /ring|band|seal/.test(target);
          if (onlyHead) get().unequipSlot('head');
          else if (onlyChest) get().unequipSlot('chest');
          else if (onlyLegs) get().unequipSlot('legs');
          else if (onlyFeet) get().unequipSlot('feet');
          else if (onlyAmulet) get().unequipSlot('amulet');
          else if (onlyRing) get().unequipSlot('ring');
          else {
            // No specific target — clear hands.
            get().unequipSlot('main');
            get().unequipSlot('off');
          }
          break;
        }
        // EQUIP path — defaults to main hand for weapons, armor slot for armor.
        const lookup = parsed.resolvedNoun ?? parsed.target ?? '';
        if (!lookup.trim()) {
          get().appendLog(
            'arbiter',
            `The Arbiter raises an eyebrow. "Equip what? Open your inventory and tap an item."`,
          );
          break;
        }
        const inInventory = player.inventory.find((i) => i.name.toLowerCase() === lookup.toLowerCase());
        if (!inInventory) {
          get().appendLog(
            'arbiter',
            `The Arbiter glances at your pack. "I do not see any ${lookup.toLowerCase()} on you."`,
          );
          break;
        }
        const validSlots = validSlotsForItem(inInventory);
        if (validSlots.length === 0) {
          get().appendLog('arbiter', `The Arbiter frowns. "That is not a thing you can wear or wield."`);
          break;
        }
        const slot: EquipSlot = trimmed.toLowerCase().includes('off') && validSlots.includes('off')
          ? 'off'
          : validSlots[0]!;
        get().equipItem(inInventory.name, slot);
        break;
      }
      case 'repair': {
        const target = parsed.resolvedNoun ?? parsed.target ?? '';
        if (!target.trim()) {
          get().appendLog('arbiter', `The Arbiter taps your pack. "Repair what? Name the gear."`);
          break;
        }
        get().repairWithVendor(target);
        break;
      }
      case 'dig': {
        get().digHere();
        break;
      }
      case 'throw': {
        // Player-driven projectile use. The player picked something from
        // their pack (or a generic noun) and chucked it at a target. We
        // resolve in order of permissiveness:
        //   1) Resolved inventory item → spend a quantity, narrate.
        //   2) Target matches an enemy → roll a thrown attack at -2.
        //   3) Target is a hook noun → engage the hook (someone notices).
        //   4) Target is an ambient noun → narrate a thunk.
        const tgt = (parsed.target ?? '').toLowerCase().trim();
        const invItem = parsed.resolvedItemId
          ? player.inventory.find((i) => i.id === parsed.resolvedItemId)
          : null;
        const itemUsed = invItem ?? player.inventory.find(
          (i) => tgt && i.name.toLowerCase().split(/\s+/).some((w) => tgt.includes(w)),
        );
        const enemyHit = currentScene.enemies.find((e) =>
          tgt && (e.name.toLowerCase().includes(tgt) || (e.aliases ?? []).some((a) => tgt.includes(a))),
        );
        const hookMatch = matchHookNoun(tgt, currentScene.hooks ?? []);
        const ambient = matchAmbientNoun(tgt, currentScene.ambientNouns ?? []);
        // Consume the item if we had one — throwing it spends a quantity.
        if (itemUsed) {
          set((s) => s.player ? {
            player: {
              ...s.player,
              inventory: s.player.inventory
                .map((i) => i.id === itemUsed.id ? { ...i, quantity: i.quantity - 1 } : i)
                .filter((i) => i.quantity > 0),
            },
          } : s);
        }
        if (enemyHit) {
          // Improvised ranged attack at -2. Quick narration, no full dice
          // prompt — this is a desperate action, not a primary attack mode.
          const stats = effectiveStats(player, weatherStatModifiers(currentScene.weather));
          const roll = rollDie(20);
          const total = roll + stats.dexterity - 2;
          const ac = Math.max(5, Math.min(18, 5 + (parseInt(String(enemyHit.abilityPoint), 10) || 0)));
          let hit = total >= ac;
          const projectile = itemUsed ? itemUsed.name.toLowerCase() : 'a stone';
          get().appendLog(
            'combat',
            `You — thrown ${projectile} → d20 ${roll} + DEX ${stats.dexterity} − 2 (improvised) = ${total} vs ${enemyHit.name} AC ${ac} — ${hit ? '✓ HIT' : '✗ MISS'}`,
          );
          // Agile / quick enemies get a dodge save against a thrown
          // projectile just like a melee swing.
          if (hit) {
            const dodgeChance = traitDodgeChance(enemyHit.traits);
            if (dodgeChance > 0 && Math.random() < dodgeChance) {
              get().appendLog('combat', `${enemyHit.name} sidesteps the ${projectile}. (dodged)`);
              hit = false;
            }
          }
          if (hit) {
            // Damage scales by the projectile's weight. A locket does 1.
            // A weapon does 1d6. A stone core does 1d8+1.
            const dmg = Math.max(1, rollThrowDamage(itemUsed ?? null));
            const wLabel = itemUsed ? ` (${weightLabel(itemWeight(itemUsed))})` : '';
            const idx = currentScene.enemies.indexOf(enemyHit);
            const hps = [...currentScene.enemyHps];
            hps[idx] = Math.max(0, (hps[idx] ?? enemyHit.hp) - dmg);
            set((s) => s.currentScene ? { currentScene: { ...s.currentScene, enemyHps: hps } } : s);
            get().appendLog('combat', `The ${projectile}${wLabel} hits ${enemyHit.name} for ${dmg}. (${hps[idx]}/${enemyHit.hp} HP)`);
            if ((hps[idx] ?? 0) <= 0) get().resolveEnemyDefeat();
          } else {
            get().appendLog('world', `The ${projectile} skitters past ${enemyHit.name} and lands in the silt.`);
          }
          set({ player: advanceTime(spendStamina(player, STAMINA_COSTS.attack), 0.1) });
          break;
        }
        if (hookMatch && !hookMatch.resolved) {
          // Thrown object lands near a hook entity — the noise wakes the
          // chain whether they like it or not.
          get().appendLog(
            'world',
            itemUsed
              ? `You throw the ${itemUsed.name.toLowerCase()} toward ${tgt || 'the noise'}. It thumps into the dust.`
              : `You throw a stone toward ${tgt}. It clatters off something.`,
          );
          resolveHookOneStep(hookMatch, get, set);
          break;
        }
        if (ambient || tgt) {
          const noun = ambient ?? tgt;
          get().appendLog(
            'world',
            itemUsed
              ? `You hurl the ${itemUsed.name.toLowerCase()} at ${noun}. It bounces off and rolls into the dust.`
              : `You toss a stone at ${noun}. The sound carries, then dies.`,
          );
          break;
        }
        get().appendLog(
          'arbiter',
          `The Arbiter raises a brow. "Throw what, where? Name an item from your pack and a target."`,
        );
        break;
      }
      // New action-card intents. Lightweight handlers — narrate the
      // attempt + cost a slice of stamina/time so the world feels
      // responsive. Most route through skill-check templates when there's
      // something specific to interact with. The Arbiter explains each
      // via concept lookup ("what is dash", "what is disengage").
      case 'climb': {
        set({ player: advanceTime(spendStamina(player, 2), 0.5) });
        const tgt = parsed.target ?? parsed.resolvedNoun ?? 'the surface in front of you';
        get().appendLog(
          'world',
          `You set hands on ${tgt} and start to climb. Hand over hand, breath measured. (1 sq counts as 2 — Climb spends double movement.)`,
        );
        break;
      }
      case 'swim': {
        set({ player: advanceTime(spendStamina(player, 2), 0.5) });
        // Prefer the resolved noun (the catalog/scene name like
        // "Flooded Tunnel") over the raw target — "swim through the
        // tunnel" was narrating "you wade into through tunnel" because
        // the verb-stripped target retained the preposition. Strip
        // common prepositions from the raw target as a fallback when
        // no canonical noun resolved.
        const raw = (parsed.target ?? '').replace(/^(through|into|across|to|over|under|past|the)\s+/i, '').trim();
        const tgt = parsed.resolvedNoun ?? (raw.length > 0 ? raw : 'the water');
        get().appendLog(
          'world',
          `You wade into ${tgt}, mud-water lapping at your gear. Each stroke costs double. The current has opinions.`,
        );
        break;
      }
      case 'jump': {
        set({ player: advanceTime(spendStamina(player, 1), 0.1) });
        const tgt = parsed.target ?? '';
        get().appendLog(
          'world',
          tgt
            ? `You launch yourself toward ${tgt}. Standing long jump — 3 squares without a STR check, more with one.`
            : `You leap. Standing long jump — 3 squares clean. With a STR check, you could push it further.`,
        );
        break;
      }
      case 'dash': {
        // Sprint / dash. Doubles movement but next attack/defense rolls
        // take a 2-penalty (sprinting status, 1 round).
        const sprinting: StatusEffect = {
          kind: 'sprinting',
          remainingRounds: 1,
          label: 'sprinting',
        };
        set((s) =>
          s.player
            ? {
                player: {
                  ...s.player,
                  statusEffects: applyEffect(s.player.statusEffects ?? [], sprinting),
                  hoursElapsed: (s.player.hoursElapsed ?? 0) + 0.25,
                  stamina: Math.max(0, s.player.stamina - 2),
                },
              }
            : s,
        );
        get().appendLog(
          'world',
          `You break into a run. Movement doubles this turn — but any combat action this round and next takes a penalty die (-2). Cost: 2 stamina, 15 min.`,
        );
        break;
      }
      case 'disengage': {
        if (currentScene.enemies.length === 0) {
          get().appendLog(
            'arbiter',
            `The Arbiter tilts their head. "Disengage from what? No one is on you."`,
          );
          break;
        }
        // Apply the in_cover effect briefly — represents the careful
        // footwork that denies the opportunity attack. The label clarifies.
        const disengaging: StatusEffect = {
          kind: 'in_cover',
          remainingRounds: 1,
          label: 'disengaging',
        };
        set((s) =>
          s.player
            ? {
                player: {
                  ...s.player,
                  statusEffects: applyEffect(s.player.statusEffects ?? [], disengaging),
                  hoursElapsed: (s.player.hoursElapsed ?? 0) + 0.1,
                },
              }
            : s,
        );
        get().appendLog(
          'world',
          `You peel off the line, footwork careful. No opportunity attack as you break contact (+4 defense this round).`,
        );
        break;
      }
      case 'help': {
        set({ player: advanceTime(spendStamina(player, 1), 0.1) });
        const tgt = parsed.target ?? parsed.resolvedNoun ?? 'the nearest ally';
        // Apply 'helping' status — narrative-only in single-player; in
        // future multi-actor scenes the ally's next roll would consume it.
        const helping: StatusEffect = {
          kind: 'helping',
          remainingRounds: 1,
          label: `helping ${tgt}`,
        };
        set((s) =>
          s.player
            ? { player: { ...s.player, statusEffects: applyEffect(s.player.statusEffects ?? [], helping) } }
            : s,
        );
        get().appendLog(
          'world',
          `You shoulder in beside ${tgt}. Their next ability check or attack rolls at Advantage — if they're within 5 ft. Cost: 1 Combat Action.`,
        );
        break;
      }
      case 'ready': {
        set({ player: advanceTime(spendStamina(player, 1), 0.1) });
        const tgt = parsed.target ?? 'whatever moves next';
        const readying: StatusEffect = {
          kind: 'ready',
          remainingRounds: 1,
          label: `ready: ${tgt}`,
        };
        set((s) =>
          s.player
            ? { player: { ...s.player, statusEffects: applyEffect(s.player.statusEffects ?? [], readying) } }
            : s,
        );
        get().appendLog(
          'world',
          `You hold your turn, watching for ${tgt}. When that trigger fires you get a +1 bonus die on the reaction. Cost: 1 turn.`,
        );
        break;
      }
      case 'mount': {
        set({ player: advanceTime(spendStamina(player, 1), 0.1) });
        get().appendLog(
          'arbiter',
          `The Arbiter shrugs. "Tartaria forgot mounts a long time ago. The frame is here for when a beast worth riding shows up — until then it costs half your Speed to climb on nothing."`,
        );
        break;
      }
      case 'take_cover': {
        // Detect full vs partial cover from the player's phrasing.
        // "full cover" / "hide completely" / "go prone behind" → full.
        // Default and "duck behind" / "tuck" / "shelter" → partial.
        const wantsFull = /\b(full cover|fully behind|complete cover|hide completely|drop prone|out of sight|fully concealed)\b/i.test(trimmed);
        const kind: StatusEffect['kind'] = wantsFull ? 'in_cover_full' : 'in_cover';
        const cover: StatusEffect = {
          kind,
          remainingRounds: 2,
          label: wantsFull ? 'full cover' : 'partial cover',
        };
        set((s) =>
          s.player
            ? {
                player: {
                  ...s.player,
                  statusEffects: applyEffect(s.player.statusEffects ?? [], cover),
                  hoursElapsed: (s.player.hoursElapsed ?? 0) + 0.1,
                },
              }
            : s,
        );
        const inCombat = currentScene.enemies.length > 0;
        const line = wantsFull
          ? (inCombat
              ? `You bury yourself in full cover. Ranged attacks against you AUTO-MISS for 2 rounds; you cannot attack out without breaking cover.`
              : `You take full cover, out of every sight line the room offers.`)
          : (inCombat
              ? `You dive behind partial cover. Ranged attacks against you take a penalty die (+4 to your defense, 2 rounds).`
              : `You tuck against the nearest cover. The world keeps moving without you for a beat.`);
        get().appendLog('world', line);
        break;
      }
      case 'aim': {
        // Stage a +2 bonus on the next ranged attack via the aiming
        // status kind. Consumed on the next ranged attack via the
        // rollMods consume list.
        const equipped = player.equipped?.main ? findWeaponByName(player.equipped.main) : null;
        if (!equipped || equipped.weaponKind === 'melee') {
          get().appendLog(
            'arbiter',
            `The Arbiter waits. "Aim what? You need a ranged weapon — a bow, a bolt-caster, a runecaster — in hand."`,
          );
          break;
        }
        const aiming: StatusEffect = {
          kind: 'aiming',
          remainingRounds: 1,
          label: 'aiming',
        };
        set((s) =>
          s.player
            ? {
                player: {
                  ...s.player,
                  statusEffects: applyEffect(s.player.statusEffects ?? [], aiming),
                  hoursElapsed: (s.player.hoursElapsed ?? 0) + 0.1,
                },
              }
            : s,
        );
        get().appendLog(
          'world',
          `You bring the ${equipped.name} up and breathe out. Next shot rolls with Advantage — +2 to hit, lost if you take damage or your target moves before firing.`,
        );
        break;
      }
      case 'reload': {
        set({ player: advanceTime(spendStamina(player, 1), 0.1) });
        const equipped = player.equipped?.main ? findWeaponByName(player.equipped.main) : null;
        if (!equipped || equipped.weaponKind === 'melee') {
          get().appendLog(
            'arbiter',
            `The Arbiter watches you fumble. "Nothing to reload — that one bites with its edge, not its magazine."`,
          );
          break;
        }
        get().appendLog(
          'world',
          `You reload the ${equipped.name}. Fresh bolts seated; the next shot won't catch you empty.`,
        );
        break;
      }
      case 'maneuver': {
        // Fighting Maneuver — disarm, grapple, trip, shove. Compare the
        // builds of attacker and defender per the action card.
        //   defender build > attacker by 1  →  +1 penalty die
        //   defender build > attacker by 2  →  +2 penalty dice
        //   defender build > attacker by 3+ →  impossible
        if (currentScene.enemies.length === 0) {
          get().appendLog(
            'arbiter',
            `The Arbiter raises a brow. "Maneuver against whom? Empty ground does not grapple back."`,
          );
          break;
        }
        const enemy = activeEnemy(currentScene)!;
        const playerBuild = playerBuildScore(player);
        const enemyBuild = enemyBuildScore(enemy);
        const buildDelta = enemyBuild - playerBuild;
        if (buildDelta >= 3) {
          get().appendLog(
            'arbiter',
            `The Arbiter shakes their head. "${enemy.name} outweighs you by ${buildDelta}. That maneuver is impossible — try violence, distance, or something they don't expect."`,
          );
          break;
        }
        // Apply penalty dice via surprised-style consumable status the
        // skill check picks up automatically through rollMods.
        const penaltyDice = Math.max(0, buildDelta);
        for (let i = 0; i < penaltyDice; i++) {
          set((s) =>
            s.player
              ? { player: { ...s.player, statusEffects: applyEffect(s.player.statusEffects ?? [], { kind: 'surprised', remainingRounds: 1, label: `build mismatch -${penaltyDice}` }) } }
              : s,
          );
        }
        set({ player: advanceTime(spendStamina(player, STAMINA_COSTS.skillCheck), 0.1) });
        // Route the maneuver to the right stat per the action card —
        // disarm/trip/sweep/hook → DEX; grapple/shove/pin → STR.
        const maneuverKind = classifyManeuver(trimmed);
        // Read current statusEffects AFTER the surprised stack was
        // applied above. rollMods('skill') picks up surprised's -2
        // per stack so the build-mismatch penalty actually lands on
        // the roll instead of vanishing silently.
        const liveFx = get().player?.statusEffects;
        const steps = buildSkillSteps(maneuverKind, player, {
          weatherMod: weatherStatModifiers(currentScene.weather),
          companionAssist: !!player.companion,
          statusMods: rollMods(liveFx, 'skill'),
        });
        set({ pendingRolls: { actionText: trimmed, steps, currentStep: 0 } });
        const buildNote = penaltyDice > 0
          ? ` ${enemy.name} is built tougher (${enemyBuild} vs your ${playerBuild}); -${penaltyDice * 2} on the roll.`
          : ` Build favors you (${playerBuild} vs ${enemyBuild}); maneuver lands clean if you make the roll.`;
        get().appendLog(
          'world',
          `You commit to the maneuver — disarm, trip, or grapple.${buildNote} Success knocks your target off-balance for a round.`,
        );
        break;
      }
      case 'quick_fire': {
        // Quick Fire: state intent to fire FIRST this round. Grants a
        // +2 status bonus on the next ranged attack THIS turn (our
        // initiative-bonus surrogate, since we don't model dex-based
        // initiative slots yet). Lost if the player takes any action
        // before firing other than dodge/counter.
        const equipped = player.equipped?.main ? findWeaponByName(player.equipped.main) : null;
        if (!equipped || equipped.weaponKind === 'melee') {
          get().appendLog(
            'arbiter',
            `The Arbiter shakes their head. "Quick Fire wants a ranged weapon in hand — bolt-caster, bow, runecaster. Equip something that shoots."`,
          );
          break;
        }
        const qf: StatusEffect = {
          kind: 'quick_fire',
          remainingRounds: 1,
          label: 'quick fire',
        };
        set((s) =>
          s.player
            ? {
                player: {
                  ...s.player,
                  statusEffects: applyEffect(s.player.statusEffects ?? [], qf),
                  hoursElapsed: (s.player.hoursElapsed ?? 0) + 0.05,
                },
              }
            : s,
        );
        get().appendLog(
          'world',
          `You snap the ${equipped.name} up — declared Quick Fire. +50 initiative this round; +2 to your next shot. Lose the bonus if you move, brawl, or take damage before firing. Cost: 1 turn.`,
        );
        break;
      }
      case 'multi_fire': {
        // Multiple Shot / Burst Fire / Double Tap. Fire 2-3 times this
        // turn, each shot at -2 cumulative penalty. Resolves all shots
        // immediately without dice prompts — this is a burst action.
        const targetEnemy = activeEnemy(currentScene);
        if (!targetEnemy) {
          get().appendLog('arbiter', `The Arbiter waits. "Multi-fire at whom? No target on the line."`);
          break;
        }
        const equipped = player.equipped?.main ? findWeaponByName(player.equipped.main) : null;
        if (!equipped || equipped.weaponKind === 'melee') {
          get().appendLog(
            'arbiter',
            `The Arbiter raises a brow. "${equipped?.name ?? 'Bare hands'} doesn't burst-fire. Equip a handgun-class bolt-caster, runecaster, or burst weapon."`,
          );
          break;
        }
        // Burst count: bolt-caster / handgun = 2, automatic-tagged = 3.
        const tags = equipped.tags ?? [];
        const burstCount = tags.includes('firearm') ? 3 : 2;
        set({ player: advanceTime(spendStamina(player, STAMINA_COSTS.attack + 1), 0.15) });
        get().appendLog(
          'world',
          `You squeeze ${burstCount} shots out of the ${equipped.name}. Each takes a stacking penalty die.`,
        );
        const stats = effectiveStats(player, weatherStatModifiers(currentScene.weather));
        const statVal = stats[equipped.stat];
        const statLabel = equipped.stat.slice(0, 3).toUpperCase();
        let livingHp = currentScene.enemyHps[currentScene.activeEnemyIdx] ?? targetEnemy.hp;
        let killed = false;
        for (let i = 0; i < burstCount && livingHp > 0; i++) {
          const penalty = i * 2;
          const roll = rollDie(20);
          const total = roll + statVal - penalty;
          const ac = Math.max(5, Math.min(18, 5 + (parseInt(String(targetEnemy.abilityPoint), 10) || 0)));
          const hit = total >= ac;
          get().appendLog(
            'combat',
            `Shot ${i + 1}/${burstCount} — d20 ${roll} + ${statLabel} ${statVal}${penalty ? ` − ${penalty} (burst)` : ''} = ${total} vs AC ${ac} — ${hit ? '✓ HIT' : '✗ MISS'}`,
          );
          if (hit) {
            const dmg = Math.max(1, rollDie(equipped.damageDice.includes('d10') ? 10 : 6));
            livingHp = Math.max(0, livingHp - dmg);
            get().appendLog('combat', `Bolt ${i + 1} hits ${targetEnemy.name} for ${dmg}. (${livingHp}/${targetEnemy.hp} HP)`);
            if (livingHp <= 0) {
              killed = true;
              break;
            }
          }
        }
        if (killed) {
          set((s) => {
            if (!s.currentScene) return {};
            const hps = [...s.currentScene.enemyHps];
            hps[s.currentScene.activeEnemyIdx] = 0;
            return { currentScene: { ...s.currentScene, enemyHps: hps } };
          });
          get().resolveEnemyDefeat();
        } else {
          set((s) => {
            if (!s.currentScene) return {};
            const hps = [...s.currentScene.enemyHps];
            hps[s.currentScene.activeEnemyIdx] = livingHp;
            return { currentScene: { ...s.currentScene, enemyHps: hps } };
          });
          runEnemyGroupCounters(get, set, player);
        }
        break;
      }
      case 'fight_back': {
        // Apply fighting_back status. The next enemy counter-attack
        // resolves as an opposed Fighting roll instead of a flat dodge.
        if (currentScene.enemies.length === 0) {
          get().appendLog('arbiter', `The Arbiter shrugs. "Fight back against whom? You're alone."`);
          break;
        }
        const fb: StatusEffect = {
          kind: 'fighting_back',
          remainingRounds: 2,
          label: 'fighting back',
        };
        set((s) =>
          s.player
            ? {
                player: {
                  ...s.player,
                  statusEffects: applyEffect(s.player.statusEffects ?? [], fb),
                  hoursElapsed: (s.player.hoursElapsed ?? 0) + 0.05,
                },
              }
            : s,
        );
        get().appendLog(
          'world',
          `You set your stance. Next time an enemy strikes, you trade — opposed Fighting roll, the higher success lands. Critical strikes don't apply on a fight-back.`,
        );
        break;
      }
      case 'recruit': {
        // HANDOFF #13 first-cut companion system. Recruit a vendor as a
        // companion: they leave the scene and follow the player. Player
        // can only have one companion at a time. Dismiss with "leave"
        // or "dismiss companion".
        const wantsDismiss = /\b(leave|dismiss|part ways|farewell|goodbye)\b/i.test(trimmed) && /\b(companion|follower|ally|friend)\b/i.test(trimmed);
        if (wantsDismiss) {
          if (!player.companion) {
            get().appendLog('arbiter', `The Arbiter raises a brow. "You're traveling alone. No one to dismiss."`);
            break;
          }
          const name = player.companion.name;
          set((s) => (s.player ? { player: { ...s.player, companion: null } } : s));
          get().appendLog('world', `${name} steps back from your path. They tip their head and turn down a different road. You travel alone again.`);
          break;
        }
        if (player.companion) {
          get().appendLog(
            'arbiter',
            `The Arbiter glances at ${player.companion.name}. "You already have a companion. Dismiss them first."`,
          );
          break;
        }
        if (!currentScene.vendor) {
          get().appendLog(
            'arbiter',
            `The Arbiter shakes their head. "No one here to recruit. Find a vendor scene — a face is needed."`,
          );
          break;
        }
        const v = currentScene.vendor;
        set((s) => {
          if (!s.player || !s.currentScene) return s;
          return {
            player: {
              ...s.player,
              companion: {
                name: v.name,
                title: v.title,
                factionId: v.faction ?? null,
                recruitedAt: s.player.hoursElapsed ?? 0,
              },
            },
            // Vendor leaves the scene — they're with you now.
            currentScene: { ...s.currentScene, vendor: null },
          };
        });
        get().appendLog(
          'world',
          `${v.name} closes their pack and steps in beside you. "Lead, then." You have a companion. (Type "dismiss companion" to part ways.)`,
        );
        void get().persist();
        break;
      }
      case 'drop': {
        const target = (parsed.target ?? parsed.resolvedNoun ?? '').trim();
        if (!target) {
          get().appendLog('arbiter', `The Arbiter raises a brow. "Drop what? Name an item from your pack."`);
          break;
        }
        const item = player.inventory.find(
          (i) => i.name.toLowerCase() === target.toLowerCase() || i.id === target,
        );
        if (!item) {
          get().appendLog('arbiter', `The Arbiter shakes their head. "${target} isn't in your pack."`);
          break;
        }
        // Equipped items can't be dropped without unequipping first —
        // would otherwise leave the player wielding a phantom blade.
        const eq = player.equipped ?? {};
        const equippedSlots = ['main', 'off', 'head', 'chest', 'legs', 'feet', 'amulet', 'ring'] as const;
        const isEquipped = equippedSlots.some((slot) => eq[slot] === item.name);
        if (isEquipped) {
          get().appendLog('arbiter', `The Arbiter taps your hand. "Unequip the ${item.name} first — you can't drop what you're wielding."`);
          break;
        }
        const dropKey = makeRoomKey(player.currentLocationId, currentScene.microMicroId, player.mapX, player.mapY);
        const dropOne: InventoryItem = { ...item, quantity: 1 };
        // Remove one from player inventory.
        const newInventory = player.inventory
          .map((i) => (i.id === item.id ? { ...i, quantity: i.quantity - 1 } : i))
          .filter((i) => i.quantity > 0);
        set((s) => {
          if (!s.player) return s;
          const room = s.worldMemory.visitedRooms?.[dropKey] ?? {
            firstVisitAt: Date.now(),
            lastVisitAt: Date.now(),
            visitCount: 1,
          };
          // Merge with any existing dropped pile (same name → bump qty).
          const dropped = [...(room.droppedItems ?? [])];
          const exist = dropped.findIndex((d) => d.name === dropOne.name);
          if (exist >= 0) dropped[exist] = { ...dropped[exist]!, quantity: dropped[exist]!.quantity + 1 };
          else dropped.push(dropOne);
          return {
            player: { ...s.player, inventory: newInventory },
            worldMemory: {
              ...s.worldMemory,
              visitedRooms: {
                ...(s.worldMemory.visitedRooms ?? {}),
                [dropKey]: { ...room, droppedItems: dropped },
              },
            },
          };
        });
        get().appendLog('world', `You drop the ${item.name}. It lies on the ground here.`);
        void get().persist();
        break;
      }
      case 'pickup': {
        const target = (parsed.target ?? parsed.resolvedNoun ?? '').trim();
        const dropKey = makeRoomKey(player.currentLocationId, currentScene.microMicroId, player.mapX, player.mapY);
        const room = get().worldMemory.visitedRooms?.[dropKey];
        const dropped = room?.droppedItems ?? [];
        if (dropped.length === 0) {
          get().appendLog('world', `The ground here is bare. Nothing to pick up.`);
          break;
        }
        const pickItem = target
          ? dropped.find((d) => d.name.toLowerCase().includes(target.toLowerCase()) || d.id === target)
          : dropped[0];
        if (!pickItem) {
          const names = dropped.map((d) => `"${d.name}"`).join(', ');
          get().appendLog('arbiter', `The Arbiter scans the ground. "I see ${names} here. Name one."`);
          break;
        }
        const remaining = dropped
          .map((d) => (d.name === pickItem.name ? { ...d, quantity: d.quantity - 1 } : d))
          .filter((d) => d.quantity > 0);
        set((s) => {
          if (!s.player || !s.worldMemory.visitedRooms?.[dropKey]) return s;
          // Merge into player inventory.
          const inv = [...s.player.inventory];
          const existing = inv.findIndex((i) => i.name === pickItem.name);
          if (existing >= 0) inv[existing] = { ...inv[existing]!, quantity: inv[existing]!.quantity + 1 };
          else inv.push({ ...pickItem, quantity: 1 });
          return {
            player: { ...s.player, inventory: inv },
            worldMemory: {
              ...s.worldMemory,
              visitedRooms: {
                ...s.worldMemory.visitedRooms,
                [dropKey]: { ...s.worldMemory.visitedRooms[dropKey]!, droppedItems: remaining },
              },
            },
          };
        });
        get().appendLog('world', `You pick up the ${pickItem.name}.`);
        void get().persist();
        break;
      }
      case 'open': {
        // Open / unlock / disarm / dismantle — persistent room state.
        // First open on a recognisable container type ALSO rolls a
        // small loot bundle. Container archetypes (lockbox / trap /
        // crate / automaton / relic_console / wreckage / …) live in
        // app/data/world/container_loot.json — adding a new type is a
        // JSON edit, not a code edit. See app/engine/containerLoot.ts.
        const target = (parsed.target ?? parsed.resolvedNoun ?? '').trim();
        if (!target) {
          get().appendLog('arbiter', `The Arbiter raises a brow. "Open what? Name the chest, crate, or door."`);
          break;
        }
        const dropKey = makeRoomKey(player.currentLocationId, currentScene.microMicroId, player.mapX, player.mapY);
        const room = get().worldMemory.visitedRooms?.[dropKey] ?? {
          firstVisitAt: Date.now(),
          lastVisitAt: Date.now(),
          visitCount: 1,
        };
        const key = target.toLowerCase();
        if ((room.containersOpened ?? []).includes(key)) {
          get().appendLog('world', `The ${target} is already open from earlier. Nothing new inside.`);
          break;
        }
        const opened = [...(room.containersOpened ?? []), key];
        set((s) => ({
          worldMemory: {
            ...s.worldMemory,
            visitedRooms: {
              ...(s.worldMemory.visitedRooms ?? {}),
              [dropKey]: { ...room, containersOpened: opened },
            },
          },
        }));
        const matched = classifyContainer(target);
        if (!matched) {
          // If the target is something the player is carrying, narrate
          // it as an inspection rather than a door-forcing — "open the
          // locket" should not return "you force the locket open, it
          // stays open." The locket has no compartment; say so plainly.
          const inv = player.inventory ?? [];
          const heldItem = inv.find(
            (it) =>
              it.name.toLowerCase() === key ||
              it.name.toLowerCase().includes(key) ||
              key.includes(it.name.toLowerCase()),
          );
          if (heldItem) {
            get().appendLog(
              'world',
              `You turn the ${heldItem.name} over in your hands. No clasp, no compartment — it is solid where it looks like it should open. The thing it carries, it carries in its hum.`,
            );
            void get().persist();
            break;
          }
          // No archetype, not an inventory item — door / wall / generic
          // mechanism. Just narrate.
          get().appendLog('world', `You force the ${target} open. It stays open.`);
          void get().persist();
          break;
        }
        const rolled = rollFromPool(matched.pool);
        if (!rolled) {
          get().appendLog('world', containerNarrate(matched, target));
          void get().persist();
          break;
        }
        // Collectable-fragment substitution. Same gate as wasteland
        // encounters — biome match + un-owned + 8% chance. When it
        // fires, the fragment replaces the rolled item entirely
        // (consumes the drop slot per the design spec).
        const containerFragId = pickFragmentForBiome(
          player.collectables ?? [],
          currentScene.location.tags ?? [],
        );
        if (containerFragId) {
          get().appendLog('world', containerNarrate(matched, target));
          get().grantCollectableFragment(containerFragId);
          void get().persist();
          break;
        }
        const grantResult = grantItem(player.inventory, {
          id: `${rolled.entry.name}_${Date.now()}`,
          name: rolled.entry.name,
          kind: rolled.entry.kind,
          quantity: rolled.quantity,
          tags: rolled.entry.tags,
        });
        set((s) =>
          s.player ? { player: { ...s.player, inventory: grantResult.inventory } } : s,
        );
        get().appendLog('world', containerNarrate(matched, target));
        const actualQty = grantResult.accepted;
        if (actualQty > 0) {
          get().appendLog(
            'reward',
            `✦ Recovered ${rolled.entry.name}${actualQty > 1 ? ` x${actualQty}` : ''} from the ${target}.`,
          );
        } else {
          get().appendLog('world', `Inventory cap reached — the ${rolled.entry.name} stays behind.`);
        }
        void get().persist();
        break;
      }
      case 'accept': {
        const target = parsed.target ?? parsed.resolvedNoun ?? '';
        if (!target.trim()) {
          // QA finding: the simulator ran 999 actions through faction
          // territory and never accepted a quest because "accept" with
          // no target just refused. When a faction vendor IS present,
          // list what's on offer so the player can name one. Otherwise
          // keep the generic refusal — quests come from vendors.
          const vendor = currentScene.vendor;
          if (vendor?.faction) {
            const pool = availableFactionQuests(
              vendor.faction,
              getStanding(player.factionStanding, vendor.faction),
              player.activeFactionQuestIds ?? [],
              player.completedFactionQuestIds ?? [],
            );
            const titles = pool.map((q) => `"${q.title}"`).join(', ');
            get().appendLog(
              'arbiter',
              titles
                ? `${vendor.name} folds their arms. "On offer: ${titles}. Type 'accept <title>' to take one."`
                : `${vendor.name} shrugs. "Nothing for you right now — check back after I've travelled."`,
            );
          } else {
            get().appendLog('arbiter', `The Arbiter raises a brow. "Accept what? Find a faction vendor and ask what's on offer."`);
          }
          break;
        }
        const lower = target.toLowerCase();
        const huntHint = /hunt|bounty|titan|dragon|behemoth|chimera|wyvern|monarch|siren|queen/.test(lower);
        const mysteryHint = /mystery|fragment|compass|orb|eye|watch|red tower|cradle|leviathan|obsidian|temporal/.test(lower);
        const storyHint = /storyline|story|path|ascension|run|relic run|silence|red tower|tartarian path|true tartarian/.test(lower);
        if (storyHint && fuzzyFindStoryline(target, STORYLINES)) {
          get().acceptStoryline(target);
        } else if (mysteryHint && fuzzyFindMystery(target, MYSTERIES)) {
          get().acceptMystery(target);
        } else if (huntHint && fuzzyFindHunt(target, HUNTS)) {
          get().acceptHunt(target);
        } else {
          get().acceptFactionQuest(target);
        }
        break;
      }
      case 'turn_in': {
        const target = parsed.target ?? parsed.resolvedNoun ?? '';
        if (!target.trim()) {
          get().appendLog(
            'arbiter',
            `The Arbiter folds their arms. "Name the contract you mean to turn in."`,
          );
          break;
        }
        const lower = target.toLowerCase();
        const huntHint = /hunt|bounty|titan|dragon|behemoth|chimera|wyvern|monarch|siren|queen|trophy/.test(lower);
        const mysteryHint = /mystery|fragment|compass|orb|eye|watch|red tower|cradle|leviathan|obsidian|temporal/.test(lower);
        const storyHint = /storyline|story|path|ascension|run|relic run|silence|red tower|tartarian path/.test(lower);
        if (storyHint && fuzzyFindStoryline(target, STORYLINES)) {
          get().turnInStoryline(target);
        } else if (mysteryHint && fuzzyFindMystery(target, MYSTERIES)) {
          get().turnInMystery(target);
        } else if (huntHint && fuzzyFindHunt(target, HUNTS)) {
          get().turnInHunt(target);
        } else {
          get().turnInFactionQuest(target);
        }
        break;
      }
      case 'gift': {
        if (!currentScene.vendor) {
          get().appendLog('arbiter', `The Arbiter glances at the empty road. "No one here to gift to."`);
          break;
        }
        const target = parsed.resolvedNoun ?? parsed.target ?? '';
        if (!target.trim()) {
          get().appendLog('arbiter', `The Arbiter tilts their head. "Gift what? Name a thing from your pack."`);
          break;
        }
        get().giftToVendor(target);
        break;
      }
      case 'steal': {
        const stealTarget = (parsed.resolvedNoun ?? parsed.target ?? '').trim();
        // Vendor present → real theft attempt against their inventory.
        if (currentScene.vendor) {
          if (!stealTarget) {
            get().appendLog('arbiter', `The Arbiter narrows their eyes. "Steal what? Name it precisely."`);
            break;
          }
          get().stealFromVendor(stealTarget);
          break;
        }
        // No vendor — but the player wants to pocket something the world
        // narrated (a green lantern by the wall, a tool on a bench). If
        // the target matches an ambient noun, treat it as an opportunistic
        // grab with a DEX check. Soft outcome — you get a token salvage
        // material or you get nothing, you do NOT get the actual described
        // object as a typed inventory item unless the catalog has one.
        const ambient = stealTarget
          ? matchAmbientNoun(stealTarget, currentScene.ambientNouns ?? [])
          : null;
        if (ambient) {
          const stats = effectiveStats(player, weatherStatModifiers(currentScene.weather));
          const roll = rollDie(20);
          const total = roll + stats.dexterity;
          const success = total >= 10;
          get().appendLog(
            'combat',
            `You — sleight of hand on ${ambient} → d20 ${roll} + DEX ${stats.dexterity} = ${total} vs DC 10 — ${success ? '✓ HIT' : '✗ MISS'}`,
          );
          if (success) {
            // Grant a small generic salvage item — represents whatever
            // detached from the scene fixture.
            const salvage: InventoryItem = stampDurability({
              id: `salvage_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              name: 'Aether Residue',
              kind: 'misc',
              rarity: 'Common',
              quantity: 1,
              tags: ['salvage', 'scrap'],
            });
            set((s) =>
              s.player ? { player: { ...s.player, inventory: mergeOrPushItem(s.player.inventory, salvage) } } : s,
            );
            get().appendLog('world', `You pry loose what you can from the ${ambient}. A small handful of residue goes into your pack.`);
            get().appendLog('reward', `✦ Aether Residue (Common).`);
          } else {
            get().appendLog('world', `Your hand slips on the ${ambient}. It stays where it was.`);
          }
          set({ player: advanceTime(spendStamina(player, STAMINA_COSTS.skillCheck), 0.25) });
          break;
        }
        get().appendLog('arbiter', `The Arbiter watches the empty path. "Nothing to steal here."`);
        break;
      }
      case 'join': {
        // Resolve the player's target text to a faction id.
        const target = (parsed.target ?? '').toLowerCase().trim();
        if (!target) {
          get().appendLog(
            'arbiter',
            `The Arbiter waits. "Which faction? Mud Monarchs, Forgotten Order, Reclaimers Guild, True Tartarians, Eternal Dynasty."`,
          );
          break;
        }
        const match = FACTIONS.find(
          (f) => f.name.toLowerCase().includes(target) || target.includes(f.name.toLowerCase()) || f.id === target,
        );
        if (!match) {
          get().appendLog(
            'arbiter',
            `The Arbiter looks puzzled. "I do not know a faction by that name."`,
          );
          break;
        }
        get().joinFaction(match.id);
        break;
      }
      case 'craft': {
        // No target — open the CraftingScreen so the player can see
        // every recipe visually (matches the quick-button behavior).
        // Previously this only logged an Arbiter blurb listing 4
        // recipes; the QA sim flagged the mismatch with the button.
        const target = parsed.target?.trim() ?? '';
        if (!target) {
          get().setScreen('crafting');
          break;
        }
        // Targeted craft — try substring match first, then MiniLM semantic
        // resolution (handles typos + paraphrased names like "aether sword"
        // → "Aetheric Crystal Blade").
        const recipe = findRecipeByResult(target);
        if (!recipe) {
          if (cognitive.isReady()) {
            const recipeNames = RECIPES.map((r) => r.result);
            void cognitive.inferTarget(target, recipeNames, 0.5).then((match) => {
              if (match) {
                get().appendLog(
                  'cognitive',
                  `Resolved "${target}" → "${match.target}" (sim ${match.score.toFixed(2)}).`,
                );
                get().submitPlayerAction(`craft ${match.target}`);
              } else {
                get().appendLog(
                  'arbiter',
                  `The Arbiter shakes their head. "I do not know that recipe. Try 'craft' alone — I will tell you what your pack can become."`,
                );
              }
            }).catch(() => {
              get().appendLog(
                'arbiter',
                `The Arbiter shakes their head. "I do not know that recipe. Try 'craft' alone — I will tell you what your pack can become."`,
              );
            });
            break;
          }
          get().appendLog(
            'arbiter',
            `The Arbiter shakes their head. "I do not know that recipe. Try 'craft' alone — I will tell you what your pack can become."`,
          );
          break;
        }
        const missing = recipe.ingredients.filter(
          (ing) =>
            player.inventory
              .filter((i) => i.name.toLowerCase() === ing.name.toLowerCase())
              .reduce((sum, i) => sum + i.quantity, 0) < ing.quantity,
        );
        if (missing.length > 0) {
          const list = missing.map((m) => `${m.quantity}× ${m.name}`).join(', ');
          get().appendLog(
            'arbiter',
            `"Not yet." the Arbiter says. "${recipe.result} needs ${list}."`,
          );
          break;
        }
        const remaining = consumeIngredients(player.inventory, recipe);
        const catEntry = lookupCraftedItem(recipe.result);
        const crafted: InventoryItem = stampDurability({
          id: `crafted_${Date.now()}`,
          name: recipe.result,
          kind: catEntry.kind === 'weapon' ? 'weapon' : catEntry.kind === 'armor' ? 'armor' : catEntry.kind,
          rarity: catEntry.rarity,
          quantity: 1,
          tags: catEntry.tags,
        });
        // Refuse the craft if the result can't fit (per-name cap). The
        // ingredients have not been consumed yet at this point — fail
        // before we spend materials the player can't store the output of.
        const craftGrant = grantItem(remaining, crafted);
        if (craftGrant.accepted <= 0) {
          get().appendLog(
            'arbiter',
            `The Arbiter raises a brow. "Your pack already holds the limit on ${recipe.result.toLowerCase()}. Free a slot first."`,
            { skipDedup: true },
          );
          break;
        }
        set((s) => ({
          player: s.player ? { ...s.player, inventory: craftGrant.inventory } : s.player,
        }));
        get().appendLog('reward', `✦ Crafted ${recipe.result}. The Arbiter watches you set the last piece.`);
        break;
      }
    }

    if (!get().pendingRolls) {
      const lastCog = get().cognitiveLastResponse;
      const mood = lastCog?.inferredEmotions[0];
      // Filter out player questions / meta-commentary before treating them as
      // "recent actions" the Arbiter can reference. Playtest log showed the
      // Arbiter stitching a frustrated meta-question into a narrative:
      //   "The Arbiter notes how you there is a reclaimer ambusher in the
      //    top right window, I am supposed to be in active combat, how does
      //    advance not take me to an enemy?."
      // Heuristic: drop anything with a question mark, anything beginning
      // with a question word, and anything that looks too long to be a
      // single action phrase.
      const recentActions = get()
        .gameLog.filter((e) => e.channel === 'player')
        .slice(-3)
        .map((e) => e.text)
        .filter((t) => {
          if (!t || t.length > 40) return false;
          if (t.includes('?')) return false;
          if (/^\s*(what|how|why|who|when|where|which|am i|is this|can i|do i)\b/i.test(t)) return false;
          return true;
        });
      const unresolvedHooks = (currentScene.hooks ?? [])
        .filter((h) => !h.resolved)
        .map((h) => ({ kind: h.kind, nouns: h.nouns }));
      const liveEnemy = activeEnemy(currentScene);
      if (
        shouldArbiterSpeak({
          hasEnemy: !!liveEnemy,
          hasUnresolvedHooks: unresolvedHooks.length > 0,
          hasRecentActions: recentActions.length > 0,
          hasMood: !!mood,
        })
      ) {
        // Pull vitals fresh — the action just resolved and HP/stamina
        // may have changed mid-call (combat damage, food consumed, etc.).
        const livePlayer = get().player ?? player;
        const inv = livePlayer.inventory ?? [];
        const hasFirstAidKit = inv.some(
          (it) => /first aid/i.test(it.name) && (it.quantity ?? 1) > 0,
        );
        const hasFood = inv.some(
          (it) =>
            ((it.tags?.includes('food')) ||
              /rations|jerky|biscuit|bread/i.test(it.name)) &&
            (it.quantity ?? 1) > 0,
        );
        const template = buildArbiterRemark({
          location: currentScene.location,
          hazard: currentScene.hazard,
          enemy: liveEnemy,
          intent: parsed.intent,
          mood,
          recentActions,
          unresolvedHooks,
          playerTargetNoun: parsed.resolvedNoun ?? parsed.target ?? undefined,
          playerHpFraction:
            livePlayer.hpMax > 0 ? livePlayer.hp / livePlayer.hpMax : 1,
          playerStaminaFraction:
            (livePlayer.staminaMax ?? 0) > 0
              ? (livePlayer.stamina ?? 0) / livePlayer.staminaMax!
              : 1,
          hasFirstAidKit,
          hasFood,
        });
        void narrateViaArbiter(get, set, template, parsed.intent);
      }
    }

    // Fire-and-forget cognitive enrichment — runs in parallel with the
    // deterministic resolution above, never blocks gameplay.
    if (get().cognitiveStatus === 'ready') {
      const worldCtx: WorldContext = {
        hp: player.hp,
        maxHp: player.hpMax,
        currentLocation: currentScene.location.name,
        nearbyObjects: collectSceneNouns(currentScene),
      };
      cognitive
        .processInput(trimmed, worldCtx)
        .then((response) => {
          set({ cognitiveLastResponse: response });
          const tags = [...response.inferredEmotions, ...response.inferredIntentions];
          const summary = tags.length
            ? `${tags.join(' · ')}  (${Math.round(response.embeddingMs)}ms)`
            : `neutral  (${Math.round(response.embeddingMs)}ms)`;
          get().appendLog('cognitive', summary, {
            emotions: response.inferredEmotions,
            intentions: response.inferredIntentions,
            confidence: response.semanticConfidence,
            embeddingMs: response.embeddingMs,
            inferenceMs: response.inferenceMs,
          });
        })
        .catch(() => {
          // swallow — cognitive failures must never affect gameplay
        });
    }

    // Surface the time the action consumed so the player can feel the day
    // shrink. Only logs when the action actually advanced the clock — a
    // pure parser miss doesn't print "0h passed".
    const hoursAfter = get().player?.hoursElapsed ?? hoursBefore;
    const dt = hoursAfter - hoursBefore;
    if (dt > 0) {
      const label = dt < 1
        ? `${Math.round(dt * 60)} min`
        : dt < 24
          ? `${Math.round(dt * 10) / 10}h`
          : `${Math.floor(dt / 24)}d ${Math.round(dt % 24)}h`;
      get().appendLog('system', `⏳ Time passed: ${label}`);
    }
    void get().persist();
  },

  resolveRollStep(values: number[]) {
    const state = get().pendingRolls;
    if (!state) return;

    const idx = state.currentStep;
    const step = state.steps[idx];
    if (!step) return;

    const total = values.reduce((a, b) => a + b, 0) + step.bonus;
    const success = step.target !== undefined ? total >= step.target : undefined;
    const filled: RollStep = { ...step, values, total, success };
    const updatedSteps = state.steps.map((s, i) => (i === idx ? filled : s));

    // Skip damage roll if attack missed
    let nextIdx = idx + 1;
    if (nextIdx < updatedSteps.length) {
      const nextStep = updatedSteps[nextIdx];
      const attackStep = updatedSteps.find((s) => s.id === 'attack');
      if (nextStep?.id === 'damage' && attackStep?.success === false) {
        nextIdx++;
      }
    }

    if (nextIdx < updatedSteps.length) {
      set({ pendingRolls: { ...state, steps: updatedSteps, currentStep: nextIdx } });
    } else {
      set({ pendingRolls: null });
      get().concludeRolls(updatedSteps, state.actionText);
    }
  },

  cancelPendingRolls() {
    set({ pendingRolls: null });
    get().appendLog('system', 'Action cancelled.');
  },

  concludeRolls(steps: RollStep[], actionText: string) {
    const { player, currentScene } = get();
    if (!player || !currentScene) return;

    // Snapshot time so we can append "⏳ Time passed: Xh" at the end of
    // the resolver. Rolls (attack / skill / rest) all push the clock.
    const hoursBeforeConclude = player.hoursElapsed ?? 0;

    const initiative = steps.find((s) => s.id === 'initiative');
    const attack = steps.find((s) => s.id === 'attack');
    const damage = steps.find((s) => s.id === 'damage');
    const skill = steps.find((s) => s.id === 'skill_check');
    const restRoll = steps.find((s) => s.id === 'rest_hours');

    // ── REST ──────────────────────────────────────────────────────────────
    if (restRoll) {
      const hours = restRoll.total ?? 4;
      const hpRoom = player.hpMax - player.hp;
      const stamRoom = player.staminaMax - player.stamina;
      // Refuse pointless rest. Playtest: rapid-tapping rest at full
      // HP+stamina was burning game-time hours for no benefit, advancing
      // from Day 1 evening to Day 2 afternoon in four taps.
      if (hpRoom === 0 && stamRoom === 0) {
        get().appendLog(
          'world',
          'You are whole, breath steady, HP and stamina topped. No reason to lie down — the day still has road left.',
        );
        void get().persist();
        return;
      }
      // Deterministic: 2 HP per hour, 1 stamina per hour, capped.
      const heal = Math.min(hpRoom, hours * 2);
      const stamGain = Math.min(stamRoom, hours);
      const newHours = (player.hoursElapsed ?? 0) + hours;
      set({
        player: {
          ...player,
          hp: player.hp + heal,
          stamina: player.stamina + stamGain,
          hoursElapsed: newHours,
        },
      });
      const parts: string[] = [];
      if (heal > 0) parts.push(`+${heal} HP`);
      if (stamGain > 0) parts.push(`+${stamGain} stamina`);
      const tail = parts.length > 0 ? parts.join(', ') + ' recovered.' : 'Whole already — the Aetherstone hums steady.';
      get().appendLog('world', `You rest for ${hours} hours. ${tail} (${describeTime(newHours)})`);
      void get().persist();
      return;
    }

    // ── SKILL CHECK ───────────────────────────────────────────────────────
    if (skill) {
      const { intent } = parseInput(actionText);
      if (skill.success) {
        // Hunt advancement: if the player has an active hunt whose next
        // stage expects this skill intent, advance one stage of the hunt.
        const huntMatch = (player.activeHunts ?? [])
          .map((rec) => ({ rec, def: findHuntById(rec.id) }))
          .find(({ rec, def }) => {
            if (!def) return false;
            const next = def.stages[rec.stage];
            if (!next) return false;
            // Map intents to the hunt's expected check kinds. Any of these
            // intent matches advances the hunt one beat.
            return (
              (next.checkKind === 'investigate' && intent === 'investigate') ||
              (next.checkKind === 'stealth' && intent === 'stealth') ||
              (next.checkKind === 'diplomacy' && intent === 'diplomacy') ||
              (next.checkKind === 'escape' && intent === 'escape') ||
              (next.checkKind === 'cast' && intent === 'cast') ||
              (next.checkKind === 'attack_provoke' && intent === 'attack') ||
              (next.checkKind === 'boss' && intent === 'attack')
            );
          });
        if (huntMatch) {
          void Promise.resolve().then(() => get().advanceHunt(huntMatch.rec.id));
        }
        // Mystery auto-advance — same rule, no boss spawn at the end.
        const mysteryMatch = (player.activeMysteries ?? [])
          .map((rec) => ({ rec, def: findMysteryById(rec.id) }))
          .find(({ rec, def }) => {
            if (!def) return false;
            const next = def.stages[rec.stage];
            if (!next) return false;
            return (
              (next.checkKind === 'investigate' && intent === 'investigate') ||
              (next.checkKind === 'stealth' && intent === 'stealth') ||
              (next.checkKind === 'diplomacy' && intent === 'diplomacy') ||
              (next.checkKind === 'escape' && intent === 'escape') ||
              (next.checkKind === 'cast' && intent === 'cast') ||
              (next.checkKind === 'boss' && intent === 'investigate')
            );
          });
        if (mysteryMatch) {
          void Promise.resolve().then(() => get().advanceMystery(mysteryMatch.rec.id));
        }
        // Storyline auto-advance — same rule.
        const storyMatch = (player.activeStorylines ?? [])
          .map((rec) => ({ rec, def: findStorylineById(rec.id) }))
          .find(({ rec, def }) => {
            if (!def) return false;
            const next = def.stages[rec.stage];
            if (!next) return false;
            return (
              (next.checkKind === 'investigate' && intent === 'investigate') ||
              (next.checkKind === 'stealth' && intent === 'stealth') ||
              (next.checkKind === 'diplomacy' && intent === 'diplomacy') ||
              (next.checkKind === 'escape' && intent === 'escape') ||
              (next.checkKind === 'cast' && intent === 'cast') ||
              (next.checkKind === 'attack_provoke' && intent === 'attack') ||
              (next.checkKind === 'boss' && intent === 'diplomacy')
            );
          });
        if (storyMatch) {
          void Promise.resolve().then(() => get().advanceStoryline(storyMatch.rec.id));
        }

        // Skill-check milestone: every 10 successful checks → +1 to the stat
        // the check used. Tracked across the character's lifetime.
        const prevMs = player.milestones ?? { enemiesDefeated: 0, travelsCompleted: 0, checksSucceeded: 0 };
        const newChecks = prevMs.checksSucceeded + 1;
        const hitMilestone = checkMilestone(newChecks, MILESTONE_CHECK_STEP);
        const statKey = INTENT_TO_STAT[intent] ?? 'wisdom';
        const bumpedStats = hitMilestone
          ? { ...player.stats, [statKey]: player.stats[statKey] + 1 }
          : player.stats;
        set((s) => ({
          player: s.player
            ? {
                ...s.player,
                stats: bumpedStats,
                milestones: { ...prevMs, checksSucceeded: newChecks },
              }
            : s.player,
        }));
        if (hitMilestone) {
          get().appendLog(
            'reward',
            `✦ Practice sharpens you. +1 ${statKey.toUpperCase().slice(0, 3)} (now ${bumpedStats[statKey]}). [${newChecks} checks succeeded]`,
          );
        }
        switch (intent) {
          case 'stealth':
            get().appendLog('world', 'You move low and quiet. Whatever watches does not see you.');
            break;
          case 'diplomacy': {
            // Gate the "someone heard you" line on someone actually being
            // present. Playtest: player typed "ask the monk if he has food"
            // on an empty road and the world replied "Your words find
            // purchase." against nobody.
            const hasAudience = currentScene.enemies.length > 0 || !!currentScene.vendor;
            const line = hasAudience
              ? 'Your words find purchase. Something in this place is listening.'
              : "Your voice carries across empty ground. No one is here to answer — try this where the world has people.";
            get().appendLog('world', line);
            break;
          }
          case 'escape':
            get().appendLog('world', 'You break for the entrance. Behind you the chamber settles back into silence.');
            if (currentScene.enemies.length > 0) {
              set((s) => (s.currentScene
                ? { currentScene: { ...s.currentScene, enemies: [], enemyHps: [], activeEnemyIdx: 0, range: null } }
                : s));
            }
            break;
          case 'investigate': {
            // Narrate against the actual thing the player searched, not the whole location.
            const reparsed = parseInput(actionText);
            const focus = reparsed.resolvedNoun ?? reparsed.target ?? currentScene.location.name;
            get().appendLog('world', `You examine ${focus}. The Aetherstone hums — something is here, but not in plain sight.`);
            // Only drop a new lead occasionally, and only if the player isn't already
            // juggling unfinished quests. Was 50%; "search my pockets" should not spawn
            // a quest about brokering relic sales at Thametan's Tower.
            const activeQuests = player.activeQuests.length;
            if (activeQuests < 2 && Math.random() < 0.12) {
              const quest = get().generateNewQuest();
              get().appendLog('reward', `New lead: ${quest.objective.verb} ${quest.objective.target} at ${quest.location.name}.`);
            }
            break;
          }
          case 'cast':
            get().appendLog('world', 'You shape the Aether around your hand. A pale violet glow answers, steady and true.');
            break;
          case 'use_relic': {
            // Concrete feedback per relic + target. Playtest: trying
            // torch / locket / vision lens on mud-glass all gave the same
            // "relic hums in pitch" line — felt broken because the player
            // couldn't tell anything was happening. Re-parse the action
            // text for the resolved item + target so the narration names
            // what's actually in your hand and what you aimed it at.
            const useParse = parseInput(actionText, { inventory: player.inventory });
            const itemName = useParse.resolvedNoun ?? 'the relic';
            const tgtTokens = (useParse.target ?? '').split(/\s+/).filter(Boolean);
            // Strip the item name's words out of target so "use torch on
            // mud glass" leaves "mud glass" not "torch mud glass".
            const itemWords = itemName.toLowerCase().split(/\s+/);
            const tgtWords = tgtTokens.filter((w) => !itemWords.includes(w.toLowerCase()));
            const tgt = tgtWords.join(' ').trim();
            const lc = itemName.toLowerCase();
            // Pick a vignette by relic kind so each item feels distinct.
            let line: string;
            if (/torch|lantern|lamp/.test(lc)) {
              line = tgt
                ? `You raise the ${itemName} to the ${tgt}. Aetheric flame licks across its surface — for a heartbeat, hidden detail flares into view, then fades.`
                : `You hold the ${itemName} high. The flame steadies, and dim corners of the scene reveal what was hiding.`;
            } else if (/locket|amulet|pendant/.test(lc)) {
              line = tgt
                ? `The ${itemName} grows warm against your fingers as you direct it at the ${tgt}. The metal pulses once, hard, then settles.`
                : `The ${itemName} grows warm. A faint resonance threads through your bones — something nearby is also listening.`;
            } else if (/lens|monocle|glass/.test(lc)) {
              line = tgt
                ? `You bring the ${itemName} up and peer through it at the ${tgt}. Layers shift — Aetheric grain, structural lines, the ghost of a maker's mark.`
                : `Through the ${itemName} the room shifts. Aetheric grain becomes visible in the air itself.`;
            } else if (/compass|sextant/.test(lc)) {
              line = tgt
                ? `The needle of the ${itemName} swings toward the ${tgt} and locks. Whatever's there matters.`
                : `The ${itemName} steadies, then pulls. Direction, finally — somewhere worth walking.`;
            } else {
              line = tgt
                ? `The ${itemName} responds to the ${tgt}. A pitch, a hum, a recognition — the relic confirms there is something here.`
                : `The ${itemName} hums in pitch — it recognises your intent.`;
            }
            get().appendLog('world', line);
            break;
          }
          default:
            get().appendLog('world', 'The action resolves in your favour.');
        }
      } else {
        switch (intent) {
          case 'stealth':
            get().appendLog('world', 'Your foot scrapes stone. Something stirs in the dark.');
            break;
          case 'diplomacy': {
            const hasAudience = currentScene.enemies.length > 0 || !!currentScene.vendor;
            const line = hasAudience
              ? 'Your words hang unanswered. The silence has heard better arguments.'
              : 'No one is here to negotiate with. The wind takes the words.';
            get().appendLog('world', line);
            break;
          }
          case 'escape': {
            // Stranded escape — without follow-up guidance the player just
            // re-typed "retreat" three times in the playtest log. Tell them
            // what else is on the table.
            const inCombat = currentScene.enemies.length > 0;
            const hint = inCombat
              ? " Try 'block' to brace, 'attack' to commit, or another 'retreat' to break contact."
              : ' The way out is blocked for now — try a different direction, or rest before pushing through.';
            get().appendLog(
              'world',
              `The way is longer than you remembered. You circle back, breathing hard.${hint}`,
            );
            break;
          }
          case 'investigate':
            get().appendLog('world', `You sweep ${currentScene.location.name} but find only dust and old silence.`);
            break;
          case 'cast':
            get().appendLog('world', 'The Aether slips through your focus. The glow flickers and dies.');
            break;
          case 'use_relic':
            // Frame the failure as the player's fumble, not the relic's
            // refusal — HANDOFF §5 #5 complaint: "use torch on aetherstone"
            // failure used to sound like the relic was broken when really
            // the attempt was a miss. Pool lives in narrativeGenerator so
            // the test can assert against it.
            get().appendLog('world', pick(USE_RELIC_FAILURE_LINES));
            break;
          default:
            get().appendLog('world', 'The action fails.');
        }
      }
      if (shouldArbiterSpeak()) {
        const reparsed = parseInput(actionText);
        get().appendLog(
          'arbiter',
          buildArbiterRemark({
            location: currentScene.location,
            hazard: currentScene.hazard,
            intent: reparsed.intent,
            playerTargetNoun: reparsed.resolvedNoun ?? reparsed.target ?? undefined,
          }),
        );
      }
      void get().persist();
      return;
    }

    // ── COMBAT ────────────────────────────────────────────────────────────
    const enemy = activeEnemy(currentScene);
    if (!enemy) { void get().persist(); return; }
    const activeIdx = currentScene.activeEnemyIdx;

    // Re-parse with full context so we can pull the resolved weapon name
    // back out of the original action text (e.g. "use my torch to attack").
    const combatParse = parseInput(actionText, {
      inventory: player.inventory,
      recentNouns: collectSceneNouns(currentScene),
      enemyPresent: true,
    });
    const weaponName = combatParse.resolvedNoun ?? null;

    if (initiative) {
      get().appendLog('world', initiative.success
        ? `You seize the initiative. ${enemy.name} has no time to react.`
        : `${enemy.name} moves first. The pressure is immediate.`);
    }

    // Always log the player's attack roll math so the combat log mirrors
    // the enemy's "d20 → X + ATK Y = Z vs AC W" line. Without this the
    // disk log only shows enemy attack rolls, which reads as one-sided.
    if (attack && typeof attack.total === 'number' && attack.target !== undefined) {
      const naturalRoll = attack.values?.[0] ?? attack.total - attack.bonus;
      const acTag = `vs ${enemy.name} AC ${attack.target}`;
      const outcome = attack.success ? '✓ HIT' : '✗ MISS';
      get().appendLog(
        'combat',
        `You — d20 → ${naturalRoll} + ${attack.bonusLabel} = ${attack.total} ${acTag} — ${outcome}`,
      );
    }

    if (attack?.success) {
      // Agile / quick enemies get a save against the incoming hit. Roll
      // against the trait's dodge chance — success completely negates
      // damage AND the on-hit status that would have applied. Misses fall
      // through to normal damage math.
      const dodgeChance = traitDodgeChance(enemy.traits);
      if (dodgeChance > 0 && Math.random() < dodgeChance) {
        get().appendLog(
          'combat',
          `${enemy.name} reads the swing and twists clear — the blow finds nothing. (dodged, ${enemy.traits?.includes('agile') ? 'agile' : 'quick'})`,
        );
        // The dodge still costs the player the action — let any reaching
        // enemy counter-attack, same as a miss path.
        runEnemyGroupCounters(get, set, player);
        // Surface clock movement before we early-return.
        const hoursAfterDodge = get().player?.hoursElapsed ?? hoursBeforeConclude;
        const dt = hoursAfterDodge - hoursBeforeConclude;
        if (dt > 0) {
          const label = dt < 1 ? `${Math.round(dt * 60)} min` : `${Math.round(dt * 10) / 10}h`;
          get().appendLog('system', `⏳ Time passed: ${label}`);
        }
        void get().persist();
        return;
      }
      const rawDmg = damage?.total ?? rollDie(6);
      const barehand = isBareHandAttack(actionText);
      // If the player invoked the off-hand explicitly (via the OFF
      // quick button or "attack with the off-hand X"), look up the
      // off-hand weapon for damage type / effect / wear so the
      // resistance + weakness math reads from the actual blade in
      // play. Without this hint, getEquippedWeapon defaults to the
      // main-hand and every off-hand swing was being scored against
      // main-hand resistances.
      const usedOffHandForDmg = /\boff[- ]?hand\b/.test(actionText.toLowerCase());
      const equipped = barehand ? null : getEquippedWeapon(player, usedOffHandForDmg ? 'off' : 'main');
      // Bare-hand strikes are bludgeoning by default so the player can
      // exploit Aetheric Mutation / Construct / Automation bludgeoning
      // weaknesses without sacrificing their weapon's durability.
      const weaponType = barehand ? 'bludgeoning' : (equipped?.damageType ?? null);
      const mod = applyDamageTypeModifier(rawDmg, weaponType, enemy.type);
      // Layer per-enemy trait modifiers on top of the type-resistance map.
      // Stacks multiplicatively — an Iron Spider with "resist:slashing"
      // halves AGAIN on top of the Construct type's slashing resist.
      const traitMod = traitDamageMultiplier(enemy.traits, weaponType);
      // HANDOFF followup — weapon "Effect" parser. Parses the catalog
      // entry's free-text effect column for patterns like "+1d6 against
      // Large creatures" / "+1d6 against constructs" and rolls the
      // bonus dice when the enemy matches. Stacks ADDITIVELY on top of
      // the type+trait math.
      const parsedEffect = equipped ? parseWeaponEffect(equipped.effect) : null;
      const effectBonus = parsedEffect ? rollEffectBonusDamage(parsedEffect, enemy) : 0;
      const dmg = Math.max(1, Math.round(mod.damage * traitMod.multiplier) + effectBonus);
      const prevHp = currentScene.enemyHps[activeIdx] ?? enemy.hp;
      const newEnemyHp = prevHp - dmg;

      // Narrate the resistance/weakness modifier on its own line so the
      // player can see WHY the damage changed.
      if (mod.match === 'weak') {
        get().appendLog('combat', `Weakness exposed — ${enemy.name} flinches. (${weaponType} ×1.5 for ${dmg})`);
      } else if (mod.match === 'resist') {
        get().appendLog('combat', `${enemy.name} shrugs off the ${weaponType}. (resisted, ×0.5 for ${dmg})`);
      }
      if (traitMod.match === 'vulnerable') {
        get().appendLog('combat', `${enemy.name} is vulnerable to ${weaponType}. (trait ×1.5)`);
      } else if (traitMod.match === 'resist') {
        get().appendLog('combat', `${enemy.name}'s perks resist ${weaponType}. (trait ×0.5)`);
      }
      if (effectBonus > 0) {
        get().appendLog('combat', `${equipped?.name ?? 'Your weapon'}'s effect triggers — +${effectBonus} bonus damage.`);
      }

      // Weapon wear: any successful hit chips one point off the weapon
      // that landed it. Bare hands aren't tracked at all. Mirrors the
      // off-hand detection in buildCombatSteps so the right blade takes
      // the wear.
      if (!barehand) {
        const usedOffHand = /\boff[- ]?hand\b/.test(actionText.toLowerCase());
        const weaponInUse = usedOffHand
          ? (player.equipped?.off ?? player.equipped?.main ?? null)
          : (player.equipped?.main ?? player.equipped?.weaponName ?? player.equipped?.off ?? null);
        if (weaponInUse) {
          set((s) => (s.player ? { player: wearEquippedItem(s.player, weaponInUse, get) } : s));
        }
      }

      if (newEnemyHp <= 0) {
        get().appendLog('combat', attackKill(weaponName, enemy.name, dmg));
        // Splice this enemy out of the scene (loot + scene clear handled
        // in resolveEnemyDefeat which now operates per-active-enemy).
        get().resolveEnemyDefeat();
      } else {
        // Write the new HP back into the aligned array.
        set((s) => {
          if (!s.currentScene) return {};
          const hps = [...s.currentScene.enemyHps];
          hps[activeIdx] = newEnemyHp;
          return { currentScene: { ...s.currentScene, enemyHps: hps } };
        });
        get().appendLog('combat', attackHit(weaponName, enemy.name, dmg, newEnemyHp));
        // After the player's strike, every still-living enemy in the
        // scene counter-attacks. The group acts as a group.
        runEnemyGroupCounters(get, set, player);
      }
    } else {
      get().appendLog('combat', attackMiss(weaponName, enemy.name));
      runEnemyGroupCounters(get, set, player);
    }

    if (shouldArbiterSpeak()) {
      get().appendLog(
        'arbiter',
        buildArbiterRemark({
          location: currentScene.location,
          hazard: currentScene.hazard,
          enemy: activeEnemy(get().currentScene),
          intent: 'attack',
        }),
      );
    }
    // Surface clock movement for dice-resolved actions too (attack, skill,
    // rest). The pre-action snapshot lives at hoursBeforeConclude.
    const hoursAfterConclude = get().player?.hoursElapsed ?? hoursBeforeConclude;
    const concludeDt = hoursAfterConclude - hoursBeforeConclude;
    if (concludeDt > 0) {
      const label = concludeDt < 1
        ? `${Math.round(concludeDt * 60)} min`
        : concludeDt < 24
          ? `${Math.round(concludeDt * 10) / 10}h`
          : `${Math.floor(concludeDt / 24)}d ${Math.round(concludeDt % 24)}h`;
      get().appendLog('system', `⏳ Time passed: ${label}`);
    }
    void get().persist();
  },

  travelTo(locationId) {
    const player = get().player;
    if (!player) return;

    // Capture the FROM location BEFORE we mutate player. beginScene's
    // arrival-flavor composer reads this back to print the departure
    // framing ("You've left The Mud Flats and entered the Endless
    // Stair.").
    const fromLocationName = getLocationById(player.currentLocationId).name;

    // Travel milestone: every 5 distinct travels → +1 stamina max.
    const prevMs = player.milestones ?? { enemiesDefeated: 0, travelsCompleted: 0, checksSucceeded: 0 };
    const newTravels = prevMs.travelsCompleted + 1;
    const hitMilestone = checkMilestone(newTravels, MILESTONE_TRAVEL_STEP);
    const newStaminaMax = hitMilestone ? player.staminaMax + 1 : player.staminaMax;
    const newStamina = hitMilestone ? player.stamina + 1 : player.stamina;

    set({
      player: {
        ...player,
        currentLocationId: locationId,
        stamina: newStamina,
        staminaMax: newStaminaMax,
        milestones: { ...prevMs, travelsCompleted: newTravels },
        // Recenter on the new map. generateWorldMap is recentered on
        // currentLocationId per call, so without this the player's
        // mapX/mapY keep the OLD map's crossing position — next
        // cardinal step walks into whatever tile sits at that offset
        // on the freshly generated map, often a neighbor of the old
        // location (sim trace showed `south` bouncing A→B→A→B).
        mapX: WORLD_MAP_CENTER_X,
        mapY: WORLD_MAP_CENTER_Y,
        // Named travelTo breaks the cardinal-step flow — clear the saved
        // direction so "continue" can't snap back to the old bearing.
        lastTravelDirection: undefined,
      },
      worldMemory: discoverLocation(get().worldMemory, locationId),
    });
    // The "You make your way to X" line was removed in favour of the
    // consolidated arrival flavor that beginScene now emits when
    // opts.arrivalFromName is set. One paragraph, not five.
    if (hitMilestone) {
      get().appendLog(
        'reward',
        `✦ The road has built you up. +1 max stamina (now ${newStaminaMax}). [${newTravels} travels completed]`,
      );
    }
    if (newTravels === 1) {
      recordMemorableEvent(get, set, {
        kind: 'first_travel',
        text: `walked your first road, to ${getLocationById(locationId).name}`,
      });
    }
    advanceActiveFactionQuests(get, set, 'travel');
    get().beginScene({ arrivalFromName: fromLocationName });
    void get().persist();
  },

  generateNewQuest() {
    const memory = get().worldMemory;
    const quest = generateQuest(memory);
    const player = get().player;
    if (player) {
      set({ player: { ...player, activeQuests: [...player.activeQuests, quest] } });
    }
    void get().persist();
    return quest;
  },

  resolveEnemyDefeat() {
    const { currentScene, player, worldMemory } = get();
    const enemy = activeEnemy(currentScene);
    if (!currentScene || !enemy || !player) return;
    const activeIdx = currentScene.activeEnemyIdx;
    // HANDOFF #15 — record the kill against the current room so re-entry
    // narration can reference it ("you cleared this room before"). Pure
    // bookkeeping; doesn't yet suppress respawns.
    {
      const roomKey = makeRoomKey(player.currentLocationId, currentScene.microMicroId, player.mapX, player.mapY);
      const rooms = worldMemory.visitedRooms ?? {};
      const room = rooms[roomKey];
      if (room) {
        const cleared = Array.from(new Set([...(room.enemiesCleared ?? []), enemy.name]));
        set((s) => ({
          worldMemory: {
            ...s.worldMemory,
            visitedRooms: { ...(s.worldMemory.visitedRooms ?? {}), [roomKey]: { ...room, enemiesCleared: cleared } },
          },
        }));
      }
    }
    // Hunt-boss kill: if the slain enemy's name matches a target of an
    // active hunt currently at its boss stage, advance the hunt one more
    // beat (past the boss stage) so the player can turn it in.
    const matchingHunt = (player.activeHunts ?? [])
      .map((rec) => ({ rec, def: findHuntById(rec.id) }))
      .find(({ rec, def }) => {
        if (!def) return false;
        // Boss enemy names are tagged " (hunted)" by scaleHuntBoss.
        return enemy.name === `${def.targetEnemyName} (hunted)` && rec.stage > 0;
      });
    if (matchingHunt && matchingHunt.def) {
      set((s) =>
        s.player
          ? {
              player: {
                ...s.player,
                activeHunts: (s.player.activeHunts ?? []).map((h) =>
                  h.id === matchingHunt.rec.id ? { ...h, stage: matchingHunt.def!.stages.length } : h,
                ),
              },
            }
          : s,
      );
      get().appendLog(
        'reward',
        `✦ ${matchingHunt.def.targetEnemyName} slain. Return to a posting agent to turn in "${matchingHunt.def.title}" for the bounty.`,
      );
    }
    const loot = enemy.loot[Math.floor(Math.random() * enemy.loot.length)] ?? 'Aether dust';
    get().appendLog('reward', `${enemy.name} defeated. You recover ${loot}.`);

    // Increment lifetime kill count and check for a milestone bump.
    const prevMs = player.milestones ?? { enemiesDefeated: 0, travelsCompleted: 0, checksSucceeded: 0 };
    const newKills = prevMs.enemiesDefeated + 1;
    const hitMilestone = checkMilestone(newKills, MILESTONE_KILL_STEP);
    const newHpMax = hitMilestone ? player.hpMax + 1 : player.hpMax;
    const newHp = hitMilestone ? player.hp + 1 : player.hp;

    // Splice the defeated enemy out of the scene. If others remain, drop
    // the active index to a still-living index. If the list empties,
    // clear range so the scene is peaceful again.
    const remainingEnemies = currentScene.enemies.filter((_, i) => i !== activeIdx);
    const remainingHps = currentScene.enemyHps.filter((_, i) => i !== activeIdx);
    const nextActiveIdx = remainingEnemies.length > 0 ? Math.min(activeIdx, remainingEnemies.length - 1) : 0;
    const stillFighting = remainingEnemies.length > 0;
    set({
      currentScene: {
        ...currentScene,
        enemies: remainingEnemies,
        enemyHps: remainingHps,
        activeEnemyIdx: nextActiveIdx,
        range: stillFighting ? currentScene.range : null,
        hooks: currentScene.hooks ?? [],
      },
      worldMemory: recordEnemyDefeat(worldMemory, enemy.name),
      player: {
        ...player,
        hp: newHp,
        hpMax: newHpMax,
        inventory: mergeOrPushItem(player.inventory, {
          id: `loot_${Date.now()}`,
          name: loot,
          kind: 'misc',
          quantity: 1,
          tags: ['loot'],
        }),
        milestones: { ...prevMs, enemiesDefeated: newKills },
      },
    });
    if (stillFighting) {
      const next = remainingEnemies[nextActiveIdx]!;
      get().appendLog(
        'combat',
        `${remainingEnemies.length} attacker${remainingEnemies.length > 1 ? 's' : ''} remain${remainingEnemies.length === 1 ? 's' : ''}. ${next.name} now in your sights.`,
      );
    }
    if (hitMilestone) {
      get().appendLog(
        'reward',
        `✦ You feel hardier from your trials. +1 max HP (now ${newHpMax}). [${newKills} enemies defeated]`,
      );
    }

    // Staged faction quests advance on kill if the current stage's
    // advanceOn is 'kill' or 'any'. Travel-gated stages (pilgrimage,
    // scholar field-trip) ignore this trigger and only advance
    // when the player completes a travel.
    advanceActiveFactionQuests(get, set, 'kill');

    // First-kill and rare-kill milestones are noted in the memorable-event
    // log so the Arbiter can reference them later.
    if (newKills === 1) {
      recordMemorableEvent(get, set, {
        kind: 'first_kill',
        text: `put down your first ${enemy.name}`,
        enemyName: enemy.name,
      });
    }
    if (enemy.rarity === 'Rare' || enemy.rarity === 'Legendary') {
      recordMemorableEvent(get, set, {
        kind: 'rare_kill',
        text: `cut down the ${enemy.name} in ${currentScene.location.name}`,
        enemyName: enemy.name,
      });
    }

    // TC drop. 30% chance per kill, amount scaled by enemy rarity. This is
    // what fuels the vendor economy — combat is the primary way to earn TC.
    if (Math.random() < 0.3) {
      const rarityMul = enemy.rarity === 'Legendary' ? 6 : enemy.rarity === 'Rare' ? 3 : enemy.rarity === 'Uncommon' ? 2 : 1;
      const tcGained = (rollDie(6) + rollDie(6)) * rarityMul;
      set((s) => (s.player ? { player: { ...s.player, tc: s.player.tc + tcGained } } : s));
      get().appendLog('reward', `+${tcGained} TC pried from the dust.`);
    }

    // Arbiter watches the pack: did the new loot just unlock a recipe?
    const before = listCraftableRecipes(player.inventory);
    const after = listCraftableRecipes(get().player?.inventory ?? []);
    const newly = after.filter((r) => !before.some((b) => b.result === r.result));
    if (newly.length > 0) {
      const r = newly[0]!;
      get().appendLog(
        'arbiter',
        `The Arbiter eyes your new pieces. "You could make a ${r.result} now, if you wanted."`,
      );
    }

    // Very rare Resurrection Gem drop. ~0.5% per kill — most playtests
    // will never see one; long campaigns will see a handful. The gem
    // saves to the install-wide stash, not the active character, so it
    // survives the character's eventual death.
    if (Math.random() < 0.005) {
      void addResurrectionGems(1).then((total) => {
        set({ resurrectionGems: total });
        get().appendLog(
          'reward',
          `✦ A Resurrection Gem flickers from the dust — gathered to your stash. (${total} held)`,
        );
      });
    }
    void get().persist();
  },

  buyFromVendor(itemName) {
    const state = get();
    const scene = state.currentScene;
    const player = state.player;
    if (!scene?.vendor || !player) return;
    // Tour mode — Irma is a demo vendor injected for the intro walkthrough.
    // No transactions: stops the player from cheesing the game by buying
    // out the armory before play actually starts.
    if (state.tutorialDemoVendor) {
      get().appendLog('system', 'Tour mode — purchases disabled while the tutorial is running.');
      return;
    }

    const offer = scene.vendor.offers.find((o) => o.itemName.toLowerCase() === itemName.toLowerCase());
    if (!offer) return;
    if (player.tc < offer.price) {
      get().appendLog(
        'system',
        `Not enough TC. ${offer.itemName} costs ${offer.price}, you have ${player.tc}.`,
      );
      return;
    }

    // Look up the catalog entry to know what kind of inventory item to write.
    const weapon = WEAPONS.find((w) => w.name === offer.itemName);
    const armor = !weapon ? ARMOR.find((a) => a.name === offer.itemName) : null;
    const gear = !weapon && !armor ? GEAR.find((g) => g.name === offer.itemName) : null;
    const material = !weapon && !armor && !gear ? MATERIALS.find((m) => m.name === offer.itemName) : null;
    const cat = weapon ?? armor ?? gear ?? material ?? null;
    const kind: InventoryItem['kind'] = weapon
      ? 'misc'
      : armor
        ? 'misc'
        : gear?.kind === 'consumable' || gear?.kind === 'relic' || gear?.kind === 'misc'
          ? gear.kind
          : material
            ? 'misc'
            : 'misc';
    const tags = cat?.tags ?? [];
    const newItem: InventoryItem = stampDurability({
      id: `bought_${Date.now()}`,
      name: offer.itemName,
      kind,
      rarity: cat?.rarity,
      quantity: 1,
      tags,
    });

    // Small reputation boost with the vendor's faction for honest custom.
    const vendorFaction = scene.vendor.faction;
    const repResult = vendorFaction
      ? applyRepChange(player.factionStanding, vendorFaction, 1)
      : { standing: player.factionStanding.map((r) => ({ ...r })), changed: [] };

    // Check cap BEFORE charging TC. If the player can't carry it, refuse
    // the sale instead of taking their coin for nothing.
    const dryRun = grantItem(player.inventory, newItem);
    if (dryRun.accepted <= 0) {
      get().appendLog(
        'arbiter',
        `${scene.vendor.name} pauses. "Your pack is already heavy with ${offer.itemName.toLowerCase()}. Drop one first if you want this."`,
        { skipDedup: true },
      );
      return;
    }
    set((s) => {
      if (!s.player || !s.currentScene?.vendor) return s;
      const newOffers = s.currentScene.vendor.offers.filter((o) => o !== offer);
      return {
        player: {
          ...s.player,
          tc: s.player.tc - offer.price,
          inventory: dryRun.inventory,
          factionStanding: repResult.standing,
        },
        currentScene: {
          ...s.currentScene,
          vendor: { ...s.currentScene.vendor, offers: newOffers },
        },
      };
    });
    get().appendLog(
      'reward',
      `Bought ${offer.itemName} from ${scene.vendor.name} for ${offer.price} TC. (${player.tc - offer.price} TC left)`,
    );
    logRepChanges(get, repResult.changed);
    void get().persist();
  },

  sellToVendor(itemName) {
    const state = get();
    const scene = state.currentScene;
    const player = state.player;
    if (!scene?.vendor || !player) return;
    if (state.tutorialDemoVendor) {
      get().appendLog('system', 'Tour mode — selling is disabled while the tutorial is running.');
      return;
    }
    // Refuse if the item is equipped — don't quietly strip the player's
    // loadout. They have to unequip first.
    const equipped = player.equipped ?? {};
    const equippedNames = Object.values(equipped).filter(Boolean) as string[];
    const item = player.inventory.find((i) => i.name.toLowerCase() === itemName.toLowerCase() && i.quantity > 0);
    if (!item) {
      get().appendLog('system', `You don't have any ${itemName} to sell.`);
      return;
    }
    if (equippedNames.includes(item.name)) {
      get().appendLog(
        'arbiter',
        `${scene.vendor.name} eyes the ${item.name} on your person. "Take it off first. I don't haggle for what's still on a man."`,
      );
      return;
    }
    if (isUnsellable(item)) {
      get().appendLog(
        'arbiter',
        `${scene.vendor.name} shakes their head. "That one's not for sale. Not by you, not by me."`,
      );
      return;
    }
    const price = sellPriceFor(item, scene.vendor);
    if (price <= 0) {
      get().appendLog('system', `${scene.vendor.name} won't pay for ${item.name} — no resale value.`);
      return;
    }
    set((s) => {
      if (!s.player || !s.currentScene?.vendor) return s;
      const newInventory = s.player.inventory
        .map((i) => (i.id === item.id ? { ...i, quantity: i.quantity - 1 } : i))
        .filter((i) => i.quantity > 0);
      return {
        player: {
          ...s.player,
          tc: s.player.tc + price,
          inventory: newInventory,
        },
      };
    });
    get().appendLog(
      'reward',
      `Sold ${item.name} to ${scene.vendor.name} for ${price} TC. (${player.tc + price} TC on hand)`,
    );
    void get().persist();
  },


  giftToVendor(itemName) {
    const state = get();
    const scene = state.currentScene;
    const player = state.player;
    if (!scene?.vendor || !player) return;

    const itemIdx = player.inventory.findIndex(
      (i) => i.name.toLowerCase() === itemName.toLowerCase() && i.quantity > 0,
    );
    if (itemIdx < 0) {
      get().appendLog('arbiter', `The Arbiter shakes their head. "You do not carry any ${itemName}."`);
      return;
    }
    const item = player.inventory[itemIdx]!;

    // Decrement quantity (remove row at 0).
    const newInventory = player.inventory
      .map((it, i) =>
        i === itemIdx ? { ...it, quantity: it.quantity - 1 } : it,
      )
      .filter((it) => it.quantity > 0);

    const vendorFaction = scene.vendor.faction;
    const repResult = vendorFaction
      ? applyRepChange(player.factionStanding, vendorFaction, 5)
      : { standing: player.factionStanding.map((r) => ({ ...r })), changed: [] };

    set((s) =>
      s.player
        ? {
            player: { ...s.player, inventory: newInventory, factionStanding: repResult.standing },
          }
        : s,
    );
    get().appendLog(
      'reward',
      `You gift ${item.name} to ${scene.vendor.name}. They acknowledge it with a slow nod.`,
    );
    logRepChanges(get, repResult.changed);
    void get().persist();
  },

  stealFromVendor(itemName) {
    const state = get();
    const scene = state.currentScene;
    const player = state.player;
    if (!scene?.vendor || !player) return;

    const offer = scene.vendor.offers.find(
      (o) => o.itemName.toLowerCase() === itemName.toLowerCase(),
    );
    if (!offer) {
      get().appendLog(
        'arbiter',
        `The Arbiter watches you eye the pack. "They are not carrying a ${itemName}."`,
      );
      return;
    }

    // Immediate stealth check — d20 + DEX vs DC 12 (Hard per the rulebook).
    // Skipping the pendingRolls UI here because a theft attempt resolves
    // fast and the player won't expect a separate roll screen.
    const dc = 12;
    const roll = rollDie(20);
    const total = roll + player.stats.dexterity;
    const success = total >= dc;
    get().appendLog('combat', `Stealth — d20 rolled ${roll} + DEX ${player.stats.dexterity} = ${total} vs DC ${dc} — ${success ? '✓ HIT' : '✗ CAUGHT'}`);

    if (success) {
      // Catalog lookup to set proper kind/rarity/tags.
      const weapon = WEAPONS.find((w) => w.name === offer.itemName);
      const armor = !weapon ? ARMOR.find((a) => a.name === offer.itemName) : null;
      const gear = !weapon && !armor ? GEAR.find((g) => g.name === offer.itemName) : null;
      const material = !weapon && !armor && !gear ? MATERIALS.find((m) => m.name === offer.itemName) : null;
      const cat = weapon ?? armor ?? gear ?? material ?? null;
      const kind: InventoryItem['kind'] =
        gear?.kind === 'consumable' || gear?.kind === 'relic' || gear?.kind === 'misc'
          ? gear.kind
          : 'misc';
      const stolen: InventoryItem = stampDurability({
        id: `stolen_${Date.now()}`,
        name: offer.itemName,
        kind,
        rarity: cat?.rarity,
        quantity: 1,
        tags: cat?.tags ?? [],
      });
      set((s) => {
        if (!s.player || !s.currentScene?.vendor) return s;
        const newOffers = s.currentScene.vendor.offers.filter((o) => o !== offer);
        return {
          player: { ...s.player, inventory: mergeOrPushItem(s.player.inventory, stolen) },
          currentScene: { ...s.currentScene, vendor: { ...s.currentScene.vendor, offers: newOffers } },
        };
      });
      get().appendLog('reward', `You palm the ${offer.itemName}. ${scene.vendor.name} doesn't notice.`);
    } else {
      // Caught. Big rep hit and the vendor leaves immediately.
      const vendorFaction = scene.vendor.faction;
      const repResult = vendorFaction
        ? applyRepChange(player.factionStanding, vendorFaction, -10)
        : { standing: player.factionStanding.map((r) => ({ ...r })), changed: [] };
      set((s) =>
        s.player && s.currentScene
          ? {
              player: { ...s.player, factionStanding: repResult.standing },
              currentScene: { ...s.currentScene, vendor: null },
            }
          : s,
      );
      get().appendLog(
        'world',
        `${scene.vendor.name} catches your wrist. "I see you." They pack up and leave without another word.`,
      );
      logRepChanges(get, repResult.changed);
      recordMemorableEvent(get, set, {
        kind: 'theft_caught',
        text: `were caught stealing from ${scene.vendor.name}`,
        factionId: vendorFaction ?? undefined,
      });
    }
    void get().persist();
  },

  joinFaction(factionId) {
    const state = get();
    const player = state.player;
    if (!player) return;
    const target = findFaction(factionId);
    if (!target) {
      get().appendLog('arbiter', `The Arbiter looks puzzled. "I do not know that faction."`);
      return;
    }
    if (player.factionId === factionId) {
      get().appendLog('arbiter', `The Arbiter raises a brow. "You are already one of the ${target.name}."`);
      return;
    }
    if (!meetsJoinThreshold(player.factionStanding, factionId)) {
      const current = getStanding(player.factionStanding, factionId);
      get().appendLog(
        'arbiter',
        `The Arbiter shakes their head. "The ${target.name} do not take strangers. Standing ${current} — they want at least ${JOIN_THRESHOLD}."`,
      );
      return;
    }
    set((s) =>
      s.player ? { player: { ...s.player, factionId } } : s,
    );
    get().appendLog(
      'reward',
      `You are accepted into the ${target.name}. The Arbiter watches you make the pledge in silence.`,
    );
    recordMemorableEvent(get, set, {
      kind: 'faction_join',
      text: `joined the ${target.name}`,
      factionId,
    });
    void get().persist();
  },

  dismissVendor() {
    const state = get();
    const scene = state.currentScene;
    if (!scene?.vendor) return;
    const vendorName = scene.vendor.name;
    set((s) => ({
      currentScene: s.currentScene ? { ...s.currentScene, vendor: null } : s.currentScene,
      currentScreen: 'exploration',
    }));
    get().appendLog(
      'world',
      `${vendorName} packs up their wares with a nod and slips back into the crowd. The space they held is empty now.`,
    );
    void get().persist();
  },

  repairWithVendor(itemName) {
    const state = get();
    const scene = state.currentScene;
    const player = state.player;
    if (!player) return;
    if (!scene?.vendor) {
      get().appendLog('arbiter', `The Arbiter shakes their head. "No one here repairs gear. Find a smith."`);
      return;
    }
    const target = itemName.toLowerCase();
    const item = player.inventory.find(
      (i) => i.name.toLowerCase() === target && i.durability && i.durability.current < i.durability.max,
    );
    if (!item) {
      get().appendLog(
        'arbiter',
        `The Arbiter glances at your pack. "Nothing in your pack matches that — or it's already in good order."`,
      );
      return;
    }
    const cost = repairCost(item);
    if (player.tc < cost) {
      get().appendLog(
        'arbiter',
        `${scene.vendor.name} looks at your purse. "That mends for ${cost} TC. You don't have it."`,
      );
      return;
    }
    const newInventory = repairItem(player.inventory, item.id);
    set((s) =>
      s.player ? { player: { ...s.player, tc: s.player.tc - cost, inventory: newInventory } } : s,
    );
    get().appendLog(
      'reward',
      `${scene.vendor.name} mends your ${item.name}. ${cost} TC. (durability restored)`,
    );
    void get().persist();
  },

  acceptFactionQuest(titleOrId) {
    const state = get();
    const player = state.player;
    const scene = state.currentScene;
    if (!player) return;
    if (state.tutorialDemoVendor) {
      get().appendLog('system', 'Tour mode — contracts can\'t be accepted until the tutorial ends.');
      return;
    }
    if (!scene?.vendor || !scene.vendor.faction) {
      // Resolve the named contract to its faction so we can tell the
      // player WHICH vendor archetype to seek, not just "a faction
      // agent." Falls back to the generic line if the input doesn't
      // fuzzy-match any cataloged hunt / mystery / storyline / quest.
      const hint = findQuestFactionHint(titleOrId);
      if (hint && hint.vendorNames.length > 0) {
        const sample = hint.vendorNames.slice(0, 2).join(' or ');
        get().appendLog(
          'arbiter',
          `The Arbiter looks past you. "${hint.contractTitle} is a ${hint.kind} of the ${hint.factionLabel}. Find ${sample} — or any other ${hint.factionLabel} agent — to pick it up."`,
        );
      } else if (hint) {
        get().appendLog(
          'arbiter',
          `The Arbiter shrugs. "${hint.contractTitle} is a ${hint.kind} of the ${hint.factionLabel}. Find a ${hint.factionLabel} agent."`,
        );
      } else {
        get().appendLog(
          'arbiter',
          `The Arbiter shrugs. "Contracts come from wandering faction vendors — keep walking until one shows up at your scene."`,
        );
      }
      return;
    }
    // Direct id match first, then fuzzy title within this faction's pool.
    const direct = findFactionQuestById(titleOrId);
    const pool = availableFactionQuests(
      scene.vendor.faction,
      getStanding(player.factionStanding, scene.vendor.faction),
      player.activeFactionQuestIds ?? [],
      player.completedFactionQuestIds ?? [],
    );
    const quest = direct && pool.includes(direct) ? direct : fuzzyFindFactionQuest(titleOrId, pool);
    if (!quest) {
      const titles = pool.map((q) => `"${q.title}"`).join(', ');
      get().appendLog(
        'arbiter',
        titles
          ? `${scene.vendor.name} looks you over. "Not that one. Currently on offer: ${titles}."`
          : `${scene.vendor.name} shakes their head. "Nothing on offer for you right now."`,
      );
      return;
    }
    const factionId = scene.vendor.faction;
    const wasFirstQuest = (player.activeFactionQuestIds?.length ?? 0) === 0
      && (player.completedFactionQuestIds?.length ?? 0) === 0;
    set((s) =>
      s.player
        ? {
            player: {
              ...s.player,
              activeFactionQuestIds: [...(s.player.activeFactionQuestIds ?? []), quest.id],
              activeFactionQuests: [
                ...(s.player.activeFactionQuests ?? []),
                { id: quest.id, stage: 0, postedByFaction: factionId, acceptedAt: Date.now() },
              ],
            },
          }
        : s,
    );
    bumpQuestsAccepted(get, set);
    // First-quest milestone — Arbiter can reference "the first
    // contract you took" later. Fires only on the first accept of
    // the run; type union added in this batch.
    if (wasFirstQuest) {
      recordMemorableEvent(get, set, {
        kind: 'first_quest',
        text: `took your first contract — ${quest.title}`,
        factionId,
      });
    }
    get().appendLog(
      'reward',
      `New faction contract — ${quest.title}. ${quest.objective} (${factionId.replace(/_/g, ' ')})`,
    );
    // Play the first stage immediately so the player has narrative
    // momentum, mirroring how hunts / mysteries / storylines open.
    // Per-quest stage0.arbiter SUPPRESSED on accept — when the player
    // chip-taps six contracts in a row the per-quest Arbiter lines
    // pile up as offhand reactions to descriptions the player has
    // already moved past. bumpQuestsAccepted handles the meta-level
    // commentary (first-quest line, burst-start, "stacking", "slow
    // down") instead.
    const stage0 = quest.stages?.[0];
    if (stage0) {
      get().appendLog('world', stage0.narration);
    }
    void get().persist();
  },

  turnInFactionQuest(titleOrId) {
    const state = get();
    const player = state.player;
    const scene = state.currentScene;
    if (!player) return;
    if (!scene?.vendor || !scene.vendor.faction) {
      // If the player named a specific contract, fuzzy-match it and tell
      // them the exact faction + sample vendor names. Otherwise fall
      // back to listing the factions they owe across all active quests.
      const namedHint = findQuestFactionHint(titleOrId);
      if (namedHint && namedHint.vendorNames.length > 0) {
        const sample = namedHint.vendorNames.slice(0, 2).join(' or ');
        get().appendLog(
          'arbiter',
          `The Arbiter waves. "${namedHint.contractTitle} closes out with the ${namedHint.factionLabel}. Find ${sample} — or any other ${namedHint.factionLabel} agent — to turn it in."`,
        );
        return;
      }
      const active = (player.activeFactionQuestIds ?? [])
        .map((id) => findFactionQuestById(id))
        .filter((q): q is NonNullable<ReturnType<typeof findFactionQuestById>> => !!q);
      if (active.length > 0) {
        // List the unique factions the player owes a turn-in to AND a
        // sample vendor name from each so they know what to look for.
        const factionEntries = Array.from(
          new Map(
            active.map((q) => {
              const f = FACTIONS.find((x) => x.id === q.factionId);
              return [q.factionId, f?.name ?? q.factionId.replace(/_/g, ' ')];
            }),
          ).entries(),
        );
        const lines = factionEntries.map(([fid, fname]) => {
          const sample = VENDORS.filter((v) => v.faction === fid).slice(0, 2).map((v) => v.name).join(' / ');
          return sample ? `${fname} (e.g. ${sample})` : fname;
        });
        const list =
          lines.length === 1
            ? `a ${lines[0]} vendor`
            : `a vendor from one of: ${lines.join('; ')}`;
        get().appendLog(
          'arbiter',
          `The Arbiter waves. "Find ${list} to turn that contract in."`,
        );
      } else {
        get().appendLog(
          'arbiter',
          `The Arbiter waves. "You have no active contracts. Find a faction vendor first."`,
        );
      }
      return;
    }
    const active = player.activeFactionQuestIds ?? [];
    // Direct id, then fuzzy title across active list.
    const direct = findFactionQuestById(titleOrId);
    const candidate = direct ?? fuzzyFindFactionQuest(
      titleOrId,
      active.map((id) => findFactionQuestById(id)).filter((q): q is NonNullable<typeof q> => !!q),
    );
    if (!candidate || !active.includes(candidate.id)) {
      get().appendLog(
        'arbiter',
        `${scene.vendor.name} squints. "That one isn't on your active slate."`,
      );
      return;
    }
    if (candidate.factionId !== scene.vendor.faction) {
      get().appendLog(
        'arbiter',
        `${scene.vendor.name} shakes their head. "Wrong faction. Take that to ${candidate.factionId.replace(/_/g, ' ')}."`,
      );
      return;
    }
    // Stage gate — quests with authored stages require the player to
    // reach the final stage before turn-in. Quests without stages
    // (legacy single-objective) are turn-in-able immediately, matching
    // the pre-refactor behavior.
    const activeRecord = (player.activeFactionQuests ?? []).find((q) => q.id === candidate.id);
    if (candidate.stages && candidate.stages.length > 0) {
      const currentStage = activeRecord?.stage ?? 0;
      if (currentStage < candidate.stages.length) {
        get().appendLog(
          'arbiter',
          `${scene.vendor.name} eyes you carefully. "${candidate.title} isn't done. You're on step ${currentStage + 1} of ${candidate.stages.length}. Come back when the work's behind you."`,
        );
        return;
      }
    }
    // Pay out reward + record completion.
    const repResult = applyRepChange(player.factionStanding, candidate.factionId, candidate.reward.rep);
    set((s) =>
      s.player
        ? {
            player: {
              ...s.player,
              tc: s.player.tc + candidate.reward.tc,
              factionStanding: repResult.standing,
              activeFactionQuestIds: (s.player.activeFactionQuestIds ?? []).filter((id) => id !== candidate.id),
              activeFactionQuests: (s.player.activeFactionQuests ?? []).filter((q) => q.id !== candidate.id),
              completedFactionQuestIds: [...(s.player.completedFactionQuestIds ?? []), candidate.id],
            },
          }
        : s,
    );
    get().appendLog(
      'reward',
      `✦ Faction contract complete — ${candidate.title}. +${candidate.reward.tc} TC, +${candidate.reward.rep} rep with ${candidate.factionId.replace(/_/g, ' ')}.`,
    );
    logRepChanges(get, repResult.changed);
    void get().persist();
  },

  acceptHunt(titleOrId) {
    const state = get();
    const player = state.player;
    const scene = state.currentScene;
    if (!player) return;
    if (state.tutorialDemoVendor) {
      get().appendLog('system', 'Tour mode — contracts can\'t be accepted until the tutorial ends.');
      return;
    }
    if (!scene?.vendor) {
      const hint = findQuestFactionHint(titleOrId);
      if (hint && hint.vendorNames.length > 0) {
        const sample = hint.vendorNames.slice(0, 2).join(' or ');
        get().appendLog(
          'arbiter',
          `The Arbiter shakes their head. "${hint.contractTitle} is a hunt of the ${hint.factionLabel}. Find ${sample} — or any other ${hint.factionLabel} agent — to take it on."`,
        );
      } else {
        get().appendLog(
          'arbiter',
          `The Arbiter shakes their head. "Hunts come from wandering faction vendors. Keep walking until one turns up at your scene."`,
        );
      }
      return;
    }
    const factionId = scene.vendor.faction;
    const playerRep = factionId ? getStanding(player.factionStanding, factionId) : 0;
    const direct = findHuntById(titleOrId);
    const pool = availableHunts(
      factionId,
      playerRep,
      (player.activeHunts ?? []).map((h) => h.id),
      player.completedHuntIds ?? [],
    );
    const hunt = direct && pool.includes(direct) ? direct : fuzzyFindHunt(titleOrId, pool);
    if (!hunt) {
      const titles = pool.map((h) => `"${h.title}"`).join(', ');
      get().appendLog(
        'arbiter',
        titles
          ? `${scene.vendor.name} thumbs through papers. "Not that one. Currently posted: ${titles}."`
          : `${scene.vendor.name} shakes their head. "No bounties for you right now."`,
      );
      return;
    }
    set((s) =>
      s.player
        ? {
            player: {
              ...s.player,
              activeHunts: [
                ...(s.player.activeHunts ?? []),
                { id: hunt.id, stage: 0, postedByFaction: factionId, acceptedAt: Date.now() },
              ],
            },
          }
        : s,
    );
    bumpQuestsAccepted(get, set);
    // Per-hunt stage0.arbiter suppressed on accept (see acceptFactionQuest
    // for rationale). Burst-aware meta line comes from bumpQuestsAccepted.
    const stage0 = hunt.stages[0];
    if (stage0) {
      get().appendLog('reward', `✦ Hunt accepted — ${hunt.title}. ${hunt.posterText}`);
      get().appendLog('world', stage0.narration);
    }
    set((s) =>
      s.player
        ? {
            player: {
              ...s.player,
              activeHunts: (s.player.activeHunts ?? []).map((h) =>
                h.id === hunt.id ? { ...h, stage: 1 } : h,
              ),
            },
          }
        : s,
    );
    void get().persist();
  },

  // Advance the player's most relevant active hunt one stage. Called by
  // skill-check successes when the player's intent matches the next stage's
  // expected check kind. Final stage spawns the scaled boss into the scene.
  advanceHunt(huntId) {
    const state = get();
    const player = state.player;
    if (!player) return;
    const active = player.activeHunts ?? [];
    const record = active.find((h) => h.id === huntId);
    const hunt = findHuntById(huntId);
    if (!record || !hunt) return;
    const stageDef = hunt.stages[record.stage];
    if (!stageDef) return;
    get().appendLog('world', stageDef.narration);
    if (stageDef.arbiter) get().appendLog('arbiter', stageDef.arbiter);
    // Boss stage spawns the scaled enemy and freezes the hunt at this stage
    // until the boss dies; otherwise advance the stage counter.
    if (stageDef.checkKind === 'boss') {
      const boss = scaleHuntBoss(player, hunt);
      if (boss) {
        set((s) =>
          s.currentScene
            ? {
                currentScene: {
                  ...s.currentScene,
                  enemies: [boss],
                  enemyHps: [boss.hp],
                  activeEnemyIdx: 0,
                  range: 'close',
                },
              }
            : s,
        );
        get().appendLog('combat', `${boss.name} closes the distance. The hunt comes to its end.`);
      }
    }
    set((s) =>
      s.player
        ? {
            player: {
              ...s.player,
              activeHunts: (s.player.activeHunts ?? []).map((h) =>
                h.id === huntId ? { ...h, stage: h.stage + 1 } : h,
              ),
            },
          }
        : s,
    );
    void get().persist();
  },

  turnInHunt(titleOrId) {
    const state = get();
    const player = state.player;
    const scene = state.currentScene;
    if (!player) return;
    if (!scene?.vendor) {
      get().appendLog('arbiter', `The Arbiter folds their arms. "Need someone to pay you. Find a vendor."`);
      return;
    }
    const active = player.activeHunts ?? [];
    const direct = findHuntById(titleOrId);
    const candidate = direct ?? fuzzyFindHunt(
      titleOrId,
      active.map((r) => findHuntById(r.id)).filter((h): h is NonNullable<typeof h> => !!h),
    );
    if (!candidate) {
      get().appendLog('arbiter', `${scene.vendor.name} squints. "That hunt is not on your slate."`);
      return;
    }
    const record = active.find((h) => h.id === candidate.id);
    if (!record) {
      get().appendLog('arbiter', `${scene.vendor.name} squints. "That hunt is not on your slate."`);
      return;
    }
    if (record.stage < candidate.stages.length) {
      get().appendLog(
        'arbiter',
        `${scene.vendor.name} reads your face. "The trophy is the proof. You don't have it yet."`,
      );
      return;
    }
    if (candidate.factionId && candidate.factionId !== scene.vendor.faction) {
      get().appendLog(
        'arbiter',
        `${scene.vendor.name} shakes their head. "Wrong agent. ${candidate.factionId.replace(/_/g, ' ')} posted that one."`,
      );
      return;
    }
    // Pay out: TC + optional item + optional rep + always the trophy.
    const trophy: InventoryItem = stampDurability({
      id: `trophy_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: candidate.trophyName,
      kind: 'relic',
      rarity: 'Rare',
      quantity: 1,
      tags: ['trophy', 'hunt'],
      description: `Trophy from the hunt for the ${candidate.targetEnemyName}.`,
    });
    const newInventory = candidate.rewardItem
      ? [...player.inventory, trophy, stampDurability({
          id: `huntreward_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          name: candidate.rewardItem,
          kind: lookupCraftedItem(candidate.rewardItem).kind === 'weapon' ? 'weapon' : 'misc',
          rarity: lookupCraftedItem(candidate.rewardItem).rarity,
          quantity: 1,
          tags: lookupCraftedItem(candidate.rewardItem).tags,
        })]
      : [...player.inventory, trophy];
    const repResult = candidate.factionId && candidate.rewardRep
      ? applyRepChange(player.factionStanding, candidate.factionId, candidate.rewardRep)
      : { standing: player.factionStanding.map((r) => ({ ...r })), changed: [] };
    set((s) =>
      s.player
        ? {
            player: {
              ...s.player,
              tc: s.player.tc + candidate.rewardTc,
              inventory: newInventory,
              factionStanding: repResult.standing,
              activeHunts: (s.player.activeHunts ?? []).filter((h) => h.id !== candidate.id),
              completedHuntIds: [...(s.player.completedHuntIds ?? []), candidate.id],
            },
          }
        : s,
    );
    get().appendLog(
      'reward',
      `✦ Hunt complete — ${candidate.title}. +${candidate.rewardTc} TC${candidate.rewardRep ? `, +${candidate.rewardRep} rep` : ''}. Trophy recovered.`,
    );
    if (repResult.changed.length > 0) logRepChanges(get, repResult.changed);
    recordMemorableEvent(get, set, {
      kind: 'rare_kill',
      text: `Completed the hunt for the ${candidate.targetEnemyName}.`,
      enemyName: candidate.targetEnemyName,
    });
    void get().persist();
  },

  acceptMystery(titleOrId) {
    const state = get();
    const player = state.player;
    const scene = state.currentScene;
    if (!player) return;
    if (state.tutorialDemoVendor) {
      get().appendLog('system', 'Tour mode — contracts can\'t be accepted until the tutorial ends.');
      return;
    }
    if (!scene?.vendor) {
      const hint = findQuestFactionHint(titleOrId);
      if (hint && hint.vendorNames.length > 0) {
        const sample = hint.vendorNames.slice(0, 2).join(' or ');
        get().appendLog(
          'arbiter',
          `The Arbiter shakes their head. "${hint.contractTitle} is a mystery the ${hint.factionLabel} pay for. Find ${sample} — or any other ${hint.factionLabel} agent — to take it on."`,
        );
      } else {
        get().appendLog('arbiter', `The Arbiter shakes their head. "Mystery work needs a buyer. Find a vendor."`);
      }
      return;
    }
    const factionId = scene.vendor.faction;
    const playerRep = factionId ? getStanding(player.factionStanding, factionId) : 0;
    const direct = findMysteryById(titleOrId);
    const pool = availableMysteries(
      factionId,
      playerRep,
      (player.activeMysteries ?? []).map((m) => m.id),
      player.completedMysteryIds ?? [],
    );
    const m = direct && pool.includes(direct) ? direct : fuzzyFindMystery(titleOrId, pool);
    if (!m) {
      const titles = pool.map((m2) => `"${m2.title}"`).join(', ');
      get().appendLog(
        'arbiter',
        titles
          ? `${scene.vendor.name} unrolls a list. "Not that one. Currently posted: ${titles}."`
          : `${scene.vendor.name} shakes their head. "No mystery work for you right now."`,
      );
      return;
    }
    set((s) =>
      s.player
        ? {
            player: {
              ...s.player,
              activeMysteries: [
                ...(s.player.activeMysteries ?? []),
                { id: m.id, stage: 0, postedByFaction: factionId, acceptedAt: Date.now() },
              ],
            },
          }
        : s,
    );
    bumpQuestsAccepted(get, set);
    // Per-mystery stage0.arbiter suppressed (burst-aware line above).
    const stage0 = m.stages[0];
    if (stage0) {
      get().appendLog('reward', `✦ Mystery accepted — ${m.title}. ${m.posterText}`);
      get().appendLog('world', stage0.narration);
    }
    set((s) =>
      s.player
        ? {
            player: {
              ...s.player,
              activeMysteries: (s.player.activeMysteries ?? []).map((mm) =>
                mm.id === m.id ? { ...mm, stage: 1 } : mm,
              ),
            },
          }
        : s,
    );
    void get().persist();
  },

  advanceMystery(mysteryId) {
    const state = get();
    const player = state.player;
    if (!player) return;
    const active = player.activeMysteries ?? [];
    const record = active.find((m) => m.id === mysteryId);
    const mystery = findMysteryById(mysteryId);
    if (!record || !mystery) return;
    const stageDef = mystery.stages[record.stage];
    if (!stageDef) return;
    get().appendLog('world', stageDef.narration);
    if (stageDef.arbiter) get().appendLog('arbiter', stageDef.arbiter);
    // Final stage is the "synthesis" — the player has the trophy in hand
    // (narratively); advance the stage past the end so turn-in unlocks.
    const nextStage = record.stage + 1;
    set((s) =>
      s.player
        ? {
            player: {
              ...s.player,
              activeMysteries: (s.player.activeMysteries ?? []).map((m) =>
                m.id === mysteryId ? { ...m, stage: nextStage } : m,
              ),
            },
          }
        : s,
    );
    if (nextStage >= mystery.stages.length) {
      get().appendLog(
        'reward',
        `✦ ${mystery.trophyName} recovered. Return to a posting agent to turn in "${mystery.title}".`,
      );
    }
    void get().persist();
  },

  turnInMystery(titleOrId) {
    const state = get();
    const player = state.player;
    const scene = state.currentScene;
    if (!player) return;
    if (!scene?.vendor) {
      get().appendLog('arbiter', `The Arbiter folds their arms. "Need a buyer. Find a vendor."`);
      return;
    }
    const active = player.activeMysteries ?? [];
    const direct = findMysteryById(titleOrId);
    const candidate = direct ?? fuzzyFindMystery(
      titleOrId,
      active.map((r) => findMysteryById(r.id)).filter((m): m is NonNullable<typeof m> => !!m),
    );
    if (!candidate) {
      get().appendLog('arbiter', `${scene.vendor.name} squints. "That mystery is not on your slate."`);
      return;
    }
    const record = active.find((m) => m.id === candidate.id);
    if (!record) {
      get().appendLog('arbiter', `${scene.vendor.name} squints. "That mystery is not on your slate."`);
      return;
    }
    if (record.stage < candidate.stages.length) {
      get().appendLog(
        'arbiter',
        `${scene.vendor.name} reads your face. "The artifact is the proof. You don't have it yet."`,
      );
      return;
    }
    if (candidate.factionId && candidate.factionId !== scene.vendor.faction) {
      get().appendLog(
        'arbiter',
        `${scene.vendor.name} shakes their head. "Wrong agent. ${candidate.factionId.replace(/_/g, ' ')} posted that."`,
      );
      return;
    }
    const trophy: InventoryItem = stampDurability({
      id: `mystery_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: candidate.trophyName,
      kind: 'relic',
      rarity: 'Rare',
      quantity: 1,
      tags: ['trophy', 'mystery'],
      description: `Recovered from the mystery: ${candidate.title}.`,
    });
    const newInventory = candidate.rewardItem
      ? [...player.inventory, trophy, stampDurability({
          id: `mysteryreward_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          name: candidate.rewardItem,
          kind: 'misc',
          rarity: lookupCraftedItem(candidate.rewardItem).rarity,
          quantity: 1,
          tags: lookupCraftedItem(candidate.rewardItem).tags,
        })]
      : [...player.inventory, trophy];
    const repResult = candidate.factionId && candidate.rewardRep
      ? applyRepChange(player.factionStanding, candidate.factionId, candidate.rewardRep)
      : { standing: player.factionStanding.map((r) => ({ ...r })), changed: [] };
    set((s) =>
      s.player
        ? {
            player: {
              ...s.player,
              tc: s.player.tc + candidate.rewardTc,
              inventory: newInventory,
              factionStanding: repResult.standing,
              activeMysteries: (s.player.activeMysteries ?? []).filter((m) => m.id !== candidate.id),
              completedMysteryIds: [...(s.player.completedMysteryIds ?? []), candidate.id],
            },
          }
        : s,
    );
    get().appendLog(
      'reward',
      `✦ Mystery complete — ${candidate.title}. +${candidate.rewardTc} TC${candidate.rewardRep ? `, +${candidate.rewardRep} rep` : ''}.`,
    );
    if (repResult.changed.length > 0) logRepChanges(get, repResult.changed);
    void get().persist();
  },

  acceptStoryline(titleOrId) {
    const state = get();
    const player = state.player;
    const scene = state.currentScene;
    if (!player) return;
    if (state.tutorialDemoVendor) {
      get().appendLog('system', 'Tour mode — contracts can\'t be accepted until the tutorial ends.');
      return;
    }
    if (!scene?.vendor?.faction) {
      const hint = findQuestFactionHint(titleOrId);
      if (hint && hint.vendorNames.length > 0) {
        const sample = hint.vendorNames.slice(0, 2).join(' or ');
        get().appendLog(
          'arbiter',
          `The Arbiter shakes their head. "${hint.contractTitle} is a storyline of the ${hint.factionLabel}. Find ${sample} — or any other ${hint.factionLabel} agent — to take it on."`,
        );
      } else {
        get().appendLog('arbiter', `The Arbiter shakes their head. "Storylines come from faction agents. Find one."`);
      }
      return;
    }
    const factionId = scene.vendor.faction;
    const playerRep = getStanding(player.factionStanding, factionId);
    const direct = findStorylineById(titleOrId);
    const pool = availableStorylines(
      factionId,
      playerRep,
      (player.activeStorylines ?? []).map((s) => s.id),
      player.completedStorylineIds ?? [],
    );
    const s = direct && pool.includes(direct) ? direct : fuzzyFindStoryline(titleOrId, pool);
    if (!s) {
      const titles = pool.map((s2) => `"${s2.title}"`).join(', ');
      get().appendLog(
        'arbiter',
        titles
          ? `${scene.vendor.name} unrolls a thicker scroll. "Not that one. Currently posted storyline: ${titles}."`
          : `${scene.vendor.name} shakes their head. "No long-form work for you right now."`,
      );
      return;
    }
    set((st) =>
      st.player
        ? {
            player: {
              ...st.player,
              activeStorylines: [
                ...(st.player.activeStorylines ?? []),
                { id: s.id, stage: 0, postedByFaction: factionId, acceptedAt: Date.now() },
              ],
            },
          }
        : st,
    );
    bumpQuestsAccepted(get, set);
    // Per-storyline stage0.arbiter suppressed (burst-aware line above).
    const stage0 = s.stages[0];
    if (stage0) {
      get().appendLog('reward', `✦ Storyline accepted — ${s.title}. ${s.posterText}`);
      get().appendLog('world', stage0.narration);
    }
    set((st) =>
      st.player
        ? {
            player: {
              ...st.player,
              activeStorylines: (st.player.activeStorylines ?? []).map((rec) =>
                rec.id === s.id ? { ...rec, stage: 1 } : rec,
              ),
            },
          }
        : st,
    );
    void get().persist();
  },

  advanceStoryline(storylineId) {
    const state = get();
    const player = state.player;
    if (!player) return;
    const active = player.activeStorylines ?? [];
    const record = active.find((s) => s.id === storylineId);
    const def = findStorylineById(storylineId);
    if (!record || !def) return;
    const stageDef = def.stages[record.stage];
    if (!stageDef) return;
    get().appendLog('world', stageDef.narration);
    if (stageDef.arbiter) get().appendLog('arbiter', stageDef.arbiter);
    const nextStage = record.stage + 1;
    set((s) =>
      s.player
        ? {
            player: {
              ...s.player,
              activeStorylines: (s.player.activeStorylines ?? []).map((rec) =>
                rec.id === storylineId ? { ...rec, stage: nextStage } : rec,
              ),
            },
          }
        : s,
    );
    if (nextStage >= def.stages.length) {
      get().appendLog(
        'reward',
        `✦ Storyline complete in the field — ${def.title}. Return to a posting agent to turn it in.`,
      );
    }
    void get().persist();
  },

  turnInStoryline(titleOrId) {
    const state = get();
    const player = state.player;
    const scene = state.currentScene;
    if (!player) return;
    if (!scene?.vendor) {
      get().appendLog('arbiter', `The Arbiter folds their arms. "Find an agent."`);
      return;
    }
    const active = player.activeStorylines ?? [];
    const direct = findStorylineById(titleOrId);
    const candidate = direct ?? fuzzyFindStoryline(
      titleOrId,
      active.map((r) => findStorylineById(r.id)).filter((s): s is NonNullable<typeof s> => !!s),
    );
    if (!candidate) {
      get().appendLog('arbiter', `${scene.vendor.name} squints. "Not on your slate."`);
      return;
    }
    const record = active.find((s) => s.id === candidate.id);
    if (!record) {
      get().appendLog('arbiter', `${scene.vendor.name} squints. "Not on your slate."`);
      return;
    }
    if (record.stage < candidate.stages.length) {
      get().appendLog(
        'arbiter',
        `${scene.vendor.name} reads your face. "Storyline isn't finished. Come back."`,
      );
      return;
    }
    if (candidate.factionId !== scene.vendor.faction) {
      get().appendLog(
        'arbiter',
        `${scene.vendor.name} shakes their head. "Wrong faction. ${candidate.factionId.replace(/_/g, ' ')} posted that one."`,
      );
      return;
    }
    const newInventory = candidate.rewardItem
      ? [...player.inventory, stampDurability({
          id: `story_reward_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          name: candidate.rewardItem,
          kind: 'misc',
          rarity: lookupCraftedItem(candidate.rewardItem).rarity,
          quantity: 1,
          tags: lookupCraftedItem(candidate.rewardItem).tags,
        })]
      : [...player.inventory];
    const repResult = applyRepChange(player.factionStanding, candidate.factionId, candidate.rewardRep);
    set((s) =>
      s.player
        ? {
            player: {
              ...s.player,
              tc: s.player.tc + candidate.rewardTc,
              inventory: newInventory,
              factionStanding: repResult.standing,
              activeStorylines: (s.player.activeStorylines ?? []).filter((rec) => rec.id !== candidate.id),
              completedStorylineIds: [...(s.player.completedStorylineIds ?? []), candidate.id],
            },
          }
        : s,
    );
    get().appendLog(
      'reward',
      `✦ Storyline complete — ${candidate.title}. +${candidate.rewardTc} TC, +${candidate.rewardRep} rep with ${candidate.factionId.replace(/_/g, ' ')}.`,
    );
    if (repResult.changed.length > 0) logRepChanges(get, repResult.changed);
    void get().persist();
  },

  // Walk one tile on the procedural map. If the tile contains a named
  // location, switch to it; otherwise narrate a wander. A compass in the
  // inventory upgrades the narration with directional hints.
  stepDirection(dir: Direction) {
    const player = get().player;
    const scene = get().currentScene;
    if (!player || !scene) return;
    const seed = player.mapSeed ?? `${player.name}|${player.raceId}|${player.factionId}|legacy`;
    const map: WorldMap = generateWorldMap(seed, player.currentLocationId);
    const fromX = player.mapX ?? 4;
    const fromY = player.mapY ?? 4;
    const step = stepInDirection(map, fromX, fromY, dir);
    // Record both the new coordinates AND the direction so "continue" can
    // repeat the same step without the player retyping the bearing.
    set((s) =>
      s.player
        ? { player: { ...s.player, mapX: step.x, mapY: step.y, lastTravelDirection: dir } }
        : s,
    );
    if (step.landedOn && step.landedOn.locationId !== player.currentLocationId) {
      get().appendLog('world', `You walk ${dir}. You arrive at ${step.landedOn.locationName}.`);
      get().travelTo(step.landedOn.locationId);
      return;
    }
    // Re-entry narration — when a cardinal step lands on a tile the
    // player has been to before AND that tile has persisted
    // vandal-state (dropped items / opened containers), surface it.
    // beginScene already does this, but it only fires on Location
    // change. Without this hook, stepping back to a previously-
    // vandalized tile would silently skip the narration even though
    // the engine state is still on disk.
    const reentryKey = makeRoomKey(player.currentLocationId, scene.microMicroId, step.x, step.y);
    const visited = get().worldMemory.visitedRooms?.[reentryKey];
    if (visited && (visited.droppedItems?.length || visited.containersOpened?.length)) {
      if (visited.droppedItems?.length) {
        const itemList = visited.droppedItems
          .map((d) => d.quantity > 1 ? `${d.name} x${d.quantity}` : d.name)
          .join(', ');
        get().appendLog('world', `On the ground: ${itemList}. (left here by you, type 'pick up' to retrieve.)`);
      }
      if (visited.containersOpened?.length) {
        get().appendLog('world', `Still open from before: ${visited.containersOpened.join(', ')}.`);
      }
    }
    // Open ground — narrate a wander and plant a hook. Compass in pack
    // adds direction-aware hint of what's ahead.
    const hasCompass = player.inventory.some(
      (i) => /compass|cradle of dusk compass/i.test(i.name) && i.quantity > 0,
    );
    if (hasCompass) {
      const survey = surveyAll(map, step.x, step.y);
      const ahead = survey[dir];
      const hint = ahead
        ? `The compass tells you ${ahead.name} lies ${ahead.distance} stretch${ahead.distance > 1 ? 'es' : ''} further ${dir}.`
        : `The compass points ${dir} into open ground.`;
      get().appendLog('world', `You walk ${dir} through open silt. ${hint}`);
    } else {
      // Cardinal-travel narration pool. Previous 4-variant set hit
      // 100% Jaccard repetition by the 9th visit in the literary
      // audit's Groundhog Day test — across 15 same-tile re-entries,
      // 10 of 105 pairs were >80% similar. Expanded to 16 variants
      // grouped loosely by sensory focus (footing, sky, sound,
      // smell, ground texture, distance perception) so consecutive
      // visits hit different aspects of the wilderness.
      const directional = rotatingPick(
        [
          // Footing / ground
          `You walk ${dir}. The ground here looks much like the ground behind you. You have lost track of distance.`,
          `You push ${dir}. The silt is heavy underfoot, the horizon unchanged.`,
          `You set out ${dir}. Your boots sink half an inch into the mud-flats and pull free with each step.`,
          `You strike out ${dir}. The country resists you with sameness more than distance.`,
          // Sky / weather memory
          `You head ${dir}. Mud-flats stretch the same in every direction — only the wind tells you you've moved.`,
          `You move ${dir} under a sky the color of rust. Whatever sun there was has been wrung out by the haze.`,
          `You press ${dir}. Clouds drag along the horizon like silt in still water, slow and indifferent.`,
          // Sound / silence
          `You walk ${dir}. The silence has the weight of old metal. Your breath is the only thing that disagrees.`,
          `You step ${dir}. Somewhere distant, something settles — a stone giving up, or a structure remembering it once stood.`,
          `You push ${dir}. The wind has a voice today; mostly it just murmurs old syllables you don't quite catch.`,
          // Smell / atmosphere
          `You head ${dir}. The air smells like wet iron and forge ash. Tartaria's signature.`,
          `You strike out ${dir}. Whatever ferments under the mud sends up a sweet, wrong note as you cross it.`,
          // Distance / perception
          `You move ${dir}. After a while the road stops counting itself. You take it on faith you've made progress.`,
          `You press ${dir}. The horizon stays a promise you can't quite collect on.`,
          `You walk ${dir}. The world unscrolls slowly, more topography than landmark.`,
          `You head ${dir}. You measure the trek in changes of pressure, not in feet.`,
        ],
        `wander.directional.${dir}`,
      );
      get().appendLog('world', directional);
    }
    // Wasteland encounter roll — every ~7-8 cardinal steps the player
    // walks into something: an abandoned caravan with a note, a
    // wandering drifter with a tip, a fungal patch, a skirmish, the
    // old bus with a duffel bag, etc. Data-driven via
    // app/data/world/wasteland_encounters.json. Tuned with a
    // 3-step minimum + 40% chance per eligible roll so the world
    // feels populated without becoming a theme park. Skipped during
    // active combat (the scene already has plenty going on).
    if (scene.enemies.length === 0) {
      const wasteSteps = (get().wastelandStepsSinceEncounter ?? 0) + 1;
      set(() => ({ wastelandStepsSinceEncounter: wasteSteps }));
      // Tuning per playtest: a long run with zero combat at all means
      // the gate was too cautious. Tightened from threshold=3 /
      // chance=0.4 (≈ 7% combat per step after skirmish-weight math)
      // to threshold=2 / chance=0.55 — combined with the bumped
      // skirmish weight in container_loot.json, this lands around
      // 18-22% combat per step. Walking through Tartaria SHOULD feel
      // dangerous.
      const enc = pickWastelandEncounter(scene.location, {
        stepsSinceLastEncounter: wasteSteps,
        threshold: 2,
        rollChance: 0.55,
      });
      if (enc) {
        set(() => ({ wastelandStepsSinceEncounter: 0 }));
        get().appendLog('world', enc.narration);
        if (enc.npcLine) get().appendLog('arbiter', enc.npcLine);
        if (enc.loreNote) get().appendLog('world', enc.loreNote);
        if (enc.loot) {
          const livePlayer = get().player;
          if (livePlayer) {
            // Collectable-fragment substitution. Per design: low spawn
            // rate, consumes the drop slot, biome-matched. If a fragment
            // fires, skip the normal loot grant entirely — the fragment
            // IS the loot for this encounter.
            const fragId = pickFragmentForBiome(
              livePlayer.collectables ?? [],
              scene.location.tags ?? [],
            );
            if (fragId) {
              get().grantCollectableFragment(fragId);
            } else {
              const grantResult = grantItem(livePlayer.inventory, {
                id: `${enc.loot.name}_${Date.now()}`,
                name: enc.loot.name,
                kind: enc.loot.kind,
                quantity: enc.loot.quantity,
                tags: enc.loot.tags,
              });
              set((s) => (s.player
                ? { player: { ...s.player, inventory: grantResult.inventory } }
                : s));
              if (grantResult.accepted > 0) {
                get().appendLog(
                  'reward',
                  `✦ Recovered ${enc.loot.name}${grantResult.accepted > 1 ? ` x${grantResult.accepted}` : ''}.`,
                );
              }
            }
          }
        }
        // Skirmish enemy spawn OR mini-dungeon bandit spawn — same flow,
        // either route lands an enemy in the scene that combat resolution
        // picks up on the next player turn.
        if ((enc.type === 'skirmish' || enc.type === 'mini_dungeon') && enc.enemyName) {
          const spawned = findEnemyByName(enc.enemyName);
          if (spawned) {
            set((s) => {
              if (!s.currentScene) return s;
              return {
                currentScene: {
                  ...s.currentScene,
                  enemies: [...s.currentScene.enemies, spawned],
                  enemyHps: [...s.currentScene.enemyHps, spawned.hp],
                  activeEnemyIdx: s.currentScene.enemies.length,
                  range: s.currentScene.range ?? 'close',
                  enemyAmbushUsed: [...(s.currentScene.enemyAmbushUsed ?? []), false],
                },
              };
            });
            const flavour = enc.type === 'mini_dungeon'
              ? `${spawned.name} steps out of the shadows of the place — ${spawned.attack} ready, ${spawned.damage} damage on a hit. The loot you found will leave with whoever walks out alive. (range: close)`
              : `${spawned.name} closes — ${spawned.attack} ready, ${spawned.damage} damage on a hit. (range: close)`;
            get().appendLog('combat', flavour);
          } else {
            get().appendLog('debug', `wasteland-encounter: ${enc.type} spawn missed (no enemy "${enc.enemyName}" in catalog).`);
          }
        }
        // Mini-dungeon quest hook — add the named hunt or mystery to
        // the player's active board without going through a vendor.
        // Skips silently if the player already has it active or has
        // completed it, OR if the id doesn't resolve (data drift).
        if (enc.type === 'mini_dungeon' && enc.questHook) {
          grantQuestHook(get, set, enc.questHook);
        }
        void get().persist();
      }
    }

    // Plant a hook on the wander (same as narrateWanderingJourney does).
    narrateWanderingJourney(get, set, scene);
  },

  // Set the enemy the player is currently targeting. Bound to taps and
  // horizontal swipes on the EnemyPanel.
  // Direct craft entry point — used by the CraftingScreen so taps don't
  // have to round-trip through the parser. Calls the same code path as
  // typed `craft <name>` via submitPlayerAction.
  craftRecipe(recipeName: string) {
    get().submitPlayerAction(`craft ${recipeName}`);
  },

  clearSlotLoadError() {
    set({ slotLoadError: null });
  },

  // Tutorial — runs once after first character creation. Players can skip
  // at the welcome modal or any subsequent step. End of tutorial (skip or
  // completion) marks player.hasSeenIntro=true so it never re-runs.
  startTutorial() {
    set({ tutorialStep: 0 });
  },
  advanceTutorial() {
    const current = get().tutorialStep ?? 0;
    const next = current + 1;
    // Total count comes from the step array — no more magic numbers
    // drifting out of sync when steps are added or reordered.
    if (next >= TUTORIAL_STEPS.length) {
      get().skipTutorial();
      return;
    }
    const currentStep = TUTORIAL_STEPS[current];
    const nextStep = TUTORIAL_STEPS[next];
    const enteringVendor = nextStep?.screen === 'vendor';
    const leavingVendor = currentStep?.screen === 'vendor' && nextStep?.screen !== 'vendor';
    // Drive the screen swap atomically with the step change. Previously
    // we relied on TutorialOverlay's useEffect to dispatch setScreen
    // after a re-render — that opened a one-frame window where the
    // old screen rendered against new tutorial state (e.g. vendor
    // screen with vendor=null after leaving the demo). Putting
    // currentScreen in the same set() removes the in-between frame
    // and the freeze it occasionally triggered.
    const nextScreen = nextStep?.screen ?? 'exploration';
    if (enteringVendor) {
      const vendor = findVendorByName('Irma Ironhand') ?? pickRandomVendor();
      set((s) => ({
        currentScene: s.currentScene
          ? { ...s.currentScene, vendor }
          : s.currentScene,
        tutorialDemoVendor: vendor,
        tutorialStep: next,
        currentScreen: nextScreen,
      }));
      return;
    }
    if (leavingVendor) {
      set((s) => ({
        currentScene: s.currentScene
          ? { ...s.currentScene, vendor: null }
          : s.currentScene,
        tutorialDemoVendor: null,
        tutorialStep: next,
        currentScreen: nextScreen,
      }));
      return;
    }
    set({ tutorialStep: next, currentScreen: nextScreen });
  },
  skipTutorial() {
    // Clear any tutorial-injected vendor from the scene.
    set((s) => {
      const patch: Partial<GameStore> = { tutorialStep: null, tutorialDemoVendor: null };
      if (s.currentScene && s.tutorialDemoVendor && s.currentScene.vendor === s.tutorialDemoVendor) {
        patch.currentScene = { ...s.currentScene, vendor: null };
      }
      // Persist hasSeenIntro=true so the tutorial never re-runs for this character.
      if (s.player) {
        patch.player = { ...s.player, hasSeenIntro: true };
      }
      return patch;
    });
    void get().persist();
  },

  setActiveEnemyIdx(idx: number) {
    set((s) => {
      if (!s.currentScene || s.currentScene.enemies.length === 0) return {};
      const clamped = Math.max(0, Math.min(s.currentScene.enemies.length - 1, idx));
      return { currentScene: { ...s.currentScene, activeEnemyIdx: clamped } };
    });
  },

  digHere() {
    const state = get();
    const player = state.player;
    const scene = state.currentScene;
    if (!player) return;
    const digBlocker = activeEnemy(scene);
    if (digBlocker) {
      get().appendLog('arbiter', `The Arbiter shakes their head. "Not while ${digBlocker.name} is on you."`);
      return;
    }
    // Hub rooms are hand-authored — mud-bricks, board floors, stone
    // tile — not silt to scrape. Refuse with a hub-flavored message
    // so "search the ground" inside the outpost reads as the player
    // expects (no dig path, no rare loot, no tool wear).
    if (player.hubRoomId) {
      get().appendLog(
        'arbiter',
        `The Arbiter shakes their head. "The outpost floors are board and brick — no silt to scrape. Type 'leave outpost' to head outside the gate; once on the silt you can dig for rocks, sticks, scraps, and the other stock that builds clubs and spears."`,
        { skipDedup: true },
      );
      return;
    }
    // The previous per-spot lockout (`lastDugSpot === spotKey →
    // refuse`) was too aggressive — playtest report: "50 attempts,
    // 0 rocks or sticks." Each tile only yielded ONE successful
    // dig, then refused all follow-ups. The new approach: rely on
    // roomLootAlreadyGrabbed (below) to handle non-stackable
    // uniqueness, AND on stamina cost (1 / dig) to throttle the
    // loop. Stackable commodities — Mud Fragment, Small Rock, Big
    // Rock, Stick, Spider Silk, Patched Cloth, Trail Rations,
    // Aether Mud / Residue / Crystal, Scrap Metal, Aetheric Shard
    // — re-roll freely so the player can actually gather enough
    // crafting stock to build a Stone Spear or Cudgel without
    // walking 30 tiles between digs.
    const hubPart = player.hubRoomId ?? '_';
    const microPart = scene?.microMicroId ?? '_';
    const spotKey = `${player.currentLocationId}:${hubPart}:${microPart}:${player.mapX ?? 0}:${player.mapY ?? 0}`;
    // Still record the last-dug spot for any callers that read it,
    // but no longer use it as a refusal gate.
    void spotKey;
    const { item, score } = bestDigTool(player.inventory);
    // Require a real tool. bestDigTool returns score=1 for bare hands;
    // anything 2+ means the player has at least an improvised edge
    // (knife, trowel, blade, spear, sturdy rock). Without one, refuse
    // — surface dirt with bare fingers isn't the game's loot path.
    if (!item || score < 2) {
      get().appendLog(
        'arbiter',
        `The Arbiter shakes their head. "You cannot dig — you have no tool that can. Find a knife, a trowel, or even a sharp scrap to scrape with."`,
        { skipDedup: true },
      );
      return;
    }
    // Digging takes a beat and a little stamina.
    set((s) => (s.player ? { player: advanceTime(spendStamina(s.player, 1), 0.4) } : s));
    // Lock the spot up-front so even failed digs count as "worked".
    set((s) => (s.player ? { player: { ...s.player, lastDugSpot: spotKey } } : s));
    const toolLabel = item ? `the ${item.name.toLowerCase()}` : 'your bare hands';
    const result = rollDig(score);
    // Dig damage scales with tool — a brittle knife loses 3 durability,
    // a beefy spear loses 1. Bare hands cost nothing but find less. The
    // tradeoff: digging with your best weapon is fast, but breaks it.
    const wearAmount = item ? Math.max(1, 4 - score) : 0;
    if (result.nothing) {
      get().appendLog(
        'world',
        `You scrape at the silt with ${toolLabel}. ${item ? '' : 'Hard going. '}Nothing of worth.`,
      );
      // Failed dig still wears the tool, but less.
      if (item) {
        for (let i = 0; i < Math.max(1, wearAmount - 1); i++) {
          set((s) => (s.player ? { player: wearEquippedItem(s.player, item.name, get) } : s));
        }
      }
      void get().persist();
      return;
    }
    const found = result.found!;
    // HANDOFF #15c — if the player already pulled this exact item from
    // THIS room on a prior visit, the room is "tapped" for it. Skip the
    // grant and narrate the bare patch instead of handing out duplicates.
    // Stackable consumables/misc are exempt — those can plausibly be
    // re-found because they're commodities, not bespoke drops.
    const dugCat = lookupCraftedItem(found.name);
    const isStackableCommodity = dugCat.kind === 'consumable' || dugCat.kind === 'misc';
    const dugRoomKey = makeRoomKey(player.currentLocationId, scene?.microMicroId, player.mapX, player.mapY);
    if (!isStackableCommodity && roomLootAlreadyGrabbed(get().worldMemory, dugRoomKey, found.name)) {
      get().appendLog(
        'world',
        `You scrape at the silt with ${toolLabel}. The patch is picked clean — you've already taken what was here.`,
      );
      if (item) {
        // Tool still wears a little — you swung it.
        for (let i = 0; i < Math.max(1, wearAmount - 1); i++) {
          set((s) => (s.player ? { player: wearEquippedItem(s.player, item.name, get) } : s));
        }
      }
      void get().persist();
      return;
    }
    const newItem: InventoryItem = stampDurability({
      id: `dug_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: found.name,
      kind: dugCat.kind === 'weapon'
        ? 'weapon'
        : dugCat.kind === 'armor'
          ? 'armor'
          : dugCat.kind,
      rarity: found.rarity,
      quantity: 1,
      tags: dugCat.tags,
    });
    // Use grantItem so we can surface per-name caps (Big Rock = 1,
    // Small Rock = 10, etc.) — silent drops feel like the game is
    // eating loot.
    const grantResult = grantItem(player.inventory, newItem);
    set((s) =>
      s.player
        ? { player: { ...s.player, inventory: grantResult.inventory } }
        : s,
    );
    // Record this loot against the room so a re-entry doesn't drop the
    // same item again (handled above before the grant). Only record
    // when at least one unit actually landed.
    if (!isStackableCommodity && grantResult.accepted > 0) {
      set((s) => recordRoomLootGrabbed(s, dugRoomKey, found.name));
    }
    if (grantResult.accepted > 0) {
      get().appendLog(
        'reward',
        `You scrape at the silt with ${toolLabel}. ✦ Recovered ${found.name} (${found.rarity}).`,
      );
    } else {
      // Cap hit before any unit landed — already at the maximum.
      get().appendLog(
        'world',
        `You scrape at the silt with ${toolLabel}. You turn up another ${found.name}, but your pack already holds as many as it can carry. You leave it in the silt.`,
      );
    }
    if (grantResult.dropped > 0 && grantResult.accepted > 0) {
      // Partial accept — some landed, some clamped.
      get().appendLog(
        'world',
        `Your pack is full of ${found.name.toLowerCase()}${grantResult.dropped > 1 ? 's' : ''}; ${grantResult.dropped} left behind.`,
      );
    }
    // Successful dig wears the tool — brittle tools lose more.
    if (item) {
      for (let i = 0; i < wearAmount; i++) {
        set((s) => (s.player ? { player: wearEquippedItem(s.player, item.name, get) } : s));
      }
    }
    void get().persist();
  },

  equipItem(itemName, slot) {
    const state = get();
    const player = state.player;
    if (!player) return;
    const item = player.inventory.find(
      (i) => i.name.toLowerCase() === itemName.toLowerCase() && i.quantity > 0,
    );
    if (!item) {
      get().appendLog('arbiter', `The Arbiter glances at your pack. "I don't see a ${itemName} on you."`);
      return;
    }
    const valid = validSlotsForItem(item);
    if (!valid.includes(slot)) {
      get().appendLog(
        'arbiter',
        `The Arbiter shakes their head. "The ${item.name} doesn't go in the ${SLOT_LABEL[slot]} slot."`,
      );
      return;
    }
    // HANDOFF followup — style: 'two_handed' integration. Refuse to
    // equip into the off-hand when a two-handed weapon occupies the
    // main slot, and refuse to equip a two-handed weapon when the off
    // slot is already filled. Player has to unequip first.
    const incomingCat = findWeaponByName(item.name);
    const mainName = player.equipped?.main;
    const offName = player.equipped?.off;
    const mainCat = mainName ? findWeaponByName(mainName) : null;
    if (slot === 'off' && mainCat?.style === 'two_handed') {
      get().appendLog(
        'arbiter',
        `The Arbiter eyes your ${mainName}. "Two-handed grip. There's no room in the off hand until you set that down."`,
      );
      return;
    }
    if (slot === 'main' && incomingCat?.style === 'two_handed' && offName) {
      get().appendLog(
        'arbiter',
        `The Arbiter shakes their head. "The ${item.name} needs both hands. Drop the ${offName} from your off hand first."`,
      );
      return;
    }
    // Capture what was already in this slot so the swap is visible.
    // Playtest: player equipped a locket, then a compass to the same Amulet
    // slot and got two "You equip ..." lines with no signal that the locket
    // was actually displaced.
    const previousInSlot = player.equipped?.[slot];
    // Store both the catalog name (for display + catalog lookup) AND the
    // specific InventoryItem.id so durability wear, the InventoryScreen
    // "EQUIPPED" badge, and any other instance-sensitive code knows
    // EXACTLY which copy is in the slot.
    const slotIdKey = SLOT_ID_KEY[slot];
    set((s) =>
      s.player
        ? {
            player: {
              ...s.player,
              equipped: {
                ...(s.player.equipped ?? {}),
                [slot]: item.name,
                [slotIdKey]: item.id,
              },
            },
          }
        : s,
    );
    if (previousInSlot && previousInSlot !== item.name) {
      get().appendLog(
        'world',
        `You stow the ${previousInSlot} and equip ${item.name} (${SLOT_LABEL[slot]}).`,
      );
    } else {
      get().appendLog('world', `You equip ${item.name} (${SLOT_LABEL[slot]}).`);
    }
    void get().persist();
  },

  unequipSlot(slot) {
    set((s) =>
      s.player
        ? {
            player: {
              ...s.player,
              equipped: {
                ...(s.player.equipped ?? {}),
                [slot]: undefined,
                [SLOT_ID_KEY[slot]]: undefined,
              },
            },
          }
        : s,
    );
    get().appendLog('world', `You set aside what was in your ${SLOT_LABEL[slot]} slot.`);
    void get().persist();
  },

  dropInventoryItem(itemName) {
    // Route through the typed drop verb so equipped-item refusal,
    // room-state writes, and persistence all share one code path.
    get().submitPlayerAction(`drop ${itemName}`);
  },

  useInventoryItem(itemName) {
    const player = get().player;
    if (!player) return;
    const item = player.inventory.find(
      (i) => i.name.toLowerCase() === itemName.toLowerCase() && i.quantity > 0,
    );
    if (!item) {
      get().appendLog('arbiter', `The Arbiter glances at your pack. "I don't see a ${itemName} on you."`);
      return;
    }
    // Consumables → eat (HP recovery + time advance + quantity
    // decrement). Routed through submitPlayerAction so the existing
    // rest-with-resolvedItemId path handles all the state mutations.
    if (item.kind === 'consumable') {
      get().submitPlayerAction(`eat ${item.name}`);
      return;
    }
    // Anything else — torch / compass / locket / relic — gets
    // equipped to the off-hand per playtest spec ("to use it it
    // needs to replace the item in your offhand"). Refuse for
    // items the equipment rules don't let live in 'off'.
    const validSlots = validSlotsForItem(item);
    if (validSlots.includes('off')) {
      get().equipItem(item.name, 'off');
      return;
    }
    // Items that aren't off-hand-eligible — amulets, rings, armor —
    // route to their canonical slot instead so 'use' always does
    // something useful.
    if (validSlots.length > 0) {
      get().equipItem(item.name, validSlots[0]!);
      return;
    }
    get().appendLog('arbiter', `The Arbiter shrugs. "The ${item.name} doesn't have a single obvious 'use' — keep it, gift it, or scrap it."`);
  },

  scrapInventoryItem(itemName) {
    const player = get().player;
    if (!player) return;
    const item = player.inventory.find(
      (i) => i.name.toLowerCase() === itemName.toLowerCase() && i.quantity > 0,
    );
    if (!item) {
      get().appendLog('arbiter', `The Arbiter glances at your pack. "I don't see a ${itemName} on you."`);
      return;
    }
    if (!canScrap(item)) {
      get().appendLog('arbiter', `The Arbiter taps the ${item.name}. "Nothing here to break down — it already IS stock material."`);
      return;
    }
    // Refuse to scrap the item if it's currently equipped — would
    // leave a phantom slot referencing a deleted item.
    const eq = player.equipped ?? {};
    const equippedSlots = ['main', 'off', 'head', 'chest', 'legs', 'feet', 'amulet', 'ring'] as const;
    const isEquipped = equippedSlots.some((s) => eq[s] === item.name);
    if (isEquipped) {
      get().appendLog('arbiter', `The Arbiter taps your hand. "Unequip the ${item.name} first — can't scrap what you're wearing."`);
      return;
    }
    const output = scrapOutputFor(item);
    set((s) => {
      if (!s.player) return s;
      // Remove one unit of the source item.
      const newInventory = s.player.inventory
        .map((i) => (i.id === item.id ? { ...i, quantity: i.quantity - 1 } : i))
        .filter((i) => i.quantity > 0);
      // Add each granted scrap material, merging into existing
      // stacks where possible.
      for (const grant of output.grants) {
        const existing = newInventory.findIndex((i) => i.name === grant.name);
        if (existing >= 0) {
          newInventory[existing] = {
            ...newInventory[existing]!,
            quantity: newInventory[existing]!.quantity + grant.quantity,
          };
        } else {
          newInventory.push({
            id: `scrap_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            name: grant.name,
            kind: 'misc',
            rarity: 'Common',
            quantity: grant.quantity,
            tags: [],
          });
        }
      }
      return { player: { ...s.player, inventory: newInventory } };
    });
    get().appendLog('world', `You break the ${item.name} down. ✦ Recovered: ${output.summary}.`);
    void get().persist();
  },

  rest() {
    const player = get().player;
    if (!player) return;
    const hpRoom = player.hpMax - player.hp;
    const stamRoom = player.staminaMax - player.stamina;
    // Rest always advances time, even at full health/stamina — you sat
    // somewhere for a while. 4-7 hours per rest, rolled randomly.
    const hoursSlept = rollDie(4) + 3;
    const newHours = (player.hoursElapsed ?? 0) + hoursSlept;
    if (hpRoom <= 0 && stamRoom <= 0) {
      set((s) => (s.player ? { player: { ...s.player, hoursElapsed: newHours } } : s));
      get().appendLog(
        'world',
        `You sit for ${hoursSlept} hours. Whole already — the Aetherstone hums steady. (${describeTime(newHours)})`,
      );
      void get().persist();
      return;
    }
    const heal = Math.min(hpRoom, rollDie(6) + rollDie(6));
    const stamGain = Math.min(stamRoom, rollDie(6) + 2);
    set({
      player: {
        ...player,
        hp: player.hp + heal,
        stamina: player.stamina + stamGain,
        hoursElapsed: newHours,
      },
    });
    const parts: string[] = [];
    if (heal > 0) parts.push(`2d6 → ${heal} HP`);
    if (stamGain > 0) parts.push(`d6+2 → ${stamGain} stamina`);
    get().appendLog(
      'world',
      `You rest for ${hoursSlept} hours. ${parts.join(', ')} recovered. (${describeTime(newHours)})`,
    );
    void get().persist();
  },

  async saveAndExitToTitle() {
    await get().persist();
    // Keep the active slot pointer set so resume can pick it back up, but
    // refresh the slot index so the title list reflects the latest summary.
    const slots = await listSlots();
    set({ slots, currentScreen: 'title' });
  },

  async bootCognitive() {
    const current = get().cognitiveStatus;
    if (current !== 'idle' && current !== 'failed') return;
    set({ cognitiveStatus: 'downloading', cognitiveFraction: 0, cognitiveError: null });
    try {
      await cognitive.boot({
        onProgress: (stage, fraction) => {
          set({ cognitiveStatus: stage, cognitiveFraction: fraction });
        },
      });
      const info = await cognitive.getModelInfo();
      set({ cognitiveStatus: 'ready', cognitiveFraction: 1, cognitiveModelInfo: info });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      set({ cognitiveStatus: 'failed', cognitiveError: message });
    }
  },

  async shutdownCognitive() {
    try {
      await cognitive.shutdown();
    } catch {
      // ignore — best effort
    }
  },

  async resumeCognitive() {
    if (get().cognitiveStatus !== 'ready') return;
    try {
      await cognitive.resume();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      set({ cognitiveStatus: 'failed', cognitiveError: message });
    }
  },

  async bootQwen() {
    const current = get().qwenStatus;
    if (current !== 'idle' && current !== 'failed') return;
    set({ qwenStatus: 'downloading', qwenFraction: 0, qwenError: null });
    try {
      await qwen.initialize({
        onProgress: (status, fraction) => {
          set({ qwenStatus: status, qwenFraction: fraction });
        },
      });
      // qwen.initialize() swallows errors and sets its own internal status to
      // 'failed' rather than throwing — mirror that onto the store.
      if (qwen.isReady()) {
        set({
          qwenStatus: 'ready',
          qwenFraction: 1,
          qwenError: null,
          qwenModelId: qwen.getModelId(),
        });
      } else {
        set({
          qwenStatus: 'failed',
          qwenError: qwen.getLastError() ?? 'Qwen failed to initialize',
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      set({ qwenStatus: 'failed', qwenError: message });
    }
  },

  async shutdownQwen() {
    try {
      await qwen.dispose();
    } catch {
      // best effort
    }
    set({ qwenStatus: 'idle', qwenFraction: 0, partialArbiterText: null, isGenerating: false });
  },

  cancelGeneration() {
    // Drops the streaming buffer + flag. The in-flight inference call keeps
    // running on the background thread (we can't synchronously kill it
    // through transformers.js), but bumping the epoch makes its eventual
    // result discard cleanly — see narrateViaArbiter's epoch check.
    if (get().isGenerating || get().partialArbiterText !== null) {
      arbiterGenerationEpoch++;
      set({ isGenerating: false, partialArbiterText: null });
    }
  },

  async persist() {
    const { player, worldMemory, gameLog, currentScreen, currentScene, activeSlotId } = get();
    if (!activeSlotId) return; // No active slot — nothing to write to.
    // CRITICAL: refuse to overwrite a save with player=null. This guards
    // against transient states (mid-load, mid-death-cleanup, mid-OTA-
    // reload) where activeSlotId is still set but player has been
    // cleared. Writing player=null silently here was a major source of
    // "save file is missing the character record" errors across updates.
    if (!player) return;
    await saveSlot(activeSlotId, {
      version: 1,
      savedAt: Date.now(),
      player,
      worldMemory,
      gameLog: gameLog.slice(-MAX_LOG_IN_MEMORY),
      currentScreen,
      // Snapshot the live scene so resume picks up exactly where the player
      // left off — no fresh Arbiter narration, no re-rolled weather /
      // enemies / vendor. The player should be the next actor on resume,
      // not the AI. Skipped only when currentScene is null (player on the
      // title screen, mid-load, etc.).
      currentScene: currentScene ?? undefined,
    });
  },
}));

// Human-readable label for the combat range bands.
const RANGE_LABEL: Record<CombatRange, string> = {
  arm: "arm's reach",
  close: 'close',
  far: 'far',
};

// Apply a single HookEffect to player + world state. Returns true if the
// effect caused a fatal HP drop so the caller can stage the death handler.
// Apply a single hook effect. Mutates player / world state. Returns
//   inlineSummary: short string to be folded into the parent world log
//     entry (e.g. "Recovered Aether Crystal", "+30 TC"). Null for effects
//     that are silent (memo / time advance) or that emit their own
//     separate logs (damage / enemy spawn / rep change).
//   fatal: true when the effect dropped HP to 0.
function applyHookEffect(
  effect: HookEffect,
  get: () => GameStore,
  set: (fn: (s: GameStore) => Partial<GameStore>) => void,
): { inlineSummary: string | null; fatal: boolean } {
  switch (effect.type) {
    case 'grant_tc': {
      const amt = effect.amount;
      set((s) => (s.player ? { player: { ...s.player, tc: Math.max(0, s.player.tc + amt) } } : s));
      return { inlineSummary: amt >= 0 ? `+${amt} TC` : `${amt} TC`, fatal: false };
    }
    case 'grant_item': {
      const catEntry = lookupCraftedItem(effect.name);
      const item: InventoryItem = stampDurability({
        id: `hook_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        name: effect.name,
        kind: catEntry.kind === 'weapon' ? 'weapon' : catEntry.kind === 'armor' ? 'armor' : catEntry.kind,
        rarity: catEntry.rarity,
        quantity: 1,
        tags: catEntry.tags,
      });
      set((s) =>
        s.player
          ? { player: { ...s.player, inventory: mergeOrPushItem(s.player.inventory, item) } }
          : s,
      );
      return { inlineSummary: effect.name, fatal: false };
    }
    case 'heal': {
      const amt = effect.amount;
      set((s) =>
        s.player
          ? { player: { ...s.player, hp: Math.min(s.player.hpMax, s.player.hp + amt) } }
          : s,
      );
      return { inlineSummary: `+${amt} HP`, fatal: false };
    }
    case 'damage': {
      const amt = effect.amount;
      let killed = false;
      set((s) => {
        if (!s.player) return {};
        const newHp = Math.max(0, s.player.hp - amt);
        killed = newHp <= 0;
        return { player: { ...s.player, hp: newHp } };
      });
      get().appendLog('combat', `You take ${amt} damage from ${effect.cause}.`);
      return { inlineSummary: null, fatal: killed };
    }
    case 'advance_time': {
      set((s) => (s.player ? { player: advanceTime(s.player, effect.hours) } : s));
      return { inlineSummary: null, fatal: false };
    }
    case 'rep_change': {
      const player = get().player;
      if (!player) return { inlineSummary: null, fatal: false };
      const result = applyRepChange(player.factionStanding, effect.factionId, effect.amount);
      set((s) => (s.player ? { player: { ...s.player, factionStanding: result.standing } } : s));
      logRepChanges(get, result.changed);
      return { inlineSummary: null, fatal: false };
    }
    case 'spawn_enemy_tag': {
      const tag = effect.tag;
      const candidates = (enemiesData as Enemy[]).filter((e) => e.type === tag);
      const spawn = candidates.length > 0
        ? candidates[Math.floor(Math.random() * candidates.length)]!
        : pickEnemyForLocation(get().currentScene?.location ?? getLocationById('tartarian_outskirts'));
      if (!spawn) return { inlineSummary: null, fatal: false };
      set((s) =>
        s.currentScene
          ? { currentScene: { ...s.currentScene, enemies: [spawn], enemyHps: [spawn.hp], activeEnemyIdx: 0, range: 'close' } }
          : s,
      );
      get().appendLog('combat', `${spawn.name} emerges from the hook. Combat begins at close range.`);
      return { inlineSummary: null, fatal: false };
    }
    case 'unlock_location': {
      set((s) => ({
        worldMemory: {
          ...s.worldMemory,
          discoveredLocationIds: Array.from(new Set([...(s.worldMemory.discoveredLocationIds ?? []), effect.locationId])),
        },
      }));
      return { inlineSummary: 'New location uncovered', fatal: false };
    }
    case 'memo': {
      set((s) => ({
        worldMemory: {
          ...s.worldMemory,
          chainMemos: [...(s.worldMemory.chainMemos ?? []), { text: effect.text, ts: Date.now() }].slice(-12),
        },
      }));
      return { inlineSummary: null, fatal: false };
    }
  }
}

// Resolve a hook one stage forward. Plays the line, applies effects, marks
// resolved if done, queues any next-chain plant in worldMemory.
function resolveHookOneStep(
  hook: Hook,
  get: () => GameStore,
  set: (fn: (s: GameStore) => Partial<GameStore>) => void,
): void {
  const outcome = getHookOutcome(hook.kind, hook.stage);
  if (!outcome) return;
  // Apply every effect first so we can fold the inline rewards INTO the
  // narration line. Damage / enemy spawn / rep changes still log
  // separately (they have their own combat / reward tone).
  let fatal = false;
  const inlineSummaries: string[] = [];
  for (const eff of outcome.effects) {
    const r = applyHookEffect(eff, get, set);
    if (r.fatal) fatal = true;
    if (r.inlineSummary) inlineSummaries.push(r.inlineSummary);
  }
  // HANDOFF #5 — the previous handoff inlined the ✦ reward summary into
  // the world line as a tail. That kept the line count down but lost
  // the green REWARD channel color cue, so payoff lines read as flat.
  // Split them again: world line for narration (no tail), reward line
  // for the ✦ callout. The 500ms debounce will keep them visually tight
  // but the two channels paint distinct colors.
  get().appendLog('world', outcome.line);
  if (inlineSummaries.length > 0) {
    get().appendLog('reward', `✦ ${inlineSummaries.join(', ')}.`);
  }
  if (outcome.arbiterLine) get().appendLog('arbiter', outcome.arbiterLine);
  // Advance hook stage / mark resolved. Fold any newly-revealed nouns
  // (figure, camp, firepit, reclaimer...) into the hook's noun list so
  // later player input like "talk to the figure" or "approach the
  // reclaimer" routes back into this chain instead of falling through to
  // the empty-scene diplomacy refusal.
  set((s) => {
    if (!s.currentScene) return {};
    const nextHooks = (s.currentScene.hooks ?? []).map((h) => {
      if (h.id !== hook.id) return h;
      const merged = new Set([...h.nouns, ...(outcome.addNouns ?? [])]);
      return {
        ...h,
        stage: h.stage + 1,
        resolved: outcome.done,
        nouns: Array.from(merged),
      };
    });
    return { currentScene: { ...s.currentScene, hooks: nextHooks } };
  });
  // Queue any next-chain hook to plant on the next scene.
  if (outcome.nextChain) {
    const plantedAtHour = get().player?.hoursElapsed ?? 0;
    set((s) => ({
      worldMemory: {
        ...s.worldMemory,
        pendingChains: [
          ...(s.worldMemory.pendingChains ?? []),
          { kind: outcome.nextChain!.kind, chainId: outcome.nextChain!.chainId, plantedAtHour },
        ],
      },
    }));
  }
  if (fatal) {
    void Promise.resolve().then(() => handlePlayerDeath(get, set));
  }
}

// Step the combat range one band toward the enemy (advance) or away
// (retreat). Extracted so non-combat verbs can route here — e.g. a player
// typing "go to him" or "approach the reclaimer" mid-combat should close
// distance the same way "advance" does, instead of falling through to
// narrateWanderingJourney.
function runMoveCombatRange(
  get: () => GameStore,
  set: (partial: Partial<GameStore> | ((s: GameStore) => Partial<GameStore>)) => void,
  player: PlayerCharacter,
  scene: CurrentScene,
  direction: 'advance' | 'retreat',
): void {
  const cost = weatherRepositionCost(scene.weather);
  get().appendLog(
    'debug',
    `move: ${direction} from range=${scene.range ?? '-'} enemies=${scene.enemies.length} weather=${scene.weather?.name ?? '-'} cost=${cost} partial=${scene.repositionPartial ?? 0}`,
  );
  const moveEnemy = activeEnemy(scene);
  if (!moveEnemy) {
    get().appendLog('debug', 'move: bail — no active enemy');
    get().appendLog('arbiter', `The Arbiter shrugs. "Nothing to ${direction === 'advance' ? 'advance on' : 'pull back from'}. The ground here is quiet."`);
    return;
  }
  const order: CombatRange[] = ['arm', 'close', 'far'];
  const cur = scene.range ?? 'close';
  const curIdx = order.indexOf(cur);
  const nextIdx = direction === 'advance' ? Math.max(0, curIdx - 1) : Math.min(order.length - 1, curIdx + 1);
  const next = order[nextIdx]!;
  const groupLabel = scene.enemies.length > 1
    ? `the ${scene.enemies.length} ${moveEnemy.name}s`
    : moveEnemy.name;
  if (next === cur) {
    get().appendLog(
      'world',
      direction === 'advance'
        ? `You are already at arm's reach with ${groupLabel}.`
        : `You cannot put more ground between you and ${groupLabel}.`,
    );
    return;
  }

  // Slow-weather progression. Each advance/retreat under Iron Fog or
  // Silent Blizzard counts as one tick toward `cost`. Once accumulated
  // ticks reach cost, range actually changes and progress resets.
  // Direction change resets progress so you don't carry "advance" credit
  // into a later "retreat".
  const lastDir = scene.repositionDir;
  const carriedPartial = lastDir === direction ? (scene.repositionPartial ?? 0) : 0;
  const partial = carriedPartial + 1;

  if (cost > 1 && partial < cost) {
    set((s) => (s.currentScene
      ? { currentScene: { ...s.currentScene, repositionPartial: partial, repositionDir: direction } }
      : s));
    const weatherName = scene.weather?.name ?? 'the haze';
    get().appendLog(
      'world',
      direction === 'advance'
        ? `${weatherName} slows you down. You push toward ${groupLabel} but the compass spins and your footing drags. (${partial}/${cost} — type 'advance' again to close)`
        : `${weatherName} slows you down. You strain to pull back from ${groupLabel}, but every step costs double. (${partial}/${cost} — type 'step back' again to break contact)`,
    );
    get().appendLog('debug', `move: slow weather progress ${partial}/${cost}`);
    // Partial moves under bad weather used to grant a FULL enemy counter
    // round per tick — which compounded with the auto-close-to-attack
    // enemy round to turn weather penalties into death spirals (playtest
    // log Observer @ Zharak's Teeth: 4 Gutter Rats took 31 HP off a fresh
    // L1 character in three rounds, two of which were partial movement
    // ticks where the player couldn't act). Now: only the FULL move
    // (range actually changes) provokes the counter round. Partial moves
    // still cost a beat of in-fiction time, but enemies hold their swing
    // until the player commits — same way real combat in tabletop RPGs
    // grants reactions on movement INTO threatened squares, not on
    // half-steps that fail to close.
    return;
  }

  // Full move — range actually changes. Reset progress.
  set((s) => (s.currentScene
    ? { currentScene: { ...s.currentScene, range: next, repositionPartial: 0, repositionDir: undefined } }
    : s));
  get().appendLog('debug', `move: range ${cur} -> ${next}`);
  get().appendLog(
    'world',
    direction === 'advance'
      ? `You close the gap with ${groupLabel}. (range: ${RANGE_LABEL[next]})`
      : `You pull back from ${groupLabel}. (range: ${RANGE_LABEL[next]})`,
  );
  // Movement takes a beat — let any enemy still in their effective
  // range counter-attack. Group: every reaching enemy fires.
  const reachers = scene.enemies.filter((e, i) =>
    enemyCanReach(e, next) && (scene.enemyHps[i] ?? 0) > 0,
  );
  if (reachers.length > 0) {
    runEnemyGroupCounters(get, set, get().player ?? player);
  }
}

// Whether an enemy can still strike the player at the given range.
// Lore: melee = arm's reach, ranged = close + far, runecasters mostly close
// + arm. We use a conservative default — most generic enemies threaten arm
// and close, plus anything carrying a ranged hint reaches at far.
function enemyCanReach(enemy: Enemy, range: CombatRange): boolean {
  if (range === 'arm' || range === 'close') return true;
  // 'far' — only ranged enemies (loose hint via attack/damage string).
  const sig = `${enemy.attack ?? ''} ${enemy.damage ?? ''} ${enemy.abilityPoint ?? ''}`.toLowerCase();
  return /(bow|arrow|crossbow|ranged|projectile|firearm|sling|dart)/.test(sig);
}

// Which range bands the player's current weapon can reach. Bare hands and
// melee weapons = arm only. Ranged = close + far (the lore allows ranged
// at arm but with poor effect; we still permit it). Runecasters by tier:
// common/uncommon = arm+close, rare/legendary = all bands.
/** Build score per the action-card maneuver math. Higher is bigger /
 *  heavier. Player: derived from STR (mass + leverage) with a small
 *  race bonus for Tartarian Giants. Range roughly 1..10. */
/** HANDOFF #15 — deterministic room key for MapGraph lookups. Two
 *  visits to the same room (same macro location + same micro-micro id
 *  + same X/Y on the procedural map) collapse to the same key. */

// Bump milestones.questsAccepted by one and surface a one-time Arbiter
// callback when the player accepts their first contract of any kind
// (faction quest / hunt / mystery / storyline). Audit fix #17.
// Advance every staged active faction quest by one beat and surface
// its narration. Called from progress events (kill / skill check
// success / travel completion). Quests with no `stages` array stay
// at stage 0 forever — they're single-objective and turn-in-able
// immediately, matching pre-refactor behavior.
// Force-add a hunt or mystery to the player's active board without
// the usual vendor-faction handoff. Mini-dungeon quest hooks use
// this: finding a buried wagon train with a "the Dragon is real"
// note auto-starts the Bog Dragon hunt, no vendor required. The
// user's explicit ask: a way to start quests that isn't a vendor.
// Silent no-op if the player already has the quest active / done
// or if the id doesn't resolve (data drift).
function grantQuestHook(
  get: () => GameStore,
  set: (fn: (s: GameStore) => Partial<GameStore>) => void,
  hook: { kind: 'hunt' | 'mystery'; id: string },
): void {
  const player = get().player;
  if (!player) return;
  if (hook.kind === 'hunt') {
    const def = findHuntById(hook.id);
    if (!def) return;
    const active = (player.activeHunts ?? []).some((h) => h.id === def.id);
    const done = (player.completedHuntIds ?? []).includes(def.id);
    if (active || done) return;
    set((s) =>
      s.player
        ? {
            player: {
              ...s.player,
              activeHunts: [
                ...(s.player.activeHunts ?? []),
                { id: def.id, stage: 0, postedByFaction: def.factionId, acceptedAt: Date.now() },
              ],
            },
          }
        : s,
    );
    bumpQuestsAccepted(get, set);
    get().appendLog(
      'reward',
      `✦ Hunt found in the field — ${def.title}. ${def.posterText}`,
    );
    return;
  }
  // Mystery branch.
  const def = findMysteryById(hook.id);
  if (!def) return;
  const active = (player.activeMysteries ?? []).some((m) => m.id === def.id);
  const done = (player.completedMysteryIds ?? []).includes(def.id);
  if (active || done) return;
  set((s) =>
    s.player
      ? {
          player: {
            ...s.player,
            activeMysteries: [
              ...(s.player.activeMysteries ?? []),
              { id: def.id, stage: 0, postedByFaction: def.factionId, acceptedAt: Date.now() },
            ],
          },
        }
      : s,
  );
  bumpQuestsAccepted(get, set);
  get().appendLog(
    'reward',
    `✦ Mystery found in the field — ${def.title}. ${def.posterText}`,
  );
}

function advanceActiveFactionQuests(
  get: () => GameStore,
  set: (fn: (s: GameStore) => Partial<GameStore>) => void,
  trigger: 'kill' | 'travel' = 'kill',
): void {
  const player = get().player;
  if (!player) return;
  const active = player.activeFactionQuests ?? [];
  if (active.length === 0) return;
  let mutated = false;
  const next = active.map((rec) => {
    const def = findFactionQuestById(rec.id);
    if (!def?.stages || def.stages.length === 0) return rec;
    if (rec.stage >= def.stages.length) return rec; // already done
    // Gate stage progression by trigger kind. The stage we just
    // completed (index = current rec.stage) carries its advanceOn
    // hint; if it doesn't match the player's action, skip. Legacy
    // stages without the field stay 'any' so existing JSON keeps
    // working — but the shipped quests now set it explicitly to
    // stop kills from auto-completing travel pilgrimages and
    // vice versa.
    const currentStage = def.stages[rec.stage];
    const gate = currentStage?.advanceOn ?? 'any';
    if (gate !== 'any' && gate !== trigger) return rec;
    const nextStage = rec.stage + 1;
    mutated = true;
    // We just BUMPED to stage `nextStage`. If a stage exists at the new
    // index (nextStage), narrate it. Otherwise the quest is now ready
    // for turn-in (no more stages to play).
    const justPlayed = def.stages[nextStage];
    if (justPlayed) {
      get().appendLog('world', justPlayed.narration);
      if (justPlayed.arbiter) get().appendLog('arbiter', justPlayed.arbiter);
    } else {
      // Crossed past the last stage — quest is turn-in-ready. Surface
      // a one-line nudge so the player knows where to take it.
      const fname = def.factionId.replace(/_/g, ' ');
      get().appendLog(
        'arbiter',
        `The Arbiter glances at you. "${def.title} is done. Bring word to any ${fname} agent."`,
      );
    }
    return { ...rec, stage: nextStage };
  });
  if (!mutated) return;
  set((s) =>
    s.player ? { player: { ...s.player, activeFactionQuests: next } } : s,
  );
}

// Burst tracker — transient (not persisted). When the player chip-taps
// through 6 contracts in 4 seconds at the same vendor we don't want 6
// Arbiter lines reacting to each individual quest description; the
// player has already moved on by the time he finishes the first
// sentence. Instead we fire ONE meta-aware line per tier transition:
// burst-start, "stacking" at 3, "slow down" at 5. Resets after 5s of
// silence so the next bursty session opens cleanly.
let _burstLastAt = 0;
let _burstCount = 0;
const BURST_WINDOW_MS = 5000;

const BURST_START_LINES = [
  `The Arbiter watches you sign. "Another for the slate."`,
  `The Arbiter nods. "On the board it goes."`,
  `"Adding another," the Arbiter says, dry. "Make good on it."`,
  `The Arbiter glances at the page. "Promise made. Hold yourself to it."`,
  `"Another contract," the Arbiter says. "Tartaria notes."`,
];
const BURST_STACKING_LINES = [
  `The Arbiter raises an eyebrow. "You're stacking promises. They don't pay until the work does."`,
  `"That's three now," the Arbiter says. "Make sure you remember what you owe whom."`,
  `The Arbiter's mouth twitches. "Collecting contracts is the easy part. Try finishing one."`,
  `"You like having debts to the factions, do you?" the Arbiter says.`,
];
const BURST_SLOW_DOWN_LINES = [
  `The Arbiter's voice cools. "Slow down. The work is real. You can only walk one road at a time."`,
  `"Five on the slate," the Arbiter says. "Tartaria does not negotiate down a list you over-bought."`,
  `The Arbiter sighs. "Every contract is a debt. You're stacking debts faster than legs to walk them."`,
  `"That's a lot of promises," the Arbiter says quietly. "Plan your route, or you'll forget half."`,
];

function bumpQuestsAccepted(
  get: () => GameStore,
  set: (fn: (s: GameStore) => Partial<GameStore>) => void,
): void {
  const player = get().player;
  if (!player) return;
  const prev = player.milestones?.questsAccepted ?? 0;
  set((s) =>
    s.player
      ? {
          player: {
            ...s.player,
            milestones: {
              ...(s.player.milestones ?? { enemiesDefeated: 0, travelsCompleted: 0, checksSucceeded: 0 }),
              questsAccepted: prev + 1,
            },
          },
        }
      : s,
  );

  // First-ever contract — life-of-character one-shot. Takes priority
  // over any burst chatter; the burst counter still gets initialised
  // below so the NEXT accept lands on the burst-start line cleanly.
  if (prev === 0) {
    get().appendLog(
      'arbiter',
      `The Arbiter watches you take the contract. "First one. The work begins now — not when you finish it, not when you cash it in. Now."`,
    );
    _burstLastAt = Date.now();
    _burstCount = 1;
    return;
  }

  const now = Date.now();
  if (now - _burstLastAt > BURST_WINDOW_MS) {
    // Fresh burst — say one ambient line and start counting.
    _burstCount = 1;
    _burstLastAt = now;
    get().appendLog('arbiter', rotatingPick(BURST_START_LINES, 'arbiter.contract.burst-start'));
    return;
  }
  // Continuing burst — silent except at tier transitions.
  _burstCount += 1;
  _burstLastAt = now;
  if (_burstCount === 3) {
    get().appendLog('arbiter', rotatingPick(BURST_STACKING_LINES, 'arbiter.contract.burst-stacking'));
  } else if (_burstCount === 5) {
    get().appendLog('arbiter', rotatingPick(BURST_SLOW_DOWN_LINES, 'arbiter.contract.burst-slow'));
  }
  // 2, 4, 6+: silent. Player is chip-tapping — let them.
}

function makeRoomKey(
  locationId: string,
  microMicroId: string | null | undefined,
  mapX: number | null | undefined,
  mapY: number | null | undefined,
): string {
  const mm = microMicroId ?? '_';
  const x = typeof mapX === 'number' ? mapX : '_';
  const y = typeof mapY === 'number' ? mapY : '_';
  return `${locationId}@${mm}@${x},${y}`;
}

// HANDOFF #15c — has the player already grabbed this loot in this room?
// Used by dig and area-search to avoid handing out the same scarce drop
// on re-entry. Item names are compared lowercased; consumables and
// commodities are intentionally permitted to re-roll (handled by the
// caller via a "stackable" flag).
function roomLootAlreadyGrabbed(
  worldMemory: { visitedRooms?: Record<string, VisitedRoom> },
  roomKey: string,
  itemName: string,
): boolean {
  const room = worldMemory.visitedRooms?.[roomKey];
  if (!room?.lootGrabbed) return false;
  return room.lootGrabbed.includes(itemName.toLowerCase());
}

// Record an item the player just picked up from this room. Caller is
// responsible for first writing the loot to the player's inventory;
// this just notes the room's memory so a return visit can suppress
// re-issuing the same drop.
function recordRoomLootGrabbed(
  state: { worldMemory: WorldMemory },
  roomKey: string,
  itemName: string,
): { worldMemory: WorldMemory } {
  const prevRooms = state.worldMemory.visitedRooms ?? {};
  const prev = prevRooms[roomKey];
  // If the room hasn't been visited yet (shouldn't happen — both call
  // sites come from inside an active scene that already wrote a visit
  // record), seed minimal metadata so the loot list still persists.
  const base: VisitedRoom = prev ?? {
    firstVisitAt: Date.now(),
    lastVisitAt: Date.now(),
    visitCount: 1,
    enemiesCleared: [],
  };
  const grabbed = new Set((base.lootGrabbed ?? []).map((n) => n.toLowerCase()));
  grabbed.add(itemName.toLowerCase());
  return {
    worldMemory: {
      ...state.worldMemory,
      visitedRooms: {
        ...prevRooms,
        [roomKey]: { ...base, lootGrabbed: Array.from(grabbed) },
      },
    },
  };
}

function playerBuildScore(player: PlayerCharacter): number {
  const stats = effectiveStats(player);
  let build = Math.max(1, Math.round(stats.strength * 0.7));
  if (player.raceId === 'tartarian_giants') build += 2;
  if (player.raceId === 'mud_dweller') build -= 1;
  return Math.max(1, Math.min(10, build));
}

/** Enemy build derived from their abilityPoint string and HP cap. The
 *  data file format is "Strength 4" / "Dexterity 6"; we read the
 *  number plus a small HP-tier bonus. Large legendaries like Mud Titan
 *  end up at 9-10; rats and wasps at 2-3. */
function enemyBuildScore(enemy: Enemy): number {
  const ap = parseInt(String(enemy.abilityPoint), 10) || 3;
  const hpTier = enemy.hp >= 200 ? 3 : enemy.hp >= 100 ? 2 : enemy.hp >= 40 ? 1 : 0;
  return Math.max(1, Math.min(10, ap + hpTier));
}

function playerWeaponReach(player: PlayerCharacter): { bands: CombatRange[]; label: string } {
  const eq = player.equipped ?? {};
  const main = eq.main ?? eq.weaponName;
  if (!main) return { bands: ['arm'], label: 'Bare hands' };
  const w = findWeaponByName(main);
  if (!w) return { bands: ['arm'], label: main };
  switch (w.weaponKind) {
    case 'melee':
      return { bands: ['arm'], label: w.name };
    case 'ranged':
      return { bands: ['arm', 'close', 'far'], label: w.name };
    case 'runecaster': {
      const intel = player.stats.intelligence ?? 0;
      const farReach = intel >= 9; // Rare/Legendary access
      return { bands: farReach ? ['arm', 'close', 'far'] : ['arm', 'close'], label: w.name };
    }
    default:
      return { bands: ['arm'], label: w.name };
  }
}

// Wear the named equipped item by one point. If it breaks, remove it from
// inventory AND clear it from every slot that referenced it. Returns a new
// PlayerCharacter; the caller persists.
function wearEquippedItem(
  player: PlayerCharacter,
  itemName: string,
  get: () => GameStore,
): PlayerCharacter {
  // Prefer wearing the specific instance bound to a slot — when the
  // player holds two Aetheric Lockets the equipped one (whose id was
  // captured by equipItem) should take damage, not the duplicate
  // sitting in the pack. Fall back to wear-by-name for legacy saves
  // where no id was stored, or items wearing outside any slot (e.g.
  // tools used for digging — those just match by name).
  const eq = player.equipped ?? {};
  const target = itemName.toLowerCase();
  let boundId: string | undefined;
  for (const slot of Object.keys(SLOT_ID_KEY) as EquipSlot[]) {
    if ((eq[slot] ?? '').toLowerCase() !== target) continue;
    const idKey = SLOT_ID_KEY[slot];
    if (eq[idKey]) {
      boundId = eq[idKey];
      break;
    }
  }
  const result = boundId
    ? wearItemById(player.inventory, boundId)
    : wearItemByName(player.inventory, itemName);
  let equipped = player.equipped ?? {};
  if (result.broken && result.brokenName) {
    const next: PlayerCharacter['equipped'] = { ...equipped };
    // Clear both the name AND the bound id for any slot referencing
    // the broken item. Without id-clearance, a new pickup with the
    // same name could resurrect the empty slot via stale mapping.
    for (const slot of Object.keys(SLOT_ID_KEY) as EquipSlot[]) {
      const idKey = SLOT_ID_KEY[slot];
      if (boundId && next[idKey] === boundId) {
        next[slot] = undefined;
        next[idKey] = undefined;
      } else if (!boundId && next[slot] === result.brokenName) {
        next[slot] = undefined;
        next[idKey] = undefined;
      }
    }
    // Also clear the legacy single-slot fields if they referenced this.
    if (next.weaponName === result.brokenName) next.weaponName = undefined;
    if (next.armor === result.brokenName) next.armor = undefined;
    if (next.armorName === result.brokenName) next.armorName = undefined;
    equipped = next;
    // Defer the log so the caller's main set() lands first.
    void Promise.resolve().then(() =>
      get().appendLog('combat', `Your ${result.brokenName} shatters from wear. It is gone.`),
    );
  }
  return { ...player, inventory: result.inventory, equipped };
}

// Sum AC bonus and gather resistances from every equipped armor piece
// (head/chest/legs/feet). Used by combat to compute effective AC and to
// halve damage of types the armor resists.
function aggregateArmor(player: PlayerCharacter): { acBonus: number; resistances: string[] } {
  let acBonus = 0;
  const resistances: string[] = [];
  const eq = player.equipped ?? {};
  for (const slot of ARMOR_SLOTS) {
    const name = eq[slot];
    if (!name) continue;
    const piece = findArmorByName(name);
    if (!piece) continue;
    acBonus += piece.acBonus;
    for (const r of piece.resistances) resistances.push(r);
  }
  return { acBonus, resistances };
}

// Arbiter rolls enemy counter-attack — transparent to player per rulebook
// Run a counter-attack from every living enemy in the current scene. The
// player's single action provoked the whole group. Bail early if the
// player dies mid-volley so the rest of the group don't pile damage on a
// corpse.
function runEnemyGroupCounters(
  get: () => GameStore,
  set: (fn: (s: GameStore) => Partial<GameStore>) => void,
  fallbackPlayer: PlayerCharacter,
): void {
  const scene = get().currentScene;
  if (!scene || scene.enemies.length === 0) return;
  // Snapshot the enemies up-front so a death mid-volley (player killing
  // one by reaction, etc) doesn't reshape the iteration.
  const attackers = [...scene.enemies];
  for (let i = 0; i < attackers.length; i++) {
    const enemy = attackers[i]!;
    // Skip enemies that died earlier this round (HP <= 0 in the live
    // scene array).
    const liveScene = get().currentScene;
    if (!liveScene) return;
    const liveIdx = liveScene.enemies.findIndex((e) => e === enemy);
    if (liveIdx < 0) continue;
    const hpAtCounter = liveScene.enemyHps[liveIdx];
    if (hpAtCounter === undefined || hpAtCounter <= 0) continue;
    // Range gate — melee enemies can't counter when the player is at
    // 'far'. Ranged enemies (matched on attack/damage flavor) reach
    // all bands. Mirrors enemyCanReach used by movement intents.
    const liveRange = liveScene.range ?? 'close';
    if (!enemyCanReach(enemy, liveRange)) continue;
    // Bail if the player is dead.
    const livePlayer = get().player;
    if (!livePlayer || livePlayer.hp <= 0 || livePlayer.dead) return;
    // Pass live index so applyEnemyCounter can resolve ambush_strike
    // (one-shot +2 to the first counter for enemies with the trait).
    applyEnemyCounter(enemy, livePlayer ?? fallbackPlayer, get, set, liveIdx);
  }
}

function applyEnemyCounter(
  enemy: Enemy,
  player: PlayerCharacter,
  get: () => GameStore,
  set: (fn: (s: GameStore) => Partial<GameStore>) => void,
  enemyIdx?: number,
) {
  // Full cover vs ranged enemies auto-misses. Detect ranged from the
  // enemy's damage notation (Aetheric / ranged tag in the name).
  const enemyIsRanged = /aetheric|burst|laser|breath|venom|crossbow|bolt/i.test(enemy.attack + ' ' + enemy.damage);
  if (hasFullCover(player.statusEffects) && enemyIsRanged) {
    get().appendLog(
      'combat',
      `${enemy.name} fires, but full cover blocks the line — ✗ AUTO-MISS.`,
    );
    return;
  }

  // Fight Back — if the player declared fight_back this round, the
  // enemy attack resolves as an opposed Fighting roll instead of a
  // flat AC check. Both roll d20 + their fighting stat; higher wins.
  // Critical strikes / impaling do NOT apply on fight-back per the
  // action card.
  const fb = (player.statusEffects ?? []).find((e) => e.kind === 'fighting_back');
  if (fb) {
    const stats = effectiveStats(player);
    const playerRoll = rollDie(20);
    const playerTotal = playerRoll + stats.strength;
    const enemyRoll = rollDie(20);
    const enemyTotal = enemyRoll + (parseInt(String(enemy.attack), 10) || 3) + traitAttackBonus(enemy.traits);
    const playerWins = playerTotal > enemyTotal;
    const tie = playerTotal === enemyTotal;
    get().appendLog(
      'combat',
      `Fight Back — You d20 ${playerRoll} + STR ${stats.strength} = ${playerTotal} vs ${enemy.name} d20 ${enemyRoll} + ATK ${enemy.attack} = ${enemyTotal} — ${playerWins ? '✓ YOU LAND' : tie ? '⟂ TIE (attacker wins)' : '✗ THEY LAND'}`,
    );
    // Consume the fighting_back status either way.
    set((s) =>
      s.player
        ? { player: { ...s.player, statusEffects: (s.player.statusEffects ?? []).filter((e) => e.kind !== 'fighting_back') } }
        : s,
    );
    if (playerWins) {
      // Player lands a hit on enemy as part of trading.
      const equipped = player.equipped?.main ? findWeaponByName(player.equipped.main) : null;
      const dmg = equipped ? rollDie(6) + 1 : rollDie(4);
      const live = get().currentScene;
      if (live) {
        const idx = live.enemies.findIndex((e) => e === enemy);
        if (idx >= 0) {
          const hp = Math.max(0, (live.enemyHps[idx] ?? enemy.hp) - dmg);
          set((s) => {
            if (!s.currentScene) return {};
            const hps = [...s.currentScene.enemyHps];
            hps[idx] = hp;
            return { currentScene: { ...s.currentScene, enemyHps: hps } };
          });
          get().appendLog('combat', `Your fight-back strike for ${dmg} damage. ${enemy.name} HP ${hp}/${enemy.hp}.`);
          if (hp <= 0) {
            set((s) => (s.currentScene ? { currentScene: { ...s.currentScene, activeEnemyIdx: idx } } : s));
            void Promise.resolve().then(() => get().resolveEnemyDefeat());
          }
        }
      }
      return; // tie/player-win: enemy's strike doesn't land.
    }
    // Tie or enemy-win: fall through and apply enemy damage as normal.
  }

  const baseAtk = parseInt(String(enemy.attack), 10) || 3;
  const traitAtk = traitAttackBonus(enemy.traits);
  // Ambush bonus — one-shot +2 on the FIRST counter this enemy makes
  // in the scene (~16 enemies in data/enemies/enemies.json declare
  // 'ambush_strike'; previously the trait was exported but never
  // referenced, so it did nothing). enemyIdx is set by the caller;
  // when present and the slot's flag is false, apply the bonus and
  // mark the slot true so subsequent counters get the base value.
  const liveScene = get().currentScene;
  const ambushBonus = (() => {
    if (enemyIdx == null || !liveScene) return 0;
    const used = liveScene.enemyAmbushUsed?.[enemyIdx] ?? true;
    if (used) return 0;
    const bonus = traitAmbushBonus(enemy.traits);
    if (bonus > 0) {
      set((s) => {
        if (!s.currentScene) return s;
        const used = [...(s.currentScene.enemyAmbushUsed ?? s.currentScene.enemies.map(() => false))];
        used[enemyIdx] = true;
        return { currentScene: { ...s.currentScene, enemyAmbushUsed: used } };
      });
    }
    return bonus;
  })();
  const atkBonus = baseAtk + traitAtk + ambushBonus;
  // HANDOFF #14 — true advantage/disadvantage for defensive status
  // effects. When the player has cover/dodge/block active, the enemy's
  // attack rolls 2d20 and takes the LOWER (disadvantage on attacker).
  // When the player has 'surprised' active, the enemy rolls 2d20 and
  // takes the HIGHER (advantage on attacker). One-die path stays for
  // the neutral case so the log reads cleanly.
  const fx = player.statusEffects ?? [];
  const defenderAdvantage = fx.some((e) => ['in_cover', 'in_cover_full', 'dodging', 'blocking'].includes(e.kind) && e.remainingRounds > 0);
  const attackerAdvantage = fx.some((e) => e.kind === 'surprised' && e.remainingRounds > 0);
  let atkRoll = rollDie(20);
  let shadowRoll: number | null = null;
  let advLabel = '';
  if (defenderAdvantage && !attackerAdvantage) {
    shadowRoll = rollDie(20);
    const used = Math.min(atkRoll, shadowRoll);
    advLabel = ` [adv defense: ${atkRoll}/${shadowRoll} → ${used}]`;
    atkRoll = used;
  } else if (attackerAdvantage && !defenderAdvantage) {
    shadowRoll = rollDie(20);
    const used = Math.max(atkRoll, shadowRoll);
    advLabel = ` [surprise: ${atkRoll}/${shadowRoll} → ${used}]`;
    atkRoll = used;
  }
  const atkTotal = atkRoll + atkBonus;
  // Effective AC = race base + summed armor bonus from head/chest/legs/feet
  // + status modifier (e.g. -2 from armor_severed, +4 partial cover,
  // +8 full cover, +4 dodging/blocking). Status floor at 1 so a player
  // isn't completely impossible to defend.
  const armorPieces = aggregateArmor(player);
  const acFromGear = player.ac + armorPieces.acBonus;
  const effectiveAc = Math.max(1, acFromGear + statusAcAdjustment(player.statusEffects));
  const hit = atkTotal >= effectiveAc;

  get().appendLog(
    'combat',
    `${enemy.name} — d20 → ${atkRoll}${advLabel} + ATK ${atkBonus} = ${atkTotal} vs your AC ${effectiveAc} — ${hit ? '✓ HIT' : '✗ MISS'}`,
  );

  if (hit) {
    let rawDmg = rollFromNotation(String(enemy.damage)) || rollDie(6);
    const enemyDamageType = parseIncomingDamageType(String(enemy.damage));

    // Burn scars (aetheric vulnerability) amplify incoming aetheric damage.
    if (enemyDamageType === 'aetheric') {
      const mul = aethericVulnerabilityMultiplier(player.statusEffects);
      if (mul > 1) rawDmg = Math.ceil(rawDmg * mul);
    }

    const resisted = applyArmorResistance(rawDmg, enemyDamageType, armorPieces.resistances);
    let dmg = resisted.damage;

    // BLOCK — the player committed a defensive stance with their weapon.
    // d20 + weapon.defense vs the enemy's attack total. Success halves
    // damage and rolls for a riposte (25% chance for 1d4 to the enemy).
    // Weapon takes 2 durability either way — the cost of attempting.
    const blockingActive = (player.statusEffects ?? []).some((e) => e.kind === 'blocking');
    let blockNarration: string | null = null;
    let riposteDamage = 0;
    if (blockingActive) {
      const mainName = player.equipped?.main ?? player.equipped?.weaponName ?? null;
      const blockWeapon = mainName ? findWeaponByName(mainName) : null;
      const def = blockWeapon?.defense ?? 0;
      const blockRoll = rollDie(20);
      const blockTotal = blockRoll + def;
      const success = blockTotal >= atkTotal;
      if (success) {
        const before = dmg;
        dmg = Math.max(0, Math.floor(dmg / 2));
        blockNarration = `Block — d20 → ${blockRoll} + DEF ${def} = ${blockTotal} vs ATK ${atkTotal}. ✓ Damage halved (${before} → ${dmg}).`;
        if (Math.random() < 0.25) {
          riposteDamage = rollDie(4);
        }
      } else {
        blockNarration = `Block — d20 → ${blockRoll} + DEF ${def} = ${blockTotal} vs ATK ${atkTotal}. ✗ Beat through.`;
      }
      // Weapon wear: 2 points regardless of success.
      if (mainName) {
        for (let i = 0; i < 2; i++) {
          set((s) => (s.player ? { player: wearEquippedItem(s.player, mainName, get) } : s));
        }
      }
    }

    // Roll for a status effect to apply based on the damage type.
    const newEffect = rollIncomingStatusEffect(enemyDamageType, player.statusEffects ?? []);
    // Per-enemy trait effects on a successful hit (bleeder / corrupting /
    // concussive). Independent of the damage-type roll so a trait can
    // stack with a type-based status.
    const traitHit = traitOnHitStatus(enemy.traits);

    // Armor wear: every armor piece that actually contributes to the
    // player's defence chips one point. Pieces with 0 durability or no
    // catalog entry are skipped.
    const wornSlots = ARMOR_SLOTS.filter((s) => !!player.equipped?.[s]);

    let killed = false;
    set((s) => {
      if (!s.player) return {};
      let nextPlayer = s.player;
      for (const slot of wornSlots) {
        const name = nextPlayer.equipped?.[slot];
        if (!name) continue;
        nextPlayer = wearEquippedItem(nextPlayer, name, get);
      }
      const newHp = Math.max(0, nextPlayer.hp - dmg);
      killed = newHp <= 0;
      const resistTag = resisted.blocked ? ` (armor halves the ${enemyDamageType})` : '';
      const msg = killed
        ? `${enemy.name} deals ${dmg} damage${resistTag}. You fall.`
        : `${enemy.name} deals ${dmg} damage${resistTag}. You have ${newHp} HP remaining.`;
      void Promise.resolve().then(() => get().appendLog('combat', msg));
      let effects = newEffect
        ? applyEffect(nextPlayer.statusEffects ?? [], newEffect.effect)
        : nextPlayer.statusEffects;
      if (traitHit) {
        effects = applyEffect(effects ?? [], {
          kind: traitHit.kind,
          remainingRounds: traitHit.rounds,
          label: traitHit.label,
        });
      }
      return { player: { ...nextPlayer, hp: newHp, statusEffects: effects } };
    });

    if (blockNarration) {
      void Promise.resolve().then(() => get().appendLog('combat', blockNarration!));
    }

    if (newEffect) {
      const verb = newEffect.isNew ? 'inflicts' : 'refreshes';
      void Promise.resolve().then(() =>
        get().appendLog('combat', `The ${enemyDamageType} ${verb} ${newEffect.effect.label}.`),
      );
    }

    if (traitHit) {
      void Promise.resolve().then(() =>
        get().appendLog('combat', `${enemy.name}'s strike leaves you ${traitHit.label}.`),
      );
    }

    // RIPOSTE — successful block landed a counter-strike. Find the live
    // enemy index and apply the damage to enemyHps. Death from riposte
    // resolves normally on the next attack cycle.
    if (riposteDamage > 0) {
      const live = get().currentScene;
      if (live) {
        const idx = live.enemies.findIndex((e) => e === enemy);
        if (idx >= 0) {
          const hpNow = live.enemyHps[idx] ?? enemy.hp;
          const hpAfter = Math.max(0, hpNow - riposteDamage);
          set((s) => {
            if (!s.currentScene) return {};
            const hps = [...s.currentScene.enemyHps];
            hps[idx] = hpAfter;
            return { currentScene: { ...s.currentScene, enemyHps: hps } };
          });
          void Promise.resolve().then(() =>
            get().appendLog('combat', `Riposte! Your block opens a gap — ${enemy.name} takes ${riposteDamage} damage.`),
          );
          // If the riposte killed the enemy, resolve their defeat now so
          // the rest of the group counter-volley doesn't skip them.
          if (hpAfter <= 0) {
            void Promise.resolve().then(() => {
              const scene = get().currentScene;
              if (!scene) return;
              const i = scene.enemies.findIndex((e) => e === enemy);
              if (i < 0) return;
              // Re-point the active idx to the riposted enemy so
              // resolveEnemyDefeat splices the right one.
              set((s) => (s.currentScene ? { currentScene: { ...s.currentScene, activeEnemyIdx: i } } : s));
              get().resolveEnemyDefeat();
            });
          }
        }
      }
    }

    if (killed) {
      void Promise.resolve().then(() => handlePlayerDeath(get, set));
    }
  }
  // End-of-round regen for the attacking enemy. Caps at its starting HP
  // so a player can't out-wait a regenerator past its base.
  const regen = traitRegen(enemy.traits);
  if (regen > 0) {
    const live = get().currentScene;
    if (live) {
      const idx = live.enemies.findIndex((e) => e === enemy);
      if (idx >= 0) {
        const cur = live.enemyHps[idx] ?? 0;
        if (cur > 0 && cur < enemy.hp) {
          const next = Math.min(enemy.hp, cur + regen);
          set((s) => {
            if (!s.currentScene) return {};
            const hps = [...s.currentScene.enemyHps];
            hps[idx] = next;
            return { currentScene: { ...s.currentScene, enemyHps: hps } };
          });
          void Promise.resolve().then(() =>
            get().appendLog('combat', `${enemy.name} regenerates ${regen} HP (${next}/${enemy.hp}).`),
          );
        }
      }
    }
  }
}

const DAMAGE_TYPE_KEYWORDS = [
  'degradation',
  'bludgeoning',
  'burn',
  'aetheric',
  'electrical',
  'piercing',
  'poison',
  'radiation',
  'slashing',
  'stun',
  'psychic', // common in enemy data — fold into aetheric for resistance purposes
];

function parseIncomingDamageType(damageString: string): string | null {
  const lower = damageString.toLowerCase();
  for (const t of DAMAGE_TYPE_KEYWORDS) {
    if (lower.includes(t)) return t === 'psychic' ? 'aetheric' : t;
  }
  return null;
}

// Death is no longer permanent erasure. The character is marked dead and
// remains on the title slot list (with a DEAD badge) so the player can
// resurrect them with a Resurrection Gem.
function handlePlayerDeath(
  get: () => GameStore,
  set: (fn: (s: GameStore) => Partial<GameStore>) => void,
): void {
  const state = get();
  const player = state.player;
  if (!player || player.dead) return; // already handled

  const locName = state.currentScene?.location.name ?? 'Tartaria';
  const epitaph = pick([
    `${player.name} falls in ${locName}. The Aetherstone grows dim and does not lift.`,
    `The buried world claims ${player.name}. Tartaria keeps the body count.`,
    `${player.name}'s breath leaves. The dust settles back into its old patterns.`,
    `An end at ${locName}. The Arbiter watches and says nothing.`,
    `${player.name} does not rise. The ruins remember another.`,
  ]);
  state.appendLog('combat', epitaph);
  state.appendLog(
    'system',
    `${player.name} has fallen. A Resurrection Gem from the title screen can bring them back.`,
  );

  // Mark the character dead in-place. Persist immediately so the slot
  // summary on the title list reflects the new state.
  set((s) => ({
    player: s.player ? { ...s.player, dead: true, hp: 0 } : s.player,
    pendingRolls: null,
  }));
  void get().persist();

  // Hold on the exploration screen for ~3.5s so the player reads the
  // final messages, then return to title with the refreshed slot list.
  setTimeout(() => {
    void get().refreshSlots();
    set(() => ({
      currentScreen: 'title',
      // Clear in-memory session state — the dead character is no longer
      // active. The slot itself is preserved on disk.
      player: null,
      currentScene: null,
      pendingRolls: null,
      activeSlotId: null,
    }));
  }, 3500);
}

// ---------------------------------------------------------------------------
// Free-narration helpers — these emit log entries WITHOUT triggering a dice
// roll. Used for "look around" / "look for a way" / "start walking" style
// actions where the player is exploring intent, not attempting a specific
// challenge that warrants a check.
// ---------------------------------------------------------------------------

// Narrate the player looking at a specific ambient noun mentioned in the
// location description. Sometimes plants a hook (the player's interest in
// "the traps" was rewarded with finding actual rigged-trap remnants);
// usually just enriches the scene without a payoff.

// Pick `n` distinct random elements from `arr` (Fisher-Yates partial).
// Used by buildLookAroundLine to rotate which interactables surface on
// each look when the authored pool is larger than what fits in one
// readable line. Same pool, varied presentation — kills the "I always
// see the same things" effect without changing what's actually
// searchable in the scene.
function shuffleSlice<T>(arr: readonly T[], n: number): T[] {
  if (arr.length <= n) return [...arr];
  const indices = arr.map((_, i) => i);
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j]!, indices[i]!];
  }
  return indices.slice(0, n).map((i) => arr[i]!);
}

function narrateAmbientFind(
  get: () => GameStore,
  set: (fn: (s: GameStore) => Partial<GameStore>) => void,
  scene: CurrentScene,
  noun: string,
): void {
  // Grammar: assume the noun is singular unless it already ends in 's'.
  // ("stalls" stays plural; "ground" stays singular.) Pronoun follows.
  const isPlural = /s$/i.test(noun);
  const pronoun = isPlural ? 'them' : 'it';
  const aroundPronoun = isPlural ? 'them' : 'it';
  const lines = [
    `You look closer at the ${noun}. Mud-glazed, undisturbed for a long while.`,
    `You examine the ${noun}. Tartaria has not given up its secrets here.`,
    `You study the ${noun}. The Aetheric haze around ${aroundPronoun} thickens, then settles.`,
    `You inspect the ${noun}. Whatever was here once, this is what remains.`,
    `You crouch beside the ${noun}. The silt has half-swallowed ${pronoun}.`,
  ];
  get().appendLog('world', pick(lines));
  // ~25% chance the investigation turns into a real hook in this scene.
  const activeUnresolved = (scene.hooks ?? []).some((h) => !h.resolved);
  if (!activeUnresolved && chance(25)) {
    const hook = plantHookByKind(pickRandomHookKind());
    set((s) => (s.currentScene ? { currentScene: { ...s.currentScene, hooks: [...(s.currentScene.hooks ?? []), hook] } } : s));
    get().appendLog('world', hook.plantedLine);
  }
}

// Politely re-prompt the player when they searched for something the
// engine cannot recognise. Lists the actual nouns visible in the scene so
// they can pick a real target instead of guessing.
function repromptUnknownTarget(
  get: () => GameStore,
  scene: CurrentScene,
  attempted: string,
): void {
  const ambient = scene.ambientNouns ?? [];
  const hookNouns = (scene.hooks ?? [])
    .filter((h) => !h.resolved)
    .flatMap((h) => h.nouns.slice(0, 2));
  const all = Array.from(new Set([...hookNouns, ...ambient])).slice(0, 6);
  const list = all.length > 0 ? all.join(', ') : 'the mud, the haze, the dust';
  get().appendLog(
    'arbiter',
    `The Arbiter tilts their head. "I do not see a '${attempted}' here. Choose words carefully — try: ${list}."`,
  );
}

function narrateCasualLook(
  get: () => GameStore,
  set: (fn: (s: GameStore) => Partial<GameStore>) => void,
  scene: CurrentScene,
): void {
  const player = get().player;
  // Short-form fallback: if the player JUST looked at this scene
  // (last look within ~2 in-game hours, same scene key), don't
  // re-read the full ~70-word location description. The audit
  // surfaced the same scene paragraph emitted 5x verbatim — that's
  // the player spamming `look`. Give them a one-line refresher
  // varied by their current state instead.
  // NOTE: the consecutive-look short-form was removed by player
  // request — "every time I say look around you, give me a new full
  // debrief and those nouns are in the search and approach bar. I
  // don't need a shortened version the second or third time that I
  // say it, otherwise I have to scroll all the way back up the text
  // log to see what's still around me that I haven't looked at."
  // lastLookAt field was removed in the post-audit cleanup — no
  // consumer remained after the short-form revert.

  // Full look — bearings, not flavor. Player feedback (verbatim):
  // "the responses from look shouldn't be flavor heavy it's you
  // getting your bearings. 'you look around, and find yourself in
  // a long hallway with a door behind you to the east, one at the
  // other end of the hall to the west, there is a bookshelf on the
  // north wall and two mounted aetherstone spears on the southern
  // wall.'"
  //
  // The OLD look pasted the entire envDesc paragraph plus weather
  // + hazard prose + sensory-layer flavor. The new look reads as
  // an orienteering pass: where am I, what can I see in arm's
  // reach, who's here, which way out. Flavor lives in the scene's
  // arrival narration; the look button is for re-checking your
  // bearings without re-reading 70 words of mood prose.
  const inHub = isHubLocation(player?.currentLocationId ?? null) && !!player?.hubRoomId;
  const hubRoom = inHub ? findHubRoom(player!.hubRoomId!) : null;
  const ladder = !hubRoom && scene.microMicroId ? findMicroMicroAnywhere(scene.microMicroId) : null;

  const parts: string[] = [];

  // 1. Orientation — "You look around. You're in [name]."
  const placeName = hubRoom
    ? `${hubRoom.name} (${scene.location.name})`
    : ladder?.microMicro.name
      ? `${ladder.microMicro.name}, in ${scene.location.name}`
      : scene.location.name;
  parts.push(`You look around. You're in ${placeName}.`);

  // 2. Notable objects you can see / approach. Pulled from the
  //    authored interactables array (or extractor fallback). This
  //    is the "bookshelf on the north wall, spears on the southern
  //    wall" line — concrete nouns, not mood prose.
  //
  //    Per playtest feedback ("why do I always see the same few
  //    things, are there broken wagons everywhere?"): when the pool
  //    is larger than 8, shuffle and show a random 8 each look. The
  //    full pool is still authored and searchable; the rotation just
  //    keeps the surface description from feeling static. With ~20-
  //    25 authored nouns per location now, two consecutive looks
  //    almost never show the same set.
  // Read from the cached displayedAmbientNouns subset (set ONCE in
  // beginScene). Five consecutive looks at the same room show the
  // same nouns; travel away + return re-rolls the subset on the
  // next beginScene. Fallback to ambientNouns if the field is
  // missing (legacy saves predating the cache).
  const interactables: string[] = [];
  const source = scene.displayedAmbientNouns ?? scene.ambientNouns ?? [];
  for (const n of source) {
    if (!interactables.includes(n)) interactables.push(n);
  }
  if (interactables.length > 0) {
    parts.push(`You see: ${interactables.slice(0, 8).join(', ')}.`);
  }

  // 3. Anything alive nearby — combat-relevant. Vendor, enemies,
  //    or an unresolved hook noun ("the handprint is still here").
  const presenceFragments: string[] = [];
  if (scene.enemies.length > 0) {
    const groups = new Map<string, number>();
    for (const e of scene.enemies) groups.set(e.name, (groups.get(e.name) ?? 0) + 1);
    const labels = Array.from(groups.entries()).map(([n, c]) => (c > 1 ? `${c} ${n}s` : n));
    presenceFragments.push(`${labels.join(', ')} within striking distance.`);
  }
  if (scene.vendor) {
    presenceFragments.push(`${scene.vendor.name} is here.`);
  }
  // Distance / atmospheric nouns shouldn't trigger the "unaddressed"
  // nag — the player can't walk over to "the smoke in the distance"
  // and resolve it from the current tile, so calling them out every
  // look reads as a bug (playtest caught "The smoke is unaddressed"
  // recurring across 4+ looks at the Armory). Only flag CONCRETE
  // local nouns the player could actually act on.
  const ATMOSPHERIC_NOUNS = new Set([
    'smoke', 'steam', 'plume', 'column',
    'fog', 'haze', 'draft', 'breeze', 'cold', 'air',
    'sound', 'echo', 'wind',
    'glow', 'light', 'shimmer',
    'distance', 'horizon', 'sky',
  ]);
  const unresolvedHooks = (scene.hooks ?? []).filter((h) => !h.resolved);
  const concreteHook = unresolvedHooks.find((h) => {
    const n = (h.nouns[0] ?? h.kind ?? '').toLowerCase();
    return n && !ATMOSPHERIC_NOUNS.has(n);
  });
  if (concreteHook) {
    const hookNoun = concreteHook.nouns[0] ?? concreteHook.kind;
    presenceFragments.push(`The ${hookNoun} is unaddressed.`);
  }
  if (presenceFragments.length > 0) parts.push(presenceFragments.join(' '));

  // 4. Hazard — name only. The hazard's prose lives in the arrival
  //    scene; the look just reminds the player it's active.
  if (scene.hazard) parts.push(`Hazard active: ${scene.hazard.name}.`);

  // 5. HP gut-check — bearings-relevant ("can I fight right now?")
  //    only when hurt. Drop the time-of-day flavor; not a bearing.
  if (player) {
    const hp = player.hp ?? 0;
    const hpMax = player.hpMax ?? 1;
    if (hp < hpMax * 0.5) parts.push(`You're carrying wounds (${hp}/${hpMax} HP).`);
  }

  // 6. Exits — the bulk of bearings. Direction + destination when
  //    we have one (hub-room exits name the room; Micro-Micro
  //    exits are already authored as direction-bearing phrases).
  if (hubRoom) {
    const labels: string[] = [];
    for (const dir of ['north', 'east', 'south', 'west'] as const) {
      const id = hubRoom.exits[dir];
      if (!id) continue;
      const r = findHubRoom(id);
      if (r) labels.push(`${dir} to ${r.shortName}`);
    }
    if (labels.length > 0) parts.push(`Exits: ${labels.join(' · ')}.`);
    parts.push(`(Type 'leave outpost' to head into the wilds.)`);
  } else {
    const exitLine: string[] = [];
    if (ladder?.microMicro.exits && ladder.microMicro.exits.length > 0) {
      exitLine.push(`Room exits: ${ladder.microMicro.exits.join(' · ')}.`);
    }
    exitLine.push(`Cardinal travel: north, east, south, west.`);
    parts.push(exitLine.join(' '));
  }

  get().appendLog('world', parts.join(' '));

  // 6. Optional hook plant — 30% chance, only if no hook is already active.
  // Kept separate from the description so the look-summary always reads
  // the same way regardless of whether a new lead drops.
  if (unresolvedHooks.length === 0 && chance(30)) {
    const hook = plantHookByKind(pickRandomHookKind());
    set((s) => (s.currentScene ? { currentScene: { ...s.currentScene, hooks: [...(s.currentScene.hooks ?? []), hook] } } : s));
    get().appendLog('world', hook.plantedLine);
  }
}

function narrateWanderingJourney(
  get: () => GameStore,
  set: (fn: (s: GameStore) => Partial<GameStore>) => void,
  scene: CurrentScene,
): void {
  const lead = rotatingPick(WANDERING_LEADS, 'wander.lead');
  // Wandering always plants a hook — it's the player asking the world to
  // show them something. Skip if one is already active so we don't pile up.
  const activeUnresolved = (scene.hooks ?? []).some((h) => !h.resolved);
  if (activeUnresolved) {
    get().appendLog('world', `${lead}  The thread you were following waits where you left it.`);
    return;
  }
  const hook = plantHookByKind(pickRandomHookKind());
  set((s) => (s.currentScene ? { currentScene: { ...s.currentScene, hooks: [...(s.currentScene.hooks ?? []), hook] } } : s));
  get().appendLog('world', `${lead}  ${hook.plantedLine}`);
}

function narratePossibleDirections(get: () => GameStore, scene: CurrentScene): void {
  const others = allLocations.filter((l) => l.id !== scene.location.id && l.discoverable !== false);
  if (others.length === 0) {
    get().appendLog('world', 'You scan for a way forward. Tartaria does not advertise its directions.');
    return;
  }
  const first = pick(others);
  const second = others.length > 1 && chance(60)
    ? pick(others.filter((o) => o.id !== first.id))
    : null;
  const fragments: string[] = [];
  fragments.push(`a ${(first.type ?? 'path').toLowerCase()} toward ${first.name}`);
  if (second) fragments.push(`a ${(second.type ?? 'path').toLowerCase()} toward ${second.name}`);
  get().appendLog('world', `You look for a way forward. The Arbiter notes ${fragments.join(' and ')}.`);
}

// ---------------------------------------------------------------------------
// Weapon-aware combat narration — pulls the resolved weapon name (when the
// player explicitly named one) into the strike/hit/miss/kill messages so the
// combat log stops feeling like a Mad Lib.
// ---------------------------------------------------------------------------

function weaponPhrase(weapon: string | null): string {
  return weapon ? ` with the ${weapon.toLowerCase()}` : '';
}

function attackOpener(enemyName: string, weapon?: string | null): string {
  const w = weapon ?? null;
  if (w) {
    return pick([
      `You raise the ${w.toLowerCase()} toward ${enemyName}. The room narrows around the both of you.`,
      `Your ${w.toLowerCase()} comes around in an arc; ${enemyName} reads it but does not move yet.`,
      `You commit forward with the ${w.toLowerCase()}. ${enemyName} watches your hands.`,
      `The ${w.toLowerCase()} is already moving when ${enemyName} sees it coming.`,
    ]);
  }
  return pick([
    `You close on ${enemyName}. The room narrows around the both of you.`,
    `${enemyName} fixes on you. You commit to the strike.`,
    `You drive toward ${enemyName} before it can choose first.`,
  ]);
}

function attackHit(weapon: string | null, enemyName: string, dmg: number, remainingHp: number): string {
  const wp = weaponPhrase(weapon);
  return pick([
    `Your strike${wp} lands for ${dmg}. ${enemyName} staggers — ${remainingHp} HP remaining. It answers.`,
    `${enemyName} takes ${dmg}${wp}. It reels: ${remainingHp} left. Then it fights back.`,
    `Clean hit${wp} for ${dmg}. ${enemyName} has ${remainingHp} left and does not back away.`,
    `The blow${wp} finds purchase — ${dmg} damage, ${remainingHp} HP standing. ${enemyName} commits to the counter.`,
  ]);
}

function attackMiss(weapon: string | null, enemyName: string): string {
  const wp = weaponPhrase(weapon);
  return pick([
    `Your strike${wp} glances off. ${enemyName} seizes the opening.`,
    `${enemyName} reads the motion and slips it${wp ? ` — the ${weapon!.toLowerCase()} carves only air` : ''}. The counter is already coming.`,
    `${wp ? `The ${weapon!.toLowerCase()} cuts air` : 'Your strike cuts air'}. ${enemyName} answers immediately.`,
    `Half a beat too slow. ${enemyName} steps inside your reach.`,
  ]);
}

function attackKill(weapon: string | null, enemyName: string, dmg: number): string {
  const wp = weaponPhrase(weapon);
  return pick([
    `Your blow${wp} lands clean — ${dmg} damage. ${enemyName} crumples in the dust. The Aetherstone settles.`,
    `${enemyName} folds${wp ? ` under the ${weapon!.toLowerCase()}` : ''}. ${dmg} damage was enough. The room exhales.`,
    `Final strike${wp} for ${dmg}. ${enemyName} is still. The Aetherstone hums on, indifferent.`,
    `The killing blow${wp}: ${dmg}. ${enemyName} drops where it stood.`,
  ]);
}

// Log faction-rep changes one line per affected faction so the player
// can see propagation (e.g. gifting the Forgotten Order also nudges
// the Reclaimers Guild via the situational alliance, and dings the
// Mud Monarchs as their rival).
function logRepChanges(
  get: () => GameStore,
  changes: { factionId: string; delta: number; newStanding: number }[],
): void {
  for (const c of changes) {
    const faction = FACTIONS.find((f) => f.id === c.factionId);
    const name = faction?.name ?? c.factionId;
    const sign = c.delta > 0 ? '+' : '';
    get().appendLog('system', `${name} standing ${sign}${c.delta} (now ${c.newStanding})`);
  }
}

// Async Arbiter narration helper — bridges the game engine to the Qwen LLM.
//
// Call this from any site that would otherwise do
//   `get().appendLog('arbiter', someTemplateString)`
// to give Qwen a chance to write the line instead. Fire-and-forget — the
// action that called it returns immediately. Streaming tokens populate
// `partialArbiterText` for tail rendering; the final assembled text gets
// appended to the log on completion.
//
// Falls back to the template string in three cases:
//   1. Qwen isn't ready yet (cold boot, model still downloading, or boot
//      skipped).
//   2. Another generation is already in flight — we don't queue, because the
//      template fallback is already perfectly atmospheric.
//   3. Generation throws for any reason (model corrupt, OOM, etc).
//
// The `templateFallback` param is the same string the call site would have
// used pre-Qwen, computed eagerly so the failure path is instantaneous.
// Monotonic counter — incremented every time a new Arbiter generation begins.
// Each call captures the epoch at start; if the epoch has moved by the time
// the stream completes (because cancelGeneration was called, or a fresh
// narration started), the result is discarded. Mirrors the AudioManager
// fade-epoch pattern.
let arbiterGenerationEpoch = 0;

// Trim Qwen output back to the last sentence-terminating punctuation so we
// don't display fragments like "...echoing in the". Looks for the final
// ., !, ?, ", or — followed (optionally) by trailing space/quote and keeps
// everything up to and including that character. Falls back to the raw
// text if nothing terminal is present (rare — would only happen on a
// single-fragment generation that never landed a punctuation mark).
function trimToLastSentence(raw: string): string {
  const s = (raw ?? '').trim();
  if (!s) return '';
  // Iterate backwards looking for terminal punctuation followed by either
  // end-of-string or a space + capital letter (i.e. an actual sentence
  // boundary, not an abbreviation period).
  for (let i = s.length - 1; i >= 0; i--) {
    const c = s[i]!;
    if (c === '.' || c === '!' || c === '?') {
      // Allow a closing quote to immediately follow.
      const tail = s[i + 1];
      if (tail === undefined || tail === ' ' || tail === '\n' || tail === '"' || tail === "'") {
        return s.slice(0, i + 1).trim();
      }
    }
  }
  return s; // no terminal punctuation found — keep the raw text
}

/**
 * Hard-cap a generated paragraph to the first `maxSentences` sentences.
 * The peaceful prompt asks for ~2 sentences and combat asks for 1, but
 * Qwen 0.5B routinely produces 3–4 when it gets going. The post-generation
 * trim already lops trailing fragments — this enforces the count.
 *
 * Playtest log triggered this: a 4-sentence hallucination naming
 * "Aetherstone Deep" / "Grand Hall" / "Ash Storm" — none of which
 * matched the actual scene. Capping won't stop hallucination on its own,
 * but it shortens the surface area the LLM can fill with invention.
 */
function clampSentences(raw: string, maxSentences: number): string {
  const s = (raw ?? '').trim();
  if (!s) return '';
  let count = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (c === '.' || c === '!' || c === '?') {
      // Skip ellipses ("..." counts as one boundary, not three).
      while (i + 1 < s.length && (s[i + 1] === '.' || s[i + 1] === '!' || s[i + 1] === '?')) {
        i++;
      }
      count++;
      if (count >= maxSentences) {
        // Include any immediately following closing quote.
        const next = s[i + 1];
        const cut = next === '"' || next === "'" ? i + 2 : i + 1;
        return s.slice(0, cut).trim();
      }
    }
  }
  return s;
}

async function narrateViaArbiter(
  get: () => GameStore,
  set: (partial: Partial<GameStore> | ((s: GameStore) => Partial<GameStore>)) => void,
  templateFallback: string,
  /**
   * Intent that triggered this narration. Used as the routing key for the
   * Qwen allowlist (see QWEN_ALLOWED_INTENTS). Intents outside the
   * allowlist take the template path even when Qwen is ready — this is
   * Phase 4 §1.1, "kill the randomizer." The synthetic 'scene_intro'
   * intent lets the scene-entry path through.
   */
  intent: string = 'scene_intro',
): Promise<void> {
  const trimmed = (templateFallback ?? '').trim();
  const scene = get().currentScene;
  // Phase 4 §1.2 — the Combat Muzzle. Any hostile entity in the scene
  // forces template-only narration regardless of Qwen readiness or the
  // configured intent. The model has been observed to hallucinate trap
  // sequences and tour-guide prose during combat; the deterministic
  // template path is faster AND safer here.
  const inCombat = !!scene && scene.enemies.length > 0;
  // Phase 4 §1.1 — Intent allowlist. Outside the small whitelist
  // (travel, diplomacy, scene_intro), the deterministic templates
  // carry the narration. Random Qwen chatter on attack / rest / dig /
  // equip etc. is gone.
  const intentAllowsQwen = QWEN_ALLOWED_INTENTS.has(intent);
  if (!qwen.isReady() || get().isGenerating || inCombat || !intentAllowsQwen) {
    if (trimmed) get().appendLog('arbiter', trimmed);
    return;
  }
  const state = get();
  const player = state.player;
  if (!player || !scene) {
    if (trimmed) get().appendLog('arbiter', trimmed);
    return;
  }
  const sceneSlice: SceneSlice = {
    location: scene.location,
    weather: scene.weather,
    hazard: scene.hazard,
    enemies: scene.enemies,
    enemyHps: scene.enemyHps,
    vendor: scene.vendor
      ? { name: scene.vendor.name, affiliation: scene.vendor.faction ?? undefined }
      : null,
  };
  // World-ladder override — when beginScene picked a Micro-Micro for this
  // visit, fold it into the context so the Arbiter narrates at the room
  // tier instead of the flat Location tier.
  const ladder = scene.microMicroId
    ? findMicroMicroAnywhere(scene.microMicroId)
    : null;
  const ctx = buildLlmContext({
    player,
    scene: sceneSlice,
    gameLog: state.gameLog,
    ladder,
  });
  const messages = buildSystemPrompt(ctx);
  const myEpoch = ++arbiterGenerationEpoch;
  set({ isGenerating: true, partialArbiterText: '' });
  try {
    // Token budgets matched to the prompts:
    //   combat instruction:  1 short sentence  ≈  35 tokens → cap 55
    //   peaceful instruction: 2 short sentences ≈  60 tokens → cap 90
    // Plus headroom so the model has space to land on a terminal punctuation
    // mark naturally before we hit the cap.
    const maxTokens = ctx.in_combat ? 55 : 90;
    const text = await qwen.stream(
      messages,
      (token: string) => {
        // Only update the buffer if we're still the active generation.
        if (myEpoch !== arbiterGenerationEpoch) return;
        const current = get().partialArbiterText ?? '';
        set({ partialArbiterText: current + token });
      },
      { maxNewTokens: maxTokens },
    );
    if (myEpoch !== arbiterGenerationEpoch) return; // cancelled mid-flight
    // Trim to the last complete sentence so we never display a partial
    // ending like "...each stroke echoing in the". Falls back to the raw
    // text only when nothing terminal-punctuated is present, then to the
    // template if that's empty.
    // Cap sentences before trimming so we never emit the 4-sentence
    // hallucination paragraphs the playtest log caught.
    const capped = clampSentences(text, ctx.in_combat ? 1 : 2);
    // Anti-third-person filter. Qwen still occasionally writes "The
    // player paused..." despite the prompt. Drop those sentences and
    // fall back to the template if NOTHING usable survives, so the
    // arbiter feed never reads as a recap about someone else.
    const survivors = capped
      .split(/(?<=[.!?])\s+/)
      .filter((s) => !/\b(the player|the adventurer|the explorer|the figure)\b/i.test(s))
      .filter((s) => !/^\s*they\s/i.test(s))
      .join(' ')
      .trim();
    const finalText = trimToLastSentence(survivors) || trimmed;
    get().appendLog('arbiter', finalText);
  } catch {
    if (myEpoch === arbiterGenerationEpoch && trimmed) {
      get().appendLog('arbiter', trimmed);
    }
  } finally {
    // Only clear flags if we're still the active generation; otherwise the
    // newer generation owns them.
    if (myEpoch === arbiterGenerationEpoch) {
      set({ isGenerating: false, partialArbiterText: null });
    }
  }
}
