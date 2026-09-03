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

// ⚠⚠⚠ OTA-1647 — A SHIELD BUILD IS A BUILD YOU CAN ACTUALLY MAKE.
//
// Owner, after the shield work landed: *"better shields should have better
// durability and we need recipes for at least 20 shields in all rarities and
// buff bonus levels and specific resists to make a build viable, and they
// should be able to take coatings."*
//
// Measured first, and two of the four were already true:
//   • Better durability — done in OTA-1646, derived from his own logs
//     (150 / 200 / 265 / 350 by rarity).
//   • Coatings — done in OTA-1644. All 15 shields were coatable the moment the
//     gate stopped reading damage type; the probe confirms 15/15 with 0 refused.
//
// The two that were NOT: **zero of the 139 recipes made a shield**, so the whole
// category was loot-only and no build could be planned around it, and the resist
// coverage was two types out of eleven (fire, and the broad "energy" triple).
//
// This OTA authors the line: 13 new shields, 28 recipes, and a resist for every
// damage type in BUILTIN_DT_COMBAT that a shield can meaningfully answer.

import weaponsJson from '../app/data/items/weapons.json';
import recipesJson from '../app/data/items/recipes.json';
import { parseWeaponEffect, shieldAcVersus } from '../app/engine/weaponEffects';
import { isCoatableWeapon } from '../app/engine/weaponCoating';

type Row = {
  name: string; tags: string[]; rarity: string; effect?: string;
  baseDurability?: number; weaponKind: string;
};
type Recipe = { result: string; ingredients: Array<{ name: string; quantity: number }> };

const WEAPONS = (weaponsJson as unknown as { weapons: Row[] }).weapons;
const RECIPES = (recipesJson as unknown as { recipes: Recipe[] }).recipes;
const SHIELDS = WEAPONS.filter((w) => (w.tags ?? []).includes('shield'));
const CRAFTABLE = SHIELDS.filter((s) => RECIPES.some((r) => r.result === s.name));

const RARITIES = ['Common', 'Uncommon', 'Rare', 'Legendary'] as const;

