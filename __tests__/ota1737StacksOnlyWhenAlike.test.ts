/**
 * OTA-1737 (repair 2 of 3) - ITEMS STACK ONLY WHEN THEY ARE ALIKE.
 *
 * PROVEN before the fix: grantItem merged by name + kind and kept the existing
 * row, so a crafted Plague Tonic on a bought stack sold at 36 instead of the 19
 * cap (+17/unit) and a 60 TC bought tonic on a crafted stack was devalued to 19.
 * The invariant, from the owner: items may stack only when every property that
 * affects their future behaviour is stack-compatible - value (selfCrafted,
 * stolen, rarity, tags), usability (reservedForQuest, reservedForFusion), and
 * identity (coating, instanceStats, uniqueStats, golemCore, a forming name).
 */
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
      static createAsync: () => Promise<{ sound: { playAsync: () => void; unloadAsync: () => void } }> =
        jest.fn(async () => ({ sound: { playAsync: jest.fn(), unloadAsync: jest.fn() } }));
    },
  },
}));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '0', applicationId: 'test' }));
jest.mock('expo-asset', () => ({ Asset: { fromModule: () => ({ downloadAsync: jest.fn(async () => {}), localUri: '' }) } }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => {}) }));
jest.mock('expo-constants', () => ({ default: { expoConfig: {} } }));
jest.mock('expo-font', () => ({ loadAsync: jest.fn(async () => {}) }));
jest.mock('expo-speech-recognition', () => ({}));
jest.mock('expo-updates', () => ({}));
// ⚠ Reduce-motion is a real shipped path and it stops RN Animated loops from
// outliving Jest's teardown ("_bezier is not a function" as the graph unloads).
jest.mock('../app/state/accessibility', () => ({
  ...jest.requireActual('../app/state/accessibility'),
  useReduceMotion: () => true,
}));

// ⚠⚠ OTA-1255 — THE OTHER FOUR SCREENS HAD NEVER BEEN RENDERED BY A TEST.


import { useGameStore } from '../app/state/gameStore';
import { getRaces, getFactions } from '../app/engine/character';
import { grantItem, stackCompatible } from '../app/engine/inventory';
import { sellPriceFor } from '../app/engine/sellPrice';
import type { InventoryItem } from '../app/engine/types';
import type { VendorInstance } from '../app/engine/vendors';

jest.setTimeout(240000);
const flush = () => new Promise((r) => setTimeout(r, 0));
const W = (s: string) => process.stdout.write(s + '\n');
const S = () => useGameStore.getState();
const tonic = (over: Partial<InventoryItem> = {}): InventoryItem =>
  ({ id: 't_' + Math.random().toString(36).slice(2, 7), name: 'Plague Tonic', kind: 'consumable', rarity: 'Rare', quantity: 1, tags: ['potion'], ...over } as InventoryItem);
