/**
 * OTA-1562 — THE CARD MAKES A PROMISE.
 *
 * ⚠⚠⚠ THE FINDING THIS OTA OPENS. An audit of all 284 catalog weapons found
 * that only 56 carry an "Effect or Special Property" line anything reads: 23
 * through the `+NdN against X` clause parser, 33 through `statBonuses`. Forty-
 * four have no effect line at all. The remaining 184 print a sentence under a
 * rules heading that no code has ever asked about.
 *
 *   Compact Laser Pistol  — "Ignores light armor."   …and did not.
 *   Aetheric Railgun      — "Ignores armor; long range." …and did neither.
 *   Throwing Knife        — "Short range"            …reached exactly as far
 *                                                     as everything else.
 *
 * That is worse than a missing mechanic. A player reads the card, spends the
 * coin, and the game has lied to them about what they bought — and there is no
 * way to discover it, because a weapon that quietly ignores its own rule looks
 * identical to one that has none.
 *
 * ⚠⚠ THIS SLICE TAKES THE TWO FAMILIES THAT LAND ON SYSTEMS THAT ALREADY EXIST.
 * Range notes ride the reach bands (OTA-550 / OTA-1006 / OTA-1508); armour-
 * ignore rides the AC reduction the acid shred established in OTA-362. Nothing
 * new had to be invented to make nineteen sentences true, which is exactly why
 * these two went first: the riskiest way to close a finding this size is to land
 * six new combat mechanics in one push.
 *
 * ⚠⚠ WHAT IS DELIBERATELY LEFT ALONE, and why that is the honest answer rather
 * than the lazy one. An ignore qualified by an OUTCOME — the Plasma Scythe's
 * *"on max damage roll once per encounter (declinable)"*, the Plasma Burst
 * Rifle's *"on advantage rolls"* — is decided AFTER the roll this OTA touches.
 * It is a different mechanic wearing the same words. Parsing it here and then
 * not applying the condition would hand both weapons an unconditional pierce
 * they were never meant to have: the same defect, moved somewhere harder to see.
 * `IGNORE_DEFERRED_RE` refuses those clauses outright and the weapons stay
 * exactly as they were until their own slice.
 *
 * ⚠ FIVE WEAPONS GET SHORTER, and that is the point, not a regression. A
 * Throwing Knife billed SHORT RANGE threw as far as a Bone War Javelin billed
 * LONG. One of those two had to move for either word to mean anything; the
 * javelin gained a band and the knives gave one up.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  parseWeaponEffect,
  applyRangeNote,
  armorIgnoreReduction,
} from '../app/engine/weaponEffects';
import { armorACPortions, traitACBonus, PLATE_TRAIT_AC, FIELD_TRAIT_AC } from '../app/engine/enemyTraits';
import { reachClassFor } from '../app/engine/combatRules';
import { reachBandsFor } from '../app/engine/types';
import type { CombatRange } from '../app/engine/types';

const src = (p: string): string => readFileSync(join(__dirname, '..', p), 'utf8');

// eslint-disable-next-line @typescript-eslint/no-require-imports
const CATALOG = require('../app/data/items/weapons.json') as
  { weapons?: CatalogRow[] } | CatalogRow[];
interface CatalogRow {
  name: string;
  weaponKind?: 'melee' | 'ranged' | 'runecaster';
  rarity?: string;
  tags?: string[];
  effect?: string;
}
const WEAPONS: CatalogRow[] = Array.isArray(CATALOG) ? CATALOG : (CATALOG.weapons ?? []);
const row = (name: string): CatalogRow => {
  const found = WEAPONS.find((w) => w.name === name);
  if (!found) throw new Error(`catalog row missing: ${name}`);
  return found;
};
/** The bands this weapon actually reaches once its own note has spoken — the
 *  same two calls playerWeaponReach makes, so this test moves when it does. */
const bandsOf = (name: string): CombatRange[] => {
  const w = row(name);
  return applyRangeNote(
    reachBandsFor(reachClassFor({ weaponKind: w.weaponKind, name: w.name, tags: w.tags })),
    parseWeaponEffect(w.effect)?.rangeNote ?? null,
  );
};
/** A plain armoured raider: `armored` and nothing else. */
const PLATED = { traits: ['armored'], name: 'Scav Raider', type: 'Human' };
/** Armoured AND fielded AND quick on its feet — the case that separates the
 *  four scopes from each other. */
