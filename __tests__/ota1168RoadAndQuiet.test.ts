// OTA-1168 — THE ARBITER STOPS TYPING IN FRONT OF YOU, AND THE ROAD BUILDS YOU UP.
//
// Owner, two asks in one message:
//  1. "while the arbiter is typing live, can we keep that hidden and just see the end
//     result on the screen like the rest of the text."
//  2. "stamina should be able to be trained up but at a very slow rate. not sure what to
//     tie it to though. maybe just generically travel and then if you run long enough you
//     get in good shape."
//
// ⚠ ON (2), THE MECHANIC ALREADY EXISTED AND THE PROBLEM WAS THAT IT RUNS OUT.
// `MILESTONE_TRAVEL_STEP` pays +1 max stamina every 5 DISTINCT destinations — and the game
// has 36 locations, so it fires ~7 times in a whole playthrough and is then permanently
// dead. That is why it never read as something you could train. This adds a SECOND,
// slower track over tiles actually walked, which never stops.

jest.setTimeout(30000);
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
type MockSound = { playAsync: () => Promise<void>; unloadAsync: () => Promise<void> };
jest.mock('expo-av', () => ({
  Audio: {
    setAudioModeAsync: jest.fn(),
    Sound: class {
      static createAsync: () => Promise<{ sound: MockSound }> = jest.fn(async () => ({
        sound: { playAsync: jest.fn(async () => {}), unloadAsync: jest.fn(async () => {}) },
      }));
    },
  },
}));

import { useGameStore } from '../app/state/gameStore';

import * as fs from 'fs';
import * as path from 'path';
const read = (...p: string[]): string => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');
const STORE = read('app', 'state', 'gameStore.ts');
const EXPLORE = read('app', 'screens', 'ExplorationScreen.tsx');

describe('OTA-1168 — the Arbiter no longer types in front of you', () => {
  it('⚠ THE PARTIAL TEXT IS NOT RENDERED ANY MORE', () => {
    // It used to tail-render token by token with a ▍ cursor, so a generated line was read
    // TWICE — once as it was written, once filed into the feed.
    expect(EXPLORE).not.toMatch(/\{partialArbiterText\}/);
    expect(EXPLORE).not.toContain('styles.streamingCursor');
  });

  it('⚠ BUT THE "WORKING" SIGNAL SURVIVES — measured generations run 6.6-10.9s', () => {
    // This was the ONLY indicator the engine is busy. Removing it outright buys silence
    // at the price of looking frozen for up to eleven seconds.
    expect(EXPLORE).toContain('isGenerating &&');
    expect(EXPLORE).toMatch(/choosing their words/);
  });

  it('the streaming buffer itself is untouched — this is a VIEW change only', () => {
    // The engine still streams into `partialArbiterText`; nothing about generation,
    // cancellation or banking changed. Only what the screen does with it.
    expect(STORE).toContain('partialArbiterText: string | null;');
    expect(STORE).toContain("set({ isGenerating: false, partialArbiterText: null })");
  });
});

