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

// OTA-954 — no involuntary footwork. Owner: attacking at mid with his fused
// close-only spike auto-walked him into arm's reach, where the enemy landed a
// crit on the approach — "I didn't move closer, using the weapon moved me
// closer." An out-of-range attack now REFUSES (free: no stamina, no time, no
// enemy counters), names the weapon's true reach, and leaves the move as the
// player's explicit call. In-range attacks — melee at close, ranged from mid —
// are untouched.
import { useGameStore } from '../app/state/gameStore';
import { getRaces, getFactions } from '../app/engine/character';
import { findEnemyByName } from '../app/engine/encounter';

async function bootFight(range: 'mid' | 'close') {
  const store = useGameStore;
  await store.getState().hydrate();
  await store.getState().startNewGame({ name: 'Footing', raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
  store.getState().skipTutorial?.();
  await new Promise((r) => setTimeout(r, 25));
  const proto = findEnemyByName('Mud Spider') ?? findEnemyByName('Gutter Rat');
  const foe = JSON.parse(JSON.stringify(proto));
  foe.hp = 9999;
  const scene = store.getState().currentScene!;
  store.setState({
    currentScene: {
      ...scene,
      elevatedOn: null,
      enemies: [foe],
      enemyHps: [foe.hp],
      activeEnemyIdx: 0,
      range,
      enemyAmbushUsed: [false],
      enemyKnockedOut: [false],
      enemyStatuses: [[]],
      enemyArmorShred: [0],
      enemyCorruptionStacks: [0],
    },
  });
  store.setState((s) => ({ player: { ...s.player!, hp: 100, hpMax: 100, stamina: 20, staminaMax: 20 } }));
  return store;
}

function equipCloseOnly(store: typeof useGameStore) {
  // A fused-style weapon: NOT in the weapon catalog, so reach resolves to
  // melee (close only) — the owner's exact Resonant Spike situation.
  store.setState((s) => ({
    player: {
      ...s.player!,
      inventory: [
        ...s.player!.inventory,
        { id: 'spike1', name: 'Resonant Spike', kind: 'weapon' as const, rarity: 'Rare' as const, quantity: 1, tags: ['fused'] },
      ],
      equipped: { ...(s.player!.equipped ?? {}), main: 'Resonant Spike', mainId: 'spike1' },
    },
  }));
}

function equipRanged(store: typeof useGameStore) {
  store.setState((s) => ({
    player: {
      ...s.player!,
      inventory: [
        ...s.player!.inventory,
        { id: 'bow1', name: 'Salvaged Bow', kind: 'weapon' as const, rarity: 'Common' as const, quantity: 1, tags: [] },
      ],
      equipped: { ...(s.player!.equipped ?? {}), main: 'Salvaged Bow', mainId: 'bow1' },
    },
  }));
}

async function drainRolls(store: typeof useGameStore) {
  let guard = 0;
  while (store.getState().pendingRolls) {
    if (guard++ > 50) throw new Error('roll loop did not terminate');
    const pr = store.getState().pendingRolls!;
    const step = pr.steps[pr.currentStep]!;
    store.getState().resolveRollStep(Array.from({ length: step.count ?? 1 }, () => 10));
  }
  await new Promise((r) => setTimeout(r, 5));
}

describe('OTA-954 — out-of-range attack refuses; it never moves you', () => {
  it('close-only weapon at mid: refused, range/HP/stamina untouched, no roll starts', async () => {
    const store = await bootFight('mid');
    equipCloseOnly(store);
    store.getState().submitPlayerAction('attack');
    await new Promise((r) => setTimeout(r, 5));
    expect(store.getState().pendingRolls).toBeFalsy();
    const refusal = store.getState().gameLog.find((e) => e.text.includes('ADVANCE to close in'));
    expect(refusal).toBeTruthy();
    expect(refusal!.text).toContain('Resonant Spike');
    expect(store.getState().currentScene!.range).toBe('mid');
    expect(store.getState().player!.hp).toBe(100);
    expect(store.getState().player!.stamina).toBe(20);
    expect(store.getState().gameLog.some((e) => e.text.includes('closing the gap for you'))).toBe(false);
  });

  it('the refusal answers every retry (no dedup silence)', async () => {
    const store = await bootFight('mid');
    equipCloseOnly(store);
    store.getState().submitPlayerAction('attack');
    await new Promise((r) => setTimeout(r, 5));
    store.getState().submitPlayerAction('attack');
    await new Promise((r) => setTimeout(r, 5));
    const refusals = store.getState().gameLog.filter((e) => e.text.includes('ADVANCE to close in'));
    expect(refusals.length).toBe(2);
  });

  it('advancing BY CHOICE then attacking works: the move belongs to the player, not the game', async () => {
    const store = await bootFight('mid');
    equipCloseOnly(store);
    store.getState().submitPlayerAction('advance');
    await drainRolls(store);
    expect(store.getState().currentScene!.range).toBe('close');
    store.getState().submitPlayerAction('attack');
    await drainRolls(store);
    expect(store.getState().gameLog.some((e) => e.channel === 'combat' && /You — d20/.test(e.text))).toBe(true);
  });

  it('a REAL ranged weapon attacks from mid without any refusal (regression)', async () => {
    const store = await bootFight('mid');
    equipRanged(store);
    store.getState().submitPlayerAction('attack');
    await drainRolls(store);
    expect(store.getState().gameLog.some((e) => e.text.includes('ADVANCE to close in'))).toBe(false);
    expect(store.getState().gameLog.some((e) => e.channel === 'combat' && /You — d20/.test(e.text))).toBe(true);
    expect(store.getState().currentScene!.range).toBe('mid');
  });

  it('melee at close still attacks normally (regression)', async () => {
    const store = await bootFight('close');
    equipCloseOnly(store);
    store.getState().submitPlayerAction('attack');
    await drainRolls(store);
    expect(store.getState().gameLog.some((e) => e.channel === 'combat' && /You — d20/.test(e.text))).toBe(true);
  });
});
