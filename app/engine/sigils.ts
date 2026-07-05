// sigils.ts — OTA-691. Found faction SIGILS: a slain member's mark — a pendant or
// token hammered thin and etched with a faction's crest. Returning one to that
// faction's frontier stake HONORS their dead and earns a small standing bump.
// One-sided: you only ever GAIN standing, never lose it. The Contracts screen
// lists carried sigils with the turn-in destination as an auto-routable SET COURSE.

import type { InventoryItem } from './types';
import { FACTIONS } from './factions';
import { factionName } from './broker';
import { startingLocationForFaction } from './character';

/** Standing granted per sigil returned. Small on purpose (a quiet, self-directed
 *  trickle, not a rep faucet). */
export const SIGIL_STANDING_REWARD = 1;

/** A sigil is any item tagged `sigil`. */
export function isSigilItem(item: Pick<InventoryItem, 'tags'>): boolean {
  return (item.tags ?? []).some((t) => t.toLowerCase() === 'sigil');
}

/** The faction a sigil belongs to — resolved from the faction-id tag it carries
 *  (the same convention `faction_gear` uses). Null if it carries none. */
export function sigilFaction(item: Pick<InventoryItem, 'tags'>): { id: string; name: string } | null {
  const tags = (item.tags ?? []).map((t) => t.toLowerCase());
  const fac = FACTIONS.find((f) => tags.includes(f.id.toLowerCase()));
  if (!fac) return null;
  return { id: fac.id, name: fac.name ?? factionName(fac.id) };
}

export interface CarriedSigil {
  item: InventoryItem;
  factionId: string;
  factionName: string;
  /** The faction's frontier stake — where you return the sigil. */
  tileId: string;
}

/** Every sigil in the pack, resolved to its faction + turn-in tile. Skips sigils
 *  with no readable faction tag. Each inventory instance is listed once (a stack
 *  of N carries its own quantity on `item.quantity`). */
export function carriedSigils(inventory: readonly InventoryItem[]): CarriedSigil[] {
  const out: CarriedSigil[] = [];
  for (const item of inventory) {
    if (item.quantity <= 0) continue;
    if (!isSigilItem(item)) continue;
    const fac = sigilFaction(item);
    if (!fac) continue;
    out.push({ item, factionId: fac.id, factionName: fac.name, tileId: startingLocationForFaction(fac.id) });
  }
  return out;
}
