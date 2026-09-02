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

// ⚠⚠⚠ OTA-1633 — A BATCH IS ONE ACTION.
//
// Owner, on the bulk-craft tail: *"let's work on this one after my three."*
// craftRecipeBatch used to loop `submitPlayerAction('craft X', { silent })` N
// times — N parser passes, N Arbiter remarks queued, N cognitive evals, N
// persists, N patrol-ambush rolls, N ground checks — with a quiet flag so
// only the last reward line spoke. Twenty-two taps of the whole engine for
// one tap of the thumb.
//
// Now `craft X` carries a count. The guards (unlock, INT, cores, the missing
// list, the Crucible guard, the substitution confirm) run ONCE for the whole
// batch, sized to what the pack can actually pay for; the recipe's cost and
// result are applied N times inside that one action; one reward line says
// how many and, if fewer, why. The confirm prompts remember the count, so a
// "yes" finishes the batch rather than one piece of it.

import { useGameStore } from '../app/state/gameStore';
import { getRaces, getFactions } from '../app/engine/character';
import { maxCraftableCount, RECIPES } from '../app/engine/crafting';
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
const src = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');

async function boot(stickCount: number) {
  console.log = () => {}; console.warn = () => {}; console.error = () => {};
  await store.getState().hydrate();
  await store.getState().startNewGame({ name: 'Whittler', raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
  store.getState().skipTutorial?.();
  await settle(() => !!store.getState().currentScene);
  const p = get().player!;
  store.setState({
    player: { ...p, inventory: [...p.inventory.filter((i) => i.name !== 'Stick' && i.name !== 'Club'), ...sticks(stickCount)], knownRecipes: Array.from(new Set([...(p.knownRecipes ?? []), 'Club'])) } as never,
    currentScene: { ...get().currentScene!, enemies: [], enemyHps: [], enemyKnockedOut: [], activeEnemyIdx: 0, range: null } as never,
  });
}

describe('OTA-1633 — a batch is one action', () => {
  it('⚠⚠⚠ TWENTY-TWO CLUBS, ONE ACTION — one parse, one player line, one reward line', async () => {
    await boot(22);
    const real = get().submitPlayerAction;
    const calls: Array<[string, unknown]> = [];
    store.setState({ submitPlayerAction: (text: string, opts?: unknown) => { calls.push([text, opts]); real(text, opts as never); } } as never);
    try {
      expect(maxCraftableCount(club, get().player!.inventory)).toBe(22);
      const logAt = get().gameLog.length;
      const made = get().craftRecipeBatch('Club', 22);
      await new Promise((r) => setTimeout(r, 200));
      expect(made).toBe(22);
      expect(count('Club')).toBe(22);
      expect(count('Stick')).toBe(0);
      // ONE action through the engine — not twenty-two silent ones.
      expect(calls.length).toBe(1);
      expect(calls[0]![0]).toBe('craft Club');
      expect(calls[0]![1]).toEqual({ craftCount: 22 });
      const added = get().gameLog.slice(logAt);
      expect(added.filter((e) => e.channel === 'player').map((e) => e.text)).toEqual(['craft Club']);
      const rewards = added.filter((e) => e.channel === 'reward' && /Crafted/.test(e.text));
      expect(rewards.length).toBe(1);
      expect(rewards[0]!.text).toContain('Club ×22');
    } finally {
      store.setState({ submitPlayerAction: real } as never);
    }
  });

  it('⚠⚠ asked for more than the pack pays: the batch is sized to the pack and says so', async () => {
    await boot(5);
    const logAt = get().gameLog.length;
    const made = get().craftRecipeBatch('Club', 22);
    await new Promise((r) => setTimeout(r, 200));
    expect(made).toBe(5);
    expect(count('Club')).toBe(5);
    expect(count('Stick')).toBe(0);
    const rewards = get().gameLog.slice(logAt).filter((e) => e.channel === 'reward' && /Crafted/.test(e.text));
    expect(rewards.length).toBe(1);
    expect(rewards[0]!.text).toContain('×5 of 22');
    // Nothing is left to offer — the picker reads 0 and the button goes quiet.
    expect(maxCraftableCount(club, get().player!.inventory)).toBe(0);
  });

  it('⚠⚠ a single craft is unchanged — one piece, the old line', async () => {
    await boot(3);
    const logAt = get().gameLog.length;
    get().craftRecipe('Club');
    await new Promise((r) => setTimeout(r, 100));
    expect(count('Club')).toBe(1);
    expect(count('Stick')).toBe(2);
    const rewards = get().gameLog.slice(logAt).filter((e) => e.channel === 'reward' && /Crafted/.test(e.text));
    expect(rewards.length).toBe(1);
    expect(rewards[0]!.text).toContain('Crafted Club.');
  });

  it('source pin — the count rides the action; the quiet flag and the silent loop are gone; the prompts remember the count', () => {
    const slice = src('app/state/slices/craftingSlice.ts');
    expect(slice).toContain("get().submitPlayerAction(`craft ${recipeName}`, { craftCount: want });");
    expect(slice).not.toContain('silent: true');
    expect(slice).not.toContain('craftBatchQuiet');
    const g = src('app/state/gameStore.ts');
    expect(g).not.toContain('craftBatchQuiet');
    expect(g).toContain('craftCount?: number');
    // the substitution confirm and the Crucible guard re-dispatch the WHOLE batch
    expect(g).toContain("get().submitPlayerAction(`craft ${prompt.recipeResult}`, { craftCount: prompt.count ?? 1 });");
    const inv = src('app/state/slices/inventorySlice.ts');
    expect(inv).toContain('get().craftRecipeBatch(prompt.recipeResult, prompt.craftCount ?? 1);');
    const guard = src('app/engine/crucibleGuard.ts');
    expect(guard).toContain('craftCount?: number;');
  });
});
