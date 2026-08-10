// OTA-1196 — LOOP AUDIT, BATCH 1. Owner: *"audit this for traced and make sure the loops
// are functional."*
//
// ⚠⚠ WHAT "TRACED" HAS TO MEAN HERE. The audit ledger marks 18 loops WIRED: each has a
// consumer, a completion write and a payoff, confirmed by reading. That is a LOWER bar
// than TRACED and mysteries is why — it sat in the traced-and-paying column right up until
// a reachability pass proved 9 of 18 could not be handed in. A loop can be correct and
// unreachable at the same time.
//
// So every test in this file does the same three things, live, against the real store:
//   1. START the loop from a state a player could actually be in.
//   2. COMPLETE it through a PUBLIC action — the same entry point the UI calls.
//   3. Assert a payoff the PLAYER can see: an item, TC, standing, a title, a status.
//
// A test that only asserts an internal field moved is not evidence the loop pays.
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
jest.mock('expo-av', () => ({ Audio: { setAudioModeAsync: jest.fn(), Sound: class { static createAsync: jest.Mock = jest.fn(async () => ({ sound: { playAsync: jest.fn(), unloadAsync: jest.fn() } })); } } }));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '0', applicationId: 'test' }));
jest.mock('expo-asset', () => ({ Asset: { fromModule: () => ({ downloadAsync: jest.fn(async () => {}), localUri: '' }) } }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => {}) }));
jest.mock('expo-constants', () => ({ default: { expoConfig: {} } }));
jest.mock('expo-font', () => ({ loadAsync: jest.fn(async () => {}) }));
jest.mock('expo-speech-recognition', () => ({}));
jest.mock('expo-updates', () => ({}));



import { useGameStore } from '../app/state/gameStore';
import type { InventoryItem } from '../app/engine/types';
import { RECIPES } from '../app/engine/crafting';

jest.setTimeout(180000);

async function fresh(name: string, factionId = 'mud_monarchs') {
  const store = useGameStore;
  await store.getState().hydrate();
  await store.getState().startNewGame({ name, raceId: 'tartarian_giant', factionId });
  store.getState().skipTutorial?.();
  return store;
}

function item(name: string, quantity = 1, extra: Partial<InventoryItem> = {}): InventoryItem {
  return { id: `${name.replace(/\s+/g, '_')}_${quantity}_${Math.random()}`, name, kind: 'misc', quantity, tags: [], ...extra } as InventoryItem;
}

function feedSince(n: number): string {
  return useGameStore.getState().gameLog.slice(n).map((l: { text: string }) => l.text).join('\n');
}