const WARDEN = { traits: ['armored', 'field:aether_shield', 'agile'], name: 'Iron Warden', type: 'Construct' };

describe('OTA-1562 — the range note finally means something', () => {
  // ⚠⚠⚠ RETARGETED BY OTA-1563, NOT RELAXED. This test used to assert that a
  // "short range" note took the outermost band away — five weapons players
  // already owned got shorter so the word would mean something. The owner's
  // call: *"remove the nerfs from 1a."* The note is still read and still
  // required to be there; what changed is that the ladder is now built out of
  // PROMOTIONS only. See ota1563 for the replacement ladder assertion.
  it('⚠⚠⚠ THE SHORT NOTE IS STILL READ — and takes nothing away from anybody', () => {
    for (const name of ['Throwing Knife', 'Mud Throwing Knife', 'Bone Throwing Axe',
                        'Plasma Spear', 'Tartarian Hand Spear']) {
      expect(parseWeaponEffect(row(name).effect)?.rangeNote).toBe('short');
      // A throwable's class bands already stop short of `distant`. That IS short
      // range, correctly modelled — the note describes it, it does not impose it.
      expect(bandsOf(name)).toEqual(['far', 'mid', 'close']);
    }
  });

  it('⚠⚠⚠ …AND THE ONE BILLED "LONG RANGE" REACHES FURTHER THAN THEM', () => {
    // This is the assertion that makes the pair of words a real choice rather
    // than two spellings of the same weapon.
    expect(bandsOf('Bone War Javelin')).toEqual(['distant', 'far', 'mid', 'close']);
    expect(bandsOf('Bone War Javelin').length).toBeGreaterThan(bandsOf('Throwing Knife').length);
  });

  // ⚠⚠⚠ RETARGETED BY OTA-1563. Both of these pinned HOW MUCH a short note took
  // away. It now takes nothing away from anything, which is the stronger and
  // simpler property, and the one worth pinning: applying the note is idempotent
  // and cannot shrink a band set no matter how it is spelled or how often it is
  // applied.
  it('⚠⚠⚠ NO NOTE, ON ANY CLASS, EVER MAKES A WEAPON REACH LESS FAR', () => {
    for (const cls of ['ranged', 'throwable', 'long', 'melee', 'barehanded'] as const) {
      const base = reachBandsFor(cls);
      for (const note of ['short', 'long', 'any', null] as const) {
        const after = applyRangeNote(base, note);
        expect(after.length).toBeGreaterThanOrEqual(base.length);
        // …and every band it had, it keeps.
        for (const b of base) expect(after).toContain(b);
      }
    }
  });

  it('⚠⚠ the Plasma Thrower keeps all four bands — a firearm is not a knife', () => {
    // It is a `firearm`, not a throwable, so "short range" for it means short FOR
    // A GUN. Its class is the answer; the note is a description of the class.
    expect(bandsOf('Plasma Thrower')).toEqual(['distant', 'far', 'mid', 'close']);
  });

  it('⚠⚠ a note NEVER promotes a melee weapon into a shooter', () => {
    // The guard that keeps flavour text from rewriting a weapon's class: a pike
    // that says "long" is a long PIKE, and the bands it reaches are the pike's.
    expect(applyRangeNote(reachBandsFor('melee'), 'long')).toEqual(['close']);
    expect(applyRangeNote(reachBandsFor('barehanded'), 'any')).toEqual(['close']);
    // A `long` weapon (spear class, close+mid) is above the one-band floor, so it
    // does open up — which is correct: a spear that "fires at any range" is the
    // Aetheric Pike (Rare), and firing is what its own text says it does.
    expect(applyRangeNote(reachBandsFor('long'), 'any')).toEqual(['distant', 'far', 'mid', 'close']);
  });

  it('⚠ four weapons are CONFIRMED, not changed — the note agrees with the class', () => {
    // Worth pinning precisely because nothing moved: these rows were already
    // telling the truth, and a future re-classification that broke them would
    // otherwise be silent.
    for (const name of ['Aetheric Pike (Rare)', 'Giant Bone Bow', 'Plasma Rifle', 'Plasma Cannon']) {
      expect(bandsOf(name)).toEqual(['distant', 'far', 'mid', 'close']);
    }
  });

  it('⚠ a weapon with no note, and a weapon with no effect line, are untouched', () => {
    expect(parseWeaponEffect('Causes bleed.')?.rangeNote).toBeUndefined();
    expect(parseWeaponEffect(undefined)).toBeNull();
    expect(applyRangeNote(reachBandsFor('ranged'), null)).toEqual(reachBandsFor('ranged'));
  });
});

