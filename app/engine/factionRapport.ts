// OTA-805 — Charisma-scaled vendor pricing, gated per faction by a "rapport"
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

import { canonicalFactionId } from './factions';

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
  // ⚠ OTA-1156 — heal the id BEFORE building a quest id out of it. A legacy race id
  // yields `fq_architectural_sentinels_rapport`, which exists in no quest catalogue,
  // so this returns false and the CHA discount is PERMANENTLY 0, with no log line —
  // for a vendor whose rapport quest the player did actually complete. Same root as
  // the OTA-1155 gift bug, failing silently on the read side instead of loudly.
  const id = canonicalFactionId(factionId) ?? factionId;
  return (completedFactionQuestIds ?? []).includes(rapportQuestId(id));
}

export const CHA_PRICE_DISCOUNT_PER_POINT = 0.02;
export const CHA_PRICE_DISCOUNT_CAP = 0.20;

// ⚠ OTA-1337 — THE STANDING LADDER. Owner: *"what the hell do I actually do at
// faction standing? I've traded with the vendor that I had a negative 90 on …
// there's no real benefit to have good standing. I could be a giant asshole to
// everybody."* He was right, verifiably: standing was punishment-only (pressure.ts
// hunts below −25) and vendorPriceMod never read it. Now the counter does:
//   ≥ +50 HONORED   — 15% price break at that faction's vendors
//   ≥ +25 TRUSTED   — 10%, and the faction VOUCHES for you: the CHA/rapport
//                     discount no longer needs the rapport fetch quest
//   ≥ +10 KNOWN     — 5%
//   ≤ −25 HOSTILE   — +15% markup (they still deal — quest hand-ins must stay
//                     possible — but they charge you for who you are)
//   ≤ −50 HATED     — +25% markup
// Thresholds sit on the existing landmarks: pressure.ts HOSTILE_STANDING (−25)
// and factions.ts JOIN_THRESHOLD (20) bracket the middle of this ladder.
// ⚠ The combined POSITIVE discount (CHA + standing) is capped at the proven-safe
// CHA_PRICE_DISCOUNT_CAP (0.20): OTA-802/916's no-arbitrage argument was made at
// that cap, and a deeper combined discount would let buy-price undercut the
// 0.8×catalog sell ceiling. Standing widens WHO gets a break (a low-CHA loyalist
// earns up to 15% with no rapport quest); it does not deepen the best one.
export const STANDING_KNOWN = 10;
export const STANDING_TRUSTED = 25;
export const STANDING_HONORED = 50;
export const STANDING_HOSTILE = -25;
export const STANDING_HATED = -50;

export type StandingTier = 'hated' | 'hostile' | 'neutral' | 'known' | 'trusted' | 'honored';

/** The ladder tier a raw standing value sits on. */
export function standingTier(standing: number): StandingTier {
  if (standing <= STANDING_HATED) return 'hated';
  if (standing <= STANDING_HOSTILE) return 'hostile';
  if (standing >= STANDING_HONORED) return 'honored';
  if (standing >= STANDING_TRUSTED) return 'trusted';
  if (standing >= STANDING_KNOWN) return 'known';
  return 'neutral';
}

/** Player-facing tier label, for the standing lines and the character sheet. */
export function standingTierLabel(standing: number): string {
  switch (standingTier(standing)) {
    case 'hated': return 'Hated';
    case 'hostile': return 'Hostile';
    case 'known': return 'Known';
    case 'trusted': return 'Trusted';
    case 'honored': return 'Honored';
    default: return 'Neutral';
  }
}

/** The standing side of the price modifier: positive fraction = discount,
 *  negative = markup. Pure ladder read — the rapport/CHA half composes in
 *  vendorPriceMod. */
export function standingPriceDiscount(standing: number): number {
  switch (standingTier(standing)) {
    case 'honored': return 0.15;
    case 'trusted': return 0.10;
    case 'known': return 0.05;
    case 'hostile': return -0.15;
    case 'hated': return -0.25;
    default: return 0;
  }
}

/** The raw CHA price fraction (0..0.20) — before the rapport gate. */
export function chaPriceDiscount(charisma: number): number {
  return Math.max(
    0,
    Math.min(CHA_PRICE_DISCOUNT_CAP, (charisma - 10) * CHA_PRICE_DISCOUNT_PER_POINT),
  );
}

/** The effective per-vendor price modifier fraction (−0.25..0.20). Buy price is
 *  multiplied by (1 − this); sell price by (1 + this). Composes two halves:
 *   · the CHA discount, gated by rapport — the fetch quest, OR (OTA-1337) the
 *     faction itself vouching for you at TRUSTED standing;
 *   · the standing ladder (standingPriceDiscount): up to +15% for the loyal,
 *     down to −25% for the hated — no quest, no CHA required.
 *  The combined positive side is capped at CHA_PRICE_DISCOUNT_CAP (see the
 *  ladder note above for why that cap is load-bearing). A hostile ladder read
 *  overrides charm entirely — no discount stacks onto a markup. Returns 0 for a
 *  factionless (neutral/procedural) vendor. */
export function vendorPriceMod(
  charisma: number,
  completedFactionQuestIds: readonly string[] | undefined,
  vendorFaction: string | null | undefined,
  standing = 0,
): number {
  if (!vendorFaction) return 0;
  const ladderHalf = standingPriceDiscount(standing);
  if (ladderHalf < 0) return ladderHalf;
  const rapportEarned = hasFactionRapport(completedFactionQuestIds, vendorFaction)
    || standing >= STANDING_TRUSTED;
  const chaHalf = rapportEarned ? chaPriceDiscount(charisma) : 0;
  return Math.min(CHA_PRICE_DISCOUNT_CAP, chaHalf + ladderHalf);
}