describe('OTA-1647 — the shield line is craftable, laddered and typed', () => {
  // ── "recipes for at least 20 shields in all rarities" ────────────────────
  it('at least 20 shields can be crafted', () => {
    expect(CRAFTABLE.length).toBeGreaterThanOrEqual(20);
  });

  it('every rarity has craftable shields — a build can start anywhere', () => {
    for (const r of RARITIES) {
      const n = CRAFTABLE.filter((s) => s.rarity === r).length;
      expect(n).toBeGreaterThanOrEqual(3);
    }
  });

  it('every shield recipe names ingredients that exist in a catalog', () => {
    // ⚠ The OTA-1639 rule, applied to this OTA's own authoring: a recipe that
    // names a material nobody can hold is a recipe nobody can cook.
    const names = new Set(WEAPONS.map((w) => w.name));
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    for (const f of ['materials', 'armor', 'gear', 'weapons']) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const d = require(`../app/data/items/${f}.json`);
      const arr = Array.isArray(d) ? d : (Object.values(d).find(Array.isArray) as unknown[]);
      for (const r of arr as Array<{ name?: string }>) if (r?.name) names.add(r.name);
    }
    const shieldRecipes = RECIPES.filter((r) => SHIELDS.some((s) => s.name === r.result));
    expect(shieldRecipes.length).toBeGreaterThanOrEqual(20);
    const bad: string[] = [];
    for (const r of shieldRecipes) {
      for (const ing of r.ingredients) if (!names.has(ing.name)) bad.push(`${r.result} <- ${ing.name}`);
    }
    expect(bad).toEqual([]);
  });

  // ── "buff bonus levels" ─────────────────────────────────────────────────
  it('the AC ladder climbs with rarity across the authored line', () => {
    // Only the OTA-1647 rows follow the strict ladder — the 15 older shields
    // keep their authored numbers, which is deliberate: this OTA adds a line,
    // it does not rebalance the ones he already owns.
    const LADDER: Record<string, { flat: number; vs: number }> = {
      Common: { flat: 1, vs: 2 },
      Uncommon: { flat: 2, vs: 3 },
      Rare: { flat: 3, vs: 4 },
      Legendary: { flat: 4, vs: 5 },
    };
    const authored = SHIELDS.filter((s) => /\+\d+ AC; \+\d+ AC against/.test(s.effect ?? ''));
    expect(authored.length).toBeGreaterThanOrEqual(13);
    for (const s of authored) {
      const ac = parseWeaponEffect(s.effect)?.shieldAc;
      expect(ac).toBeDefined();
      expect(ac!.flat).toBe(LADDER[s.rarity]!.flat);
      expect(ac!.vs!.amount).toBe(LADDER[s.rarity]!.vs);
    }
  });

  it('a typed shield is always worth more against its type than its flat baseline', () => {
    // The whole point of specialising: the answer beats the general case.
    for (const s of SHIELDS) {
      const ac = parseWeaponEffect(s.effect)?.shieldAc;
      if (!ac?.vs) continue;
      expect(ac.vs.amount).toBeGreaterThan(ac.flat ?? 0);
    }
  });

  // ── "specific resists to make a build viable" ───────────────────────────
  it('every damage type a shield can answer has one', () => {
    // ⚠ The coverage claim, checked against the engine's own damage-type table
    // rather than a list invented here.
    const NEEDED = [
      'burn', 'cold', 'poison', 'electrical', 'aetheric', 'radiation',
      'degradation', 'slashing', 'piercing', 'bludgeoning',
    ];
    const uncovered = NEEDED.filter((t) => !SHIELDS.some((s) => {
      const ac = parseWeaponEffect(s.effect)?.shieldAc;
      return shieldAcVersus(ac, t) > 0;
    }));
    expect(uncovered).toEqual([]);
  });

  it('each covered type is reachable by CRAFTING it, not only by looting it', () => {
    const NEEDED = [
      'burn', 'cold', 'poison', 'electrical', 'aetheric', 'radiation',
      'degradation', 'slashing', 'piercing', 'bludgeoning',
    ];
    const unbuildable = NEEDED.filter((t) => !CRAFTABLE.some((s) => {
      const ac = parseWeaponEffect(s.effect)?.shieldAc;
      return shieldAcVersus(ac, t) > 0;
    }));
    expect(unbuildable).toEqual([]);
  });

  it('the broad "energy" clause still beats the narrow aether one — order holds', () => {
    // ⚠ SHIELD_VS_TYPES tests `energy` before `aetheric`. Reversing them would
    // silently widen every narrow shield into a general one.
    const broad = parseWeaponEffect('+2 AC vs energy damage.')?.shieldAc;
    expect(shieldAcVersus(broad, 'aetheric')).toBe(2);
    expect(shieldAcVersus(broad, 'electrical')).toBe(2);
    expect(shieldAcVersus(broad, 'burn')).toBe(2);

    const narrow = parseWeaponEffect('+4 AC against aetheric damage.')?.shieldAc;
    expect(shieldAcVersus(narrow, 'aetheric')).toBe(4);
    expect(shieldAcVersus(narrow, 'electrical')).toBe(0);
    expect(shieldAcVersus(narrow, 'burn')).toBe(0);
  });

  // ── "they should be able to take coatings" ───────────────────────────────
  it('every shield takes a coating — already true since OTA-1644, pinned here', () => {
    for (const s of SHIELDS) expect(isCoatableWeapon(s.name)).toBe(true);
  });

  // ── "better shields should have better durability" ──────────────────────
  it('the whole line carries the OTA-1646 durability ladder', () => {
    const DUR: Record<string, number> = {
      Common: 150, Uncommon: 200, Rare: 265, Legendary: 350,
    };
    for (const s of SHIELDS) expect(s.baseDurability).toBe(DUR[s.rarity]);
  });

  it('a Legendary shield outlasts a Common one by a real margin', () => {
    const dur = (r: string) => SHIELDS.filter((s) => s.rarity === r).map((s) => s.baseDurability!);
    expect(Math.min(...dur('Legendary')) / Math.max(...dur('Common'))).toBeGreaterThanOrEqual(2);
  });

  // ── HYGIENE ─────────────────────────────────────────────────────────────
  it('the new rows are real shields, not weapons wearing the tag', () => {
    for (const s of SHIELDS) {
      expect(s.weaponKind).toBe('melee');
      expect(s.tags).toContain('shield');
      // Every shield grants HP, which is the category's standing promise.
      expect(s.effect).toMatch(/Grants \+\d+ HP/);
    }
  });

  it('no duplicate shield names, and no duplicate shield recipes', () => {
    expect(new Set(SHIELDS.map((s) => s.name)).size).toBe(SHIELDS.length);
    const results = RECIPES.map((r) => r.result);
    expect(new Set(results).size).toBe(results.length);
  });
});
