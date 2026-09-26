// I-007 / D-golem-inert-core-exceeds-stat-cap — production defect repair.
//
// Normal golem training is hard-capped at GOLEM_MAX_TRAINED_STAT=30
// (app/engine/golems.ts, trainGolemStat's own ceiling: "if (baseStat >=
// GOLEM_MAX_TRAINED_STAT) return { golem, leveled: null }"). But grafting an
// Inert Golem Core onto a golem (app/state/gameStore.ts, the `item.golemCore`
// branch inside applyItemToGolem) added core.power/core.resilience directly
// with NO clamp at all. Worse, cores chain: a golem built from a grafted core
// can later die and drop its OWN core carrying forward half of its (already
// possibly over-cap) stats, so successive grafts had nothing bounding them.
//
// Fix: the graft now clamps the resulting power/resilience to
// GOLEM_MAX_TRAINED_STAT, the same established invariant every other
// stat-gain path already respects, and the reward line reports the actual
// amount granted (not the full core value) so it never claims more than what
// landed.
//
// This test drives the real production door: submitPlayerAction('feed golem
// with <item>'), which routes through tryGolemApplyVerb -> applyItemToGolem,
// the exact path a live player types.

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
import { GOLEM_MAX_TRAINED_STAT } from '../app/engine/golems';
import type { InventoryItem } from '../app/engine/types';

const store = useGameStore;
const get = () => store.getState();

function inertCore(id: string, power: number, resilience: number, bonusHp = 0): InventoryItem {
  return {
    id,
    name: 'Inert Golem Core',
    kind: 'misc',
    rarity: 'Uncommon',
    quantity: 1,
    tags: ['golem', 'core', 'salvage'],
    golemCore: { power, resilience, bonusHp },
  } as unknown as InventoryItem;
}

async function standWithGolem(stats: { power: number; resilience: number }, coreItem: InventoryItem) {
  await get().hydrate();
  await get().startNewGame({ name: 'Walker', raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
  get().skipTutorial?.();
  await new Promise((r) => setTimeout(r, 25));
  store.setState((s) => ({
    player: {
      ...s.player!,
      golem: { kind: 'mud_golem', name: 'Clod', hp: 20, hpMax: 20, stats } as never,
      inventory: [...s.player!.inventory, coreItem],
    },
  }));
}

describe('I-007 — grafting an Inert Golem Core never pushes power/resilience past the training cap', () => {
  it('clamps a graft that would otherwise exceed the cap', async () => {
    await standWithGolem({ power: 28, resilience: 25 }, inertCore('core_1', 10, 10, 5));

    get().submitPlayerAction('feed golem with inert golem core');

    const golem = get().player!.golem as unknown as { stats: { power: number; resilience: number } };
    expect(golem.stats.power).toBe(GOLEM_MAX_TRAINED_STAT);
    expect(golem.stats.resilience).toBe(GOLEM_MAX_TRAINED_STAT);
    expect(golem.stats.power).toBeLessThanOrEqual(30);
    expect(golem.stats.resilience).toBeLessThanOrEqual(30);
  });

  it('negative control: a graft that stays under the cap is applied in full, unclamped', async () => {
    await standWithGolem({ power: 5, resilience: 5 }, inertCore('core_2', 3, 4, 2));

    get().submitPlayerAction('feed golem with inert golem core');

    const golem = get().player!.golem as unknown as { stats: { power: number; resilience: number }; hpMax: number };
    expect(golem.stats.power).toBe(8);
    expect(golem.stats.resilience).toBe(9);
    expect(golem.hpMax).toBe(22);
  });

  it('a golem already sitting exactly at the cap gains nothing further from a graft', async () => {
    await standWithGolem({ power: GOLEM_MAX_TRAINED_STAT, resilience: GOLEM_MAX_TRAINED_STAT }, inertCore('core_3', 8, 8));

    get().submitPlayerAction('feed golem with inert golem core');

    const golem = get().player!.golem as unknown as { stats: { power: number; resilience: number } };
    expect(golem.stats.power).toBe(GOLEM_MAX_TRAINED_STAT);
    expect(golem.stats.resilience).toBe(GOLEM_MAX_TRAINED_STAT);
  });
});
