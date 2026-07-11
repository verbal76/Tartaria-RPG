// OTA-1051 — coatings are tri-modal: paint one on a WEAPON for an offensive DOT, on
// ARMOR for resistance (both via the inventory "Coat" action), or DRINK it for the
// defensive counter to its own element. OTA-1052 — a coating is DRINKABLE only if there
// is a real player-side ailment/counter for it. 'acid' has no player 'acid' status (its
// offense is enemy armor-shred), so it can't be drunk — coat it instead. A hypothetical
// 'hamster' coating with no player counterpart is likewise not drinkable. This keeps a
// coating from being a free heal just because it exists.

import type { PlayerCharacter, InventoryItem } from './types';

export type CoatingKind = 'poison' | 'acid' | 'corruption' | 'electrical' | 'burn';

/** Every damage element a coating can carry (drinkable or not). Used to read a
 *  coating's element off an inventory item's tags. */
export const COATING_ELEMENTS: readonly CoatingKind[] = ['poison', 'acid', 'corruption', 'electrical', 'burn'];

/** Which coating elements have a player-side counter you can DRINK for. acid has none
 *  (no player 'acid' ailment) — it is coat-only. */
export function isCoatingDrinkable(kind: string | null | undefined): boolean {
  return kind === 'corruption' || kind === 'poison' || kind === 'burn' || kind === 'electrical';
}

/** Pull a coating's element from an item's tags (Poison Vial → 'poison', Acid Flask →
 *  'acid', …). Returns null if the tags name no coating element. */
export function coatingElementFromTags(tags: readonly string[] | undefined): CoatingKind | null {
  for (const t of tags ?? []) {
    const l = t.toLowerCase();
    if ((COATING_ELEMENTS as readonly string[]).includes(l)) return l as CoatingKind;
  }
  return null;
}

/** May this inventory item be drunk / used as a consumable? Non-coatings are never
 *  gated here (returns true — normal consume rules apply). A weapon_coating is drinkable
 *  only when its element has a counter (isCoatingDrinkable). Drives whether the
 *  inventory offers a "Use/Drink" action at all. */
export function coatingItemDrinkable(item: { tags?: readonly string[] }): boolean {
  const tags = (item.tags ?? []).map((t) => t.toLowerCase());
  if (!tags.includes('weapon_coating')) return true;
  return isCoatingDrinkable(coatingElementFromTags(tags));
}

export interface CoatingRemedyResult {
  player: PlayerCharacter;
  messages: string[];
  corruptionBefore: number;
  corruptionAfter: number;
}

/** Apply the drink-as-medicine outcome of a coating. Only DRINKABLE coatings produce an
 *  effect (a non-drinkable kind returns the player unchanged with no messages — callers
 *  refuse before consuming). Potency scales with the coating's rarity. */
export function coatingDrinkRemedy(
  player: PlayerCharacter,
  coatingKind: CoatingKind,
  rarity: InventoryItem['rarity'],
): CoatingRemedyResult {
  const corruptionBefore = player.corruption;
  if (!isCoatingDrinkable(coatingKind)) {
    return { player, messages: [], corruptionBefore, corruptionAfter: corruptionBefore };
  }
  const potency = rarity === 'Legendary' ? 8 : rarity === 'Rare' ? 6 : rarity === 'Uncommon' ? 5 : 4;
  let p = { ...player };
  const messages: string[] = [];
  // Base "medicine" salve — a little HP for a drinkable coating.
  const salveRoom = Math.max(0, p.hpMax - p.hp);
  const salve = Math.min(salveRoom, Math.ceil(potency / 2));
  if (salve > 0) { p = { ...p, hp: p.hp + salve }; messages.push(`+${salve} HP`); }
  const dropStatus = (kinds: string[], hadMsg: string, noneMsg: string) => {
    const had = (p.statusEffects ?? []).some((s) => kinds.includes(s.kind));
    p = { ...p, statusEffects: (p.statusEffects ?? []).filter((s) => !kinds.includes(s.kind)) };
    messages.push(had ? hadMsg : noneMsg);
  };
  switch (coatingKind) {
    case 'corruption': {
      p = { ...p, corruption: Math.max(0, corruptionBefore - potency) };
      const cleared = corruptionBefore - p.corruption;
      messages.push(cleared > 0 ? `-${cleared} corruption` : 'no corruption to clear');
      break;
    }
    case 'poison': dropStatus(['poisoned'], 'poison purged', 'no poison in you'); break;
    case 'burn': dropStatus(['burn_scar'], 'burns soothed', 'no burns to soothe'); break;
    case 'electrical': dropStatus(['stun', 'paralyzed'], 'nerves steadied', 'nerves steady'); break;
    default: break; // unreachable: acid is gated out by isCoatingDrinkable above
  }
  return { player: p, messages, corruptionBefore, corruptionAfter: p.corruption };
}
