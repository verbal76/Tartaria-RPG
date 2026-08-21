/**
 * OTA-1412 — EMBER HAD 14 MAX HP AND TOOK 15 IN ONE HIT.
 *
 * Owner's device log. That is not an unlucky roll — 14 was Ember's max HP at
 * character creation and it was still 14 hours of play later, because the dog's
 * HP pool is a CONSTANT for the whole campaign. `hpMax` was written in exactly
 * one place in the codebase (`createDogCompanion`) and read in nine.
 *
 * ⚠⚠ THE CAUSE IS A COPY THAT GREW WHILE THE ORIGINAL STOOD STILL.
 * `golems.ts:185` opens with "mirrors dogCompanion.trainDogStat" — the golem's
 * progression loop was copied FROM the dog's. Two things were then added to the
 * copy and never came back:
 *
 *   · arb170 — a stat level-up also adds +3 max HP ("toughens the frame").
 *   · OTA-467 — surviving a hit trains RESILIENCE.
 *
 * So the dog kept the OFFENSIVE half of its own loop (it trains on a landed
 * bite and a successful distract) and was left with neither defensive half.
 * Every other pool in the game moves: the player gains +1 hpMax per milestone
 * plus gearHpBonus on equip, the golem +3 per stat level, and escortees are
 * spawned at 0.35 × the player's hpMax. Only the dog held still.
 *
 * ⚠ THIS IS NOT A CHANGE TO THE STARTING NUMBER. 12-18 is fine against the 1d6
 * the early game throws — that is why nobody caught it for 1,400 OTAs. What was
 * missing was the curve, and the curve already existed, twenty lines away.
 */
import {
  createDogCompanion,
  trainDogStat,
  dogHpGainClause,
} from '../app/engine/dogCompanion';
import type { DogCompanion } from '../app/engine/types';

const read = (...p: string[]) =>
  require('fs').readFileSync(require('path').join(__dirname, '..', ...p), 'utf8') as string;

const DOG = read('app', 'engine', 'dogCompanion.ts');
const COMBAT = read('app', 'state', 'combatResolution.ts');
const STORE = read('app', 'state', 'gameStore.ts');
const GOLEMS = read('app', 'engine', 'golems.ts');

/**
 * Ember: a mutt, which is the profile the rescue scenarios hand out.
 *
 * ⚠ OTA-1420 — hp/hpMax PINNED TO 14 HERE, and that is not the suite drifting
 * from the game. Starting HP became a 2d4 roll, so a fresh mutt is now 11-17.
 * Every test below is about the GROWTH arithmetic — does a level add 3, does it
 * heal by the same 3, does the ceiling stop it — and none of them is about which
 * number the dice gave. Letting the roll through would make them flake one time
 * in seven for a reason unrelated to what they check. 14 is the roll's mean and
 * the owner's logged value, so the arithmetic reads exactly as his did.
 * The roll itself is tested in ota1420, where it is the subject.
 */
const ember = (over: Partial<DogCompanion> = {}): DogCompanion => ({
  ...createDogCompanion({
    name: 'Ember', breed: 'mutt', rawSex: 'girl',
    startingProfile: 'mutt', currentHour: 0,
  }),
  hp: 14,
  hpMax: 14,
  ...over,
});

/** Push a stat to the brink of a level so one more success tips it. */
const brink = (dog: DogCompanion, stat: 'strength' | 'dexterity' | 'intelligence') =>
  ({ ...dog, statProgress: { ...dog.statProgress, [stat]: 99 } });

describe('OTA-1412 — the owner\'s row', () => {
  it('⚠⚠ a fresh mutt is 14/14 — the number in his log', () => {
    const d = ember();
    expect(d.hpMax).toBe(14);
    expect(d.hp).toBe(14);
  });

  it('⚠⚠ …and BEFORE this fix that number could never change', () => {
    // Fifty landed bites — a real campaign's worth of successful attacks —
    // moved STR and moved nothing else. That was the whole defect.
    let d = ember();
    for (let i = 0; i < 50; i++) d = trainDogStat(d, 'strength', true).dog;
    expect(d.stats.strength).toBeGreaterThan(9);
    // The claim under test: the pool moved WITH the stat.
    expect(d.hpMax).toBeGreaterThan(14);
  });

  it('⚠⚠ a level-up adds exactly +3 max HP, the golem\'s own constant', () => {
    const r = trainDogStat(brink(ember(), 'strength'), 'strength', true);
    expect(r.leveled).toMatchObject({ stat: 'strength', from: 9, to: 10, hpGained: 3 });
    expect(r.dog.hpMax).toBe(17);
  });

  it('⚠⚠ …and heals by the same amount, so a level-up never shrinks the bar', () => {
    // arb170's rule, mirrored: the fraction of the bar that is full must not
    // drop because the dog got tougher. A wounded dog gains the HP too.
    const hurt = { ...brink(ember(), 'strength'), hp: 6 };
    const r = trainDogStat(hurt, 'strength', true);
    expect(r.dog.hp).toBe(9);
    expect(r.dog.hpMax).toBe(17);
  });
});

