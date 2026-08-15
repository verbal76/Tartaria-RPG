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

// OTA-917 — a coated BAREHANDED-tag weapon whose name contains a body word ("Mud-fist Wraps")
// must still apply its coating. Before the fix, isBareHandAttack("attack with the mud-fist wraps")
// matched "fist" -> barehand=true -> the coating block was skipped entirely.
import { useGameStore } from '../app/state/gameStore';
import { getRaces, getFactions } from '../app/engine/character';
import { findEnemyByName } from '../app/engine/encounter';

async function boot(name: string) {
  const store = useGameStore;
  await store.getState().hydrate();
  await store.getState().startNewGame({ name, raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
  store.getState().skipTutorial?.();
  return store;
}

function plant(name: string) {
  const proto = findEnemyByName(name);
  if (!proto) throw new Error(`test enemy not found: ${name}`);
  const enemy = JSON.parse(JSON.stringify(proto));
  enemy.hp = 9999; // survive the swing so the coating DOT seeds
  const scene = useGameStore.getState().currentScene!;
  useGameStore.setState({
    currentScene: {
      ...scene,
      enemies: [enemy], enemyHps: [enemy.hp], activeEnemyIdx: 0, range: 'close',
      enemyAmbushUsed: [false], enemyKnockedOut: [false], enemyStatuses: [[]],
      enemyArmorShred: [0], enemyCorruptionStacks: [0],
    },
  });
  return enemy;
}

function equipBarehandCoated() {
  const store = useGameStore;
  const p = store.getState().player!;
  const id = 'bh-coated';
  const item: any = {
    id, name: 'Mud-fist Wraps', kind: 'weapon', quantity: 1,
    tags: ['weapon', 'starter', 'barehanded', 'melee'],
    coating: { kind: 'poison', dice: '1d4', label: 'Poisoned' },
  };
  useGameStore.setState({
    player: {
      ...p,
      inventory: [...(p.inventory ?? []).filter((i) => i.id !== id), item],
      equipped: { ...(p.equipped ?? {}), main: 'Mud-fist Wraps', mainId: id },
    },
  });
}

async function attackResolvingAll(actionText: string) {
  const store = useGameStore;
  await store.getState().submitPlayerAction(actionText);
  let guard = 0;
  while (store.getState().pendingRolls) {
    if (guard++ > 50) throw new Error('roll-step loop did not terminate');
    const pr = store.getState().pendingRolls!;
    const step = pr.steps[pr.currentStep]!;
    const values = step.id === 'attack'
      ? [20]
      : Array.from({ length: step.count ?? 1 }, () => step.sides ?? 1);
    store.getState().resolveRollStep(values);
  }
}

describe('OTA-917 — coated barehanded weapon applies its coating', () => {
  let rngSpy: jest.SpyInstance;
  beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });
  afterEach(() => { if (rngSpy) rngSpy.mockRestore(); });

  it('a coated Mud-fist Wraps ("fist" in the name) seeds its coating DOT', async () => {
    const store = await boot('BareCoat');
    plant('Mud Lurker');                 // Mud Creature — NEUTRAL to poison, so the coat always lands
    equipBarehandCoated();
    rngSpy = jest.spyOn(Math, 'random').mockReturnValue(0.05); // pass any resist gate
    await attackResolvingAll('attack with the mud-fist wraps');
    const statuses = store.getState().currentScene!.enemyStatuses?.[0] ?? [];
    const log = store.getState().gameLog.map((l) => l.text).join('\n');
    expect(statuses.some((st: any) => st.kind === 'poison_coat')).toBe(true);
    expect(/coating fails to take/i.test(log)).toBe(false);
  });
});
