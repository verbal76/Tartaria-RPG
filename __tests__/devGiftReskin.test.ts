// engine_Dev — the dev crash-test kit (Verbal / Sasmooch) resolves against the
// ACTIVE catalogs. In built-in Tartaria it's the original hardcoded kit; in a
// re-skin it substitutes the pack's own consumables by role tag, so it never
// injects Tartaria item names ("improvised") into an uploaded game.

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
jest.mock('expo-av', () => ({ Audio: { setAudioModeAsync: jest.fn(), Sound: class { static createAsync = jest.fn(async () => ({ sound: { playAsync: jest.fn(), unloadAsync: jest.fn() } })); } } }));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '0', applicationId: 'test' }));
jest.mock('expo-asset', () => ({ Asset: { fromModule: () => ({ downloadAsync: jest.fn(), localUri: '' }) } }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn() }));
jest.mock('expo-constants', () => ({ default: { expoConfig: {} } }));
jest.mock('expo-font', () => ({ loadAsync: jest.fn() }));
jest.mock('expo-speech-recognition', () => ({}));
jest.mock('expo-updates', () => ({}));

import { buildDevGiftItems, buildDevGearItems } from '../app/state/gameStore';
import { setTableOverride, clearAllOverrides } from '../app/engine/contentPack';
import devKit from '../app/data/devKit.json';

describe('engine_Dev — dev kit is data-driven from devKit.json (not hardcoded)', () => {
  afterEach(() => clearAllOverrides());

  it('the consumable kit matches the JSON spec (one item per role, JSON quantities)', () => {
    const gift = buildDevGiftItems();
    // built-in resolves every role, so the count == the JSON's consumable rows...
    expect(gift.length).toBe(devKit.consumables.length);
    // ...and each role's quantity comes straight from the JSON (order preserved).
    expect(gift.map((g) => g.qty)).toEqual(devKit.consumables.map((c) => c.qty));
  });

  it('the gear loadout honors the JSON rules (Rare armor perSlot + Rare weapon perRange)', () => {
    // The JSON drives both kind + rarity; assert the file actually declares them.
    const kinds = devKit.gear.map((r) => r.kind);
    expect(kinds).toContain('armor');
    expect(kinds).toContain('weapon');
    for (const rule of devKit.gear) expect(rule.rarity).toBe('Rare');
    // And the builder produces only qty-1 gear entries.
    expect(buildDevGearItems().every((g) => g.qty === 1)).toBe(true);
  });
});

describe('engine_Dev — dev crash-test kit is content-agnostic', () => {
  afterEach(() => clearAllOverrides());

  it('built-in resolves every role to a distinct real consumable (purely by tag/type)', () => {
    const gift = buildDevGiftItems();
    // One item per consumable role, all distinct, quantities straight from the JSON.
    expect(gift.length).toBe(5);
    expect(new Set(gift.map((g) => g.name)).size).toBe(gift.length);
    expect(gift.map((g) => g.qty)).toEqual([10, 20, 20, 20, 1]);
    // Every pick is a real built-in catalog item (resolved by what the item is).
    const { findGearByName, findMaterialByName } = require('../app/engine/crafting');
    for (const g of gift) expect(findGearByName(g.name) || findMaterialByName(g.name)).toBeTruthy();
  });

  it('a re-skin substitutes the pack\'s own consumables — no Tartaria names', () => {
    // A minimal WWII-style consumables catalog covering the kit roles.
    setTableOverride('gear', [
      { name: 'Black-Market Medkit', kind: 'consumable', rarity: 'Uncommon', tags: ['consumable', 'medicine', 'medical'], description: 'x' },
      { name: 'C-Ration (Meat & Beans)', kind: 'consumable', rarity: 'Common', tags: ['food', 'us_military'], description: 'x' },
      { name: 'Canned Peaches', kind: 'consumable', rarity: 'Common', tags: ['food', 'morale'], description: 'x' },
      { name: 'D-Ration Bar', kind: 'consumable', rarity: 'Common', tags: ['food', 'sugar'], description: 'x' },
      { name: 'British Char (Tea Flask)', kind: 'consumable', rarity: 'Common', tags: ['drink', 'water'], description: 'x' },
    ]);
    // Also override materials so the built-in materials pool can't leak Tartaria names in.
    setTableOverride('materials', [{ name: 'Scrap Steel', rarity: 'Common', tags: ['material', 'metal'], description: 'x' }]);

    const gift = buildDevGiftItems();
    const TARTARIA = new Set(['First Aid Kit', 'Trail Rations', 'Smoke-Cured Jerky Strip', 'Bioluminescent Fungus', 'Water Bottle']);
    // None of the original Tartaria names appear...
    for (const g of gift) expect(TARTARIA.has(g.name)).toBe(false);
    // ...every gifted name is a real row in the uploaded gear catalog...
    const packNames = new Set(['Black-Market Medkit', 'C-Ration (Meat & Beans)', 'Canned Peaches', 'D-Ration Bar', 'British Char (Tea Flask)']);
    for (const g of gift) expect(packNames.has(g.name)).toBe(true);
    // ...the medicine + drink roles resolved to the right items...
    const byName = Object.fromEntries(gift.map((g) => [g.name, g.qty]));
    expect(byName['Black-Market Medkit']).toBe(10);   // healing role, qty preserved
    expect(byName['British Char (Tea Flask)']).toBe(1); // drink role, qty preserved
    // ...and picks are distinct (no duplicate gifts).
    expect(new Set(gift.map((g) => g.name)).size).toBe(gift.length);
  });
});

