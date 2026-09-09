/**
 * OTA-1789 — ONE WEAPON-FAMILY RESOLVER.
 *
 * The reference pack: *"Create one governed weapon-family -> glyph resolver at
 * the smallest appropriate shared point. Do not scatter item-name conditionals
 * across transcript JSX. Unknown/missing family must fail safely to a neutral
 * existing fallback, not crash and not show a misleading specific weapon."*
 *
 * ⚠⚠⚠ THE AUTHORITY LANDS BEFORE ITS CONSUMER, DELIBERATELY, AND THAT IS STATED
 * RATHER THAN HIDDEN. Nothing renders these glyphs yet — the transcript rewrite
 * adopts them next. The rollout has shipped this shape all the way through (a
 * primitive proven on its own, then adopted), and the alternative here was one
 * enormous OTA carrying a new asset family, a new resolver AND a rewritten
 * combat log. What makes it honest is that the resolver is proved over the
 * ENTIRE shipped catalog below, not over a handful of fixtures.
 *
 * ⚠⚠ THE TAXONOMY WAS ALREADY IN THE GAME. The pack forbids inventing one:
 * *"Map the supplied glyphs to the ACTUAL shipped weapon categories. Do not
 * invent a parallel weapon taxonomy just to match this pack."* A census of all
 * 301 catalog weapons found the family words already in use — `blade`,
 * `runecaster`, `firearm`, `shield`, `spear`, `knife`, `thrown`, `hammer`,
 * `axe`, `bow`, `crossbow`, `barehanded` and friends. Every key the resolver
 * reads is a word the catalog already says about itself.
 *
 * THREE OWNER RULINGS ARE UNDER TEST HERE:
 *   1. firearm SHARES the runecaster/energy-sidearm mark (29 weapons).
 *   2. shield is a melee family in its own right (28 weapons) — the family
 *      resolves, the ARTWORK is still owed, and it must render nothing rather
 *      than something wrong in the meantime.
 *   3. the wand/staff picture is the ENERGY WEAPON, a category derived from
 *      shipped fields rather than retagged into the catalog.
 */
import fs from 'node:fs';
import path from 'node:path';

import {
  weaponFamilyOf,
  weaponFamilyArt,
  weaponGlyphFor,
  type WeaponFamily,
} from '../app/engine/weaponFamilyArt';

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const bin = (...p: string[]) => fs.readFileSync(path.join(ROOT, ...p));

const TABLE = 'app/engine/weaponFamilyArt.ts';

interface CatalogRow {
  name: string;
  tags?: string[];
  weaponKind?: string;
  damageType?: string;
}
const CATALOG: CatalogRow[] = (
  JSON.parse(read('app/data/items/weapons.json')) as { weapons: CatalogRow[] }
).weapons;

const asInput = (x: CatalogRow, thrown = false) => ({
  tags: x.tags, weaponKind: x.weaponKind, damageType: x.damageType, thrown,
});


/* Comment-stripper — see the name-matching test for why this file needs one. */
function codeOf(src: string): string {
  let out = '';
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    const d = src[i + 1];
    if (c === '/' && d === '/') { while (i < n && src[i] !== '\n') i += 1; continue; }
    if (c === '/' && d === '*') {
      i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i += 1;
      i += 2;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      const q = c;
      out += c; i += 1;
      while (i < n && src[i] !== q) {
        if (src[i] === '\\') { out += src[i]; i += 1; if (i < n) { out += src[i]; i += 1; } continue; }
        out += src[i]; i += 1;
      }
      if (i < n) { out += src[i]; i += 1; }
      continue;
    }
    out += c; i += 1;
  }
  return out;
}

