/**
 * OTA-1414 — ONE STAT, ONE JOB.
 *
 * Owner: *"how about we just trained strength when they land a bite, dexterity
 * when they survive a hit, and intelligence when they win a distract, and get
 * rid of the sniffing something out in a room thing."*
 *
 * The map that results, and every door that feeds it:
 *
 *   STR — lands a bite            dog_bite
 *   DEX — survives a hit          applyEnemyCounterToDog (OTA-1412), and DEX is
 *                                 also the dog's AC, so it is the survivability
 *                                 stat end to end
 *   INT — wins a distract         dog_distract
 *
 * ⚠⚠ WHAT dog_distract USED TO DO. It rolled `max(DEX, INT)` and trained
 * whichever it picked — so one identical command trained DIFFERENT stats on
 * different dogs. A hound (DEX 12 / INT 10) trained DEX; a mutt (INT 12 / DEX
 * 10) trained INT. Two players doing the same thing ended up with different
 * sheets for a reason neither could see, and the max() only ever grew the stat
 * that was already ahead.
 *
 * ⚠⚠ AND THE SNIFF BEAT IS NOT DEAD — THAT PREMISE WAS WRONG.
 * There is no "go sniff" command, which is why it reads as missing. It fires by
 * ITSELF on entering a scene, once per room, d20 + INT vs 12, and a success adds
 * a hidden thing to the room to investigate. `pickHiddenSmellNounsForLocation`
 * falls back to the wasteland pool, so it reaches everywhere. It has been
 * training INT quietly for hundreds of OTAs.
 *
 * So the TRAINING was removed and the BEAT was kept. That satisfies the actual
 * request — one training door per stat — without deleting a working feature on
 * a premise that turned out to be false.
 */
import { trainDogStat, createDogCompanion } from '../app/engine/dogCompanion';
import type { DogCompanion } from '../app/engine/types';

const read = (...p: string[]) =>
  require('fs').readFileSync(require('path').join(__dirname, '..', ...p), 'utf8') as string;

const STORE = read('app', 'state', 'gameStore.ts');
const COMBAT = read('app', 'state', 'combatResolution.ts');

/** ⚠ OTA-1420 — hp/hpMax pinned; starting HP is a 2d4 roll now and these tests
 *  are about which STAT trains, not which number the dice gave. See ota1412's
 *  helper for the longer note, and ota1420 for the roll itself. */
const dog = (over: Partial<DogCompanion> = {}): DogCompanion => ({
  ...createDogCompanion({
    name: 'Ember', breed: 'mutt', rawSex: 'girl',
    startingProfile: 'mutt', currentHour: 0,
  }),
  hp: 14,
  hpMax: 14,
  ...over,
});

describe('OTA-1414 — each stat has exactly one training door', () => {
  it('⚠⚠ STR trains on a landed bite, and only there', () => {
    const bites = STORE.split("trainDogStat(dog, 'strength', true)").length - 1;
    expect(bites).toBe(1);
    expect(STORE).toContain('// Train STR on hit.');
  });

  it('⚠⚠ DEX trains on a survived hit, and only there', () => {
    expect(COMBAT).toContain("trainDogStat({ ...dog, hp: newHp }, 'dexterity', true)");
    // Not anywhere else — the store must not have grown a second DEX door.
    expect(STORE).not.toContain("trainDogStat(dog, 'dexterity'");
  });

  it('⚠⚠ INT trains on a won distract, and only there', () => {
    expect(STORE).toContain("const statKey = 'intelligence' as const;");
    // The sniff beat's INT training is gone — one door, not two.
    expect(STORE).not.toContain("trainDogStat(dog, 'intelligence', true)");
  });

  it('⚠⚠ the max(DEX, INT) pick is gone, not left beside the new line', () => {
    expect(STORE).not.toContain('dog.stats.dexterity >= dog.stats.intelligence');
  });

  it('⚠ exactly three training calls remain in the whole game', () => {
    // The count is the claim: one door per stat. A fourth appearing means the
    // map drifted, whichever stat it trains.
    const calls = (STORE + COMBAT).split('trainDogStat(').length - 1;
    expect(calls).toBe(3);
  });
});

