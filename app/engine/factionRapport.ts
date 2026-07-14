// OTA-1090 — Charisma-scaled vendor pricing, gated per faction by a "rapport"
// fetch quest. Faction standing is EARNED (missions + sigil turn-ins); this adds a
// second, tangible payoff for Charisma: once you've done a faction's rapport quest
// ("bring me a high-end object … now we can deal"), that faction's vendors give you
// a CHA-scaled break — cheaper buys AND better sell-backs. Ungated CHA does nothing
// to price; the quest is the "in," Charisma is the magnitude.
//
// Curve (user-approved): 2% per point of CHA above 10, capped at 20%. So CHA 10 →
// 0%, CHA 15 → 10%, CHA 20 → 20%. Applies symmetrically: buy price × (1 − mod),
// sell price × (1 + mod). Even at the +20% sell cap the SELL_FRACTION (0.4) gap
// keeps buy-then-sell a loss, so no arbitrage — it's a merchant-build perk.

/** The stable rapport-quest id for a faction (authored in faction-quests.json).
 *  Completion of this quest (tracked in player.completedFactionQuestIds) unlocks
 *  dealing with that faction's vendors — no separate persisted flag needed. */
export function rapportQuestId(factionId: string): string {
  return `fq_${factionId}_rapport`;
}

/** Has the player earned rapport (done the rapport fetch quest) with this faction? */
export function hasFactionRapport(
  completedFactionQuestIds: readonly string[] | undefined,
  factionId: string | null | undefined,
): boolean {
  if (!factionId) return false;
  return (completedFactionQuestIds ?? []).includes(rapportQuestId(factionId));
}

export const CHA_PRICE_DISCOUNT_PER_POINT = 0.02;
export const CHA_PRICE_DISCOUNT_CAP = 0.20;

/** The raw CHA price fraction (0..0.20) — before the rapport gate. */
export function chaPriceDiscount(charisma: number): number {
  return Math.max(
    0,
    Math.min(CHA_PRICE_DISCOUNT_CAP, (charisma - 10) * CHA_PRICE_DISCOUNT_PER_POINT),
  );
}

/** The effective per-vendor price modifier fraction (0..0.20): the CHA discount,
 *  but ONLY if the player has earned rapport with the vendor's faction. Buy price
 *  is multiplied by (1 − this); sell price by (1 + this). Returns 0 for a
 *  factionless (neutral/procedural) vendor or an unearned faction. */
export function vendorPriceMod(
  charisma: number,
  completedFactionQuestIds: readonly string[] | undefined,
  vendorFaction: string | null | undefined,
): number {
  return hasFactionRapport(completedFactionQuestIds, vendorFaction)
    ? chaPriceDiscount(charisma)
    : 0;
}
