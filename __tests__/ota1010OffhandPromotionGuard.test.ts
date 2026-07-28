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

// OTA-1010 — ONE KNIFE, TWO HANDS. "attack <enemy> with <weapon>" promotes the
// named weapon into the MAIN hand (deliberate grip-switch, OTA 205). Its
// off-hand protection compared instance IDS only — an equipped state carrying
// name-only slots (never passed backfillPlayer's id stamp) fell through, and
// the promotion bound the ONE off-hand instance to BOTH hands, silently
// evicting the real main weapon. Found via the combatStress canary autopsy.
jest.setTimeout(30000);

import { useGameStore } from '../app/state/gameStore';
import { findEnemyByName } from '../app/engine/encounter';

async function boot(equipped: Record<string, string>) {
  const store = useGameStore;
  await store.getState().hydrate();
  await store.getState().startNewGame({ name: 'Grip', raceId: 'unknowing_mass', factionId: 'reclaimers_guild' });
  store.getState().skipTutorial?.();
  const p0 = store.getState().player!;
  store.setState({
    player: {
      ...p0, hubRoomId: null, hpMax: 80, hp: 80, staminaMax: 30, stamina: 30,
      stats: { ...p0.stats, strength: 14, dexterity: 12 },
      inventory: [
        ...p0.inventory.filter((it) => it.kind !== 'weapon' && it.kind !== 'armor'),
        { id: 'g_main', name: 'Mud-Iron Cleaver', kind: 'weapon' as const, quantity: 1, tags: ['weapon', 'blade', 'melee'] },
        { id: 'g_off', name: 'Pocket Knife', kind: 'weapon' as const, quantity: 1, tags: ['weapon', 'melee', 'knife'] },
      ],
      equipped: { ...(p0.equipped ?? {}), ...equipped },
    },
  });
  const boar = findEnemyByName('Mud Boar')!;
  const scene = store.getState().currentScene!;
  store.setState({
    currentScene: { ...scene, enemies: [JSON.parse(JSON.stringify(boar))], enemyHps: [boar.hp], activeEnemyIdx: 0, range: 'close' },
  });
  return store;
}

function drainRolls(store: typeof useGameStore) {
  let safety = 0;
  while (store.getState().pendingRolls && safety < 30) {
    safety++;
    const pr = store.getState().pendingRolls!;
    const step = pr.steps[pr.currentStep];
    if (!step) { store.getState().cancelPendingRolls(); break; }
    const values: number[] = [];
    for (let i = 0; i < (step.count ?? 1); i++) values.push(step.sides ?? 6);
    store.getState().resolveRollStep(values);
  }
}

describe('OTA-1010 — the off-hand can no longer be promoted into the main hand', () => {
  it('NAME-ONLY equipped slots (no ids): attack-with-the-off-hand-weapon leaves the main hand alone', async () => {
    const store = await boot({ main: 'Mud-Iron Cleaver', off: 'Pocket Knife' });
    store.getState().submitPlayerAction('attack Mud Boar with Pocket Knife');
    drainRolls(store);
    const eq = store.getState().player!.equipped!;
    expect(eq.main).toBe('Mud-Iron Cleaver');            // NOT evicted
    expect(eq.off).toBe('Pocket Knife');                 // off hand untouched
    expect(eq.mainId ?? null).not.toBe('g_off');         // one instance, one hand
  });

  it('ID-CARRYING slots (a real loaded save) behave identically', async () => {
    const store = await boot({ main: 'Mud-Iron Cleaver', mainId: 'g_main', off: 'Pocket Knife', offId: 'g_off' });
    store.getState().submitPlayerAction('attack Mud Boar with Pocket Knife');
    drainRolls(store);
    const eq = store.getState().player!.equipped!;
    expect(eq.main).toBe('Mud-Iron Cleaver');
    expect(eq.mainId).toBe('g_main');
  });

  it('the legitimate grip-switch still works: naming a PACK weapon promotes it', async () => {
    const store = await boot({ main: 'Pocket Knife', mainId: 'g_off' });
    store.getState().submitPlayerAction('attack Mud Boar with Mud-Iron Cleaver');
    drainRolls(store);
    const eq = store.getState().player!.equipped!;
    expect(eq.main).toBe('Mud-Iron Cleaver');            // promotion preserved
  });
});

describe('OTA-1010 — category lock', () => {
  const fs = require('fs') as typeof import('fs');
  const path = require('path') as typeof import('path');
  const STORE = fs.readFileSync(path.join(__dirname, '..', 'app', 'state', 'gameStore.ts'), 'utf8');
  it('the off-hand guard is id-first with a NAME fallback — the id-only shape is gone', () => {
    expect(STORE).toMatch(/\|\| \(!player\.equipped\?\.offId && !!swapTo && !!player\.equipped\?\.off/);
    expect(STORE).not.toMatch(/const isOffHandInstance =\n\s*!!instrumentArg\.resolvedItemId && instrumentArg\.resolvedItemId === player\.equipped\?\.offId;/);
  });
});
