// OTA-873 — armor coating rejects OFFENSIVE-only families. acid/corruption are DOT
// families the player's coated WEAPON applies; no enemy deals them as incoming damage,
// so a worked-in armor resist against them is inert (matches nothing). The "apply to
// armor" path must reject them so a vial isn't silently wasted, while still accepting
// the four resistable incoming types (poison / electrical / burn / cold).

jest.setTimeout(20000);
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('onnxruntime-react-native', () => ({
  InferenceSession: { create: jest.fn(async () => ({ run: jest.fn(async () => ({})) })) },
  Tensor: class { constructor(_t: string, _d: unknown, _s: unknown[]) {} },
}));
jest.mock('llama.rn', () => ({ initLlama: jest.fn(async () => ({ completion: jest.fn(async () => ({ text: '' })), release: jest.fn() })), releaseAllLlama: jest.fn() }));
jest.mock('react-native-executorch', () => ({}));
jest.mock('expo-file-system', () => ({ documentDirectory: '/tmp/', cacheDirectory: '/tmp/', getInfoAsync: jest.fn(async () => ({ exists: false })), makeDirectoryAsync: jest.fn(async () => {}), readAsStringAsync: jest.fn(async () => ''), writeAsStringAsync: jest.fn(async () => {}), deleteAsync: jest.fn(async () => {}), downloadAsync: jest.fn(async () => ({ uri: '' })), EncodingType: { UTF8: 'utf8', Base64: 'base64' } }));
jest.mock('expo-speech', () => ({ speak: jest.fn(), stop: jest.fn(), isSpeakingAsync: jest.fn(async () => false) }));
jest.mock('expo-av', () => ({ Audio: { setAudioModeAsync: jest.fn(), Sound: class { static createAsync = jest.fn(async () => ({ sound: { playAsync: jest.fn(async () => {}), unloadAsync: jest.fn(async () => {}) } })); } } }));

import { useGameStore } from '../app/state/gameStore';
import { isResistableIncomingType } from '../app/engine/damageTypes';
import type { InventoryItem } from '../app/engine/types';

describe('OTA-873 — isResistableIncomingType', () => {
  it('accepts the four resistable coating types and rejects the offensive-only two', () => {
    for (const t of ['poison', 'electrical', 'burn', 'cold']) {
      expect(isResistableIncomingType(t)).toBe(true);
    }
    expect(isResistableIncomingType('acid')).toBe(false);
    expect(isResistableIncomingType('corruption')).toBe(false);
    // aliases still resolve
    expect(isResistableIncomingType('frost')).toBe(true); // → cold
  });
});

describe('OTA-873 — applyCoatingToArmor rejects offensive coatings', () => {
  const armor: InventoryItem = { id: 'vest', name: 'Padded Vest', kind: 'armor', quantity: 1, tags: [] } as InventoryItem;
  const vial = (id: string, name: string, dmg: string): InventoryItem =>
    ({ id, name, kind: 'consumable', quantity: 1, tags: ['weapon_coating', dmg] }) as InventoryItem;

  beforeEach(async () => {
    await useGameStore.getState().hydrate();
    await useGameStore.getState().startNewGame({ name: 'Coat', raceId: 'reclaimer', factionId: 'reclaimers_guild' });
    useGameStore.getState().skipTutorial?.();
    const p = useGameStore.getState().player!;
    useGameStore.setState({
      player: {
        ...p,
        inventory: [
          ...p.inventory.filter((i) => i.name !== 'Padded Vest'),
          { ...armor },
          vial('acid_v', 'Acid Flask', 'acid'),
          vial('corr_v', 'Corruption Tonic', 'corruption'),
          vial('pois_v', 'Poison Vial', 'poison'),
        ],
      },
    });
  });

  const armorNow = () => useGameStore.getState().player!.inventory.find((i) => i.id === 'vest')!;
  const has = (id: string) => useGameStore.getState().player!.inventory.some((i) => i.id === id);

  it('an Acid Flask is refused — no resist added, vial NOT consumed', () => {
    useGameStore.getState().applyCoatingToArmor('acid_v', 'vest');
    expect(armorNow().addedResists ?? []).toHaveLength(0);
    expect(has('acid_v')).toBe(true); // vial kept
  });

  it('a Corruption Tonic is refused — no resist added, vial NOT consumed', () => {
    useGameStore.getState().applyCoatingToArmor('corr_v', 'vest');
    expect(armorNow().addedResists ?? []).toHaveLength(0);
    expect(has('corr_v')).toBe(true);
  });

  it('a Poison Vial STILL works — resist added, vial consumed', () => {
    useGameStore.getState().applyCoatingToArmor('pois_v', 'vest');
    expect(armorNow().addedResists).toContain('poison');
    expect(has('pois_v')).toBe(false); // consumed
  });
});
