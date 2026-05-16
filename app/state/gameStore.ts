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
import { pickWeather, pickHazardForLocation, pickEnemyForLocation, getLocationById } from '../engine/encounter';
import {
  buildOpening,
  buildScene,
  buildArbiterRemark,
  shouldArbiterSpeak,
  buildSoftArbiterFallback,
  buildArbiterSceneIntro,
} from '../engine/narrativeGenerator';
import { parseInput, type ParseContext } from '../engine/parser';
import { rollDie, rollFromNotation, pick, chance } from '../engine/rng';
import { buildCombatSteps, buildSkillSteps } from '../engine/combatRules';
import { CognitiveOrchestrator, type BootStage } from '../ai/CognitiveOrchestrator';
import type { CognitiveResponse, WorldContext, ModelInfo } from '../ai/types';
import locationsData from '../data/locations/locations.json';
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
import { getEquippedWeapon } from '../engine/combatRules';
import { pickRandomVendor, type VendorInstance } from '../engine/vendors';
import { validSlotsForItem, SLOT_LABEL, ARMOR_SLOTS } from '../engine/equipment';
import { stampDurability, wearItemByName, repairCost, repairItem } from '../engine/durability';
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
  enemy: Enemy | null;
  vendor: VendorInstance | null;
  /** Distance from the player to the enemy. Null when no enemy is present. */
  range: CombatRange | null;
}

function collectSceneNouns(scene: CurrentScene): string[] {
  const nouns = [scene.location.name, scene.weather.name];
  if (scene.hazard) nouns.push(scene.hazard.name);
  if (scene.enemy) nouns.push(scene.enemy.name, scene.enemy.type);
  return nouns;
}

export type CognitiveStatus = 'idle' | BootStage | 'failed' | 'skipped';

// Module-level singleton — class instances don't belong in zustand state.
const cognitive = new CognitiveOrchestrator();

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
  currentEnemyHp: number | null;
  pendingRolls: PendingRollState | null;
  hydrated: boolean;

  slots: SlotSummary[];
  activeSlotId: string | null;
  resurrectionGems: number;

  cognitiveStatus: CognitiveStatus;
  cognitiveFraction: number;
  cognitiveError: string | null;
  cognitiveLastResponse: CognitiveResponse | null;
  cognitiveModelInfo: ModelInfo | null;

  hydrate: () => Promise<void>;
  setScreen: (screen: ScreenName) => void;

  refreshSlots: () => Promise<void>;
  loadSlotIntoGame: (slotId: string) => Promise<void>;
  deleteSlotById: (slotId: string) => Promise<void>;
  resurrectSlot: (slotId: string) => Promise<boolean>;

  startNewGame: (input: CreateCharacterInput) => Promise<void>;
  abandonGame: () => Promise<void>;
  saveAndExitToTitle: () => Promise<void>;

  appendLog: (channel: LogChannel, text: string, meta?: Record<string, unknown>) => void;

  beginScene: () => void;
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
  dismissVendor: () => void;
  joinFaction: (factionId: string) => void;
  equipItem: (itemName: string, slot: EquipSlot) => void;
  unequipSlot: (slot: EquipSlot) => void;

  bootCognitive: () => Promise<void>;
  skipCognitiveBoot: () => void;
  shutdownCognitive: () => Promise<void>;
  resumeCognitive: () => Promise<void>;

  persist: () => Promise<void>;
}

const MAX_LOG_IN_MEMORY = 500;

