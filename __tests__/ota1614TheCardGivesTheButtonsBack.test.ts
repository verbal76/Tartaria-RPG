// ⚠⚠⚠ OTA-1614 / OTA-1616 — A MODAL THAT CANNOT BE ANSWERED, AND THE WALL THAT
// PROVED IT.
//
// Owner, with a screenshot of the coating picker: "what's all the gibberish
// above the red writing?" Above the weapons he had opened the card to choose
// from sat nine copies of one sentence — "<name> — a rune-caster shapes raw
// force, there is no edge or point for the coating to ride" — one per
// ineligible weapon in his pack, pushing the choices off the bottom of the
// screen.
//
// TWO DEFECTS, STACKED. The note was written at the wrong grain (1616): OTA-1407
// was right that an absence reads as a bug and the exclusions must be NAMED, but
// it printed the whole refusal per INSTANCE instead of once per RULE. And the
// card itself had no height cap and no scrolling (1614), so an over-long body
// did not merely look bad — it carried the card's own buttons off-screen, with
// a scrim underneath eating every tap meant for the game. That is a softlock
// wearing a dialog, and it was reachable by any caller with a long body, not
// just this one.

import { readFileSync } from 'fs';
import { join } from 'path';

const src = (...p: string[]) => readFileSync(join(__dirname, '..', ...p), 'utf8');
const MODAL = src('app', 'components', 'BrandedModal.tsx');
const INV = src('app', 'screens', 'InventoryScreen.tsx');

describe('OTA-1614 — the card gives its buttons back', () => {
  it('⚠⚠⚠ THE BUTTONS ARE PINNED OUTSIDE THE SCROLL — they cannot be pushed away', () => {
    // The three regions exist and are assembled in order: header, scrolling
    // middle, buttons. A body of any length now grows the MIDDLE.
    expect(MODAL).toContain('const cardHeader = (');
    expect(MODAL).toContain('const cardBody = (');
    expect(MODAL).toContain('const cardButtons = (');
    const composed = MODAL.slice(MODAL.indexOf('const cardChildren = ('));
    const headerAt = composed.indexOf('{cardHeader}');
    const scrollAt = composed.indexOf('<ScrollView');
    const bodyAt = composed.indexOf('{cardBody}');
    const closeAt = composed.indexOf('</ScrollView>');
    const buttonsAt = composed.indexOf('{cardButtons}');
    expect(headerAt).toBeGreaterThan(-1);
    expect(headerAt).toBeLessThan(scrollAt);
    // The body is INSIDE the scroll view; the buttons are AFTER it.
    expect(bodyAt).toBeGreaterThan(scrollAt);
    expect(bodyAt).toBeLessThan(closeAt);
    expect(buttonsAt).toBeGreaterThan(closeAt);
  });

  it('⚠⚠⚠ the card is capped below the screen, so the tap-outside escape survives', () => {
    // A card taller than the display leaves no scrim to tap and no way out on a
    // modal whose caller passes no dismiss button.
    expect(MODAL).toContain("maxHeight: '85%',");
  });

  it('⚠⚠ the scroll area shrinks rather than squeezing the pinned rows', () => {
    // Without flexShrink the buttons are what yields — the original bug, one
    // layout property further in.
    expect(MODAL).toContain('scrollArea: { flexShrink: 1, flexGrow: 0 },');
    expect(MODAL).toContain('style={styles.scrollArea}');
  });

  it('⚠ both presentation paths get the fix — the inline overlay is not a second card', () => {
    // arb73's inline path (iPad presents the native Modal invisibly) renders the
    // same children, so it cannot drift back to the unscrollable shape.
    const uses = MODAL.split('{cardChildren}').length - 1;
    expect(uses).toBe(2);
  });
});

