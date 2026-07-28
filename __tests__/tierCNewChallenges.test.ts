// arb54/arb55 — the two Tier-C challenges enabled last: Protector of the
// Forgotten (defense_of_the_enclave, one-shot d20+STR to hold the breach) and
// Shadow Diver (trap_dives_of_the_stair, a RETRYABLE d20+DEX gauntlet — three
// clean dives earn the title). Drives them through the real submitPlayerAction
// router (scout verb → free assessment; commit verb → the roll) and asserts the
// TitleProgress counters + earnedTitles.

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

async function freshGame() {
  const store = useGameStore;
  await store.getState().hydrate();
  const race = getRaces()[0]!;
  const fac = getFactions()[0]!;
  await store.getState().startNewGame({ name: 'Delver', raceId: race.id, factionId: fac.id });
  store.getState().skipTutorial?.();
  store.setState((s) => (s.currentScene ? { currentScene: { ...s.currentScene, enemies: [], enemyHps: [], activeEnemyIdx: 0 } } : s));
  return store;
}

/** Place the player on a tile and give them the stat we key the check off. */
function stage(store: typeof useGameStore, locationId: string, stat: 'strength' | 'dexterity', value: number) {
  store.setState((s) =>
    s.player
      ? { player: { ...s.player, currentLocationId: locationId, stats: { ...s.player.stats, [stat]: value } } }
      : s,
  );
}

const logText = (store: typeof useGameStore) => store.getState().gameLog.map((e) => e.text).join('\n');

describe('arb54 — Protector of the Forgotten (defense_of_the_enclave)', () => {
  beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });
  const realRandom = Math.random;
  afterEach(() => { Math.random = realRandom; });

  it('SCOUT is free and reports the STR check without awarding anything', async () => {
    const store = await freshGame();
    stage(store, 'tartarian_enclave', 'strength', 8);
    Math.random = () => 0.72; // roll 15 if anything rolled — but scouting rolls nothing
    store.getState().submitPlayerAction('scout the breach');
    expect(logText(store)).toMatch(/DC 15/);
    expect(store.getState().player!.titleProgress?.settlementsDefended ?? 0).toBe(0);
    expect(store.getState().player!.earnedTitles ?? []).not.toContain('protector_of_the_forgotten');
  });

  it('a passed one-shot stand banks settlementsDefended and earns the title', async () => {
    const store = await freshGame();
    stage(store, 'tartarian_enclave', 'strength', 8);
    Math.random = () => 0.72; // roll = 1 + floor(0.72*20) = 15; 15 + 8 = 23 >= 15 → pass (not nat-20)
    store.getState().submitPlayerAction('defend the enclave');
    expect(store.getState().player!.titleProgress?.settlementsDefended).toBe(1);
    expect(store.getState().player!.earnedTitles ?? []).toContain('protector_of_the_forgotten');
    // one-shot: recorded as succeeded so it can't be re-run
    expect(store.getState().player!.challengeAttempts?.defense_of_the_enclave).toBe('succeeded');
  });

  it('a failed stand is one-shot — no title, attempt spent, no Warden fallback text', async () => {
    const store = await freshGame();
    stage(store, 'tartarian_enclave', 'strength', 2);
    Math.random = () => 0.0; // natural 1 → always fails
    store.getState().submitPlayerAction('defend the enclave');
    expect(store.getState().player!.titleProgress?.settlementsDefended ?? 0).toBe(0);
    expect(store.getState().player!.challengeAttempts?.defense_of_the_enclave).toBe('failed');
    // must use the enclave's own fail line, never the Warden cathedral fallback
    expect(logText(store)).not.toMatch(/nave|cathedral/i);
  });
});

describe('arb55 — Shadow Diver (trap_dives_of_the_stair)', () => {
  beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });
  const realRandom = Math.random;
  afterEach(() => { Math.random = realRandom; });

  it('SCOUT is free and reports the DEX check + banked count', async () => {
    const store = await freshGame();
    stage(store, 'endless_stair', 'dexterity', 10);
    store.getState().submitPlayerAction('examine the stair');
    expect(logText(store)).toMatch(/DC 13/);
    expect(logText(store)).toMatch(/0\/3/);
    expect(store.getState().player!.titleProgress?.trapCleanDives ?? 0).toBe(0);
  });

  it('three clean dives bank trapCleanDives and earn Shadow Diver (retryable)', async () => {
    const store = await freshGame();
    stage(store, 'endless_stair', 'dexterity', 10);
    Math.random = () => 0.72; // roll 15 + DEX 10 = 25 ≥ 13 → clean every dive
    store.getState().submitPlayerAction('dive the stair');
    store.getState().submitPlayerAction('dive the stair');
    store.getState().submitPlayerAction('dive the stair');
    expect(store.getState().player!.titleProgress?.trapCleanDives).toBe(3);
    expect(store.getState().player!.earnedTitles ?? []).toContain('shadow_diver');
  });

  it('a missed dive springs a non-lethal trap and banks nothing; you can dive again', async () => {
    const store = await freshGame();
    stage(store, 'endless_stair', 'dexterity', 1);
    // Seed HP low to prove the trap never drops below 1.
    store.setState((s) => (s.player ? { player: { ...s.player, hp: 3, hpMax: 30 } } : s));
    Math.random = () => 0.0; // natural 1 → miss; 1d6 = 1+floor(0)=1 damage
    store.getState().submitPlayerAction('dive the stair');
    expect(store.getState().player!.titleProgress?.trapCleanDives ?? 0).toBe(0);
    expect(store.getState().player!.hp).toBeGreaterThanOrEqual(1);
    expect(store.getState().player!.earnedTitles ?? []).not.toContain('shadow_diver');
  });
});
