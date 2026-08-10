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

// OTA-1017 — INITIATIVE FINALLY DECIDES THE ORDER. Owner: "I thought the
// initiative roll was the deciding factor on who went first on any series of
// attacks." It wasn't — the roll's ONLY consumer was the log line, so "X moves
// first. The pressure is immediate." described something that never happened;
// the player's swing always resolved first regardless. Losing initiative now
// runs the enemy volley BEFORE the strike, and a volley that drops you means
// your swing never lands. Critically the volley is MOVED, not ADDED: a round
// still contains exactly ONE enemy volley either way.
jest.setTimeout(60000);

import * as fs from 'fs';
import * as path from 'path';
import { useGameStore } from '../app/state/gameStore';

async function boot() {
  const store = useGameStore;
  await store.getState().hydrate();
  await store.getState().startNewGame({ name: 'Tempo', raceId: 'unknowing_mass', factionId: 'reclaimers_guild' });
  store.getState().skipTutorial?.();
  return store;
}

function armFight(hp = 300) {
  const store = useGameStore;
  const foe: any = {
    name: 'Tempo Foe', hp: 40, hpMax: 40, ac: 12, attack: 60, damage: '1d4',
    traits: [], loot: [], rarity: 'Common',
  };
  store.setState({
    currentScene: {
      ...store.getState().currentScene!,
      enemies: [foe], enemyHps: [40], activeEnemyIdx: 0, range: 'close',
      vendor: null, enemyAmbushUsed: [false], stealthOpenerUsed: true,
    },
    player: { ...store.getState().player!, hp, hpMax: 300, stamina: 999, staminaMax: 999, statusEffects: [], dog: undefined } as any,
  });
}

/** Hand-built roll steps: initiative won/lost, then a landing attack. */
function steps(initSuccess: boolean) {
  return [
    {
      id: 'initiative', label: 'Roll for INITIATIVE', sides: 10, count: 1,
      bonus: 0, bonusLabel: '', target: 5, targetLabel: 'Enemy rolled 5',
      values: [initSuccess ? 9 : 1], total: initSuccess ? 9 : 1, success: initSuccess,
    },
    {
      id: 'attack', label: 'ATTACK', sides: 20, count: 1,
      bonus: 10, bonusLabel: 'STR 10', target: 12, targetLabel: 'AC 12',
      values: [15], total: 25, success: true,
    },
    {
      id: 'damage', label: 'DAMAGE', sides: 6, count: 1,
      bonus: 0, bonusLabel: '', values: [3], total: 3, success: true,
    },
  ] as any;
}

function enemySwings(): number {
  return useGameStore.getState().gameLog.filter(
    (e) => e.channel === 'combat' && /^Tempo Foe — d20/.test(e.text),
  ).length;
}

describe('OTA-1017 — losing initiative means they swing first', () => {
  beforeAll(() => { console.log = () => {}; console.warn = () => {}; });

  it('the enemy volley lands BEFORE the player damage line when initiative is lost', async () => {
    const store = await boot();
    armFight();
    store.getState().concludeRolls(steps(false), 'attack');
    const texts = store.getState().gameLog.map((e) => e.text);
    const firstEnemySwing = texts.findIndex((t) => /^Tempo Foe — d20/.test(t));
    const playerRoll = texts.findIndex((t) => /^You — d20/.test(t));
    expect(firstEnemySwing).toBeGreaterThan(-1);
    expect(playerRoll).toBeGreaterThan(-1);
    // The whole point: they act first now.
    expect(firstEnemySwing).toBeLessThan(playerRoll);
  });

  it('winning initiative still resolves the player first', async () => {
    const store = await boot();
    armFight();
    store.getState().concludeRolls(steps(true), 'attack');
    const texts = store.getState().gameLog.map((e) => e.text);
    const firstEnemySwing = texts.findIndex((t) => /^Tempo Foe — d20/.test(t));
    const playerRoll = texts.findIndex((t) => /^You — d20/.test(t));
    expect(playerRoll).toBeGreaterThan(-1);
    expect(playerRoll).toBeLessThan(firstEnemySwing);
  });

  it('ONE volley per round either way — losing initiative moves it, never doubles it', async () => {
    const store = await boot();
    armFight();
    store.getState().concludeRolls(steps(true), 'attack');
    const wonCount = enemySwings();
    armFight();
    const before = enemySwings();
    store.getState().concludeRolls(steps(false), 'attack');
    const lostCount = enemySwings() - before;
    expect(wonCount).toBeGreaterThan(0);
    expect(lostCount).toBe(wonCount);
  });

  it('a volley that kills you means your swing never lands', async () => {
    const store = await boot();
    armFight(1); // one hit ends it
    store.getState().concludeRolls(steps(false), 'attack');
    const texts = store.getState().gameLog.map((e) => e.text);
    // They got there first: no player attack roll was ever printed.
    expect(texts.some((t) => /^You — d20/.test(t))).toBe(false);
  });
});

describe('OTA-1017 — only the Hardened Climbing Strap anchors a rest', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'app', 'state', 'gameStore.ts'), 'utf8');

  it('SOURCE LOCK: the rope allowance is gone from the elevated-rest gate', () => {
    expect(src).toMatch(/const canRestElevated = wearsClimbStrapForRest;/);
    expect(src).not.toMatch(/const canRestElevated = wearsClimbStrapForRest \|\| \(!onGreatClimb && hasReclaimersRopeForRest\);/);
  });

  it('SOURCE LOCK: initiative is wired to the volley, and every post-strike site is guarded', () => {
    expect(src).toMatch(/const lostInitiative = !!initiative && !initiative\.success;/);
    expect(src).toMatch(/let enemiesActedFirst = false;/);
    const guarded = src.match(/if \(!enemiesActedFirst\) runEnemyGroupCounters\(/g) ?? [];
    // All five post-strike volley sites: dodged, SLIPPED (OTA-1202 — an enemy's held
    // Temporal Slip resolves exactly like a dodge and therefore needs exactly this
    // guard), barehand-gate, hit, miss. The count grew for the right reason: a new
    // negation path that FORGOT the guard would double-volley, which is what this lock
    // exists to catch.
    expect(guarded.length).toBe(5);
  });
});
