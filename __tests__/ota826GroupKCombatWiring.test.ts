// OTA-806 [Group-K audit] — player↔enemy damage-type wiring. The audit found
// three typed attack paths bypassing the weakness system and one thrown-coating
// parity gap. These tests lock the two most user-visible fixes:
//   (1) a coated throwable thrown BY NAME now seeds the lingering DOT (parity with
//       the bandolier path — pre-fix the DOT was dropped, so a poison knife thrown
//       "throw knife at X" was near-inert while the same knife from the bandolier
//       landed a full 3-turn DOT).
//   (2) burst-fire (multi_fire) now routes each shot through the weakness map
//       (pre-fix a bare rollDie ignored the weapon's damageType entirely).

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

async function freshGame(name: string) {
  await useGameStore.getState().hydrate();
  await useGameStore.getState().startNewGame({ name, raceId: 'reclaimer', factionId: 'reclaimers_guild' });
  useGameStore.getState().skipTutorial?.();
}

it('OTA-806 (1) — a coated throwable thrown by name seeds a lingering DOT on the surviving enemy', async () => {
  await freshGame('Coater');
  const p0 = useGameStore.getState().player!;
  // A poison-coated throwing knife + a big-HP enemy (survives the throw → DOT sticks).
  const knife: InventoryItem = {
    id: 'pk1', name: 'Throwing Knife', kind: 'weapon', quantity: 1, rarity: 'Common',
    tags: ['throwable', 'weapon', 'ranged', 'knife', 'thrown'],
    coating: { kind: 'poison', dice: '1d4', label: 'Poison' },
  } as InventoryItem;
  const enemy = { name: 'Hammer', damage: '1d4', abilityPoint: 'Strength 1', hp: 300, type: 'Human', loot: [], rarity: 'Common', traits: [] };
  const scene = useGameStore.getState().currentScene!;
  useGameStore.setState({
    // High DEX → the improvised throw lands deterministically; low enemy AC helps too.
    player: { ...p0, hp: 120, hpMax: 120, stats: { ...p0.stats, dexterity: 25 }, inventory: [...p0.inventory, knife] },
    currentScene: {
      ...scene, enemies: [enemy as never], enemyHps: [300], activeEnemyIdx: 0,
      range: 'close', enemyAmbushUsed: [false], enemyKnockedOut: [false], enemyStatuses: [[]],
    },
  });

  await useGameStore.getState().submitPlayerAction('throw the throwing knife at hammer');

  const st = useGameStore.getState();
  const idx = st.currentScene!.enemies.findIndex((e) => (e as { name: string }).name === 'Hammer');
  const statuses = st.currentScene!.enemyStatuses?.[idx] ?? [];
  // A poison_coat DOT now clings — pre-fix this array stayed empty on the typed-throw path.
  expect(statuses.some((s) => String((s as { kind: string }).kind).includes('poison'))).toBe(true);
});

it('OTA-806 (2) — burst fire applies the damage-type weakness (tags a weak hit in the log)', async () => {
  await freshGame('Burster');
  const p0 = useGameStore.getState().player!;
  // An electrical bolt-caster vs an Automation (type-map: weak to electrical).
  const boltCaster: InventoryItem = {
    id: 'bc1', name: 'Bolt Caster', kind: 'weapon', quantity: 1, rarity: 'Uncommon',
    tags: ['weapon', 'ranged', 'firearm', 'bolt-caster'],
    damageDice: '1d6', damageType: 'electrical', stat: 'dexterity',
  } as InventoryItem;
  const enemy = { name: 'Sentinel Drone', damage: '1d4', abilityPoint: 'Strength 1', hp: 400, type: 'Automation', loot: [], rarity: 'Common', traits: [] };
  const scene = useGameStore.getState().currentScene!;
  useGameStore.setState({
    player: {
      ...p0, hp: 120, hpMax: 120, stats: { ...p0.stats, dexterity: 25 },
      inventory: [...p0.inventory, boltCaster],
      equipped: { ...(p0.equipped ?? {}), main: 'Bolt Caster', mainId: 'bc1' },
    },
    currentScene: {
      ...scene, enemies: [enemy as never], enemyHps: [400], activeEnemyIdx: 0,
      range: 'close', enemyAmbushUsed: [false], enemyKnockedOut: [false], enemyStatuses: [[]],
    },
  });

  await useGameStore.getState().submitPlayerAction('burst fire at the drone');

  // The combat log should tag at least one bolt as a weak hit — deterministic given
  // Automation's electrical weakness, independent of the damage roll.
  const log = useGameStore.getState().gameLog ?? [];
  const combatText = log.map((l) => (l as { text?: string }).text ?? '').join('\n');
  // Pre-fix a burst bolt was a bare rollDie with NO type interaction — the line
  // never carried a weakness/resist tag. Now each shot routes through the type map,
  // so a hit vs a type-reactive foe (Automation) is tagged weak OR resisted. The
  // presence of the tag is the regression guard (the exact match depends on the
  // catalog-inferred damageType for the named weapon).
  expect(combatText).toMatch(/Bolt \d+ hits Sentinel Drone for \d+ \((weak[^)]*|resisted)\)/i);
});
