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

// OTA-976 — wall flee. Owner: "when I summit some climbs [I] immediately get
// thrust into a fight with up to five enemies. there is no way to flee." Flee
// is now legal in wall fights: the NORMAL flee roll runs, and success is a
// one-tap dive for the base from ANY tier — double stamina per tier; if the
// tank empties partway the remaining tiers are a scaled fall. Failure keeps
// you on the wall and hands the enemies their opening, as on the ground.
// Dodge stays disabled up high; fleeing nothing on a wall stays refused.
import { useGameStore } from '../app/state/gameStore';
import { getRaces, getFactions } from '../app/engine/character';
import { findEnemyByName } from '../app/engine/encounter';

async function bootWallFight(opts: { stamina: number; dex?: number; enemies?: number }) {
  const store = useGameStore;
  await store.getState().hydrate();
  await store.getState().startNewGame({ name: 'Diver', raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
  store.getState().skipTutorial?.();
  await new Promise((r) => setTimeout(r, 25));
  const proto = findEnemyByName('Mud Spider') ?? findEnemyByName('Gutter Rat');
  const n = opts.enemies ?? 2;
  const foes = Array.from({ length: n }, (_, i) => {
    const e = JSON.parse(JSON.stringify(proto));
    e.hp = 9999;
    e.name = `${e.name} ${i + 1}`;
    return e;
  });
  const scene = store.getState().currentScene!;
  store.setState({
    currentScene: {
      ...scene,
      ambientNouns: ['guard tower', 'shore'],
      elevatedOn: { noun: 'guard tower', tier: 3, totalTiers: 4 },
      elevatedOverlayMeta: undefined,
      enemies: foes,
      enemyHps: foes.map((e: { hp: number }) => e.hp),
      activeEnemyIdx: 0,
      range: 'close',
      enemyAmbushUsed: foes.map(() => false),
      enemyKnockedOut: foes.map(() => false),
      enemyStatuses: foes.map(() => []),
      enemyArmorShred: foes.map(() => 0),
      enemyCorruptionStacks: foes.map(() => 0),
    },
  });
  store.setState((s) => ({
    player: {
      ...s.player!,
      hp: 100, hpMax: 100,
      stamina: opts.stamina, staminaMax: 20,
      // Age the character past the OTA-455 first-steps flee grace (which nudges
      // every failed escape to success for brand-new characters).
      recentTileHistory: ['t1', 't2', 't3', 't4', 't5', 't6', 't7', 't8'],
      stats: { ...s.player!.stats, dexterity: opts.dex ?? 20 },
    },
  }));
  return store;
}

async function act(store: typeof useGameStore, text: string, rollValue: number) {
  store.getState().submitPlayerAction(text);
  let guard = 0;
  while (store.getState().pendingRolls) {
    if (guard++ > 50) throw new Error('roll loop did not terminate');
    const pr = store.getState().pendingRolls!;
    const step = pr.steps[pr.currentStep]!;
    const count = step.count ?? 1;
    store.getState().resolveRollStep(Array.from({ length: count }, () => rollValue));
  }
  await new Promise((r) => setTimeout(r, 5));
}

describe('OTA-976 — wall flee: one tap, dive for the base', () => {
  // The escape check is an INTERNAL d20 (not the dice modal), so outcomes
  // can't be pinned per-roll. dex 20 vs DC 9 succeeds on any die; dex 1
  // fails ~35% per attempt — each test loops fresh boots until it observes
  // the outcome it asserts (flake odds < 1 in 4000 at 20 boots).
  it('a WON flee from tier 3 clears the fight, lands you on the ground, and burns double stamina', async () => {
    let done = false;
    for (let i = 0; i < 5 && !done; i++) {
      const store = await bootWallFight({ stamina: 10 });
      await act(store, 'flee', 20);
      if (store.getState().currentScene!.elevatedOn !== null) continue;
      done = true;
      expect(store.getState().gameLog.some((e) => e.text.includes('kick off the guard tower'))).toBe(true);
      expect(store.getState().currentScene!.enemies.length).toBe(0);
      // 3 tiers x2 = 6 stamina for the descent (the flee roll itself may cost more)
      expect(store.getState().player!.stamina).toBeLessThanOrEqual(4);
      expect(store.getState().gameLog.some((e) => e.text.includes('hit the ground moving'))).toBe(true);
    }
    expect(done).toBe(true);
  }, 120000);

  it('a WON flee with too little stamina covers what it can, then FALLS the rest', async () => {
    let done = false;
    for (let i = 0; i < 5 && !done; i++) {
      const store = await bootWallFight({ stamina: 2 });
      await act(store, 'flee', 20);
      if (store.getState().currentScene!.elevatedOn !== null) continue;
      done = true;
      expect(store.getState().currentScene!.enemies.length).toBe(0);
      const fallLine = store.getState().gameLog.find((e) => e.text.includes('are a fall.'));
      expect(fallLine).toBeTruthy();
      expect(store.getState().player!.hp).toBeLessThan(100);
      expect(store.getState().player!.stamina).toBe(0);
    }
    expect(done).toBe(true);
  }, 120000);

  it('a FAILED flee keeps you on the wall with the enemies, who get their opening', async () => {
    let observedFailure = false;
    for (let i = 0; i < 20 && !observedFailure; i++) {
      const store = await bootWallFight({ stamina: 10, dex: 1 });
      await act(store, 'flee', 1);
      if (store.getState().currentScene!.elevatedOn?.noun !== 'guard tower') continue;
      observedFailure = true;
      expect(store.getState().currentScene!.enemies.length).toBeGreaterThan(0);
      expect(store.getState().gameLog.some((e) => e.text.includes('kick off the guard tower'))).toBe(false);
      expect(store.getState().gameLog.some((e) => e.text.includes('No parry up here'))).toBe(true);
    }
    expect(observedFailure).toBe(true);
  }, 180000);

  it('dodge stays disabled on the wall', async () => {
    const store = await bootWallFight({ stamina: 10 });
    store.getState().submitPlayerAction('dodge');
    await new Promise((r) => setTimeout(r, 5));
    expect(store.getState().gameLog.some((e) => e.text.includes("can't dodge on the guard tower"))).toBe(true);
  });

  it('fleeing NOTHING on a wall is still refused', async () => {
    const store = await bootWallFight({ stamina: 10, enemies: 0 });
    store.setState((s) => ({
      currentScene: { ...s.currentScene!, enemies: [], enemyHps: [], activeEnemyIdx: 0, range: null },
    }));
    store.getState().submitPlayerAction('flee');
    await new Promise((r) => setTimeout(r, 5));
    expect(store.getState().gameLog.some((e) => e.text.includes('Nothing up here is chasing you'))).toBe(true);
    expect(store.getState().currentScene!.elevatedOn?.noun).toBe('guard tower');
  });
});
