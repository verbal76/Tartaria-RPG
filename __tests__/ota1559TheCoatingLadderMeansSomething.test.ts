/**
 * OTA-1559 — THE COATING LADDER MEANS SOMETHING.
 *
 * ⚠⚠⚠ THE OWNER, looking at his own RECIPES tab: *"all coatings are still
 * 1d4."* Ten of the fourteen were, and the four that were not made it worse
 * rather than better.
 *
 * ⚠⚠⚠ THE RECIPES ALREADY DESCRIBED A LADDER. THE DICE JUST NEVER FOLLOWED IT.
 * Read the ingredient lists and the tiers are unmistakable:
 *
 *   · BASE     — cheap, foraged mats. Poison Vial (Leech Mucus + Violet Cap),
 *                Acid Flask (Aether Dust + Scrap Metal), Static Paste,
 *                Incendiary Paste, Corruption Tonic.
 *   · VARIANT  — a base recipe plus ONE more material, which buys a stat rider:
 *                Galvanic (+Residue → stealth), Resonant (+Crystal → charisma),
 *                Searing (+Scrap → strength), Smoldering (+Residue → int).
 *   · PREMIUM  — needs a SCARCE ingredient you cannot forage at will: a Disease
 *                Sample, Viper Venom, an Aetheric Shard.
 *
 * A player climbing that ladder paid more at every rung and, for the most part,
 * got the identical 1d4 at the top of it.
 *
 * ⚠⚠ FOUR THINGS WERE ACTUALLY WRONG, and this OTA changes four values — no
 * more, because a blanket buff is a different decision than a coherence fix:
 *
 *   1. CORRUPTION TONIC was RARE and rolled 1d4 — a Rare performing like an
 *      Uncommon, off a recipe (2 Aether Dust + 1 Blue Cap) that is pure base
 *      tier. Its rarity was the lie, not its dice. → Uncommon.
 *   2. PLAGUE TONIC and 3. PLAGUE VIAL each demand a DISEASE SAMPLE — the
 *      scarcest coating ingredient in the game — and rolled 1d6, the same die as
 *      an Uncommon Viper Venom Vial you can make from foraged venom. → 1d8.
 *   4. FROST PASTE costs a MUDSTONE more than the pastes beside it and bought
 *      nothing at all for it: same 1d4, no rider. → 1d6.
 *
 * ⚠ WHAT IS DELIBERATELY LEFT ALONE. The four rider pastes still roll 1d4. That
 * is not an oversight: they trade damage for a stat and cost one extra material
 * for the trade, so the plain base coating beside them is the CHEAP option
 * rather than a dominated one. Raising them would be a straight power increase
 * nobody asked for, and it would flatten the ladder from the other end.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

type Coating = { kind: string; dice: string; label: string; statBonus?: { stat: string; amount: number } };
type Row = { name: string; rarity: string; tags?: string[]; effect?: { coating?: Coating } };

const gear = JSON.parse(readFileSync(join(__dirname, '..', 'app/data/items/gear.json'), 'utf8')) as unknown;
const rows = (Array.isArray(gear) ? gear : Object.values(gear as Record<string, unknown>)[0]) as Row[];
const coatings = rows.filter(
  (r) => r && r.tags?.some((t) => String(t).toLowerCase() === 'weapon_coating') && r.effect?.coating,
);
const byName = (n: string): Row => {
  const r = coatings.find((c) => c.name === n);
  if (!r) throw new Error(`no coating named ${n}`);
  return r;
};
const dice = (n: string) => byName(n).effect!.coating!.dice;
const faces = (d: string) => parseInt(d.split('d')[1] ?? '0', 10);

describe('OTA-1559 — the four corrections', () => {
  it('⚠⚠⚠ CORRUPTION TONIC is no longer a Rare that performs like an Uncommon', () => {
    // Its recipe is 2 Aether Dust + 1 Blue Cap — base tier by every measure.
    // The rarity was the lie; the dice were honest.
    expect(byName('Corruption Tonic').rarity).toBe('Uncommon');
    expect(dice('Corruption Tonic')).toBe('1d4');
  });

  it('⚠⚠⚠ THE PLAGUE PAIR hit harder than anything you can forage', () => {
    // Both need a Disease Sample. They rolled the same die as a Viper Venom Vial
    // made from foraged venom, which made the scarce ingredient pointless.
    expect(dice('Plague Tonic')).toBe('1d8');
    expect(dice('Plague Vial')).toBe('1d8');
  });

  it('⚠⚠⚠ FROST PASTE finally buys something with its extra Mudstone', () => {
    expect(dice('Frost Paste')).toBe('1d6');
  });

  it('⚠⚠ …and nothing else moved — this is a coherence fix, not a buff pass', () => {
    expect(dice('Poison Vial')).toBe('1d4');
    expect(dice('Acid Flask')).toBe('1d4');
    expect(dice('Static Paste')).toBe('1d4');
    expect(dice('Incendiary Paste')).toBe('1d4');
    expect(dice('Viper Venom Vial')).toBe('1d6');
    expect(dice('Rime Draught')).toBe('1d6');
  });
});

describe('OTA-1559 — the ladder holds as a whole', () => {
  it('⚠⚠⚠ NOT ALL 1d4 ANY MORE — three rungs are in play, which was the complaint', () => {
    const distinct = new Set(coatings.map((c) => c.effect!.coating!.dice));
    expect(distinct.size).toBeGreaterThanOrEqual(3);
    expect([...distinct].sort()).toEqual(['1d4', '1d6', '1d8']);
  });

  it('⚠⚠⚠ NO RARE ROLLS AN UNCOMMON\'S DIE — the rung you paid for is the rung you get', () => {
    // The single property that makes a rarity label mean anything at all here.
    const rare = coatings.filter((c) => c.rarity === 'Rare');
    const uncommon = coatings.filter((c) => c.rarity === 'Uncommon');
    expect(rare.length).toBeGreaterThan(0);
    const bestUncommon = Math.max(...uncommon.map((c) => faces(c.effect!.coating!.dice)));
    for (const r of rare) {
      // A Rare either out-damages every Uncommon, or matches the best one AND
      // carries a rider it cannot get at Uncommon (Rime Draught: 1d6 + WIS).
      const f = faces(r.effect!.coating!.dice);
      const hasRider = !!r.effect!.coating!.statBonus;
      expect(f > bestUncommon || (f === bestUncommon && hasRider)).toBe(true);
    }
  });

  it('⚠⚠ NOTHING IS STRICTLY DOMINATED — no coating another one simply beats', () => {
    // Same rarity, same damage kind, no better rider, no better die = a recipe
    // with no reason to exist. This is the check the owner's complaint was
    // really about, and it is the one worth keeping forever.
    //
    // ⚠⚠⚠ AND IT HAS A THIRD AXIS, WHICH THE FIRST DRAFT OF THIS TEST MISSED AND
    // THEN CAUGHT ITSELF ON. It flagged Poison Vial (1d4) as dominated by Viper
    // Venom Vial (1d6) — same rarity, same kind, bigger die, no rider trade. On
    // the numbers that is domination. In the game it is not, because Poison Vial
    // is crafted from FORAGED mats (Leech Mucus + Violet Cap) and the Viper
    // Venom Vial demands VIPER VENOM, which you have to go and kill something
    // for. The cheap coating is the ACCESSIBLE one, not a worse one.
    //
    // So the rule is: b only dominates a when b is ALSO no harder to make —
    // every ingredient b needs, a needs too. A strictly costlier recipe is a
    // real trade and buying a bigger die with it is exactly how the ladder is
    // supposed to work. (Same reason Searing Paste, which is Incendiary plus a
    // Scrap Metal, does not dominate Incendiary.)
    const recipeJson = JSON.parse(readFileSync(join(__dirname, '..', 'app/data/items/recipes.json'), 'utf8')) as unknown;
    const recipeRows = (Array.isArray(recipeJson)
      ? recipeJson
      : Object.values(recipeJson as Record<string, unknown>)[0]) as Array<{ result: string; ingredients: Array<{ name: string }> }>;
    const ingredientsOf = (name: string): Set<string> => {
      const r = recipeRows.find((x) => x.result === name);
      return new Set((r?.ingredients ?? []).map((i) => i.name));
    };
    for (const a of coatings) {
      for (const b of coatings) {
        if (a === b) continue;
        const ca = a.effect!.coating!;
        const cb = b.effect!.coating!;
        if (a.rarity !== b.rarity) continue;
        if (ca.kind !== cb.kind) continue;
        // b costs something a does not → b is not free, so it cannot dominate.
        const needA = ingredientsOf(a.name);
        const needB = ingredientsOf(b.name);
        if (needB.size > 0 && [...needB].some((i) => !needA.has(i))) continue;
        const bBetterDie = faces(cb.dice) > faces(ca.dice);
        const bSameDie = faces(cb.dice) === faces(ca.dice);
        const aRider = !!ca.statBonus;
        const bRider = !!cb.statBonus;
        // b dominates a iff b is at least as good on BOTH axes and better on one.
        const dominated = (bBetterDie && (bRider || !aRider)) || (bSameDie && bRider && !aRider);
        if (dominated) {
          throw new Error(`${a.name} (${ca.dice}${aRider ? ' +rider' : ''}) is dominated by ${b.name} (${cb.dice}${bRider ? ' +rider' : ''}) — same rarity, same ${ca.kind}`);
        }
      }
    }
  });

  it('⚠⚠ every coating still declares a kind, a die and a label — the shape is intact', () => {
    expect(coatings.length).toBe(14);
    for (const c of coatings) {
      const co = c.effect!.coating!;
      expect(['poison', 'acid', 'corruption', 'electrical', 'burn', 'cold']).toContain(co.kind);
      expect(co.dice).toMatch(/^\dd\d+$/);
      expect(typeof co.label).toBe('string');
      expect(co.label.length).toBeGreaterThan(2);
    }
  });

  it('⚠ every damage family is represented, so a weakness always has an answer', () => {
    // The ★ on a combat button (OTA-1553) is only useful if the player can
    // actually acquire a coating of the type a foe is weak to.
    const kinds = new Set(coatings.map((c) => c.effect!.coating!.kind));
    for (const k of ['poison', 'acid', 'corruption', 'electrical', 'burn', 'cold']) {
      expect(kinds.has(k)).toBe(true);
    }
  });

  it('⚠ the rider pastes keep their 1d4 — the trade is damage FOR a stat', () => {
    // Deliberate. They cost one extra material and buy a stat instead of a die;
    // the plain paste beside them stays the cheap option rather than a dominated
    // one. Raising these would flatten the ladder from the other end.
    for (const n of ['Galvanic Paste', 'Resonant Paste', 'Searing Paste', 'Smoldering Paste']) {
      expect(dice(n)).toBe('1d4');
      expect(byName(n).effect!.coating!.statBonus).toBeTruthy();
    }
  });
});
