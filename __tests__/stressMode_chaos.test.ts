// CHAOS MODE — random verb+noun stress simulation.
//
// Simulated player who behaves incoherently: mixes combat with rest with
// travel with crafting, occasionally fires malformed inputs, sets travel
// and immediately stops it, picks up and drops items. Goal: surface
// state-machine inconsistencies, undefined-access errors, NaN HP /
// stamina, log-emit failures, anything that throws.
//
// Hard cap: 500 turns, 15s test timeout. Uses a seeded RNG so failures
// reproduce. Wraps every submitPlayerAction in try/catch and reports
// aggregate exception count rather than failing on the first one — we
// want the FULL picture, not one stack trace.

jest.setTimeout(15000);

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

// --- seeded RNG ------------------------------------------------------------
// xmur3 + mulberry32 — same pattern used elsewhere in the suite for
// reproducible chaos runs.
function xmur3(str: string): () => number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function () {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}
function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return function () {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = t;
    r = Math.imul(r ^ (r >>> 15), r | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
const seedFn = xmur3('chaos-1000h');
const rng = mulberry32(seedFn());

function pick<T>(arr: T[]): T { return arr[Math.floor(rng() * arr.length)]; }

const VERBS = [
  'attack', 'look', 'investigate', 'look around',
  'travel north', 'travel south', 'travel east', 'travel west',
  'rest', 'drink water', 'eat ration', 'craft', 'scrap',
  'summon golem', 'bite', 'feed dog',
  'flee', 'defend', 'parry', 'dodge', 'salvage', 'climb',
  'go north', 'go south', 'take', 'drop', 'use',
  'stop', 'set course north', 'set course south',
];
const NOUNS = [
  'copper pot', 'bone fragment', 'the rubble', 'door',
  'vendor', 'stair', 'core', 'golem', 'dog', '',
];

function malformed(): string {
  const chars = 'abc xyz!?.,';
  const len = 1 + Math.floor(rng() * 3);
  let s = '';
  for (let i = 0; i < len; i++) s += chars[Math.floor(rng() * chars.length)];
  return s;
}
function emptyish(): string {
  return pick(['', ' ', '  ', '\t', '\n', '   \t  ']);
}

function nextInput(): string {
  const roll = rng();
  if (roll < 0.8) {
    const v = pick(VERBS);
    const n = pick(NOUNS);
    return n ? `${v} ${n}`.trim() : v;
  }
  if (roll < 0.95) return malformed();
  return emptyish();
}

async function bootstrap() {
  const store = useGameStore;
  await store.getState().hydrate();
  await store.getState().startNewGame({
    name: 'Chaos',
    raceId: 'reclaimer',
    factionId: 'reclaimers_guild',
  });
  store.getState().skipTutorial?.();
  return store;
}

// Hoisted counters/buffers for console mocks so beforeAll can attach and
// the test body can read them without re-mocking mid-run.
const consoleErrors: string[] = [];
const consoleWarns: string[] = [];

describe('CHAOS MODE — 500-turn random verb+noun stress simulation', () => {
  beforeAll(() => {
    console.log = () => {};
    console.warn = (...args: unknown[]) => {
      consoleWarns.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ').slice(0, 200));
    };
    console.error = (...args: unknown[]) => {
      consoleErrors.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ').slice(0, 200));
    };
  });

  it('drives 500 chaos turns through submitPlayerAction without corrupting player state', async () => {
    const store = await bootstrap();
    const TURNS = 500;
    const exceptions: { turn: number; input: string; err: string }[] = [];

    // Track interesting state oddities as we go.
    const hoursTrail: number[] = [];
    const sceneIds: (string | null | undefined)[] = [];
    let logWentSilentAt: number | null = null;
    let prevLogLen = store.getState().gameLog.length;
    let silentStreak = 0;

    for (let i = 0; i < TURNS; i++) {
      const input = nextInput();
      try {
        store.getState().submitPlayerAction(input);
      } catch (e) {
        exceptions.push({
          turn: i,
          input,
          err: e instanceof Error ? `${e.message}` : String(e),
        });
      }

      // Sample state every 25 turns.
      if (i % 25 === 0) {
        const s = store.getState();
        hoursTrail.push(s.player?.hoursElapsed ?? -1);
        sceneIds.push(s.currentScene?.id);
      }

      // Detect long silent stretches.
      const curLen = store.getState().gameLog.length;
      if (curLen === prevLogLen) {
        silentStreak++;
        if (silentStreak > 50 && logWentSilentAt === null) logWentSilentAt = i;
      } else {
        silentStreak = 0;
      }
      prevLogLen = curLen;
    }

    // ---- report -----------------------------------------------------------
    const after = store.getState().player;
    const finalScene = store.getState().currentScene;
    const inv = after?.inventory ?? [];
    const corruptItems = inv.filter(
      (it) => !it || typeof it.id !== 'string' || typeof it.name !== 'string' || !((it.quantity ?? 0) > 0),
    );

    process.stderr.write(`\n[CHAOS] turns=${TURNS} exceptions=${exceptions.length}\n`);
    for (const e of exceptions.slice(0, 10)) {
      process.stderr.write(
        `  t=${e.turn} input="${e.input.slice(0, 40)}" err=${e.err.slice(0, 100)}\n`,
      );
    }
    process.stderr.write(
      `[CHAOS] final hp=${after?.hp} stamina=${after?.stamina} hoursElapsed=${after?.hoursElapsed}\n`,
    );
    process.stderr.write(
      `[CHAOS] inventory length=${inv.length} corruptItems=${corruptItems.length}\n`,
    );
    process.stderr.write(
      `[CHAOS] finalScene=${finalScene?.id ?? 'null'} sceneSamples=${JSON.stringify(sceneIds.slice(0, 8))}\n`,
    );
    process.stderr.write(
      `[CHAOS] hoursTrail (every 25 turns, first 8)=${JSON.stringify(hoursTrail.slice(0, 8))}\n`,
    );
    process.stderr.write(
      `[CHAOS] console.warn count=${consoleWarns.length} console.error count=${consoleErrors.length}\n`,
    );
    if (consoleWarns.length) {
      process.stderr.write(`[CHAOS] top warns:\n`);
      for (const w of consoleWarns.slice(0, 5)) process.stderr.write(`  - ${w}\n`);
    }
    if (consoleErrors.length) {
      process.stderr.write(`[CHAOS] top errors:\n`);
      for (const w of consoleErrors.slice(0, 5)) process.stderr.write(`  - ${w}\n`);
    }
    if (logWentSilentAt !== null) {
      process.stderr.write(`[CHAOS] gameLog went silent for >50 turns starting at turn ${logWentSilentAt}\n`);
    }

    // ---- assertions -------------------------------------------------------
    // Soft cap on exceptions — the spec allows up to 5.
    expect(exceptions.length).toBeLessThanOrEqual(5);

    // Player state must remain a finite, non-negative number space.
    expect(after).not.toBeNull();
    expect(Number.isFinite(after!.hp)).toBe(true);
    expect(after!.hp).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(after!.stamina)).toBe(true);
    expect(after!.stamina).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(after!.hoursElapsed ?? 0)).toBe(true);
    expect(after!.hoursElapsed ?? 0).toBeGreaterThanOrEqual(0);

    // Inventory must not be corrupted.
    expect(corruptItems.length).toBe(0);
  });
});
