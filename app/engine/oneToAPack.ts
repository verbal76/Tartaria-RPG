// ⚠⚠⚠ OTA-1673 — SOME TOOLS YOU ONLY EVER NEED ONE OF.
//
// Owner: *"the pulse mud and etheric scanners — once you build one and have one
// that's in the pouch, it should not be buildable again."*
//
// ⚠⚠ HE IS DESCRIBING A PROPERTY, NOT THREE ITEMS, so this reads the property
// rather than naming the three. A scanner is an OFF-HAND reader: `effect.kind
// === 'scanner'` in exploration.json, one slot, one bias. A second copy of the
// same scanner cannot be equipped, cannot be read from, and does nothing the
// first does not — it is inventory weight and a wasted Aether Crystal. A
// hardcoded ['Pulse Scanner', 'Aetheric Scanner', 'Mud Scanner'] would go stale
// the moment a fourth scanner is authored, and this project has been bitten by
// exactly that kind of list before (OTA-1603's dog-armour kind drift).
//
// ⚠ IT IS PER SCANNER, NOT PER CATEGORY. The three read different bands —
// pulse for Sentinel tech, aetheric for pre-flood phenomena, mud for what the
// flood buried — so carrying all three is the intended endgame. Owning the Mud
// Scanner must not block building the Aetheric one.
//
// ⚠⚠ AND IT REFUSES, IT DOES NOT HIDE. The recipe stays in the book with its
// reason showing, because a blueprint that silently vanishes from the list reads
// as a bug (and as data loss) rather than as a rule. B15: the refusal speaks.

import type { InventoryItem } from './types';

/** True when this catalog name is a one-per-pack tool. Reads the catalog, so a
 *  scanner authored tomorrow is covered without touching this file. */
export function isOneToAPackTool(name: string): boolean {
  if (!name) return false;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const C = require('./crafting') as typeof import('./crafting');
    const row = C.findExplorationItemByName(name) as { effect?: { kind?: string } } | null | undefined;
    return row?.effect?.kind === 'scanner';
  } catch {
    // ⚠ A catalog lookup that throws must never make a craft impossible. The
    // OTA-1663 shape: a courtesy predicate that fails should fail OPEN, letting
    // the craft proceed, rather than refusing work the player can legitimately do.
    return false;
  }
}

/** Does the pack already hold one? Counts every stack, and only real units —
 *  a quantity-0 husk left by a consume is not a scanner you own. */
export function packAlreadyHolds(name: string, inventory: readonly InventoryItem[] | undefined): boolean {
  if (!name || !Array.isArray(inventory)) return false;
  const want = name.toLowerCase();
  return inventory.some((i) => (i?.quantity ?? 0) > 0 && String(i?.name ?? '').toLowerCase() === want);
}

/** The refusal, in the Arbiter's voice, or null when the craft may proceed.
 *  Pure and total: never throws, so a craft can never be lost to this check. */
export function oneToAPackRefusal(
  resultName: string,
  inventory: readonly InventoryItem[] | undefined,
): string | null {
  if (!isOneToAPackTool(resultName)) return null;
  if (!packAlreadyHolds(resultName, inventory)) return null;
  return `The Arbiter pushes the schematic back. "You're carrying a ${resultName} already, and it reads the same band a second one would. `
    + `One is the whole answer — build a scanner for a band you can't read yet, or spend the parts on something that isn't a duplicate."`;
}
