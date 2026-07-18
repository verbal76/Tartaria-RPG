// OTA-874 — acid + corruption are now first-class incoming damage types (were folded
// into poison). This means:
//  (1) the inference types acidic / hollowing enemy attacks distinctly (the Aetheric
//      oozes now DEAL acid; the Hollow King DEALS corruption);
//  (2) both are resistable, so a vial worked into armor grants a REAL resist that a
//      matching incoming attack reduces (superseding OTA-873's block of those vials);
//  (3) the resistance map earns the right weak/resist relationships.

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
import { isResistableIncomingType, enemyDamageType } from '../app/engine/damageTypes';
import { applyDamageTypeModifier } from '../app/engine/crafting';
import { findEnemyByName } from '../app/engine/encounter';
import type { InventoryItem } from '../app/engine/types';

describe('OTA-874 — acid + corruption are real, resistable incoming types', () => {
  it('both are now resistable incoming types (were not before)', () => {
    expect(isResistableIncomingType('acid')).toBe(true);
    expect(isResistableIncomingType('corruption')).toBe(true);
    // aliases resolve
    expect(isResistableIncomingType('corrosive')).toBe(true); // → acid
    expect(isResistableIncomingType('blight')).toBe(true);    // → corruption
  });

  it('the inference types acidic attacks as acid (were poison before)', () => {
    for (const name of ['Aetheric Ooze', 'Aetheric Worm', 'Aetheric Slug']) {
      const e = findEnemyByName(name);
      expect(e).toBeTruthy();
      expect(enemyDamageType(e!)).toBe('acid');
    }
  });

  it('the Hollow King now deals corruption (Hollow Cleave), giving corruption an incoming source', () => {
    const e = findEnemyByName('Hollow King');
    expect(e).toBeTruthy();
    expect(enemyDamageType(e!)).toBe('corruption');
  });

  it('resistance map: metal is WEAK to acid + RESISTS corruption; flesh is WEAK to corruption', () => {
    expect(applyDamageTypeModifier(1, 'acid', 'Automation').match).toBe('weak');
    expect(applyDamageTypeModifier(1, 'corruption', 'Automation').match).toBe('resist');
    expect(applyDamageTypeModifier(1, 'corruption', 'Animal').match).toBe('weak');
    // the acid oozes are made of acid — they shrug it off
    expect(applyDamageTypeModifier(1, 'acid', 'Aetheric Mutation').match).toBe('resist');
  });
});

describe('OTA-874 — acid/corruption vials can now be worked into armor', () => {
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
        ],
      },
    });
  });

  const armorNow = () => useGameStore.getState().player!.inventory.find((i) => i.id === 'vest')!;
  const has = (id: string) => useGameStore.getState().player!.inventory.some((i) => i.id === id);

  it('an Acid Flask now grants a real acid resist and is consumed', () => {
    useGameStore.getState().applyCoatingToArmor('acid_v', 'vest');
    expect(armorNow().addedResists).toContain('acid');
    expect(has('acid_v')).toBe(false);
  });

  it('a Corruption Tonic now grants a real corruption resist and is consumed', () => {
    useGameStore.getState().applyCoatingToArmor('corr_v', 'vest');
    expect(armorNow().addedResists).toContain('corruption');
    expect(has('corr_v')).toBe(false);
  });
});
