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
} from '../engine/types';
import { emptyMemory, recordTags, discoverLocation, recordEnemyDefeat } from '../engine/worldMemory';
import { saveGame, loadSave } from '../engine/saveSystem';
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
} from '../engine/narrativeGenerator';
import { parseInput, type ParseContext } from '../engine/parser';
import { rollDie, rollFromNotation, pick, chance } from '../engine/rng';
import { buildCombatSteps, buildSkillSteps } from '../engine/combatRules';
import { CognitiveOrchestrator, type BootStage } from '../ai/CognitiveOrchestrator';
import type { CognitiveResponse, WorldContext, ModelInfo } from '../ai/types';
import locationsData from '../data/locations/locations.json';

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
  };
}

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

  cognitiveStatus: CognitiveStatus;
  cognitiveFraction: number;
  cognitiveError: string | null;
  cognitiveLastResponse: CognitiveResponse | null;
  cognitiveModelInfo: ModelInfo | null;

  hydrate: () => Promise<void>;
  setScreen: (screen: ScreenName) => void;

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

  cognitiveStatus: 'idle',
  cognitiveFraction: 0,
  cognitiveError: null,
  cognitiveLastResponse: null,
  cognitiveModelInfo: null,

  async hydrate() {
    const saved = await loadSave();
    if (saved) {
      // Backfill fields added after the save was written (e.g. stamina).
      const player = saved.player ? backfillPlayer(saved.player) : null;
      set({
        player,
        worldMemory: saved.worldMemory,
        gameLog: saved.gameLog,
        currentScreen: saved.currentScreen,
        hydrated: true,
      });
    } else {
      set({ hydrated: true });
    }
  },

  setScreen(screen) {
    set({ currentScreen: screen });
    void get().persist();
  },

  async startNewGame(input) {
    const player = createCharacter(input);
    const memory = discoverLocation(emptyMemory(), player.currentLocationId);
    set({
      player,
      worldMemory: memory,
      gameLog: [],
      currentScreen: 'exploration',
      currentScene: null,
      currentEnemyHp: null,
      pendingRolls: null,
    });
    get().appendLog('system', `${player.name} steps into Tartaria.`);
    get().appendLog('world', buildOpening());
    get().beginScene();
    await get().persist();
  },

  async abandonGame() {
    set({
      player: null,
      worldMemory: emptyMemory(),
      gameLog: [],
      currentScene: null,
      currentEnemyHp: null,
      pendingRolls: null,
      currentScreen: 'title',
    });
    await get().persist();
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
    if (shouldArbiterSpeak()) {
      get().appendLog('arbiter', buildArbiterRemark({ location, hazard }));
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

    const { player, currentScene } = get();
    if (!player || !currentScene) return;

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
      get().appendLog(
        'arbiter',
        buildSoftArbiterFallback({
          parsed,
          inventory: player.inventory,
          enemy: currentScene.enemy,
          location: currentScene.location,
          hazard: currentScene.hazard,
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
          get().appendLog('world', `You face ${currentScene.enemy.name}. The Aetherstone hums with tension.`);
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

    if (initiative) {
      get().appendLog('world', initiative.success
        ? `You seize the initiative. ${enemy.name} has no time to react.`
        : `${enemy.name} moves first. The pressure is immediate.`);
    }

    if (attack?.success) {
      const dmg = damage?.total ?? rollDie(6);
      const prevHp = currentEnemyHp ?? enemy.hp;
      const newEnemyHp = prevHp - dmg;

      if (newEnemyHp <= 0) {
        get().appendLog('combat', `Your strike finds its mark — ${dmg} damage. ${enemy.name} falls.`);
        get().resolveEnemyDefeat();
        set({ currentEnemyHp: null });
      } else {
        set({ currentEnemyHp: newEnemyHp });
        get().appendLog('combat', `Your strike hits for ${dmg}. ${enemy.name} staggers — ${newEnemyHp} HP remaining. It fights back.`);
        applyEnemyCounter(enemy, player, get, set);
      }
    } else {
      get().appendLog('combat', `Your attack goes wide. ${enemy.name} seizes the opening.`);
      applyEnemyCounter(enemy, player, get, set);
    }

    if (shouldArbiterSpeak()) {
      get().appendLog('arbiter', buildArbiterRemark({ location: currentScene.location, hazard: currentScene.hazard }));
    }
    void get().persist();
  },

  travelTo(locationId) {
    const player = get().player;
    if (!player) return;
    set({
      player: { ...player, currentLocationId: locationId },
      worldMemory: discoverLocation(get().worldMemory, locationId),
    });
    get().appendLog('world', `You make your way to ${getLocationById(locationId).name}.`);
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
    set({
      currentScene: { ...currentScene, enemy: null },
      worldMemory: recordEnemyDefeat(worldMemory, enemy.name),
      player: {
        ...player,
        inventory: [
          ...player.inventory,
          { id: `loot_${Date.now()}`, name: loot, kind: 'misc', quantity: 1, tags: ['loot'] },
        ],
      },
    });
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
    set({ currentScreen: 'title' });
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
    const { player, worldMemory, gameLog, currentScreen } = get();
    await saveGame({
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
  const hit = atkTotal >= player.ac;

  get().appendLog(
    'combat',
    `${enemy.name} — d20 → ${atkRoll} + ATK ${atkBonus} = ${atkTotal} vs your AC ${player.ac} — ${hit ? '✓ HIT' : '✗ MISS'}`,
  );

  if (hit) {
    const dmg = rollFromNotation(String(enemy.damage)) || rollDie(6);
    set((s) => {
      if (!s.player) return {};
      const newHp = Math.max(0, s.player.hp - dmg);
      const msg = newHp <= 0
        ? `${enemy.name} deals ${dmg} damage. You fall. The Aetherstone grows dim around you.`
        : `${enemy.name} deals ${dmg} damage. You have ${newHp} HP remaining.`;
      // Queue the log message — we need it after the set
      void Promise.resolve().then(() => get().appendLog('combat', msg));
      return { player: { ...s.player, hp: newHp } };
    });
  }
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
