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
} from '../engine/types';
import { emptyMemory, recordTags, discoverLocation, recordEnemyDefeat, completeQuest } from '../engine/worldMemory';
import { saveGame, loadSave } from '../engine/saveSystem';
import { makeEntry, persistEntry } from '../engine/gameLog';
import { createCharacter, type CreateCharacterInput } from '../engine/character';
import { generateQuest } from '../engine/questGenerator';
import { pickWeather, pickHazardForLocation, pickEnemyForLocation, getLocationById } from '../engine/encounter';
import { buildOpening, buildScene, buildArbiterRemark, shouldArbiterSpeak } from '../engine/narrativeGenerator';
import { parseInput } from '../engine/parser';
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
  hydrated: boolean;

  hydrate: () => Promise<void>;
  setScreen: (screen: ScreenName) => void;

  startNewGame: (input: CreateCharacterInput) => Promise<void>;
  abandonGame: () => Promise<void>;

  appendLog: (channel: LogChannel, text: string, meta?: Record<string, unknown>) => void;

  beginScene: () => void;
  submitPlayerAction: (text: string) => void;
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
    set({ currentScene: scene });
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
    if (!trimmed) return;
    const parsed = parseInput(trimmed);
    get().appendLog('player', trimmed, { intent: parsed.intent });

    const { player, currentScene } = get();
    if (!player || !currentScene) return;

    switch (parsed.intent) {
      case 'attack':
        if (currentScene.enemy) {
          get().appendLog('combat', `You strike at the ${currentScene.enemy.name}.`);
          get().resolveEnemyDefeat();
        } else {
          get().appendLog('world', 'Nothing in arm\'s reach answers your blade. The motion echoes off Aetherstone.');
        }
        break;
      case 'stealth':
        get().appendLog('world', 'You move low and quiet. The dust does not rise.');
        break;
      case 'diplomacy':
        get().appendLog('world', 'Your words hang in the dead air. Something — or no one — considers them.');
        break;
      case 'escape':
        get().appendLog('world', 'You break for the entrance. Behind you, the chamber settles back into its waiting.');
        if (currentScene.enemy) set((s) => ({ currentScene: s.currentScene ? { ...s.currentScene, enemy: null } : null }));
        break;
      case 'investigate':
        get().appendLog('world', `You search ${currentScene.location.name}. The Aetherstone reveals little, but you sense a thread to follow.`);
        if (Math.random() < 0.3) {
          const quest = get().generateNewQuest();
          get().appendLog('reward', `New lead: ${quest.objective.verb} ${quest.objective.target} at ${quest.location.name}.`);
        }
        break;
      case 'rest':
        get().rest();
        break;
      case 'cast':
        get().appendLog('world', 'You shape the Aether around your hand. A pale violet glow answers.');
        break;
      case 'use_relic':
        get().appendLog('world', 'You bring a relic forward. Its hum changes pitch.');
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
    get().appendLog('combat', `${enemy.name} falls. You recover ${loot}.`);
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
    const heal = Math.min(player.hpMax - player.hp, 2 + Math.floor(Math.random() * 11));
    set({ player: { ...player, hp: player.hp + heal } });
    get().appendLog('world', `You rest. ${heal} HP recovered.`);
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
