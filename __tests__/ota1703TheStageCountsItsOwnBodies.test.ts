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
jest.mock('expo-av', () => ({ Audio: { setAudioModeAsync: jest.fn(), Sound: class { static createAsync: jest.Mock = jest.fn(async () => ({ sound: { playAsync: jest.fn(), unloadAsync: jest.fn() } })); } } }));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '0', applicationId: 'test' }));
jest.mock('expo-asset', () => ({ Asset: { fromModule: () => ({ downloadAsync: jest.fn(async () => {}), localUri: '' }) } }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => {}) }));
jest.mock('expo-constants', () => ({ default: { expoConfig: {} } }));
jest.mock('expo-font', () => ({ loadAsync: jest.fn(async () => {}) }));
jest.mock('expo-speech-recognition', () => ({}));
jest.mock('expo-updates', () => ({}));

/**
 * OTA-1703 — THE STAGE COUNTS ITS OWN BODIES.
 *
 * Contrary walker, the Harpy of the Cradle of Dusk, interrupted road (sweeps
 * two and three): a corruption apparition that happened to be an Aetheric
 * Raven stood on the Cradle before the stage's four ravens could arm (the
 * arrival door waits while a live hostile is on the tile). The walker killed
 * it, and the escort clear — matching the stage by NAME alone — moved the hunt
 * on. "The last of them is down." Four ravens the stage promised never stood.
 *
 * Now the stage stamps the bodies it stands up (Enemy.stageKey = the
 * encounter key) and only a stamped body closes the stage.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { useGameStore } from '../app/state/gameStore';
import { resolveStageEscortClear } from '../app/state/slices/questSlice';
import { getRaces, getFactions } from '../app/engine/character';
import { placedAt } from '../test-utils/placePlayer';
import type { Enemy, PlayerCharacter } from '../app/engine/types';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const enemiesData = require('../app/data/enemies/enemies.json') as Enemy[];

jest.setTimeout(60_000);

const src = (...p: string[]): string => readFileSync(join(__dirname, '..', ...p), 'utf8');
const store = useGameStore;
const HUNT = 'hunt_mud_harpy_cradle';
const STAGE = 3;
const KEY = `hunt:${HUNT}:${STAGE}`;
const raven = enemiesData.find((e) => e.name === 'Aetheric Raven')!;

const stageOf = () => store.getState().player!.activeHunts!.find((h) => h.id === HUNT)!.stage;

async function onTheCradleAtStageThree(): Promise<PlayerCharacter> {
  await store.getState().startNewGame({ name: 'Ferel', raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
  store.setState((s) => ({
    player: {
      ...s.player!,
      ...placedAt('cradle_of_dusk'),
      hubRoomId: null,
      hp: 600, hpMax: 600,
      activeHunts: [{ id: HUNT, stage: STAGE, postedByFaction: null, acceptedAt: Date.now() }],
      inventory: [...s.player!.inventory, { id: 'line', name: "Ferel's High-Spire Line", kind: 'misc', quantity: 1 } as never],
    } as PlayerCharacter,
    activeBuildingId: null,
    missionFleeHoldCell: null,
  }));
  return store.getState().player!;
}

describe('OTA-1703 — the stage counts its own bodies', () => {
  it('⚠⚠ a wandering Aetheric Raven (no key) dies on the Cradle: the stage does NOT move', async () => {
    const player = await onTheCradleAtStageThree();
    expect(raven).toBeTruthy();
    store.setState((s) => ({ currentScene: { ...s.currentScene!, enemies: [{ ...raven }], enemyHps: [0], activeEnemyIdx: 0 } }));
    resolveStageEscortClear(store.getState, store.setState as never, player, { ...raven }, 0);
    expect(stageOf()).toBe(STAGE);
    expect(store.getState().gameLog.some((e) => e.text.includes('The last of them is down'))).toBe(false);
  });

  it('a raven carrying the stage\'s key closes it — and the count of "still up" reads the key too', async () => {
    const player = await onTheCradleAtStageThree();
    const mine = { ...raven, stageKey: KEY };
    // A same-named wanderer still standing must not hold the stage open either.
    store.setState((s) => ({ currentScene: { ...s.currentScene!, enemies: [mine, { ...raven }], enemyHps: [0, 30], activeEnemyIdx: 0 } }));
    resolveStageEscortClear(store.getState, store.setState as never, player, mine, 0);
    expect(stageOf()).toBeGreaterThan(STAGE);
    expect(store.getState().gameLog.some((e) => e.text.includes('The last of them is down'))).toBe(true);
  });

  it('a keyed raven of the stage still standing holds the stage open', async () => {
    const player = await onTheCradleAtStageThree();
    const a = { ...raven, stageKey: KEY };
    const b = { ...raven, stageKey: KEY };
    store.setState((s) => ({ currentScene: { ...s.currentScene!, enemies: [a, b], enemyHps: [0, 30], activeEnemyIdx: 0 } }));
    resolveStageEscortClear(store.getState, store.setState as never, player, a, 0);
    expect(stageOf()).toBe(STAGE);
  });

  it('⚠⚠ the stand-up stamps all four ravens with the stage\'s key', async () => {
    await onTheCradleAtStageThree();
    store.setState((s) => ({ currentScene: { ...s.currentScene!, enemies: [], enemyHps: [], activeEnemyIdx: 0 } }));
    store.getState().advanceHunt(HUNT);
    const sc = store.getState().currentScene!;
    expect(sc.enemies.length).toBe(4);
    expect(sc.enemies.every((e) => e.name === 'Aetheric Raven' && e.stageKey === KEY)).toBe(true);
    expect(stageOf()).toBe(STAGE); // the beat costs the kill
  });

  it('the tag is written where the bodies are made, and read where the clear decides', () => {
    const q = src('app', 'state', 'slices', 'questSlice.ts');
    expect(q.includes('enemies: escort.map((e) => ({ ...e, stageKey })),')).toBe(true);
    expect(q.includes('&& enemy.stageKey === `${family}:${rec.id}:${rec.stage}`) as EscortHit | undefined;')).toBe(true);
    expect(q.includes('e.name === enemy.name && e.stageKey === enemy.stageKey')).toBe(true);
    for (const fam of ['hunt', 'mystery', 'storyline']) {
      expect(q.includes(`\`${fam}:\${record.id}:\${record.stage}\``)).toBe(true);
    }
    expect(src('app', 'engine', 'types.ts').includes('stageKey?: string;')).toBe(true);
  });
});