function png(buf: Buffer): { w: number; h: number } {
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

describe('OTA-1789 — the assets', () => {
  it('eleven files, at the 128px standard the other two families use', () => {
    const files = fs.readdirSync(path.join(ROOT, 'assets', 'weapon-glyphs')).filter((f) => f.endsWith('.png')).sort();
    expect(files).toHaveLength(11);
    for (const f of files) {
      const p = png(bin('assets', 'weapon-glyphs', f));
      expect([f, p.w, p.h]).toEqual([f, 128, 128]);
    }
  });

  /* ⚠⚠⚠ THREE FAMILIES, THREE TABLES, AND NONE MAY REACH INTO ANOTHER. The pack:
   * *"Weapon glyph = what delivered the attack. Damage/coating glyph = what kind
   * of damage/effect occurred. Do not collapse those concepts into one icon."*
   * `utilityGlyphArt` is the third — what a control does. */
  it('the three glyph tables stay out of each other s directories', () => {
    const dirs = ['assets/weapon-glyphs', 'assets/combat-glyphs', 'assets/ui-glyphs'];
    const tables = [TABLE, 'app/engine/combatGlyphArt.ts', 'app/engine/utilityGlyphArt.ts'];
    tables.forEach((t, i) => {
      dirs.forEach((d, j) => {
        expect({ t, d, uses: read(t).includes(d) }).toEqual({ t, d, uses: i === j });
      });
    });
  });

  it('nothing outside the table requires a weapon glyph directly', () => {
    const walk = (dir: string, out: string[] = []): string[] => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p, out);
        else if (/\.tsx?$/.test(e.name)) out.push(p);
      }
      return out;
    };
    const offenders = walk(path.join(ROOT, 'app'))
      .filter((f) => fs.readFileSync(f, 'utf8').includes('assets/weapon-glyphs'))
      .map((f) => path.relative(ROOT, f));
    expect(offenders).toEqual([TABLE]);
  });
});

describe('OTA-1789 — the whole shipped catalog resolves', () => {
  /* ⚠⚠⚠ THE MEASUREMENT THAT MAKES THIS SHIPPABLE WITHOUT A CONSUMER. Every one
   * of the 301 catalog weapons is put through the resolver. If a later data
   * change introduces a weapon the rule cannot place, this names it. */
  it('every catalog weapon resolves to a family — none falls through', () => {
    const unresolved = CATALOG.filter((x) => weaponFamilyOf(asInput(x)) === null).map((x) => x.name);
    expect(unresolved).toEqual([]);
    expect(CATALOG.length).toBeGreaterThan(290);
  });

  /* The distribution, pinned loosely: exact counts would fail on any catalog
   * edit, but a family emptying out is a real regression. */
  it('every family the game ships is actually populated', () => {
    const seen = new Map<WeaponFamily, number>();
    for (const x of CATALOG) {
      const f = weaponFamilyOf(asInput(x));
      if (f) seen.set(f, (seen.get(f) ?? 0) + 1);
    }
    for (const f of ['sword', 'dagger', 'axe', 'spear', 'mace', 'bow', 'crossbow', 'runecaster', 'energy', 'shield', 'unarmed'] as WeaponFamily[]) {
      expect({ f, populated: (seen.get(f) ?? 0) > 0 }).toEqual({ f, populated: true });
    }
  });

  /* ⚠ NO NAME MATCHING ANYWHERE. The pack: *"Use the actual resolved
   * weapon/item family from combat state, not prose string matching."* The
   * resolver reads tags, weaponKind and damageType and nothing else — proved by
   * scanning its own source for the catalog's weapon names. */
  it('the resolver never looks at a weapon name', () => {
    /* ⚠⚠⚠ GRADE THE CODE, NOT THE PROSE — the twenty-seventh sighting, and this
     * time inside my own test on its first run. The resolver's header NAMES
     * "Rail Saber" and "Aetheric Rod" as worked examples of what its rules
     * catch, which is exactly the sort of sentence this file should contain and
     * exactly what a raw scan cannot tell apart from a name conditional. */
    const src = codeOf(read(TABLE));
    expect(src).not.toMatch(/\.name\b/);
    for (const n of ['Rail Saber', 'Bone Maul', 'Aetheric Rod', 'Beacon Rifle']) {
      expect(src).not.toContain(n);
    }
    // and the stripper is load-bearing here — the raw file DOES name them
    expect(read(TABLE)).toContain('Rail Saber');
  });
});

