// OTA-836 — tap-to-explain AC. The Character sheet showed only effectiveAC()
// (race base + scene context) for "Armor Class", silently DROPPING the equipped
// armor's AC — so a plate-armored player read the same number as a naked one.
// effectiveACBreakdown now returns the SAME total the combat resolver stands on
// (base + armor + title + stance), decomposed into labelled sources for the chips.

jest.setTimeout(20000);
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
  makeDirectoryAsync: jest.fn(async () => {}), readAsStringAsync: jest.fn(async () => ''),
  writeAsStringAsync: jest.fn(async () => {}), deleteAsync: jest.fn(async () => {}),
  downloadAsync: jest.fn(async () => ({ uri: '' })), EncodingType: { UTF8: 'utf8', Base64: 'base64' },
}));
jest.mock('expo-speech', () => ({ speak: jest.fn(), stop: jest.fn(), isSpeakingAsync: jest.fn(async () => false) }));
jest.mock('expo-av', () => ({
  Audio: { setAudioModeAsync: jest.fn(), Sound: class { static createAsync = jest.fn(async () => ({ sound: { playAsync: jest.fn(async () => {}), unloadAsync: jest.fn(async () => {}) } })); } },
}));

import { effectiveACBreakdown } from '../app/state/gameStore';
import type { PlayerCharacter, InventoryItem } from '../app/engine/types';

// A fused ("unique") chest piece — self-contained, no catalog lookup needed
// (aggregateArmor reads acBonus straight off uniqueStats for fused items).
const platedChest: InventoryItem = {
  id: 'plate1', name: 'Test Bastion Plate', kind: 'armor', quantity: 1, rarity: 'Rare',
  tags: ['armor', 'chest'],
  uniqueStats: { kind: 'armor', armorSlot: 'chest', acBonus: 5, rarity: 'Rare' },
} as unknown as InventoryItem;

function mkPlayer(over: Partial<PlayerCharacter>): PlayerCharacter {
  return {
    name: 'D', raceId: 'reclaimer', ac: 10,
    stats: { strength: 10, dexterity: 10, intelligence: 10, wisdom: 10, charisma: 10, stealth: 0 },
    hp: 20, hpMax: 20, inventory: [], statusEffects: [], corruption: 0,
    ...over,
  } as unknown as PlayerCharacter;
}

describe('OTA-836 — effectiveACBreakdown surfaces every AC source', () => {
  it('a naked character is just their base AC, no source chips', () => {
    const bd = effectiveACBreakdown(mkPlayer({}), null);
    expect(bd.base).toBe(10);
    expect(bd.total).toBe(10);
    expect(bd.sources).toHaveLength(0);
  });

  it('equipped armor is now COUNTED and shows as an "armor" source (the bug fix)', () => {
    const p = mkPlayer({
      inventory: [platedChest],
      equipped: { chest: 'Test Bastion Plate' } as PlayerCharacter['equipped'],
    });
    const bd = effectiveACBreakdown(p, null);
    // total = base 10 + armor 5. Pre-fix the sheet showed 10 (armor dropped).
    expect(bd.total).toBe(15);
    const armor = bd.sources.find((s) => s.label === 'armor');
    expect(armor?.delta).toBe(5);
  });

  it('an active cover stance folds into the total as a stance/cover source', () => {
    const p = mkPlayer({
      statusEffects: [{ kind: 'in_cover', remainingRounds: 1 }] as PlayerCharacter['statusEffects'],
    });
    const bd = effectiveACBreakdown(p, null);
    // in_cover grants +4 AC (statusAcAdjustment).
    expect(bd.total).toBe(14);
    expect(bd.sources.some((s) => s.label === 'stance/cover' && s.delta === 4)).toBe(true);
  });

  it('the total is floored at 1 even under heavy debuffs', () => {
    const p = mkPlayer({
      ac: 1,
      statusEffects: [{ kind: 'armor_severed', remainingRounds: 1 }] as PlayerCharacter['statusEffects'],
    });
    const bd = effectiveACBreakdown(p, null);
    expect(bd.total).toBeGreaterThanOrEqual(1);
  });
});
