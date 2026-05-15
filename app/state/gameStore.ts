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
import { rollDie } from '../engine/rng';
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

    const roll10 = (stat: number, statName: string, dc: number): boolean => {
      const die = rollDie(10);
      const total = die + stat;
      const success = total >= dc;
      get().appendLog(
        'system',
        `d10 → ${die}  +  ${statName} ${stat}  =  ${total}  vs DC ${dc}  ${success ? '✓' : '✗'}`,
      );
      return success;
    };

    switch (parsed.intent) {
      case 'attack': {
        if (currentScene.enemy) {
          const dc = currentScene.enemy.abilityPoint;
          const hit = roll10(player.stats.strength, 'STR', dc);
          if (hit) {
            get().appendLog('combat', `You strike at the ${currentScene.enemy.name}. The blow lands true.`);
            get().resolveEnemyDefeat();
          } else {
            get().appendLog('combat', `You swing at the ${currentScene.enemy.name} but the attack goes wide. It holds its ground.`);
          }
        } else {
          get().appendLog('world', 'Nothing in arm\'s reach answers your blade. The motion echoes off Aetherstone.');
        }
        break;
      }
      case 'stealth': {
        const success = roll10(player.stats.dexterity, 'DEX', 10);
        get().appendLog('world', success
          ? 'You move low and quiet. The dust does not rise. Whatever watches does not see you.'
          : 'You try to slip into shadow, but your foot scrapes stone. Something stirs.');
        break;
      }
      case 'diplomacy': {
        const success = roll10(player.stats.charisma, 'CHA', 12);
        get().appendLog('world', success
          ? 'Your words find purchase. The dead air shifts — something in this place is listening.'
          : 'Your words hang unanswered. The silence has heard better arguments.');
        break;
      }
      case 'escape': {
        const success = roll10(player.stats.dexterity, 'DEX', 8);
        if (success) {
          get().appendLog('world', 'You break for the entrance. Behind you the chamber settles back into its waiting.');
          if (currentScene.enemy) set((s) => ({ currentScene: s.currentScene ? { ...s.currentScene, enemy: null } : null }));
        } else {
          get().appendLog('world', 'You bolt, but the way is longer than you remembered. You circle back to where you started, breathing hard.');
        }
        break;
      }
      case 'investigate': {
        const success = roll10(player.stats.intelligence, 'INT', 9);
        if (success) {
          get().appendLog('world', `You search ${currentScene.location.name} carefully. The Aetherstone hums — there is something here.`);
          if (Math.random() < 0.5) {
            const quest = get().generateNewQuest();
            get().appendLog('reward', `New lead: ${quest.objective.verb} ${quest.objective.target} at ${quest.location.name}.`);
          }
        } else {
          get().appendLog('world', `You sweep ${currentScene.location.name} but find only dust and old silence.`);
        }
        break;
      }
      case 'rest':
        get().rest();
        break;
      case 'cast': {
        const success = roll10(player.stats.intelligence, 'INT', 11);
        get().appendLog('world', success
          ? 'You shape the Aether around your hand. A pale violet glow answers, steady and true.'
          : 'The Aether slips through your focus. The glow flickers and dies before it forms.');
        break;
      }
      case 'use_relic': {
        const success = roll10(player.stats.wisdom, 'WIS', 10);
        get().appendLog('world', success
          ? 'You bring a relic forward. Its hum rises in pitch — it recognises your intent.'
          : 'You bring a relic forward. Its hum stutters. The connection does not hold.');
        break;
      }
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
