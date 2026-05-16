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
import { createCharacter, type CreateCharacterInput } from '../engine/character';
import { generateQuest } from '../engine/questGenerator';
import { pickWeather, pickHazardForLocation, pickEnemyForLocation, rollEncounter, getLocationById } from '../engine/encounter';
import {
  buildOpening,
  buildScene,
  buildArbiterRemark,
  shouldArbiterSpeak,
  buildSoftArbiterFallback,
  buildArbiterSceneIntro,
  USE_RELIC_FAILURE_LINES,
} from '../engine/narrativeGenerator';
import { parseInput, type ParseContext } from '../engine/parser';
import { rollDie, rollFromNotation, pick, chance } from '../engine/rng';
import { buildCombatSteps, buildSkillSteps, buildRestSteps } from '../engine/combatRules';
import { CognitiveOrchestrator, type BootStage } from '../ai/CognitiveOrchestrator';
import type { CognitiveResponse, WorldContext, ModelInfo } from '../ai/types';
import { QwenGenerativeEngine, type QwenStatus } from '../ai/generation/QwenGenerativeEngine';
import { buildLlmContext, buildSystemPrompt, type SceneSlice } from '../engine/contextInjector';
import { getItemPreview } from '../components/itemPreview';
import { isInventoryQuestion, extractInventoryTarget } from '../engine/askInventory';
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
import { pickRandomVendor, type VendorInstance } from '../engine/vendors';
import { validSlotsForItem, SLOT_LABEL, ARMOR_SLOTS } from '../engine/equipment';
import { stampDurability, wearItemByName, repairCost, repairItem } from '../engine/durability';
import {
  type Hook,
  type HookEffect,
  getHookOutcome,
  matchHookNoun,
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
import { tickWeather, weatherBlocksRepositioning } from '../engine/weatherEffects';
import { extractAmbientNouns, matchAmbientNoun } from '../engine/ambientNouns';
import { isAreaSearch, rollAreaSearch } from '../engine/areaSearch';
import { bestDigTool, rollDig } from '../engine/digging';
import {
  generateWorldMap,
  stepInDirection,
  surveyAll,
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
  aethericVulnerabilityMultiplier,
} from '../engine/statusEffects';
import type { StatusEffect, MemorableEvent } from '../engine/types';

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
  const nouns = [scene.location.name, scene.weather.name];
  if (scene.hazard) nouns.push(scene.hazard.name);
  for (const e of scene.enemies) {
    nouns.push(e.name, e.type);
  }
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
const STAMINA_COSTS = {
  travel: 2,
  wander: 2,
  attack: 1,
  skillCheck: 1,
} as const;
const TRAVEL_MIN_STAMINA = STAMINA_COSTS.travel;

function backfillPlayer(p: PlayerCharacter): PlayerCharacter {
  const stamMax = p.staminaMax ?? 8 + Math.floor((p.stats?.strength ?? 5) / 2);
  // Migrate legacy single-slot equipped fields to the multi-slot shape.
  // Old saves may have a single `armor` field — promote it to the chest slot.
  const eq = p.equipped ?? {};
  const legacyArmor = eq.chest ?? eq.armor ?? eq.armorName;
  const equipped: PlayerCharacter['equipped'] = {
    main: eq.main ?? eq.weaponName,
    off: eq.off,
    head: eq.head,
    chest: legacyArmor,
    legs: eq.legs,
    feet: eq.feet,
    amulet: eq.amulet,
    ring: eq.ring,
  };
  // Stamp durability on any catalog item that doesn't already have it.
  // Older saves predate the durability field.
  const inventory = (p.inventory ?? []).map((i) => stampDurability(i));
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
    completedFactionQuestIds: p.completedFactionQuestIds ?? [],
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

  beginScene: (opts?: { openingPrefix?: string }) => void;
  submitPlayerAction: (text: string) => void;
  resolveRollStep: (values: number[]) => void;
  cancelPendingRolls: () => void;
  concludeRolls: (steps: RollStep[], actionText: string) => void;
  travelTo: (locationId: string) => void;
  generateNewQuest: () => Quest;
  resolveEnemyDefeat: () => void;
  rest: () => void;
  buyFromVendor: (itemName: string) => void;
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

  bootCognitive: () => Promise<void>;
  skipCognitiveBoot: () => void;
  shutdownCognitive: () => Promise<void>;
  resumeCognitive: () => Promise<void>;

  bootQwen: () => Promise<void>;
  skipQwenBoot: () => void;
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
    });
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
      set({
        player,
        worldMemory: saved.worldMemory,
        gameLog: saved.gameLog,
        currentScreen: 'exploration',
        activeSlotId: slotId,
        currentScene: null,
        pendingRolls: null,
      });
      // Saves don't store the scene; generate a fresh one so the player can
      // immediately interact with the exploration screen.
      get().beginScene();
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
    get().appendLog('system', `${player.name} steps into Tartaria.`);
    // Opening line gets woven INTO the scene paragraph rather than printed
    // as its own log entry, so the player sees one flowing intro instead
    // of three stacked statements.
    get().beginScene({ openingPrefix: buildOpening() });
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
    set((state) => ({
      gameLog: [...state.gameLog, entry].slice(-MAX_LOG_IN_MEMORY),
    }));
  },

  beginScene(opts?: { openingPrefix?: string }) {
    const { player, worldMemory } = get();
    if (!player) return;
    const location = getLocationById(player.currentLocationId);
    const weather = pickWeather(worldMemory);
    const hazard = pickHazardForLocation(location);
    // Combat cooldown — after a fight resolves, give the player at least
    // 2 scenes of peace to dig / search / wander. Skip the encounter roll
    // entirely during the cooldown window.
    const peaceCounter = worldMemory.scenesSinceCombat ?? 99;
    const enforcePeace = peaceCounter < 2;
    const encounter = enforcePeace ? [] : rollEncounter(location);
    const enemies: Enemy[] = encounter;
    const enemyHps: number[] = enemies.map((e) => e.hp);
    const activeEnemyIdx = 0;
    const hasEnemies = enemies.length > 0;
    // Vendor only appears in peaceful scenes. ~22% chance.
    const vendor = !hasEnemies && Math.random() < 0.22 ? pickRandomVendor() : null;
    // Enemies start at 'close' range — close enough to be a problem but not
    // already swinging. Players have to advance (or be charged) to land
    // melee, retreat to set up ranged shots.
    const range: CombatRange | null = hasEnemies ? 'close' : null;
    // Hooks — pending cross-scene chains land first; otherwise no hook is
    // planted at scene start. Wandering / exploration plants fresh hooks.
    const initialHooks: Hook[] = [];
    const pendingChains = worldMemory.pendingChains ?? [];
    const consumedChainIds: string[] = [];
    if (pendingChains.length > 0 && !hasEnemies) {
      const next = pendingChains[0]!;
      const h = plantHookByKind(next.kind as Hook['kind'], next.chainId);
      initialHooks.push(h);
      consumedChainIds.push(next.chainId);
    }
    const ambientNouns = extractAmbientNouns(location.description);
    const scene: CurrentScene = {
      weather, location, hazard, enemies, enemyHps, activeEnemyIdx,
      vendor, range, hooks: initialHooks, ambientNouns,
    };
    set({ currentScene: scene, pendingRolls: null });
    if (consumedChainIds.length > 0) {
      set((s) => ({
        worldMemory: {
          ...s.worldMemory,
          pendingChains: (s.worldMemory.pendingChains ?? []).filter((c) => !consumedChainIds.includes(c.chainId)),
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
    const sceneText = buildScene({ weather, location, hazard, enemy: sceneEnemy, quest: player.activeQuests[0] });
    const finalSceneLog = opts?.openingPrefix
      ? `${opts.openingPrefix.trim()} ${sceneText.replace(/\n\n+/g, ' ')}`
      : sceneText;
    get().appendLog('world', finalSceneLog);
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
          get().appendLog(
            'arbiter',
            `${vendor.name} leans in. "Got a contract for someone like you. ${q.title}. ${q.description} Reward: ${q.reward.tc} TC, +${q.reward.rep} rep. Say 'accept ${q.title.split(' ').slice(0, 2).join(' ').toLowerCase()}' to take it."`,
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
            'arbiter',
            `${vendor.name} taps a notice on the post. "Bounty up — ${h.title}. ${h.posterText} Say 'accept ${h.title.split(' ').slice(1, 4).join(' ').toLowerCase()}' to take it."`,
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
            'arbiter',
            `${vendor.name} taps a different notice. "Mystery work — ${m.title}. ${m.posterText} Say 'accept ${m.title.split(' ').slice(0, 3).join(' ').toLowerCase()}' to take it."`,
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
            `${vendor.name} unrolls a thick scroll. "Long-form work — ${s.title}. ${s.posterText} Say 'accept ${s.title.split(' ').slice(0, 3).join(' ').toLowerCase()}' to take it."`,
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
      );
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

  submitPlayerAction(text) {
    const trimmed = text.trim();
    if (!trimmed || get().pendingRolls) return;

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

    // Tick all active status effects one round. Bleed-style DOTs deal
    // damage, expired effects drop off, and incapacitation (stun / paralyze)
    // wastes the player's action with a narrated line.
    const tick = tickEffects(player.statusEffects ?? []);
    if (tick.dotDamage > 0 || tick.expired.length > 0 || tick.effects.length !== (player.statusEffects?.length ?? 0)) {
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
      let weatherKilled = false;
      set((s) => {
        if (!s.player) return {};
        const newHp = Math.max(0, s.player.hp + wtick.hpDelta);
        const newStam = Math.max(0, Math.min(s.player.staminaMax, s.player.stamina + wtick.staminaDelta));
        const newCorr = Math.max(0, s.player.corruption + wtick.corruptionDelta);
        weatherKilled = newHp <= 0;
        return { player: { ...s.player, hp: newHp, stamina: newStam, corruption: newCorr } };
      });
      get().appendLog('world', wtick.line);
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
    };
    const parsed = parseInput(trimmed, parseCtx);
    get().appendLog('player', trimmed, {
      intent: parsed.intent,
      confidence: parsed.confidence,
      resolvedNoun: parsed.resolvedNoun,
    });

    if (parsed.intent === 'unknown' || parsed.confidence < 0.5) {
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
    const hookEligible: Intent[] = [
      'investigate',
      'stealth',
      'travel',
      'use_relic',
      'cast',
      'advance',
      'ask',
    ];
    if (hookEligible.includes(parsed.intent) && currentScene.hooks && currentScene.hooks.length > 0) {
      const targetText = (parsed.resolvedNoun ?? parsed.target ?? trimmed).toLowerCase();
      const hook = matchHookNoun(targetText, currentScene.hooks);
      if (hook && !hook.resolved) {
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
          if (!reach.bands.includes(range)) {
            get().appendLog(
              'arbiter',
              `The Arbiter holds up a hand. "${reach.label} cannot reach at ${RANGE_LABEL[range]}. Close the gap, or swap to something with range."`,
            );
            break;
          }
          set({ player: advanceTime(spendStamina(player, STAMINA_COSTS.attack), 0.1) });
          const steps = buildCombatSteps(trimmed, player, targetEnemy);
          set({ pendingRolls: { actionText: trimmed, steps, currentStep: 0 } });
          get().appendLog('world', attackOpener(targetEnemy.name, parsed.resolvedNoun));
        } else {
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
            if (preview.stats.length > 0) {
              get().appendLog('world', preview.stats.join(' · '));
            }
          }
          set({ player: advanceTime(spendStamina(player, STAMINA_COSTS.skillCheck), 0.25) });
          const steps = buildSkillSteps('investigate', player);
          set({ pendingRolls: { actionText: trimmed, steps, currentStep: 0 } });
          break;
        }
        // 4) Generic area / surface / direction search ("the mud", "the
        // rubble", "the doorway", "the area to my left"). Roll an
        // outcome on the spot — nothing, small material, small TC, or
        // an atmospheric hook plant. Always engaging, never reprompting
        // for these.
        if (rawTarget && isAreaSearch(rawTarget)) {
          set({ player: advanceTime(spendStamina(player, STAMINA_COSTS.skillCheck), 0.25) });
          const outcome = rollAreaSearch(rawTarget);
          get().appendLog('world', outcome.line);
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
            set((s) =>
              s.player ? { player: { ...s.player, inventory: [...s.player.inventory, newItem] } } : s,
            );
            get().appendLog('reward', `✦ ${outcome.itemName} (${outcome.rarity}).`);
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
        // 5) Player aimed at something specific the engine can't recognise.
        // First try a semantic resolution via MiniLM — embed the raw target
        // + scene candidates, find the closest cosine match. If it lands
        // above threshold, re-run the action with the inferred target.
        // Otherwise re-prompt politely.
        if (rawTarget) {
          if (cognitive.isReady()) {
            const candidates = [
              ...(currentScene.ambientNouns ?? []),
              ...(currentScene.hooks ?? []).filter((h) => !h.resolved).flatMap((h) => h.nouns),
              ...currentScene.enemies.map((e) => e.name),
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
        const steps = buildSkillSteps(parsed.intent, player);
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
          // Open the interactive dice roller for rest duration. concludeRolls
          // sees the rest_hours step and applies heal/stamina/time.
          const steps = buildRestSteps();
          set({ pendingRolls: { actionText: 'rest', steps, currentStep: 0 } });
        }
        break;
      }
      case 'travel': {
        if (player.stamina < TRAVEL_MIN_STAMINA) {
          get().appendLog(
            'world',
            'You take one step and the buried world refuses. Your legs will not. Rest first, then the road.',
          );
          break;
        }
        const target = parsed.target?.toLowerCase() ?? '';
        // Directional travel: "go north" / "head east" / "walk south" /
        // "travel west" — walk one tile on the procedural map.
        const dirMatch = /\b(north|south|east|west)\b/.exec(target);
        if (dirMatch) {
          const dir = dirMatch[1] as Direction;
          set({ player: advanceTime(spendStamina(player, STAMINA_COSTS.travel), 1) });
          get().stepDirection(dir);
          break;
        }
        const candidate = target
          ? allLocations.find((l) => l.name.toLowerCase().includes(target) || l.id === target)
          : undefined;
        if (candidate) {
          set({ player: advanceTime(spendStamina(player, STAMINA_COSTS.travel), 2) });
          get().travelTo(candidate.id);
        } else {
          set({ player: advanceTime(spendStamina(player, STAMINA_COSTS.wander), 1) });
          narrateWanderingJourney(get, set, currentScene);
        }
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
        // Implemented as a status effect so it ticks down like everything
        // else and shows in the StatsPanel "Effects" line.
        const dodging: StatusEffect = {
          kind: 'dodging',
          remainingRounds: 1,
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
        // way — that's the cost. Ranged weapons (defense 0) can still
        // attempt but almost never succeed.
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
          remainingRounds: 1,
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
        const moveEnemy = activeEnemy(currentScene);
        if (!moveEnemy) {
          get().appendLog('arbiter', `The Arbiter shrugs. "Nothing to advance on. The ground here is quiet."`);
          break;
        }
        if (weatherBlocksRepositioning(currentScene.weather)) {
          get().appendLog(
            'arbiter',
            `The Arbiter holds up a hand. "${currentScene.weather.name} has taken the ground from you. You cannot reposition."`,
          );
          break;
        }
        const order: CombatRange[] = ['arm', 'close', 'far'];
        const cur = currentScene.range ?? 'close';
        const curIdx = order.indexOf(cur);
        const nextIdx = parsed.intent === 'advance' ? Math.max(0, curIdx - 1) : Math.min(order.length - 1, curIdx + 1);
        const next = order[nextIdx]!;
        const groupLabel = currentScene.enemies.length > 1
          ? `the ${currentScene.enemies.length} ${moveEnemy.name}s`
          : moveEnemy.name;
        if (next === cur) {
          get().appendLog(
            'world',
            parsed.intent === 'advance'
              ? `You are already at arm's reach with ${groupLabel}.`
              : `You cannot put more ground between you and ${groupLabel}.`,
          );
          break;
        }
        set((s) => (s.currentScene ? { currentScene: { ...s.currentScene, range: next } } : s));
        get().appendLog(
          'world',
          parsed.intent === 'advance'
            ? `You close the gap with ${groupLabel}. (range: ${RANGE_LABEL[next]})`
            : `You pull back from ${groupLabel}. (range: ${RANGE_LABEL[next]})`,
        );
        // Movement takes a beat — let any enemy still in their effective
        // range counter-attack. Group: every reaching enemy fires.
        const reachers = currentScene.enemies.filter((e, i) =>
          enemyCanReach(e, next) && (currentScene.enemyHps[i] ?? 0) > 0,
        );
        if (reachers.length > 0) {
          runEnemyGroupCounters(get, set, get().player ?? player);
        }
        break;
      }
      case 'ask': {
        const lookup = parsed.target ?? parsed.resolvedNoun ?? trimmed;
        // "where am I" / "what is around" / "compass" → directional survey
        // if the player has a compass; otherwise a vaguer answer.
        const wantsBearings = /where.*am|what.*around|what.*near|which way|compass|bearings|surroundings/i.test(trimmed);
        if (wantsBearings) {
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
            );
          } else {
            get().appendLog(
              'arbiter',
              `The Arbiter shrugs. "You have no compass. The mud-flood country looks the same in every direction — find one or guess."`,
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
          if (target) {
            const matches = player.inventory.filter(
              (i) => i.quantity > 0 && i.name.toLowerCase().includes(target),
            );
            if (matches.length > 0) {
              const itemized = matches
                .map((i) => (i.quantity > 1 ? `${i.name} (x${i.quantity})` : i.name))
                .join(', ');
              get().appendLog(
                'arbiter',
                `The Arbiter glances at your pack. "Yes — ${itemized}."`,
              );
            } else {
              get().appendLog(
                'arbiter',
                `The Arbiter shakes their head. "No ${target} on you."`,
              );
            }
            break;
          }
        }
        // Otherwise normal concept lookup.
        const concept = findConcept(lookup);
        if (concept) {
          get().appendLog('arbiter', `"${concept.title}." the Arbiter says. "${concept.answer}"`);
        } else {
          get().appendLog(
            'arbiter',
            `The Arbiter considers. "I do not have a clean answer for that yet. Try a damage type, a faction, or one of the basic systems — HP, stamina, AC, corruption, the Aether."`,
          );
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
      case 'accept': {
        const target = parsed.target ?? parsed.resolvedNoun ?? '';
        if (!target.trim()) {
          get().appendLog('arbiter', `The Arbiter raises a brow. "Accept what? Ask the agent what is on offer."`);
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
        if (!currentScene.vendor) {
          get().appendLog('arbiter', `The Arbiter watches the empty path. "Nothing to steal here."`);
          break;
        }
        const target = parsed.resolvedNoun ?? parsed.target ?? '';
        if (!target.trim()) {
          get().appendLog('arbiter', `The Arbiter narrows their eyes. "Steal what? Name it precisely."`);
          break;
        }
        get().stealFromVendor(target);
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
        // No target — list what's currently craftable from inventory.
        const target = parsed.target?.trim() ?? '';
        if (!target) {
          const available = listCraftableRecipes(player.inventory);
          if (available.length === 0) {
            get().appendLog(
              'arbiter',
              `The Arbiter glances at your pack. "Nothing fits together yet. Keep hunting — Tartaria gives up its pieces slowly."`,
            );
          } else {
            const names = available.slice(0, 4).map((r) => r.result).join(', ');
            get().appendLog(
              'arbiter',
              `The Arbiter looks over your materials. "You have the pieces for: ${names}. Say 'craft ' and one of those names."`,
            );
          }
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
        set((s) => ({
          player: s.player ? { ...s.player, inventory: [...remaining, crafted] } : s.player,
        }));
        get().appendLog('reward', `✦ Crafted ${recipe.result}. The Arbiter watches you set the last piece.`);
        break;
      }
    }

    if (!get().pendingRolls) {
      const lastCog = get().cognitiveLastResponse;
      const mood = lastCog?.inferredEmotions[0];
      const recentActions = get()
        .gameLog.filter((e) => e.channel === 'player')
        .slice(-3)
        .map((e) => e.text);
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
        const template = buildArbiterRemark({
          location: currentScene.location,
          hazard: currentScene.hazard,
          enemy: liveEnemy,
          intent: parsed.intent,
          mood,
          recentActions,
          unresolvedHooks,
        });
        void narrateViaArbiter(get, set, template);
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
          case 'diplomacy':
            get().appendLog('world', 'Your words find purchase. Something in this place is listening.');
            break;
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
          case 'use_relic':
            get().appendLog('world', 'The relic hums in pitch — it recognises your intent.');
            break;
          default:
            get().appendLog('world', 'The action resolves in your favour.');
        }
      } else {
        switch (intent) {
          case 'stealth':
            get().appendLog('world', 'Your foot scrapes stone. Something stirs in the dark.');
            break;
          case 'diplomacy':
            get().appendLog('world', 'Your words hang unanswered. The silence has heard better arguments.');
            break;
          case 'escape':
            get().appendLog('world', 'The way is longer than you remembered. You circle back, breathing hard.');
            break;
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
        get().appendLog('arbiter', buildArbiterRemark({ location: currentScene.location, hazard: currentScene.hazard }));
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

    if (attack?.success) {
      const rawDmg = damage?.total ?? rollDie(6);
      const barehand = isBareHandAttack(actionText);
      const equipped = barehand ? null : getEquippedWeapon(player);
      // Bare-hand strikes are bludgeoning by default so the player can
      // exploit Aetheric Mutation / Construct / Automation bludgeoning
      // weaknesses without sacrificing their weapon's durability.
      const weaponType = barehand ? 'bludgeoning' : (equipped?.damageType ?? null);
      const mod = applyDamageTypeModifier(rawDmg, weaponType, enemy.type);
      const dmg = mod.damage;
      const prevHp = currentScene.enemyHps[activeIdx] ?? enemy.hp;
      const newEnemyHp = prevHp - dmg;

      // Narrate the resistance/weakness modifier on its own line so the
      // player can see WHY the damage changed.
      if (mod.match === 'weak') {
        get().appendLog('combat', `Weakness exposed — ${enemy.name} flinches. (${weaponType} ×1.5 → ${dmg})`);
      } else if (mod.match === 'resist') {
        get().appendLog('combat', `${enemy.name} shrugs off the ${weaponType}. (resisted, ×0.5 → ${dmg})`);
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
    void get().persist();
  },

  travelTo(locationId) {
    const player = get().player;
    if (!player) return;

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
      },
      worldMemory: discoverLocation(get().worldMemory, locationId),
    });
    get().appendLog('world', `You make your way to ${getLocationById(locationId).name}.`);
    if (hitMilestone) {
      get().appendLog(
        'reward',
        `✦ The road has built you up. +1 max stamina (now ${newStaminaMax}). [${newTravels} travels completed]`,
      );
    }
    get().beginScene();
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
        inventory: [
          ...player.inventory,
          { id: `loot_${Date.now()}`, name: loot, kind: 'misc', quantity: 1, tags: ['loot'] },
        ],
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

    set((s) => {
      if (!s.player || !s.currentScene?.vendor) return s;
      const newOffers = s.currentScene.vendor.offers.filter((o) => o !== offer);
      return {
        player: {
          ...s.player,
          tc: s.player.tc - offer.price,
          inventory: [...s.player.inventory, newItem],
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
    get().appendLog('combat', `Stealth — d20 → ${roll} + DEX ${player.stats.dexterity} = ${total} vs DC ${dc} — ${success ? '✓ HIT' : '✗ CAUGHT'}`);

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
          player: { ...s.player, inventory: [...s.player.inventory, stolen] },
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
    set((s) => ({
      currentScene: s.currentScene ? { ...s.currentScene, vendor: null } : s.currentScene,
    }));
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
    if (!scene?.vendor || !scene.vendor.faction) {
      get().appendLog('arbiter', `The Arbiter shrugs. "No faction agent here to take a contract from."`);
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
    set((s) =>
      s.player
        ? {
            player: {
              ...s.player,
              activeFactionQuestIds: [...(s.player.activeFactionQuestIds ?? []), quest.id],
            },
          }
        : s,
    );
    get().appendLog(
      'reward',
      `New faction contract — ${quest.title}. ${quest.objective} (${scene.vendor.faction.replace(/_/g, ' ')})`,
    );
    void get().persist();
  },

  turnInFactionQuest(titleOrId) {
    const state = get();
    const player = state.player;
    const scene = state.currentScene;
    if (!player) return;
    if (!scene?.vendor || !scene.vendor.faction) {
      get().appendLog('arbiter', `The Arbiter waves. "Find a faction agent before you can turn that in."`);
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
    if (!scene?.vendor) {
      get().appendLog('arbiter', `The Arbiter shakes their head. "Hunts come from people. Find someone first."`);
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
    // Play the first stage immediately so the player has narrative momentum.
    const stage0 = hunt.stages[0];
    if (stage0) {
      get().appendLog('reward', `✦ Hunt accepted — ${hunt.title}. ${hunt.posterText}`);
      get().appendLog('world', stage0.narration);
      if (stage0.arbiter) get().appendLog('arbiter', stage0.arbiter);
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
    if (!scene?.vendor) {
      get().appendLog('arbiter', `The Arbiter shakes their head. "Mystery work needs a buyer. Find a vendor."`);
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
    const stage0 = m.stages[0];
    if (stage0) {
      get().appendLog('reward', `✦ Mystery accepted — ${m.title}. ${m.posterText}`);
      get().appendLog('world', stage0.narration);
      if (stage0.arbiter) get().appendLog('arbiter', stage0.arbiter);
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
    if (!scene?.vendor?.faction) {
      get().appendLog('arbiter', `The Arbiter shakes their head. "Storylines come from faction agents. Find one."`);
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
    const stage0 = s.stages[0];
    if (stage0) {
      get().appendLog('reward', `✦ Storyline accepted — ${s.title}. ${s.posterText}`);
      get().appendLog('world', stage0.narration);
      if (stage0.arbiter) get().appendLog('arbiter', stage0.arbiter);
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
    set((s) => (s.player ? { player: { ...s.player, mapX: step.x, mapY: step.y } } : s));
    if (step.landedOn && step.landedOn.locationId !== player.currentLocationId) {
      get().appendLog('world', `You walk ${dir}. You arrive at ${step.landedOn.locationName}.`);
      get().travelTo(step.landedOn.locationId);
      return;
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
      get().appendLog('world', `You walk ${dir}. The ground here looks much like the ground behind you. You have lost track of distance.`);
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
    const next = (get().tutorialStep ?? 0) + 1;
    // 11 steps total — index 10 is the final one. Past that, end.
    const TOTAL_STEPS = 11;
    if (next >= TOTAL_STEPS) {
      get().skipTutorial();
      return;
    }
    // The vendor tutorial step (index 9) needs a stub vendor in the
    // scene so the real VendorScreen has something to render. Inject one
    // when entering, clear it when leaving.
    if (next === 9) {
      const vendor = pickRandomVendor();
      set({ tutorialDemoVendor: vendor });
      set((s) => (s.currentScene
        ? { currentScene: { ...s.currentScene, vendor }, tutorialStep: next }
        : { tutorialStep: next }));
      return;
    }
    // If leaving the vendor step (10 follows 9), strip the demo vendor.
    if (get().tutorialStep === 9) {
      set((s) => (s.currentScene
        ? { currentScene: { ...s.currentScene, vendor: null }, tutorialDemoVendor: null, tutorialStep: next }
        : { tutorialDemoVendor: null, tutorialStep: next }));
      return;
    }
    set({ tutorialStep: next });
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
    // Per-spot lockout — exhaust this patch on a successful dig (and any
    // dig attempt). To dig again the player must move: step direction,
    // travel to a new location, or refresh the scene at a new tile.
    const spotKey = `${player.currentLocationId}:${player.mapX ?? 0}:${player.mapY ?? 0}`;
    if (player.lastDugSpot === spotKey) {
      get().appendLog(
        'arbiter',
        `The Arbiter taps their boot. "You've already turned this patch. Move on — try a few paces north, east, south, or west."`,
      );
      return;
    }
    const { item, score } = bestDigTool(player.inventory);
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
    const newItem: InventoryItem = stampDurability({
      id: `dug_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: found.name,
      kind: lookupCraftedItem(found.name).kind === 'weapon'
        ? 'weapon'
        : lookupCraftedItem(found.name).kind === 'armor'
          ? 'armor'
          : lookupCraftedItem(found.name).kind,
      rarity: found.rarity,
      quantity: 1,
      tags: lookupCraftedItem(found.name).tags,
    });
    set((s) =>
      s.player ? { player: { ...s.player, inventory: [...s.player.inventory, newItem] } } : s,
    );
    get().appendLog(
      'reward',
      `You scrape at the silt with ${toolLabel}. ✦ Recovered ${found.name} (${found.rarity}).`,
    );
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
    set((s) =>
      s.player
        ? {
            player: {
              ...s.player,
              equipped: { ...(s.player.equipped ?? {}), [slot]: item.name },
            },
          }
        : s,
    );
    get().appendLog(
      'world',
      `You equip ${item.name} (${SLOT_LABEL[slot]}).`,
    );
    void get().persist();
  },

  unequipSlot(slot) {
    set((s) =>
      s.player
        ? {
            player: {
              ...s.player,
              equipped: { ...(s.player.equipped ?? {}), [slot]: undefined },
            },
          }
        : s,
    );
    get().appendLog('world', `You set aside what was in your ${SLOT_LABEL[slot]} slot.`);
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

  skipCognitiveBoot() {
    set({ cognitiveStatus: 'skipped' });
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

  skipQwenBoot() {
    set({ qwenStatus: 'skipped' });
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
    const { player, worldMemory, gameLog, currentScreen, activeSlotId } = get();
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
      set((s) => (s.player ? { player: { ...s.player, inventory: [...s.player.inventory, item] } } : s));
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
  // One world log entry combining the stage's narration + a reward
  // callout when relevant.
  const rewardTail = inlineSummaries.length > 0 ? `  ✦ ${inlineSummaries.join(', ')}.` : '';
  get().appendLog('world', `${outcome.line}${rewardTail}`);
  if (outcome.arbiterLine) get().appendLog('arbiter', outcome.arbiterLine);
  // Advance hook stage / mark resolved.
  set((s) => {
    if (!s.currentScene) return {};
    const nextHooks = (s.currentScene.hooks ?? []).map((h) =>
      h.id === hook.id
        ? { ...h, stage: h.stage + 1, resolved: outcome.done }
        : h,
    );
    return { currentScene: { ...s.currentScene, hooks: nextHooks } };
  });
  // Queue any next-chain hook to plant on the next scene.
  if (outcome.nextChain) {
    set((s) => ({
      worldMemory: {
        ...s.worldMemory,
        pendingChains: [
          ...(s.worldMemory.pendingChains ?? []),
          { kind: outcome.nextChain!.kind, chainId: outcome.nextChain!.chainId },
        ],
      },
    }));
  }
  if (fatal) {
    void Promise.resolve().then(() => handlePlayerDeath(get, set));
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
  const result = wearItemByName(player.inventory, itemName);
  let equipped = player.equipped ?? {};
  if (result.broken && result.brokenName) {
    const next = { ...equipped };
    for (const k of Object.keys(next) as (keyof typeof next)[]) {
      if (next[k] === result.brokenName) next[k] = undefined;
    }
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
    // Bail if the player is dead.
    const livePlayer = get().player;
    if (!livePlayer || livePlayer.hp <= 0 || livePlayer.dead) return;
    applyEnemyCounter(enemy, livePlayer ?? fallbackPlayer, get, set);
  }
}

function applyEnemyCounter(
  enemy: Enemy,
  player: PlayerCharacter,
  get: () => GameStore,
  set: (fn: (s: GameStore) => Partial<GameStore>) => void,
) {
  const atkBonus = parseInt(String(enemy.attack), 10) || 3;
  const atkRoll = rollDie(20);
  const atkTotal = atkRoll + atkBonus;
  // Effective AC = race base + summed armor bonus from head/chest/legs/feet
  // + status modifier (e.g. -2 from armor_severed). Status floor at 1 so a
  // player isn't completely impossible to defend.
  const armorPieces = aggregateArmor(player);
  const acFromGear = player.ac + armorPieces.acBonus;
  const effectiveAc = Math.max(1, acFromGear + statusAcAdjustment(player.statusEffects));
  const hit = atkTotal >= effectiveAc;

  get().appendLog(
    'combat',
    `${enemy.name} — d20 → ${atkRoll} + ATK ${atkBonus} = ${atkTotal} vs your AC ${effectiveAc} — ${hit ? '✓ HIT' : '✗ MISS'}`,
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
      const effects = newEffect
        ? applyEffect(nextPlayer.statusEffects ?? [], newEffect.effect)
        : nextPlayer.statusEffects;
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
function narrateAmbientFind(
  get: () => GameStore,
  set: (fn: (s: GameStore) => Partial<GameStore>) => void,
  scene: CurrentScene,
  noun: string,
): void {
  const lines = [
    `You look closer at the ${noun}. Mud-glazed, undisturbed for a long while.`,
    `You examine the ${noun}. Tartaria has not given up its secrets here.`,
    `You study the ${noun}. The Aetheric haze around them thickens, then settles.`,
    `You inspect the ${noun}. Whatever was here once, this is what remains.`,
    `You crouch beside the ${noun}. The silt has half-swallowed them.`,
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
  const baseLine = pick(CASUAL_LOOK_LINES);
  // 30% chance to plant a typed hook on a casual look, unless one is already
  // active in this scene (don't drown the player in threads).
  const activeUnresolved = (scene.hooks ?? []).some((h) => !h.resolved);
  if (!activeUnresolved && chance(30)) {
    const hook = plantHookByKind(pickRandomHookKind());
    set((s) => (s.currentScene ? { currentScene: { ...s.currentScene, hooks: [...(s.currentScene.hooks ?? []), hook] } } : s));
    get().appendLog('world', `${baseLine}  ${hook.plantedLine}`);
    return;
  }
  get().appendLog('world', baseLine);
}

function narrateWanderingJourney(
  get: () => GameStore,
  set: (fn: (s: GameStore) => Partial<GameStore>) => void,
  scene: CurrentScene,
): void {
  const lead = pick(WANDERING_LEADS);
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

async function narrateViaArbiter(
  get: () => GameStore,
  set: (partial: Partial<GameStore> | ((s: GameStore) => Partial<GameStore>)) => void,
  templateFallback: string,
): Promise<void> {
  const trimmed = (templateFallback ?? '').trim();
  if (!qwen.isReady() || get().isGenerating) {
    if (trimmed) get().appendLog('arbiter', trimmed);
    return;
  }
  const state = get();
  const player = state.player;
  const scene = state.currentScene;
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
  const ctx = buildLlmContext({ player, scene: sceneSlice, gameLog: state.gameLog });
  const messages = buildSystemPrompt(ctx);
  const myEpoch = ++arbiterGenerationEpoch;
  set({ isGenerating: true, partialArbiterText: '' });
  try {
    const text = await qwen.stream(
      messages,
      (token: string) => {
        // Only update the buffer if we're still the active generation.
        if (myEpoch !== arbiterGenerationEpoch) return;
        const current = get().partialArbiterText ?? '';
        set({ partialArbiterText: current + token });
      },
      { maxNewTokens: 120 },
    );
    if (myEpoch !== arbiterGenerationEpoch) return; // cancelled mid-flight
    const finalText = text.trim();
    get().appendLog('arbiter', finalText || trimmed);
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
