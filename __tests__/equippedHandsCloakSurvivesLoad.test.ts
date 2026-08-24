// OTA-486 regression — equipped HANDS (gauntlets/gloves) + CLOAK (back) must
// survive a save load. backfillPlayer (the load-time migration that EVERY save
// passes through) used to rebuild `equipped` from a hardcoded slot list that
// omitted the arb63 hands/cloak slots, so every load silently un-equipped those
// two pieces — the items stayed in the pack but lost their equip link + AC/resist.
// These tests lock the slots into the migration.

// Mocks required to import gameStore in jest (mirrors golemCompanion.test.ts).
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
  Audio: {
    setAudioModeAsync: jest.fn(),
    Sound: class {
      static createAsync: (...args: unknown[]) => Promise<{ sound: { playAsync: () => Promise<void>; unloadAsync: () => Promise<void> } }> = jest.fn(async () => ({ sound: { playAsync: jest.fn(async () => {}), unloadAsync: jest.fn(async () => {}) } }));
    },
  },
}));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '0', applicationId: 'test' }));
jest.mock('expo-asset', () => ({ Asset: { fromModule: () => ({ downloadAsync: jest.fn(async () => {}), localUri: '' }) } }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => {}) }));
jest.mock('expo-constants', () => ({ default: { expoConfig: {} } }));
jest.mock('expo-font', () => ({ loadAsync: jest.fn(async () => {}) }));
jest.mock('expo-speech-recognition', () => ({}));
jest.mock('expo-updates', () => ({}));

import { backfillPlayer } from '../app/state/gameStore';
import type { PlayerCharacter, InventoryItem } from '../app/engine/types';
import { placedAt } from '../test-utils/placePlayer';

function item(id: string, name: string): InventoryItem {
  return { id, name, kind: 'armor', rarity: 'Common', quantity: 1 } as unknown as InventoryItem;
}

// Minimal player with enough shape for backfillPlayerInner to run.
function makePlayer(over: Partial<PlayerCharacter>): PlayerCharacter {
  return {
    stats: { strength: 6, dexterity: 5, intelligence: 5, wisdom: 5, charisma: 5, stealth: 2 },
    hp: 20, hpMax: 20,
    stamina: 10, staminaMax: 15,
    inventory: [],
    equipped: {},
    ...placedAt('tartarian_outskirts'),
    factionId: 'reclaimers',
    raceId: 'mud_dweller',
    dead: false,
    ...over,
  } as unknown as PlayerCharacter;
}

describe('OTA-486 — equipped hands/cloak survive a load', () => {
  it('keeps a modern save\'s hands + cloak slot names AND ids through backfill', () => {
    const gauntlets = item('it_hands_1', 'Iron Gauntlets');
    const cloak = item('it_cloak_1', 'Reclaimer Cloak');
    const p = makePlayer({
      inventory: [gauntlets, cloak],
      equipped: {
        hands: 'Iron Gauntlets', handsId: 'it_hands_1',
        cloak: 'Reclaimer Cloak', cloakId: 'it_cloak_1',
        // a normal slot too, to prove the rest still works
        chest: 'Scrap Plate', chestId: 'it_chest_1',
      },
    });

    const out = backfillPlayer(p);
    const eq = out.equipped!;

    expect(eq.hands).toBe('Iron Gauntlets');
    expect(eq.handsId).toBe('it_hands_1');
    expect(eq.cloak).toBe('Reclaimer Cloak');
    expect(eq.cloakId).toBe('it_cloak_1');
    expect(eq.chest).toBe('Scrap Plate');
    // The pieces are never removed from the pack.
    expect(out.inventory.some((i: InventoryItem) => i.id === 'it_hands_1')).toBe(true);
    expect(out.inventory.some((i: InventoryItem) => i.id === 'it_cloak_1')).toBe(true);
  });

  it('backfills handsId/cloakId from inventory for a legacy name-only save', () => {
    const p = makePlayer({
      inventory: [item('legacy_hands', 'Iron Gauntlets'), item('legacy_cloak', 'Reclaimer Cloak')],
      // Legacy save: slot names present, no per-slot ids yet.
      equipped: { hands: 'Iron Gauntlets', cloak: 'Reclaimer Cloak' },
    });

    const eq = backfillPlayer(p).equipped!;

    expect(eq.hands).toBe('Iron Gauntlets');
    expect(eq.cloak).toBe('Reclaimer Cloak');
    expect(eq.handsId).toBe('legacy_hands');
    expect(eq.cloakId).toBe('legacy_cloak');
  });
});
