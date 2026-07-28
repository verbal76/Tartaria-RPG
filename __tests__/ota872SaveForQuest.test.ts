// OTA-872 — sell-tab exclusions + the "Save for quest" earmark.
//  (1) items reserved for the fusion Crucible never appear in the vendor sell tab
//  (2) hand-authored objective items (quest/contract/broker/whisper) are unsellable
//      via the single isQuestLockedItem predicate — not just the bare 'quest' tag
//  (3) a new soft "Save for quest" flag (reservedForQuest): moves an ordinary item
//      into the Quest Items inventory section AND out of the sell tab, but leaves it
//      usable/droppable. Mutually exclusive with the fusion reserve.

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
import { isUnsellable } from '../app/engine/sellPrice';
import { categorizeItem } from '../app/components/InventoryCategorize';
import type { InventoryItem } from '../app/engine/types';

const item = (over: Partial<InventoryItem>): InventoryItem => ({
  id: over.id ?? `it_${Math.random().toString(36).slice(2, 8)}`,
  name: over.name ?? 'Dried Ration',
  kind: over.kind ?? 'consumable',
  quantity: over.quantity ?? 1,
  tags: over.tags ?? ['food'],
  ...over,
}) as InventoryItem;

describe('OTA-872 — sell-tab exclusions', () => {
  it('a fusion-reserved item is unsellable', () => {
    expect(isUnsellable(item({ name: 'Scrap Bolt', kind: 'misc', tags: ['loot'], reservedForFusion: true }))).toBe(true);
    // …but the same item free of the reserve is sellable
    expect(isUnsellable(item({ name: 'Scrap Bolt', kind: 'misc', tags: ['loot'] }))).toBe(false);
  });

  it('a quest-saved item is unsellable', () => {
    expect(isUnsellable(item({ reservedForQuest: true }))).toBe(true);
    expect(isUnsellable(item({}))).toBe(false);
  });

  it('objective items are unsellable through the full lock set, not just the "quest" tag', () => {
    for (const tag of ['quest', 'contract', 'broker', 'whisper']) {
      expect(isUnsellable(item({ name: `Token (${tag})`, kind: 'misc', tags: [tag] }))).toBe(true);
    }
  });
});

describe('OTA-872 — categorization', () => {
  it('a quest-saved ordinary item files under the Quest Items section', () => {
    expect(categorizeItem(item({ reservedForQuest: true }))).toBe('quest');
    // without the flag the same ration is a normal consumable
    expect(categorizeItem(item({}))).toBe('consumable');
  });
});

describe('OTA-872 — toggleReserveForQuest', () => {
  beforeAll(async () => {
    await useGameStore.getState().hydrate();
    await useGameStore.getState().startNewGame({ name: 'Saver', raceId: 'reclaimer', factionId: 'reclaimers_guild' });
    useGameStore.getState().skipTutorial?.();
  });

  it('flips the flag on a single-unit stack and moves it out of the sell tab', () => {
    const p = useGameStore.getState().player!;
    const ration = item({ id: 'ration_1', name: 'Trail Ration', kind: 'consumable', quantity: 1, tags: ['food'] });
    useGameStore.setState({ player: { ...p, inventory: [...p.inventory, ration] } });

    useGameStore.getState().toggleReserveForQuest('ration_1');
    const after = useGameStore.getState().player!.inventory.find((i) => i.id === 'ration_1')!;
    expect(after.reservedForQuest).toBe(true);
    expect(isUnsellable(after)).toBe(true);
    expect(categorizeItem(after)).toBe('quest');

    // toggling again releases it
    useGameStore.getState().toggleReserveForQuest('ration_1');
    const freed = useGameStore.getState().player!.inventory.find((i) => i.id === 'ration_1')!;
    expect(freed.reservedForQuest).toBeFalsy();
    expect(isUnsellable(freed)).toBe(false);
  });

  it('peels ONE unit off a multi-unit stack (save 1, keep the rest)', () => {
    const p = useGameStore.getState().player!;
    const stack = item({ id: 'meat_5', name: 'Smoked Meat', kind: 'consumable', quantity: 5, tags: ['food'] });
    useGameStore.setState({ player: { ...p, inventory: [...p.inventory.filter((i) => i.name !== 'Smoked Meat'), stack] } });

    useGameStore.getState().toggleReserveForQuest('meat_5');
    const inv = useGameStore.getState().player!.inventory.filter((i) => i.name === 'Smoked Meat');
    const saved = inv.filter((i) => i.reservedForQuest);
    const free = inv.filter((i) => !i.reservedForQuest);
    expect(saved.reduce((n, i) => n + i.quantity, 0)).toBe(1);
    expect(free.reduce((n, i) => n + i.quantity, 0)).toBe(4);
  });

  it('refuses to save a fusion-reserved item (mutually exclusive)', () => {
    const p = useGameStore.getState().player!;
    const fodder = item({ id: 'fod_1', name: 'Bent Gear', kind: 'misc', quantity: 1, tags: ['loot'], reservedForFusion: true });
    useGameStore.setState({ player: { ...p, inventory: [...p.inventory, fodder] } });
    useGameStore.getState().toggleReserveForQuest('fod_1');
    const after = useGameStore.getState().player!.inventory.find((i) => i.id === 'fod_1')!;
    expect(after.reservedForQuest).toBeFalsy(); // untouched — still fusion-reserved
    expect(after.reservedForFusion).toBe(true);
  });
});
