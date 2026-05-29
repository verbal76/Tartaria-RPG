// OTA-170 — regression lock for the INT-to-craft gate on runecasters.
// Per the Tartaria Prima spec: "Only characters with an Intelligence
// score of 11 or higher possess the expertise required to craft
// runecasters from recipes." Engine now reads recipe.intRequirement
// and refuses with an Arbiter line when the player's effective INT
// is below the threshold. Other recipes (no intRequirement field)
// pass through with no gate.

jest.setTimeout(15000);

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('onnxruntime-react-native', () => ({
  InferenceSession: { create: jest.fn(async () => ({ run: jest.fn(async () => ({})) })) },
  Tensor: class { constructor(_t: string, _d: unknown, _s: unknown[]) {} },
}));
jest.mock('llama.rn', () => ({
  initLlama: jest.fn(async () => ({ completion: jest.fn(async () => ({ text: '' })), release: jest.fn() })),
  releaseAllLlama: jest.fn(),
}));
jest.mock('react-native-executorch', () => ({}));
jest.mock('expo-file-system', () => ({
  documentDirectory: '/tmp/', cacheDirectory: '/tmp/',
  getInfoAsync: jest.fn(async () => ({ exists: false })),
  makeDirectoryAsync: jest.fn(async () => {}),
  readAsStringAsync: jest.fn(async () => ''),
  writeAsStringAsync: jest.fn(async () => {}),
  deleteAsync: jest.fn(async () => {}),
  downloadAsync: jest.fn(async () => ({ uri: '' })),
  EncodingType: { UTF8: 'utf8', Base64: 'base64' },
}));
jest.mock('expo-speech', () => ({ speak: jest.fn(), stop: jest.fn(), isSpeakingAsync: jest.fn(async () => false) }));
jest.mock('expo-av', () => ({
  Audio: {
    setAudioModeAsync: jest.fn(),
    Sound: class {
      static createAsync = jest.fn(async () => ({ sound: { playAsync: jest.fn(async () => {}), unloadAsync: jest.fn(async () => {}) } }));
    },
  },
}));

import { useGameStore } from '../app/state/gameStore';
import { RECIPES } from '../app/engine/crafting';

async function bootstrap(intelligence: number) {
  await useGameStore.getState().hydrate();
  await useGameStore.getState().startNewGame({
    name: 'CrafterTester',
    raceId: 'reclaimer',
    factionId: 'reclaimers_guild',
  });
  useGameStore.getState().skipTutorial?.();
  // Force the player's INT to the chosen value + seed the recipe
  // materials so the missing-materials gate doesn't fire instead.
  useGameStore.setState((s) => ({
    player: s.player
      ? {
          ...s.player,
          stats: { ...s.player.stats, intelligence },
          inventory: [
            ...s.player.inventory,
            { id: 'casing_1', name: 'Blank Runecaster Casing (Common)', kind: 'misc' as const, rarity: 'Common' as const, quantity: 5, tags: ['runecaster','casing'] },
            { id: 'mud_1', name: 'Aether Mud', kind: 'misc' as const, rarity: 'Common' as const, quantity: 5, tags: ['mud','aether'] },
            { id: 'silk_1', name: 'Spider Silk', kind: 'misc' as const, rarity: 'Common' as const, quantity: 5, tags: ['fiber'] },
          ],
        }
      : s.player,
  }));
}

describe('OTA-170 — INT-to-craft gate on runecaster recipes', () => {
  beforeAll(() => {
    console.log = () => {};
    console.warn = () => {};
    console.error = () => {};
  });

  it('all 15 runecaster recipes carry intRequirement: 11', () => {
    const runecasterRecipes = RECIPES.filter((r) => r.intRequirement !== undefined);
    expect(runecasterRecipes.length).toBeGreaterThanOrEqual(15);
    for (const r of runecasterRecipes) {
      expect(r.intRequirement).toBe(11);
    }
  });

  it('INT 10 player CANNOT craft Flame of Aether (refusal, no item)', async () => {
    await bootstrap(10);
    const invBefore = useGameStore.getState().player!.inventory.length;
    useGameStore.getState().submitPlayerAction('craft Flame of Aether');
    const player = useGameStore.getState().player!;
    const hasFlame = player.inventory.some((i) => i.name === 'Flame of Aether');
    expect(hasFlame).toBe(false);
    // Inventory unchanged (no ingredient consumption either).
    expect(player.inventory.length).toBe(invBefore);
    // Log shows the Arbiter refusal.
    const log = useGameStore.getState().gameLog.slice(-5).map((e) => e.text).join('\n');
    expect(log).toMatch(/INT 11|delicate work/i);
  });

  it('INT 11 player CAN craft Flame of Aether (succeeds)', async () => {
    await bootstrap(11);
    useGameStore.getState().submitPlayerAction('craft Flame of Aether');
    const player = useGameStore.getState().player!;
    const hasFlame = player.inventory.some((i) => i.name === 'Flame of Aether');
    expect(hasFlame).toBe(true);
  });

  it('INT 15 player CAN craft Flame of Aether (succeeds, no false refusal)', async () => {
    await bootstrap(15);
    useGameStore.getState().submitPlayerAction('craft Flame of Aether');
    const player = useGameStore.getState().player!;
    const hasFlame = player.inventory.some((i) => i.name === 'Flame of Aether');
    expect(hasFlame).toBe(true);
  });

  it('non-runecaster recipe (Club) has NO INT gate — INT 1 crafter succeeds', async () => {
    await bootstrap(1);
    // Inject a Stick so missing-materials doesn't fire.
    useGameStore.setState((s) => ({
      player: s.player
        ? { ...s.player, inventory: [...s.player.inventory, { id: 'stick_1', name: 'Stick', kind: 'misc', rarity: 'Common', quantity: 1, tags: [] }] }
        : s.player,
    }));
    useGameStore.getState().submitPlayerAction('craft Club');
    const player = useGameStore.getState().player!;
    const hasClub = player.inventory.some((i) => i.name === 'Club');
    expect(hasClub).toBe(true);
  });
});
