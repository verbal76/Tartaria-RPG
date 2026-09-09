/**
 * OTA-1788 — THE UTILITY GLYPHS, AND THEY ARE A SEPARATE FAMILY ON PURPOSE.
 *
 * Owner, from an actual device: *"The actual-device Take/Salvage surface still
 * uses generic-looking symbolic marks that do not belong to the illustrated
 * Tartaria glyph vocabulary."* And then, in the reference pack's asset policy:
 * *"Use the existing glyph library. Do not generate or commission another
 * weapon-glyph vocabulary... Use util_salvage.png as the existing-pack candidate
 * for salvage instead of inventing new crossed-tools art."*
 *
 * ⚠⚠⚠ THIS IS NOT `combatGlyphArt`, AND KEEPING THEM APART IS THE RULING.
 * The pack is explicit: *"Do not replace the damage/coating/discovery glyph
 * family already shipped yesterday. Those remain the authority for damage,
 * coatings and discovery."* A damage glyph answers WHAT KIND OF HARM; a utility
 * glyph answers WHAT THIS CONTROL DOES. Two questions, two tables, and a suite
 * asserts neither file requires the other's directory.
 *
 * ⚠⚠ THE CHARACTERS THESE REPLACE HAD A REAL DEFECT, NOT MERELY A LOOK.
 * `⚒` (U+2692) is exactly the case OTA-1748 documented for `⚙`: it has an EMOJI
 * PRESENTATION VARIANT, so on any Android build whose font fallback reaches the
 * colour emoji font first it renders as a colour sticker and ignores the `color`
 * the style sets. A salvage mark that can spontaneously become a blue-and-white
 * emoji is not a designed icon. Illustrated artwork has no fallback chain.
 *
 * ⚠ ONE TABLE, ONE `require()` SITE, mirroring `combatGlyphArt`'s rule — the
 * owner's standing instruction there was *"Keep the icon mapping centralized
 * rather than creating separate Lore and combat mappings"*, and it applies to
 * any second family for the same reason.
 *
 * ⚠ NO TINT, EVER. These are illustrated artwork from the owner's own packs, not
 * monochrome glyphs. Every consumer uses `resizeMode="contain"` on a square box
 * against a 1:1 source, so nothing is stretched, cropped or recoloured — the
 * pack's rule 7, verbatim: *"Do not recolor the source PNG artwork
 * destructively. Size and frame them through the UI."*
 */

/** The utility concepts that have approved artwork. Deliberately small: a name
 *  lands here when the owner supplies a file for it, never speculatively. */
export type UtilityGlyph = 'salvage' | 'glyph_key';

/** ⚠ THE ONE TABLE. Source provenance, from the pack's own ICON_SOURCE_MAP:
 *    salvage    L569  tool_09.png      — the existing tool bundle
 *    glyph_key  L119  document_07.png  — the existing book/reference icon
 *  Both were SELECTED from the owner's shipped icon packs and renamed
 *  semantically, which is why nothing here was drawn or commissioned. */
const UTILITY_ART: Record<UtilityGlyph, number> = {
  salvage: require('../../assets/ui-glyphs/salvage.png'),
  glyph_key: require('../../assets/ui-glyphs/glyph_key.png'),
};

/** The artwork for a utility concept, or `undefined` when there is none.
 *  ⚠ UNDEFINED IS A REAL ANSWER AND CALLERS MUST HANDLE IT. The character marks
 *  these replace are still the fallback for anything unmapped — a control that
 *  renders nothing is worse than one wearing a plain glyph. */
export function utilityArt(kind: string | null | undefined): number | undefined {
  if (!kind) return undefined;
  return UTILITY_ART[kind as UtilityGlyph];
}

/** ⚠⚠ THE SIZES ARE A DENSITY, NOT A TASTE CALL, and they are deliberately NOT
 *  `GLYPH_ART_SIZE`'s 28.
 *
 *  28 is the DAMAGE glyph's size, set by the owner for a weapon button and for
 *  Lore's legend — surfaces where the mark is the subject. A utility glyph is
 *  never the subject: it labels a control whose WORD is the subject. The pack
 *  says the same thing about the transcript — *"Do not blindly force 28dp if
 *  this context demonstrably requires a smaller governed density"* — and a chip
 *  is a tighter context than a transcript row.
 *
 *  ⚠ `row` is sized to the loot picker's existing icon cell so the column does
 *  not move; `chip` is sized to sit inside a `quick` chip's 12pt line box
 *  without growing the chip, the same discipline OTA-1781 applied to the weapon
 *  name. Both are floors under an actual-device check, not substitutes for it. */
export const UTILITY_ART_SIZE = {
  /** The loot picker's row mark — the cell `gatherIcon`'s character already had. */
  row: 18,
  /** Inside a combat/utility chip, beside a 12pt label. */
  chip: 16,
} as const;
