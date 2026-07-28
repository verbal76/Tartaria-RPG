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

/** factionId → the sigil item name (authored in gear.json). */
export const FACTION_SIGIL_NAME: Record<string, string> = {
  forgotten_order: 'Forgotten Order Sigil',
  mud_monarchs: 'Mud Monarch Sigil',
  reclaimers_guild: 'Reclaimer Sigil',
  true_tartarians: 'True Tartarian Sigil',
  eternal_dynasty: 'Eternal Dynasty Sigil',
  conspiracy_architects: 'Architect Sigil',
  servants_of_giants: "Giants' Servant Sigil",
  stone_builders: 'Stone Builder Sigil',
  tartarian_revivalists: 'Revivalist Sigil',
};

// Distinctive name keywords → faction, so a faction-named humanoid ("Mud Monarch
// Purifier", "Reclaimer Ambusher") drops ITS OWN crest. First match wins.
const FACTION_NAME_KEYWORDS: Array<[string, RegExp]> = [
  ['reclaimers_guild', /reclaimer/i],
  ['mud_monarchs', /mud monarch|\bmonarch/i],
  ['forgotten_order', /forgotten|\border\b/i],
  ['conspiracy_architects', /architect|black cloak|conspiracy/i],
  ['true_tartarians', /true tartarian|reaver|pilgrim/i],
  ['eternal_dynasty', /dynasty|eternal/i],
  ['servants_of_giants', /giant|servant/i],
  ['stone_builders', /stone builder|mason|\bbuilder/i],
  ['tartarian_revivalists', /revivalist|reviv/i],
];

/** Best-guess faction for an enemy from its NAME (a faction-affiliated humanoid).
 *  Null when the name reads unaffiliated (a plain thief / scavenger). */
export function inferEnemyFaction(name: string): string | null {
  for (const [fid, re] of FACTION_NAME_KEYWORDS) if (re.test(name)) return fid;
  return null;
}

/** Roll whether a defeated HUMANOID leaves a faction sigil (a slain member's
 *  crest). A faction-named humanoid drops its OWN faction's sigil at a higher
 *  rate; a plain humanoid (a thief who looted one) drops a random faction's at a
 *  lower rate. Returns the sigil item NAME or null. Non-humanoids never drop one.
 *  `rng` injectable for tests. */
export function rollSigilDrop(
  enemy: { type?: string; name?: string },
  opts?: { chance?: number; rng?: () => number },
): string | null {
  if ((enemy.type ?? '').toLowerCase() !== 'human') return null;
  const rng = opts?.rng ?? Math.random;
  const fid = inferEnemyFaction(enemy.name ?? '');
  const chance = opts?.chance ?? (fid ? 0.28 : 0.1);
  if (rng() >= chance) return null;
  const ids = Object.keys(FACTION_SIGIL_NAME);
  const id = fid ?? ids[Math.min(ids.length - 1, Math.floor(rng() * ids.length))]!;
  return FACTION_SIGIL_NAME[id] ?? null;
}

/** A sigil is any item tagged `sigil`. */
export function isSigilItem(item: Pick<InventoryItem, 'tags' | 'name'>): boolean {
  // OTA-1024 — canonical: a stale sigil was invisible to the Contracts screen and
  // its standing reward unearnable forever.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return (require('./crafting') as typeof import('./crafting')).canonicalItemTags(item).includes('sigil');
}

/** The faction a sigil belongs to — resolved from the faction-id tag it carries
 *  (the same convention `faction_gear` uses). Null if it carries none. */
export function sigilFaction(item: Pick<InventoryItem, 'tags' | 'name'>): { id: string; name: string } | null {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const tags = (require('./crafting') as typeof import('./crafting')).canonicalItemTags(item);
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
