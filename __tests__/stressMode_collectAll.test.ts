// COLLECT ALL ITEMS MODE — hoard stress simulation.
//
// A simulated player who tries to pick up / salvage / investigate every
// noun they ever encounter. Drives 500 turns through submitPlayerAction
// to surface inventory overflow bugs, ambient-noun chip exhaustion,
// ambient-noun resurrection across scenes, and worldMemory growth.

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

// Seeded RNG — Mulberry32 keyed off the seed string. Replaces Math.random
// so the simulation is deterministic across runs.
function seedRandom(seedStr: string): () => number {
  let h = 1779033703 ^ seedStr.length;
  for (let i = 0; i < seedStr.length; i++) {
    h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function bootstrap() {
  const store = useGameStore;
  await store.getState().hydrate();
  await store.getState().startNewGame({
    name: 'Hoarder',
    raceId: 'reclaimer',
    factionId: 'reclaimers_guild',
  });
  store.getState().skipTutorial?.();
  return store;
}

describe('COLLECT ALL ITEMS MODE — hoard stress', () => {
  const consoleCounts = { log: 0, warn: 0, error: 0 };
  let originalRandom: () => number;

  beforeAll(() => {
    originalRandom = Math.random;
    const rand = seedRandom('hoard-1000h');
    Math.random = rand;
    console.log = () => { consoleCounts.log++; };
    console.warn = () => { consoleCounts.warn++; };
    console.error = () => { consoleCounts.error++; };
  });

  afterAll(() => {
    Math.random = originalRandom;
  });

  it('drives 500 collect-all turns and surfaces inventory / scene-refresh bugs', async () => {
    const store = await bootstrap();
    const MAX_TURNS = 500;
    const CARDINALS = ['north', 'south', 'east', 'west'] as const;

    const exceptions: { turn: number; input: string; err: string }[] = [];
    const inventoryLenByTurn: number[] = [];
    const ambientLenByTurn: number[] = [];
    const ambientNounsByTurn: string[][] = [];
    const discoveredByTurn: number[] = [];
    const npcsMetByTurn: number[] = [];
    const actionByTurn: string[] = [];

    let invHighWater = 0;
    let unexpectedInventoryDrops = 0;
    let firstUnexpectedDropTurn = -1;
    let scenesStuckAfterTravel = 0;
    let idCollisionsTotal = 0;
    let inventoryStallMax = 0;
    let currentStall = 0;
    let lastInvLen = 0;

    // Drive one player input and capture state.
    function drive(input: string, turn: number) {
      actionByTurn.push(input);
      try {
        store.getState().submitPlayerAction(input);
      } catch (e) {
        exceptions.push({
          turn,
          input,
          err: e instanceof Error ? e.message : String(e),
        });
      }
      const state = store.getState();
      const p = state.player;
      const invLen = p?.inventory.length ?? 0;
      const ambient = state.currentScene?.ambientNouns ?? [];
      const wm = state.worldMemory;

      inventoryLenByTurn.push(invLen);
      ambientLenByTurn.push(ambient.length);
      ambientNounsByTurn.push([...ambient]);
      discoveredByTurn.push(wm.discoveredLocationIds?.length ?? 0);
      npcsMetByTurn.push(wm.npcsMet?.length ?? 0);

      if (invLen > invHighWater) invHighWater = invLen;
      // Track unexpected drops: salvage / scrap / consume can legitimately
      // shrink length, so only flag when the input was investigate / take /
      // look / go (non-consuming verbs).
      const nonConsuming = /^(investigate|look|take|go )/.test(input);
      if (nonConsuming && invLen < lastInvLen) {
        unexpectedInventoryDrops++;
        if (firstUnexpectedDropTurn === -1) firstUnexpectedDropTurn = turn;
      }
      if (invLen === lastInvLen) {
        currentStall++;
        if (currentStall > inventoryStallMax) inventoryStallMax = currentStall;
      } else {
        currentStall = 0;
      }
      lastInvLen = invLen;

      // Item-id collisions: more than one inventory entry sharing the
      // same id is a bookkeeping bug (stacking should merge them).
      if (p?.inventory) {
        const seen = new Map<string, number>();
        for (const it of p.inventory) {
          seen.set(it.id, (seen.get(it.id) ?? 0) + 1);
        }
        for (const [, count] of seen) {
          if (count > 1) idCollisionsTotal++;
        }
      }
    }

    const startingInvLen =
      store.getState().player?.inventory.length ?? 0;
    lastInvLen = startingInvLen;

    // Cycle of ~20 turns. ~25 cycles → ~500 turns.
    let turn = 0;
    let cycle = 0;
    while (turn < MAX_TURNS) {
      // (1) look to refresh scene state
      drive('look', turn++);
      if (turn >= MAX_TURNS) break;

      const sceneBeforeTravel =
        store.getState().currentScene?.ambientNouns ?? [];
      const baseNouns = [...sceneBeforeTravel].slice(0, 8);

      // (2) investigate up to 8 nouns
      for (let i = 0; i < 8 && turn < MAX_TURNS; i++) {
        const noun = baseNouns[i];
        if (!noun) {
          // Pad with a noop look so we keep cadence even on empty scenes.
          drive('look', turn++);
          continue;
        }
        drive(`investigate ${noun}`, turn++);
      }
      if (turn >= MAX_TURNS) break;

      // (3) salvage up to 5 of the same nouns
      for (let i = 0; i < 5 && turn < MAX_TURNS; i++) {
        const noun = baseNouns[i];
        if (!noun) {
          drive('look', turn++);
          continue;
        }
        drive(`salvage ${noun}`, turn++);
      }
      if (turn >= MAX_TURNS) break;

      // (4) take up to 4 of the same nouns
      for (let i = 0; i < 4 && turn < MAX_TURNS; i++) {
        const noun = baseNouns[i];
        if (!noun) {
          drive('look', turn++);
          continue;
        }
        drive(`take ${noun}`, turn++);
      }
      if (turn >= MAX_TURNS) break;

      // (5) cardinal step
      const dir = CARDINALS[cycle % CARDINALS.length];
      const ambientBeforeStep = [...sceneBeforeTravel].sort().join('|');
      drive(`go ${dir}`, turn++);
      if (turn >= MAX_TURNS) break;

      // (6) look after travel — confirm scene refreshed
      drive('look', turn++);
      const ambientAfterStep =
        [...(store.getState().currentScene?.ambientNouns ?? [])].sort().join('|');
      if (
        ambientBeforeStep.length > 0 &&
        ambientBeforeStep === ambientAfterStep
      ) {
        scenesStuckAfterTravel++;
      }

      cycle++;
    }

    // Final state sanity.
    const state = store.getState();
    const player = state.player!;
    const finalInvLen = player.inventory.length;
    const wm = state.worldMemory;

    // Report.
    const avgAmbient =
      ambientLenByTurn.reduce((a, b) => a + b, 0) /
      Math.max(1, ambientLenByTurn.length);

    const lines: string[] = [];
    lines.push(`COLLECT_ALL_REPORT turns=${turn} cycles=${cycle}`);
    lines.push(`  exceptions=${exceptions.length}`);
    for (const e of exceptions.slice(0, 5)) {
      lines.push(`    turn=${e.turn} input="${e.input.slice(0, 40)}" err=${e.err.slice(0, 80)}`);
    }
    lines.push(`  inventory: start=${startingInvLen} end=${finalInvLen} highWater=${invHighWater}`);
    lines.push(`  unexpectedDrops=${unexpectedInventoryDrops} firstDropTurn=${firstUnexpectedDropTurn}`);
    lines.push(`  inventoryStallMax=${inventoryStallMax}`);
    lines.push(`  idCollisionsTotal=${idCollisionsTotal}`);
    lines.push(`  avgAmbientPerScene=${avgAmbient.toFixed(2)}`);
    lines.push(`  scenesStuckAfterTravel=${scenesStuckAfterTravel}`);
    lines.push(`  discoveredLocations=${wm.discoveredLocationIds?.length ?? 0}`);
    lines.push(`  npcsMet=${wm.npcsMet?.length ?? 0}`);
    lines.push(`  visitedRooms=${Object.keys(wm.visitedRooms ?? {}).length}`);
    lines.push(`  finalHP=${player.hp} stamina=${player.stamina} hours=${player.hoursElapsed ?? 0}`);
    lines.push(`  consoleCounts log=${consoleCounts.log} warn=${consoleCounts.warn} error=${consoleCounts.error}`);

    process.stderr.write(lines.join('\n') + '\n');

    // Hard invariants.
    expect(exceptions.length).toBe(0);
    expect(player.hp).toBeGreaterThanOrEqual(0);
    expect(player.stamina).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(player.hp)).toBe(true);
    expect(Number.isFinite(player.stamina)).toBe(true);
    expect(Number.isFinite(player.hoursElapsed ?? 0)).toBe(true);
    expect(player.tc).toBeGreaterThanOrEqual(0);
    expect(turn).toBeGreaterThanOrEqual(MAX_TURNS - 25);
  });
});
