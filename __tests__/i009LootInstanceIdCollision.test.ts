// I-009 / D-loot-instance-id-collision — production defect repair.
//
// resolveEnemyDefeat() (gameStore.ts) minted each newly-rolled loot item's id
// as `loot_${Date.now()}_${i}`, where `i` is the index WITHIN THIS CALL's own
// reduce over lootDrops — it always restarts at 0. Two separate kills resolved
// within the same wall-clock millisecond minted identical ids for their first
// (and any index-aligned) loot item, even though they are two entirely
// different items.
//
// This matters because instance ids are load-bearing: OTA-800's own comment
// (gameStore.ts ~24087-24099) documents that resolving an equipped/thrown
// item by NAME instead of id let "the throw consume the WRONG instance" when
// two same-named stacks existed — id-based lookup (`equipped.mainId`/`offId`,
// `.find(i => i.id === equippedId)`) was introduced specifically to fix that
// class of bug. An ordinary id collision between two DIFFERENT items silently
// reopens the same class of defect: whichever colliding row sits first in the
// inventory array answers for both.
//
// FIX, REVISED under owner ruling I (repository-wide ID-mint/RNG census):
// the original repair appended a `Math.random().toString(36)` suffix,
// matching ~30 OTHER mint sites in this file — but that census found a
// SECOND, more authoritative convention already established for this exact
// defect class: `freshInstanceId()` (gameStore.ts:1470, OTA-434 — "Many grant
// sites minted ids as `${prefix}_${Date.now()}`... This monotonic counter
// makes each id unique regardless of clock resolution"), already used at 29+
// other grant sites. Unlike the Math.random() idiom, freshInstanceId() draws
// NO entropy from Math.random() at all — Math.random is globally seeded for
// canonical-simulation reproducibility (test-utils/canonical/rngLedger.ts)
// and every draw is counted, so the Math.random()-suffix version of this fix
// silently shifted every subsequent gameplay RNG draw after a kill with loot,
// changing canonical-walk outcomes it shouldn't have. freshInstanceId's
// monotonic counter fixes the SAME collision deterministically, with zero
// RNG draws and zero collision probability (not just a very low one) — the
// two `loot_${Date.now()}_${i}` mint sites inside resolveEnemyDefeat's
// lootDrops.reduce now call `freshInstanceId('loot')` instead.
//
// This test drives the real production door: two back-to-back
// `resolveEnemyDefeat()` calls (the same store action a live Guardian/enemy
// kill invokes) against two different single-enemy scenes, with `Date.now`
// mocked to return the identical millisecond across both calls — the exact
// condition the ledger describes ("two kills resolved in the same wall-clock
// millisecond").

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

import { useGameStore, freshInstanceId } from '../app/state/gameStore';
import { getRaces, getFactions } from '../app/engine/character';
import type { Enemy, InventoryItem } from '../app/engine/types';

function makeEnemy(name: string, lootName: string): Enemy {
  return {
    name,
    type: 'Animal',
    abilityPoint: '2',
    attack: '1',
    damage: '1d4',
    hp: 1,
    rarity: 'Common',
    loot: [lootName],
  } as Enemy;
}