describe('OTA-1562 — "ignores armour" removes armour, and only armour', () => {
  it('⚠⚠⚠ THE EIGHT PROMISES THE CATALOG MAKES ARE ALL PARSED', () => {
    const expected: Record<string, string> = {
      'Energy Blade (Legendary)': 'all',
      'Tartarian Siege Bow (Legendary)': 'all',
      'Aetheric Railgun': 'all',
      'High-Frequency Dagger': 'nonmagical',
      'Laser Sword': 'nonmagical',
      'Compact Laser Pistol': 'light',
      'Compact Energy Blade': 'points',
      'Aetheric Pulse Rifle': 'points',
    };
    for (const [name, scope] of Object.entries(expected)) {
      expect(parseWeaponEffect(row(name).effect)?.armorIgnore?.scope).toBe(scope);
    }
    expect(parseWeaponEffect(row('Compact Energy Blade').effect)?.armorIgnore?.points).toBe(1);
    expect(parseWeaponEffect(row('Aetheric Pulse Rifle').effect)?.armorIgnore?.points).toBe(2);
  });

  it('⚠⚠⚠ A PIERCER NEVER EATS THE `agile` +1 — FOOTWORK IS NOT ARMOUR', () => {
    // The whole reason `armorACPortions` exists rather than reusing traitACBonus.
    // A railgun that ate the agility bonus would be piercing the fact that the
    // thing MOVES, and the Iron Warden would be easier to hit than a slow one.
    const ignore = parseWeaponEffect(row('Aetheric Railgun').effect)?.armorIgnore;
    expect(traitACBonus(WARDEN.traits)).toBe(PLATE_TRAIT_AC + FIELD_TRAIT_AC + 1);
    expect(armorIgnoreReduction(ignore, WARDEN)).toBe(PLATE_TRAIT_AC + FIELD_TRAIT_AC);
  });

  it('⚠⚠⚠ THE FOUR SCOPES ARE ACTUALLY DIFFERENT WEAPONS, not four spellings', () => {
    const p = (name: string) => armorIgnoreReduction(parseWeaponEffect(row(name).effect)?.armorIgnore, WARDEN);
    expect(p('Aetheric Railgun')).toBe(5);        // all — plate AND the raised field
    expect(p('Laser Sword')).toBe(2);             // nonmagical — plate only, field stands
    expect(p('Compact Laser Pistol')).toBe(2);    // light — capped at one tier of plate
    expect(p('Aetheric Pulse Rifle')).toBe(2);    // points:2 — a flat number off the total
    expect(p('Compact Energy Blade')).toBe(1);    // points:1
  });

  it('⚠⚠ "ignores non-Aetheric armour" finds NOTHING on a thing made of aether', () => {
    // Otherwise the qualifier is decoration, and the High-Frequency Dagger is
    // simply an armour piercer with a longer sentence.
    const ig = parseWeaponEffect(row('High-Frequency Dagger').effect)?.armorIgnore;
    expect(armorIgnoreReduction(ig, PLATED)).toBe(PLATE_TRAIT_AC);
    expect(armorIgnoreReduction(ig, { traits: ['armored'], name: 'Aetheric Revenant', type: 'Aetheric' })).toBe(0);
  });

  it('⚠⚠ AN UNARMOURED FOE GIVES BACK NOTHING — a piercer is not a flat bonus', () => {
    // The failure mode this forbids is the one that would be invisible in play
    // and enormous in aggregate: "ignores armour" quietly becoming "+2 to hit
    // everything", including rats.
    const bare = { traits: ['quick'], name: 'Scrap Rat', type: 'Animal' };
    for (const name of ['Aetheric Railgun', 'Laser Sword', 'Compact Laser Pistol',
                        'Compact Energy Blade', 'Aetheric Pulse Rifle']) {
      expect(armorIgnoreReduction(parseWeaponEffect(row(name).effect)?.armorIgnore, bare)).toBe(0);
    }
  });

  it('⚠⚠ `light` and `points` are CAPPED — heavy plate still means something', () => {
    // Two `armored` traits is 4 points of plate. A light-armour piercer takes one
    // tier of it and no more; the flat-points piercers take what they say.
    const heavy = { traits: ['armored', 'armored'], name: 'Siege Hulk', type: 'Construct' };
    expect(armorACPortions(heavy.traits).plate).toBe(PLATE_TRAIT_AC * 2);
    expect(armorIgnoreReduction({ scope: 'light' }, heavy)).toBe(PLATE_TRAIT_AC);
    expect(armorIgnoreReduction({ scope: 'all' }, heavy)).toBe(PLATE_TRAIT_AC * 2);
    // …and a piercer can never hand AC BACK, however the traits are written.
    expect(armorIgnoreReduction({ scope: 'points', points: 99 }, heavy)).toBe(PLATE_TRAIT_AC * 2);
    expect(armorIgnoreReduction({ scope: 'all' }, { traits: ['weak_armor'], name: 'Husk' })).toBe(0);
  });

  it('⚠ null-safe at every entry, because this runs on the AC of every swing', () => {
    expect(armorIgnoreReduction(null, WARDEN)).toBe(0);
    expect(armorIgnoreReduction({ scope: 'all' }, null)).toBe(0);
    expect(armorIgnoreReduction({ scope: 'all' }, { name: 'Nobody' })).toBe(0);
    expect(armorACPortions(undefined)).toEqual({ plate: 0, field: 0 });
  });
});

