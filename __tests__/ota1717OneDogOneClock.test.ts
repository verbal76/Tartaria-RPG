/**
 * OTA-1717 — ONE DOG, ONE CLOCK.
 *
 * The dog had TWO loyalty systems, written a year apart, running in the same
 * action and not knowing about each other:
 *
 *   · `dogThresholdCheck` — synchronous, at the end of submitPlayerAction,
 *     CROSSING-based (oldLoyalty > T && newLoyalty <= T), bands 50/30/15/0 from
 *     its own DOG_LOYALTY_THRESHOLDS table, abandoning WITHOUT an owed puppy.
 *   · `tickDogStatus` — a microtask after the action, LEVEL-based and latched by
 *     `loyaltyBeatFloor`, bands 50/30/15, abandoning WITH an owed puppy and a
 *     queued vendor.
 *
 * ⚠⚠⚠ WHAT THAT LOOKED LIKE IN THE FEED, measured before anything was deleted by
 * walking a dog from 60 loyalty to 0 through the real action loop:
 *
 *     [world]   Cinder won't meet your eye. He is thin as wire and falling
 *               behind on the trail.
 *     [arbiter] The Arbiter nods at the dog. "Cinder won't meet your eye. One
 *               more empty day and he walks."
 *
 * The same opening clause, twice, back to back, at band 15 — and the same
 * doubling at 50 and 30 in different words. Not a wording problem: two systems
 * narrating one number.
 *
 * ⚠⚠ AND THEY DISAGREED ABOUT THE ONE THING THAT MATTERS, with a passing test on
 * each side. `dogHungerTimingChaos` asserts "hunger-abandonment does NOT set
 * puppyVendorOwed (spec: no bail-out)" — the OTA-124 rule, enforced by the sweep.
 * `puppyVendorEdges` asserts the opposite, in a block headed "hunger-abandonment
 * NOW owes a replacement puppy", written as a deliberate supersede of it and
 * enforced by the tick. Both shipped. Both were green. Neither knew the other
 * existed.
 *
 * ⚠ AND THE NEWER RULE NEVER REACHED A PLAYER. The sweep ran first and
 * synchronously, so it always won the crossing and always abandoned the dog
 * without the flag — the rule that superseded it was dead on that path from the
 * day it landed, which is how a contradiction this size sat still for a year
 * looking like two healthy features. The owner broke the tie: the owed puppy was
 * a one-time repair for an earlier broken OTA, and neglect must not pay. That
 * lands on the behaviour players already have, so nothing moves under them; the
 * two tests on the other side now say so and record why.
 *
 * ⚠ `tickDogStatus` is the survivor, and the latch is why. Level-based with a
 * floor stamped on the dog means a band that is crossed during a silent
 * re-dispatch (which skips the tick) still fires on the next real action, and a
 * save loaded below a band it never announced still announces it. The
 * crossing-based sweep could only ever catch the exact action the number moved
 * in. It also owned the bleed-out clock already, so there is now one function
 * that knows the whole of the dog's time.
 *
 * ⚠ MEASUREMENT NOTE, because it nearly cost a false report. The first walk said
 * bands 30 and 15 printed NOTHING and the dog was abandoned in silence. That was
 * the probe, not the game: `gameLog` caps at 500 entries, so a `slice(logLength)`
 * taken before a 240-step walk reads an index that no longer exists. Each case
 * below is a short walk that never approaches the cap.
 */
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

import { readFileSync } from 'fs';
import { join } from 'path';
import { useGameStore, tickDogStatus } from '../app/state/gameStore';
import type { GameStore } from '../app/state/gameStore';
import { getRaces, getFactions } from '../app/engine/character';
import { createDogCompanion } from '../app/engine/dogCompanion';
import type { DogCompanion } from '../app/engine/types';

const src = (...p: string[]): string => readFileSync(join(__dirname, '..', ...p), 'utf8');
const flush = () => new Promise((r) => setTimeout(r, 0));

jest.setTimeout(240000);

/** Boot a run with a dog at a chosen loyalty and a clock at zero, then walk it
 *  forward one hour at a time until the number drops to `until`. Returns every
 *  line the dog's name appears in along the way. */
