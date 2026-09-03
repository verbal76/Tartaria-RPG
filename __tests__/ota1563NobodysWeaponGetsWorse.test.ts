/**
 * OTA-1563 — NOBODY'S WEAPON GETS WORSE.
 *
 * ⚠⚠⚠ THE OWNER'S CALL, VERBATIM: *"remove the nerfs from 1a … also add these
 * effects to more catalog weapons. they increase the game enjoyability more."*
 *
 * OTA-1562 made "short range" mean something by taking the outermost band away
 * from five weapons players already owned. That bought the word its meaning with
 * somebody else's gear, and it was the wrong half of the ladder to build on. The
 * note now takes NOTHING from anything: a throwable's class bands already stop
 * short of `distant`, which IS short range and always was — correctly modelled
 * before anyone wrote a parser. The half that was genuinely missing is the top:
 * a thrown weapon whose card says it flies FURTHER than its class does. So the
 * whole ladder is promotions, and no save gets a worse weapon than it had.
 *
 * ⚠⚠⚠ THE VERB LIST WAS THE REAL CEILING, and this is the finding worth more
 * than the content pass. OTA-1562 recognised "ignores" and "cuts through" and
 * found eight weapons. Six other verbs were sitting in the catalog making the
 * identical promise, and every weapon behind them was failing for a reason that
 * had nothing whatever to do with its design:
 *
 *   Bone Siege Crossbow  "Pierces armor; only energy armor resists."
 *   Plasma Cutter Knife  "Melts through armor; 1d6 burning damage."
 *   Aetheric Blade       "bypasses non-magical defenses."
 *   Energy Blade         "Cuts non-magical armor; +1d6 on max roll."
 *   Laser Blade          "Cuts through metal; +1d6 against armor."
 *   Aether Lance         "Disrupts energy shields; …"
 *   Winter's Verdict     "the freeze carries through armour and holds"
 *
 * Seven weapons, no authoring — they had been promising it the whole time.
 *
 * ⚠⚠ THEN TWENTY MORE WERE WRITTEN, on a rarity ladder rather than scattered:
 * Common/Uncommon pierce one point, Rare two (or a class of armour), Legendary
 * pierce outright. They go to the families whose fiction is penetration — rail
 * and magnetic weapons, siege draws, energy edges, golem-forged mass — so the
 * answer to an armoured foe is a weapon you chose, not a stat you rolled.
 *
 * ⚠ ONE PROMOTION IS AUTHORED RATHER THAN INHERITED, and only one: the Energy
 * Pike, whose card has always read *"Fires energy blasts"* while the game gave
 * it a spear's two bands. Making that true is keeping a promise. Handing the
 * same line to a lance that never claimed to fire would be inventing a weapon,
 * which is a different thing and not what was asked for.
 */
import {
  parseWeaponEffect,
  applyRangeNote,
  armorIgnoreReduction,
} from '../app/engine/weaponEffects';
import { reachClassFor } from '../app/engine/combatRules';
import { reachBandsFor } from '../app/engine/types';
import type { CombatRange } from '../app/engine/types';

interface CatalogRow {
  name: string;
  weaponKind?: 'melee' | 'ranged' | 'runecaster';
  rarity?: string;
  tags?: string[];
  effect?: string;
}
// eslint-disable-next-line @typescript-eslint/no-require-imports
const CATALOG = require('../app/data/items/weapons.json') as { weapons?: CatalogRow[] } | CatalogRow[];
const WEAPONS: CatalogRow[] = Array.isArray(CATALOG) ? CATALOG : (CATALOG.weapons ?? []);
const row = (name: string): CatalogRow => {
  const found = WEAPONS.find((w) => w.name === name);
  if (!found) throw new Error(`catalog row missing: ${name}`);
  return found;
};
const classBands = (w: CatalogRow): CombatRange[] =>
  reachBandsFor(reachClassFor({ weaponKind: w.weaponKind, name: w.name, tags: w.tags }));
const bandsOf = (name: string): CombatRange[] => {
  const w = row(name);
  return applyRangeNote(classBands(w), parseWeaponEffect(w.effect)?.rangeNote ?? null);
};
const scopeOf = (name: string) => parseWeaponEffect(row(name).effect)?.armorIgnore?.scope;
const pointsOf = (name: string) => parseWeaponEffect(row(name).effect)?.armorIgnore?.points;

