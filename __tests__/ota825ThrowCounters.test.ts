// OTA-825 — exploit close (reverify workflow, CONFIRMED high-severity). A thrown
// attack is a PLAYER TURN, but the typed-throw path never let the enemy group act,
// so throwing was a COUNTER-FREE ranged attack (and it skipped enemy regen, which
// only ticks inside applyEnemyCounter). Even a bare "throw a stone" chipped the
// enemy for 1/turn with zero retaliation — a safe, if slow, kill of anything incl.
// bosses. The throw handler now calls runEnemyGroupCounters after the throw (hit OR
// miss) when the group survives. This locks that a surviving enemy swings back.

jest.setTimeout(20000);
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
  makeDirectoryAsync: jest.fn(async () => {}), readAsStringAsync: jest.fn(async () => ''),
  writeAsStringAsync: jest.fn(async () => {}), deleteAsync: jest.fn(async () => {}),
  downloadAsync: jest.fn(async () => ({ uri: '' })), EncodingType: { UTF8: 'utf8', Base64: 'base64' },
}));
jest.mock('expo-speech', () => ({ speak: jest.fn(), stop: jest.fn(), isSpeakingAsync: jest.fn(async () => false) }));
jest.mock('expo-av', () => ({
  Audio: { setAudioModeAsync: jest.fn(), Sound: class { static createAsync = jest.fn(async () => ({ sound: { playAsync: jest.fn(async () => {}), unloadAsync: jest.fn(async () => {}) } })); } },
}));

import { useGameStore } from '../app/state/gameStore';

it('OTA-825 — throwing at a surviving enemy draws an enemy counter (no free ranged loop)', async () => {
  await useGameStore.getState().hydrate();
  await useGameStore.getState().startNewGame({ name: 'Chucker', raceId: 'reclaimer', factionId: 'reclaimers_guild' });
  useGameStore.getState().skipTutorial?.();

  const p0 = useGameStore.getState().player!;
  // A guaranteed-hit, hard-hitting close-range enemy with plenty of HP so a bare
  // stone (1 dmg) can't kill it — the group MUST survive to counter.
  const enemy = { name: 'Hammer', damage: '6d6', abilityPoint: 'Strength 40', hp: 300, type: 'brute', loot: [], rarity: 'Common', traits: [] };
  const scene = useGameStore.getState().currentScene!;
  useGameStore.setState({
    player: { ...p0, hp: 120, hpMax: 120 },
    currentScene: {
      ...scene, enemies: [enemy as never], enemyHps: [300], activeEnemyIdx: 0,
      range: 'close', enemyAmbushUsed: [false], enemyKnockedOut: [false], enemyStatuses: [[]],
    },
  });

  const hpBefore = useGameStore.getState().player!.hp;
  await useGameStore.getState().submitPlayerAction('throw a stone at hammer');

  const after = useGameStore.getState().player!;
  const enemyHpAfter = useGameStore.getState().currentScene!.enemyHps[0];
  // The throw resolved against the enemy (its HP moved off 300)...
  expect(enemyHpAfter).toBeLessThan(300);
  // ...and the surviving Hammer swung back — the player is no longer untouchable.
  expect(after.hp).toBeLessThan(hpBefore);
});