async function walkTo(from: number, until: number, floor?: number): Promise<{ said: string[]; dog: DogCompanion | undefined; owed: unknown }> {
  const store = useGameStore;
  await store.getState().hydrate();
  await store.getState().startNewGame({ name: 'Verbal', raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
  store.getState().skipTutorial?.();
  const p0 = store.getState().player!;
  const d0 = createDogCompanion({ name: 'Cinder', breed: 'mutt', rawSex: 'male', startingProfile: 'mongrel', currentHour: 0 });
  store.setState({
    player: { ...p0, hoursElapsed: 0, dog: { ...d0, loyalty: from, lastFedAtHour: 0, status: 'with_player' as const, loyaltyBeatFloor: floor } } as typeof p0,
  });
  const said: string[] = [];
  for (let step = 0; step < 16; step++) {
    const before = store.getState().gameLog.length;
    await store.getState().submitPlayerAction('wait');
    await flush();
    for (const e of store.getState().gameLog.slice(before)) {
      if (e.text.includes('Cinder')) said.push(`[${e.channel}] ${e.text}`);
    }
    const d = store.getState().player?.dog;
    if (!d || (d.loyalty <= until && d.status === 'with_player') || d.status === 'abandoned') break;
  }
  return { said, dog: store.getState().player?.dog ?? undefined, owed: store.getState().worldMemory.puppyVendorOwed };
}

describe('OTA-1717 — ⚠⚠⚠ one beat per band, not two', () => {
  beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

  // ⚠ The floor is the band ABOVE, i.e. a dog that has already been through the
  // higher beats. Without it the latch legitimately catches up on every band it
  // never announced (see the ladder test below) and the count is not measuring
  // what this case is about.
  for (const [band, floorAbove] of [[50, undefined], [30, 50], [15, 30]] as const) {
    it(`band ${band} speaks exactly once`, async () => {
      const { said, dog } = await walkTo(band + 1, band, floorAbove);
      expect(dog?.loyalty).toBeLessThanOrEqual(band);
      // Before this OTA: two, from two systems, on two channels.
      expect(said).toHaveLength(1);
      // …and it is the Arbiter's, which is the voice that kept the latch.
      expect(said[0]).toContain('[arbiter]');
      expect(dog?.loyaltyBeatFloor).toBe(band);
    });
  }

  it('⚠⚠ the goodbye at 0 is spoken once, and neglect does not pay a puppy', async () => {
    const { said, dog, owed } = await walkTo(1, 0, 15);
    expect(dog?.status).toBe('abandoned');
    expect(said).toHaveLength(1);
    expect(said[0]).toContain('stops following');
    // The recorded spec, unchanged: no bail-out for a dog you starved.
    expect(owed).toBeFalsy();
  });

  it('⚠ a dog loaded BELOW a band it never heard still hears it, one beat per action', async () => {
    // This is what the surviving system can do that the deleted one could not.
    // A crossing-based sweep only ever fires in the exact action the number
    // moved — a save written below a band, or a band crossed during a silent
    // re-dispatch (which skips the tick), was gone for good. The latch walks the
    // ladder instead: one beat per action, in order, until it catches up.
    const { said } = await walkTo(16, 15);
    expect(said.map((l) => l.includes('keeps eyeing') ? 50 : l.includes('lags a pace') ? 30 : l.includes('One more empty day') ? 15 : 0))
      .toEqual([50, 30, 15]);
  });
});

describe('OTA-1717 — the boundary of the change', () => {
  function harness(dog: DogCompanion, hoursElapsed: number) {
    const logs: string[] = [];
    let state: any = {
      player: { hoursElapsed, dog },
      currentScene: null,
      worldMemory: { puppyVendorOwed: false, puppyVendorUsed: false, puppyVendorQueued: false },
      appendLog: (_c: string, m: string) => logs.push(m),
      persist: () => Promise.resolve(),
    };
    const get = () => state as GameStore;
    const set = (fn: (s: GameStore) => Partial<GameStore>) => { state = { ...state, ...fn(state) }; };
    return { get, set, logs, dog: () => get().player!.dog as DogCompanion, wm: () => get().worldMemory as any };
  }
  const makeDog = (over: Partial<DogCompanion> = {}): DogCompanion => ({
    id: 'd', name: 'Cinder', breed: 'mutt', sex: { raw: 'male', pronoun: 'he' },
    startingProfile: 'mongrel', hp: 16, hpMax: 16,
    stats: { strength: 10, dexterity: 10, intelligence: 10 },
    statProgress: { strength: 0, dexterity: 0, intelligence: 0 },
    loyalty: 80, lastFedAtHour: 0, equipped: { vest: null }, status: 'with_player', ...over,
  });

  it('⚠ BLEED-OUT DEATH still owes a replacement — this OTA did not touch it', () => {
    // Pulling the owed puppy off DEATH as well would leave a player whose dog
    // died with no road back to a companion at all, because the market that is
    // meant to replace it does not exist yet. That is the next piece of work.
    const h = harness(makeDog({ status: 'waiting_at_base', hp: 0, downedAtHour: 0 }), 24);
    tickDogStatus(h.get, h.set);
    expect(h.dog().status).toBe('dead');
    expect(h.wm().puppyVendorOwed).toBe(true);
  });

  it('starving to 0 abandons without owing one', () => {
    const h = harness(makeDog({ loyalty: 0 }), 10);
    tickDogStatus(h.get, h.set);
    expect(h.dog().status).toBe('abandoned');
    expect(h.wm().puppyVendorOwed).toBe(false);
  });
});

describe('OTA-1717 — the second system is gone, not disabled', () => {
  const STORE = src('app', 'state', 'gameStore.ts');

  it('⚠⚠ neither the sweep nor its table is left in the file', () => {
    // A dead function left behind is the next reader's trap: it looks like the
    // authority on a rule it no longer applies.
    expect(STORE.includes('function dogThresholdCheck(')).toBe(false);
    expect(STORE.includes('const DOG_LOYALTY_THRESHOLDS')).toBe(false);
    expect(STORE.includes('dogThresholdCheck(get, set')).toBe(false);
    // The snapshot it needed goes with it.
    expect(STORE.includes('const dogLoyaltyBefore')).toBe(false);
  });

  it('one function narrates the dog\'s clock, and the file says where the other went', () => {
    expect(STORE.includes('OTA-1717 — dogThresholdCheck USED TO RUN HERE')).toBe(true);
    expect(STORE.includes('OTA-1717 — dogThresholdCheck AND DOG_LOYALTY_THRESHOLDS LIVED HERE')).toBe(true);
  });

  it('⚠ and the collapse paid the line ceiling back', () => {
    // 62 lines returned to a file that had none to spare — the budget the dog
    // market will be built out of.
    const n = STORE.split('\n').length;
    expect(n).toBeLessThan(36999);
  });
});