const rows = (name: string) => S().player!.inventory.filter((i) => i.name === name);
const put = (item: Record<string, unknown> | InventoryItem) => { const p = S().player!; useGameStore.setState({ player: { ...p, inventory: [...p.inventory, item] } } as never); };
async function boot(): Promise<void> {
  const st = useGameStore;
  await st.getState().hydrate();
  await st.getState().startNewGame({ name: 'Probe', raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
  st.getState().skipTutorial?.();
  if (st.getState().storyIntro) st.getState().dismissStoryIntro();
  useGameStore.setState({
    player: { ...st.getState().player!, tc: 5000, inventory: [], knownRecipes: ['Plague Tonic'] },
    currentScene: { ...st.getState().currentScene!, vendor: { id: 'v', name: 'Duvo', title: 't', offers: [{ itemName: 'Plague Tonic', price: 60, quantity: 5 }] } as unknown as VendorInstance, enemies: [], enemyHps: [] },
    tutorialStep: null,
  } as never);
  await flush();
}
const ingredients = () => { put({ id: 'ing1', name: 'Disease Sample', kind: 'material', rarity: 'Uncommon', quantity: 1, tags: [] }); put({ id: 'ing2', name: 'Blue Cap Mushroom', kind: 'consumable', rarity: 'Common', quantity: 1, tags: [] }); };

describe('OTA-1737 - the invariant, as a predicate', () => {
  it('⚠⚠⚠ two rows stack only when every behaviour-bearing property agrees', () => {
    const a = tonic();
    expect(stackCompatible(a, tonic())).toBe(true);                                  // positive control
    for (const flag of ['selfCrafted', 'stolen', 'reservedForFusion', 'reservedForQuest', 'materializing'] as const) {
      expect({ flag, ok: stackCompatible(a, tonic({ [flag]: true })) }).toEqual({ flag, ok: false });
      expect({ flag, ok: stackCompatible(tonic({ [flag]: true }), tonic({ [flag]: true })) }).toEqual({ flag, ok: true });  // agree → stack
    }
    expect(stackCompatible(a, tonic({ rarity: 'Common' }))).toBe(false);
    expect(stackCompatible(a, tonic({ tags: ['potion', 'trophy'] }))).toBe(false);
    expect(stackCompatible(a, tonic({ coating: { label: 'X', dice: '1d4', kind: 'acid' } as never }))).toBe(false);
    expect(stackCompatible(a, tonic({ instanceStats: { acBonus: 1 } }))).toBe(false);
    expect(stackCompatible(a, tonic({ golemCore: { power: 1, resilience: 1, bonusHp: 1 } }))).toBe(false);
    expect(stackCompatible(a, tonic({ formingName: 'Something' }))).toBe(false);
  });
  it('⚠⚠ grantItem keeps two mechanically different rows apart, and still merges alike ones', () => {
    const base = [tonic({ id: 'bought', quantity: 1 })];
    const crafted = grantItem(base, tonic({ id: 'crafted', selfCrafted: true }));
    expect(crafted.inventory).toHaveLength(2);
    const alike = grantItem(base, tonic({ id: 'bought2' }));
    expect(alike.inventory).toHaveLength(1);
    expect(alike.inventory[0]!.quantity).toBe(2);
  });
});

describe('OTA-1737 - through the store, both directions', () => {
  it('⚠⚠⚠ crafted → bought stack: the crafted unit keeps its cap; the bought unit keeps its worth', async () => {
    await boot();
    S().buyFromVendor('Plague Tonic', 1); await flush();
    ingredients();
    S().craftRecipe('Plague Tonic'); await flush();
    const r = rows('Plague Tonic');
    expect(r).toHaveLength(2);
    const bought = r.find((i) => !i.selfCrafted)!; const crafted = r.find((i) => i.selfCrafted)!;
    expect(bought.quantity).toBe(1); expect(crafted.quantity).toBe(1);
    W(`  crafted→bought: bought row sells ${sellPriceFor(bought, null, 0)}, crafted row sells ${sellPriceFor(crafted, null, 0)}`);
    expect(sellPriceFor(crafted, null, 0)).toBeLessThan(sellPriceFor(bought, null, 0));
  });
  it('⚠⚠⚠ bought → crafted stack: same two rows, same two prices', async () => {
    await boot();
    ingredients();
    S().craftRecipe('Plague Tonic'); await flush();
    S().buyFromVendor('Plague Tonic', 1); await flush();
    const r = rows('Plague Tonic');
    expect(r).toHaveLength(2);
    expect(r.filter((i) => i.selfCrafted)).toHaveLength(1);
    expect(sellPriceFor(r.find((i) => !i.selfCrafted)!, null, 0)).toBeGreaterThan(sellPriceFor(r.find((i) => i.selfCrafted)!, null, 0));
  });
  it('⚠⚠⚠ save → load does not collapse them', async () => {
    await boot();
    S().buyFromVendor('Plague Tonic', 1); await flush();
    ingredients(); S().craftRecipe('Plague Tonic'); await flush();
    await S().persist();
    await S().loadSlotIntoGame(S().activeSlotId!); await flush(); await flush();
    const r = rows('Plague Tonic');
    expect(r).toHaveLength(2);
    expect(r.map((i) => !!i.selfCrafted).sort()).toEqual([false, true]);
  });
  it('⚠⚠ a quest earmark and a fusion reservation are not swallowed by an unflagged grant', async () => {
    await boot();
    put(tonic({ id: 'saved', reservedForQuest: true }));
    put(tonic({ id: 'forge', reservedForFusion: true }));
    S().buyFromVendor('Plague Tonic', 1); await flush();
    const r = rows('Plague Tonic');
    expect(r).toHaveLength(3);
    expect(r.find((i) => i.id === 'saved')!.reservedForQuest).toBe(true);
    expect(r.find((i) => i.id === 'forge')!.reservedForFusion).toBe(true);
    expect(r.find((i) => i.id === 'saved')!.quantity).toBe(1);
  });
  it('⚠ a stolen unit does not launder onto an honest stack', async () => {
    await boot();
    put(tonic({ id: 'honest' }));
    const g = grantItem(S().player!.inventory, tonic({ id: 'hot', stolen: true }));
    expect(g.inventory.filter((i) => i.name === 'Plague Tonic')).toHaveLength(2);
  });
});
