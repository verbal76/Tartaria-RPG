// OTA-619 — combat healing is a FAST action: using a healing consumable in a
// fight no longer hands the enemy a free swing (player ruling, reverting the
// OTA-611 counter). This locks that: a guaranteed-hit, hard-hitting close-range
// enemy gets NO counter when the player quaffs, so HP only moves by the heal.

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

import { useGameStore } from '../app/state/gameStore';
import type { InventoryItem } from '../app/engine/types';

it('OTA-619 — quaffing a heal in combat draws NO enemy counter (HP moves only by the heal)', async () => {
  await useGameStore.getState().hydrate();
  await useGameStore.getState().startNewGame({ name: 'Quaffer', raceId: 'reclaimer', factionId: 'reclaimers_guild' });
  useGameStore.getState().skipTutorial?.();

  const p0 = useGameStore.getState().player!;
  const trail: InventoryItem = { id: 'tr_test', name: 'Trail Rations', kind: 'consumable', quantity: 1, tags: ['food'], rarity: 'Common', description: 'x' };
  // A guaranteed-hit, hard-hitting close-range enemy: if a counter fired it WOULD
  // land for a lot, so any HP loss beyond the heal means the counter ran.
  const enemy = { name: 'Hammer', damage: '6d6', abilityPoint: 'Strength 40', hp: 200, type: 'brute', loot: [], rarity: 'Common', traits: [] };
  const scene = useGameStore.getState().currentScene!;
  useGameStore.setState({
    player: { ...p0, hp: 10, hpMax: 100, inventory: [...p0.inventory, trail] },
    currentScene: {
      ...scene, enemies: [enemy as never], enemyHps: [200], activeEnemyIdx: 0,
      range: 'close', enemyAmbushUsed: [false], enemyKnockedOut: [false], enemyStatuses: [[]],
    },
  });

  await useGameStore.getState().submitPlayerAction('use trail rations');

  const after = useGameStore.getState().player!;
  // +6 from Trail Rations and not a point less — the Hammer never swung.
  expect(after.hp).toBe(16);
});
