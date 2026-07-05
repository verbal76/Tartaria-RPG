// OTA-691 — found faction SIGILS turn in for +1 standing, honoring the fallen.
// Pure helpers resolve a sigil's faction + turn-in tile; the store action grants
// the standing (only while standing on that faction's stake) and spends the sigil.

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

import { useGameStore } from '../app/state/gameStore';
import { getRaces, getFactions } from '../app/engine/character';
import { isSigilItem, sigilFaction, carriedSigils, rollSigilDrop, inferEnemyFaction, FACTION_SIGIL_NAME } from '../app/engine/sigils';
import { findCatalogItem } from '../app/engine/crafting';
import type { InventoryItem } from '../app/engine/types';

const orderSigil = (id = 'sig1', qty = 1): InventoryItem =>
  ({ id, name: 'Forgotten Order Sigil', kind: 'misc', quantity: qty, rarity: 'Common', tags: ['sigil', 'forgotten_order', 'keepsake'] } as InventoryItem);

async function freshGame() {
  const store = useGameStore;
  await store.getState().hydrate();
  await store.getState().startNewGame({ name: 'Bearer', raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
  store.getState().skipTutorial?.();
  return store;
}

const standingOf = (store: typeof useGameStore, fid: string) =>
  store.getState().player!.factionStanding.find((r) => r.factionId === fid)?.standing ?? 0;

describe('sigil helpers (OTA-691)', () => {
  it('detects a sigil and resolves its faction', () => {
    expect(isSigilItem(orderSigil())).toBe(true);
    expect(isSigilItem({ tags: ['ring', 'forgotten_order'] })).toBe(false);
    expect(sigilFaction(orderSigil())).toEqual({ id: 'forgotten_order', name: 'Forgotten Order' });
  });

  it('carriedSigils lists a sigil with its faction + turn-in tile (varakush)', () => {
    const list = carriedSigils([orderSigil()]);
    expect(list).toHaveLength(1);
    expect(list[0]!.factionId).toBe('forgotten_order');
    expect(list[0]!.tileId).toBe('varakush');
  });

  it('the sigil item is a real catalog row (mints cleanly, not inferred)', () => {
    const row = findCatalogItem('Forgotten Order Sigil');
    expect(row).toBeTruthy();
    expect(row!.tags).toEqual(expect.arrayContaining(['sigil', 'forgotten_order']));
  });

  it('every FACTION_SIGIL_NAME maps to a real catalog sigil row', () => {
    for (const name of Object.values(FACTION_SIGIL_NAME)) {
      const row = findCatalogItem(name);
      expect(row).toBeTruthy();
      expect((row!.tags ?? []).includes('sigil')).toBe(true);
    }
  });
});

describe('sigil drops (OTA-692)', () => {
  it('infers a faction from a faction-named humanoid', () => {
    expect(inferEnemyFaction('Mud Monarch Purifier')).toBe('mud_monarchs');
    expect(inferEnemyFaction('Reclaimer Ambusher')).toBe('reclaimers_guild');
    expect(inferEnemyFaction('Silt Thief')).toBeNull();
  });

  it('a faction humanoid drops ITS OWN sigil (rng forces a hit)', () => {
    const drop = rollSigilDrop({ type: 'Human', name: 'Mud Monarch Purifier' }, { rng: () => 0 });
    expect(drop).toBe('Mud Monarch Sigil');
  });

  it('a non-humanoid never drops a sigil', () => {
    expect(rollSigilDrop({ type: 'Aetheric Creature', name: 'Aetheric Raven' }, { rng: () => 0 })).toBeNull();
  });

  it('a plain humanoid can drop a random sigil (rng forces a hit)', () => {
    const drop = rollSigilDrop({ type: 'Human', name: 'Silt Thief' }, { rng: () => 0 });
    expect(Object.values(FACTION_SIGIL_NAME)).toContain(drop);
  });

  it('high rng roll = no drop', () => {
    expect(rollSigilDrop({ type: 'Human', name: 'Mud Monarch Purifier' }, { rng: () => 0.99 })).toBeNull();
  });
});

describe('turnInSigil (OTA-691)', () => {
  beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

  it('at the faction stake: +1 standing and the sigil is spent', async () => {
    const store = await freshGame();
    const p = store.getState().player!;
    store.setState({ player: { ...p, inventory: [...p.inventory, orderSigil()], currentLocationId: 'varakush' } });
    const before = standingOf(store, 'forgotten_order');

    store.getState().turnInSigil('sig1');

    expect(standingOf(store, 'forgotten_order')).toBe(before + 1);
    expect(store.getState().player!.inventory.some((i) => i.id === 'sig1')).toBe(false);
  });

  it('away from the stake: no standing change, sigil kept', async () => {
    const store = await freshGame();
    const p = store.getState().player!;
    store.setState({ player: { ...p, inventory: [...p.inventory, orderSigil()], currentLocationId: 'tartarian_outskirts' } });
    const before = standingOf(store, 'forgotten_order');

    store.getState().turnInSigil('sig1');

    expect(standingOf(store, 'forgotten_order')).toBe(before);
    expect(store.getState().player!.inventory.some((i) => i.id === 'sig1')).toBe(true);
  });
});
