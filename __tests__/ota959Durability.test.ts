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
  Audio: { setAudioModeAsync: jest.fn(), Sound: class { static createAsync: any = jest.fn(async () => ({ sound: { playAsync: jest.fn(), unloadAsync: jest.fn() } })); } },
}));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '0', applicationId: 'test' }));
jest.mock('expo-asset', () => ({ Asset: { fromModule: () => ({ downloadAsync: jest.fn(async () => {}), localUri: '' }) } }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => {}) }));
jest.mock('expo-constants', () => ({ default: { expoConfig: {} } }));
jest.mock('expo-font', () => ({ loadAsync: jest.fn(async () => {}) }));
jest.mock('expo-speech-recognition', () => ({}));
jest.mock('expo-updates', () => ({}));

// OTA-959 — durability rebalance. Owner's log: a freshly crafted 5-piece set
// (cap, gloves, trousers, wraps, brow guard) all shattered inside ONE ~10
// minute pack fight, AC 24 -> 17. Root cause (audited): every landed enemy
// hit chipped EVERY worn armor piece — a 5-piece set spent 5 durability per
// blow, so more armor died faster. Now: one landed blow chips ONE worn piece.
// And armor/weapons get the rope's courtesy — a fraying warning at 3
// durability, instead of jumping straight to "shatters from wear. It is gone."
import { useGameStore } from '../app/state/gameStore';
import { getRaces, getFactions } from '../app/engine/character';
import { findEnemyByName } from '../app/engine/encounter';
import type { InventoryItem } from '../app/engine/types';

const plate = (id: string, name: string, cur: number, max: number): InventoryItem => ({
  id, name, kind: 'armor', rarity: 'Common', quantity: 1, tags: ['armor'],
  durability: { current: cur, max },
});

async function bootFight(pieces: InventoryItem[], slots: Record<string, string | undefined>) {
  const store = useGameStore;
  await store.getState().hydrate();
  await store.getState().startNewGame({ name: 'Anvil', raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
  store.getState().skipTutorial?.();
  await new Promise((r) => setTimeout(r, 25));
  const proto = findEnemyByName('Mud Spider') ?? findEnemyByName('Gutter Rat');
  const foe = JSON.parse(JSON.stringify(proto));
  foe.hp = 9999;
  const scene = store.getState().currentScene!;
  store.setState({
    currentScene: {
      ...scene,
      enemies: [foe],
      enemyHps: [9999],
      activeEnemyIdx: 0,
      range: 'close',
      enemyAmbushUsed: [false],
      enemyKnockedOut: [false],
      enemyStatuses: [[]],
      enemyArmorShred: [0],
      enemyCorruptionStacks: [0],
    },
  });
  store.setState((s) => ({
    player: {
      ...s.player!,
      hp: 500, hpMax: 500, stamina: 50, staminaMax: 50,
      inventory: [...s.player!.inventory, ...pieces],
      equipped: { ...(s.player!.equipped ?? {}), ...slots },
    },
  }));
  return store;
}

async function attackRound(store: typeof useGameStore) {
  await store.getState().submitPlayerAction('attack');
  let guard = 0;
  while (store.getState().pendingRolls) {
    if (guard++ > 50) throw new Error('roll loop did not terminate');
    const pr = store.getState().pendingRolls!;
    const step = pr.steps[pr.currentStep]!;
    store.getState().resolveRollStep(Array.from({ length: step.count ?? 1 }, () => 15));
  }
  await new Promise((r) => setTimeout(r, 5));
}

describe('OTA-959 — one landed blow chips ONE worn piece, not the set', () => {
  it('total durability lost across a 3-piece set equals the number of landed hits', async () => {
    const store = await bootFight(
      [plate('a1', 'Test Ward Alpha', 20, 20), plate('a2', 'Test Ward Beta', 20, 20), plate('a3', 'Test Ward Gamma', 20, 20)],
      { head: 'Test Ward Alpha', headId: 'a1', chest: 'Test Ward Beta', chestId: 'a2', legs: 'Test Ward Gamma', legsId: 'a3' },
    );
    for (let i = 0; i < 10; i++) await attackRound(store);
    const log = store.getState().gameLog.map((e) => e.text).join('\n');
    const landed = (log.match(/deals \d+ \w+ damage/g) ?? []).length;
    expect(landed).toBeGreaterThan(0); // the spider connected at least once
    const inv = store.getState().player!.inventory;
    const total = ['a1', 'a2', 'a3']
      .map((id) => inv.find((i) => i.id === id)?.durability?.current ?? 0)
      .reduce((a, b) => a + b, 0);
    // OLD behavior: 60 - 3×landed. NEW: exactly one point per landed blow.
    expect(60 - total).toBe(landed);
  });
});

describe('OTA-959 — armor frays out loud before it shatters', () => {
  it('the piece that drops to 3 durability warns the player', async () => {
    const store = await bootFight(
      [plate('a1', 'Test Ward Alpha', 4, 10)],
      { head: 'Test Ward Alpha', headId: 'a1' },
    );
    for (let i = 0; i < 20; i++) {
      await attackRound(store);
      const cur = store.getState().player!.inventory.find((i) => i.id === 'a1')?.durability?.current ?? 0;
      if (cur <= 3) break;
    }
    const log = store.getState().gameLog.map((e) => e.text).join('\n');
    expect(log).toMatch(/Test Ward Alpha is coming apart/);
  });
});
