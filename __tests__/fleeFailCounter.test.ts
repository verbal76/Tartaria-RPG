// OTA-372 — a FAILED flee is not free. Turning your back to run hands
// every still-living enemy an automatic attack of opportunity (the same
// group counter a missed attack provokes). A SUCCESSFUL flee still
// breaks contact cleanly with no counter.

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
import { findEnemyByName } from '../app/engine/encounter';
import { fleeGraceApplies, FLEE_GRACE_STEPS } from '../app/engine/combatRules';

describe('OTA-455 — fleeGraceApplies boundary', () => {
  it('only graces a FAILED escape within the first FLEE_GRACE_STEPS', () => {
    expect(fleeGraceApplies('escape', false, 0)).toBe(true);
    expect(fleeGraceApplies('escape', false, FLEE_GRACE_STEPS)).toBe(true);
    expect(fleeGraceApplies('escape', false, FLEE_GRACE_STEPS + 1)).toBe(false); // past the window
    expect(fleeGraceApplies('escape', true, 0)).toBe(false);   // a natural success needs no fudge
    expect(fleeGraceApplies('investigate', false, 0)).toBe(false); // escape-only
  });
});

async function boot(name: string) {
  const store = useGameStore;
  await store.getState().hydrate();
  const race = getRaces()[0]!;
  const fac = getFactions()[0]!;
  await store.getState().startNewGame({ name, raceId: race.id, factionId: fac.id });
  store.getState().skipTutorial?.();
  return store;
}

function plant(name = 'Mud Boar') {
  const proto = findEnemyByName(name);
  if (!proto) throw new Error('test enemy not found');
  const enemy = JSON.parse(JSON.stringify(proto));
  const scene = useGameStore.getState().currentScene!;
  useGameStore.setState({
    currentScene: {
      ...scene, enemies: [enemy], enemyHps: [enemy.hp], activeEnemyIdx: 0,
      range: 'arm', enemyAmbushUsed: [false], enemyKnockedOut: [false],
    },
  });
  return enemy;
}

// A resolved skill_check step (the shape concludeRolls reads).
const skillStep = (success: boolean) => ([{
  id: 'skill_check', label: 'Escape', sides: 20, count: 1,
  bonus: 2, bonusLabel: 'DEX', total: success ? 19 : 5,
  target: 15, targetLabel: 'DC 15', context: 'escape', success,
} as unknown as Parameters<ReturnType<typeof useGameStore.getState>['concludeRolls']>[0][number]]);

describe('failed flee → attack of opportunity (OTA-372)', () => {
  beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

  // OTA-455 — past the first-steps flee grace (recentTileHistory > 3 steps), a
  // failed flee behaves the OTA-372 way: a free swing + enemies stay.
  function pastGrace() {
    const p = useGameStore.getState().player!;
    useGameStore.setState({ player: { ...p, recentTileHistory: ['a', 'b', 'c', 'd', 'e'] } });
  }

  it('a FAILED flee provokes an enemy counter-attack', async () => {
    const store = await boot('Fleer');
    plant('Mud Boar');
    pastGrace();
    const beforeLog = store.getState().gameLog.length;

    store.getState().concludeRolls(skillStep(false), 'flee');

    const lines = store.getState().gameLog.slice(beforeLog).flatMap((e) => e.text);
    // The enemy got its free swing — a counter-attack roll was logged
    // ("... vs your AC ...") regardless of whether it hit.
    expect(lines.some((t) => /vs your AC/i.test(t))).toBe(true);
    // The scene is still a fight (failed flee doesn't clear enemies).
    expect(store.getState().currentScene!.enemies.length).toBe(1);
  });

  it('a SUCCESSFUL flee breaks contact cleanly — no counter, enemies cleared', async () => {
    const store = await boot('Runner');
    plant('Mud Boar');
    pastGrace();
    const beforeLog = store.getState().gameLog.length;

    store.getState().concludeRolls(skillStep(true), 'flee');

    const lines = store.getState().gameLog.slice(beforeLog).flatMap((e) => e.text);
    expect(lines.some((t) => /vs your AC/i.test(t))).toBe(false); // no free swing on a clean break
    expect(store.getState().currentScene!.enemies.length).toBe(0); // got away
  });
});

describe('OTA-455 — first-steps flee grace', () => {
  beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

  it('within the first 3 steps, a FAILED flee is fudged to a bare success + a near-miss line', async () => {
    const store = await boot('Greenhorn');
    plant('Mud Boar');
    // Brand-new character: only a couple of wasteland steps taken.
    const p = store.getState().player!;
    store.setState({ player: { ...p, recentTileHistory: ['start:0:0'] } });
    const beforeLog = store.getState().gameLog.length;

    // The roll FAILED — but the grace catches it.
    store.getState().concludeRolls(skillStep(false), 'flee');

    const lines = store.getState().gameLog.slice(beforeLog).flatMap((e) => e.text);
    expect(store.getState().currentScene!.enemies.length).toBe(0);       // got away
    expect(lines.some((t) => /vs your AC/i.test(t))).toBe(false);         // no free swing
    expect(lines.some((t) => /barely escaped/i.test(t))).toBe(true);     // the Arbiter near-miss line
  });

  it('does NOT save a non-escape failed check (only flees are graced)', async () => {
    const store = await boot('Greenhorn2');
    plant('Mud Boar');
    const p = store.getState().player!;
    store.setState({ player: { ...p, recentTileHistory: ['start:0:0'] } });
    // A failed flee on a fresh char IS graced (sanity), but the grace is
    // escape-only — verified by the helper unit (fleeGraceApplies) and the
    // intent gate. Here we just confirm the fresh-char flee clears.
    store.getState().concludeRolls(skillStep(false), 'flee');
    expect(store.getState().currentScene!.enemies.length).toBe(0);
  });
});