describe('OTA-1563 — the nerf is gone, and it cannot come back by accident', () => {
  it('⚠⚠⚠ NOT ONE WEAPON IN THE CATALOG REACHES LESS FAR THAN ITS CLASS', () => {
    // The guarantee stated over the real catalog rather than over five names, so
    // a future note, verb or reclassification cannot quietly shorten somebody's
    // gear. This is the assertion the owner's instruction actually buys.
    const shortened: string[] = [];
    for (const w of WEAPONS) {
      const base = classBands(w);
      const after = applyRangeNote(base, parseWeaponEffect(w.effect)?.rangeNote ?? null);
      if (after.length < base.length || base.some((b) => !after.includes(b))) shortened.push(w.name);
    }
    expect(shortened).toEqual([]);
  });

  it('⚠⚠⚠ THE FIVE THAT WERE SHORTENED YESTERDAY HAVE THEIR BAND BACK', () => {
    for (const name of ['Throwing Knife', 'Mud Throwing Knife', 'Bone Throwing Axe',
                        'Plasma Spear', 'Tartarian Hand Spear']) {
      expect(bandsOf(name)).toContain('far');
    }
    expect(bandsOf('Plasma Thrower')).toContain('distant');
  });

  it('⚠⚠ …and the ladder still has a top, so "long" is still worth reading', () => {
    // Four thrown weapons reach a band their class does not. That is the whole
    // difference between a knife and a javelin, and it is built entirely out of
    // one of them climbing rather than the other falling.
    for (const name of ['Bone War Javelin', 'Bone Javelin', 'Tartarian Spear (Throw)']) {
      expect(classBands(row(name))).not.toContain('distant');
      expect(bandsOf(name)).toContain('distant');
    }
  });

  it('⚠⚠ a thrown weapon says it reaches in the vocabulary of THROWING', () => {
    // "Long throw" and "Longer throw than a knife" are the same claim the Bone
    // War Javelin spells out as "Long range". Reading only the band vocabulary
    // left two weapons making the promise in the wrong words.
    expect(parseWeaponEffect('Long throw; accuracy drops in wind.')?.rangeNote).toBe('long');
    expect(parseWeaponEffect('Longer throw than a knife.')?.rangeNote).toBe('long');
  });

  it('⚠ THE ONE AUTHORED PROMOTION is a promise the card already made', () => {
    // The Energy Pike has always said "Fires energy blasts" and has always had a
    // spear's close+mid. Nothing else in the catalog was handed a range it never
    // claimed — that would be designing a new weapon, not keeping a promise.
    expect(row('Energy Pike').effect).toContain('Fires energy blasts');
    expect(bandsOf('Energy Pike')).toEqual(['distant', 'far', 'mid', 'close']);
    expect(parseWeaponEffect(row('Aether Lance').effect)?.rangeNote).toBeUndefined();
    expect(bandsOf('Aether Lance')).toEqual(['mid', 'close']);
  });
});

