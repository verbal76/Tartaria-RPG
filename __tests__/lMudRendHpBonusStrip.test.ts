// Defect L investigation — the reported 35 -> 30 max-HP drop around the
// Mud-Rend Blade equip in Life 2.
//
// INVESTIGATION FINDING, NOT A DEFECT: Cudgel carries `statBonuses:
// [{stat:'hp', amount:5}]` (app/data/items/weapons.json) — a designed
// mechanic ("Grants +5 HP") shared by many weapons/armor pieces. Mud-Rend
// Blade carries NO statBonuses entry at all (0 HP). equipItem() bakes this
// in via `hpDelta = gearHpBonus(item.name) - gearHpBonus(previousInSlot)`
// (app/state/slices/inventorySlice.ts:338) — swapping Cudgel -> Mud-Rend
// Blade computes hpDelta = 0 - 5 = -5, dropping hpMax by exactly 5 and
// carrying current HP down with it via hpAfterMaxChange (OTA-1110). A
// character at full HP (35/35) with a Cudgel equipped who swaps to a
// Mud-Rend Blade lands at exactly 30/30 — precisely the reported anomaly.
//
// Neither weapon declares a two-handed `style`, so no auto-displace branch
// runs; this is the plain same-slot swap path. The delta math is symmetric
// (both sides read through the same gearHpBonus()), so there is no
// asymmetry bug in the equip path. This is the existing, intentional
// OTA-796 / OTA-1110 mechanism working exactly as designed — classified
// EXPECTED-BEHAVIOR. No production change made for this finding.
//
// This test drives the real production door: submitPlayerAction to equip
// each weapon in turn, exactly as a live player's inventory tap would.

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
jest.mock('expo-av', () => ({
  Audio: {
    setAudioModeAsync: jest.fn(),
    Sound: class {
      static createAsync: () => Promise<{ sound: { playAsync: () => Promise<void>; unloadAsync: () => Promise<void> } }> =
        jest.fn(async () => ({ sound: { playAsync: jest.fn(async () => {}), unloadAsync: jest.fn(async () => {}) } }));
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

import { useGameStore } from '../app/state/gameStore';
import { getRaces, getFactions } from '../app/engine/character';
import type { InventoryItem } from '../app/engine/types';

const store = useGameStore;
const get = () => store.getState();

function weapon(name: string, id: string): InventoryItem {
  return {
    id, name, kind: 'weapon', rarity: 'Common', quantity: 1, tags: ['weapon'],
  } as unknown as InventoryItem;
}

async function standWithBareInventory() {
  await get().hydrate();
  await get().startNewGame({ name: 'Walker', raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
  get().skipTutorial?.();
  await new Promise((r) => setTimeout(r, 25));
}

describe('Defect L investigation — Cudgel -> Mud-Rend Blade hpMax swap is EXPECTED-BEHAVIOR', () => {
  it('equipping the +5 HP Cudgel raises hpMax by exactly 5, at full HP', () => {
    return standWithBareInventory().then(() => {
      store.setState((s) => ({
        player: {
          ...s.player!,
          hpMax: 30,
          hp: 30,
          equipped: { ...(s.player!.equipped ?? {}) },
          inventory: [...s.player!.inventory, weapon('Cudgel', 'w_cudgel')],
        },
      }));

      get().equipItem('Cudgel', 'main', 'w_cudgel');

      expect(get().player!.hpMax).toBe(35);
      expect(get().player!.hp).toBe(35);
      expect(get().player!.equipped?.main).toBe('Cudgel');
    });
  });

  it('swapping the equipped Cudgel for a Mud-Rend Blade (0 HP bonus) drops hpMax by exactly 5 — 35 -> 30, matching the reported anomaly exactly', () => {
    return standWithBareInventory().then(() => {
      store.setState((s) => ({
        player: {
          ...s.player!,
          hpMax: 30,
          hp: 30,
          equipped: { ...(s.player!.equipped ?? {}) },
          inventory: [
            ...s.player!.inventory,
            weapon('Cudgel', 'w_cudgel'),
            weapon('Mud-Rend Blade', 'w_mudrend'),
          ],
        },
      }));
      get().equipItem('Cudgel', 'main', 'w_cudgel');
      expect(get().player!.hpMax).toBe(35);
      expect(get().player!.hp).toBe(35);

      get().equipItem('Mud-Rend Blade', 'main', 'w_mudrend');

      expect(get().player!.equipped?.main).toBe('Mud-Rend Blade');
      expect(get().player!.hpMax).toBe(30);
      expect(get().player!.hp).toBe(30);
    });
  });

  it('negative control: swapping between two weapons that both carry 0 HP bonus leaves hpMax untouched', () => {
    return standWithBareInventory().then(() => {
      const baseline = get().player!.hpMax;
      store.setState((s) => ({
        player: {
          ...s.player!,
          equipped: { ...(s.player!.equipped ?? {}) },
          inventory: [
            ...s.player!.inventory,
            weapon('Mud-Rend Blade', 'w_mudrend'),
            weapon('Mud-Iron Cleaver', 'w_cleaver'),
          ],
        },
      }));

      get().equipItem('Mud-Rend Blade', 'main', 'w_mudrend');
      expect(get().player!.hpMax).toBe(baseline);

      get().equipItem('Mud-Iron Cleaver', 'main', 'w_cleaver');
      expect(get().player!.hpMax).toBe(baseline);
    });
  });
});
