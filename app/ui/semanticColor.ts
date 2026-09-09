/* ⚠⚠⚠ THE COLOURS THAT MEAN SOMETHING, NAMED — OTA-1757.
 *
 * Owner's ruling, on the interface rollout:
 *   *"Rarity and other semantic colors are not accent colors. Gold remains
 *   reserved for the interface meaning already defined. HP, danger, rarity,
 *   positive/negative results, faction identity, etc. may retain meaningful
 *   semantic color."*
 *
 * That ruling could not be ENFORCED, and this module is what makes it possible.
 *
 * ⚠⚠⚠ THE PROBLEM, MEASURED. `#c9a86a` appears 380 times across 73 files, and it
 * is doing FOUR different jobs at once:
 *     · the interface accent      — gold means a live obligation or a live process
 *     · the `Common` rarity       — RARITY_COLORS
 *     · the `material` category   — CATEGORY_COLORS
 *     · the mid-band vitality warning — the HP/stamina ramp
 * Three of those four are semantic and legitimate under the ruling. So a ratchet
 * that counts `'#c9a86a'` counts a number with no meaning: it cannot fall
 * without deleting things the owner has said to keep, and it cannot tell a
 * considered HP amber from somebody reaching for a colour.
 * Naming the semantic uses is therefore a PREREQUISITE for the gold gate, not a
 * tidy-up to do afterwards.
 *
 * ⚠⚠ THIS CHANGES NO PIXELS, ON PURPOSE. Every value below is the hex the game
 * already draws, moved from an inline literal to a name. A pass that renamed and
 * recoloured at the same time would make any later visual difference impossible
 * to attribute — and this is the first step of a rollout the owner has said, in
 * as many words, is alarming at this scale. The first step should be one nobody
 * can see.
 *
 * ⚠⚠ ONE AUTHORITY PER VOCABULARY. `CATEGORY_COLORS` and `RARITY_COLORS` already
 * live in `components/InventoryCategorize` — OTA-1312 moved the rarity palette
 * there after finding it copy-pasted into FOUR files. They are re-exported here
 * rather than copied, so this module is a NAMING LAYER and never a second
 * source. Adding a rival table is the exact failure that OTA-1312 fixed.
 */

import { CATEGORY_COLORS, RARITY_COLORS, rarityHexColor } from '../components/InventoryCategorize';

export { CATEGORY_COLORS, RARITY_COLORS, rarityHexColor };

/* ⚠⚠ THE VITALITY RAMP — the game's most-used semantic colour and, until now,
 * its least named. `#9ec96a` alone appears 152 times; the three-stop ternary
 * that produces it is written out by hand in 22 places.
 *
 * ⚠ `warn` IS THE BRAND GOLD, and that is not laziness — it is the collision
 * this module exists to make visible. The same hex is the accent AND the middle
 * of the health ramp. Naming it here means a reader can tell which one a given
 * call site meant, and the gold gate can stop counting the semantic ones. */
export const VITALITY = {
  /** Healthy, positive, a result that went the player's way. */
  good: '#9ec96a',
  /** Caution. ⚠ Identical to the brand gold by long-standing design. */
  warn: '#c9a86a',
  /** Hurt, hostile, a result that went against the player. */
  bad: '#e07a5f',
  /** Neutral standing — neither earned nor lost. */
  neutral: '#cdbf99',
} as const;

/** Default thresholds for a two-cut ramp, matching what CharacterScreen has
 *  shipped since the sheet was built. Passed explicitly so a surface that means
 *  something different has to say so rather than quietly diverge. */
export const HP_CUTS: readonly [number, number] = [0.5, 0.25];
export const STAMINA_CUT = 0.4;

/**
 * The vitality colour for a 0..1 fraction.
 *
 * ⚠ Written as a ramp rather than a ternary chain because the chain was
 * duplicated 22 times, and a duplicated threshold is a threshold that drifts.
 * A fraction at or below `cuts[1]` is `bad`; above `cuts[0]` is `good`;
 * between them is `warn`.
 */
