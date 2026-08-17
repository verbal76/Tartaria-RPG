// ⚠ OTA-1345 — PUNCHLIST-BRAVO B5: THE SWEEP'S HOLD-BACKS ARE SAID OUT LOUD.
//
// OTA-1320 (golem numbering — bravo provenance) excludes a last gate-satisfier
// from SELL ALL COMMON GEAR: your only breathing mask does not ride out with the
// scrap. Correct — and silent, which is how a held-out mask reads as the button
// refusing to work. The confirm now appends one line naming what was held and
// why, in the shape the owner proposed ("1 piece held back — your only way to
// breathe toxic air.").
import { bulkSellHeldBackNote } from '../app/engine/bulkSell';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('OTA-1345 — the bulk-sell hold-back note', () => {
  it('⚠⚠ one held piece names itself and its reason', () => {
    const note = bulkSellHeldBackNote([{ name: 'Aether-Breath Mask', label: 'breathe in toxic zones' }]);
    expect(note).toBe('1 piece held back — the Aether-Breath Mask is your only way to breathe in toxic zones.');
  });

  it('⚠ several held pieces enumerate — nothing is summarised away', () => {
    const note = bulkSellHeldBackNote([
      { name: 'Aether-Breath Mask', label: 'breathe in toxic zones' },
      { name: 'Climbing Rope', label: 'climb steep terrain' },
    ]);
    expect(note).toContain('2 pieces held back');
    expect(note).toContain('Aether-Breath Mask');
    expect(note).toContain('Climbing Rope');
    expect(note).toContain('climb steep terrain');
  });

  it('nothing held, nothing said', () => {
    expect(bulkSellHeldBackNote([])).toBeNull();
  });

  it('⚠ the VendorScreen confirm actually appends it (source lock)', () => {
    const src = readFileSync(join(__dirname, '..', 'app', 'screens', 'VendorScreen.tsx'), 'utf8');
    expect(src).toContain('bulkSellHeldBackNote(bulkHeldBack)');
    // The held list is computed from the SAME gate filter that does the holding,
    // so the note and the behaviour cannot drift apart.
    expect(src).toContain('sellable.filter(({ item }) => !!gateLossFor(item.name))');
  });
});
