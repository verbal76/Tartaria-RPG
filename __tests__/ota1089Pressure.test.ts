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

/**
 * OTA-1089 — PHASE 4: LET THE DEBT COME DUE, BEHIND A DIFFICULTY TOGGLE.
 *
 * The plan called this the phase with the ⚠ HIGHEST RISK OF MAKING THE GAME
 * WORSE — "overtuned pressure in a game with no fail-forward is punishing.
 * Ship it behind a difficulty toggle and tune from logs." So most of this file
 * is about the guardrails rather than the feature:
 *
 *  - every new dial is OFF or gentle at the lowest tier;
 *  - every new dial has a hard CEILING, so no tier can make the road
 *    impassable or price the player out of the economy;
 *  - the toggle can be LOWERED MID-RUN AND NEVER RAISED (owner's rule);
 *  - and the pressure is LEGIBLE — a tide stage that moves says so, because
 *    pressure the player cannot see is just the game quietly getting worse.
 */
jest.setTimeout(60_000);

import {
  PRESSURE_ORDER, PRESSURE_PROFILES, DEFAULT_PRESSURE, pressureOf, profileOf,
  canChangeTo, isPressureTier, tideStage, tidePriceMultiplier, tideCrossLine,
  hostileHuntChance, worstStandingFaction, scaledCorruptionGain, scaledWeatherBite,
  TIDE_MAX_STAGES, TIDE_PRICE_PER_STAGE, HOSTILE_MAX_CHANCE, HOSTILE_STANDING,
  type PressureTier,
} from '../app/engine/pressure';
import { useGameStore } from '../app/state/gameStore';
import type { PlayerCharacter } from '../app/engine/types';

const prof = (t: PressureTier) => PRESSURE_PROFILES[t];
const lowest = PRESSURE_ORDER[0]!;
const highest = PRESSURE_ORDER[PRESSURE_ORDER.length - 1]!;

beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

describe('OTA-1089 — four tiers, and the names the owner picked', () => {
  it('there are exactly four, in ascending order', () => {
    expect(PRESSURE_ORDER).toEqual(['salvage', 'owed', 'let_it_come', 'bury_me']);
  });

  it('every dial rises monotonically with the tier', () => {
    // A "harder" tier that is softer on any axis is a bug the player would feel
    // and never be able to describe.
    for (const dial of ['tide', 'hostile', 'creep', 'exposure'] as const) {
      const vals = PRESSURE_ORDER.map((t) => prof(t)[dial]);
      for (let i = 1; i < vals.length; i++) expect(vals[i]!).toBeGreaterThan(vals[i - 1]!);
    }
  });

  it('every tier explains itself', () => {
    // A difficulty name that sounds good and explains nothing is a trap on a
    // screen the player cannot revisit.
    for (const t of PRESSURE_ORDER) {
      expect(prof(t).label.length).toBeGreaterThan(8);
      expect(prof(t).subtitle.length).toBeGreaterThan(40);
    }
  });

  it('an unknown or absent tier resolves to the default, never throws', () => {
    expect(pressureOf(undefined)).toBe(DEFAULT_PRESSURE);
    expect(pressureOf({ pressure: undefined })).toBe(DEFAULT_PRESSURE);
    expect(pressureOf({ pressure: 'IMPOSSIBLE' } as never)).toBe(DEFAULT_PRESSURE);
    expect(isPressureTier('salvage')).toBe(true);
    expect(isPressureTier('nightmare')).toBe(false);
  });
});

describe('OTA-1089 — ⚠ lower only, ever', () => {
  it('you can always ask for less', () => {
    expect(canChangeTo('bury_me', 'salvage')).toBe(true);
    expect(canChangeTo('let_it_come', 'owed')).toBe(true);
  });

  it('you can never claim you took more', () => {
    expect(canChangeTo('salvage', 'owed')).toBe(false);
    expect(canChangeTo('salvage', 'bury_me')).toBe(false);
    expect(canChangeTo('owed', 'let_it_come')).toBe(false);
  });

  it('a no-op is allowed rather than an error', () => {
    for (const t of PRESSURE_ORDER) expect(canChangeTo(t, t)).toBe(true);
  });
});

