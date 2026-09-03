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

// ⚠⚠⚠ OTA-1639 — EVERY INGREDIENT EXISTS, AND EVERY INGREDIENT CAN BE HAD.
//
// Owner: *"is an aetherstone heart a material in the list? run a full audit of
// all the crafting recipes in the game and make sure all of the materials
// exist"*. The audit: 139 recipes, 60 distinct ingredients. Fifty-nine had a
// hand-authored catalog row; ONE — Leech Mucus, the base of the Poison Vial —
// existed only as the Aetheric Leech's drop name and was synthesised at pickup
// as "A reclaimer's find". It has a row now. Every one of the sixty has at
// least one way into the pack: an enemy's loot list, a forage or dig table,
// container loot, the bonus-drop pool, the starter kit, or another recipe.
//
// This suite is the audit, kept: a recipe that names a material nobody
// authored, or one nothing in the world produces, fails here before it ships.

import { readFileSync } from 'fs';
import { join } from 'path';
import { isInferredItem, findRecipeByResult, MATERIALS } from '../app/engine/crafting';
import recipesJson from '../app/data/items/recipes.json';
import enemiesJson from '../app/data/enemies/enemies.json';
import containerLoot from '../app/data/world/container_loot.json';

const src = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');
type Recipe = { result: string; ingredients: Array<{ name: string; quantity?: number }> };
const RECIPES = (recipesJson as { recipes: Recipe[] }).recipes;
const INGREDIENTS = Array.from(new Set(RECIPES.flatMap((r) => r.ingredients.map((i) => i.name)))).sort();

/** Every name a table in the world can put in the pack. */
function worldSources(): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  const add = (name: string, where: string) => {
    if (!out.has(name)) out.set(name, new Set());
    out.get(name)!.add(where);
  };
  for (const e of enemiesJson as Array<{ name: string; loot?: string[] }>) {
    for (const n of e.loot ?? []) add(n, `enemy:${e.name}`);
  }
  const walk = (o: unknown, where: string): void => {
    if (typeof o === 'string') add(o, where);
    else if (Array.isArray(o)) o.forEach((v) => walk(v, where));
    else if (o && typeof o === 'object') {
      for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
        if (k === 'name' && typeof v === 'string') add(v, where);
        else walk(v, where);
      }
    }
  };
  walk(containerLoot, 'container_loot');
  // The forage / dig / salvage / perch / bonus tables are TypeScript literals;
  // the quoted names in those files are the table.
  for (const f of ['bonusDrops', 'areaSearch', 'digging', 'salvagePools', 'investigationTable', 'perches',
    'climbEncounters', 'elevatedOverlay', 'climbHeight', 'hooks', 'durability', 'sceneNounMaterial', 'aetherTechniques', 'character']) {
    const t = src(`app/engine/${f}.ts`);
    for (const m of t.matchAll(/'([A-Z][A-Za-z\-' ()]+)'/g)) add(m[1]!, `ts:${f}`);
  }
  for (const r of RECIPES) add(r.result, 'recipe');
  return out;
}

describe('OTA-1639 — every recipe ingredient has a catalog row', () => {
  it('⚠⚠⚠ HIS QUESTION: Aetherstone Heart is a material — Legendary, the Aetheric Lich\'s core', () => {
    const row = MATERIALS.find((m) => m.name === 'Aetherstone Heart');
    expect(row).toBeTruthy();
    expect(row!.rarity).toBe('Legendary');
    expect(isInferredItem('Aetherstone Heart')).toBe(false);
    expect(findRecipeByResult('Lich-Heart Pendant')!.ingredients.map((i) => i.name)).toContain('Aetherstone Heart');
  });

  it('⚠⚠⚠ ALL SIXTY: no recipe names an ingredient nobody authored', () => {
    expect(INGREDIENTS.length).toBeGreaterThanOrEqual(60);
    const orphans = INGREDIENTS.filter((n) => isInferredItem(n));
    expect({ orphans }).toEqual({ orphans: [] });
  });

  it('⚠⚠ Leech Mucus — the one that was missing — is a Common alchemy material now', () => {
    const row = MATERIALS.find((m) => m.name === 'Leech Mucus');
    expect(row).toBeTruthy();
    expect(row!.rarity).toBe('Common');
    expect(row!.tags).toEqual(expect.arrayContaining(['organic', 'alchemy', 'poison']));
    expect(findRecipeByResult('Poison Vial')!.ingredients.map((i) => i.name)).toContain('Leech Mucus');
  });

  it('⚠ every recipe result is itself a catalog item', () => {
    const missing = RECIPES.map((r) => r.result).filter((n) => isInferredItem(n));
    expect({ missing }).toEqual({ missing: [] });
  });
});

describe('OTA-1639 — every recipe ingredient can actually be had', () => {
  const sources = worldSources();

  it('⚠⚠⚠ each of the sixty has at least one way into the pack', () => {
    const unreachable = INGREDIENTS.filter((n) => !(sources.get(n)?.size ?? 0));
    expect({ unreachable }).toEqual({ unreachable: [] });
  });

  it('⚠⚠ the boss-only Legendaries each name their one source', () => {
    const one = (n: string) => Array.from(sources.get(n) ?? []).filter((s) => s.startsWith('enemy:'));
    expect(one('Aetherstone Heart')).toEqual(['enemy:Aetheric Lich']);
    expect(one('Throne Shard')).toEqual(['enemy:Hollow King']);
    expect(one('Leech Mucus')).toEqual(['enemy:Aetheric Leech']);
  });

  it('⚠ the Water Bottle is a starter item and refills — not a drop, and not missing', () => {
    expect(Array.from(sources.get('Water Bottle') ?? [])).toContain('ts:character');
  });
});