describe('OTA-1414 — the distract rolls the stat it trains', () => {
  it('⚠⚠ roll and reward are the SAME stat — that is the whole point', () => {
    // Rolling one stat and training another is how the old code produced dogs
    // whose sheets did not match how they were played.
    const i = STORE.indexOf("const statKey = 'intelligence' as const;");
    const block = STORE.slice(i, STORE.indexOf('NOT FOOLED', i));
    expect(block).toContain('const statVal = dog.stats[statKey];');
    expect(block).toContain('const total = roll + statVal;');
    expect(STORE).toContain('const trained = trainDogStat(dog, statKey, true);');
  });

  it('⚠ the DC, the nat-1 and the nat-20 rules are untouched', () => {
    // OTA-795/796 tuned these. This OTA changes WHICH stat is added, nothing
    // about how hard the check is or how a natural roll resolves.
    expect(STORE).toContain('const distractDc = Math.max(12, 8 + parseEnemyAP(target));');
    expect(STORE).toContain('const success = roll === 1 ? false : roll === 20 ? true : total >= distractDc;');
  });

  it('⚠⚠ the hound\'s cost is stated in the source, not buried', () => {
    // A DEX-heavy dog now rolls its lower stat here. That is a real balance
    // change and it is written down where the change is.
    expect(STORE).toContain('THIS IS A BALANCE CHANGE FOR HOUNDS');
  });

  it('⚠ …and it self-corrects, which the old max() could not', () => {
    // The old rule trained the stat that was already ahead, so the gap was
    // permanent. Rolling and training the same stat closes it with use.
    const hound = dog({ stats: { strength: 9, dexterity: 12, intelligence: 10 } });
    let d = hound;
    for (let i = 0; i < 60; i++) d = trainDogStat(d, 'intelligence', true).dog;
    expect(d.stats.intelligence).toBeGreaterThan(hound.stats.intelligence);
  });
});

describe('OTA-1414 — the sniff beat survives, only its training left', () => {
  it('⚠⚠ the beat still fires and still speaks', () => {
    expect(STORE).toContain("noses at the ${hidden} and snorts. There's something there.");
    expect(STORE).toContain('const hiddenPool = pickHiddenSmellNounsForLocation(location);');
  });

  it('⚠⚠ …and it still seeds something to investigate — the actual feature', () => {
    expect(STORE).toContain('roomInvestigationTable: updatedTable,');
    expect(STORE).toContain('dogSmelledHere: true,');
  });

  it('⚠⚠ it reaches EVERY location, which is why "it never fires" was wrong', () => {
    // The pool falls back rather than returning empty, so there is no location
    // where the beat is unavailable. That is the fact that made the premise
    // false, and it is asserted rather than asserted-about.
    expect(STORE).toContain('return DOG_HIDDEN_SMELL_NOUNS.wasteland!;');
  });

  it('⚠ the reason it was kept is on the record', () => {
    expect(STORE).toContain('THIS NO LONGER TRAINS, AND THE FEATURE STAYS');
    expect(STORE).toContain('premise that turned out to be false');
  });

  it('⚠ the now-dead level-up log went with the training, not left orphaned', () => {
    const i = STORE.indexOf("noses at the ${hidden}");
    const after = STORE.slice(i, i + 600);
    expect(after).not.toContain("'s INT rises to");
  });
});

describe('OTA-1414 — the HP loop from OTA-1412 still rides all three doors', () => {
  it('⚠⚠ every stat still buys +3 max HP when it levels', () => {
    for (const stat of ['strength', 'dexterity', 'intelligence'] as const) {
      const brink = dog({ statProgress: { strength: 99, dexterity: 99, intelligence: 99 } });
      const r = trainDogStat(brink, stat, true);
      expect(r.leveled?.hpGained).toBe(3);
      expect(r.dog.hpMax).toBe(17);
    }
  });

  it('⚠ …and all three doors still announce it', () => {
    const uses = (STORE + COMBAT).split('dogHpGainClause(trained.dog, trained.leveled)').length - 1;
    expect(uses).toBe(3);
  });
});
