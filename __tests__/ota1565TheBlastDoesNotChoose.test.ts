/**
 * OTA-1565 — THE BLAST DOES NOT CHOOSE (slice 1c).
 *
 * ⚠⚠⚠ THE LAST AND RISKIEST FAMILY IN SLICE 1, held to the end on purpose. 1a
 * adjusted a number before the roll. 1b read the roll's own outcome. This one
 * reaches PAST the target and touches bodies the swing never named — other
 * enemies, and on two weapons, the player's own dog. Nine weapons say the damage
 * does not stop where you aimed it, and every one of them hit exactly one enemy.
 *
 * ⚠⚠⚠ FRIENDLY FIRE IS IMPLEMENTED, AND THAT IS THE HARD CALL IN THIS OTA. The
 * Magna-Cannon's card promises *"1d10 AoE damage to enemies or allies in arm's
 * reach of target"*; the Aetheric Sword of Storms says *"1d10 AoE Close range
 * (allies included)"*. Quietly sparing the dog would be the SAME defect this
 * whole programme exists to close, only inverted: a card stating a COST the game
 * declines to charge. And the cost is the reason those two hit as hard as they
 * do — spare it and they are simply the best weapons in the game. So it is
 * charged, stated on the item card before the coin is spent, and named in full
 * by the Arbiter on the beat it happens. Two weapons out of 284 can do it, both
 * say so in their own text, and no weapon was given the property that did not
 * already claim it.
 *
 * ⚠⚠ WHAT IS DELIBERATELY NOT A BLAST. Knockback moves bodies between range
 * bands (Shockwave Club, Shockwave Buckler); stun incapacitates them (Gravity
 * Hammer). Both are written in the same shockwave vocabulary and NEITHER IS
 * DAMAGE. A reader that matched on the word alone would hand three weapons a
 * damage blast their cards never promised while still doing nothing about the
 * effect they did — a strictly worse outcome than leaving them alone.
 *
 * ⚠ ONE MORE PROMPT REMOVED, flagged as my call. The Mud Army War Hammer said
 * *"Even/odd reroll to suppress the effect for one attack"* — the declinable
 * pattern the owner had already had removed from the Plasma Scythe, wearing a
 * coin flip. The shockwave is the weapon; the opt-out was the chore.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseWeaponEffect } from '../app/engine/weaponEffects';

const src = (p: string): string => readFileSync(join(__dirname, '..', p), 'utf8');

interface CatalogRow { name: string; rarity?: string; effect?: string }
// eslint-disable-next-line @typescript-eslint/no-require-imports
const CATALOG = require('../app/data/items/weapons.json') as { weapons?: CatalogRow[] } | CatalogRow[];
const WEAPONS: CatalogRow[] = Array.isArray(CATALOG) ? CATALOG : (CATALOG.weapons ?? []);
const row = (name: string): CatalogRow => {
  const found = WEAPONS.find((w) => w.name === name);
  if (!found) throw new Error(`catalog row missing: ${name}`);
  return found;
};
const splashOf = (name: string) => parseWeaponEffect(row(name).effect)?.splash;

describe('OTA-1565 — nine weapons stop hitting exactly one thing', () => {
  it('⚠⚠⚠ THE CATALOG SAYS "BLAST" IN EIGHT DIFFERENT WAYS AND ALL OF THEM READ', () => {
    // "splash", "AoE", "explosive rounds", "shockwave … radius", "to all
    // enemies", "to everything in arm's reach", "to everything close", "to
    // nearby enemies". OTA-1563 already taught this codebase that the verb list
    // is usually the real ceiling, not the catalog.
    const found = WEAPONS.filter((w) => parseWeaponEffect(w.effect)?.splash).map((w) => w.name).sort();
    expect(found).toEqual([
      'Aetheric Storm Scepter',
      'Aetheric Sword of Storms',
      'Fallout Bloom Stave',
      'Giant Warblade',
      'Magna-Cannon',
      'Mud Army War Hammer',
      'Plasma Artillery Cannon',
      'Plasma Cannon',
      'Plasma Destroyer',
      'Plasma Rifle',
    ]);
  });

  it('⚠⚠⚠ THE MAX-ROLL BLASTS REUSE OTA-1564\'S TRIGGER, not a second answer', () => {
    // Three of the nine only go off on a perfect roll. Asking "did the dice come
    // up max" in a second place is how two weapons end up disagreeing about it
    // on a crit — the exact reason 1564 built one reader.
    expect(splashOf('Giant Warblade')).toMatchObject({ dice: '1d6', whenMaxRoll: true });
    expect(splashOf('Mud Army War Hammer')).toMatchObject({ dice: '2d10', whenMaxRoll: true });
    expect(splashOf('Aetheric Sword of Storms')).toMatchObject({ dice: '1d10', whenMaxRoll: true });
    // …and the unconditional ones are NOT marked, or they would almost never fire.
    for (const n of ['Plasma Rifle', 'Plasma Cannon', 'Plasma Destroyer', 'Plasma Artillery Cannon', 'Magna-Cannon']) {
      expect({ n, when: splashOf(n)?.whenMaxRoll }).toEqual({ n, when: undefined });
    }
  });

  it('⚠⚠⚠ FRIENDLY FIRE IS CARRIED ONLY BY THE TWO WEAPONS THAT SAY SO', () => {
    // Never inferred from "AoE" or from the blast being at close range. A weapon
    // that can kill the player's companion has to claim it in its own data.
    expect(splashOf('Magna-Cannon')?.hitsAllies).toBe(true);
    expect(splashOf('Aetheric Sword of Storms')?.hitsAllies).toBe(true);
    const friendly = WEAPONS.filter((w) => parseWeaponEffect(w.effect)?.splash?.hitsAllies).map((w) => w.name);
    expect(friendly.sort()).toEqual(['Aetheric Sword of Storms', 'Magna-Cannon']);
  });

  it('⚠⚠⚠ KNOCKBACK AND STUN ARE NOT DAMAGE AND GET NO BLAST', () => {
    // The single most dangerous confusion in this slice. All three are written
    // in shockwave language; matching the word would give them a damage blast
    // their cards never promised AND still leave the promised effect unbuilt.
    for (const name of ['Shockwave Club', 'Shockwave Buckler', 'Gravity Hammer']) {
      expect({ name, splash: parseWeaponEffect(row(name).effect)?.splash }).toEqual({ name, splash: undefined });
    }
    expect(parseWeaponEffect('Shockwave on max roll — push enemies to far distance.')?.splash).toBeUndefined();
    expect(parseWeaponEffect('2d8 damage to all enemies; knocks prone.')?.splash).toBeUndefined();
  });

  it('⚠⚠ the Giant Bone Knuckles\' bonus is never a blast — and slice 4a paid it', () => {
    // The Giant Bone Knuckles' line is the shape of "+1d6 against constructs" —
    // a bonus against something you are ALREADY hitting. Matching it as a blast
    // would turn one effect into two, and THAT half of this test is unchanged.
    //
    // ⚠⚠ THE OTHER HALF IS NOW CLOSED, and the handoff between slices worked
    // exactly as intended. This test used to end by asserting the card still
    // read *"+1d6 to arm's-reach targets"* — a POSITIONAL condition the table
    // did not model, so the bonus resolved to nothing — and it said in as many
    // words that the finding belonged to slice 4's audit of the one-off tail.
    // OTA-1643 got there: on a weapon that has never reached further than arm's
    // length, that clause is ALWAYS true written as though it were sometimes
    // false, so the card was reworded and the promise now pays as an
    // unconditional rider. The pin is REPOINTED rather than deleted, because
    // what it guards is still live: this must be a rider, never a blast.
    const knuckles = parseWeaponEffect(row('Giant Bone Knuckles').effect);
    expect(knuckles?.splash).toBeUndefined();
    expect(knuckles?.bonuses).toBeUndefined();
    expect(row('Giant Bone Knuckles').effect).not.toContain("arm's-reach targets");
    expect(knuckles?.flatRider?.dice).toBe('1d6');
  });

  it('⚠⚠⚠ A RIDER ANYWHERE ON THE LINE DEFERS THE WHOLE WEAPON', () => {
    // The first draft judged the disqualifiers CLAUSE by clause, and
    // "2d8 damage to all enemies; knocks prone." slipped straight through — the
    // blast clause read clean because the rider sat in the next one. The weapon
    // would have gained a damage blast and still owed a prone it never got.
    expect(parseWeaponEffect('2d8 damage to all enemies; knocks prone.')?.splash).toBeUndefined();
    expect(parseWeaponEffect('2d20 bludgeoning; massive AoE stun + knockback (all enemies in 15 ft).')?.splash)
      .toBeUndefined();
    // Ember Storm's blast comes packaged with burning terrain this slice cannot
    // lay down, so the weapon waits rather than getting half of itself.
    expect(splashOf('Ember Storm Stave')).toBeUndefined();
  });

  it('⚠⚠⚠ …but the DICE may sit in a neighbouring clause, and are still found', () => {
    // The mirror of the same bug and just as real: a line can name the blast in
    // one clause and its damage in the other. Scoping the dice to the blast
    // clause alone silently dropped those.
    expect(parseWeaponEffect('2d8 fire; 15 ft AoE.')?.splash).toMatchObject({ dice: '2d8' });
    expect(splashOf('Plasma Rifle')).toMatchObject({ dice: '1d6' });
  });

  it('⚠⚠ a blast with NO NUMBER is not implementable, and the catalog has none left', () => {
    // The Giant Warblade said "Damage to all enemies in same range on max roll"
    // and named no amount, so there was nothing to apply even once a reader
    // existed. Every blast line now carries dice.
    for (const w of WEAPONS) {
      const s = parseWeaponEffect(w.effect)?.splash;
      if (s) expect({ name: w.name, dice: s.dice }).toMatchObject({ dice: expect.stringMatching(/^\d+d\d+$/) });
    }
    expect(parseWeaponEffect('Damage to all enemies in same range on max roll.')?.splash).toBeUndefined();
  });

  it('⚠ no per-swing opt-out prompt survives anywhere in the catalog', () => {
    // The Plasma Scythe's was removed on the owner's instruction; the Mud Army
    // War Hammer's "even/odd reroll to suppress" was the same pattern wearing a
    // coin flip, and went with it.
    const offenders = WEAPONS.filter((w) => /to suppress|declinable|save for later/i.test(w.effect ?? ''));
    expect(offenders.map((w) => w.name)).toEqual([]);
  });
});

describe('OTA-1565 — the wiring', () => {
  const STORE = src('app/state/gameStore.ts');
  const PREVIEW = src('app/components/itemPreview.ts');

  it('⚠⚠⚠ THE BLAST RUNS BEFORE resolveEnemyDefeat, on the roster it went off in', () => {
    // Running it after a kill would splash a list the corpse had already been
    // spliced out of. OTA-1140 is on record in this file for what index drift
    // after a kill costs — a stagger written onto whoever inherited the slot.
    const blast = STORE.indexOf('const splashSpec = parsedEffect?.splash;');
    const defeat = STORE.indexOf('resolveEnemyDefeat()', blast);
    expect(blast).toBeGreaterThan(0);
    expect(defeat).toBeGreaterThan(blast);
  });

  it('⚠⚠⚠ ROLLED ONCE FOR THE BLAST, not once per body', () => {
    // Per-victim rolling turns a 1d10 into "1d10 × however many showed up",
    // which scales hardest exactly when the fight is already hardest.
    expect(STORE).toContain('const blast = Math.max(1, rollFromNotation(splashSpec.dice));');
    expect(STORE).toContain('for (const i of victims) hps[i] = Math.max(0, (hps[i] ?? 0) - blast);');
  });

  it('⚠⚠⚠ IT NEVER TOUCHES THE TARGET TWICE, A CORPSE, OR ANOTHER BAND', () => {
    // Three separate ways a blast can be wrong, each cheap to get wrong and
    // invisible in play: double-dipping the thing that already took the swing,
    // re-killing something already down, and hitting a body standing somewhere
    // the explosion never reached.
    expect(STORE).toContain('if (i === activeIdx) return;');
    expect(STORE).toContain('if ((blastScene.enemyHps[i] ?? 0) <= 0) return;');
    expect(STORE).toContain('if (blastScene.enemyKnockedOut?.[i]) return;');
    expect(STORE).toContain('if (enemyBandOf(blastScene, i) !== targetBand) return;');
  });

  it('⚠⚠⚠ the DOG is only ever hit by a weapon that claims it, and only at close', () => {
    expect(STORE).toContain("if (splashSpec.hitsAllies && targetBand === 'close') {");
    expect(STORE).toContain('hasActiveDog(pWithDog)');
    // ⚠ OTA-1558's lesson, applied: a dog that is dead or abandoned is not a dog.
    // Reading a raw `player.dog` here would let a blast "hit" a companion that is
    // not in the fight, which is how that whole bug started.
    expect(STORE).toContain("(pWithDog.dog.hp ?? 0) > 0");
  });

  it('⚠⚠ the max-roll blasts share 1564\'s trigger rather than re-deriving it', () => {
    expect(STORE).toContain('if (splashSpec && (!splashSpec.whenMaxRoll || swungMaxRoll)) {');
  });

  it('⚠⚠ the player is TOLD, both when it happens and before they buy it', () => {
    // A blast the player cannot see is indistinguishable from one that does
    // nothing — and friendly fire they were not warned about is worse than that.
    expect(STORE).toContain('The blast opens past ${enemy.name}');
    expect(STORE).toContain('your dog is inside the radius for ${dogHit}');
    expect(PREVIEW).toContain("s.hitsAllies ? ' — AND to your companions in it' : ''");
  });
});
