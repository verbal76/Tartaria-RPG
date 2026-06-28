// engine_Dev — recoverable thrown weapons. A durable thrown weapon (axe / knife
// / javelin) buries in the enemy and rolls THROW_RECOVERY_CHANCE to be pulled
// back out when the fight is WON; one-shot munitions (grenade / vial / shard)
// never qualify and still vanish. Guards both the tag rules and the live
// grant/clear path through resolveEnemyDefeat.

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('onnxruntime-react-native', () => ({
  InferenceSession: { create: jest.fn(async () => ({ run: jest.fn(async () => ({})) })) },
  Tensor: class { constructor(_t: string, _d: unknown, _s: unknown[]) { void _t; void _d; void _s; } },
}));
jest.mock('llama.rn', () => ({ initLlama: jest.fn(async () => ({ completion: jest.fn(async () => ({ text: '' })), release: jest.fn() })), releaseAllLlama: jest.fn() }));
jest.mock('react-native-executorch', () => ({}));
jest.mock('expo-file-system', () => ({ documentDirectory: '/tmp/', cacheDirectory: '/tmp/', getInfoAsync: jest.fn(async () => ({ exists: false })), makeDirectoryAsync: jest.fn(async () => {}), readAsStringAsync: jest.fn(async () => ''), writeAsStringAsync: jest.fn(async () => {}), deleteAsync: jest.fn(async () => {}), downloadAsync: jest.fn(async () => ({ uri: '' })), EncodingType: { UTF8: 'utf8', Base64: 'base64' } }));
jest.mock('expo-speech', () => ({ speak: jest.fn(), stop: jest.fn(), isSpeakingAsync: jest.fn(async () => false) }));
jest.mock('expo-av', () => ({ Audio: { setAudioModeAsync: jest.fn(), Sound: class { static createAsync = jest.fn(async () => ({ sound: { playAsync: jest.fn(async () => {}), unloadAsync: jest.fn(async () => {}) } })); } } }));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '0', applicationId: 'test' }));
jest.mock('expo-asset', () => ({ Asset: { fromModule: () => ({ downloadAsync: jest.fn(async () => {}), localUri: '' }) } }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => {}) }));
jest.mock('expo-constants', () => ({ default: { expoConfig: {} } }));
jest.mock('expo-font', () => ({ loadAsync: jest.fn(async () => {}) }));
jest.mock('expo-speech-recognition', () => ({}));
jest.mock('expo-updates', () => ({}));

import { useGameStore } from '../app/state/gameStore';
import { getRaces, getFactions } from '../app/engine/character';
import { findEnemyByName } from '../app/engine/encounter';
import { isRecoverableThrowable, snapshotThrownWeapon, THROW_RECOVERY_CHANCE } from '../app/engine/throwRecovery';
import type { InventoryItem } from '../app/engine/types';

const AXE: InventoryItem = {
  id: 'axe1', name: 'Tartarian Hand Axe (Throw)', kind: 'weapon', rarity: 'Common',
  quantity: 1, tags: ['throwable'], durability: { current: 6, max: 8 },
  instanceStats: { statBonuses: [{ stat: 'strength', amount: 3 }] },
};

describe('isRecoverableThrowable — the durable-vs-one-shot line', () => {
  it('a thrown weapon recovers', () => {
    expect(isRecoverableThrowable(AXE)).toBe(true);
    expect(isRecoverableThrowable({ kind: 'weapon', tags: ['throwable', 'thrown'] })).toBe(true);
  });
  it('one-shot munitions never recover', () => {
    expect(isRecoverableThrowable({ kind: 'weapon', tags: ['weapon', 'throwable', 'grenade'] })).toBe(false);
    expect(isRecoverableThrowable({ kind: 'weapon', tags: ['throwable', 'weapon_coating'] })).toBe(false);
    expect(isRecoverableThrowable({ kind: 'misc', tags: ['throwable'] })).toBe(false); // shard / sample / plate
  });
  it('a non-throwable or non-weapon never recovers', () => {
    expect(isRecoverableThrowable({ kind: 'weapon', tags: ['weapon'] })).toBe(false);
    expect(isRecoverableThrowable({ kind: 'misc', tags: ['loot'] })).toBe(false);
    expect(isRecoverableThrowable(null)).toBe(false);
  });
  it('snapshot preserves the per-instance identity at quantity 1', () => {
    const snap = snapshotThrownWeapon({ ...AXE, quantity: 5 });
    expect(snap.quantity).toBe(1);
    expect(snap.instanceStats).toEqual(AXE.instanceStats);
    expect(snap.durability).toEqual(AXE.durability);
  });
});

async function boot(name: string) {
  const store = useGameStore;
  await store.getState().hydrate();
  await store.getState().startNewGame({ name, raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
  store.getState().skipTutorial?.();
  return store;
}

function plantLoneEnemyWithBuriedAxe() {
  const proto = findEnemyByName('Mud Boar');
  if (!proto) throw new Error('test enemy not found');
  const enemy = JSON.parse(JSON.stringify(proto));
  const scene = useGameStore.getState().currentScene!;
  useGameStore.setState({
    currentScene: {
      ...scene,
      enemies: [enemy], enemyHps: [0], activeEnemyIdx: 0, range: 'close',
      enemyAmbushUsed: [false], enemyKnockedOut: [false], enemyStatuses: [[]],
      thrownRecoverables: [snapshotThrownWeapon(AXE)],
    },
  });
}

describe('recovery resolves when the fight is won', () => {
  beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });
  afterEach(() => { (Math.random as unknown as jest.Mock).mockRestore?.(); });

  it('a winning roll pulls the buried weapon back into the pack (instance preserved)', async () => {
    const store = await boot('Recover');
    plantLoneEnemyWithBuriedAxe();
    // Force the recovery roll to succeed (random < THROW_RECOVERY_CHANCE).
    jest.spyOn(Math, 'random').mockReturnValue(THROW_RECOVERY_CHANCE - 0.1);
    store.getState().resolveEnemyDefeat();
    const inv = store.getState().player!.inventory;
    const got = inv.find((i) => i.name === AXE.name);
    expect(got).toBeTruthy();
    expect(got!.instanceStats).toEqual(AXE.instanceStats);
    expect(store.getState().currentScene!.thrownRecoverables ?? []).toHaveLength(0);
  });

  it('a losing roll forfeits the weapon and still clears the buried list', async () => {
    const store = await boot('Forfeit');
    plantLoneEnemyWithBuriedAxe();
    // Force the recovery roll to fail (random >= THROW_RECOVERY_CHANCE).
    jest.spyOn(Math, 'random').mockReturnValue(THROW_RECOVERY_CHANCE + 0.1);
    store.getState().resolveEnemyDefeat();
    const inv = store.getState().player!.inventory;
    expect(inv.find((i) => i.name === AXE.name)).toBeFalsy();
    expect(store.getState().currentScene!.thrownRecoverables ?? []).toHaveLength(0);
  });
});