async function standAtSceneWithSoloEnemy(enemy: Enemy) {
  const store = useGameStore;
  await store.getState().hydrate();
  await store.getState().startNewGame({ name: 'Walker', raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
  store.getState().skipTutorial?.();
  await new Promise((r) => setTimeout(r, 25));

  store.setState((s) => ({
    currentScreen: 'exploration',
    currentScene: {
      ...s.currentScene!,
      enemies: [enemy],
      enemyHps: [enemy.hp],
      activeEnemyIdx: 0,
    },
  }));
  return store;
}

describe('I-009 — loot instance ids never collide, even across the same wall-clock millisecond', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('two different kills resolved in the SAME millisecond mint two DIFFERENT loot item ids, minted deterministically with zero RNG draws', async () => {
    // Force both resolveEnemyDefeat() calls to observe the identical
    // Date.now() value — the exact condition the ledger's claim depends on.
    const frozenNow = 1_700_000_000_000;
    jest.spyOn(Date, 'now').mockReturnValue(frozenNow);

    const store1 = await standAtSceneWithSoloEnemy(makeEnemy('Silt Rat', 'Weathered Blade'));
    store1.getState().resolveEnemyDefeat();
    const invAfterFirst = store1.getState().player!.inventory;
    const firstNewItem = invAfterFirst.find((i) => i.name === 'Weathered Blade');
    expect(firstNewItem).toBeDefined();

    // A second, independent kill — different enemy, different loot name so it
    // can never legitimately stack-merge with the first (stackCompatible()
    // requires matching name+kind) — resolved under the SAME frozen
    // Date.now(). Reuse the same store/save-slot; only the scene changes.
    store1.setState((s) => ({
      currentScene: {
        ...s.currentScene!,
        enemies: [makeEnemy('Mud Crab', 'Rusted Pipe')],
        enemyHps: [1],
        activeEnemyIdx: 0,
      },
    }));
    store1.getState().resolveEnemyDefeat();

    const invAfterSecond = store1.getState().player!.inventory;
    const secondNewItem = invAfterSecond.find((i) => i.name === 'Rusted Pipe');
    expect(secondNewItem).toBeDefined();

    // THE DEFECT, if unfixed: both items mint id `loot_<frozenNow>_0` because
    // each call's reduce restarts its index at 0. Two DIFFERENT items must
    // never share one id — that invariant is what equip-by-id / throw-by-id
    // resolution (OTA-800) and every other instance-id consumer depend on.
    expect(firstNewItem!.id).not.toBe(secondNewItem!.id);

    // Both ids follow freshInstanceId's `loot_<ms>_<base36 counter>` shape,
    // and the SECOND grant's counter component is strictly greater than the
    // first's — proof this is the monotonic OTA-434 counter, not a random
    // suffix (a random suffix would have no ordering guarantee at all).
    const suffixOf = (id: string) => parseInt(id.slice(`loot_${frozenNow}_`.length), 36);
    expect(firstNewItem!.id.startsWith(`loot_${frozenNow}_`)).toBe(true);
    expect(secondNewItem!.id.startsWith(`loot_${frozenNow}_`)).toBe(true);
    expect(suffixOf(secondNewItem!.id)).toBeGreaterThan(suffixOf(firstNewItem!.id));
  });

  it('freshInstanceId (the fix\'s helper, OTA-434) draws zero RNG regardless of call volume — the owner\'s core determinism concern', () => {
    // Isolated unit check on the helper itself, independent of any scene
    // setup: proves the fix cannot shift the seeded Math.random() stream that
    // test-utils/canonical/rngLedger.ts instruments for canonical-walk
    // reproducibility, no matter how many times it is called.
    const randomSpy = jest.spyOn(Math, 'random');
    randomSpy.mockClear();
    const ids = new Set<string>();
    for (let n = 0; n < 50; n++) ids.add(freshInstanceId('loot'));
    expect(ids.size).toBe(50); // all 50 distinct, even minted back-to-back
    expect(randomSpy).not.toHaveBeenCalled();
    randomSpy.mockRestore();
  });

  it('negative control: an unfrozen clock still produces two distinct items with distinct ids (no regression from the fix)', async () => {
    const store = await standAtSceneWithSoloEnemy(makeEnemy('Silt Rat', 'Weathered Blade'));
    store.getState().resolveEnemyDefeat();
    const first = store.getState().player!.inventory.find((i) => i.name === 'Weathered Blade');
    expect(first).toBeDefined();

    store.setState((s) => ({
      currentScene: {
        ...s.currentScene!,
        enemies: [makeEnemy('Mud Crab', 'Rusted Pipe')],
        enemyHps: [1],
        activeEnemyIdx: 0,
      },
    }));
    store.getState().resolveEnemyDefeat();
    const second = store.getState().player!.inventory.find((i) => i.name === 'Rusted Pipe');
    expect(second).toBeDefined();
    expect(first!.id).not.toBe(second!.id);
  });

  it('demonstrates the OTA-800-class downstream harm a collision would cause: id-based lookup resolves the WRONG instance when two rows share an id', async () => {
    // This does not depend on resolveEnemyDefeat at all — it isolates the
    // consumption side (the exact `.find(i => i.id === equippedId)` pattern
    // used at gameStore.ts:3332 and :24097) to show that IF a collision ever
    // reaches the inventory array (as the test above proves it can, pre-fix),
    // the consumer silently picks the wrong item — the same class of bug
    // OTA-800's own comment documents.
    const colliding: InventoryItem[] = [
      { id: 'loot_1700000000000_0', name: 'Weathered Blade', kind: 'weapon', rarity: 'Common', quantity: 1, tags: [] },
      { id: 'loot_1700000000000_0', name: 'Rusted Pipe', kind: 'weapon', rarity: 'Common', quantity: 1, tags: [] },
    ];
    // The player equipped the SECOND item (Rusted Pipe) — equipped.mainId is
    // stamped with its id, per gameStore.ts:6311.
    const equippedId = colliding[1]!.id;
    const resolved = colliding.find((i) => i.id === equippedId);
    // THE HARM: id-based lookup returns whichever row sits FIRST in the
    // array — the Weathered Blade — not the Rusted Pipe the player actually
    // equipped. This assertion documents the harm mechanism; it is expected
    // to hold given the fixture above regardless of the gameStore.ts fix,
    // because the fixture manually constructs a collision the fix prevents
    // from ever being minted in the first place.
    expect(resolved!.name).toBe('Weathered Blade');
    expect(resolved!.name).not.toBe('Rusted Pipe');
  });
});
