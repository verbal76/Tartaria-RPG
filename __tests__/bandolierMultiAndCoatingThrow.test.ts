// OTA-690 — bandolier overhaul.
//  (1) stowInBandolier racked the first-by-name instance, which — once one knife
//      was racked — kept re-finding that SAME racked knife and bouncing, so you
//      could only ever load ONE. Now it racks the next UN-racked instance, so
//      several same-named throwables each take their own loop (up to 5).
//  (2) Coating vials (weapon_coating) are now bandolier-eligible and, thrown, burst
//      for the coating's full DOT up front: perTurn(dice) × COATING_DOT_TURNS of the
//      coating's damage type, consuming one vial.

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
import { isBandolierEligible } from '../app/engine/bandolierEligibility';
import type { InventoryItem } from '../app/engine/types';

async function freshGame() {
  const store = useGameStore;
  await store.getState().hydrate();
  await store.getState().startNewGame({ name: 'Slinger', raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
  store.getState().skipTutorial?.();
  return store;
}

const knife = (id: string): InventoryItem =>
  ({ id, name: 'Throwing Knife', kind: 'weapon', quantity: 1, rarity: 'Common', tags: ['throwable', 'weapon', 'ranged', 'knife', 'thrown'] } as InventoryItem);

const searingPaste = (id: string, qty = 1): InventoryItem =>
  ({ id, name: 'Searing Paste', kind: 'consumable', quantity: qty, rarity: 'Uncommon', tags: ['potion', 'weapon_coating', 'burn', 'aether', 'crafted', 'alchemy'] } as InventoryItem);

describe('bandolier — rack multiple + coating throw (OTA-690)', () => {
  beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

  it('racks TWO separate knife instances (was capped at one)', async () => {
    const store = await freshGame();
    const p = store.getState().player!;
    store.setState({ player: { ...p, inventory: [...p.inventory, knife('k1'), knife('k2')], equipped: { ...(p.equipped ?? {}), bandolierIds: [] } } });

    store.getState().stowInBandolier('Throwing Knife');
    store.getState().stowInBandolier('Throwing Knife');

    const ids = store.getState().player!.equipped!.bandolierIds ?? [];
    expect(ids.length).toBe(2);
    expect(new Set(ids)).toEqual(new Set(['k1', 'k2']));
  });

  it('a coating vial is bandolier-eligible', async () => {
    const store = await freshGame();
    const p = store.getState().player!;
    expect(isBandolierEligible(searingPaste('sp'), { ...p, equipped: {} } as any).eligible).toBe(true);
  });

  it('throwing a coating bursts the enemy for damage and consumes the vial', async () => {
    const store = await freshGame();
    const p = store.getState().player!;
    store.setState({
      player: { ...p, inventory: [...p.inventory, searingPaste('sp1')], equipped: { ...(p.equipped ?? {}), bandolierIds: ['sp1'] } },
    });
    store.setState((s) => ({
      currentScene: {
        ...((s.currentScene ?? {}) as any),
        enemies: [{ name: 'Brute', hp: 40, ac: 10, attack: 'Slam', damage: '1d6', abilityPoint: 'STR 10', rarity: 'Common', traits: [] }],
        enemyHps: [40],
        enemyKnockedOut: [false],
        enemyAmbushUsed: [false],
        activeEnemyIdx: 0,
        range: 'close',
      } as any,
    }));

    store.getState().throwFromBandolier('Searing Paste');

    const st = store.getState();
    // Enemy took burst damage (Searing Paste = burn 1d4 → 3..12 over 3 turns).
    expect(st.currentScene!.enemyHps[0]).toBeLessThan(40);
    expect(st.currentScene!.enemyHps[0]).toBeGreaterThanOrEqual(40 - 12);
    // Vial consumed + slot cleared.
    expect(st.player!.inventory.some((i) => i.id === 'sp1')).toBe(false);
    expect((st.player!.equipped!.bandolierIds ?? []).includes('sp1')).toBe(false);
  });
});
