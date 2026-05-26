// OTA-057 — Stat-training exploit mitigation.
//
// Two gates land in this OTA, both tested here:
//
//   1. Cardinal-step WIS / STR-passive / CHA-passive training is
//      gated on TILE NOVELTY. A sliding window of 20 recent tile
//      keys lives on player.recentTileHistory. Walking onto a tile
//      already in the window does not train. Walking onto a tile
//      not in the window does.
//
//      Pre-OTA: pacing two screens 500 times farms WIS in ~10 min.
//      Post-OTA: pacing two screens 500 times trains WIS at most
//      twice (the first time each of the two tiles entered the
//      window).
//
//   2. The 7 active NPC-interaction verbs (buy / sell / gift /
//      accept-hunt / accept-mystery / accept-storyline / accept-
//      faction-quest) no longer DOUBLE-TRAIN both CHA and WIS.
//      They train CHA only. WIS is reserved for outcome paths
//      (completion turn-ins, hearing whispers, novel travel,
//      resting after combat, surviving wasteland encounters).

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

async function bootstrap() {
  const store = useGameStore;
  await store.getState().hydrate();
  await store.getState().startNewGame({ name: 'Pacer', raceId: 'unknowing_mass', factionId: 'reclaimers_guild' });
  store.getState().skipTutorial?.();
  // Clamp player to a known-safe state: full stamina/HP, zero inventory
  // so the STR-passive (20+ items) and CHA-passive (named gear) gates
  // can't fire — this test only measures WIS step training.
  const p0 = store.getState().player!;
  store.setState({
    player: {
      ...p0,
      hp: p0.hpMax, stamina: p0.staminaMax,
      inventory: [],
      equipped: {},
      // Stat at 10 so we're in the +2-per-use tier (clear signal,
      // not the 0.1 floor).
      stats: { ...p0.stats, wisdom: 10, charisma: 10, strength: 10, dexterity: 10, intelligence: 10 },
      statProgress: { strength: 0, dexterity: 0, intelligence: 0, wisdom: 0, charisma: 0 },
      recentTileHistory: [],
    },
  });
  return store;
}

function wisProgressTotal(store: typeof useGameStore): number {
  const p = store.getState().player!;
  // Account for stat-level rollovers: each +1 stat above 10 is +100 of
  // "absorbed" progress. Compare the total progress accumulated.
  const baseGain = (p.stats.wisdom - 10) * 100;
  const fract = p.statProgress?.wisdom ?? 0;
  return baseGain + fract;
}