describe('OTA-1168 — the road odometer', () => {
  const cellOf = () => {
    const p = useGameStore.getState().player!;
    return { x: (p as unknown as { gridX: number }).gridX, y: (p as unknown as { gridY: number }).gridY };
  };
  const moveTo = (x: number, y: number) => {
    const p = useGameStore.getState().player!;
    useGameStore.setState({ player: { ...p, gridX: x, gridY: y } as never });
  };

  beforeEach(async () => {
    await useGameStore.getState().hydrate();
    await useGameStore.getState().startNewGame({ name: 'Road', raceId: 'reclaimer', factionId: 'reclaimers_guild' });
    useGameStore.getState().skipTutorial?.();
    useGameStore.setState((s) => ({ worldMemory: { ...s.worldMemory, travelOdometer: 0, recentCells: [] } }));
  });

  it('counts a step onto fresh ground', async () => {
    const start = cellOf();
    moveTo(start.x + 40, start.y + 40);
    await useGameStore.getState().submitPlayerAction('look around');
    expect(useGameStore.getState().worldMemory.travelOdometer ?? 0).toBeGreaterThan(0);
  });

  it('⚠ STANDING STILL COSTS NOTHING — ordinary actions do not advance it', async () => {
    moveTo(500, 500);
    await useGameStore.getState().submitPlayerAction('look around');
    const after = useGameStore.getState().worldMemory.travelOdometer ?? 0;
    await useGameStore.getState().submitPlayerAction('look around');
    await useGameStore.getState().submitPlayerAction('look around');
    expect(useGameStore.getState().worldMemory.travelOdometer ?? 0).toBe(after);
  });

  it('⚠ PACING EAST-WEST DOES NOT FARM IT — the exact hole arb118 had to close', async () => {
    // The distinct-destination track was broken this way once: "bouncing between two tiles
    // farmed permanent staminaMax forever." A raw tile count would restore it, and the
    // owner has literally described stepping back and forth to pass time.
    moveTo(600, 600);
    await useGameStore.getState().submitPlayerAction('look around');
    const after = useGameStore.getState().worldMemory.travelOdometer ?? 0;
    for (let i = 0; i < 12; i++) {
      moveTo(600 + (i % 2), 600);
      await useGameStore.getState().submitPlayerAction('look around');
    }
    // Two cells, already both in the ring — twelve bounces buy at most the one new cell.
    expect((useGameStore.getState().worldMemory.travelOdometer ?? 0) - after).toBeLessThanOrEqual(1);
  });

  it('a real march counts every step', async () => {
    moveTo(700, 700);
    await useGameStore.getState().submitPlayerAction('look around');
    const after = useGameStore.getState().worldMemory.travelOdometer ?? 0;
    for (let i = 1; i <= 10; i++) {
      moveTo(700 + i, 700);
      await useGameStore.getState().submitPlayerAction('look around');
    }
    expect((useGameStore.getState().worldMemory.travelOdometer ?? 0) - after).toBe(10);
  });

  it('⚠ THE RING IS BOUNDED — it must not grow into the save', () => {
    expect(STORE).toContain('.slice(-ODOMETER_MEMORY)');
    expect(STORE).toMatch(/const ODOMETER_MEMORY = \d+;/);
  });

  it('⚠ THERE IS NO CEILING — the ~7 cap belongs to the OTHER track', () => {
    // Owner read the two tracks as one: "if I got to move a hundred spaces… I can only get
    // seven, so after 700 steps it doesn't mean anything." The 7 is 36 locations ÷ 5 on the
    // distinct-destination milestone. The odometer has no cap at all, and nothing in its
    // award path clamps `staminaMax`.
    const i = STORE.indexOf('function tickRoadOdometer');
    const body = STORE.slice(i, STORE.indexOf('OTA-1166 — ARRIVING ON', i));
    expect(body).not.toMatch(/Math\.min\([^)]*staminaMax/);
    expect(body).toContain('staminaMax: st.player.staminaMax + earned');
  });

  it('⚠ A CARDINAL STEP IS WORTH DOUBLE — the nudge to explore by hand', () => {
    expect(STORE).toContain('const ODOMETER_CARDINAL = 2;');
    // Set only by the two TYPED cardinal paths; autoroute and whisper courses do not.
    const flags = STORE.match(/_lastStepWasCardinal = true;/g) ?? [];
    expect(flags.length).toBe(2);
  });

  it('⚠ THE FLAG IS CONSUMED EVERY TICK, so it cannot pay double for an autorouted step', () => {
    const i = STORE.indexOf('function tickRoadOdometer');
    const body = STORE.slice(i, STORE.indexOf('OTA-1166 — ARRIVING ON', i));
    // Reset happens BEFORE the early return, or a non-counting action would leave it armed.
    const reset = body.indexOf('_lastStepWasCardinal = false;');
    const earlyReturn = body.indexOf('if (recent.includes(key)) return;');
    expect(reset).toBeGreaterThan(-1);
    expect(reset).toBeLessThan(earlyReturn);
  });

  it('⚠ AWARDS BY THRESHOLD CROSSING, NOT `% === 0`', () => {
    // A cardinal step is worth 2, so an exact-modulo check can step 39 → 41 and skip the
    // award entirely — silently failing exactly the players doing the encouraged thing.
    const i = STORE.indexOf('function tickRoadOdometer');
    const body = STORE.slice(i, STORE.indexOf('OTA-1166 — ARRIVING ON', i));
    expect(body).toContain('Math.floor(nextOdo / ODOMETER_STEP) - Math.floor(prevOdo / ODOMETER_STEP)');
    expect(body).not.toContain('% ODOMETER_STEP !== 0');
  });

  it('the rate is a named, tunable constant', () => {
    const m = STORE.match(/const ODOMETER_STEP = (\d+);/);
    expect(m).toBeTruthy();
    expect(parseInt(m![1]!, 10)).toBeGreaterThan(0);
  });

  it('awards max stamina AND the usable point, so the reward is felt now', () => {
    const i = STORE.indexOf('function tickRoadOdometer');
    const body = STORE.slice(i, STORE.indexOf('OTA-1166 — ARRIVING ON', i));
    // `earned`, not a literal 1 — a cardinal step can cross more than one threshold.
    expect(body).toContain('staminaMax: st.player.staminaMax + earned');
    expect(body).toContain('stamina: st.player.stamina + earned');
  });

  it('⚠ EXISTING SAVES START AT ZERO — nobody is granted stamina they never walked for', () => {
    // `travelOdometer` is optional and absent on every save written before this OTA.
    const TYPES = read('app', 'engine', 'types.ts');
    expect(TYPES).toContain('travelOdometer?: number;');
    expect(TYPES).toContain('recentCells?: string[];');
  });

  it('it is a SECOND track — the distinct-destination one is untouched', () => {
    // That one still pays +1 per 5 first-arrivals; it simply runs out, which is the gap
    // this fills rather than replaces.
    expect(STORE).toContain('const MILESTONE_TRAVEL_STEP = 5;');
    expect(STORE).toContain('checkMilestone(newTravels, MILESTONE_TRAVEL_STEP)');
  });
});