describe('OTA-1616 — the not-on-the-list wall', () => {
  it('⚠⚠⚠ the refusals group BY REASON, so one rule reads as one line', () => {
    expect(INV).toContain('const byReason = new Map<string, string[]>();');
    // The old shape — a full sentence mapped over every ineligible instance —
    // is gone.
    expect(INV).not.toContain('.map((i: InventoryItem) => `• ${i.name}${wornIds.has(i.id) ? \' (equipped)\' : \'\'} — ${coatingRefusalFor(i)}`)');
  });

  it('⚠⚠ duplicates fold with ×N and a long list is capped', () => {
    // Two Cudgels are two weapons, not two paragraphs; and a pack full of one
    // kind must not rebuild the wall this OTA removed.
    expect(INV).toContain('q > 1 ? `${n} ×${q}` : n');
    expect(INV).toContain('listed.slice(0, 6)');
    expect(INV).toContain('and ${listed.length - 6} more');
  });

  it('⚠ nothing is hidden — the rule is still named, which is why 1407 added it', () => {
    // The promise OTA-1407 made (a weapon missing from the list says WHY) is
    // kept; only the grain changed.
    expect(INV).toContain('Not on the list:');
    expect(INV).toContain('coatingRefusalFor(i)');
  });
});

describe('OTA-1616 — the grouping arithmetic, run', () => {
  // The screen builds its note from these three moving parts; exercise them
  // directly so the shape is proven, not just pinned.
  const group = (rows: Array<{ name: string; why: string; worn?: boolean }>) => {
    const byReason = new Map<string, string[]>();
    for (const r of rows) {
      const label = `${r.name}${r.worn ? ' (equipped)' : ''}`;
      byReason.set(r.why, [...(byReason.get(r.why) ?? []), label]);
    }
    return [...byReason.entries()].map(([why, names]) => {
      const counts = new Map<string, number>();
      for (const n of names) counts.set(n, (counts.get(n) ?? 0) + 1);
      const listed = [...counts.entries()].map(([n, q]) => (q > 1 ? `${n} ×${q}` : n));
      const shown = listed.slice(0, 6).join(', ')
        + (listed.length > 6 ? `, and ${listed.length - 6} more` : '');
      return `• ${names.length > 1 ? `${names.length} weapons` : listed[0]} — ${why}`
        + (names.length > 1 ? `: ${shown}` : '');
    });
  };
  const RUNE = 'a rune-caster shapes raw force — there is no edge or point for the coating to ride';

  it('⚠⚠⚠ HIS NINE LINES BECOME ONE', () => {
    const out = group([
      { name: 'Flame of Aether Wand', why: RUNE }, { name: 'Mud Shell Wand', why: RUNE },
      { name: 'Minor Repair Wand', why: RUNE }, { name: 'Vine Grasp Wand', why: RUNE },
      { name: 'Mud Spear (Runecaster)', why: RUNE }, { name: 'Minor Repair Wand', why: RUNE },
      { name: 'Aetheric Spark Wand', why: RUNE }, { name: 'Aetheric Spark Wand', why: RUNE },
      { name: 'Sparkstrike Wand', why: RUNE },
    ]);
    expect(out.length).toBe(1);
    expect(out[0]).toContain('9 weapons');
    expect(out[0]).toContain(RUNE);
    // Duplicates folded, and the tail capped rather than spilling.
    expect(out[0]).toContain('Minor Repair Wand ×2');
    expect(out[0]).toContain('Aetheric Spark Wand ×2');
    expect(out[0]).toContain('and 1 more');
    // The whole thing is one line — the wall is gone.
    expect(String(out[0]).split('\n').length).toBe(1);
  });

  it('⚠⚠ a lone weapon still reads as a sentence about that weapon', () => {
    const out = group([{ name: 'Force Wave Wand', why: RUNE, worn: true }]);
    expect(out).toEqual([`• Force Wave Wand (equipped) — ${RUNE}`]);
  });

  it('⚠ different reasons stay different lines — the grouping is by rule, not a lump', () => {
    const BEAM = 'an energy weapon fires nothing solid to carry the coating';
    const out = group([
      { name: 'Flame of Aether Wand', why: RUNE },
      { name: 'Sparkstrike Wand', why: RUNE },
      { name: 'Lance', why: BEAM },
    ]);
    expect(out.length).toBe(2);
    expect(out[0]).toContain('2 weapons');
    expect(out[1]).toBe(`• Lance — ${BEAM}`);
  });
});
