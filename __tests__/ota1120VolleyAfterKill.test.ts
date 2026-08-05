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

// OTA-1120 — THE VOLLEY AFTER A KILL.
//
// Owner's device log, carried on the watch list across three OTAs without a
// verdict: "Bog Hound sat out a fight after the Silt Thief died."
//
// It did. And so did every packmate of anything the player ever dropped.
//
// Four combat paths were written as `if (kill) resolveEnemyDefeat(); else {
// …volley }`. That else reads as "the enemy is dead, there is nothing left to
// counter with" — true in the SOLO fight the paths were first written for,
// false the moment a pack is involved. A killing blow bought the player the
// ENTIRE group's round: kill one raider of five and the other four never swung.
// Chained one kill per round, a pack fight costs nothing at all.
//
// This suite's first two cases are the probe that found it, kept verbatim:
// the same pack, the same swing, the same roll steps — the ONLY variable is
// whether the blow was lethal. Before the fix the control counters and the
// subject does not.
//
// ⚠ The item-throw path (OTA-825) already did this right and is the model; it
// closed the identical hole for throws and its comment carries the reasoning.
// OTA-1120 finishes the job for the other four sites.

jest.setTimeout(60000);

import { useGameStore } from '../app/state/gameStore';
import type { Enemy } from '../app/engine/types';
import fs from 'fs';
import path from 'path';

const store = useGameStore;
const src = (rel: string): string =>
  fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

const mk = (name: string, hp: number): Enemy => ({
  name, hp, hpMax: hp, ac: 12, attack: 60, damage: '1d4',
  traits: [], loot: [], rarity: 'Common',
} as never);

/** A pack. `thiefHp` decides whether the coming swing is lethal. */
function armPack(names: string[], hps: number[]): void {
  store.setState({
    currentScene: {
      ...store.getState().currentScene!,
      enemies: names.map((n) => mk(n, 40)),
      enemyHps: hps,
      activeEnemyIdx: 0,
      range: 'close',
      vendor: null,
      enemyAmbushUsed: names.map(() => false),
      enemyKnockedOut: names.map(() => false),
      enemyStatuses: names.map(() => []),
      stealthOpenerUsed: true,
    },
    player: {
      ...store.getState().player!,
      hp: 4000, hpMax: 4000, stamina: 999, staminaMax: 999,
      statusEffects: [], dog: undefined,
    } as never,
  });
}

/** Player WINS initiative, hits, deals `dmg`. */
const steps = (dmg: number) => ([
  { id: 'initiative', label: 'Roll for INITIATIVE', sides: 10, count: 1, bonus: 0, bonusLabel: '', target: 5, targetLabel: 'Enemy rolled 5', values: [9], total: 9, success: true },
  { id: 'attack', label: 'ATTACK', sides: 20, count: 1, bonus: 10, bonusLabel: 'STR 10', target: 12, targetLabel: 'AC 12', values: [15], total: 25, success: true },
  { id: 'damage', label: 'DAMAGE', sides: 6, count: 1, bonus: 0, bonusLabel: '', values: [dmg], total: dmg, success: true },
] as never);

const swingsBy = (name: string): number => store.getState().gameLog.filter(
  (e) => e.channel === 'combat' && new RegExp(`^${name} — d20`).test(e.text)).length;

beforeAll(async () => {
  console.log = () => {};
  console.warn = () => {};
  await store.getState().hydrate();
  await store.getState().startNewGame({ name: 'Volley', raceId: 'unknowing_mass', factionId: 'reclaimers_guild' });
  store.getState().skipTutorial?.();
});

describe('OTA-1120 — a killing blow does not buy the round', () => {
  it('CONTROL — a NON-lethal swing: the packmate counters', () => {
    armPack(['Silt Thief', 'Bog Hound'], [40, 40]);
    const before = swingsBy('Bog Hound');
    store.getState().concludeRolls(steps(3), 'attack');
    expect(swingsBy('Bog Hound') - before).toBe(1);
  });

  it('⚠ SUBJECT — the same swing KILLS the Silt Thief: the Bog Hound still counters', () => {
    // The owner's report, reduced to one assertion. Pre-fix this was 0.
    armPack(['Silt Thief', 'Bog Hound'], [2, 40]);
    const before = swingsBy('Bog Hound');
    store.getState().concludeRolls(steps(3), 'attack');
    expect(swingsBy('Bog Hound') - before).toBe(1);
  });

  it('the kill is still a kill — loot and the splice happen as before', () => {
    armPack(['Silt Thief', 'Bog Hound'], [2, 40]);
    store.getState().concludeRolls(steps(3), 'attack');
    const sc = store.getState().currentScene!;
    expect(sc.enemies.map((e) => e.name)).toEqual(['Bog Hound']);
    expect(sc.enemyHps).toHaveLength(1);
  });

  it('⚠ killing the LAST enemy runs no volley — a corpse does not get a swing', () => {
    // The guard is on SURVIVORS, not on "did someone die". resolveEnemyDefeat
    // clears the scene when the last body falls, and an emptied scene must end
    // the fight rather than hand the player a phantom hit.
    armPack(['Silt Thief'], [2]);
    const hpBefore = store.getState().player!.hp;
    store.getState().concludeRolls(steps(3), 'attack');
    expect(store.getState().currentScene!.enemies).toHaveLength(0);
    expect(store.getState().player!.hp).toBe(hpBefore);
  });

  it('a three-body pack loses one and the other two both answer', () => {
    armPack(['Silt Thief', 'Bog Hound', 'Mud Lurker'], [2, 40, 40]);
    const bog = swingsBy('Bog Hound');
    const mud = swingsBy('Mud Lurker');
    store.getState().concludeRolls(steps(3), 'attack');
    expect(swingsBy('Bog Hound') - bog).toBe(1);
    expect(swingsBy('Mud Lurker') - mud).toBe(1);
  });
});

describe('OTA-1120 — every killing path routes through the one guard', () => {
  const gs = src('app/state/gameStore.ts');

  it('the guard exists and checks survivors, not the kill', () => {
    expect(gs).toContain('export function runSurvivorVolley(');
    expect(gs).toContain('if (!scene || scene.enemies.length === 0) return;');
  });

  it('⚠ the melee kill branch calls it, and honours initiative', () => {
    expect(gs).toContain("if (!enemiesActedFirst) runSurvivorVolley(get, set, player, { skipDotTick: true });");
  });

  it('the bolt volley and the coating burst call it on their kill branches', () => {
    expect((gs.match(/runSurvivorVolley\(get, set, player\);/g) ?? []).length).toBe(2);
  });

  it("⚠ the dog's killing bite no longer returns past the arb169 volley", () => {
    // The early return here was the arb169 exploit wearing a kill for a hat: a
    // dog that BIT cost the player the group's round, a dog that KILLED did not.
    const bite = gs.slice(gs.indexOf("get().appendLog('world', `${target.name} falls under ${dog.name}'s jaws.`);"));
    const head = bite.slice(0, 900);
    expect(head).toContain('get().resolveEnemyDefeat();');
    expect(head).toContain('NO EARLY RETURN');
    expect(head).not.toMatch(/resolveEnemyDefeat\(\);\s*\n\s*return;/);
  });

  it('⚠ the throw path that already did it right is untouched', () => {
    // OTA-825's guard is the model this OTA generalised. If it ever changes
    // shape, the reasoning behind all five sites needs re-reading.
    expect(gs).toContain('const sceneAfterThrow = get().currentScene;');
    expect(gs).toContain('if (sceneAfterThrow && sceneAfterThrow.enemies.length > 0) {');
  });
});