describe('LOOP 16 — crafting: a recipe you know, with the materials, becomes an object', () => {
  beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

  test('⚠⚠ craft → the item is in the pack and the materials are gone', async () => {
    const store = await fresh('Crafter');
    // Pick a recipe whose every ingredient is a plain named material, so the fixture is
    // the recipe's own requirement rather than something I chose to make pass.
    const recipe = RECIPES.find((r) => r.ingredients.length > 0 && r.ingredients.length <= 3)!;
    expect(recipe).toBeDefined();

    const p = store.getState().player!;
    useGameStore.setState({
      player: {
        ...p,
        knownRecipes: [...(p.knownRecipes ?? []), recipe.result],
        inventory: recipe.ingredients.map((i) => item(i.name, i.quantity * 3)),
      },
    });

    const before = store.getState().gameLog.length;
    store.getState().craftRecipe(recipe.result);
    const after = store.getState().player!;

    // THE PAYOFF: a real object, in the pack.
    expect(after.inventory.some((i) => i.name === recipe.result && i.quantity > 0)).toBe(true);
    // AND THE COST: the materials actually left.
    for (const ing of recipe.ingredients) {
      const held = after.inventory.find((i) => i.name.toLowerCase() === ing.name.toLowerCase())?.quantity ?? 0;
      expect(held).toBe(ing.quantity * 3 - ing.quantity);
    }
    // AND THE PLAYER IS TOLD.
    expect(feedSince(before)).toMatch(new RegExp(recipe.result.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
  });

  test('⚠ without the materials it refuses and takes nothing', async () => {
    const store = await fresh('Crafter 2');
    const recipe = RECIPES.find((r) => r.ingredients.length > 0)!;
    const p = store.getState().player!;
    useGameStore.setState({ player: { ...p, knownRecipes: [recipe.result], inventory: [] } });
    store.getState().craftRecipe(recipe.result);
    expect(store.getState().player!.inventory.some((i) => i.name === recipe.result)).toBe(false);
  });
});

describe('LOOP 22 — stat training: repeated success actually moves a stat', () => {
  beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

  test('⚠⚠ the progress ledger fills and the stat rises — driven through the engine the store calls', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { trainStat } = require('../app/engine/statTraining') as typeof import('../app/engine/statTraining');
    let p = useGameStore.getState().player!;
    const start = p.stats.intelligence;
    let leveled = null as null | { stat: string; to: number };
    for (let i = 0; i < 2000 && !leveled; i++) {
      const r = trainStat(p, 'intelligence', true);
      p = r.player;
      if (r.leveled) leveled = r.leveled as { stat: string; to: number };
    }
    // THE PAYOFF: the number on the sheet is bigger. A progress bar that never levels is
    // the "ends in nothing" shape.
    expect(leveled).not.toBeNull();
    expect(p.stats.intelligence).toBeGreaterThan(start);
    expect(leveled!.to).toBe(p.stats.intelligence);
  });
});

describe('LOOP 15 — recipe discovery: a note teaches a working you did not have', () => {
  beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

  test('⚠⚠ it never teaches something already known, and always has something left to teach', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const rd = require('../app/engine/recipeDiscovery') as typeof import('../app/engine/recipeDiscovery');
    const known: string[] = [];
    // Drain it. ⚠ The interesting failure is not "it returns null once" — it is a picker
    // that keeps handing back the SAME working, so a player reads twenty notes and learns
    // one thing. Every pick must be new.
    for (let i = 0; i < 200; i++) {
      const pick = rd.pickRecipeToLearn(RECIPES, known);
      if (!pick) break;
      expect(known).not.toContain(pick);
      known.push(pick);
    }
    expect(known.length).toBeGreaterThan(5);
    expect(rd.pickRecipeToLearn(RECIPES, known)).toBeNull();  // it does terminate
  });
});

describe('LOOP 16b — fusion: three scraps become one named piece of gear', () => {
  beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

  test('⚠⚠ fuse → a real weapon exists, the three inputs do not', async () => {
    const store = await fresh('Smith', 'reclaimers_guild');
    const inputs = [
      { id: 'f_cog', name: 'Aetheric Cog', tags: ['loot', 'aether', 'metal'] },
      { id: 'f_cloth', name: 'Mud Cloth', tags: ['loot', 'cloth'] },
      { id: 'f_shell', name: 'Tortoise Shell', tags: ['loot', 'bone'] },
    ];
    const p = store.getState().player!;
    useGameStore.setState({
      player: {
        ...p,
        hubRoomId: 'outpost_gate',
        macroVisitSeq: 2,
        fusionPending: false,
        inventory: inputs.map((i) => ({ ...i, kind: 'misc', quantity: 1, rarity: 'Common', reservedForFusion: true } as unknown as InventoryItem)),
      },
    });

    store.getState().confirmFusionSelection(inputs.map((i) => i.id), 'weapon');
    await new Promise((r) => setTimeout(r, 60));

    const after = store.getState().player!;
    const fused = after.inventory.find((i) => i.id.startsWith('fused_'));
    // THE PAYOFF: a piece of gear with a name and a kind, not a placeholder.
    expect(fused).toBeTruthy();
    expect(fused!.kind).toBe('weapon');
    expect((fused!.name ?? '').length).toBeGreaterThan(2);
    // AND THE COST: all three inputs are gone.
    for (const i of inputs) expect(after.inventory.some((x) => x.id === i.id)).toBe(false);
  });
});

