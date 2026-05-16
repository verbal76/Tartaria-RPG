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
  applyDamageTypeModifier,
  applyArmorResistance,
  type Recipe,
} from '../engine/crafting';
import { getEquippedWeapon } from '../engine/combatRules';

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
  return {
    ...p,
    staminaMax: stamMax,
    stamina: p.stamina ?? stamMax,
    milestones: p.milestones ?? { enemiesDefeated: 0, travelsCompleted: 0, checksSucceeded: 0 },
    equipped: p.equipped ?? {},
  };
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
    const scene: CurrentScene = { weather, location, hazard, enemy };
    set({ currentScene: scene, currentEnemyHp: enemy?.hp ?? null, pendingRolls: null });
    get().appendLog('world', buildScene({ weather, location, hazard, enemy, quest: player.activeQuests[0] }));
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
          set({ player: spendStamina(player, STAMINA_COSTS.attack) });
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
          set({ player: spendStamina(player, STAMINA_COSTS.skillCheck) });
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
        set({ player: spendStamina(player, STAMINA_COSTS.skillCheck) });
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
          set({ player: spendStamina(player, STAMINA_COSTS.travel) });
          get().travelTo(candidate.id);
        } else {
          set({ player: spendStamina(player, STAMINA_COSTS.wander) });
          narrateWanderingJourney(get, currentScene);
        }
        break;
      }
      case 'wait':
        get().appendLog('world', 'You hold still. Tartaria holds still longer.');
        break;
      case 'inventory':
        get().appendLog('system', 'Pack is on the right.');
        break;
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
          const onlyArmor = /armou?r|plate|vest|robe|cloth|mantle|scales|harness/.test(target);
          const onlyWeapon = /blade|sword|wand|rod|stave|bow|gauntlet|spear|cleaver|edge|crown|fist|crossbow/.test(target);
          const newEquipped: { weaponName?: string; armorName?: string } = { ...(player.equipped ?? {}) };
          if (onlyArmor && !onlyWeapon) {
            newEquipped.armorName = undefined;
            get().appendLog('world', `You shrug off your armor.`);
          } else if (onlyWeapon && !onlyArmor) {
            newEquipped.weaponName = undefined;
            get().appendLog('world', `You sheathe your weapon.`);
          } else {
            newEquipped.weaponName = undefined;
            newEquipped.armorName = undefined;
            get().appendLog('world', `You set everything aside. Your hands are empty.`);
          }
          set((s) => ({ player: s.player ? { ...s.player, equipped: newEquipped } : s.player }));
          break;
        }
        // EQUIP path
        const lookup = parsed.resolvedNoun ?? parsed.target ?? '';
        if (!lookup.trim()) {
          get().appendLog(
            'arbiter',
            `The Arbiter raises an eyebrow. "Equip what? Say it by name — a blade, a vest, a rod."`,
          );
          break;
        }
        // Must be in inventory before they can equip it.
        const inInventory = player.inventory.find((i) => i.name.toLowerCase() === lookup.toLowerCase());
        if (!inInventory) {
          get().appendLog(
            'arbiter',
            `The Arbiter glances at your pack. "I do not see any ${lookup.toLowerCase()} on you."`,
          );
          break;
        }
        const weapon = fuzzyFindWeapon(inInventory.name);
        const armor = !weapon ? fuzzyFindArmor(inInventory.name) : null;
        if (!weapon && !armor) {
          get().appendLog(
            'arbiter',
            `The Arbiter frowns. "That is not a thing you can wear or wield."`,
          );
          break;
        }
        const newEquipped: { weaponName?: string; armorName?: string } = { ...(player.equipped ?? {}) };
        if (weapon) {
          newEquipped.weaponName = weapon.name;
          set((s) => ({ player: s.player ? { ...s.player, equipped: newEquipped } : s.player }));
          get().appendLog(
            'world',
            `You take up the ${weapon.name}. ${weapon.damageDice} ${weapon.damageType} — ${weapon.stat.toUpperCase().slice(0, 3)} to hit.`,
          );
        } else if (armor) {
          newEquipped.armorName = armor.name;
          set((s) => ({ player: s.player ? { ...s.player, equipped: newEquipped } : s.player }));
          const resistList = armor.resistances?.length ? ` Resists ${armor.resistances.join(', ')}.` : '';
          get().appendLog('world', `You don the ${armor.name}. +${armor.acBonus} AC.${resistList}`);
        }
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
        const crafted: InventoryItem = {
          id: `crafted_${Date.now()}`,
          name: recipe.result,
          kind: catEntry.kind === 'weapon' || catEntry.kind === 'armor' ? 'misc' : catEntry.kind,
          rarity: catEntry.rarity,
          quantity: 1,
          tags: catEntry.tags,
        };
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

      if (newEnemyHp <= 0) {
        get().appendLog('combat', attackKill(weaponName, enemy.name, dmg));
        get().resolveEnemyDefeat();
        set({ currentEnemyHp: null });
      } else {
        set({ currentEnemyHp: newEnemyHp });
        get().appendLog('combat', attackHit(weaponName, enemy.name, dmg, newEnemyHp));
        applyEnemyCounter(enemy, player, get, set);
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
      currentScene: { ...currentScene, enemy: null },
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

  rest() {
    const player = get().player;
    if (!player) return;
    const hpRoom = player.hpMax - player.hp;
    const stamRoom = player.staminaMax - player.stamina;
    if (hpRoom <= 0 && stamRoom <= 0) {
      get().appendLog(
        'world',
        'You take a moment to settle yourself. The Aetherstone hums steady — you are already as whole as it allows.',
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
      },
    });
    const parts: string[] = [];
    if (heal > 0) parts.push(`2d6 → ${heal} HP`);
    if (stamGain > 0) parts.push(`d6+2 → ${stamGain} stamina`);
    get().appendLog('world', `You rest. ${parts.join(', ')} recovered.`);
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
  // Effective AC includes any equipped armor's acBonus.
  const armor = player.equipped?.armorName ? findArmorByName(player.equipped.armorName) : null;
  const effectiveAc = player.ac + (armor?.acBonus ?? 0);
  const hit = atkTotal >= effectiveAc;

  get().appendLog(
    'combat',
    `${enemy.name} — d20 → ${atkRoll} + ATK ${atkBonus} = ${atkTotal} vs your AC ${effectiveAc} — ${hit ? '✓ HIT' : '✗ MISS'}`,
  );

  if (hit) {
    let rawDmg = rollFromNotation(String(enemy.damage)) || rollDie(6);
    // Detect damage type from the enemy.damage string (e.g. "2D6 Psychic",
    // "1D10 Aetheric"). Falls back to a generic physical class.
    const enemyDamageType = parseIncomingDamageType(String(enemy.damage));
    const resisted = applyArmorResistance(rawDmg, enemyDamageType, armor);
    const dmg = resisted.damage;
    let killed = false;
    set((s) => {
      if (!s.player) return {};
      const newHp = Math.max(0, s.player.hp - dmg);
      killed = newHp <= 0;
      const resistTag = resisted.blocked ? ` (armor halves the ${enemyDamageType})` : '';
      const msg = killed
        ? `${enemy.name} deals ${dmg} damage${resistTag}. You fall.`
        : `${enemy.name} deals ${dmg} damage${resistTag}. You have ${newHp} HP remaining.`;
      void Promise.resolve().then(() => get().appendLog('combat', msg));
      return { player: { ...s.player, hp: newHp } };
    });
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