describe('OTA-1089 — ⚠ the lowest tier is genuinely off', () => {
  it('time costs nothing', () => {
    expect(tideStage(100_000, prof(lowest))).toBe(0);
    expect(tidePriceMultiplier(0)).toBe(1);
  });

  it('old grudges stay cold', () => {
    const hated = [{ factionId: 'a', standing: -100 }];
    expect(hostileHuntChance(hated, prof(lowest))).toBe(0);
  });

  it('...and corruption and weather are softened, not removed', () => {
    // 'salvage' should be gentler, never immune — a tier that turns a system
    // off entirely is a different game, not an easier one.
    expect(scaledCorruptionGain(4, prof(lowest))).toBeGreaterThan(0);
    expect(scaledCorruptionGain(4, prof(lowest))).toBeLessThan(4);
    expect(scaledWeatherBite(-6, prof(lowest))).toBeGreaterThan(-6);
    expect(scaledWeatherBite(-1, prof(lowest))).toBeLessThanOrEqual(-1);
  });
});

describe('OTA-1089 — ⚠ every dial has a ceiling', () => {
  it('the tide cannot price the player out of the game', () => {
    const stage = tideStage(1_000_000, prof(highest));
    expect(stage).toBe(TIDE_MAX_STAGES);
    expect(tidePriceMultiplier(stage)).toBeCloseTo(1 + TIDE_MAX_STAGES * TIDE_PRICE_PER_STAGE);
    // ...and that ceiling is a markup a player can absorb, not a wall.
    expect(tidePriceMultiplier(stage)).toBeLessThanOrEqual(1.3);
    // A number past the cap cannot sneak through the multiplier either.
    expect(tidePriceMultiplier(9_999)).toBe(tidePriceMultiplier(TIDE_MAX_STAGES));
  });

  it('hostile ground cannot make a road impassable', () => {
    const loathed = [{ factionId: 'a', standing: -100 }, { factionId: 'b', standing: -100 }];
    for (const t of PRESSURE_ORDER) {
      expect(hostileHuntChance(loathed, prof(t))).toBeLessThanOrEqual(HOSTILE_MAX_CHANCE);
    }
    expect(HOSTILE_MAX_CHANCE).toBeLessThan(0.25);
  });

  it('standing above the line is not hunted at all', () => {
    const grumpy = [{ factionId: 'a', standing: HOSTILE_STANDING + 1 }];
    for (const t of PRESSURE_ORDER) expect(hostileHuntChance(grumpy, prof(t))).toBe(0);
    expect(worstStandingFaction(grumpy)).toBeNull();
  });

  it('being loathed by one is worse than being disliked by four', () => {
    const one = [{ factionId: 'a', standing: -80 }];
    const four = [1, 2, 3, 4].map((i) => ({ factionId: `f${i}`, standing: -26 }));
    expect(hostileHuntChance(one, prof('owed'))).toBeGreaterThan(hostileHuntChance(four, prof('owed')));
  });

  it('the hunter is deterministic — the same save names the same people', () => {
    const s = [{ factionId: 'zeta', standing: -40 }, { factionId: 'alpha', standing: -40 }];
    expect(worstStandingFaction(s)).toBe('alpha');   // tie broken on id, not order
    expect(worstStandingFaction([...s].reverse())).toBe('alpha');
  });
});

describe('OTA-1089 — the tide is legible', () => {
  it('every stage that can be reached has a line to say so', () => {
    // Pressure the player cannot SEE is just the game quietly getting worse,
    // which is the other half of the failure mode the plan warns about.
    for (let stage = 1; stage <= TIDE_MAX_STAGES; stage++) {
      expect(tideCrossLine(stage)).toBeTruthy();
    }
    expect(tideCrossLine(0)).toBeNull();
    expect(tideCrossLine(TIDE_MAX_STAGES + 1)).toBeNull();
  });

  it('the stage only ever moves forward with the clock', () => {
    let prev = 0;
    for (let h = 0; h < 3000; h += 24) {
      const s = tideStage(h, prof('owed'));
      expect(s).toBeGreaterThanOrEqual(prev);
      prev = s;
    }
  });

  it('a harder tier reaches the same scarcity sooner', () => {
    const h = 400;
    expect(tideStage(h, prof('bury_me'))).toBeGreaterThan(tideStage(h, prof('owed')));
  });
});

