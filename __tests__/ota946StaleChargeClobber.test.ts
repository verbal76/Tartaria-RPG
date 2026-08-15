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

// OTA-946 — the stale-charge clobber. Playtest: "Legacy of Power fades" printed four
// times while STR stayed buffed. Root cause: the time+stamina charge on 27 action
// paths wrote the player back from the PRE-TICK snapshot, undoing the status-effect
// tick — on dice-modal actions (every attack) timed buffs never ticked at all.
// This suite drives REAL attacks through the dice modal and requires the buff to
// tick 3 -> 2 -> 1 -> gone with exactly one fade line.
import { useGameStore } from '../app/state/gameStore';
import { getRaces, getFactions } from '../app/engine/character';
import { findEnemyByName } from '../app/engine/encounter';

const buffRounds = () =>
  (useGameStore.getState().player?.statusEffects ?? [])
    .filter((e) => e.label === 'TickProbe')
    .map((e) => e.remainingRounds)
    .join(',') || 'GONE';

async function bootCombatWithBuff() {
  const store = useGameStore;
  await store.getState().hydrate();
  await store.getState().startNewGame({ name: 'Ticker', raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
  store.getState().skipTutorial?.();
  const proto = findEnemyByName('Mud Spider') ?? findEnemyByName('Gutter Rat');
  const enemy = JSON.parse(JSON.stringify(proto));
  enemy.hp = 9999;
  const scene = store.getState().currentScene!;
  store.setState({
    currentScene: {
      ...scene, enemies: [enemy], enemyHps: [enemy.hp], activeEnemyIdx: 0, range: 'close',
      enemyAmbushUsed: [false], enemyKnockedOut: [false], enemyStatuses: [[]], enemyArmorShred: [0], enemyCorruptionStacks: [0],
    },
  });
  store.setState((s) => ({
    player: {
      ...s.player!, hp: 500, hpMax: 500,
      statusEffects: [...(s.player!.statusEffects ?? []), { kind: 'food_buff' as const, remainingRounds: 3, buffStat: 'strength' as const, buffBonus: 2, label: 'TickProbe' }],
    },
  }));
  return store;
}

async function attackResolvingAll(store: typeof useGameStore) {
  store.getState().submitPlayerAction('attack');
  let guard = 0;
  while (store.getState().pendingRolls) {
    if (guard++ > 50) throw new Error('roll loop did not terminate');
    const pr = store.getState().pendingRolls!;
    const step = pr.steps[pr.currentStep]!;
    const count = step.count ?? 1;
    store.getState().resolveRollStep(Array.from({ length: count }, () => 10));
  }
  await new Promise((r) => setTimeout(r, 5));
}

describe('OTA-946 — timed buffs tick during dice-modal combat actions', () => {
  it('a 3-round buff survives exactly 3 attacks, then fades ONCE', async () => {
    const store = await bootCombatWithBuff();
    expect(buffRounds()).toBe('3');
    await attackResolvingAll(store);
    expect(buffRounds()).toBe('2');
    await attackResolvingAll(store);
    expect(buffRounds()).toBe('1');
    await attackResolvingAll(store);
    expect(buffRounds()).toBe('GONE');
    await attackResolvingAll(store);
    expect(buffRounds()).toBe('GONE');
    const fades = store.getState().gameLog.filter((e) => e.text.includes('TickProbe fades')).length;
    expect(fades).toBe(1);
  });

  it('the attack still charges stamina and advances time (the write that used to clobber)', async () => {
    const store = await bootCombatWithBuff();
    const stam0 = store.getState().player!.stamina;
    const hours0 = store.getState().player!.hoursElapsed ?? 0;
    await attackResolvingAll(store);
    expect(store.getState().player!.stamina).toBeLessThan(stam0);
    expect(store.getState().player!.hoursElapsed ?? 0).toBeGreaterThan(hours0);
  });
});