describe('OTA-1412 — the growth is bounded by the curve that already existed', () => {
  it('⚠⚠ no level-up means no HP — training progress alone does not toughen', () => {
    const r = trainDogStat(ember(), 'strength', true);
    expect(r.leveled).toBeNull();
    expect(r.dog.hpMax).toBe(14);
    expect(r.dog.statProgress.strength).toBeGreaterThan(0);
  });

  it('⚠⚠ a FAILED use trains nothing and adds nothing', () => {
    const r = trainDogStat(brink(ember(), 'strength'), 'strength', false);
    expect(r.leveled).toBeNull();
    expect(r.dog.hpMax).toBe(14);
  });

  it('⚠⚠ at the training ceiling the HP stops too — no unbounded pool', () => {
    // The existing DOG_MAX_TRAINED_STAT (30) is the cap, and it caps HP for
    // free: `hpBump` only fires on `leveled`, and `leveled` is null up there.
    // No new bound was invented; the old one now covers both.
    const maxed = ember({ stats: { strength: 30, dexterity: 10, intelligence: 12 } });
    const r = trainDogStat(brink(maxed, 'strength'), 'strength', true);
    expect(r.leveled).toBeNull();
    expect(r.dog.hpMax).toBe(14);
  });

  it('⚠ the award curve still throttles it — 22+ is 0.1 a use, so this is slow', () => {
    // Stated so the balance is legible rather than assumed: at stat 15-18 a
    // level is 200 successes. A realistic campaign buys a handful of levels,
    // not a hundred. The dog ends up near the player, not past them.
    const late = ember({ stats: { strength: 16, dexterity: 10, intelligence: 12 } });
    const r = trainDogStat(late, 'strength', true);
    expect(r.dog.statProgress.strength).toBe(0.5);
  });
});

describe('OTA-1412 — HP grows from ANY stat, because the dog trains at four doors', () => {
  it('⚠⚠ STR (a landed bite), DEX (a survived hit) and INT all toughen it', () => {
    // Awarded per LEVEL-UP, not per stat. A dog that bites and a dog that
    // endures both get tougher, which is what makes the loop worth playing.
    for (const stat of ['strength', 'dexterity', 'intelligence'] as const) {
      const r = trainDogStat(brink(ember(), stat), stat, true);
      expect(r.leveled?.hpGained).toBe(3);
      expect(r.dog.hpMax).toBe(17);
    }
  });

  it('⚠⚠ DEX growth compounds — it is the dog\'s AC as well as its HP', () => {
    // applyEnemyCounterToDog builds AC as `10 + dexMod + vest`. So surviving
    // hits makes the dog both harder to hit AND able to take more, which is
    // exactly the shape resilience gives the golem.
    let d = ember();
    const acOf = (x: DogCompanion) => 10 + Math.floor((x.stats.dexterity - 10) / 2);
    const ac0 = acOf(d);
    for (let i = 0; i < 4; i++) d = trainDogStat(brink(d, 'dexterity'), 'dexterity', true).dog;
    expect(d.stats.dexterity).toBe(14);
    expect(acOf(d)).toBe(ac0 + 2);
    expect(d.hpMax).toBe(26);
  });
});

describe('OTA-1412 — surviving a hit is the door that trained nothing', () => {
  it('⚠⚠ the one place the dog takes a hit and lives now trains DEX', () => {
    expect(COMBAT).toContain(
      "const trained = downed ? null : trainDogStat({ ...dog, hp: newHp }, 'dexterity', true);",
    );
  });

  it('⚠⚠ being DROPPED is not a lesson, and a MISS never reached here', () => {
    // Mirrors the golem's `else` branch: resilience trains only on a hit that
    // was survived. The miss path returns above this line, so `downed` is the
    // only exclusion the ternary has to make.
    const i = COMBAT.indexOf('const trained = downed ? null :');
    const before = COMBAT.slice(COMBAT.indexOf('export function applyEnemyCounterToDog'), i);
    expect(before).toContain('if (!hit) return;');
  });

  it('⚠ the trained FIELDS are spread onto the live record, not swapped for it', () => {
    // The training is computed off the dog captured at the top of the function;
    // only these four fields are this call\'s to write. Replacing the whole
    // record would silently revert anything else the turn had changed.
    const i = COMBAT.indexOf('const trained = downed ? null :');
    const body = COMBAT.slice(i, i + 1400);
    expect(body).toContain('stats: trained.dog.stats,');
    expect(body).toContain('statProgress: trained.dog.statProgress,');
    expect(body).toContain('hpMax: trained.dog.hpMax,');
    expect(body).not.toContain('dog: trained.dog,');
  });

  it('⚠⚠ the damage line reports the POST-TRAINING pool, not the stale one', () => {
    // If the swing that levelled the dog printed the old hpMax, the very hit
    // that toughened it would be the one hit that lied about it.
    expect(COMBAT).toContain(
      '${trained ? trained.dog.hp : newHp}/${trained ? trained.dog.hpMax : dog.hpMax} HP left',
    );
  });
});

