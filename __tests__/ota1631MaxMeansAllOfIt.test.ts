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

// ⚠⚠⚠ OTA-1631 — MAX MEANS ALL OF IT.
//
// Owner's open list #2: *"whenever I hit Max on the craft item I am making it
// makes max and then still is lit, and I look at it again and I can usually
// still make 1 or two. if it's because it's using alternate items when I break
// down things, then it should adjust the max value and give me the new Max."*
//
// Measured against the engine: the count was already substitution-aware — it
// simulates the real drain one craft at a time — but it was CAPPED at twenty
// (MAX_CRAFT_BATCH = 20), and the batch clamped to a hard-coded twenty beside
// it. Thirty sticks: MAX said 20, made 20, and the button stayed lit over the
// ten it never offered. The bound is a safety rail against a runaway loop, not
// a number the player is meant to meet: 99 now, and the batch reads the same
// constant instead of its own copy.

import { useGameStore } from '../app/state/gameStore';
import { getRaces, getFactions } from '../app/engine/character';
import { maxCraftableCount, MAX_CRAFT_BATCH, RECIPES } from '../app/engine/crafting';
import type { InventoryItem } from '../app/engine/types';
import { readFileSync } from 'fs';
import { join } from 'path';

jest.setTimeout(180000);
const store = useGameStore;
const get = () => store.getState();
async function settle(pred: () => boolean, ms = 4000) { const t0 = Date.now(); while (!pred() && Date.now() - t0 < ms) await new Promise((r) => setTimeout(r, 15)); }

const club = RECIPES.find((r) => r.result === 'Club')!;
const sticks = (n: number): InventoryItem[] => [{ id: 'stick-stack', name: 'Stick', kind: 'misc', rarity: 'Common', quantity: n, tags: [] }];
const count = (name: string) => (get().player?.inventory ?? []).filter((i) => i.name === name).reduce((n, i) => n + (i.quantity ?? 0), 0);

describe('OTA-1631 — MAX means all of it', () => {
  it('⚠⚠⚠ THIRTY STICKS, THIRTY CLUBS: the count is no longer capped at twenty', () => {
    expect(maxCraftableCount(club, sticks(30))).toBe(30);
    expect(maxCraftableCount(club, sticks(22))).toBe(22);
    expect(maxCraftableCount(club, sticks(4))).toBe(4);
    expect(MAX_CRAFT_BATCH).toBe(99);
    expect(maxCraftableCount(club, sticks(500))).toBe(99);
  });

  it('⚠⚠ the batch makes what MAX offered — 22 asked, 22 made, nothing left lit', async () => {
    console.log = () => {}; console.warn = () => {}; console.error = () => {};
    await store.getState().hydrate();
    await store.getState().startNewGame({ name: 'Whittler', raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
    store.getState().skipTutorial?.();
    await settle(() => !!store.getState().currentScene);
    const p = get().player!;
    store.setState({
      player: { ...p, inventory: [...p.inventory.filter((i) => i.name !== 'Stick' && i.name !== 'Club'), ...sticks(22)], knownRecipes: Array.from(new Set([...(p.knownRecipes ?? []), 'Club'])) } as never,
      currentScene: { ...get().currentScene!, enemies: [], enemyHps: [], enemyKnockedOut: [], activeEnemyIdx: 0, range: null } as never,
    });
    const offered = maxCraftableCount(club, get().player!.inventory);
    expect(offered).toBe(22);
    const made = get().craftRecipeBatch('Club', offered);
    await new Promise((r) => setTimeout(r, 300));
    expect(made).toBe(22);
    expect(count('Club')).toBe(22);
    expect(count('Stick')).toBe(0);
    // Nothing left to offer — the picker would read 0, the button goes quiet.
    expect(maxCraftableCount(club, get().player!.inventory)).toBe(0);
  });

  it('source pin — one bound, read in both places', () => {
    const slice = readFileSync(join(__dirname, '../app/state/slices/craftingSlice.ts'), 'utf8');
    expect(slice).toContain('const want = Math.max(1, Math.min(Math.floor(count), MAX_CRAFT_BATCH));');
    expect(slice).not.toContain('Math.min(Math.floor(count), 20)');
    const engine = readFileSync(join(__dirname, '../app/engine/crafting.ts'), 'utf8');
    expect(engine).toContain('export const MAX_CRAFT_BATCH = 99;');
  });
});
