/**
 * OTA-1420 — A DOG IS ROLLED FOR, LIKE A PERSON.
 *
 * Owner: *"let's set the dogs for a dice roll for starting number. not a floor,
 * let's make it like the start process for the player."*
 *
 * The player's shape (character.ts): `rollStartingHP(race)` = **5d10 + the
 * race's bonus** — a fistful of dice for spread, plus a flat term saying which
 * KIND you are. Dogs had only the flat term, so two dogs pulled off the same
 * rescue were identical to the point.
 *
 * ⚠⚠ THE MEAN IS THE OLD NUMBER, EXACTLY. `2d4` averages 5, so each profile's
 * bonus is its old flat HP minus 5. The mongrel still averages 16, the puppy
 * still averages 12. This is a character-creation change, not a tuning pass —
 * the tuning was already done and must not move under it.
 *
 * ⚠ 2d4 rather than 2d6 or 1d8: two dice bell, so the middle is common and the
 * ends are rare, the same reason the player rolls five. 2d6 would put a puppy at
 * 7 HP — one hit from anything, decided before the player makes a choice.
 */
import {
  rollStartingDogHP,
  createDogCompanion,
  trainDogStat,
} from '../app/engine/dogCompanion';
import type { DogStartingProfile } from '../app/engine/types';

const read = (...p: string[]) =>
  require('fs').readFileSync(require('path').join(__dirname, '..', ...p), 'utf8') as string;
const DOG = read('app', 'engine', 'dogCompanion.ts');
const CHARACTER = read('app', 'engine', 'character.ts');

/** Every profile with the range the shipped table must produce. */
const BANDS: ReadonlyArray<readonly [DogStartingProfile, number, number, number]> = [
  // profile,     min, max, mean (= the pre-OTA-1420 flat value)
  ['shepherd',     15,  21, 18],
  ['mongrel',      13,  19, 16],
  ['hound',        11,  17, 14],
  ['mutt',         11,  17, 14],
  ['puppy',         9,  15, 12],
];

const sample = (profile: DogStartingProfile, n = 4000) =>
  Array.from({ length: n }, () => rollStartingDogHP(profile));

describe('OTA-1420 — the roll lands where the old flat number was', () => {
  it('⚠⚠ every profile stays inside its band, always', () => {
    for (const [profile, min, max] of BANDS) {
      const rolls = sample(profile);
      expect(Math.min(...rolls)).toBeGreaterThanOrEqual(min);
      expect(Math.max(...rolls)).toBeLessThanOrEqual(max);
    }
  });

  it('⚠⚠ …and BOTH ends are actually reachable — a range nobody hits is a lie', () => {
    for (const [profile, min, max] of BANDS) {
      const rolls = sample(profile);
      expect(rolls).toContain(min);
      expect(rolls).toContain(max);
    }
  });

  it('⚠⚠ the average is the OLD value, so no balance moved', () => {
    // The whole justification for picking these dice. 2d4 means 5; each bonus
    // is oldFlat - 5. Tolerance is loose enough not to flake, tight enough that
    // a changed die or bonus fails it.
    for (const [profile, , , mean] of BANDS) {
      const rolls = sample(profile);
      const avg = rolls.reduce((a, b) => a + b, 0) / rolls.length;
      expect(Math.abs(avg - mean)).toBeLessThan(0.35);
    }
  });

  it('⚠ the profiles keep their order — a shepherd is still the sturdy one', () => {
    const means = BANDS.map(([p]) => {
      const r = sample(p, 3000);
      return r.reduce((a, b) => a + b, 0) / r.length;
    });
    expect(means[0]).toBeGreaterThan(means[1]!);   // shepherd > mongrel
    expect(means[1]).toBeGreaterThan(means[2]!);   // mongrel  > hound
    expect(means[3]).toBeGreaterThan(means[4]!);   // mutt     > puppy
  });

  it('⚠⚠ it BELLS — the middle is common and the ends are rare', () => {
    // The reason for two dice instead of one. With 1d7 every value would be
    // equally likely and a puppy would roll its floor as often as its mean.
    const rolls = sample('mutt', 8000);
    const count = (v: number) => rolls.filter((r) => r === v).length;
    expect(count(14)).toBeGreaterThan(count(11) * 2);  // mean vs floor
    expect(count(14)).toBeGreaterThan(count(17) * 2);  // mean vs ceiling
  });
});

