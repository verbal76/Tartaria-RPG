// OTA-426 — [audit fix #8] multi-boss hunts no longer complete at a MID boss
// stage. bog_dragon has 7 stages with `boss` at indices [3, 6]; advanceHunt
// spawns the (final) scaled target at BOTH, so killing it at the mid stage used
// to stamp the hunt complete and skip the apex. Completion is now gated on the
// LAST boss stage (rec.stage > lastBossIndex).

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('onnxruntime-react-native', () => ({
  InferenceSession: { create: jest.fn(async () => ({ run: jest.fn(async () => ({})) })) },
  Tensor: class { constructor(_t: string, _d: unknown, _s: unknown[]) { void _t; void _d; void _s; } },
}));
jest.mock('llama.rn', () => ({ initLlama: jest.fn(async () => ({ completion: jest.fn(async () => ({ text: '' })), release: jest.fn() })), releaseAllLlama: jest.fn() }));
jest.mock('react-native-executorch', () => ({}));
jest.mock('expo-file-system', () => ({ documentDirectory: '/tmp/', cacheDirectory: '/tmp/', getInfoAsync: jest.fn(async () => ({ exists: false })), makeDirectoryAsync: jest.fn(async () => {}), readAsStringAsync: jest.fn(async () => ''), writeAsStringAsync: jest.fn(async () => {}), deleteAsync: jest.fn(async () => {}), downloadAsync: jest.fn(async () => ({ uri: '' })), EncodingType: { UTF8: 'utf8', Base64: 'base64' } }));
jest.mock('expo-speech', () => ({ speak: jest.fn(), stop: jest.fn(), isSpeakingAsync: jest.fn(async () => false) }));
jest.mock('expo-av', () => ({ Audio: { setAudioModeAsync: jest.fn(), Sound: class { static createAsync = jest.fn(async () => ({ sound: { playAsync: jest.fn(async () => {}), unloadAsync: jest.fn(async () => {}) } })); } } }));
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
import { findHuntById } from '../app/engine/hunts';

async function boot(name: string) {
  const store = useGameStore;
  await store.getState().hydrate();
  await store.getState().startNewGame({ name, raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
  store.getState().skipTutorial?.();
  return store;
}

// Put the hunt at `stage`, and stage a dead "Bog Dragon (hunted)" in the scene.
function setupKill(stage: number) {
  const def = findHuntById('hunt_bog_dragon')!;
  const proto = findEnemyByName(def.targetEnemyName) ?? findEnemyByName('Mud Boar')!;
  const boss = JSON.parse(JSON.stringify(proto));
  boss.name = `${def.targetEnemyName} (hunted)`;
  const sc = useGameStore.getState().currentScene!;
  useGameStore.setState((s) => ({
    player: { ...s.player!, activeHunts: [{ id: 'hunt_bog_dragon', stage, postedByFaction: null, acceptedAt: 0 }] },
    currentScene: {
      ...sc, enemies: [boss], enemyHps: [0], activeEnemyIdx: 0, range: 'close',
      enemyAmbushUsed: [false], enemyKnockedOut: [false],
    },
  }));
}

describe('OTA-426 — multi-boss hunt completion gating', () => {
  beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

  it('killing the MID-hunt boss (stage 4, boss idx 3) does NOT complete the hunt', async () => {
    const store = await boot('Hunter');
    const def = findHuntById('hunt_bog_dragon')!;
    expect(def.stages.length).toBe(7); // boss at [3,6]
    setupKill(4); // advanceHunt(3) lands the record at stage 4
    store.getState().resolveEnemyDefeat();
    const h = store.getState().player!.activeHunts!.find((x) => x.id === 'hunt_bog_dragon')!;
    expect(h.stage).toBe(4); // NOT stamped to stages.length (the old early-complete)
    const log = store.getState().gameLog.map((l) => l.text).join('\n');
    expect(log).not.toMatch(/Bog Dragon slain/);
  });

  it('killing the FINAL boss (stage 7, past boss idx 6) completes the hunt', async () => {
    const store = await boot('Hunter2');
    const def = findHuntById('hunt_bog_dragon')!;
    setupKill(def.stages.length); // advanceHunt(6) lands the record at stage 7
    store.getState().resolveEnemyDefeat();
    const log = store.getState().gameLog.map((l) => l.text).join('\n');
    expect(log).toMatch(/Bog Dragon slain/); // completion fired
  });
});