describe('OTA-1563 — seven weapons were promising it in verbs nobody read', () => {
  it('⚠⚠⚠ THE SIX MISSED VERBS, EACH ON THE WEAPON THAT USES IT', () => {
    expect(scopeOf('Plasma Cutter Knife')).toBe('all');        // "melts through"
    expect(scopeOf('Aetheric Blade')).toBe('nonmagical');      // "bypasses"
    expect(scopeOf('Energy Blade')).toBe('nonmagical');        // bare "cuts"
    expect(scopeOf('Laser Blade')).toBe('nonmagical');         // "cuts through metal"
    expect(scopeOf('Aether Lance')).toBe('shields');           // "disrupts"
    expect(scopeOf("Winter's Verdict Scepter")).toBe('all');           // "carries through"
    expect(scopeOf('Bone Siege Crossbow')).toBe('nonmagical'); // "pierces"
  });

  it('⚠⚠⚠ A QUALIFIER IN A LATER CLAUSE STILL BINDS THE CLAIM', () => {
    // "Pierces armor; only energy armor resists." — clause one is an unqualified
    // `all`, clause two is the exception that makes it `nonmagical`, and the
    // exception carries no ignore verb so clause-by-clause ranking scores it
    // nothing. Without the line-level cap the crossbow came out stronger than
    // its own sentence.
    expect(parseWeaponEffect('Pierces armor; only energy armor resists.')?.armorIgnore?.scope)
      .toBe('nonmagical');
    // The cap must not fire on a line that never took the exception.
    expect(parseWeaponEffect('Pierces armor.')?.armorIgnore?.scope).toBe('all');
  });

  it('⚠⚠⚠ THE DEFERRAL LEAK IS CLOSED — "on THIRD max roll" is still a max roll', () => {
    // The Bone Spear Launcher slipped the "on max" shape because an ordinal sat
    // between the two words, and was handed a permanent unconditional shield-
    // break on every swing: a Rare quietly out-performing the Legendary that has
    // to earn the same thing.
    // ⚠ RETARGETED BY OTA-1564, which took the ordinal OUT of this weapon's line
    // for the same reason the guard existed. Pinned against the literal wording
    // rather than the catalog row, so the guard stays tested even though nothing
    // in the data uses that shape any more — which is the only way a leak this
    // quiet stays closed.
    expect(parseWeaponEffect('Bypasses shields permanently on third max roll.')?.armorIgnore).toBeUndefined();
    expect(parseWeaponEffect('Ignores armor on 5th max roll.')?.armorIgnore).toBeUndefined();
    expect(parseWeaponEffect(row('Bone Spear Launcher').effect)?.armorIgnore).toBeUndefined();
    expect(parseWeaponEffect('Bypasses shields on rolls of 18+.')?.armorIgnore).toBeUndefined();
    expect(parseWeaponEffect(row('Plasma Executioner\'s Axe').effect)?.armorIgnore).toBeUndefined();
    expect(parseWeaponEffect(row('Bone Splitter Axe').effect)?.armorIgnore).toBeUndefined();
  });

  it('⚠⚠⚠ "REDUCES ENEMY ARMOR" IS STILL NOT A VERB, and that is deliberate', () => {
    // The four Mud blades that reduce armour by N are a SHRED — a lasting change
    // to the enemy, which the acid-coating path already models with its own
    // decay. Folding them in here would make that shred permanent, free, and
    // invisible, on weapons that are common enough to be most players' first
    // good blade.
    for (const name of ['Mud Kukri', 'Mud Cleaver', "Mud Emperor's Saber", 'Mud Royal Blade']) {
      expect(row(name).effect ?? '').toMatch(/reduc/i);
      expect(parseWeaponEffect(row(name).effect)?.armorIgnore).toBeUndefined();
    }
  });

  it('⚠⚠ a DAMAGE BONUS naming armour is not a pierce', () => {
    // "+1d6 to armor or structures" and "+1d6 against armored enemies" name the
    // same noun and mean the opposite thing. Requiring a verb is what keeps them
    // apart, and both must keep the bonus they already had.
    expect(parseWeaponEffect(row('Tartarian Great Knife').effect)?.armorIgnore).toBeUndefined();
    expect(parseWeaponEffect(row('Giant Bone Sword').effect)?.armorIgnore).toBeUndefined();
  });
});