describe('OTA-1789 — the families the pack named', () => {
  const find = (name: string) => CATALOG.find((x) => x.name === name)!;

  it.each([
    ['Mud-fist Wraps', 'unarmed'],
    ['Pocket Knife', 'dagger'],
    ['Rusted Blade', 'sword'],
    ['Stone Spear', 'spear'],
  ])('%s resolves to %s', (name, family) => {
    expect(weaponFamilyOf(asInput(find(name)))).toBe(family);
  });

  /* ⚠⚠ THE NARROW WORD BEATS THE BROAD ONE. A throwing knife carries `knife`
   * AND is a bladed thing; tested before `blade`, it is a dagger. Order in the
   * table is load-bearing and this is what proves it. */
  it('a knife is a dagger, not a sword', () => {
    const k = find('Throwing Knife');
    expect(k.tags).toContain('knife');
    expect(weaponFamilyOf({ ...asInput(k), thrown: false })).toBe('dagger');
  });
});

describe('OTA-1789 — ruling 1: firearm shares the energy sidearm', () => {
  /* Owner: "1 share". 29 firearms and no separate picture in the pack; sharing
   * beats leaving the largest ranged family unmarked. */
  it('a firearm and a runecaster resolve to the same family and the same picture', () => {
    /* ⚠ A FIREARM THAT IS NOT ALSO A CROSSBOW. The first `firearm`-tagged row in
     * the catalog is the Bolt-Caster, which carries `bolt-caster` too — see the
     * precedence test below. Picking it here was my error, not the rule's. */
    const firearm = CATALOG.find((x) => (x.tags ?? []).includes('firearm')
      && !(x.tags ?? []).includes('bolt-caster') && !(x.tags ?? []).includes('crossbow'))!;
    const rune = CATALOG.find((x) => (x.tags ?? []).includes('runecaster'))!;
    expect(weaponFamilyOf(asInput(firearm))).toBe('runecaster');
    expect(weaponFamilyOf(asInput(rune))).toBe('runecaster');
    expect(weaponGlyphFor(asInput(firearm))).toBe(weaponGlyphFor(asInput(rune)));
  });

  /* ⚠⚠ AND THE NARROW WORD STILL WINS OVER `firearm`. The Bolt-Casters carry
   * BOTH `bolt-caster` and `firearm`: one says what SHAPE the thing is, the
   * other what class it belongs to. The shape is the more informative
   * silhouette, so a bolt-caster reads as a crossbow — the same precedence that
   * makes a throwing knife a dagger rather than a sword. Found by this suite
   * picking the Bolt-Caster as its "first firearm" and going red. */
  it('a bolt-caster is a crossbow, even though it is also tagged a firearm', () => {
    /* ⚠ THE ONE THAT IS BOTH. The first `bolt-caster` row is the Bone Crossbow,
     * which is tagged `crossbow` and NOT `firearm` — picking "the first match"
     * grabbed the wrong specimen twice in this suite, which is a lesson about
     * fixtures rather than about the rule. */
    const bc = CATALOG.find((x) => (x.tags ?? []).includes('bolt-caster')
      && (x.tags ?? []).includes('firearm'))!;
    expect(bc.tags).toContain('firearm');
    expect(weaponFamilyOf(asInput(bc))).toBe('crossbow');
  });

  it('an unlabelled ranged weapon lands there too, rather than nowhere', () => {
    expect(weaponFamilyOf({ tags: [], weaponKind: 'ranged', damageType: 'piercing' })).toBe('runecaster');
  });
});

describe('OTA-1789 — ruling 2: shield is a melee family, and its picture is owed', () => {
  /* Owner: "2 full shield icon melee family". The family is real — 28 weapons,
   * every one `weaponKind: melee` and tagged `shield` — so it resolves. */
  it('every shield resolves to the shield family', () => {
    const shields = CATALOG.filter((x) => (x.tags ?? []).includes('shield'));
    expect(shields.length).toBeGreaterThanOrEqual(20);
    for (const s of shields) {
      expect({ name: s.name, family: weaponFamilyOf(asInput(s)) }).toEqual({ name: s.name, family: 'shield' });
    }
  });

  /* ⚠⚠⚠ AND IT RENDERS NOTHING UNTIL THE PICTURE ARRIVES. The pack's fail-safe
   * rule is explicit — an unknown family must *"not show a misleading specific
   * weapon"*. Handing a shield the mace silhouette because a bash is blunt would
   * be exactly that. This test fails the day the asset lands, which is correct:
   * it is the reminder to wire it. */
  it('shield has no artwork yet, so it shows no mark rather than a wrong one', () => {
    expect(weaponFamilyArt('shield')).toBeUndefined();
    expect(fs.existsSync(path.join(ROOT, 'assets', 'weapon-glyphs', 'shield.png'))).toBe(false);
  });
});