describe('OTA-057 — stat spam gates', () => {
  beforeAll(() => {
    console.log = () => {};
    console.warn = () => {};
    console.error = () => {};
  });

  it('pacing 2-tile circuit (100 steps) trains WIS only on the first novel tiles', async () => {
    const store = await bootstrap();
    const before = wisProgressTotal(store);
    // Pace north-south 100 times. The two tiles end up in the
    // recentTileHistory after the first two steps; every subsequent
    // step lands on a tile already in the window → no train.
    for (let i = 0; i < 50; i++) {
      store.getState().stepDirection('north');
      store.getState().stepDirection('south');
    }
    const after = wisProgressTotal(store);
    const gained = after - before;
    // At stat 10, +2 per train. The first ~2 steps yield novel tiles
    // (≤4 progress total). Some additional novelty could come from
    // an inadvertent corner case (e.g. an edge bounce landing on a
    // never-seen third tile), but the total MUST be well below the
    // un-gated baseline (200 progress = 100 trains × +2).
    expect(gained).toBeLessThan(40);
  });

  it('traversing many novel tiles still trains WIS', async () => {
    const store = await bootstrap();
    const before = wisProgressTotal(store);
    // Snake walk: east 5, south 5, east 5, north 5, east 5 — at
    // least 20+ tiles, almost all novel. Each novel step → +2.
    const path: Array<'north' | 'south' | 'east' | 'west'> = [];
    for (let i = 0; i < 5; i++) path.push('east');
    for (let i = 0; i < 5; i++) path.push('south');
    for (let i = 0; i < 5; i++) path.push('east');
    for (let i = 0; i < 5; i++) path.push('north');
    for (let i = 0; i < 5; i++) path.push('east');
    for (const dir of path) store.getState().stepDirection(dir);
    const after = wisProgressTotal(store);
    const gained = after - before;
    // 25 steps, mostly novel; even with edge-bounces / location
    // boundary collapses absorbing some, we expect > 30 (i.e. at
    // least ~15 novel-tile trains × +2).
    expect(gained).toBeGreaterThan(30);
  });

  it('history window caps at 20 tiles', async () => {
    const store = await bootstrap();
    // Walk east 30 tiles. The history should hold the most recent 20.
    for (let i = 0; i < 30; i++) store.getState().stepDirection('east');
    const hist = store.getState().player!.recentTileHistory ?? [];
    expect(hist.length).toBeLessThanOrEqual(20);
  });

  it('buying from a vendor trains CHA only, not WIS', async () => {
    const store = await bootstrap();
    const p = store.getState().player!;
    store.setState({
      currentScene: {
        ...store.getState().currentScene!,
        vendor: {
          id: 'spam_buy_vendor',
          name: 'Test Merchant',
          faction: 'reclaimers_guild',
          offers: [{ itemName: 'Rusted Blade', price: 8 }],
          greeting: '"Wares."',
        } as any,
      },
      player: { ...p, tc: 1000 },
    });
    const chaBefore = store.getState().player!.statProgress?.charisma ?? 0;
    const wisBefore = store.getState().player!.statProgress?.wisdom ?? 0;
    store.getState().buyFromVendor('Rusted Blade');
    const chaAfter = store.getState().player!.statProgress?.charisma ?? 0;
    const wisAfter = store.getState().player!.statProgress?.wisdom ?? 0;
    expect(chaAfter).toBeGreaterThan(chaBefore);
    expect(wisAfter).toBe(wisBefore);
  });

  it('selling to a vendor trains CHA only, not WIS', async () => {
    const store = await bootstrap();
    const p = store.getState().player!;
    store.setState({
      currentScene: {
        ...store.getState().currentScene!,
        vendor: {
          id: 'spam_sell_vendor',
          name: 'Test Merchant',
          faction: 'reclaimers_guild',
          offers: [{ itemName: 'Rusted Blade', price: 8 }],
          greeting: '"Wares."',
        } as any,
      },
      player: {
        ...p,
        tc: 1000,
        inventory: [{ id: 'xtal_sell', name: 'Aether Crystal', kind: 'misc', quantity: 1, tags: ['aether', 'crystal'] } as any],
      },
    });
    const chaBefore = store.getState().player!.statProgress?.charisma ?? 0;
    const wisBefore = store.getState().player!.statProgress?.wisdom ?? 0;
    store.getState().sellToVendor('Aether Crystal');
    const chaAfter = store.getState().player!.statProgress?.charisma ?? 0;
    const wisAfter = store.getState().player!.statProgress?.wisdom ?? 0;
    expect(chaAfter).toBeGreaterThan(chaBefore);
    expect(wisAfter).toBe(wisBefore);
  });

  it('gifting to a vendor trains CHA only, not WIS', async () => {
    const store = await bootstrap();
    const p = store.getState().player!;
    store.setState({
      currentScene: {
        ...store.getState().currentScene!,
        vendor: {
          id: 'spam_gift_vendor',
          name: 'Test Merchant',
          faction: 'reclaimers_guild',
          offers: [{ itemName: 'Rusted Blade', price: 8 }],
          greeting: '"Wares."',
        } as any,
      },
      player: {
        ...p,
        inventory: [{ id: 'xtal_gift', name: 'Aether Crystal', kind: 'misc', quantity: 1, tags: ['aether', 'crystal'] } as any],
      },
    });
    const chaBefore = store.getState().player!.statProgress?.charisma ?? 0;
    const wisBefore = store.getState().player!.statProgress?.wisdom ?? 0;
    store.getState().giftToVendor('Aether Crystal');
    const chaAfter = store.getState().player!.statProgress?.charisma ?? 0;
    const wisAfter = store.getState().player!.statProgress?.wisdom ?? 0;
    expect(chaAfter).toBeGreaterThan(chaBefore);
    expect(wisAfter).toBe(wisBefore);
  });
});