export const useGameStore = create<GameStore>((set, get) => ({
  player: null,
  worldMemory: emptyMemory(),
  gameLog: [],
  currentScreen: 'title',
  currentScene: null,
  currentEnemyHp: null,
  pendingRolls: null,
  hydrated: false,

  slots: [],
  activeSlotId: null,
  resurrectionGems: 0,

  cognitiveStatus: 'idle',
  cognitiveFraction: 0,
  cognitiveError: null,
  cognitiveLastResponse: null,
  cognitiveModelInfo: null,

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
    const saved = await loadSlot(slotId);
    if (!saved || !saved.player) return;
    if (saved.player.dead === true) return; // Dead characters need a Resurrection Gem first.
    await setActiveSlot(slotId);
    set({
      player: backfillPlayer(saved.player),
      worldMemory: saved.worldMemory,
      gameLog: saved.gameLog,
      currentScreen: 'exploration',
      activeSlotId: slotId,
      currentScene: null,
      currentEnemyHp: null,
      pendingRolls: null,
    });
    // Saves don't store the scene; generate a fresh one so the player can
    // immediately interact with the exploration screen.
    get().beginScene();
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
      currentEnemyHp: null,
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
        ? { player: null, gameLog: [], currentScene: null, currentEnemyHp: null, pendingRolls: null }
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
      currentEnemyHp: null,
      pendingRolls: null,
      activeSlotId: slotId,
    });
    get().appendLog('system', `${player.name} steps into Tartaria.`);
    get().appendLog('world', buildOpening());
    get().beginScene();
    await get().persist();
    const slots = await listSlots();
    set({ slots });
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
      currentEnemyHp: null,
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

  beginScene() {
    const { player, worldMemory } = get();
    if (!player) return;
    const location = getLocationById(player.currentLocationId);
    const weather = pickWeather(worldMemory);
    const hazard = pickHazardForLocation(location);
    const enemy = pickEnemyForLocation(location);
    // Vendor only appears in peaceful scenes (no enemy). ~22% chance.
    const vendor = !enemy && Math.random() < 0.22 ? pickRandomVendor() : null;
    // Enemies start at 'close' range — close enough to be a problem but not
    // already swinging. Players have to advance (or be charged) to land
    // melee, retreat to set up ranged shots.
    const range: CombatRange | null = enemy ? 'close' : null;
    const scene: CurrentScene = { weather, location, hazard, enemy, vendor, range };
    set({ currentScene: scene, currentEnemyHp: enemy?.hp ?? null, pendingRolls: null });
    get().appendLog('world', buildScene({ weather, location, hazard, enemy, quest: player.activeQuests[0] }));
    if (vendor) {
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
      }
    }
    // Arbiter gets two voices on scene entry:
    //   1) ~45% chance — a proactive "scene intro" that gestures at what
    //      to do here. This is the Arbiter actively shaping the story
    //      rather than commenting after the fact.
    //   2) ~25% chance — a reactive remark (mood/intent/location pool).
    // Both can fire in rare cases but the intro tends to anchor first.
    if (chance(45)) {
      get().appendLog(
        'arbiter',
        buildArbiterSceneIntro({
          location,
          enemy,
          player,
          worldMemory: get().worldMemory,
        }),
      );
    } else if (shouldArbiterSpeak()) {
      get().appendLog('arbiter', buildArbiterRemark({ location, hazard, enemy }));
    }
    set((s) => ({
      worldMemory: recordTags(
        recordTags(recordTags(s.worldMemory, weather.tags), location.tags),
        hazard?.tags ?? [],
      ),
    }));
    void get().persist();
  },

  submitPlayerAction(text) {
    const trimmed = text.trim();
    if (!trimmed || get().pendingRolls) return;

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
      enemyPresent: !!currentScene.enemy,
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
          enemy: currentScene.enemy,
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

    switch (parsed.intent) {
      case 'attack': {
        if (currentScene.enemy) {
          // Range check: melee weapons need arm's reach; ranged weapons can
          // hit at close or far; bare hands need arm's reach.
          const range = currentScene.range ?? 'close';
          const reach = playerWeaponReach(player);
          if (!reach.bands.includes(range)) {
            get().appendLog(
              'arbiter',
              `The Arbiter holds up a hand. "${reach.label} cannot reach at ${RANGE_LABEL[range]}. Close the gap, or swap to something with range."`,
            );
            break;
          }
          set({ player: advanceTime(spendStamina(player, STAMINA_COSTS.attack), 0.1) });
          const steps = buildCombatSteps(trimmed, player, currentScene.enemy);
          set({ pendingRolls: { actionText: trimmed, steps, currentStep: 0 } });
          get().appendLog('world', attackOpener(currentScene.enemy.name, parsed.resolvedNoun));
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
        // 2) Targeted look ("examine the locket", "dig up the rubble") — roll.
        if (parsed.resolvedNoun || parsed.resolvedItemId) {
          set({ player: advanceTime(spendStamina(player, STAMINA_COSTS.skillCheck), 0.25) });
          const steps = buildSkillSteps('investigate', player);
          set({ pendingRolls: { actionText: trimmed, steps, currentStep: 0 } });
          break;
        }
        // 3) Generic look-around — no roll, atmospheric narration with optional hook.
        narrateCasualLook(get, currentScene);
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
          set({ player: { ...player, hp: player.hp + heal, inventory: newInventory } });
          const tail = heal > 0
            ? `2d6 → ${heal} HP recovered.`
            : 'You were already at full strength — the ration steadies you, nothing more.';
          get().appendLog('world', `You consume one ${consumable.name}. ${tail}`);
          void get().persist();
        } else {
          get().rest();
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
        const candidate = target
          ? allLocations.find((l) => l.name.toLowerCase().includes(target) || l.id === target)
          : undefined;
        if (candidate) {
          set({ player: advanceTime(spendStamina(player, STAMINA_COSTS.travel), 2) });
          get().travelTo(candidate.id);
        } else {
          set({ player: advanceTime(spendStamina(player, STAMINA_COSTS.wander), 1) });
          narrateWanderingJourney(get, currentScene);
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
          currentScene.enemy
            ? `You drop into a dodging stance. ${currentScene.enemy.name}'s next attack will have to find you.`
            : `You shift your weight, ready to evade. Nothing tests it.`,
        );
        break;
      }
      case 'advance':
      case 'retreat': {
        // Move one band toward or away from the enemy. No-op when there
        // isn't an enemy in the scene.
        if (!currentScene.enemy) {
          get().appendLog('arbiter', `The Arbiter shrugs. "Nothing to advance on. The ground here is quiet."`);
          break;
        }
        const order: CombatRange[] = ['arm', 'close', 'far'];
        const cur = currentScene.range ?? 'close';
        const curIdx = order.indexOf(cur);
        const nextIdx = parsed.intent === 'advance' ? Math.max(0, curIdx - 1) : Math.min(order.length - 1, curIdx + 1);
        const next = order[nextIdx]!;
        if (next === cur) {
          get().appendLog(
            'world',
            parsed.intent === 'advance'
              ? `You are already at arm's reach with ${currentScene.enemy.name}.`
              : `You cannot put more ground between you and ${currentScene.enemy.name}.`,
          );
          break;
        }
        set((s) => (s.currentScene ? { currentScene: { ...s.currentScene, range: next } } : s));
        get().appendLog(
          'world',
          parsed.intent === 'advance'
            ? `You close the gap with ${currentScene.enemy.name}. (range: ${RANGE_LABEL[next]})`
            : `You pull back from ${currentScene.enemy.name}. (range: ${RANGE_LABEL[next]})`,
        );
        // Movement takes a beat — let the enemy counter-attack if they're
        // still in their effective range.
        const stillInReach = enemyCanReach(currentScene.enemy, next);
        if (stillInReach) {
          applyEnemyCounter(currentScene.enemy, player, get, set);
        }
        break;
      }
      case 'ask': {
        // Look up the player's question in the concepts knowledge base. The
        // target text is whatever followed the question verb (the parser
        // strips stopwords like "is", "the", "me", "about" already).
        const lookup = parsed.target ?? parsed.resolvedNoun ?? trimmed;
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
      case 'accept': {
        const target = parsed.target ?? parsed.resolvedNoun ?? '';
        if (!target.trim()) {
          get().appendLog('arbiter', `The Arbiter raises a brow. "Accept what? Ask the agent what is on offer."`);
          break;
        }
        get().acceptFactionQuest(target);
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
        get().turnInFactionQuest(target);
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
        // Targeted craft — try to match recipe and consume materials.
        const recipe = findRecipeByResult(target);
        if (!recipe) {
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

    if (!get().pendingRolls && shouldArbiterSpeak()) {
      const lastCog = get().cognitiveLastResponse;
      const mood = lastCog?.inferredEmotions[0];
      const recentActions = get()
        .gameLog.filter((e) => e.channel === 'player')
        .slice(-3)
        .map((e) => e.text);
      get().appendLog(
        'arbiter',
        buildArbiterRemark({
          location: currentScene.location,
          hazard: currentScene.hazard,
          enemy: currentScene.enemy,
          intent: parsed.intent,
          mood,
          recentActions,
        }),
      );
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
    const { player, currentScene, currentEnemyHp } = get();
    if (!player || !currentScene) return;

    const initiative = steps.find((s) => s.id === 'initiative');
    const attack = steps.find((s) => s.id === 'attack');
    const damage = steps.find((s) => s.id === 'damage');
    const skill = steps.find((s) => s.id === 'skill_check');

    // ── SKILL CHECK ───────────────────────────────────────────────────────
    if (skill) {
      const { intent } = parseInput(actionText);
      if (skill.success) {
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
            if (currentScene.enemy) set((s) => ({ currentScene: s.currentScene ? { ...s.currentScene, enemy: null } : null }));
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
            get().appendLog('world', 'The relic stutters. The connection does not hold.');
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
    if (!currentScene.enemy) { void get().persist(); return; }
    const enemy = currentScene.enemy;

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
      const equipped = getEquippedWeapon(player);
      const weaponType = equipped?.damageType ?? null;
      const mod = applyDamageTypeModifier(rawDmg, weaponType, enemy.type);
      const dmg = mod.damage;
      const prevHp = currentEnemyHp ?? enemy.hp;
      const newEnemyHp = prevHp - dmg;

      // Narrate the resistance/weakness modifier on its own line so the
      // player can see WHY the damage changed.
      if (mod.match === 'weak') {
        get().appendLog('combat', `Weakness exposed — ${enemy.name} flinches. (${weaponType} ×1.5 → ${dmg})`);
      } else if (mod.match === 'resist') {
        get().appendLog('combat', `${enemy.name} shrugs off the ${weaponType}. (resisted, ×0.5 → ${dmg})`);
      }

      // Weapon wear: any successful hit chips one point off the weapon
      // that landed it. Bare hands aren't tracked.
      const weaponInUse = player.equipped?.main ?? player.equipped?.weaponName ?? null;
      if (weaponInUse) {
        set((s) => (s.player ? { player: wearEquippedItem(s.player, weaponInUse, get) } : s));
      }

      if (newEnemyHp <= 0) {
        get().appendLog('combat', attackKill(weaponName, enemy.name, dmg));
        get().resolveEnemyDefeat();
        set({ currentEnemyHp: null });
      } else {
        set({ currentEnemyHp: newEnemyHp });
        get().appendLog('combat', attackHit(weaponName, enemy.name, dmg, newEnemyHp));
        applyEnemyCounter(enemy, get().player ?? player, get, set);
      }
    } else {
      get().appendLog('combat', attackMiss(weaponName, enemy.name));
      applyEnemyCounter(enemy, player, get, set);
    }

    if (shouldArbiterSpeak()) {
      get().appendLog(
        'arbiter',
        buildArbiterRemark({
          location: currentScene.location,
          hazard: currentScene.hazard,
          enemy: get().currentScene?.enemy ?? null,
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
    if (!currentScene?.enemy || !player) return;
    const enemy = currentScene.enemy;
    const loot = enemy.loot[Math.floor(Math.random() * enemy.loot.length)] ?? 'Aether dust';
    get().appendLog('reward', `${enemy.name} defeated. You recover ${loot}.`);

    // Increment lifetime kill count and check for a milestone bump.
    const prevMs = player.milestones ?? { enemiesDefeated: 0, travelsCompleted: 0, checksSucceeded: 0 };
    const newKills = prevMs.enemiesDefeated + 1;
    const hitMilestone = checkMilestone(newKills, MILESTONE_KILL_STEP);
    const newHpMax = hitMilestone ? player.hpMax + 1 : player.hpMax;
    const newHp = hitMilestone ? player.hp + 1 : player.hp;

    set({
      currentScene: { ...currentScene, enemy: null, range: null },
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

  async persist() {
    const { player, worldMemory, gameLog, currentScreen, activeSlotId } = get();
    if (!activeSlotId) return; // No active slot — nothing to write to.
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
    const dmg = resisted.damage;

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

    if (newEffect) {
      const verb = newEffect.isNew ? 'inflicts' : 'refreshes';
      void Promise.resolve().then(() =>
        get().appendLog('combat', `The ${enemyDamageType} ${verb} ${newEffect.effect.label}.`),
      );
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
      currentEnemyHp: null,
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

function narrateCasualLook(get: () => GameStore, _scene: CurrentScene): void {
  const baseLine = pick(CASUAL_LOOK_LINES);
  const hook = chance(30) ? pick(CASUAL_LOOK_HOOKS) : null;
  get().appendLog('world', hook ? `${baseLine}  ${hook}` : baseLine);
}

function narrateWanderingJourney(get: () => GameStore, _scene: CurrentScene): void {
  const lead = pick(WANDERING_LEADS);
  const sighting = pick(FEATURE_SIGHTINGS);
  get().appendLog('world', `${lead}  ${sighting}`);
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
