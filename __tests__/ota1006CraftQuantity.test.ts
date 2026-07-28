jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('onnxruntime-react-native', () => ({
  InferenceSession: { create: jest.fn(async () => ({ run: jest.fn(async () => ({})) })) },
  Tensor: class { constructor(_t: string, _d: any, _s: any[]) {} },
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
  Audio: { setAudioModeAsync: jest.fn(), Sound: class { static createAsync: any = jest.fn(async () => ({ sound: { playAsync: jest.fn(), unloadAsync: jest.fn() } })); } },
}));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '0', applicationId: 'test' }));
jest.mock('expo-asset', () => ({ Asset: { fromModule: () => ({ downloadAsync: jest.fn(async () => {}), localUri: '' }) } }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => {}) }));
jest.mock('expo-constants', () => ({ default: { expoConfig: {} } }));
jest.mock('expo-font', () => ({ loadAsync: jest.fn(async () => {}) }));
jest.mock('expo-speech-recognition', () => ({}));
jest.mock('expo-updates', () => ({}));

// OTA-1006 — crafting asks HOW MANY instead of "do you want to continue?".
// OTA-264 crafted exactly one per tap and then popped a modal asking whether to
// keep going — a question whose answer was always yes, so ten stews cost twenty
// taps and ten identical prompts. Owner: "assume they always want to continue
// crafting, never close the crafting menu till they hit a back button ... that
// pop-up becomes how many of that item do we want to craft."
import * as fs from 'fs';
import * as path from 'path';
import { useGameStore } from '../app/state/gameStore';
import { getRaces, getFactions } from '../app/engine/character';
import { maxCraftableCount, MAX_CRAFT_BATCH, RECIPES } from '../app/engine/crafting';
import type { InventoryItem } from '../app/engine/types';

const recipeFor = (name: string) => RECIPES.find((r) => r.result === name)!;

/** A pack stocked with exactly `mult` batches of a recipe's ingredients. */
function stockFor(recipeName: string, mult: number): InventoryItem[] {
  const r = recipeFor(recipeName);
  return r.ingredients.map((ing, n) => ({
    id: `stk_${n}`, name: ing.name, kind: 'material', rarity: 'Common',
    quantity: ing.quantity * mult, tags: [],
  } as unknown as InventoryItem));
}

describe('OTA-1006 — craft a count, stay in the menu', () => {
  beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

  it('maxCraftableCount is honest: it simulates the real drain', () => {
    const target = RECIPES.find((r) => r.ingredients.length > 0)!;
    expect(maxCraftableCount(target, [])).toBe(0);
    expect(maxCraftableCount(target, stockFor(target.result, 1))).toBe(1);
    expect(maxCraftableCount(target, stockFor(target.result, 4))).toBe(4);
  });

  it('MAX never runs away — the batch is capped', () => {
    const target = RECIPES.find((r) => r.ingredients.length > 0)!;
    expect(maxCraftableCount(target, stockFor(target.result, 500))).toBe(MAX_CRAFT_BATCH);
    expect(MAX_CRAFT_BATCH).toBeLessThanOrEqual(20);
  });

  it('a batch makes N, spends N, and says so ONCE', async () => {
    const store = useGameStore;
    await store.getState().hydrate();
    await store.getState().startNewGame({ name: 'Cook', raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
    store.getState().skipTutorial?.();
    await new Promise((r) => setTimeout(r, 25));
    const target = RECIPES.find((r) => r.ingredients.length > 0 && r.ingredients.length <= 2)!;
    const p = store.getState().player!;
    store.setState({
      player: {
        ...p,
        knownRecipes: [...(p.knownRecipes ?? []), target.result],
        inventory: [...stockFor(target.result, 3)],
      } as any,
    });
    const before = store.getState().gameLog.length;
    const made = store.getState().craftRecipeBatch(target.result, 3);
    await new Promise((r) => setTimeout(r, 60));
    expect(made).toBeGreaterThan(0);
    const st = store.getState();
    const held = st.player!.inventory.find((i) => i.name === target.result);
    expect(held?.quantity ?? 0).toBe(made);
    // ONE summary line for the whole batch, not one per craft.
    const rewards = st.gameLog.slice(before)
      .filter((e) => e.channel === 'reward' && /Crafted/.test(e.text));
    expect(rewards.length).toBe(1);
    expect(rewards[0]!.text).toContain(`×${made}`);
  });

  it('a batch can never over-consume — it stops when the materials do', async () => {
    const store = useGameStore;
    await store.getState().hydrate();
    await store.getState().startNewGame({ name: 'Cook2', raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
    store.getState().skipTutorial?.();
    await new Promise((r) => setTimeout(r, 25));
    const target = RECIPES.find((r) => r.ingredients.length > 0 && r.ingredients.length <= 2)!;
    const p = store.getState().player!;
    store.setState({
      player: {
        ...p,
        knownRecipes: [...(p.knownRecipes ?? []), target.result],
        inventory: [...stockFor(target.result, 2)], // enough for TWO
      } as any,
    });
    const made = store.getState().craftRecipeBatch(target.result, 10); // ask for TEN
    await new Promise((r) => setTimeout(r, 60));
    expect(made).toBeLessThanOrEqual(2);
    // No negative stacks anywhere — the drain stayed inside what was held.
    for (const i of store.getState().player!.inventory) {
      expect(i.quantity).toBeGreaterThanOrEqual(0);
    }
  });

  it('category lock: the quantity step is wired and the question is retired', () => {
    const rv = fs.readFileSync(path.join(__dirname, '..', 'app', 'components', 'RecipesView.tsx'), 'utf8');
    // Tapping a row asks how many; it no longer crafts on the spot.
    expect(rv).toContain('const handleCraft = (recipe: Recipe) => setQtyFor(recipe);');
    expect(rv).toContain('<CraftQuantityModal');
    expect(rv).toContain('maxCraftableCount(qtyFor, player?.inventory ?? [])');

    const cs = fs.readFileSync(path.join(__dirname, '..', 'app', 'screens', 'CraftingScreen.tsx'), 'utf8');
    // The "CONTINUE CRAFTING / CLOSE MENU" popup is gone — a fading banner
    // replaces it, so the menu is never taken away from the player.
    expect(cs).not.toContain('<CraftResultModal');
    expect(cs).not.toContain("from '../components/CraftResultModal'");
    expect(cs).toContain('styles.craftBanner');

    // The picker itself offers a stepper AND a MAX.
    const qm = fs.readFileSync(path.join(__dirname, '..', 'app', 'components', 'CraftQuantityModal.tsx'), 'utf8');
    expect(qm).toContain('MAX');
    expect(qm).toMatch(/setCount\(capped\)/);
  });
});