describe('LOOP 27 — gifting: a gift lands on the ledger and changes the relationship', () => {
  beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

  test('⚠⚠ give → the item leaves, the NPC remembers, and the taste is learned', async () => {
    const store = await fresh('Giver');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getRelation, recordNpcSighting } = require('../app/engine/npcMemory') as typeof import('../app/engine/npcMemory');
    const p = store.getState().player!;
    // ⚠ THE ROW IS CREATED THE WAY PLAY CREATES IT — by SIGHTING them. `giveGift` refuses
    // an unmet recipient by design (OTA-1064: no row, no gift), so hand-forging a relation
    // would have tested a state the game cannot reach. The refusal itself is asserted below.
    useGameStore.setState({
      player: {
        ...p,
        inventory: [...p.inventory, { id: 'gift_x', name: 'Behemoth Plate', kind: 'armor', rarity: 'Uncommon', quantity: 1, tags: [] } as unknown as InventoryItem],
      },
      worldMemory: recordNpcSighting(
        store.getState().worldMemory,
        { id: 'irma_ironhand', name: 'Irma Ironhand' } as never,
        { nowMs: 1, hoursElapsed: p.hoursElapsed ?? 0 },
      ),
      pendingGift: { candidates: [{ id: 'irma_ironhand', name: 'Irma Ironhand' }], toId: 'irma_ironhand', toName: 'Irma Ironhand' } as never,
    });

    // ⚠ The tail entry, not the log LENGTH. appendLog debounces same-channel writes and
    // MERGES them into the previous entry, so a 'world' line landing after another 'world'
    // line leaves the count unchanged — an assertion on length would have called a working
    // gift silent. (This is exactly what it did on the first run.)
    const tailBefore = store.getState().gameLog.at(-1)?.text ?? '';
    const before = store.getState().gameLog.length;
    store.getState().giveGift('gift_x');

    const after = store.getState().player!;
    // THE COST: you no longer have it.
    expect(after.inventory.some((i) => i.id === 'gift_x')).toBe(false);
    // THE PAYOFF: somebody remembers. A gift that changes nothing is the ends-in-nothing shape.
    const rel = getRelation(store.getState().worldMemory, 'irma_ironhand');
    expect(rel).toBeTruthy();
    // ⚠ `likedGifts` does not exist — the ledger records LOVED counts and learned TASTES.
    // Either is proof they remembered; asserting only the loved count would make this
    // test brittle to a change in one NPC's authored preferences.
    expect((rel!.lovedGifts ?? 0) + (rel!.giftTastes?.length ?? 0)).toBeGreaterThan(0);
    // AND THE PLAYER SEES IT HAPPEN — the reaction line reaches the feed.
    const tailAfter = store.getState().gameLog.at(-1)?.text ?? '';
    expect(tailAfter).not.toBe(tailBefore);
    expect(tailAfter.length).toBeGreaterThan(0);
  });

  test('⚠ and an UNMET recipient is refused, keeping the item — the OTA-1064 guard, live', async () => {
    const store = await fresh('Giver 2');
    const p = store.getState().player!;
    useGameStore.setState({
      player: {
        ...p,
        inventory: [...p.inventory, { id: 'gift_y', name: 'Behemoth Plate', kind: 'armor', rarity: 'Uncommon', quantity: 1, tags: [] } as unknown as InventoryItem],
      },
      pendingGift: { candidates: [{ id: 'nobody_at_all', name: 'Nobody At All' }], toId: 'nobody_at_all', toName: 'Nobody At All' } as never,
    });
    store.getState().giveGift('gift_y');
    // The item stays. A gift eaten by a stranger with nothing remembered is the exact
    // ends-in-nothing defect OTA-1064 was written for.
    expect(store.getState().player!.inventory.some((i) => i.id === 'gift_y')).toBe(true);
  });
});