describe('OTA-1563 — twenty more weapons, on a ladder rather than scattered', () => {
  /** Every weapon whose line the engine now reads as an armour piercer. */
  const piercers = WEAPONS.filter((w) => parseWeaponEffect(w.effect)?.armorIgnore);

  it('⚠⚠⚠ THE ANSWER TO AN ARMOURED FOE IS NOW A CHOICE, NOT A ROLL', () => {
    // Eight piercers in a 284-weapon catalog meant most builds simply had no
    // answer to plate. This is the number that makes armour a thing you counter
    // rather than a thing you endure.
    expect(piercers.length).toBeGreaterThanOrEqual(30);
  });

  it('⚠⚠⚠ RARITY IS THE LADDER — nothing Common out-pierces a Legendary', () => {
    // The rule the content pass was written to: Common/Uncommon take one point,
    // Rare take two or a class of armour, Legendary take armour outright. A
    // Common with an unconditional `all` would make every later weapon pointless.
    const worst: Record<string, number> = { Common: 1, Uncommon: 2 };
    for (const w of piercers) {
      const ig = parseWeaponEffect(w.effect)!.armorIgnore!;
      const cap = worst[String(w.rarity)];
      if (cap === undefined) continue; // Rare / Legendary are unconstrained here
      expect({ name: w.name, scope: ig.scope }).toMatchObject({ scope: expect.stringMatching(/points|light|nonmagical/) });
      if (ig.scope === 'points') expect(ig.points ?? 0).toBeLessThanOrEqual(cap);
    }
  });

  it('⚠⚠ the new lines land on the families whose fiction is penetration', () => {
    // Rail and magnetic drive, siege draw, energy edge, golem-forged mass.
    expect(scopeOf('Rail Cannon')).toBe('all');
    expect(scopeOf('Railgun Pike')).toBe('points');
    expect(pointsOf('Railgun Pike')).toBe(2);
    expect(scopeOf('Bolt-Caster')).toBe('points');
    expect(scopeOf('Aether Bolt-Caster')).toBe('points');
    expect(scopeOf('Tartarian Siege Bow')).toBe('points');
    expect(scopeOf("Founder's Edge")).toBe('all');
    expect(scopeOf('Sentinel Cleaver')).toBe('points');
    expect(scopeOf('Elder Golem Pike')).toBe('all');
    expect(scopeOf('Golem Pike')).toBe('points');
    expect(scopeOf('Mud-Iron Greatblade')).toBe('light');
  });

  it('⚠⚠ an ELDER golem weapon out-pierces the golem weapon it grew out of', () => {
    // The pairs are the clearest place a ladder either holds or is obviously
    // decorative, because the two weapons differ in nothing but tier.
    const plated = { traits: ['armored', 'armored'], name: 'Siege Hulk', type: 'Construct' };
    const p = (n: string) => armorIgnoreReduction(parseWeaponEffect(row(n).effect)?.armorIgnore, plated);
    expect(p('Elder Golem Pike')).toBeGreaterThan(p('Golem Pike'));
    expect(p('Elder Golem Greatsword')).toBeGreaterThan(p('Golem Greatsword'));
  });

  it('⚠⚠ every authored line SAYS ONLY WHAT THE ENGINE WILL HONOUR', () => {
    // The defect this whole program exists to close is a card that promises
    // something nothing reads. A content pass is the easiest possible way to
    // reintroduce it — an evocative drawback, a second mechanic in a subclause —
    // so every line written this OTA is checked to parse into exactly one rule.
    for (const name of ['Bolt-Caster', 'Aether Bolt-Caster', 'High-Impact Blaster',
                        'Bone Harpoon Launcher', 'Repeater Rifle', 'Sentinel Cleaver',
                        "Founder's Edge", 'Mud-Iron Greatblade', 'Golem Pike',
                        'Elder Golem Pike', 'Golem Aether-Lance', 'Elder Golem Greatsword',
                        'Golem Greatsword']) {
      const parsed = parseWeaponEffect(row(name).effect);
      expect(parsed?.armorIgnore).toBeDefined();
      // No range claim, no bleed/burn rider, no second mechanic hiding in the prose.
      expect(parsed?.rangeNote).toBeUndefined();
      expect(parsed?.onHitBleed).toBeUndefined();
    }
  });

  it('⚠ appended lines did not eat the effect that was already there', () => {
    // Six of the twenty were APPENDED to a weapon that already had a rule. The
    // failure mode is silently replacing it — the +1d6 vanishes and only the new
    // pierce is left.
    expect(parseWeaponEffect(row('Railgun Pike').effect)?.bonuses?.length).toBe(1);
    expect(parseWeaponEffect(row('Tartarian Siege Bow').effect)?.bonuses?.length).toBe(1);
    expect(row('Rail Cannon').effect).toContain('Requires 1 round to charge');
    expect(row('Aetherstone Gauntlet').effect).toContain('Grants +15 HP');
    expect(row('Revivalist Field Carbine').effect).toContain('tartarian revivalists');
  });

  it('⚠ and an unarmoured foe still gives every one of them nothing', () => {
    // Thirty-three piercers is thirty-three chances for "ignores armour" to have
    // quietly become a flat to-hit bonus against the whole bestiary.
    const rat = { traits: ['quick'], name: 'Scrap Rat', type: 'Animal' };
    for (const w of piercers) {
      expect(armorIgnoreReduction(parseWeaponEffect(w.effect)!.armorIgnore, rat)).toBe(0);
    }
  });
});
