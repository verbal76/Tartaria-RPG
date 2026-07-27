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

// OTA-989 — the root-cause audit's own findings, locked. Owner: "run a root
// cause analysis of all fixes done in the last 12 hours ... thoroughly test
// everything." Two defects surfaced, both introduced by this session's fixes,
// both the same species those fixes hunted — a proxy standing in for the truth:
//   1. craftRecipeBatch judged success by TOTAL pack quantity, which nets to
//      ZERO for the Club (1 Stick -> 1 Club) — one silent club, made === 0,
//      no summary, per-craft line suppressed.
//   2. travel-by-name still guessed on ambiguous PARTIALS ("camp" names three
//      places, silently walked you to one) while claiming ambiguity refuses.
import * as fs from 'fs';
import * as path from 'path';
import { useGameStore } from '../app/state/gameStore';
import { getRaces, getFactions } from '../app/engine/character';
import { matchLocationByName } from '../app/engine/locationMatch';
import type { InventoryItem } from '../app/engine/types';

const LOCS = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'app', 'data', 'locations', 'locations.json'), 'utf8'),
) as Array<{ id: string; name: string; aliases?: string[] }>;

describe('OTA-989 — audit findings stay fixed', () => {
  beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

  it('THE CLUB: a 1-in-1-out recipe batch counts every craft it makes', async () => {
    const store = useGameStore;
    await store.getState().hydrate();
    await store.getState().startNewGame({ name: 'Whittler', raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
    store.getState().skipTutorial?.();
    await new Promise((r) => setTimeout(r, 25));
    const p = store.getState().player!;
    store.setState({
      player: {
        ...p,
        knownRecipes: [...(p.knownRecipes ?? []), 'Club'],
        inventory: [
          ...p.inventory.filter((i) => i.name !== 'Club' && i.name !== 'Stick'),
          { id: 'stk1', name: 'Stick', kind: 'material', rarity: 'Common', quantity: 3, tags: [] } as unknown as InventoryItem,
        ],
      } as any,
    });
    const before = store.getState().gameLog.length;
    const made = store.getState().craftRecipeBatch('Club', 3);
    await new Promise((r) => setTimeout(r, 60));
    // Pre-fix: made === 0 (loop read net-zero as failure), ONE silent club, no
    // summary line at all. Now: three clubs, counted, one summary.
    expect(made).toBe(3);
    const st = store.getState();
    const clubs = st.player!.inventory.filter((i) => i.name === 'Club')
      .reduce((n, i) => n + (i.quantity ?? 0), 0);
    expect(clubs).toBe(3);
    const sticks = st.player!.inventory.filter((i) => i.name === 'Stick')
      .reduce((n, i) => n + (i.quantity ?? 0), 0);
    expect(sticks).toBe(0);
    const rewards = st.gameLog.slice(before)
      .filter((e) => e.channel === 'reward' && /Crafted Club/.test(e.text));
    expect(rewards.length).toBe(1);
    expect(rewards[0]!.text).toContain('×3');
  }, 30000); // full store boot — cold jest caches have exceeded the 5s default

  it('a normal multi-ingredient batch still works (no regression from the recount)', async () => {
    const store = useGameStore;
    await store.getState().hydrate();
    await store.getState().startNewGame({ name: 'Cook3', raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
    store.getState().skipTutorial?.();
    await new Promise((r) => setTimeout(r, 25));
    // Any recipe with >1 total ingredient quantity exercises the old path too.
    const recipes = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'app', 'data', 'items', 'recipes.json'), 'utf8'));
    const list = Array.isArray(recipes) ? recipes : recipes.recipes;
    const target = list.find((r: any) =>
      (r.ingredients ?? []).reduce((n: number, i: any) => n + (i.quantity ?? 1), 0) > 1
      && (r.ingredients ?? []).length <= 2)!;
    const p = store.getState().player!;
    store.setState({
      player: {
        ...p,
        knownRecipes: [...(p.knownRecipes ?? []), target.result],
        inventory: [
          ...p.inventory.filter((i: any) => i.name !== target.result),
          ...target.ingredients.map((ing: any, n: number) => ({
            id: `ing_${n}`, name: ing.name, kind: 'material', rarity: 'Common',
            quantity: (ing.quantity ?? 1) * 2, tags: [],
          } as unknown as InventoryItem)),
        ],
      } as any,
    });
    const made = store.getState().craftRecipeBatch(target.result, 2);
    await new Promise((r) => setTimeout(r, 60));
    expect(made).toBe(2);
  }, 30000);

  it('AMBIGUOUS PARTIALS refuse: "camp" names three places, so no silent trek', () => {
    // Pre-fix these silently resolved to whichever name was shortest.
    expect(matchLocationByName('camp', LOCS)).toBeNull();
    expect(matchLocationByName('tartarian', LOCS)).toBeNull();
  });

  it('unique partials still resolve — the refusal is surgical', () => {
    expect(matchLocationByName('survey', LOCS)?.name).toBe("Builders' Survey Camp");
    expect(matchLocationByName('pilgrim', LOCS)?.name).toBe('Tartarian Pilgrim Camp');
    expect(matchLocationByName('field camp', LOCS)?.name).toBe('Revivalist Field Camp');
    expect(matchLocationByName('waystation', LOCS)?.name).toBe("The Monarch's Waystation");
  });

  it('the BASE-NAME carve-out: a name embedded in longer names is still intent', () => {
    // "Nimari" lives inside "Red Tower of Nimari"; a fragment reaching both must
    // resolve to the base, not refuse. (Exact "nimari" hits the exact tier; a
    // 5-char fragment exercises the partial tier.)
    const twins = [
      { id: 'nim', name: 'Nimari' },
      { id: 'rt', name: 'Red Tower of Nimari' },
    ];
    expect(matchLocationByName('nimar', twins)?.id).toBe('nim');
    // ...but true siblings that merely SHARE a word still refuse.
    const camps = [
      { id: 'a', name: 'Builders Survey Camp' },
      { id: 'b', name: 'Revivalist Field Camp' },
    ];
    expect(matchLocationByName('camp', camps)).toBeNull();
  });

  it('SOURCE LOCK: the batch counts its result, not the whole pack', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'app', 'state', 'gameStore.ts'), 'utf8');
    expect(src).toContain('.filter((it) => it.name === recipeName)');
    // The lying proxy must not creep back into the batch loop.
    expect(src).not.toMatch(/const before = \(get\(\)\.player\?\.inventory \?\? \[\]\)\.reduce/);
  });

  it('SOURCE LOCK: the partial tier refuses on multi, with only the base-name carve-out', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'app', 'engine', 'locationMatch.ts'), 'utf8');
    expect(src).not.toContain('partials.reduce');
    expect(src).toContain('partials.every((o) => tightKey(o.name).includes(tightKey(l.name)))');
  });
});
