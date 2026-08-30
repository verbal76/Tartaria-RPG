/**
 * OTA-1556 — TWO CUDGELS ARE TWO OBJECTS, AND THE LIST HAS TO SAY SO.
 *
 * ⚠⚠⚠ THE OWNER SENT THREE COMPLAINTS IN ONE LINE AND ONLY ONE OF THEM WAS A
 * BUG: *"still have no glyphs, double weapons show for the same hand, and still
 * cannot apply a coating to earthshaker."* His own screenshots answer the other
 * two, and both answers are "working as designed" — which is worth pinning here
 * so nobody, me included, comes back and "fixes" them into something worse.
 *
 *   · NO GLYPHS — correct. His APPLY ACID FLASK picker shows `CUDGEL · EQUIPPED
 *     (MAIN HAND)` with no "replaces" note, i.e. the equipped Cudgel is BARE,
 *     while his `Acid-Etched Cudgel` and `Acid-Etched Bone Crossbow` both sit in
 *     the pack with no (equipped) tag. Nothing coated was in his hands, so
 *     OTA-1553 correctly drew nothing. (The same shot also PROVES 1553 landed:
 *     the off-hand button reads `EARTHSHAKER`, not `off: earthshaker`.)
 *
 *   · EARTHSHAKER — correct. It is authored `"weaponKind": "runecaster"` and
 *     describes itself as *"a flat slab-runecaster — sends a ground ripple at the
 *     feet of whatever you point it at."* A coating needs an edge, a point or a
 *     hammer-face; a shaped force ripple offers none. The refusal already says
 *     exactly that (OTA-1407). Making rune-casters coatable is a DESIGN change
 *     and the owner's call, not a defect to quietly patch.
 *
 * ⚠⚠⚠ THE ONE THAT IS REAL: `CUDGEL · EQUIPPED (MAIN HAND)` and `CUDGEL`, two
 * rows apart, in the same picker. They are two genuinely different Cudgels, and
 * listing INSTANCES is right — a coating lands on one specific weapon and this
 * picker is where you choose which. But the only thing separating those rows was
 * a tag on one of them, and for two rows where NEITHER is equipped there was
 * nothing at all. A list that cannot tell its own rows apart behaves like a
 * duplicate, so he reported it as one, and he was right to.
 *
 * ⚠⚠ AND THE SECOND FIX IS THE HOLE HIS SAVE COULD ACTUALLY FALL INTO. OTA-1553
 * resolves the equipped instance by `mainId` — but `equipped.main` stores a NAME
 * and `mainId` is the newer key older saves do not carry (OTA-1550 found this
 * from the other side). On such a save a coated weapon would show no glyphs at
 * all, which is indistinguishable, from the player's chair, from the feature
 * being broken.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const src = (p: string): string => readFileSync(join(__dirname, '..', p), 'utf8');
const INV = src('app/screens/InventoryScreen.tsx');
const EXPLORE = src('app/screens/ExplorationScreen.tsx');

type Row = { name: string; durability?: { current: number; max: number } };

/** The shipped rule, mirrored so the BEHAVIOUR is pinned and not just the source
 *  text. Kept in step with disambiguateCoatRow in the picker. */
const label = (rows: Row[]): string[] => {
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.name, (counts.get(r.name) ?? 0) + 1);
  const seenBy = new Map<string, number>();
  return rows.map((r) => {
    if ((counts.get(r.name) ?? 0) < 2) return r.name;
    const seen = (seenBy.get(r.name) ?? 0) + 1;
    seenBy.set(r.name, seen);
    if (r.durability && r.durability.max > 0) return `${r.name} · ${r.durability.current}/${r.durability.max}`;
    return `${r.name} · #${seen}`;
  });
};

describe("OTA-1556 — the owner's two Cudgels", () => {
  it('⚠⚠⚠ THE BUG: two rows with one word between them now carry their condition', () => {
    const out = label([
      { name: 'Cudgel', durability: { current: 4, max: 12 } },
      { name: 'Cudgel', durability: { current: 12, max: 12 } },
    ]);
    expect(out).toEqual(['Cudgel · 4/12', 'Cudgel · 12/12']);
    expect(new Set(out).size).toBe(2); // …and they are distinguishable, which is the point
  });

  it('⚠⚠⚠ WEAR IS THE RIGHT DISCRIMINATOR — you paint the good one', () => {
    // A coating is finite. Condition is exactly what a player wants to know
    // before spending one, so the suffix is information rather than a serial
    // number he has to decode.
    const out = label([
      { name: 'Bone Knife', durability: { current: 1, max: 8 } },
      { name: 'Bone Knife', durability: { current: 8, max: 8 } },
    ]);
    expect(out[0]).toContain('1/8');
    expect(out[1]).toContain('8/8');
  });

  it('⚠⚠ A LONE WEAPON IS UNTOUCHED — the pack looks exactly as it did', () => {
    // Suffixing every row would be a change to every player's screen in service
    // of a case most packs never hit.
    expect(label([{ name: 'Cudgel', durability: { current: 4, max: 12 } }])).toEqual(['Cudgel']);
    expect(label([
      { name: 'Cudgel', durability: { current: 4, max: 12 } },
      { name: 'Mud Knife', durability: { current: 3, max: 6 } },
    ])).toEqual(['Cudgel', 'Mud Knife']);
  });

  it('⚠⚠ an ORDINAL covers what wear cannot separate', () => {
    // Two pristine copies, or a weapon with no durability at all. It claims
    // nothing beyond "these are different objects", which is the one thing the
    // player must not be left guessing about.
    expect(label([{ name: 'Cudgel' }, { name: 'Cudgel' }])).toEqual(['Cudgel · #1', 'Cudgel · #2']);
    const same = label([
      { name: 'Cudgel', durability: { current: 12, max: 12 } },
      { name: 'Cudgel', durability: { current: 12, max: 12 } },
    ]);
    // Equal wear is legal and still readable — the rows agree, but the tag on
    // the equipped one (added downstream by withEquippedTag) still separates
    // them, and neither row lies about its condition.
    expect(same).toEqual(['Cudgel · 12/12', 'Cudgel · 12/12']);
  });

  it('⚠⚠ three of a kind all get suffixes, not just the ones after the first', () => {
    const out = label([
      { name: 'Cudgel', durability: { current: 2, max: 12 } },
      { name: 'Cudgel', durability: { current: 7, max: 12 } },
      { name: 'Cudgel', durability: { current: 12, max: 12 } },
    ]);
    for (const l of out) expect(l).toMatch(/\d+\/12$/);
  });
});

