/**
 * OTA-1560 — WHAT POWER TIES TO WHAT STAT.
 *
 * ⚠⚠⚠ THE OWNER SET THE WHOLE FRAME, over three messages:
 *   · *"a runecaster is a power weapon so it can only use the power it can
 *     generate, so you cannot apply coatings, but they can be upgraded at the
 *     crucible, but it adds passive stats instead that improve with character
 *     stats."*
 *   · *"the passives would depend on what the power is ... say you're going for
 *     stealth and you want a dexterity passive so then maybe that only applies
 *     to mud. that's an example, not a given. so let's track what powers they
 *     have and what stats we can tie them to."*
 *   · *"we need more Frost and radiation runecaster, And do the split between
 *     intelligence and wisdom."* and, on whether school should change the
 *     numbers: *"I agree"* — it should not.
 *
 * ⚠⚠⚠ HIS EXAMPLE PICKED THE AXIS, AND IT OVERRULED MY FIRST ANSWER. I modelled
 * DAMAGE TYPE → stat first. It put Slick Mud and Dust Cloud on STRENGTH, because
 * both are bludgeoning — and those two are precisely what a stealth build wants.
 * The role is the playstyle; the damage type is only what the spell is made of.
 * So the role picks the stat, and the damage type is consulted for PLAIN STRIKES
 * alone, because a strike has no playstyle of its own.
 *
 * ⚠⚠ THE CATALOGUE WAS NOT THE PROBLEM, WHICH IS WHY IT WAS NOT "FIXED". He
 * asked directly — *"do we need to change the catalogue? is it unevenly
 * distributed? I don't want a bandaid."* Measured: the two schools COMPLEMENT
 * (mud owns cover/summon/terrain, aether owns buff/debuff/healing/utility) and
 * the eighteen aether strikes are a clean rarity LADDER, not a pile. The default
 * school being the deepest is correct. Nothing was re-typed; re-tagging shipped
 * weapons would silently change items sitting in live saves.
 *
 * ⚠⚠ WHAT WAS ACTUALLY THIN GOT WRITTEN, NOT REASSIGNED: cold and radiation each
 * had exactly ONE caster, so WIS had almost nothing to want. Four new frost and
 * four new radiation casters, spread across rarity and role, plus the INT/WIS
 * split — and the split is not a quota either. It is what the spells ARE: force
 * applied outward stays INT; the spells that UNMAKE (Disrupt severs a thread,
 * Displace moves a thing out of true, the Void trio takes something away) go to
 * WIS, carrying an `unmaking` tag so the rule reads off data and not a name list.
 *
 * ⚠ AND ONE PRE-EXISTING HOLE CLOSED IN PASSING: Frostbind was tagged `crafted`
 * and had no recipe — the only runecaster in that state. A weapon that advertises
 * a crafting path it does not have is a dead end at the bench.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  runecasterPassiveStat,
  runecasterPassiveSlots,
  runecasterPassiveShape,
  runecasterRole,
} from '../app/engine/runecasterPassives';

type W = { name: string; weaponKind?: string; damageType?: string; rarity?: string; tags?: string[]; damageDice?: string };
const read = (p: string) => JSON.parse(readFileSync(join(__dirname, '..', p), 'utf8')) as unknown;
const asRows = (j: unknown) => (Array.isArray(j) ? j : Object.values(j as Record<string, unknown>)[0]) as W[];
const weapons = asRows(read('app/data/items/weapons.json'));
const casters = weapons.filter((w) => w.weaponKind === 'runecaster');
const byName = (n: string): W => {
  const w = casters.find((x) => x.name === n);
  if (!w) throw new Error(`no runecaster named ${n}`);
  return w;
};
const statOf = (n: string) => runecasterPassiveStat(byName(n));

describe("OTA-1560 — the owner's own example, which set the rule", () => {
  it('⚠⚠⚠ SLICK MUD and DUST CLOUD reward a STEALTH build — not a strength one', () => {
    // Both are bludgeoning. A damage-type-first mapping put them on STRENGTH,
    // which is exactly backwards: they are the terrain and the cover a quiet
    // character plays around. This single case is why ROLE comes first.
    expect(statOf('Slick Mud Wand')).toBe('stealth');
    expect(statOf('Dust Cloud Wand')).toBe('stealth');
    expect(byName('Slick Mud Wand').damageType).toBe('bludgeoning');
    expect(byName('Dust Cloud Wand').damageType).toBe('bludgeoning');
  });

  it('⚠⚠⚠ ROLE BEATS DAMAGE TYPE wherever the role is a playstyle', () => {
    expect(statOf('Mud Shell Wand')).toBe('strength');           // ward, bludgeoning
    expect(statOf('Aetheric Ward Rod')).toBe('strength');       // ward, aetheric — same job, same stat
    expect(statOf('Aetheric Shackle Stave')).toBe('dexterity');   // restrain, aetheric
    expect(statOf('Mud Golem Creation Stave')).toBe('charisma');  // summon, bludgeoning
    expect(statOf('Aetheric Touch Wand')).toBe('wisdom');        // healing
    expect(statOf('Ember Storm Stave')).toBe('intelligence');     // aoe, burn
  });

  it('⚠⚠ A PLAIN STRIKE has no playstyle, so its ELEMENT decides', () => {
    expect(statOf('Stone Fist')).toBe('strength');      // bludgeoning
    expect(statOf('Sparkstrike Wand')).toBe('dexterity');    // electrical
    expect(statOf('Pyric Wand')).toBe('charisma');      // burn
    expect(statOf('Mire Stave')).toBe('stealth');       // poison
    expect(statOf('Frostbind Rod')).toBe('wisdom');         // cold
    expect(statOf('Aetheric Spark Wand')).toBe('intelligence');
  });

  it('⚠⚠⚠ SCHOOL CHANGES NOTHING — two spells doing the same job give the same result', () => {
    // The owner agreed to this explicitly. A hidden school multiplier would mean
    // a player cannot look at a caster and predict what it gives; and the schools
    // are already separated somewhere better — mud has no healing, aether has no
    // summons. The difference lives in what EXISTS.
    const wards = casters.filter((w) => (w.tags ?? []).includes('ward'));
    expect(wards.length).toBeGreaterThan(3);
    for (const w of wards) expect(runecasterPassiveStat(w)).toBe('strength');
    // …across BOTH schools, which is the point.
    expect(wards.some((w) => (w.tags ?? []).includes('mud_dwellers'))).toBe(true);
    expect(wards.some((w) => (w.tags ?? []).includes('aetheric'))).toBe(true);
  });

  it('⚠ a non-runecaster gets NULL — the caller refuses rather than inventing', () => {
    expect(runecasterPassiveStat({ weaponKind: 'melee', damageType: 'slashing' })).toBeNull();
    expect(runecasterPassiveStat({ weaponKind: 'ranged', damageType: 'piercing' })).toBeNull();
    expect(runecasterPassiveStat({})).toBeNull();
  });
});

describe('OTA-1560 — the INT/WIS split he asked for by name', () => {
  it('⚠⚠⚠ the UNMAKING spells reward WISDOM; the ones that push things stay INT', () => {
    // Not a quota — it is what the spells are. Disrupt severs a thread, Displace
    // moves a thing out of true, the Void trio takes something away.
    for (const n of ['Aetheric Disrupt Rod', 'Displace Aether Scepter', 'Void Pulse Rod', 'Shadow Caller Stave', 'Void Edge']) {
      expect(statOf(n)).toBe('wisdom');
      expect(byName(n).tags).toContain('unmaking');
    }
    for (const n of ['Aetheric Spark Wand', 'Aetheric Push Rod', 'Aetheric Pillar Stave', 'Shatter Aether Scepter', 'Force Wave Wand', 'Gale Binder Wand']) {
      expect(statOf(n)).toBe('intelligence');
      expect(byName(n).tags ?? []).not.toContain('unmaking');
    }
  });

  it('⚠⚠ `unmaking` only ever moves an AETHER STRIKE — it cannot override a role', () => {
    // A ward is a ward whatever it is made of. If the tag ever landed on a
    // role-bearing caster it must not quietly steal it from that role's stat.
    expect(runecasterPassiveStat({
      weaponKind: 'runecaster', damageType: 'aetheric', tags: ['ward', 'unmaking'],
    })).toBe('strength');
  });

  it('⚠⚠⚠ INT NO LONGER SWAMPS THE ROSTER, and WIS has something to want', () => {
    // Before: INT 18 of 55 (33%), WIS 5 (9%) — the stat that already reads an
    // enemy's weaknesses had almost no caster to reward it.
    const count = (s: string) => casters.filter((w) => runecasterPassiveStat(w) === s).length;
    expect(count('wisdom')).toBeGreaterThanOrEqual(14);
    expect(count('intelligence')).toBeLessThanOrEqual(16);
    // …and every stat still has a real home. Nothing was starved to feed WIS.
    for (const s of ['strength', 'dexterity', 'intelligence', 'wisdom', 'charisma', 'stealth']) {
      expect(count(s)).toBeGreaterThanOrEqual(5);
    }
  });
});

describe('OTA-1560 — the frost and radiation he asked for', () => {
  const of = (t: string) => casters.filter((w) => w.damageType === t);

  it('⚠⚠⚠ cold and radiation are FAMILIES now, not one caster each', () => {
    expect(of('cold').length).toBeGreaterThanOrEqual(5);
    expect(of('radiation').length).toBeGreaterThanOrEqual(5);
  });

  it('⚠⚠ each new family spans rarities — a ladder, the same shape the aether strikes have', () => {
    for (const t of ['cold', 'radiation']) {
      const rarities = new Set(of(t).map((w) => w.rarity));
      expect(rarities.size).toBeGreaterThanOrEqual(3);
      expect(rarities.has('Legendary')).toBe(true);
    }
  });

  it('⚠⚠ they are not all strikes — a family of one shape is a family of one idea', () => {
    for (const t of ['cold', 'radiation']) {
      const roles = new Set(of(t).map((w) => runecasterRole(w.tags)));
      expect(roles.size).toBeGreaterThanOrEqual(2);
    }
  });

  it('⚠⚠ every new caster is CRAFTABLE — and Frostbind finally is too', () => {
    // Frostbind was tagged `crafted` with no recipe: the only runecaster in that
    // state, and a dead end at the bench for anyone who read the tag.
    const recipes = asRows(read('app/data/items/recipes.json')) as unknown as Array<{ result: string; ingredients: Array<{ name: string; quantity: number }> }>;
    const made = new Set(recipes.map((r) => r.result));
    for (const n of ['Frostbind Rod', 'Rime Spike', 'Hoarfrost Ward Stave', 'Killing Frost Stave',
      "Winter's Verdict Scepter", 'Glowrot Rod', 'Sickening Light Stave', 'Fallout Bloom Stave', 'Half-Life Pulse Scepter']) {
      expect(made.has(n)).toBe(true);
    }
    // …and every ingredient they ask for actually exists.
    const mats = new Set(asRows(read('app/data/items/materials.json')).map((m) => m.name));
    for (const r of recipes.filter((x) => casters.some((c) => c.name === x.result))) {
      for (const i of r.ingredients) {
        expect(mats.has(i.name) || weapons.some((w) => w.name === i.name)).toBe(true);
      }
    }
  });

  it('⚠ every runecaster in the catalogue resolves to a stat — none fall through', () => {
    for (const w of casters) {
      expect(runecasterPassiveStat(w)).not.toBeNull();
      expect(runecasterPassiveShape(w.tags).length).toBeGreaterThan(5);
    }
  });
});

describe('OTA-1560 — two passives, three at Legendary', () => {
  it('⚠⚠⚠ the cap is the owner\'s, verbatim: "up to 2 passives unless it\'s extremely rare then 3"', () => {
    expect(runecasterPassiveSlots({ rarity: 'Common' })).toBe(2);
    expect(runecasterPassiveSlots({ rarity: 'Uncommon' })).toBe(2);
    expect(runecasterPassiveSlots({ rarity: 'Rare' })).toBe(2);
    expect(runecasterPassiveSlots({ rarity: 'Legendary' })).toBe(3);
  });

  it('⚠⚠ a Legendary is read from EITHER the rarity field or the tag', () => {
    // The catalog carries the claim in both places, and a row with only one of
    // them is still a Legendary — Crown of Verdict has the tag, Void Edge both.
    expect(runecasterPassiveSlots({ tags: ['legendary'] })).toBe(3);
    expect(runecasterPassiveSlots({ rarity: 'legendary' })).toBe(3);
    expect(runecasterPassiveSlots({ rarity: 'Rare', tags: ['legendary'] })).toBe(3);
  });

  it('⚠⚠ exactly the nine Legendaries get the third slot — no accidental generosity', () => {
    const three = casters.filter((w) => runecasterPassiveSlots(w) === 3);
    expect(three.length).toBe(casters.filter(
      (w) => w.rarity === 'Legendary' || (w.tags ?? []).includes('legendary'),
    ).length);
    for (const w of three) {
      expect(w.rarity === 'Legendary' || (w.tags ?? []).includes('legendary')).toBe(true);
    }
  });

  it('⚠ the shape of a passive comes from the ROLE — the stat only scales it', () => {
    expect(runecasterPassiveShape(['ward'])).toContain('barrier');
    expect(runecasterPassiveShape(['summon'])).toContain('raise');
    expect(runecasterPassiveShape(['cover'])).toContain('cover');
    expect(runecasterPassiveShape(['runecaster'])).toContain('strike');
  });
});