describe('OTA-1562 — the promises this OTA refuses to fake', () => {
  it('⚠⚠⚠ AN OUTCOME-GATED IGNORE IS NOT PARSED, so it cannot be misapplied', () => {
    // These two are the whole reason the deferral guard exists. Both say
    // "ignores"; neither means "always", and an unconditional pierce is the
    // wrong answer by a wide margin — the Plasma Scythe's is once per ENCOUNTER.
    expect(parseWeaponEffect(row('Plasma Scythe').effect)?.armorIgnore).toBeUndefined();
    expect(parseWeaponEffect(row('Plasma Burst Rifle').effect)?.armorIgnore).toBeUndefined();
    expect(armorIgnoreReduction(parseWeaponEffect(row('Plasma Scythe').effect)?.armorIgnore, WARDEN)).toBe(0);
  });

  it('⚠⚠⚠ "IGNORES COVER" AND "IGNORES WIND" ARE NOT ARMOUR AND GET NOTHING', () => {
    // The Aetheric Sniper Bow and Aetheric Longbow make real promises about the
    // WEATHER system. Matching them here would have handed two bows a silent
    // armour pierce on the strength of the word "ignores", and buried the actual
    // weather feature under a bug that looked like it.
    expect(parseWeaponEffect(row('Aetheric Sniper Bow').effect)?.armorIgnore).toBeUndefined();
    expect(parseWeaponEffect(row('Aetheric Longbow').effect)?.armorIgnore).toBeUndefined();
  });

  it('⚠⚠ a two-clause line resolves to the STRONGER claim, not the last one', () => {
    // "Cuts through any armor; ignores non-magical defenses." — reading clause by
    // clause and keeping the highest-ranked scope means the order the author
    // happened to write them in cannot weaken the weapon.
    expect(parseWeaponEffect(row('Energy Blade (Legendary)').effect)?.armorIgnore?.scope).toBe('all');
    expect(parseWeaponEffect('Ignores non-magical armor. Cuts through any armor.')?.armorIgnore?.scope).toBe('all');
  });

  it('⚠⚠ a deferred clause disqualifies ITSELF, not the whole line', () => {
    // Clause-by-clause is what makes this true. A weapon that always pierces AND
    // has a separate max-roll rider must keep the pierce it earned.
    const both = parseWeaponEffect('Ignores armor. Ignores shields on advantage rolls.');
    expect(both?.armorIgnore?.scope).toBe('all');
  });

  it('⚠ nothing this OTA added disturbs what the parser already read', () => {
    const longbow = parseWeaponEffect(row('Aetheric Longbow').effect);
    expect(longbow?.bonuses).toEqual([{ dice: '1d6', condition: 'aerial' }]);
    expect(parseWeaponEffect('Causes bleed.')?.onHitBleed).toBe(true);
    // Plasma Rifle carries a range note AND an airborne bonus on the same line.
    const rifle = parseWeaponEffect(row('Plasma Rifle').effect);
    expect(rifle?.rangeNote).toBe('long');
    expect(rifle?.bonuses).toEqual([{ dice: '1d6', condition: 'aerial' }]);
  });
});