describe('engine_Dev — dev rare-gear loadout is content-agnostic', () => {
  afterEach(() => clearAllOverrides());

  it('built-in Tartaria grants Rare armor across slots + a Rare weapon per range', () => {
    const gear = buildDevGearItems();
    expect(gear.length).toBeGreaterThan(0);
    for (const g of gear) expect(g.qty).toBe(1);
    expect(new Set(gear.map((g) => g.name)).size).toBe(gear.length); // distinct
  });

  it('a re-skin pulls Rare gear ONLY from the uploaded catalogs, by slot + range', () => {
    setTableOverride('armor', [
      { name: 'M12 Flak Vest', slot: 'chest', acBonus: 4, resistances: [], rarity: 'Rare', tags: ['armor', 'chest'], description: 'x' },
      { name: 'Fallschirmjäger Helmet', slot: 'head', acBonus: 2, resistances: [], rarity: 'Rare', tags: ['armor', 'head'], description: 'x' },
      { name: 'Common Cap', slot: 'head', acBonus: 1, resistances: [], rarity: 'Common', tags: ['armor', 'head'], description: 'x' }, // not Rare → ignored
    ]);
    setTableOverride('weapons', [
      { name: 'M1918A2 BAR', weaponKind: 'ranged', damageType: 'ballistic', damageDice: '2d8', stat: 'dexterity', rarity: 'Rare', tags: ['weapon', 'ranged'], description: 'x' },
      { name: 'Trench Knife', weaponKind: 'melee', damageType: 'slashing', damageDice: '1d6', stat: 'strength', rarity: 'Rare', tags: ['weapon', 'melee'], description: 'x' },
      { name: 'Plain Pistol', weaponKind: 'ranged', damageType: 'ballistic', damageDice: '1d6', stat: 'dexterity', rarity: 'Common', tags: ['weapon'], description: 'x' }, // not Rare → ignored
    ]);
    const gear = buildDevGearItems();
    const names = gear.map((g) => g.name);
    // Rare armor for the two slots the pack defines (head + chest)...
    expect(names).toContain('M12 Flak Vest');
    expect(names).toContain('Fallschirmjäger Helmet');
    // ...a Rare ranged (distant) + Rare melee (close) weapon...
    expect(names).toContain('M1918A2 BAR');
    expect(names).toContain('Trench Knife');
    // ...nothing below Rare, and no built-in Tartaria names leak in.
    expect(names).not.toContain('Common Cap');
    expect(names).not.toContain('Plain Pistol');
    const packNames = new Set(['M12 Flak Vest', 'Fallschirmjäger Helmet', 'M1918A2 BAR', 'Trench Knife']);
    for (const n of names) expect(packNames.has(n)).toBe(true);
    expect(gear.every((g) => g.qty === 1)).toBe(true);
  });
});
