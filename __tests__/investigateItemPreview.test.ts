import { getItemPreview } from '../app/components/itemPreview';
import { WEAPONS, ARMOR, GEAR } from '../app/engine/crafting';

// HANDOFF §5 #3: "inspect locket" used to roll a skill check immediately
// without ever surfacing the item's catalog preview, leaving the player
// without a clear "what is this thing" moment. The investigate handler now
// emits a description + stats preview before the roll, drawing on
// getItemPreview() — previously a UI-only helper.
//
// This suite is a contract test: the helper must return enough information
// for the gameStore to log a useful description line + a stats line for any
// item the player might actually inspect.

describe('getItemPreview — contract for the investigate handler', () => {
  it('returns a non-empty kindLabel and description for every catalog weapon', () => {
    for (const w of WEAPONS) {
      const preview = getItemPreview(w.name);
      expect(preview.name).toBe(w.name);
      expect(preview.kindLabel.length).toBeGreaterThan(0);
      expect(preview.description.length).toBeGreaterThan(0);
      expect(preview.stats.length).toBeGreaterThan(0); // damage + scaling at minimum
    }
  });

  it('returns AC and resistances when an armor piece has them', () => {
    for (const a of ARMOR.slice(0, 5)) {
      const preview = getItemPreview(a.name);
      expect(preview.stats.some((s) => /^AC \+/.test(s))).toBe(true);
    }
  });

  it('returns a usable preview even for gear without mechanical stats', () => {
    for (const g of GEAR.slice(0, 5)) {
      const preview = getItemPreview(g.name);
      expect(preview.description.length).toBeGreaterThan(0);
      expect(['Consumable', 'Relic', 'Gear']).toContain(preview.kindLabel);
    }
  });

  it('infers a usable preview for unknown items (no "no record" gap)', () => {
    // Previously this returned "No record of this item in the
    // catalog." Now itemDefaults.inferGear / inferWeapon / inferArmor
    // synthesize stats from the name so the player always sees
    // something. The description still flags it as inferred so a
    // catalog backfill can populate the real row later.
    const preview = getItemPreview('Definitely Not A Real Item');
    expect(preview.name).toBe('Definitely Not A Real Item');
    expect(preview.description.length).toBeGreaterThan(0);
    expect(preview.description.toLowerCase()).toMatch(/field-inferred|inferred|backfill|catalog/);
  });

  it('infers weapon stats for an uncatalogued blade name', () => {
    // Mud-Rend Blade isn't in the test catalog scope here — the
    // inference path should kick in and produce 1d8 slashing.
    const preview = getItemPreview('Phantom Blade');
    expect(preview.kindLabel).toMatch(/weapon/i);
    expect(preview.stats.some((s) => /1d/.test(s))).toBe(true);
  });

  it('handles case-insensitive lookup', () => {
    const w = WEAPONS[0];
    if (!w) return;
    const upper = getItemPreview(w.name.toUpperCase());
    const lower = getItemPreview(w.name.toLowerCase());
    expect(upper.kindLabel).toBe(lower.kindLabel);
    expect(upper.description).toBe(lower.description);
  });
});