describe('OTA-1562 — the wiring', () => {
  const RULES = src('app/engine/combatRules.ts');
  const RESOLUTION = src('app/state/combatResolution.ts');
  const INPUT = src('app/components/InputBox.tsx');
  const PREVIEW = src('app/components/itemPreview.ts');
  const TRAITS = src('app/engine/enemyTraits.ts');

  it('⚠⚠⚠ the pierce LANDS ON THE AC STEP, on the same line the acid shred uses', () => {
    // One reduction, one floor. A parallel subtraction would have needed its own
    // clamp and the two could disagree about the minimum AC.
    expect(RULES).toContain(
      'const ac = Math.max(1, enemyAC(enemy) - Math.max(0, opts?.acReduction ?? 0) - armorPierce);',
    );
  });

  it('⚠⚠⚠ …computed off `equipped`, so an OFF-HAND swing pierces with the RIGHT weapon', () => {
    // OTA-957 is the precedent: a caller-side lookup read the main hand on every
    // off-hand swing, and a point-blank bonus landed on a blade. `equipped` in
    // buildCombatSteps is already resolved for the hand that swings.
    expect(RULES).toContain('const armorPierce = equipped');
    expect(RULES).toContain("armorIgnoreReduction(parseWeaponEffect(equipped.effect)?.armorIgnore, enemy)");
  });

  it('⚠⚠⚠ the range note is resolved ABOVE every branch of playerWeaponReach', () => {
    // The resolver has four exits (throwable instance, forge stamp, catalog row,
    // low-INT caster). A note applied at only some of them is OTA-1006 again — a
    // second authority on reach that disagrees with the gate.
    expect(RESOLUTION).toContain("const rangeNote = parseWeaponEffect(w?.effect)?.rangeNote ?? null;");
    expect(RESOLUTION).toContain("applyRangeNote(reachBandsFor('throwable'), rangeNote), label: throwInst.name");
    expect(RESOLUTION).toContain('applyRangeNote(reachBandsFor(cls), rangeNote), label: wpName');
    expect(RESOLUTION).toContain('applyRangeNote(reachBandsFor(cls), rangeNote), label: w.name');
  });

  it('⚠⚠ the low-INT caster penalty is NOT overruled by a weapon’s flavour text', () => {
    // That branch is a penalty the character earned by being under-statted. A
    // note that promoted the bands back would let the catalog undo a stat gate.
    expect(RESOLUTION).toContain("return { bands: reachBandsFor('throwable'), label: w.name }; // far/mid/close");
  });

  it('⚠⚠ the BANDOLIER BUTTON reads the same note the throw gate reads', () => {
    // It could not call playerWeaponReach (the item is not in a hand until the
    // throw racks it), so it re-derived bands from the class — harmless while
    // every throwable reached identically, a live disagreement the moment "short
    // range" started meaning something. A racked Throwing Knife would have
    // glowed GREEN at `far` and then been refused.
    expect(INPUT).toContain('const throwBands = applyRangeNote(');
    expect(INPUT).toContain("parseWeaponEffect(findWeaponByName(it.name)?.effect)?.rangeNote ?? null,");
    expect(INPUT).toContain('const inRange = range ? throwBands.includes(range) : true;');
  });

  it('⚠⚠ the roll card SAYS the armour was pierced', () => {
    // A lowered AC with no explanation reads as a weaker enemy, not a better
    // weapon — and the player never learns which of their weapons did it.
    expect(RULES).toContain(
      "armorPierce > 0 ? `AC ${ac} (armour pierced −${armorPierce})` : `AC ${ac}`",
    );
  });

  it('⚠⚠ the item card states the reach and the pierce BEFORE the coin is spent', () => {
    expect(PREVIEW).toContain('stats.push(`Reach: ${bands.map((b) => RANGE_LABELS[b]).reverse().join(\' → \')}`);');
    expect(PREVIEW).toContain("'Pierces armour',");
  });

  it('⚠ the armour AC numbers live ONCE, shared with traitACBonus', () => {
    // Two copies of "armored is +2" is how a piercer ends up removing a different
    // amount than the AC it was meant to cancel.
    expect(TRAITS).toContain('export const PLATE_TRAIT_AC = 2;');
    expect(TRAITS).toContain('export const FIELD_TRAIT_AC = 3;');
    expect(TRAITS).toContain("if (t === 'armored') bonus += PLATE_TRAIT_AC;");
    expect(TRAITS).toContain("if (t === 'armored') plate += PLATE_TRAIT_AC;");
  });
});
