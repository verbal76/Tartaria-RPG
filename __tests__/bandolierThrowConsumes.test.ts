// OTA-604 — a bandolier throw must SPEND the throwable. Regression for a
// player report: "I had 1 throwing axe in my bandolier and I threw it about 50
// times." throwFromBandolier resolves the throw as an off-hand ATTACK, and the
// attack path only consumes a throwable on a HIT (consumption is bundled into
// the hit-only weapon-wear block) — so a miss left the axe in hand forever.
// The fix tops up consumption when the attack didn't already spend it, so every
// throw costs exactly one unit (and the slot clears off the bandolier at 0).

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
import { findEnemyByName } from '../app/engine/encounter';
import type { InventoryItem } from '../app/engine/types';

const AXE = 'Bone Throwing Axe'; // catalog weapon, tagged 'throwable'

function plantEnemy(name = 'Mud Boar') {
  const proto = findEnemyByName(name);
  if (!proto) throw new Error('test enemy not found');
  const enemy = JSON.parse(JSON.stringify(proto));
  const scene = useGameStore.getState().currentScene!;
  useGameStore.setState({
    currentScene: {
      ...scene,
      enemies: [enemy],
      enemyHps: [enemy.hp],
      activeEnemyIdx: 0,
      range: 'close',
      enemyAmbushUsed: [false],
    },
  });
}

async function bootWithAxe(qty: number) {
  const store = useGameStore;
  await store.getState().hydrate();
  const race = getRaces()[0]!;
  const fac = getFactions()[0]!;
  await store.getState().startNewGame({ name: 'Thrower', raceId: race.id, factionId: fac.id });
  store.getState().skipTutorial?.();
  // Drop a throwable axe stack into the pack.
  const axe = {
    id: 'axe_1',
    name: AXE,
    kind: 'weapon',
    quantity: qty,
    rarity: 'Common',
    tags: ['throwable', 'weapon', 'ranged', 'thrown', 'axe', 'giants'],
  } as unknown as InventoryItem;
  store.setState((s) => (s.player ? { player: { ...s.player, inventory: [...s.player.inventory, axe] } } : s));
  store.getState().stowInBandolier(AXE);
  plantEnemy();
  return store;
}

describe('bandolier throw consumes the throwable — settled when the roll closes', () => {
  beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

  function drain(store: typeof useGameStore) {
    let guard = 0;
    while (store.getState().pendingRolls) {
      if (guard++ > 50) throw new Error('roll loop did not terminate');
      const pr = store.getState().pendingRolls!;
      const step = pr.steps[pr.currentStep]!;
      store.getState().resolveRollStep(Array.from({ length: step.count ?? 1 }, () => 20));
    }
  }

  it('one COMPLETED throw spends exactly one unit and puts the real hand back', async () => {
    const store = await bootWithAxe(2);
    store.getState().throwFromBandolier(AXE);
    // The dice modal owns the throw now — the spend + off-hand restore settle
    // when it closes, so the damage phase reads the AXE, not the restored hand.
    expect(store.getState().pendingRolls).toBeTruthy();
    drain(store);
    const after = store.getState().player!.inventory.find((i) => i.id === 'axe_1');
    expect(after?.quantity ?? 0).toBe(1); // exactly one spent — not 0, not 2
  });

  it('the last unit clears the bandolier slot', async () => {
    const store = await bootWithAxe(1);
    expect(store.getState().player!.equipped?.bandolierIds ?? []).toContain('axe_1');
    store.getState().throwFromBandolier(AXE);
    drain(store);
    const gone = !store.getState().player!.inventory.some((i) => i.id === 'axe_1');
    expect(gone).toBe(true);
    expect(store.getState().player!.equipped?.bandolierIds ?? []).not.toContain('axe_1');
  });
});