describe('OTA-1789 — ruling 3: the wand/staff picture is the energy weapon', () => {
  /* Owner: "3. energy weapon". There is no `wand` or `staff` tag in the
   * catalog, so the supplied picture had no home; the owner named the category
   * and it turns out to be derivable from two fields the catalog already has. */
  it.each(['Aetheric Rod', 'Energy Baton', 'Aetheric Baton', 'Magnetized Rod'])('%s is an energy weapon', (name) => {
    const x = CATALOG.find((y) => y.name === name)!;
    expect(weaponFamilyOf(asInput(x))).toBe('energy');
  });

  it('it is DERIVED from melee + electrical/aetheric, not retagged into the data', () => {
    expect(weaponFamilyOf({ tags: [], weaponKind: 'melee', damageType: 'electrical' })).toBe('energy');
    expect(weaponFamilyOf({ tags: [], weaponKind: 'melee', damageType: 'aetheric' })).toBe('energy');
    // and the catalog was NOT edited to make it work
    const rod = CATALOG.find((x) => x.name === 'Aetheric Rod')!;
    expect(rod.tags).not.toContain('energy');
    expect(rod.tags).not.toContain('wand');
    expect(rod.tags).not.toContain('staff');
  });

  /* ⚠ A RANGED energy weapon is a sidearm, not a rod — ruling 1's territory. */
  it('ranged energy is the sidearm, not the rod', () => {
    expect(weaponFamilyOf({ tags: [], weaponKind: 'ranged', damageType: 'electrical' })).toBe('runecaster');
  });
});

describe('OTA-1789 — a throw is a throw, and it is the ACTION that says so', () => {
  /* The pack: *"Thrown attacks use the thrown mapping even if the thrown item
   * also has a damage family."* Sixteen catalog weapons are both — a Stone
   * Spear is a spear you can throw. Only the action knows which happened, so
   * `thrown` is an attack input and never an item property. */
  it('a throwable spear is a spear when stabbed and a thrown when thrown', () => {
    const spear = CATALOG.find((x) => x.name === 'Stone Spear')!;
    expect(spear.tags).toContain('spear');
    expect(spear.tags).toContain('thrown');
    expect(weaponFamilyOf(asInput(spear, false))).toBe('spear');
    expect(weaponFamilyOf(asInput(spear, true))).toBe('thrown');
  });

  it('throwing something that cannot be thrown does not fabricate a family', () => {
    const sword = CATALOG.find((x) => (x.tags ?? []).includes('blade') && !(x.tags ?? []).includes('thrown'))!;
    expect(weaponFamilyOf(asInput(sword, true))).toBe('sword');
  });
});

describe('OTA-1789 — it fails safe', () => {
  /* ⚠⚠ `null` IS A REAL ANSWER. Showing a sword for a weapon the catalog never
   * called a sword is worse than showing no mark: the transcript would be
   * asserting something the engine does not know. */
  it.each([
    ['null input', null],
    ['undefined input', undefined],
    ['an empty row', {}],
    ['a row with nothing the rule can read', { tags: [], weaponKind: 'contraption', damageType: 'confusion' }],
  ])('%s resolves to no family and no picture', (_name, input) => {
    expect(weaponFamilyOf(input as never)).toBeNull();
    expect(weaponGlyphFor(input as never)).toBeUndefined();
  });

  it('an unknown family name asks for no picture', () => {
    expect(weaponFamilyArt('trebuchet' as WeaponFamily)).toBeUndefined();
    expect(weaponFamilyArt(null)).toBeUndefined();
  });
});
