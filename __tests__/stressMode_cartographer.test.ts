// CARTOGRAPHER MODE stress simulation — 500 turns of explorer behavior.
// Beats on: travel system, scene-bar (location / transitArea / weather),
// distanceRemaining accounting, hooks/ambient noun emission across
// scenes, worldMemory.discoveredLocationIds growth.
//
// Not a regression test. Surfaces stuck states, null currentScene mid-
// travel, distance desyncs, and infinite-loop-shaped behavior.

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

jest.setTimeout(15000);

const LOST_CAPITALS = [
  'asgardar', 'samarran', 'nimari', 'drakova',
  'voronov', 'karok_sa', 'yuldra_tul', 'ostragar', 'iskan_veil',
];

const CARDINALS = ['go north', 'go east', 'go south', 'go west'] as const;

// Deterministic seeded RNG — small mulberry32 keyed off the seed string.
function makeRng(seed: string) {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return function rng() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function bootstrap() {
  const store = useGameStore;
  await store.getState().hydrate();
  await store.getState().startNewGame({
    name: 'Cartographer',
    raceId: 'reclaimer',
    factionId: 'reclaimers_guild',
  });
  store.getState().skipTutorial?.();
  return store;
}

describe('CARTOGRAPHER MODE — 500-turn exploration stress', () => {
  let consoleLogCount = 0;
  let consoleWarnCount = 0;
  let consoleErrorCount = 0;

  beforeAll(() => {
    console.log = () => { consoleLogCount++; };
    console.warn = () => { consoleWarnCount++; };
    console.error = () => { consoleErrorCount++; };
  });

  it('drives 500 cartographer turns and surfaces travel-system invariants', async () => {
    const store = await bootstrap();
    const rng = makeRng('cart-1000h');

    const TURNS = 500;

    // Tracking buckets
    const exceptions: { turn: number; action: string; err: string }[] = [];
    const nullSceneTurns: { turn: number; action: string }[] = [];
    const distanceRegressions: {
      turn: number;
      action: string;
      prev: number;
      next: number;
      target?: string;
    }[] = [];
    const discoveredShrinks: { turn: number; prev: number; next: number }[] = [];
    const hoursRegressions: { turn: number; prev: number; next: number }[] = [];
    const stuckLengths: number[] = [];

    let stuckRun = 0;
    let maxStuckRun = 0;
    let cardinalIdx = 0;

    let prevDistance: number | null = null;
    let prevDiscovered: number = (store.getState().worldMemory.discoveredLocationIds ?? []).length;
    let prevHours: number = store.getState().player?.hoursElapsed ?? 0;

    for (let turn = 0; turn < TURNS; turn++) {
      const roll = rng();
      let action: string;

      if (roll < 0.60) {
        // Round-robin cardinal so the path drifts diagonally NE/SE/SW/NW
        action = CARDINALS[cardinalIdx % 4];
        cardinalIdx++;
      } else if (roll < 0.75) {
        action = 'look';
      } else if (roll < 0.85) {
        // Set travel course directly half the time, narrative form the rest.
        const capId = LOST_CAPITALS[Math.floor(rng() * LOST_CAPITALS.length)];
        if (rng() < 0.5) {
          try {
            store.getState().setTravelCourse(capId);
            action = `setTravelCourse(${capId})`;
          } catch (e) {
            exceptions.push({
              turn,
              action: `setTravelCourse(${capId})`,
              err: e instanceof Error ? e.message : String(e),
            });
            action = `setTravelCourse(${capId})[threw]`;
          }
        } else {
          action = `travel to ${capId}`;
        }
      } else if (roll < 0.93) {
        const scene = store.getState().currentScene;
        const ambient = scene?.ambientNouns ?? [];
        if (ambient.length > 0) {
          const n = ambient[Math.floor(rng() * ambient.length)];
          action = `investigate ${n}`;
        } else {
          action = 'look';
        }
      } else if (roll < 0.98) {
        action = 'rest';
      } else {
        try {
          store.getState().stopTravel();
          action = 'stopTravel()';
        } catch (e) {
          exceptions.push({
            turn,
            action: 'stopTravel()',
            err: e instanceof Error ? e.message : String(e),
          });
          action = 'stopTravel()[threw]';
        }
      }

      // Submit narrative inputs through the parser. Direct API calls
      // already happened above for setTravelCourse / stopTravel.
      const isDirectApi =
        action.startsWith('setTravelCourse(') ||
        action.startsWith('stopTravel(');
      if (!isDirectApi) {
        try {
          store.getState().submitPlayerAction(action);
          // Let any queued microtasks flush
          await Promise.resolve();
        } catch (e) {
          exceptions.push({
            turn,
            action,
            err: e instanceof Error ? e.message : String(e),
          });
        }
      } else {
        // Still allow any queued microtasks (set-course steps the player)
        await Promise.resolve();
      }

      // Force a rest every ~50 turns so stamina doesn't pin the run.
      if (turn > 0 && turn % 50 === 0) {
        try {
          store.getState().submitPlayerAction('rest');
          await Promise.resolve();
        } catch (e) {
          exceptions.push({
            turn,
            action: 'rest(forced)',
            err: e instanceof Error ? e.message : String(e),
          });
        }
      }

      // Sample state
      const state = store.getState();
      const scene = state.currentScene;
      const player = state.player;
      const wm = state.worldMemory;

      // (1) currentScene should be set after exploration actions
      if (scene === null) {
        nullSceneTurns.push({ turn, action });
      }

      // (2) distanceRemaining should monotonically decrease during travel
      const curDist = player?.travelTarget?.distanceRemaining ?? null;
      if (
        curDist !== null &&
        prevDistance !== null &&
        // Same target check — if target changed, this isn't a regression
        player?.travelTarget?.locationId &&
        curDist > prevDistance
      ) {
        distanceRegressions.push({
          turn,
          action,
          prev: prevDistance,
          next: curDist,
          target: player?.travelTarget?.locationId,
        });
      }
      prevDistance = curDist;

      // (3) discoveredLocationIds should only grow
      const curDiscovered = (wm.discoveredLocationIds ?? []).length;
      if (curDiscovered < prevDiscovered) {
        discoveredShrinks.push({ turn, prev: prevDiscovered, next: curDiscovered });
      }
      prevDiscovered = curDiscovered;

      // (4) hoursElapsed should never go backwards
      const curHours = player?.hoursElapsed ?? 0;
      if (curHours < prevHours) {
        hoursRegressions.push({ turn, prev: prevHours, next: curHours });
      }
      // (5) Stuck-state — consecutive turns without an hour tick
      if (curHours === prevHours) {
        stuckRun++;
        if (stuckRun > maxStuckRun) maxStuckRun = stuckRun;
      } else {
        if (stuckRun > 0) stuckLengths.push(stuckRun);
        stuckRun = 0;
      }
      prevHours = curHours;
    }

    if (stuckRun > 0) stuckLengths.push(stuckRun);

    const finalState = store.getState();
    const finalPlayer = finalState.player!;
    const finalScene = finalState.currentScene;
    const finalWm = finalState.worldMemory;

    // Build a summary blob the report agent can read off stderr.
    const summary = {
      pass: exceptions.length === 0,
      exceptionCount: exceptions.length,
      firstExceptions: exceptions.slice(0, 5),
      nullSceneCount: nullSceneTurns.length,
      firstNullSceneTurns: nullSceneTurns.slice(0, 5),
      distanceRegressionCount: distanceRegressions.length,
      firstDistanceRegressions: distanceRegressions.slice(0, 5),
      discoveredShrinkCount: discoveredShrinks.length,
      firstDiscoveredShrinks: discoveredShrinks.slice(0, 5),
      hoursRegressionCount: hoursRegressions.length,
      firstHoursRegressions: hoursRegressions.slice(0, 5),
      maxStuckRun,
      avgStuckRun: stuckLengths.length
        ? (stuckLengths.reduce((a, b) => a + b, 0) / stuckLengths.length).toFixed(2)
        : 'n/a',
      stuckRunCount: stuckLengths.length,
      finalHp: finalPlayer.hp,
      finalStamina: finalPlayer.stamina,
      finalHours: finalPlayer.hoursElapsed,
      finalTc: finalPlayer.tc,
      finalInventoryCount: finalPlayer.inventory?.length ?? 0,
      finalSceneLocation: finalScene?.location?.name ?? null,
      finalSceneTransit: finalScene?.transitArea ?? null,
      finalSceneWeather:
        typeof finalScene?.weather === 'object' && finalScene?.weather
          ? (finalScene.weather as { kind?: string }).kind ?? 'unknown'
          : (finalScene?.weather ?? null),
      finalTravelTarget: finalPlayer.travelTarget?.locationId ?? null,
      finalDistanceRemaining: finalPlayer.travelTarget?.distanceRemaining ?? null,
      discoveredLocationCount: (finalWm.discoveredLocationIds ?? []).length,
      consoleLogCount,
      consoleWarnCount,
      consoleErrorCount,
    };

    process.stderr.write(
      '\nCARTOGRAPHER_REPORT ' + JSON.stringify(summary, null, 2) + '\n',
    );

    // -- Soft assertions: the run should complete and basic invariants hold.
    // We deliberately DO NOT fail on distance/null-scene findings — those
    // are diagnostic and reported via stderr for the caller to triage.
    expect(finalPlayer).not.toBeNull();
    expect(Number.isFinite(finalPlayer.hp)).toBe(true);
    expect(Number.isFinite(finalPlayer.stamina)).toBe(true);
    expect(Number.isFinite(finalPlayer.hoursElapsed)).toBe(true);
    expect(finalPlayer.hp).toBeGreaterThanOrEqual(0);
    expect(finalPlayer.stamina).toBeGreaterThanOrEqual(0);
    expect(finalPlayer.tc).toBeGreaterThanOrEqual(0);
    // Hours should be monotonic — this is a hard invariant.
    expect(hoursRegressions.length).toBe(0);
    // discoveredLocationIds is append-only.
    expect(discoveredShrinks.length).toBe(0);
    // Exceptions are a hard fail.
    expect(exceptions.length).toBe(0);
  });
});
