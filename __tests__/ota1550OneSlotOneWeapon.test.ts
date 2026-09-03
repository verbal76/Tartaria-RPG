/**
 * OTA-1550 — ONE SLOT, ONE WEAPON.
 *
 * Owner, on the APPLY ACID FLASK picker, with two rows both reading
 * EQUIPPED (MAIN HAND): *"why is cudgel listed twice if I can only hold one in
 * my hand at a time"*.
 *
 * ⚠⚠⚠ HE WAS HOLDING ONE OF THEM. He had a plain Cudgel and an Acid-Etched
 * Cudgel. A coating changes the DISPLAY name (coatedDisplayName) and NOT the
 * stored `item.name`, and `player.equipped.main` stores a NAME — so both
 * instances answer to "Cudgel".
 *
 * `equippedSlotLabelFor` resolves the held weapon EXACTLY, by `equipped.mainId`.
 * Then, for the other instance, the id lookup misses and it falls through to a
 * by-name map built from every slot — which still says main hand. One hand,
 * claimed by two weapons.
 *
 * ⚠⚠ THE FALLBACK IS NARROWED, NOT REMOVED. It exists for pre-id saves, where
 * the slots carry names and no ids at all, and those still have to resolve. So
 * the rule is: A SLOT WHOSE INSTANCE ID IS SET HAS ALREADY ANSWERED, and must
 * never be re-matched by name. That is the same discipline the EQUIPPED badge's
 * own `hasIdForThisName` guard two blocks up has always used — this reader was
 * simply the one that never got it.
 */
import { readFileSync } from 'fs';
import { RING_SLOTS } from '../app/engine/equipment';
import { join } from 'path';

const src = (...p: string[]): string => readFileSync(join(__dirname, '..', ...p), 'utf8');
const INV = src('app', 'screens', 'InventoryScreen.tsx');
const codeOnly = (s: string) =>
  s.split('\n').filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*')).join('\n');
const CODE = codeOnly(INV);

/** The shipped rule, mirrored so the ARITHMETIC is pinned and not just the
 *  source text. Kept in step with equippedSlotLabelFor's fallback. */
const legacyMapFrom = (
  slots: Array<{ slot: string; name?: string; id?: string }>,
): Map<string, string[]> => {
  const m = new Map<string, string[]>();
  for (const s of slots) {
    if (!s.name || s.id) continue; // an id-bearing slot is settled
    m.set(s.name, [...(m.get(s.name) ?? []), s.slot]);
  }
  return m;
};

describe('OTA-1550 — an id-bearing slot is never re-matched by name', () => {
  it('⚠⚠⚠ THE OWNER\'S CASE: two Cudgels, a mainId on one — only that one is equipped', () => {
    // equipped.main = 'Cudgel' (the stored name), mainId = the held instance.
    const legacy = legacyMapFrom([{ slot: 'main', name: 'Cudgel', id: 'inst_coated_1' }]);
    // The held instance resolves by ID (not modelled here — it never reaches
    // the fallback). The OTHER Cudgel reaches the fallback and must find
    // NOTHING, because the slot already named its occupant.
    expect(legacy.get('Cudgel')).toBeUndefined();
  });

  it('⚠⚠⚠ …and a PRE-ID save still resolves by name, which is why the fallback stays', () => {
    const legacy = legacyMapFrom([
      { slot: 'main', name: 'Cudgel' },        // no id — an old save
      { slot: 'off', name: 'Bone Knife' },
    ]);
    expect(legacy.get('Cudgel')).toEqual(['main']);
    expect(legacy.get('Bone Knife')).toEqual(['off']);
  });

  it('⚠⚠ a mixed save resolves each slot by its own evidence', () => {
    const legacy = legacyMapFrom([
      { slot: 'main', name: 'Cudgel', id: 'inst_1' }, // settled by id
      { slot: 'off', name: 'Bone Knife' },            // legacy, by name
    ]);
    expect(legacy.get('Cudgel')).toBeUndefined();
    expect(legacy.get('Bone Knife')).toEqual(['off']);
  });

  it('⚠⚠ all three ring slots keep folding into one label, id-bearing or not', () => {
    const legacy = legacyMapFrom([
      { slot: 'ring', name: 'Iron Band' },
      { slot: 'ring', name: 'Iron Band' },
      { slot: 'ring', name: 'Glass Ring', id: 'inst_r3' },
    ]);
    expect(legacy.get('Iron Band')).toEqual(['ring', 'ring']);
    expect(legacy.get('Glass Ring')).toBeUndefined();
  });
});

describe('OTA-1550 — the wiring', () => {
  it('⚠⚠⚠ the fallback reads the LEGACY map, never the all-slots by-name map', () => {
    expect(CODE).toContain('if (!slots || slots.length === 0) slots = legacySlotsByName.get(item.name) ?? [];');
    expect(CODE).not.toContain('if (!slots || slots.length === 0) slots = slotsByEquippedName.get(item.name) ?? [];');
  });

  it('⚠⚠⚠ the legacy map SKIPS every slot that carries an instance id', () => {
    expect(CODE).toContain('if (!name || id) continue;');
  });

  it('⚠⚠ every slot is represented in the triples — a missed one silently loses its badge', () => {
    // Scoped to the triples block: the older all-slots by-name list carries its
    // own copy of every slot (including three rings), so an unscoped count
    // measures both lists and proves nothing about this one.
    const start = CODE.indexOf('const nameIdSlotTriples');
    const block = CODE.slice(start, CODE.indexOf('];', start));
    expect(start).toBeGreaterThan(-1);
    for (const slot of ['main', 'off', 'head', 'chest', 'hands', 'legs', 'feet', 'cloak', 'amulet']) {
      expect({ slot, present: block.includes(`['${slot}', player.equipped?.${slot},`) })
        .toEqual({ slot, present: true });
    }
    // ⚠ OTA-1648 — EVERY ring slot folds to the one 'ring' label, and the row is
    // now generated from RING_SLOTS rather than written out three times. Pinning
    // the generator (and that it walks the full list) is the assertion that
    // survives a fourth finger; counting literals only ever pinned the old three.
    expect(block).toContain('...RING_SLOTS.map(');
    expect(block).toContain("'ring', player.equipped?.[k]");
    expect(RING_SLOTS.length).toBeGreaterThanOrEqual(4);
  });

  it('⚠ it is built AFTER `eq`, or the render throws before the screen mounts', () => {
    // The first cut of this fix read `eq.mainId` above `const eq = …` and took
    // the whole inventory screen down with a TDZ ReferenceError.
    expect(CODE.indexOf('const eq = player.equipped ?? {};'))
      .toBeLessThan(CODE.indexOf('const legacySlotsByName = new Map'));
  });

  it('⚠ the old all-slots by-name map still exists for the Unequip offer it was built for', () => {
    expect(CODE).toContain('const slotsByEquippedName = new Map<string, EquipSlot[]>();');
  });
});
