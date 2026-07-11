// OTA-745 — DRINK a weapon coating as a field remedy ("a physical counter, like a
// medicine"). Coatings are tri-modal: paint one on a WEAPON for an offensive DOT, on
// ARMOR for resistance (both via the inventory "Coat" action), or DRINK it for the
// defensive counterpart to its own element. The consume routes (use_relic + eat/drink)
// call this so a coating never gets swallowed for a blank no-op again — the bug a
// player hit dosing Corruption Tonic against their own corruption. Pure + generic on
// the coating kind, so it works for every coating and every content pack without
// per-item data.

import type { PlayerCharacter, InventoryItem } from './types';

export type CoatingKind = 'poison' | 'acid' | 'corruption' | 'electrical' | 'burn';

export interface CoatingRemedyResult {
  player: PlayerCharacter;
  messages: string[];
  corruptionBefore: number;
  corruptionAfter: number;
}

/** Apply the drink-as-medicine outcome of a coating. Returns the mutated player and
 *  world-log fragments; the caller consumes the unit, stamps time, and narrates the
 *  corruption tier-cross line (from corruptionBefore/After). Potency scales with the
 *  coating's rarity. */
export function coatingDrinkRemedy(
  player: PlayerCharacter,
  coatingKind: CoatingKind,
  rarity: InventoryItem['rarity'],
): CoatingRemedyResult {
  const potency = rarity === 'Legendary' ? 8 : rarity === 'Rare' ? 6 : rarity === 'Uncommon' ? 5 : 4;
  let p = { ...player };
  const messages: string[] = [];
  // Base "medicine" salve — a little HP for any coating drunk.
  const salveRoom = Math.max(0, p.hpMax - p.hp);
  const salve = Math.min(salveRoom, Math.ceil(potency / 2));
  if (salve > 0) { p = { ...p, hp: p.hp + salve }; messages.push(`+${salve} HP`); }
  const dropStatus = (kinds: string[], hadMsg: string, noneMsg: string) => {
    const had = (p.statusEffects ?? []).some((s) => kinds.includes(s.kind));
    p = { ...p, statusEffects: (p.statusEffects ?? []).filter((s) => !kinds.includes(s.kind)) };
    messages.push(had ? hadMsg : noneMsg);
  };
  const corruptionBefore = p.corruption;
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
    // 'acid' has no matching player ailment — the base salve above IS its effect.
    default: break;
  }
  return { player: p, messages, corruptionBefore, corruptionAfter: p.corruption };
}
