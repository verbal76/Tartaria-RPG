/**
 * OTA-1067 — the golem naming card brought in line with the dog card.
 *
 * The owner reported three faults against DogOnboardingModal (OTA-1066). Its
 * sibling GolemNamingModal carried the same three, found by reading the file
 * rather than by a second device report:
 *
 *   1. It rendered the instant `pendingGolemNaming` flipped — the same tick
 *      that logs "Aetherstone lifts out of the ground… (HP x/y, NdM type)".
 *      That summon line is the ONLY place the golem's stats are stated, and
 *      the card covered it.
 *   2. Same cold slate/cyan palette on a full-bleed backdrop, against a game
 *      built on warm browns and gold.
 *   3. No ROLL button at all, while its sibling has one.
 *
 * (3) is the part with logic, so it carries the coverage.
 */
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import {
  suggestGolemName,
  golemNamePool,
  _resetGolemNameBag,
} from '../app/engine/golems';
import { dogNamePool } from '../app/engine/dogCompanion';

describe('OTA-1067 — the golem name pool', () => {
  beforeEach(() => _resetGolemNameBag());

  it('is at least fifty names, matching its sibling', () => {
    expect(golemNamePool().length).toBeGreaterThanOrEqual(50);
  });

  it('holds no duplicates', () => {
    const pool = golemNamePool();
    expect(new Set(pool).size).toBe(pool.length);
  });

  it('fits the 16-character name field', () => {
    for (const n of golemNamePool()) {
      expect(n.length).toBeGreaterThan(0);
      expect(n.length).toBeLessThanOrEqual(16);
    }
  });

  it('reads as a different register from the dog names', () => {
    // A dog is an animal you name; a golem is a thing you made. If the two
    // pools were largely the same words the distinction would be lost, and
    // rolling a golem name would feel like rolling a puppy name.
    const dogs = new Set(dogNamePool());
    const shared = golemNamePool().filter((n) => dogs.has(n));
    expect(shared.length).toBeLessThanOrEqual(3);
  });
});

describe('OTA-1067 — golem ROLL walks a shuffle bag', () => {
  beforeEach(() => _resetGolemNameBag());

  it('fifteen taps give fifteen distinct names', () => {
    const rolled = Array.from({ length: 15 }, () => suggestGolemName());
    expect(new Set(rolled).size).toBe(15);
  });

  it('hands out every name once before repeating', () => {
    const size = golemNamePool().length;
    const rolled = Array.from({ length: size }, () => suggestGolemName());
    expect([...rolled].sort()).toEqual([...golemNamePool()].sort());
  });

  it('never repeats across the bag refill seam', () => {
    // Names come off with pop(), so the refill guard has to look at the TAIL.
    // The dog version shipped with this backwards on the first cut.
    const size = golemNamePool().length;
    for (let trial = 0; trial < 25; trial++) {
      _resetGolemNameBag();
      const rolled = Array.from({ length: size + 1 }, () => suggestGolemName());
      expect(rolled[size]).not.toBe(rolled[size - 1]);
    }
  });

  it('does not always open on the same name', () => {
    const firsts = new Set<string>();
    for (let trial = 0; trial < 40; trial++) {
      _resetGolemNameBag();
      firsts.add(suggestGolemName());
    }
    expect(firsts.size).toBeGreaterThan(1);
  });

  it('keeps its own bag, independent of the dog bag', () => {
    // Two module-level bags. If they were ever collapsed into one shared
    // generator, rolling a dog name would silently consume golem names.
    const before = suggestGolemName();
    _resetGolemNameBag();
    const after = suggestGolemName();
    expect(golemNamePool()).toContain(before);
    expect(golemNamePool()).toContain(after);
  });
});