describe('OTA-1412 — the dog does not grow silently', () => {
  it('⚠⚠ every one of the training sites appends the HP clause', () => {
    // Separate call sites each write their own log string. A hand-rolled clause
    // at each would be several readings of one rule — the drift this session has
    // repaired five times elsewhere. One function owns it.
    //
    // RETARGETED BY OTA-1414 — four doors became three when the sniff beat
    // stopped training INT (one stat, one job). The CLAIM is unchanged: every
    // door that trains must say what it gave. Counted against the doors that
    // exist rather than a number typed once, so ota1414's own count test and
    // this one cannot disagree.
    const doors = (STORE + COMBAT).split('trainDogStat(').length - 1;
    const uses = (STORE + COMBAT).split('dogHpGainClause(trained.dog, trained.leveled)').length - 1;
    expect(uses).toBe(doors);
    expect(STORE).toContain("rises to ${trained.leveled.to}.${dogHpGainClause");
    expect(COMBAT).toContain("'s DEX rises to ${trained.leveled.to}.${dogHpGainClause");
  });

  it('⚠⚠ the clause says the new pool, and says nothing when there is nothing to say', () => {
    const r = trainDogStat(brink(ember(), 'strength'), 'strength', true);
    expect(dogHpGainClause(r.dog, r.leveled)).toBe(' +3 max HP (17/17).');
    // No level, no clause — the stat line must not grow an empty parenthetical.
    const flat = trainDogStat(ember(), 'strength', true);
    expect(dogHpGainClause(flat.dog, flat.leveled)).toBe('');
    expect(dogHpGainClause(r.dog, null)).toBe('');
  });

  it('⚠ a wounded dog\'s clause shows the gap, not a false full bar', () => {
    const r = trainDogStat({ ...brink(ember(), 'strength'), hp: 6 }, 'strength', true);
    expect(dogHpGainClause(r.dog, r.leveled)).toBe(' +3 max HP (9/17).');
  });
});

describe('OTA-1412 — parity with the copy that outgrew it', () => {
  it('⚠⚠ the golem still declares itself a mirror of this function', () => {
    // This comment is the evidence for the whole OTA. If it ever goes away,
    // the reason these two files must move together goes with it.
    expect(GOLEMS).toContain('mirrors dogCompanion.trainDogStat');
  });

  it('⚠⚠ …and both now use the same +3, from a named constant on each side', () => {
    expect(GOLEMS).toContain('const HP_PER_LEVEL = 3;');
    expect(DOG).toContain('const DOG_HP_PER_LEVEL = 3;');
    expect(DOG).toContain('hpMax: dog.hpMax + hpBump,');
    expect(DOG).toContain('hp: dog.hp + hpBump,');
  });

  it('⚠ the measurement that drove it is written down, not asserted', () => {
    expect(DOG).toContain('Ember, 14 max HP, took 15 damage in one hit');
    expect(DOG).toContain('written in exactly one place');
  });
});

describe('OTA-1412 — every existing save heals itself, with no migration', () => {
  it('⚠⚠ an old dog keeps the pool it has and starts growing from there', () => {
    // Saves carry whatever hpMax they were created with. Nothing rewrites it on
    // load — the next level-up simply adds to it. A migration that retroactively
    // paid out levels already earned would need a training history nobody kept.
    const veteran = ember({
      hp: 11, hpMax: 14, stats: { strength: 13, dexterity: 12, intelligence: 15 },
    });
    const r = trainDogStat(brink(veteran, 'strength'), 'strength', true);
    expect(r.dog.hpMax).toBe(17);
    expect(r.dog.hp).toBe(14);
  });

  it('⚠ a dog created by any profile grows the same way', () => {
    // RETARGETED BY OTA-1420 — this asserted the flat table value each profile
    // used to start at. That number is now a 2d4 roll around the same mean, so
    // the claim here is what it was always really about: WHATEVER it starts at,
    // a level adds exactly 3. The start itself belongs to ota1420.
    for (const profile of ['mongrel', 'shepherd', 'hound', 'mutt', 'puppy'] as const) {
      const d = createDogCompanion({
        name: 'X', breed: 'b', rawSex: 'they',
        startingProfile: profile, currentHour: 0,
      });
      const r = trainDogStat(brink(d, 'dexterity'), 'dexterity', true);
      expect(r.dog.hpMax).toBe(d.hpMax + 3);
      expect(r.dog.hp).toBe(d.hp + 3);
    }
  });
});
