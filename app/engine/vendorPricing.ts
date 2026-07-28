// OTA-865 [war micro-economy] — the single source of truth for what a vendor charges and
// pays, so the VendorScreen display and the gameStore transaction can never drift (before
// this, the screen recomputed the price itself and silently omitted the tide modifier).
//
// The full buy price is a chain of independent multipliers on the catalogue base:
//   base × corruption markup × (1 − your CHA/rapport discount) × faction-tide × war heat
// and the sell price mirrors it with the discount and war heat working in the player's
// favour. War heat is the NEW factor (OTA-865): in a contested area soldiers are buying,
// so traders mark up — and pay a little more, since they can resell to those soldiers.
//
// Safety: the war modifiers are tightly bounded (buy +12% / sell +8% at full heat), well
// inside the swing the CHA discount + tide already produce, and the sell premium stays far
// under the buy/sell spread so there is never a buy-here-sell-there arbitrage.

/** War-heat price multipliers. `heat` is 0..1 (see localWarHeat). Bounded on purpose. */
export function warPriceFactor(heat: number): { buyMult: number; sellMult: number } {
  const h = Math.max(0, Math.min(1, heat));
  return { buyMult: 1 + h * 0.12, sellMult: 1 + h * 0.08 };
}

export interface BuyPriceParts {
  /** Corruption-tier markup (≥1). */
  corruptionMult: number;
  /** CHA/rapport discount fraction 0..0.20. */
  buyDiscount: number;
  /** Vendor-faction fortunes multiplier (tide teeth). */
  tideMult: number;
  /** Local war-heat buy multiplier (≥1). */
  warBuyMult: number;
}

/** The price the player actually pays for one unit (integer, floored at 1). */
export function finalBuyPrice(base: number, p: BuyPriceParts): number {
  return Math.max(1, Math.ceil(base * p.corruptionMult * (1 - p.buyDiscount) * p.tideMult * p.warBuyMult));
}

/** The same buy price WITHOUT the player's CHA/rapport discount — i.e. what a stranger
 *  would be charged here. Used to show how much the player's standing/charm saved them. */
export function strangerBuyPrice(base: number, p: BuyPriceParts): number {
  return Math.max(1, Math.ceil(base * p.corruptionMult * p.tideMult * p.warBuyMult));
}

/** Price direction vs. the catalogue base, for the ▲/▼ ticker next to a price.
 *  color is player-benefit (green = good for you, red = bad); dir follows the price.
 *   - BUY: paying above base is bad (red ▲), below base is good (green ▼).
 *   - SELL: getting above base is good (green ▲), below base is bad (red ▼).
 *  Returns null when the final price equals the base (no marker). */
export function priceArrow(finalPrice: number, basePrice: number, mode: 'buy' | 'sell'):
  { glyph: '▲' | '▼'; good: boolean } | null {
  if (finalPrice === basePrice) return null;
  const up = finalPrice > basePrice;
  const good = mode === 'buy' ? !up : up; // buy: cheaper is good; sell: dearer is good
  return { glyph: up ? '▲' : '▼', good };
}
