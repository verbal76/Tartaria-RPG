// Strategic repair — Phase 12. A pure, independently-testable OPTION
// CONSTRUCTOR for equipment decisions across every real player slot, per
// the owner's explicit separation (guardianApproachOptions.ts's own
// heading): "OPTION CONSTRUCTION: what can the human legitimately do?
// POLICY: what should this capable human do given what they currently
// know?" This module builds options only — it never decides; the existing,
// UNMODIFIED policy.ts `decide()` still picks among them via its own
// pre-existing 'equip'/'buy' branches (§5/§6 of its priority hierarchy),
// which already compare options by `meta.powerDelta` — this module's only
// job is to hand decide() an ACCURATE powerDelta for every slot instead of
// the old driver's weapon-rarity-only figure.
//
// STRUCTURAL FIREWALL: imports only playerView's PlayerView type, policy's
// DecisionOption type, and this repair's own itemIntelligence reader —
// never the store or telemetry. No RNG, no mutation.

import type { PlayerView } from './playerView';
import type { DecisionOption } from './policy';
import { readItemMechanics, type EquipSlotKey, type ItemMechanicalRead } from './itemIntelligence';

const RARITY_RANK: Record<string, number> = { Common: 0, Uncommon: 1, Rare: 2, Legendary: 3 };
const RING_KEYS = ['ring', 'ring2', 'ring3', 'ring4'] as const;

/**
 * A bounded, human-plausible build-value score for one item, given this
 * character's own DISCLOSED vulnerabilities (e.g. ['aetheric'] for
 * mud_golem — a race trait known at creation, never a future enemy's
 * damage type). Every weight is a modest, explainable constant — not a
 * hidden optimization target. Rarity is included only as a SMALL tiebreaker
 * (weight 0.5) precisely so it cannot, by itself, outrank a clearly
 * superior mechanical read (the owner's explicit requirement, §10/§14).
 */
export function equipmentScore(read: ItemMechanicalRead, disclosedVulnerabilities: readonly string[]): number {
  let score = 0;
  score += read.acBonus * 3;
  score += read.hpRegen * 4;
  score += read.staminaRegen * 2;
  score += read.statBonusCount * 1;
  for (const t of read.resistTypes) {
    score += disclosedVulnerabilities.includes(t) ? 8 : 1;
  }
  if (read.slot === 'main' && read.damageAvg !== null) score += read.damageAvg * 2;
  score += (read.rarity ? RARITY_RANK[read.rarity] ?? 0 : 0) * 0.5;
  return score;
}

/** Exported for the life-orchestrator (Phase 13 driver-integration repair):
 *  the same "what's currently in this slot, by name" read used throughout
 *  this module, needed by the orchestrator to log an equip decision's
 *  before/after item identity without duplicating this lookup. */
export function equippedName(view: PlayerView, slotKey: string): string | null {
  const eq = view.equipped as unknown as Record<string, unknown> | null | undefined;
  const v = eq?.[slotKey];
  return typeof v === 'string' && v.length > 0 ? v : null;
}

/**
 * Builds 'equip' DecisionOptions for every real, mechanically-meaningful
 * slot this repair covers (main weapon, six armor slots, amulet, four ring
 * slots) by comparing each inventory candidate's readItemMechanics() score
 * against whatever (if anything) already fills that slot. An empty slot
 * scores 0, so ANY positive-value candidate is offered — never requiring a
 * candidate to first beat a rarity floor to fill nothing (the owner's
 * explicit empty-slot rule, §8).
 */
