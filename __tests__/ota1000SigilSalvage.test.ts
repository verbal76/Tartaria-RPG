// OTA-1000 — a pried sigil IS a sigil. Owner report: "pry out the scout sigil"
// paid Worn Tartarian Coins. Root cause: rollSalvagePool is the single choke
// point for every salvage yield and had no sigil awareness. Now any
// sigil/crest noun yields a real faction sigil item — faction read from the
// noun's words where they name one, rolled otherwise.
import { rollSalvagePool } from '../app/engine/salvagePools';
import { FACTION_SIGIL_NAME } from '../app/engine/sigils';

const SIGILS = new Set(Object.values(FACTION_SIGIL_NAME));

describe('OTA-1000 — sigil salvage yields the mark, not coins', () => {
  it('a generic sigil noun yields one of the nine faction sigils', () => {
    const out = rollSalvagePool('scout sigil', () => 0.5);
    expect(out).not.toBeNull();
    expect(SIGILS.has(out!.itemName ?? '')).toBe(true);
    expect(out!.quantity).toBe(1);
  });

  it('a faction-worded noun yields THAT faction\'s sigil', () => {
    expect(rollSalvagePool('architect sigil', () => 0.5)!.itemName).toBe('Architect Sigil');
    expect(rollSalvagePool('mud monarch crest', () => 0.5)!.itemName).toBe('Mud Monarch Sigil');
    expect(rollSalvagePool('reclaimer sigil', () => 0.5)!.itemName).toBe('Reclaimer Sigil');
  });

  it('non-sigil salvage is untouched', () => {
    const out = rollSalvagePool('crate', () => 0.9);
    if (out) expect(SIGILS.has(out.itemName ?? '')).toBe(false);
  });
});
