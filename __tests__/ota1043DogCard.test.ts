/**
 * OTA-1043 — three owner reports against the dog onboarding card.
 *
 *   1. "fired too fast — I hadn't seen the results of the fight and that I had
 *      won before that popped on the screen."
 *   2. "it's in the wrong color scheme. it's not the same color scheme as the
 *      rest of the game or style."
 *   3. "when I rolled for the dog's name I tapped it like 15 times. I got the
 *      same two names. we need a list of dog names… like 50 names long."
 *
 * (3) is the one with real logic behind it, so it gets real coverage: the old
 * pool was THREE names drawn with replacement, which is exactly why fifteen
 * taps produced two or three distinct results and could never produce more.
 */
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import {
  defaultDogName,
  dogNamePool,
  _resetDogNameBag,
} from '../app/engine/dogCompanion';

describe('OTA-1043 — the dog name pool', () => {
  beforeEach(() => _resetDogNameBag());

  it('is at least the fifty names the owner asked for', () => {
    expect(dogNamePool().length).toBeGreaterThanOrEqual(50);
  });

  it('holds no duplicates', () => {
    const pool = dogNamePool();
    expect(new Set(pool).size).toBe(pool.length);
  });

  it('every name is short enough for the 16-char name field', () => {
    // DogOnboardingModal caps the input at maxLength 16. A rolled name that
    // the player then cannot retype by hand would be a trap.
    for (const n of dogNamePool()) {
      expect(n.length).toBeGreaterThan(0);
      expect(n.length).toBeLessThanOrEqual(16);
    }
  });
});

describe('OTA-1043 — ROLL walks a shuffle bag, not a fresh random draw', () => {
  beforeEach(() => _resetDogNameBag());

  it('fifteen taps give fifteen DISTINCT names', () => {
    // The literal report. With the old three-name pool this was impossible.
    const rolled = Array.from({ length: 15 }, () => defaultDogName());
    expect(new Set(rolled).size).toBe(15);
  });

  it('a full bag hands out every name exactly once before repeating', () => {
    const size = dogNamePool().length;
    const rolled = Array.from({ length: size }, () => defaultDogName());
    expect(new Set(rolled).size).toBe(size);
    expect([...rolled].sort()).toEqual([...dogNamePool()].sort());
  });

  it('never repeats across the bag refill seam', () => {
    // The bag empties and reshuffles; without a guard the reshuffled bag could
    // hand back the name that just came out, producing a visible double-tap
    // repeat at exactly the least explicable moment.
    const size = dogNamePool().length;
    for (let trial = 0; trial < 25; trial++) {
      _resetDogNameBag();
      const rolled = Array.from({ length: size + 1 }, () => defaultDogName());
      expect(rolled[size]).not.toBe(rolled[size - 1]);
    }
  });

  it('does not always open on the same name', () => {
    // A shuffle that always started at the same place would read as broken.
    const firsts = new Set<string>();
    for (let trial = 0; trial < 40; trial++) {
      _resetDogNameBag();
      firsts.add(defaultDogName());
    }
    expect(firsts.size).toBeGreaterThan(1);
  });
});
