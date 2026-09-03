// OTA-1509 — SHIELDS RIDE THE OFF ARM (step 4a of the combat range rework).
//
// ⚠⚠⚠ Owner: *"Shields are supposed to be categorized as a shield as armor
// piece used for offhand"* and *"we're going to need a new shield section in
// the inventory with its own colored bar to collapse"* — color his pick,
// iron indigo (#6f7fae). This OTA is the IDENTITY change: one predicate
// (itemIsShield, the catalog `shield` tag — fifteen rows: ten shields and
// five bucklers) drives the inventory section, the
// equip-slot routing (off hand only), and the load-time back-stamp that
// walks a main-hand shield from an old save onto the off arm. BLOCK and
// SHIELD BASH (step 4b) build on this and ship separately.

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
jest.mock('expo-av', () => ({ Audio: { setAudioModeAsync: jest.fn(), Sound: class { static createAsync: jest.Mock = jest.fn(async () => ({ sound: { playAsync: jest.fn(), unloadAsync: jest.fn() } })); } } }));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '0', applicationId: 'test' }));
jest.mock('expo-asset', () => ({ Asset: { fromModule: () => ({ downloadAsync: jest.fn(async () => {}), localUri: '' }) } }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => {}) }));
jest.mock('expo-constants', () => ({ default: { expoConfig: {} } }));
jest.mock('expo-font', () => ({ loadAsync: jest.fn(async () => {}) }));
jest.mock('expo-speech-recognition', () => ({}));
jest.mock('expo-updates', () => ({}));

import { itemIsShield } from '../app/engine/crafting';
import { validSlotsForItem } from '../app/engine/equipment';
import {
  categorizeItem, CATEGORY_COLORS, CATEGORY_LABEL, CATEGORY_ORDER, groupInventoryByCategory,
} from '../app/components/InventoryCategorize';
import { backfillPlayer } from '../app/state/gameStore';
import type { InventoryItem, PlayerCharacter } from '../app/engine/types';
import weaponsJson from '../app/data/items/weapons.json';

const inst = (name: string, over: Partial<InventoryItem> = {}): InventoryItem => ({
  id: `i_${name.replace(/\W/g, '_')}`, name, kind: 'weapon', quantity: 1, tags: [], ...over,
} as InventoryItem);

const CATALOG_SHIELDS = (weaponsJson as { weapons: Array<{ name: string; tags?: string[] }> }).weapons
  .filter((w) => (w.tags ?? []).some((t) => t.toLowerCase() === 'shield'));

describe('OTA-1509 — one predicate says what a shield is', () => {
  it('⚠⚠⚠ EVERY CATALOG SHIELD ANSWERS TRUE — the named shields AND the bucklers a name-match would have missed', () => {
    // ⚠ OTA-1647 — 15 → 28. The craftable line added 13 rows (targes, pavises,
    // aegises and more bucklers), which is exactly the case this predicate was
    // written for: `itemIsShield` reads the TAG, so a "Splinter Pavise" and an
    // "Aegis of the Deep Cold" answer true without anyone teaching it a name.
    // The count stays exact rather than becoming a floor — it is a ratchet, and
    // a silent drop from 28 to 27 should still fail loudly.
    expect(CATALOG_SHIELDS.length).toBe(28);
    for (const w of CATALOG_SHIELDS) {
      expect({ name: w.name, shield: itemIsShield(inst(w.name)) }).toEqual({ name: w.name, shield: true });
      expect({ name: w.name, cat: categorizeItem(inst(w.name)) }).toEqual({ name: w.name, cat: 'shield' });
    }
  });

  it('⚠⚠ the Aetheric Shield-Hammer is a HAMMER that names a shield — still a weapon', () => {
    expect(itemIsShield(inst('Aetheric Shield-Hammer'))).toBe(false);
    expect(categorizeItem(inst('Aetheric Shield-Hammer'))).toBe('weapon');
    expect(validSlotsForItem(inst('Aetheric Shield-Hammer'))).toEqual(['main', 'off']);
  });

  it('⚠ a sparse-tag save instance resolves through the catalog row', () => {
    // Old saves persisted thin tags; the predicate reaches the catalog by name.
    expect(itemIsShield(inst('Bone Round Shield', { tags: [] }))).toBe(true);
  });
});

describe('OTA-1509 — the off arm, and only the off arm', () => {
  it("⚠⚠⚠ A SHIELD'S ONLY SLOT IS 'off' — the owner's armor-piece ruling", () => {
    for (const w of CATALOG_SHIELDS) {
      expect({ name: w.name, slots: validSlotsForItem(inst(w.name)) }).toEqual({ name: w.name, slots: ['off'] });
    }
  });
});

describe('OTA-1509 — the Shields section', () => {
  it('⚠⚠ iron indigo bar, its own label, seated right after Armor', () => {
    expect(CATEGORY_COLORS.shield).toBe('#6f7fae');
    expect(CATEGORY_LABEL.shield).toBe('Shields');
    expect(CATEGORY_ORDER.indexOf('shield')).toBe(CATEGORY_ORDER.indexOf('armor') + 1);
  });

  it('⚠ the grouper carries the bucket — a mixed pack splits cleanly', () => {
    const groups = groupInventoryByCategory([
      inst('Mud Heater Shield'), inst('Rusted Blade'),
    ]);
    expect(groups.shield.map((i) => i.name)).toEqual(['Mud Heater Shield']);
    expect(groups.weapon.map((i) => i.name)).toEqual(['Rusted Blade']);
  });
});

describe('OTA-1509 — the load-time back-stamp', () => {
  const basePlayer = (over: Record<string, unknown>): PlayerCharacter => ({
    name: 'Stamp', raceId: 'tartarian_giants', hp: 20, hpMax: 20, stamina: 10, staminaMax: 10,
    stats: { strength: 5, dexterity: 5, intelligence: 5, wisdom: 5, charisma: 5, stealth: 1 },
    inventory: [], equipped: {}, ...over,
  } as unknown as PlayerCharacter);

  it('⚠⚠⚠ A MAIN-HAND SHIELD FROM AN OLD SAVE WALKS TO THE FREE OFF HAND', () => {
    const shield = inst('Titan Shield');
    const healed = backfillPlayer(basePlayer({
      inventory: [shield],
      equipped: { main: 'Titan Shield', mainId: shield.id },
    }));
    expect(healed.equipped?.off).toBe('Titan Shield');
    expect(healed.equipped?.offId).toBe(shield.id);
    expect(healed.equipped?.main).toBeUndefined();
  });

  it('⚠⚠ off hand occupied → the shield unequips to the pack, never lost', () => {
    const shield = inst('Titan Shield');
    const blade = inst('Rusted Blade');
    const healed = backfillPlayer(basePlayer({
      inventory: [shield, blade],
      equipped: { main: 'Titan Shield', mainId: shield.id, off: 'Rusted Blade', offId: blade.id },
    }));
    expect(healed.equipped?.main).toBeUndefined();
    expect(healed.equipped?.off).toBe('Rusted Blade'); // the occupant keeps the arm
    expect(healed.inventory.some((i) => i.id === shield.id)).toBe(true); // still owned
  });

  it('⚠ an ordinary main-hand weapon is untouched', () => {
    const blade = inst('Rusted Blade');
    const healed = backfillPlayer(basePlayer({
      inventory: [blade],
      equipped: { main: 'Rusted Blade', mainId: blade.id },
    }));
    expect(healed.equipped?.main).toBe('Rusted Blade');
  });
});
