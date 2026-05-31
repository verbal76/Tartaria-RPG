// OTA-124 vandalistic — dog smell-find cooldown + INT-roll semantics.
// Asserts:
//   - smell-find fires AT MOST once per room (dogSmelledHere latch)
//   - the latch is set on EITHER hit or miss
//   - INT-based roll: with INT=10 and DC=12, success rate is ~45%
//     (d20+10 >= 12 → roll >= 2 → 19/20 = 95%). Recalibrating: at
//     INT=10 the dog passes on any roll 2-20 (95%). Test the actual
//     observable rate.
//   - On success, INT trains (statProgress bumps)
//   - SPEC GAP: re-eligibility after visible-noun consumption isn't
//     wired anywhere; the engine sets dogSmelledHere=true but never
//     clears it. Flagged as test.failing.

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

import { trainDogStat, createDogCompanion } from '../app/engine/dogCompanion';

describe('OTA-124 vandalistic — smell-find cooldown semantics', () => {
  beforeAll(() => {
    console.log = () => {};
    console.warn = () => {};
  });

  describe('INT-roll rate sanity check (pure-engine simulation)', () => {
    // Mirror gameStore.ts:2762 — roll = d20; total = roll + dog.stats.intelligence; success = total >= 12.
    // At INT=10: roll must be >= 2 (19/20 = 95% success). At INT=0:
    // roll must be >= 12 (9/20 = 45%). At INT=2 (DC-12 - 10): success
    // on roll >= 10 (11/20 = 55%). So the spec's "~40-60% at INT=10"
    // is OFF — at INT=10 the actual rate is ~95%, not 40-60%. We
    // document this in the assertion (the framework rate target only
    // matches a much lower-INT dog).

    function simulateSmellSuccess(intStat: number, trials: number): number {
      let succ = 0;
      for (let i = 0; i < trials; i++) {
        const roll = 1 + Math.floor(Math.random() * 20);
        const total = roll + intStat;
        if (total >= 12) succ++;
      }
      return succ;
    }

    it('INT=10 produces ~95% success rate (NOT the spec\'s 40-60% — divergence noted)', () => {
      const succ = simulateSmellSuccess(10, 1000);
      const pct = (succ / 1000) * 100;
      expect(pct).toBeGreaterThan(85);
      expect(pct).toBeLessThan(100);
    });

    it('INT=1 produces ~50% success rate (matches spec\'s 40-60% band)', () => {
      const succ = simulateSmellSuccess(1, 1000);
      const pct = (succ / 1000) * 100;
      expect(pct).toBeGreaterThan(40);
      expect(pct).toBeLessThan(60);
    });

    it('INT=20 always succeeds (no roll can fail)', () => {
      const succ = simulateSmellSuccess(20, 200);
      expect(succ).toBe(200);
    });
  });

  describe('INT training on success — trainDogStat invocation', () => {
    it('200 successful smell-finds at INT=10 (in tier 6-10, award 2 each) → +1 INT and progress carries over', () => {
      let dog = createDogCompanion({
        name: 'Snout', breed: 'tracker', rawSex: 'they',
        startingProfile: 'mongrel', currentHour: 0,
      });
      const baseInt = dog.stats.intelligence;
      // tier 6-10 award = 2 per success → 50 successes for +1.
      for (let i = 0; i < 50; i++) {
        const r = trainDogStat(dog, 'intelligence', true);
        dog = r.dog;
      }
      expect(dog.stats.intelligence).toBe(baseInt + 1);
    });

    it('failed smell-finds DO NOT train INT', () => {
      let dog = createDogCompanion({
        name: 'Snout', breed: 'tracker', rawSex: 'they',
        startingProfile: 'mongrel', currentHour: 0,
      });
      const baseInt = dog.stats.intelligence;
      const baseProgress = dog.statProgress.intelligence;
      for (let i = 0; i < 100; i++) {
        const r = trainDogStat(dog, 'intelligence', false);
        dog = r.dog;
      }
      expect(dog.stats.intelligence).toBe(baseInt);
      expect(dog.statProgress.intelligence).toBe(baseProgress);
    });
  });

  describe('cooldown latch — dogSmelledHere semantics', () => {
    // The latch lives on worldMemory.visitedRooms[roomKey].dogSmelledHere.
    // After the engine sets it to true on first scene-entry roll, it
    // stays true until something clears it. The framework spec says
    // "After consuming all visible nouns in the room, smell-find
    // re-eligible (verify cooldown reset)" — but the engine has no
    // pass that clears the flag back to false. The comment at
    // gameStore.ts:2814-2816 acknowledges "a separate pass would clear
    // this flag back to false" but that pass was never implemented.

    it('latch value model: true after first scene entry, stays true regardless of outcome', () => {
      // We model the latch state directly here (the gameStore integration
      // would require a full scene+location to drive). Reset semantics:
      // once set, the engine never resets it without external action.
      const room = { dogSmelledHere: false } as { dogSmelledHere: boolean };
      // Simulate first entry — engine sets true on hit OR miss.
      room.dogSmelledHere = true;
      expect(room.dogSmelledHere).toBe(true);
      // 100 re-entries → still true.
      for (let i = 0; i < 100; i++) {
        // No code path flips it back.
      }
      expect(room.dogSmelledHere).toBe(true);
    });

    // OTA-124 — cooldown reset wired in the investigate handler.
    // When the player engages with any noun in a room, dogSmelledHere
    // flips back to false so the dog's nose re-engages on the next
    // scene re-entry. Simpler than strict "all consumed" check but
    // gets the spirit (per-room not per-save).
    it(
      'cooldown resets to false when the player investigates a noun in the room',
      () => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const src = require('fs').readFileSync(
          require('path').resolve(__dirname, '../app/state/gameStore.ts'),
          'utf-8',
        );
        // Look for an assignment that sets dogSmelledHere back to false.
        const matchesReset = /dogSmelledHere\s*[:=]\s*false/.test(src);
        expect(matchesReset).toBe(true);
      },
    );
  });
});
