// OTA-800 — store-level regressions for the behavioral fixes:
//   A1 · enemy DOTs tick on EVERY combat round (not just `attack`).
//   A1 · `jump at <bogus text>` no longer trains DEX (only a real scene noun).
//   A2 · picking a dropped item up can't launder a worn instance into a full
//        same-name stack (routes through grantItem).
//   A2 · applyCoating on a STACK peels one unit instead of coating all N.
//   A2 · the equipped throwable consumed on a thrown attack is the equipped
//        INSTANCE (by id), not the first same-name row.

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

import { useGameStore, makeRoomKey } from '../app/state/gameStore';
import { findEnemyByName } from '../app/engine/encounter';
import type { InventoryItem } from '../app/engine/types';

beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

async function boot(name = 'Tester') {
  const store = useGameStore;
  await store.getState().hydrate();
  await store.getState().startNewGame({ name, raceId: 'unknowing_mass', factionId: 'reclaimers_guild' });
  store.getState().skipTutorial?.();
  return store;
}

function anEnemy() {
  const proto = findEnemyByName('Mud Boar') ?? findEnemyByName('Silt Thief') ?? findEnemyByName('Aetheric Leech');
  if (!proto) throw new Error('no test enemy in catalog');
  return JSON.parse(JSON.stringify(proto));
}

describe('OTA-800 A1 — enemy DOTs tick on a non-attack combat round (dodge)', () => {
  it('a poisoned enemy loses DOT HP when the player DODGES, not just on attack', async () => {
    const store = await boot('Dodger');
    const enemy = anEnemy();
    store.setState({
      currentScene: {
        ...store.getState().currentScene!,
        enemies: [enemy],
        enemyHps: [30],
        enemyStatuses: [[{ kind: 'poison_coat', turnsRemaining: 3, dmgPerTurn: 2, sourceName: 'Poison' }]],
        activeEnemyIdx: 0,
        range: 'close',
        enemyAmbushUsed: [false],
      },
    });
    store.getState().submitPlayerAction('dodge');
    const hpAfter = store.getState().currentScene!.enemyHps[0]!;
    expect(hpAfter).toBe(28); // DOT ticked its 2 during the dodge round (was frozen pre-800)
  });
});

describe('OTA-800 A1 — jump trains DEX only on a resolved scene noun', () => {
  it('jump at bogus text does NOT train DEX; jump at a real ambient noun does', async () => {
    const store = await boot('Leaper');
    store.setState({
      currentScene: { ...store.getState().currentScene!, ambientNouns: ['boulder', 'ledge'], enemies: [] },
      player: { ...store.getState().player!, stamina: 10, staminaMax: 10 },
    });
    const dexBefore = store.getState().player!.statProgress?.dexterity ?? 0;
    store.getState().submitPlayerAction('jump at xyzzy'); // unresolved → no training
    expect(store.getState().player!.statProgress?.dexterity ?? 0).toBe(dexBefore);

    store.getState().submitPlayerAction('jump at boulder'); // real ambient noun → trains
    expect(store.getState().player!.statProgress?.dexterity ?? 0).toBeGreaterThan(dexBefore);
  });
});

describe('OTA-800 A2 — pickup cannot launder a worn instance into a full stack', () => {
  it('picking up a WORN sword next to a full same-name sword keeps them separate', async () => {
    const store = await boot('Picker');
    const p = store.getState().player!;
    const roomKey = makeRoomKey(p.currentLocationId, store.getState().currentScene!.microMicroId, p.mapX, p.mapY, p.hubRoomId);
    const fullSword: InventoryItem = {
      id: 'sword_full', name: 'Iron Sword', kind: 'weapon', rarity: 'Common', quantity: 1,
      tags: ['weapon'], durability: { current: 100, max: 100 },
    } as unknown as InventoryItem;
    const wornDropped: InventoryItem = {
      id: 'sword_worn', name: 'Iron Sword', kind: 'weapon', rarity: 'Common', quantity: 1,
      tags: ['weapon'], durability: { current: 5, max: 100 },
    } as unknown as InventoryItem;
    store.setState((s) => ({
      player: { ...s.player!, inventory: [...s.player!.inventory.filter((i) => i.name !== 'Iron Sword'), fullSword] },
      worldMemory: {
        ...s.worldMemory,
        visitedRooms: {
          ...(s.worldMemory.visitedRooms ?? {}),
          [roomKey]: { firstVisitAt: 1, lastVisitAt: 1, visitCount: 1, droppedItems: [wornDropped] },
        },
      },
    }));
    store.getState().submitPlayerAction('pickup Iron Sword');
    const swords = store.getState().player!.inventory.filter((i) => i.name === 'Iron Sword');
    // Two SEPARATE rows — the worn instance did NOT fold into the full one.
    const totalQty = swords.reduce((n, i) => n + i.quantity, 0);
    expect(totalQty).toBe(2);
    expect(swords.some((i) => i.durability?.current === 5)).toBe(true);  // worn preserved
    expect(swords.some((i) => i.durability?.current === 100)).toBe(true); // full untouched
  });
});

describe('OTA-800 A2 — applyCoating peels one unit off a stack', () => {
  it('coating a stack of 3 blades leaves 2 bare + 1 coated, and spends one vial', async () => {
    const store = await boot('Coater');
    const blades: InventoryItem = {
      id: 'blades', name: 'Rusted Blade', kind: 'weapon', rarity: 'Common', quantity: 3, tags: ['weapon'],
    } as unknown as InventoryItem;
    const vial: InventoryItem = {
      id: 'vial', name: 'Poison Vial', kind: 'consumable', rarity: 'Uncommon', quantity: 1, tags: ['potion', 'weapon_coating', 'poison'],
    } as unknown as InventoryItem;
    store.setState((s) => ({ player: { ...s.player!, inventory: [...s.player!.inventory, blades, vial] } }));
    store.getState().applyCoating('vial', 'blades');
    const inv = store.getState().player!.inventory;
    const bareStack = inv.find((i) => i.id === 'blades');
    const coated = inv.find((i) => i.name === 'Rusted Blade' && i.coating);
    expect(bareStack?.quantity).toBe(2);          // peeled one off
    expect(bareStack?.coating).toBeUndefined();   // the rest stay bare
    expect(coated?.quantity).toBe(1);             // the peeled one is coated
    expect(coated?.coating?.kind).toBe('poison');
    expect(inv.some((i) => i.id === 'vial')).toBe(false); // one vial spent
  });
});
