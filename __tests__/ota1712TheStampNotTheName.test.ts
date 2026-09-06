/**
 * OTA-1712 — THE STAMP, NOT THE NAME (the two readers OTA-1703 left behind).
 *
 * OTA-1703 put an encounter key on every body a mission stage stands up, for a
 * reason it recorded in one sentence: *"a corruption apparition that happened to
 * be an Aetheric Raven closed the harpy hunt's four-raven stage before the
 * ravens existed."* A name is not an identity. It wired that stamp into the
 * escort clear and left two readers still counting by name — one in the engine
 * and one in the walker that audits the engine.
 *
 * ⚠⚠ THE ENGINE ONE WRITES TO THE LEDGER. `noteMissionFlee` records how many of
 * the stage's own bodies were still standing when the player ran, and that entry
 * is what later prose reads back. Counting by name let any same-named wanderer
 * inflate the number, so the world remembered a retreat at a size that never
 * happened.
 *
 * ⚠⚠ THE WALKER ONE IS WORSE IN ITS OWN WAY. `enemiesAreTheStage` decides
 * whether the road has to fight; a wandering pack sharing the stage's spawn name
 * reads as "the stage is already up", and the road skips the fight it exists to
 * measure — while its report still comes back clean. A walker that mis-sees is
 * worse than no walker.
 *
 * ⚠ BOTH DEGRADE RATHER THAN TIGHTEN. An unstamped body still matches on name,
 * because bodies saved mid-fight before OTA-1703 carry no key and refusing them
 * would trade a number that is sometimes too high for one that is always wrong.
 * Only a body stamped for a DIFFERENT stage is excluded — exactly the case a
 * name could never see.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { bodyBelongsToStage } from '../app/engine/missionTrace';

const src = (...p: string[]): string => readFileSync(join(__dirname, '..', ...p), 'utf8');

const KEY = 'hunt:hunt_harpy:2';

describe('OTA-1712 — the body test itself', () => {
  it('⚠⚠⚠ a body stamped for ANOTHER stage is not this stage’s, whatever it is called', () => {
    // The Aetheric Raven case, exactly: same name, different provenance.
    const apparition = { name: 'Aetheric Raven', stageKey: 'mystery:mystery_corruption:0' };
    expect(bodyBelongsToStage(apparition, KEY, 'Aetheric Raven')).toBe(false);
  });

  it('a body stamped for THIS stage is this stage’s', () => {
    expect(bodyBelongsToStage({ name: 'Aetheric Raven', stageKey: KEY }, KEY, 'Aetheric Raven')).toBe(true);
  });

  it('⚠⚠ an UNSTAMPED body falls back to the name — legacy saves keep working', () => {
    // Refusing these would start recording n:0 for every pre-OTA-1703 save:
    // swapping a number that is sometimes too high for one that is always wrong.
    expect(bodyBelongsToStage({ name: 'Aetheric Raven' }, KEY, 'Aetheric Raven')).toBe(true);
    expect(bodyBelongsToStage({ name: 'Mud Wasp' }, KEY, 'Aetheric Raven')).toBe(false);
  });

  it('the stamp OUTRANKS the name in both directions', () => {
    // Right stamp, wrong name → still this stage's body (the stage renamed it).
    expect(bodyBelongsToStage({ name: 'Something Else', stageKey: KEY }, KEY, 'Aetheric Raven')).toBe(true);
    // Wrong stamp, right name → not ours. This is the whole point.
    expect(bodyBelongsToStage({ name: 'Aetheric Raven', stageKey: 'hunt:hunt_harpy:1' }, KEY, 'Aetheric Raven')).toBe(false);
  });
});

describe('OTA-1712 — both readers ask it, and the key has ONE construction', () => {
  it('⚠⚠ the flee ledger counts by the stamp', () => {
    const sa = src('app', 'state', 'stageArrival.ts');
    // The count that goes into the deed entry.
    expect(sa.includes('MT.bodyBelongsToStage(b, fight.stageKey, fight.spawnName!) && b.hp > 0 && !b.ko')).toBe(true);
    // …and the apex, and the apex's max HP, which read the same field.
    expect(sa.includes('MT.bodyBelongsToStage(b, fight.stageKey, fight.apexName!)')).toBe(true);
    expect(sa.includes('MT.bodyBelongsToStage(e, fight.stageKey, fight.apexName!)')).toBe(true);
    // No name-equality comparison against the fight's names is left in the file.
    expect(/b\.name === fight\.(spawnName|apexName)/.test(sa)).toBe(false);
    expect(/e\.name === fight\.(spawnName|apexName)/.test(sa)).toBe(false);
  });

  it('⚠ the walker asks the same question, so it cannot mis-see the road', () => {
    const w = src('test-utils', 'contraryWalker.ts');
    expect(w.includes('const key = `${this.family}:${this.def.id}:${this.stage()}`;')).toBe(true);
    expect(w.includes('return stamped ? stamped === key : names.has(e.name);')).toBe(true);
  });

  it('⚠⚠ the key is BUILT where the fight is described, not rebuilt by each reader', () => {
    // Two constructions of `family:id:stage` would drift, and the drift would
    // look like data. missionFightUnderfoot hands the key out with the fight.
    const mt = src('app', 'engine', 'missionTrace.ts');
    expect(mt.includes('stageKey: `hunt:${def.id}:${rec.stage}`,')).toBe(true);
    expect(mt.includes('apexName: string | null; stageKey: string } | null')).toBe(true);
    // And it matches the format the SPAWNER stamps and the escort clear reads.
    const q = src('app', 'state', 'slices', 'questSlice.ts');
    expect(q.includes('enemy.stageKey === `${family}:${rec.id}:${rec.stage}`')).toBe(true);
  });
});

describe('OTA-1712 — the doc that had stopped being true', () => {
  it('⚠ resetMLHealth is wired, and its comment no longer says otherwise', () => {
    // It said "not wired to any UI yet (flagged for OTA-273)". RELOAD AI has
    // been on the About screen since, and OTA-1705's player-facing line points a
    // benched device at that button — a doc claiming it does not exist is one
    // reading away from someone deleting that promise as dead.
    const ml = src('app', 'diagnostics', 'mlHealth.ts');
    // ⚠ The phrase survives — as a QUOTATION of what the doc used to claim, which
    // is how this file records a correction rather than quietly erasing one. What
    // must not survive is the phrase being ASSERTED, so this checks it only ever
    // appears inside the "this used to say" clause.
    const claims = ml.split('not wired to any UI yet');
    expect(claims.length).toBe(2);
    expect(claims[0]!.endsWith('this used to say *"')).toBe(true);
    // The button it names is really there.
    const about = src('app', 'screens', 'AboutScreen.tsx');
    expect(about.includes('void resetMLHealth()')).toBe(true);
    expect(about.includes("'RELOAD AI'")).toBe(true);
    // And the line that sends players to it still does.
    expect(ml.includes('RELOAD AI on the About screen')).toBe(true);
  });
});
