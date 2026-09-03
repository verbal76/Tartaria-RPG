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

// ⚠⚠⚠ OTA-1641 — A WEAPON IS NAMED LIKE A WEAPON.
//
// Owner, reading his own inventory: *"look at the names of the weapons and the
// armor. they should actually be semi descriptive weapon names. like why do I
// have a weapon called a minor repair? that's stupid"* — and then the rule:
// *"let's get a rule in place where the weapon names actually need to sound
// like weapon names."*
//
// Measured: 284 rows in weapons.json, 56 named for what they DO — every
// rune-caster ("Minor Repair", "Force Wave", "Slick Mud", "Mud Army") and the
// Crown of Verdict. Each is now the rune's OBJECT, by rarity: Wand (Common),
// Rod (Uncommon), Stave (Rare), Scepter (Legendary); the Crown is the Scepter
// of Verdict. The rule is a gate (check:weaponnames) with its own self-test,
// and every retired name is a LEGACY_ITEM_RENAMES entry so a save carries
// across — inventory, hands, known recipes.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { WEAPONS, findRecipeByResult } from '../app/engine/crafting';
import { LEGACY_ITEM_RENAMES, applyLegacyItemRenames } from '../app/engine/itemMigrations';
import type { PlayerCharacter } from '../app/engine/types';

const ROOT = join(__dirname, '..');
const src = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const RENAMED: Record<string, string> = JSON.parse(src('__tests__/fixtures/ota1641-renames.json'));
const TIER: Record<string, string> = { Common: 'Wand', Uncommon: 'Rod', Rare: 'Stave', Legendary: 'Scepter' };
// The authored rune-caster recipe rows (data/items/runecasters.json): the row NAME is the result.
const RUNECASTERS: Array<{ name: string }> = JSON.parse(src('app/data/items/runecasters.json'));

describe('OTA-1641 — the rule is a gate', () => {
  it('⚠⚠⚠ check:weaponnames passes on the live catalog (self-test included)', () => {
    const out = execFileSync('node', [join(ROOT, 'scripts/check-weapon-names.mjs')], { encoding: 'utf8' });
    expect(out).toContain('every one named like a weapon');
    expect(src('package.json')).toContain('"check:weaponnames": "node scripts/check-weapon-names.mjs"');
  });

  it('⚠⚠⚠ HIS EXAMPLE: nothing in weapons.json is called "Minor Repair" any more', () => {
    const names = WEAPONS.map((w) => w.name);
    expect(names).not.toContain('Minor Repair');
    expect(names).toContain('Minor Repair Wand');
    for (const old of Object.keys(RENAMED)) expect(names).not.toContain(old);
  });

  it('⚠⚠ every rune-caster wears the object of its rarity — Wand / Rod / Stave / Scepter', () => {
    for (const [old, now] of Object.entries(RENAMED)) {
      const row = WEAPONS.find((w) => w.name === now);
      expect({ old, row: !!row }).toEqual({ old, row: true });
      const want = old === 'Crown of Verdict' ? 'Scepter of Verdict' : `${old} ${TIER[row!.rarity]}`;
      expect({ old, now }).toEqual({ old, now: want });
    }
    expect(Object.keys(RENAMED)).toHaveLength(56);
  });
});

describe('OTA-1641 — a rename is a migration', () => {
  it('⚠⚠⚠ every retired name maps to its new row', () => {
    for (const [old, now] of Object.entries(RENAMED)) {
      expect({ old, to: LEGACY_ITEM_RENAMES[old] }).toEqual({ old, to: now });
    }
  });

  it('⚠⚠⚠ a save holding the old names comes across whole — pack, both hands, known recipes', () => {
    const p = {
      name: 'Cheddar Bob',
      inventory: [
        { id: 'a', name: 'Minor Repair', kind: 'weapon', quantity: 1, tags: ['runecaster'] },
        { id: 'b', name: 'Force Wave', kind: 'weapon', quantity: 1, tags: ['runecaster'] },
        { id: 'c', name: 'Cudgel', kind: 'weapon', quantity: 1, tags: ['weapon'] },
      ],
      equipped: { main: 'Force Wave', mainId: 'b', off: 'Minor Repair', offId: 'a' },
      knownRecipes: ['Sparkstrike', 'Poison Vial'],
    } as unknown as PlayerCharacter;
    const out = applyLegacyItemRenames(p);
    expect(out.inventory.map((i) => i.name)).toEqual(['Minor Repair Wand', 'Force Wave Wand', 'Cudgel']);
    expect(out.equipped).toMatchObject({ main: 'Force Wave Wand', mainId: 'b', off: 'Minor Repair Wand', offId: 'a' });
    expect(out.knownRecipes).toEqual(['Sparkstrike Wand', 'Poison Vial']);
  });

  it('⚠⚠ the recipes that MAKE a rune-caster make the renamed one', () => {
    // ⚠ Measured: runecasters.json has always carried rune rows with no weapons.json
    // row at all (Whispering Flame, Tempest Call …) — a pre-existing orphan set this
    // OTA does not touch. What it pins is narrower: no rune row still wears a retired
    // name, and every rune row that WAS renamed names a catalog weapon.
    const old = new Set(Object.keys(RENAMED));
    const now = new Set(Object.values(RENAMED));
    for (const r of RUNECASTERS) {
      expect({ name: r.name, retired: old.has(r.name) }).toEqual({ name: r.name, retired: false });
      if (now.has(r.name)) expect({ name: r.name, catalog: WEAPONS.some((w) => w.name === r.name) }).toEqual({ name: r.name, catalog: true });
    }
    expect(findRecipeByResult('Sparkstrike Wand')).toBeTruthy();
    // The old word still finds the new object — findRecipeByResult is fuzzy on
    // purpose, so "craft sparkstrike" keeps working after the rename.
    expect(findRecipeByResult('Sparkstrike')!.result).toBe('Sparkstrike Wand');
    expect(findRecipeByResult("Winter's Verdict Scepter")).toBeTruthy();
  });
});
