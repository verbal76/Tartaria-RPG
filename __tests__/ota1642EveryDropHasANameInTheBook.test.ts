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

// ⚠⚠⚠ OTA-1642 — EVERY DROP HAS A NAME IN THE BOOK.
//
// The OTA-1639 audit found 98 enemy loot names with no catalog row: they
// dropped, they were playable, and every one was synthesised at pickup by
// inferGear as "A reclaimer's find" with tags guessed from the word. Owner:
// *"author them."* So: 89 materials with rarity from the dropping enemy, 4
// weapons, 4 armours, one food. Every material carries `loot`, because the
// Crucible's OTA-737 door admits an authored 'loot' reagent that feeds no
// recipe — and the owner's whole fodder pool is enemy loot.
//
// This suite is the audit, kept: an enemy loot name that resolves to nothing
// fails here before it ships.

import { readFileSync } from 'fs';
import { join } from 'path';
import { isInferredItem, findCatalogItem, findWeaponByName, findArmorByName, findGearByName, MATERIALS } from '../app/engine/crafting';
import { isForgeReservableItem } from '../app/engine/itemFusion';
import { getItemPreview } from '../app/components/itemPreview';
import enemiesJson from '../app/data/enemies/enemies.json';

const src = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');
const ORPHANS: Record<string, { enemies: Array<[string, string, string, boolean]> }> =
  JSON.parse(src('__tests__/fixtures/ota1642-authored.json'));
const NAMES = Object.keys(ORPHANS);
const LOOT_NAMES = Array.from(new Set((enemiesJson as Array<{ loot?: string[] }>).flatMap((e) => e.loot ?? [])));

describe('OTA-1642 — the audit, kept', () => {
  it('⚠⚠⚠ EVERY enemy loot name resolves to a catalog row — nothing is a "reclaimer\'s find" any more', () => {
    const orphans = LOOT_NAMES.filter((n) => isInferredItem(n));
    expect({ orphans }).toEqual({ orphans: [] });
    expect(LOOT_NAMES.length).toBeGreaterThan(150);
  });

  it('⚠⚠⚠ the 98 the audit named are all authored', () => {
    expect(NAMES).toHaveLength(98);
    for (const n of NAMES) expect({ n, authored: !isInferredItem(n) }).toEqual({ n, authored: true });
  });

  it('⚠⚠ a material\'s rarity is the dropper\'s, and its description is its own — not the inferred filler', () => {
    for (const m of MATERIALS) {
      if (!(m.name in ORPHANS)) continue;
      const droppers = ORPHANS[m.name]!.enemies.map((e) => e[1]);
      expect({ n: m.name, rarity: droppers.includes(m.rarity) }).toEqual({ n: m.name, rarity: true });
      expect(m.description).not.toContain("reclaimer's find");
      expect(m.description.length).toBeGreaterThan(40);
      expect(m.tags).toContain('loot');
    }
  });
});

describe('OTA-1642 — the four rows that are not materials', () => {
  it('⚠⚠ the four weapons are weapons, and pass the OTA-1641 rule', () => {
    for (const n of ['Aether Axe', "Giant's Club", 'Ogre Club', 'Necromancer Staff']) {
      const w = findWeaponByName(n);
      expect({ n, weapon: !!w }).toEqual({ n, weapon: true });
      expect(w!.damageDice).toMatch(/^\dd\d+$/);
    }
    expect(findWeaponByName('Necromancer Staff')!.weaponKind).toBe('runecaster');
  });

  it('⚠⚠ the four armours are armours with a slot and an AC', () => {
    for (const [n, slot] of [['Titan Armor', 'chest'], ['Knight Armor', 'chest'], ['Golem Armor', 'chest'], ['Lich Robe', 'cloak']] as const) {
      const a = findArmorByName(n);
      expect({ n, slot: a?.slot, ac: (a?.acBonus ?? 0) > 0 }).toEqual({ n, slot, ac: true });
    }
    expect(getItemPreview('Titan Armor').stats).toContain('AC +5');
  });

  it('⚠ Crab Meat is food, with a real restore', () => {
    const g = findGearByName('Crab Meat');
    expect(g?.kind).toBe('consumable');
    expect(g?.tags).toContain('food');
    expect(getItemPreview('Crab Meat').stats.join(' ')).toMatch(/HP/);
  });
});

describe('OTA-1642 — the Crucible keeps its fodder', () => {
  it('⚠⚠⚠ a DROPPED authored material (catalog tags + the loot stamp) is still reservable', () => {
    // The drop path stamps `'loot'` onto the catalog tags (gameStore: `[...lootLookup.tags, 'loot']`).
    for (const n of ['Aetheric Cog', 'Worm Mucus', 'Spirit Cloth', 'Shrike Claw', 'Aetheric Moss']) {
      const row = findCatalogItem(n)!;
      const dropped = { name: n, kind: row.kind, tags: [...row.tags, 'loot'] };
      expect({ n, reservable: isForgeReservableItem(dropped) }).toEqual({ n, reservable: true });
    }
  });

  it('⚠⚠ …and an authored weapon, armour or food is not', () => {
    for (const n of ['Aether Axe', 'Titan Armor', 'Crab Meat']) {
      const row = findCatalogItem(n)!;
      expect({ n, reservable: isForgeReservableItem({ name: n, kind: row.kind, tags: [...row.tags, 'loot'] }) }).toEqual({ n, reservable: false });
    }
  });
});
