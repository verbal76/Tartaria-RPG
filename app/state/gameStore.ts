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
import { buildOpening, buildScene, buildArbiterRemark, shouldArbiterSpeak } from '../engine/narrativeGenerator';
import { parseInput } from '../engine/parser';
import { rollDie, rollFromNotation } from '../engine/rng';
import { buildCombatSteps, buildSkillSteps } from '../engine/combatRules';
import locationsData from '../data/locations/locations.json';

const allLocations = locationsData as Location[];

interface CurrentScene {
  weather: WeatherEntry;
  location: Location;
  hazard: Hazard | null;
  enemy: Enemy | null;
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

  hydrate: () => Promise<void>;
  setScreen: (screen: ScreenName) => void;

  startNewGame: (input: CreateCharacterInput) => Promise<void>;
  abandonGame: () => Promise<void>;

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

  async hydrate() {
    const saved = await loadSave();
    if (saved) {
      set({
        player: saved.player,
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

    const parsed = parseInput(trimmed);
    get().appendLog('player', trimmed, { intent: parsed.intent });

    const { player, currentScene } = get();
    if (!player || !currentScene) return;

    switch (parsed.intent) {
      case 'attack': {
        if (currentScene.enemy) {
          const steps = buildCombatSteps(trimmed, player, currentScene.enemy);
          set({ pendingRolls: { actionText: trimmed, steps, currentStep: 0 } });
          get().appendLog('world', `You face ${currentScene.enemy.name}. The Aetherstone hums with tension.`);
        } else {
          get().appendLog('world', 'Nothing in arm\'s reach answers your blade. The motion echoes off Aetherstone.');
        }
        break;
      }
      case 'stealth':
      case 'diplomacy':
      case 'escape':
      case 'investigate':
      case 'cast':
      case 'use_relic': {
        const steps = buildSkillSteps(parsed.intent, player);
        set({ pendingRolls: { actionText: trimmed, steps, currentStep: 0 } });
        break;
      }
      case 'rest':
        get().rest();
        break;
      case 'travel': {
        const target = parsed.target?.toLowerCase() ?? '';
        const candidate = target
          ? allLocations.find((l) => l.name.toLowerCase().includes(target) || l.id === target)
          : undefined;
        if (candidate) {
          get().travelTo(candidate.id);
        } else {
          get().appendLog('world', 'You set off, but the path coils on itself. You return to where you started.');
        }
        break;
      }
      case 'wait':
        get().appendLog('world', 'You hold still. Tartaria holds still longer.');
        break;
      case 'inventory':
        get().appendLog('system', 'Pack is on the right.');
        break;
      default:
        get().appendLog('arbiter', '"I am not certain what you mean by that," the Arbiter says softly.');
    }

    if (!get().pendingRolls && shouldArbiterSpeak()) {
      get().appendLog('arbiter', buildArbiterRemark({ location: currentScene.location, hazard: currentScene.hazard }));
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
            get().appendLog('world', `You search ${currentScene.location.name} carefully. The Aetherstone hums — something is here.`);
            if (Math.random() < 0.5) {
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
    const heal = Math.min(player.hpMax - player.hp, rollDie(6) + rollDie(6));
    set({ player: { ...player, hp: player.hp + heal } });
    get().appendLog('world', `You rest. 2d6 → ${heal} HP recovered.`);
    void get().persist();
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