export function buildEquipmentOptions(view: PlayerView, disclosedVulnerabilities: readonly string[]): DecisionOption[] {
  const options: DecisionOption[] = [];

  const candidates = view.inventory
    .map((it) => readItemMechanics(it.name))
    .filter((r): r is ItemMechanicalRead => r !== null && r.slot !== null);

  const bySlot = new Map<EquipSlotKey, ItemMechanicalRead[]>();
  for (const c of candidates) {
    const list = bySlot.get(c.slot!) ?? [];
    list.push(c);
    bySlot.set(c.slot!, list);
  }

  // main / head / chest / hands / legs / feet / cloak / amulet — one slot,
  // one currently-worn item (or none).
  const SINGLE_SLOTS: EquipSlotKey[] = ['main', 'head', 'chest', 'hands', 'legs', 'feet', 'cloak', 'amulet'];
  for (const slot of SINGLE_SLOTS) {
    const pool = bySlot.get(slot) ?? [];
    if (pool.length === 0) continue;
    const wornName = equippedName(view, slot);
    const wornRead = wornName ? readItemMechanics(wornName) : null;
    const wornScore = wornRead ? equipmentScore(wornRead, disclosedVulnerabilities) : 0;
    let best: ItemMechanicalRead | null = null;
    let bestScore = wornScore;
    for (const c of pool) {
      if (c.name === wornName) continue;
      const s = equipmentScore(c, disclosedVulnerabilities);
      if (s > bestScore) { best = c; bestScore = s; }
    }
    if (best) {
      options.push({
        id: `equip:${slot}`,
        category: 'equip',
        label: `wear ${best.name}`,
        meta: { powerDelta: bestScore - wornScore, slot },
      });
    }
  }

  // Rings — up to 4 concurrent, per production's RING_SLOTS/MAX_RINGS
  // (app/engine/equipment.ts). Fill an empty ring slot before ever
  // proposing to replace a worn one; only replace the WEAKEST worn ring,
  // and only when a candidate clearly beats it.
  const ringPool = bySlot.get('ring') ?? [];
  if (ringPool.length > 0) {
    const wornRings = RING_KEYS
      .map((k) => ({ key: k, name: equippedName(view, k) }))
      .map((r) => ({ ...r, read: r.name ? readItemMechanics(r.name) : null }))
      .map((r) => ({ ...r, score: r.read ? equipmentScore(r.read, disclosedVulnerabilities) : 0 }));
    const emptySlot = wornRings.find((r) => r.name === null);
    const wornNames = new Set(wornRings.map((r) => r.name).filter((n): n is string => n !== null));
    const bestCandidate = ringPool
      .filter((c) => !wornNames.has(c.name))
      .map((c) => ({ c, score: equipmentScore(c, disclosedVulnerabilities) }))
      .sort((a, b) => b.score - a.score)[0];

    if (bestCandidate && emptySlot) {
      options.push({
        id: `equip:${emptySlot.key}`,
        category: 'equip',
        label: `wear ${bestCandidate.c.name}`,
        meta: { powerDelta: bestCandidate.score, slot: emptySlot.key },
      });
    } else if (bestCandidate) {
      const weakest = [...wornRings].sort((a, b) => a.score - b.score)[0];
      if (weakest && bestCandidate.score > weakest.score) {
        options.push({
          id: `equip:${weakest.key}`,
          category: 'equip',
          label: `wear ${bestCandidate.c.name}`,
          meta: { powerDelta: bestCandidate.score - weakest.score, slot: weakest.key },
        });
      }
    }
  }

  return options;
}

export interface VendorEquipOffer {
  itemName: string;
  price: number;
}

/**
 * Vendor-side counterpart to buildEquipmentOptions: given the CURRENT
 * scene's real vendor offers (the caller asserts these are actually on
 * screen right now — never fabricated) and this Tartarian's own currency,
 * proposes 'buy' options for offers that would score as a real upgrade over
 * whatever fills the same slot today, bounded to what's actually
 * affordable. Deliberately conservative: this never proposes selling
 * anything (§17 of the owner's spec — selling is deferred, not implemented,
 * absent a clearly safe human-like rule).
 */
export function buildVendorEquipOptions(
  view: PlayerView,
  offers: readonly VendorEquipOffer[],
  currency: number,
  disclosedVulnerabilities: readonly string[],
): DecisionOption[] {
  const options: DecisionOption[] = [];
  for (const offer of offers) {
    if (offer.price > currency) continue;
    const read = readItemMechanics(offer.itemName);
    if (!read || !read.slot) continue;
    const isRing = read.slot === 'ring';
    const slotKeys = isRing ? [...RING_KEYS] : [read.slot];
    let bestDelta = -Infinity;
    let bestSlotKey: string = slotKeys[0]!;
    const candidateScore = equipmentScore(read, disclosedVulnerabilities);
    for (const key of slotKeys) {
      const wornName = equippedName(view, key);
      const wornRead = wornName ? readItemMechanics(wornName) : null;
      const wornScore = wornRead ? equipmentScore(wornRead, disclosedVulnerabilities) : 0;
      const delta = candidateScore - wornScore;
      if (delta > bestDelta) { bestDelta = delta; bestSlotKey = key; }
    }
    if (bestDelta > 0) {
      options.push({
        id: `buy-equip:${offer.itemName}`,
        category: 'buy',
        label: `buy ${offer.itemName}`,
        meta: { price: offer.price, powerDelta: bestDelta, slot: bestSlotKey },
      });
    }
  }
  return options;
}
