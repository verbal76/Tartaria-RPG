// Phase 8 — Life 2 postmortem repair, owner ruling §5/§6/§9.
//
// A pure, independently-testable option constructor for "approaching a
// Guardian (or returning to one) after a withdrawal". Split out of the
// driver (canonicalLife3.test.ts) specifically so OPTION CONSTRUCTION
// (what's legitimately reachable right now) can be qualification-tested —
// including negative controls — without booting the whole game, per the
// owner's explicit separation: "OPTION CONSTRUCTION: what can the human
// legitimately do? POLICY: what should this capable human do given what
// they currently know? Never merge those two concepts again."
//
// This module makes NO store/telemetry/production calls itself — the
// caller (the driver) gathers each field from real, currently-rendered
// state (get().currentScene?.vendor, PlayerView equipment/inventory, etc.)
// and hands over only the already-observed facts below. Nothing here
// fabricates availability; every option returned corresponds 1:1 to a
// field the caller asserts is true right now.

import type { DecisionOption } from './policy';

export interface GuardianApproachContext {
  /** Is the Tartarian physically standing at the Guardian's capital right
   *  now? Summon is only ever offered when this is true — never fabricated
   *  from a different location. */
  atCapital: boolean;
  /** The capital location id this approach concerns (used only for labels). */
  capitalId: string;
  /** The known hub location id (where the tutorial actually ended) this
   *  Tartarian can legitimately travel back to. */
  hubLocationId: string;
  /** A player-visible objective identity, e.g. "guardian:asgardar". */
  objectiveId: string;
  /** A strictly-better-rarity weapon sitting in inventory right now, or
   *  null if none exists. */
  equipUpgrade: { name: string; rank: number; fromRank: number } | null;
  /** Does this Tartarian already hold a usable healing item? */
  hasHealingItem: boolean;
  /** A vendor healing consumable actually offered in the CURRENT scene's
   *  vendor stock right now, or null if no vendor is present / none stocked. */
  vendorHealOffer: { itemName: string; price: number } | null;
  /** The name of a currently-worn item whose durability has visibly
   *  dropped below max, when a vendor is present to repair it; else null. */
  damagedEquippedItemName: string | null;
}

/**
 * Builds the full legitimate option set for one "approach the Guardian"
 * decision point. Every option corresponds to something the context
 * asserts is real; this function never adds an option the context didn't
 * report as available (see canonicalGuardianApproachOptions.test.ts's
 * negative controls, which prove a code change that removes a field's
 * option here is caught).
 */
export function buildGuardianApproachOptions(ctx: GuardianApproachContext): DecisionOption[] {
  const options: DecisionOption[] = [];

  if (ctx.atCapital) {
    options.push({
      id: 'summon',
      category: 'critical-path',
      label: '★ SUMMON',
      meta: { isRetryableObjective: true, objectiveId: ctx.objectiveId },
    });
  } else {
    options.push({ id: 'return-to-capital', category: 'journey', label: `return to ${ctx.capitalId}` });
  }

  if (ctx.equipUpgrade) {
    options.push({
      id: 'equip-upgrade',
      category: 'equip',
      label: `wear ${ctx.equipUpgrade.name}`,
      meta: { powerDelta: ctx.equipUpgrade.rank - ctx.equipUpgrade.fromRank },
    });
  }

  if (ctx.vendorHealOffer && !ctx.hasHealingItem) {
    options.push({
      id: 'buy-healing',
      category: 'buy',
      label: `buy ${ctx.vendorHealOffer.itemName}`,
      meta: { price: ctx.vendorHealOffer.price },
    });
  }

  if (ctx.damagedEquippedItemName) {
    options.push({ id: 'repair-gear', category: 'repair', label: `repair ${ctx.damagedEquippedItemName}` });
  }

  if (ctx.atCapital && ctx.capitalId !== ctx.hubLocationId) {
    options.push({ id: 'retreat-to-hub', category: 'reassess', label: `retreat to ${ctx.hubLocationId} to prepare` });
  }

  return options;
}