describe('OTA-1420 — two dogs off the same rescue are no longer identical', () => {
  it('⚠⚠ createDogCompanion actually rolls, rather than reading the table', () => {
    const made = Array.from({ length: 200 }, () => createDogCompanion({
      name: 'X', breed: 'b', rawSex: 'they', startingProfile: 'mutt', currentHour: 0,
    }).hpMax);
    expect(new Set(made).size).toBeGreaterThan(1);
    expect(Math.min(...made)).toBeGreaterThanOrEqual(11);
    expect(Math.max(...made)).toBeLessThanOrEqual(17);
  });

  it('⚠⚠ a fresh dog starts at FULL health, whatever it rolled', () => {
    // hp and hpMax must come from the same roll. Reading the table for one and
    // the dice for the other would spawn dogs already wounded.
    for (let i = 0; i < 200; i++) {
      const d = createDogCompanion({
        name: 'X', breed: 'b', rawSex: 'they', startingProfile: 'hound', currentHour: 0,
      });
      expect(d.hp).toBe(d.hpMax);
    }
    expect(DOG).toContain('const hpMax = rollStartingDogHP(args.startingProfile);');
    expect(DOG).toContain('hp: hpMax,');
  });

  it('⚠ …and the STATS are still fixed per profile — only HP was rolled', () => {
    // The owner asked for a starting NUMBER, not a rebuilt character creator.
    // Rolling stats too would change how every dog plays, which is a different
    // decision and was not the one made.
    const a = createDogCompanion({ name: 'A', breed: 'b', rawSex: 'they', startingProfile: 'mutt', currentHour: 0 });
    const b = createDogCompanion({ name: 'B', breed: 'b', rawSex: 'they', startingProfile: 'mutt', currentHour: 0 });
    expect(a.stats).toEqual(b.stats);
    expect(a.stats).toEqual({ strength: 9, dexterity: 10, intelligence: 12 });
  });
});

describe('OTA-1420 — it mirrors the player, and says so', () => {
  it('⚠⚠ the player still rolls dice + a type bonus — the shape being copied', () => {
    expect(CHARACTER).toContain('const base = rollDice(5, 10);');
    expect(CHARACTER).toContain('return base + race.startingHPBonus;');
  });

  it('⚠⚠ …and the dog now does the same, from one exported function', () => {
    // One place the number comes from. A test that re-implements the formula
    // tests nothing, and a second call site would drift.
    expect(DOG).toContain('export function rollStartingDogHP(profile: DogStartingProfile): number {');
    expect(DOG).toContain('return rollDice(DOG_HP_DICE.count, DOG_HP_DICE.sides) + DOG_HP_BONUS[profile];');
    expect((DOG.match(/rollStartingDogHP\(/g) ?? []).length).toBe(2); // definition + the one caller
  });

  it('⚠ the reasoning is on the record, including the die that was rejected', () => {
    expect(DOG).toContain('A DOG IS ROLLED FOR, LIKE A PERSON');
    expect(DOG).toContain('THE MEAN IS THE OLD NUMBER, EXACTLY');
    expect(DOG).toContain('2d4 AND NOT 2d6 OR 1d8');
  });
});

describe('OTA-1420 — existing saves and the growth loop are untouched', () => {
  it('⚠⚠ nothing re-rolls a dog that already exists', () => {
    // The roll runs once, at creation. A save carries its own hpMax and keeps
    // it — re-rolling on load would resize a companion the player already knows.
    const i = DOG.indexOf('export function createDogCompanion');
    expect(DOG.indexOf('rollStartingDogHP(args.startingProfile)')).toBeGreaterThan(i);
    expect(DOG).not.toContain('hpMax: base.hpMax');
  });

  it('⚠⚠ OTA-1412 still adds exactly 3 on top of whatever was rolled', () => {
    for (const profile of ['mongrel', 'shepherd', 'hound', 'mutt', 'puppy'] as const) {
      const d = createDogCompanion({ name: 'X', breed: 'b', rawSex: 'they', startingProfile: profile, currentHour: 0 });
      const brink = { ...d, statProgress: { ...d.statProgress, dexterity: 99 } };
      const r = trainDogStat(brink, 'dexterity', true);
      expect(r.dog.hpMax).toBe(d.hpMax + 3);
    }
  });
});