describe('OTA-1556 — the wiring', () => {
  it('⚠⚠⚠ the picker labels through the disambiguator, and the equipped tag survives it', () => {
    // OTA-1094's "which one am I holding" tag is the other half of telling these
    // rows apart; the suffix goes INSIDE it so the row reads
    // "Cudgel · 4/12 · EQUIPPED (MAIN HAND)" rather than losing either fact.
    expect(INV).toContain('label: withEquippedTag(disambiguateCoatRow(label, w), w),');
    expect(INV).toContain('const disambiguateCoatRow = (label: string, w: InventoryItem): string => {');
    expect(INV).toContain("if ((coatLabelCounts.get(base) ?? 0) < 2) return label;");
  });

  it('⚠⚠⚠ collisions are counted on the COATED display name, not the bare one', () => {
    // A bare Cudgel and an Acid-Etched Cudgel already read differently, so they
    // are not a collision and must not be suffixed as though they were.
    expect(INV).toContain('const base = coatedDisplayName(w) as string;');
    expect(INV).toContain('coatLabelCounts.set(base, (coatLabelCounts.get(base) ?? 0) + 1);');
  });

  it('⚠⚠⚠ the equipped instance falls back to the NAME when the slot carries no id', () => {
    // The legacy-save hole. Without this a coated weapon shows no glyphs on an
    // older save and the player reads the whole feature as broken.
    expect(EXPLORE).toContain('const instanceForSlot = (id: string | null | undefined, name: string | null | undefined): InventoryItem | null => {');
    expect(EXPLORE).toContain('if (id) return player?.inventory?.find((i) => i.id === id) ?? null;');
    expect(EXPLORE).toContain("return player?.inventory?.find((i) => i.kind === 'weapon' && i.name.toLowerCase() === lower) ?? null;");
    expect(EXPLORE).toContain('const equippedMainItem = instanceForSlot(player?.equipped?.mainId, player?.equipped?.main);');
    expect(EXPLORE).toContain('const equippedOffItem = instanceForSlot(player?.equipped?.offId, player?.equipped?.off);');
  });

  it('⚠⚠ the ID still wins wherever it exists — OTA-1550\'s rule is not weakened', () => {
    // "An id-bearing slot is settled and never re-resolved by name." The name
    // branch is reachable only after the id branch has returned.
    const fn = EXPLORE.slice(
      EXPLORE.indexOf('const instanceForSlot = (id: string | null | undefined'),
      EXPLORE.indexOf('const equippedMainItem = instanceForSlot('),
    );
    expect(fn.indexOf('if (id) return')).toBeLessThan(fn.indexOf('i.name.toLowerCase() === lower'));
    // …and the fallback only ever takes a WEAPON, so a same-named material in
    // the pack can never stand in for the thing in your hand.
    expect(fn).toContain("i.kind === 'weapon'");
  });
});

describe('OTA-1556 — the two things that were NOT bugs stay as they are', () => {
  it('⚠⚠⚠ Earthshaker is a RUNE-CASTER in the catalog — the refusal is the rule, not a defect', () => {
    const weapons = JSON.parse(src('app/data/items/weapons.json')) as unknown;
    const rows = (Array.isArray(weapons) ? weapons : (weapons as { weapons?: unknown[] }).weapons ?? []) as Array<Record<string, unknown>>;
    const earth = rows.find((w) => String(w.name) === 'Earthshaker');
    expect(earth).toBeDefined();
    expect(earth!.weaponKind).toBe('runecaster');
    // Its own description says so, which is why this is content and not an
    // accident: "a flat slab-runecaster — sends a ground ripple at the feet".
    expect(String(earth!.description).toLowerCase()).toContain('runecaster');
  });

  it('⚠⚠ …and the picker still NAMES the exclusion with its reason, rather than hiding it', () => {
    // OTA-1407: a rule read as an absence is what made the owner think his OFF
    // HAND was the problem. Whatever is left out has to say why it was left out.
    expect(INV).toContain('Not on the list:');
    expect(INV).toContain('coatingRefusalFor(i)');
  });

  it('⚠ OTA-1553 is untouched — the glyphs and the star still come from one function', () => {
    expect(EXPLORE).toContain('activeEnemyKnownWeak={activeEnemyKnownWeak}');
    expect(src('app/components/InputBox.tsx')).toContain('combatWeaponLabel(equippedMain, equippedMainItem, raw, activeEnemyKnownWeak ?? [])');
  });
});
