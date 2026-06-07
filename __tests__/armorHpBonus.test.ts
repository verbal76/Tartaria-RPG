// arb-fix — equipped armor max-HP bonuses (the user's balance pass added HP
// boosts to ~76 pieces). `armorHpBonus` reads the `hp` entry from a piece's
// `statBonuses`, and equipItem/unequipSlot bake the delta into player.hpMax.

jest.setTimeout(15000);
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
  Audio: { setAudioModeAsync: jest.fn(), Sound: class {
    static createAsync = jest.fn(async () => ({ sound: { playAsync: jest.fn(async () => {}), unloadAsync: jest.fn(async () => {}) } }));
  } },
}));

import { armorHpBonus } from '../app/engine/equipment';
import { useGameStore } from '../app/state/gameStore';
import type { InventoryItem } from '../app/engine/types';

describe('armorHpBonus — reads the hp entry from statBonuses', () => {
  it("Titan's Forehead Guard grants +5 HP", () => {
    expect(armorHpBonus("Titan's Forehead Guard")).toBe(5);
  });
  it('a no-HP piece (Mud-Seer\'s Hood) grants 0', () => {
    expect(armorHpBonus("Mud-Seer's Hood")).toBe(0);
  });
  it('a non-armor / unknown name grants 0', () => {
    expect(armorHpBonus('Rusted Blade')).toBe(0);
    expect(armorHpBonus(null)).toBe(0);
  });
});

describe('equip/unequip bakes the HP bonus into hpMax', () => {
  beforeAll(async () => {
    await useGameStore.getState().hydrate();
    await useGameStore.getState().startNewGame({ name: 'HpTester', raceId: 'reclaimer', factionId: 'reclaimers_guild' });
  });

  it('equipping an HP head piece raises hpMax + hp by the bonus; unequipping reverts', () => {
    const store = useGameStore;
    const p = store.getState().player!;
    const boots: InventoryItem = {
      id: 'hp_head', name: "Titan's Forehead Guard", kind: 'armor', quantity: 1,
      rarity: 'Common', tags: ['armor', 'head'],
    };
    store.setState({ player: { ...p, inventory: [...p.inventory, boots], equipped: { ...(p.equipped ?? {}) } } });
    const baseMax = store.getState().player!.hpMax;
    const baseHp = store.getState().player!.hp;

    store.getState().equipItem("Titan's Forehead Guard", 'head');
    expect(store.getState().player!.hpMax).toBe(baseMax + 5);
    expect(store.getState().player!.hp).toBe(baseHp + 5);

    store.getState().unequipSlot('head');
    expect(store.getState().player!.hpMax).toBe(baseMax);
  });
});