export function vitalityColor(
  fraction: number,
  cuts: readonly [number, number] = HP_CUTS,
): string {
  if (!Number.isFinite(fraction)) return VITALITY.warn;
  if (fraction > cuts[0]) return VITALITY.good;
  if (fraction > cuts[1]) return VITALITY.warn;
  return VITALITY.bad;
}

/**
 * ⚠⚠ OTA-1770 — THE CORRUPTION TIER, NAMED. Four stops rather than a ramp,
 * because corruption is a TIER the game already computes and not a fraction:
 * the colour climbs with the tier so the bar reads before the label does.
 *
 * ⚠ It is here because the legacy hunt's own classification says so — a
 * meaningful colour under the owner's ruling is KEPT and *named in the kit*,
 * not left as a literal. It was the last bare `#c9a86a` in CharacterScreen, and
 * leaving it there would have meant the gold ratchet counting a semantic use as
 * interface debt forever.
 *
 * ⚠ `tainted` IS the brand gold, which is correct and worth stating: caution is
 * gold in `VITALITY` too. Same colour, same meaning, arrived at independently.
 */
export const CORRUPTION = {
  hollowed: VITALITY.bad,
  corrupted: '#d08a4a',
  tainted: VITALITY.warn,
  clean: '#7a8a5a',
} as const;

/** The bar colour for a corruption tier. Unknown tiers read as clean, which is
 *  the safe direction: a tier this file has not heard of must not paint alarm. */
export function corruptionColor(tier: string | null | undefined): string {
  if (tier === 'hollowed') return CORRUPTION.hollowed;
  if (tier === 'corrupted') return CORRUPTION.corrupted;
  if (tier === 'tainted') return CORRUPTION.tainted;
  return CORRUPTION.clean;
}

/** A two-stop ramp for gauges that have no danger band — stamina is the case
 *  the game already ships. Above the cut is good; at or below it is caution. */
export function gaugeColor(fraction: number, cut: number = STAMINA_CUT): string {
  if (!Number.isFinite(fraction)) return VITALITY.warn;
  return fraction > cut ? VITALITY.good : VITALITY.warn;
}

/* ⚠⚠ FACTION STANDING — four bands, not a ramp, because the middle band is
 * NEUTRAL rather than a warning. `standingColor` keeps the thresholds with the
 * colours; CharacterScreen held them apart, so the sheet and the roster could
 * disagree about what "hostile" looks like without either being wrong. */
export const STANDING_JOIN = 25;
export const STANDING_WARY = -10;

export function standingColor(
  standing: number,
  joinThreshold: number = STANDING_JOIN,
): string {
  if (standing >= joinThreshold) return VITALITY.good;
  if (standing >= 0) return VITALITY.neutral;
  if (standing >= STANDING_WARY) return VITALITY.warn;
  return VITALITY.bad;
}

/* ⚠⚠⚠ KNOWN PALETTE EXCEPTIONS — recorded, not imported.
 *
 * The kit enforces a warm-neutral palette: every hex in `tartariaKit` must have
 * r ≥ g ≥ b, or chroma ≤ 18. Two colours the game uses in quantity FAIL that
 * rule and therefore cannot simply be moved into the kit:
 *
 *   `#8aa0a4`  (41 uses) — a cool grey-blue label ink, mostly CharacterScreen's
 *                          ladder headings. b > g > r, chroma 26.
 *   `#6a9bbf`  (armour)  — the category blue. b > g > r, chroma 85.
 *
 * They are listed here so that the rollout treats them as an OWNER DECISION
 * ("is this semantic, or is it drift?") rather than silently importing them and
 * quietly widening the palette rule. Under the final legacy hunt each must be
 * classified: semantic, intentional exception, dead, or defect.
 * ⚠ Nothing consumes this constant. It is documentation with a name, so that the
 * question survives in the code rather than only in a plan. */
export const PALETTE_EXCEPTIONS: Readonly<Record<string, string>> = {
  '#8aa0a4': 'cool label ink — CharacterScreen ladders, 41 uses. Fails the kit warm rule.',
  '#6a9bbf': 'armour category blue — CATEGORY_COLORS. Fails the kit warm rule.',
};