describe('OTA-1089 — in the real store', () => {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const store: string = require('fs').readFileSync(
    require('path').join(__dirname, '../app/state/gameStore.ts'), 'utf8');
  const creation: string = require('fs').readFileSync(
    require('path').join(__dirname, '../app/screens/CharacterCreationScreen.tsx'), 'utf8');
  /* eslint-enable @typescript-eslint/no-require-imports */

  beforeAll(async () => {
    await useGameStore.getState().hydrate();
    await useGameStore.getState().startNewGame({ name: 'Pressed', raceId: 'reclaimer', factionId: 'reclaimers_guild' });
    useGameStore.getState().skipTutorial?.();
  });

  const setTier = (t: PressureTier) => {
    const p = useGameStore.getState().player!;
    useGameStore.setState({ player: { ...p, pressure: t } as PlayerCharacter });
  };

  it('a save written before this OTA plays the default, not a broken tier', () => {
    const p = useGameStore.getState().player!;
    useGameStore.setState({ player: { ...p, pressure: undefined } as PlayerCharacter });
    expect(pressureOf(useGameStore.getState().player)).toBe(DEFAULT_PRESSURE);
    expect(profileOf(useGameStore.getState().player).id).toBe(DEFAULT_PRESSURE);
  });

  it('setPressure eases the run', () => {
    setTier('bury_me');
    useGameStore.getState().setPressure('owed');
    expect(pressureOf(useGameStore.getState().player)).toBe('owed');
  });

  it('⚠ ...and refuses to raise it, out loud', () => {
    setTier('salvage');
    useGameStore.getState().setPressure('bury_me');
    expect(pressureOf(useGameStore.getState().player)).toBe('salvage');
    const feed = useGameStore.getState().gameLog.map((e) => e.text).join('\n');
    expect(feed).toContain('You cannot go back and claim you took more');
  });

  it('a junk tier is ignored rather than written', () => {
    setTier('owed');
    useGameStore.getState().setPressure('nightmare' as never);
    expect(pressureOf(useGameStore.getState().player)).toBe('owed');
  });

  it('the toggle is the LAST step of creation, after the motive', () => {
    expect(creation).toContain("type Step = 'race' | 'faction' | 'motive' | 'pressure';");
    expect(creation).toMatch(/STEP_ORDER: Step\[\] = \['race', 'faction', 'motive', 'pressure'\]/);
    expect(creation).toContain("const nextLabel = step === 'pressure' ? 'BEGIN' : 'NEXT →';");
    // ...and it is carried into the character.
    expect(creation).toContain('startNewGame({ name: \'\', raceId, factionId, motiveId, pressure })');
  });

  it('⚠ the dials scale RATES, never what corruption and weather already do', () => {
    // Re-scaling corruption's shipped stat penalties or weather's shipped
    // reposition costs would put a difficulty multiplier on top of a year of
    // balance work. The dials sit on the ACCUMULATION side only.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const corruption: string = require('fs').readFileSync(
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('path').join(__dirname, '../app/engine/corruption.ts'), 'utf8');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const weather: string = require('fs').readFileSync(
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('path').join(__dirname, '../app/engine/weatherEffects.ts'), 'utf8');
    // The real invariant: neither shipped engine KNOWS about the tiers. (Both
    // use the word "pressure" in their own prose, which is why this asserts on
    // the import rather than on the string.)
    expect(corruption).not.toContain("from './pressure'");
    expect(weather).not.toContain("from './pressure'");
    expect(corruption).not.toContain('PressureProfile');
    expect(weather).not.toContain('PressureProfile');
    // The only two places a dial touches them are the gain and the bite.
    expect(store).toContain('scaledCorruptionGain(effCorrDelta, prof)');
    expect(store).toContain('scaledWeatherBite(effHpDelta, prof)');
  });

  it('the hostile-ground gate exempts a bounty you took on purpose', () => {
    const fn = store.slice(store.indexOf('PHASE 4 HOSTILE GROUND'), store.indexOf('PHASE 4 HOSTILE GROUND') + 1400);
    expect(fn).toContain('if (!bountyTargets.has(hostile.factionId))');
    expect(fn).toContain('hostileHuntChance(player.factionStanding, profileOf(player))');
  });

  it('the tide reaches the price through the shared price parts', () => {
    expect(store).toContain('pressureTideMult = tidePriceMultiplier(tideStage(player.hoursElapsed ?? 0, profileOf(player)))');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const vp: string = require('fs').readFileSync(
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('path').join(__dirname, '../app/engine/vendorPricing.ts'), 'utf8');
    // ...and a stranger pays it too, because scarcity is not charm.
    expect(vp).toContain('* (p.pressureTideMult ?? 1)');
    expect(vp.slice(vp.indexOf('export function strangerBuyPrice'))).toContain('pressureTideMult');
  });

  it('the tide announcement fires once per stage and never re-fires', () => {
    const fn = store.slice(store.indexOf('function announceTide('), store.indexOf('/** ⚠ OTA-1088 — RAISE THE OPEN QUESTION'));
    expect(fn).toContain('if (stage <= seen) return;');
    expect(fn).toContain('tideStageSeen: stage');
    // ...and it yields to anything already holding the screen.
    expect(fn).toContain('get().chapterCard || get().pendingFork');
  });
});
