// ⚠⚠⚠ OTA-1766 — THE ILLUSTRATED GLYPHS ARE THE GLYPHS NOW. ONE TABLE, THREE
// SURFACES.
//
// Owner: *"The new combat glyph pack is approved. Go ahead and move from the
// test to the actual implementation."* — into Lore ▸ Glyphs, the weapon
// damage/coating icons in combat, and the discovered-weakness star.
//
// ⚠⚠ THIS FILE REPLACES `damageIcons.ts`, WHICH WAS THE TRIAL'S TABLE AND WENT
// WITH THE TRIAL. That one keyed TEN INVENTED CONCEPTS (impact, rupture,
// galvanic, noxious, resonance, environmental…) because the trial deliberately
// refused to bind artwork to the game's damage vocabulary — the binding was a
// SEMANTIC ruling and OTA-1763 left it open as an owner decision rather than
// smuggling it in under a display experiment.
//
// ⚠⚠⚠ THE OWNER CLOSED THAT DECISION BY SUPPLYING FILES NAMED FOR THE GAME'S OWN
// TYPES. The approved pack ships `bludgeoning.png`, `slashing.png`,
// `piercing.png`, `aetheric.png`, `radiation.png`, `burn.png`, `cold.png`,
// `poison.png`, `acid.png`, `corruption.png`, `electrical.png` — every one of
// them a key that already exists in `weaponGlyphs.BASE_DAMAGE_GLYPH` and
// `weaponGlyphs.COATING_GLYPH`. So there is no mapping to invent here: the
// filenames ARE the semantic keys, and this table is keyed by them.
//
// ⚠⚠ ONE TABLE, NOT ONE PER SURFACE. Owner: *"Keep the icon mapping centralized
// rather than creating separate Lore and combat mappings."* Lore's legend, the
// combat weapon buttons and the discovery star all resolve art through
// `glyphArt()` below. A test asserts there is no second `require()` of this
// asset family anywhere in `app/`.
//
// ⚠⚠ BURN / COLD / POISON / ELECTRICAL ARE ONE IMAGE EACH, WHETHER BASE OR COAT.
// Owner, explicitly. That falls out of keying by canonical damage type rather
// than by role: `burn` is `burn` whether it is painted on or built in, which is
// the same rule `weaponGlyphs` already applies to the TEXT glyphs (its comment:
// "fire is fire whether it is painted on or built in"). Nothing here needs a
// `coat:` prefix, and a test asserts the base and coat lookups return the
// IDENTICAL module id by object identity, so the sharing reads as a decision.
//
// ⚠ NO TINT, EVER. These are illustrated artwork, not monochrome glyphs. Every
// consumer uses `resizeMode="contain"` on a square box against a 1:1 source, so
// nothing is stretched or cropped, and nothing applies `tintColor`.
//
// ⚠⚠⚠ TWO NAMES HAVE NO FILE, BUT ONLY ONE OF THEM FALLS BACK.
// `weaponGlyphs.BASE_DAMAGE_GLYPH` carries thirteen types; the approved pack
// draws eleven. `degradation` (⚙) and `stun` (✱) have no image of their own —
// but `glyphArt()` CANONICALISES before it looks up, and OTA-1652 aliases
// `degradation → acid`, so a degradation weapon resolves the ACID artwork and
// never reaches the fallback at all.
//
// ⚠⚠ THAT IS CORRECT BECAUSE IT MATCHES THE CHARACTER PATH EXACTLY. OTA-1667
// recorded the same thing about the text glyphs: "even a weapon that authored
// degradation would print ⚗, never ⚙." The artwork inherits that behaviour from
// sharing `canonicalDamageType` rather than re-deciding it, which is the point
// of keying on the canonical type in the first place.
//
// ⚠ SO `stun` IS THE ONE GENUINE HOLE, and it falls back rather than vanishing:
// `glyphArt()` returns `undefined` and both consumers paint the text glyph that
// has always been there. No catalog weapon deals stun today (OTA-1667 measured
// all 301), but "unreachable today" is not "impossible tomorrow", and a weapon
// authored with a stun base must not render a blank box. A test walks the whole
// table and proves the hole is exactly that one — I first wrote "two" here and
// the walk is what corrected me.

import { canonicalDamageType } from './damageTypes';

/**
 * The eleven damage/coating types the approved pack draws, plus the discovery
 * star. Keyed by the CANONICAL damage type — the same string
 * `weaponGlyphs.baseDamageGlyph` and `weaponGlyphs.COATING_GLYPH` key on — so a
 * caller never has to know whether it is asking about a base type or a coat.
 */
const GLYPH_ART: Readonly<Record<string, number>> = {
  bludgeoning: require('../../assets/combat-glyphs/bludgeoning.png'),
  slashing: require('../../assets/combat-glyphs/slashing.png'),
  piercing: require('../../assets/combat-glyphs/piercing.png'),
  aetheric: require('../../assets/combat-glyphs/aetheric.png'),
  radiation: require('../../assets/combat-glyphs/radiation.png'),
  burn: require('../../assets/combat-glyphs/burn.png'),
  cold: require('../../assets/combat-glyphs/cold.png'),
  poison: require('../../assets/combat-glyphs/poison.png'),
  acid: require('../../assets/combat-glyphs/acid.png'),
  corruption: require('../../assets/combat-glyphs/corruption.png'),
  electrical: require('../../assets/combat-glyphs/electrical.png'),
};

/**
 * ⚠ THE STAR IS NOT A DAMAGE FAMILY, so it is not in the table above.
 * The pack's own README: *"The discovery star is not a damage family. It
 * indicates that the current weapon delivers a damage/coating type that is a
 * discovered weakness of the enemy."* Keeping it out of `GLYPH_ART` means
 * `glyphArt('discovery_star')` cannot accidentally resolve, and nothing that
 * iterates the damage types picks up a verdict by mistake.
 */
export const DISCOVERY_STAR_ART: number = require('../../assets/combat-glyphs/discovery_star.png');

/**
 * The artwork for a damage or coating type, or `undefined` when the pack has
 * none — which today is exactly `stun`, and the caller must fall back to the
 * text glyph rather than render an empty box. (`degradation` has no file of its
 * own but is aliased to `acid` below before the lookup, so it resolves.)
 *
 * ⚠ Canonicalises first, the same way `baseDamageGlyph` does, so `frost` finds
 * `cold` and `force`/`psychic` find `aetheric` without every call site
 * re-aliasing and getting it wrong.
 */
export function glyphArt(type: string | null | undefined): number | undefined {
  if (!type) return undefined;
  return (GLYPH_ART as Record<string, number | undefined>)[canonicalDamageType(type)];
}

/** Every type the pack ships art for. Declaration order. */
export const GLYPH_ART_TYPES: readonly string[] = Object.keys(GLYPH_ART);

/**
 * ⚠⚠⚠ THE DISPLAYED SIZE. ONE NUMBER, NOT TWO — AND THAT IS AN OWNER RULING
 * THAT OVERTURNED THIS FILE'S FIRST ANSWER.
 *
 * OTA-1766 shipped Lore at 28 and combat at 18, and argued for the 18 like this:
 * *"the weapon chip is `paddingVertical: 6` around 12pt text, so its content box
 * is about 16dp tall. An 18dp icon sits inside that without growing the chip; 28
 * would add roughly 12dp to the height of every weapon button in a fight."*
 *
 * ⚠⚠ THAT REASONING IS OVERRULED, AND IT IS KEPT ABOVE RATHER THAN DELETED
 * BECAUSE IT NAMES THE MISTAKE EXACTLY. Owner: *"do NOT preserve the current
 * combat weapon button height at the expense of icon readability... Do not
 * shrink the artwork simply to preserve the old button dimensions."* Every word
 * of the old argument was true as measurement and wrong as a decision: I treated
 * the chip's existing height as the constraint and the artwork as the variable,
 * when the artwork is the thing the player has to read. The chip was never a
 * requirement — it was just what happened to be there.
 *
 * ⚠ THE OWNER'S PRIORITY ORDER, WHICH IS WHAT THE NUMBER BELOW OBEYS:
 *     1. glyph immediately readable
 *     2. weapon name immediately readable
 *     3. comfortable padding around both
 *     4. compact button height AFTER those are satisfied
 * So the size is Lore's 28 — *"The combat glyphs should be at least Lore size.
 * Start with the exact displayed icon size used in Lore ▸ Glyphs"* — and the
 * chip grows to fit it. Measured: a weapon chip goes from about 30dp tall to
 * about 46dp. Owner: *"There is room on the combat screen for slightly taller
 * weapon buttons if needed."*
 *
 * ⚠ ONE NUMBER RATHER THAN TWO IS NOW THE HONEST SHAPE. While the surfaces
 * disagreed, a `{ lore, combat }` pair said something real. They agree, so a
 * pair would only be an invitation to let them drift apart again.
 *
 * ⚠ PROVISIONAL, pending the owner's look at an actual device.
 */
export const GLYPH_ART_SIZE = {
  /** Lore ▸ Glyphs legend rows — the cell the text glyph already occupied. */
  lore: 28,
  /** Weapon buttons in combat. The SAME size; the chip grows to hold it. */
  combat: 28,
} as const;

/** ⚠⚠⚠ OTA-1781 — THE TYPE THAT STANDS BESIDE A 28dp MARK, AND THE GAME ALREADY
 *  KNEW IT.
 *
 *  Owner: *"The artwork grew but the weapon-name typography did not, so the name
 *  now looks undersized and visually disconnected from the glyph."* True, and
 *  the correction did not need to be invented — it was already drawn.
 *
 *  Lore ▸ Glyphs ends with a PICTURE OF A WEAPON BUTTON (`WeaponGlyphKey`'s
 *  example row: two coats, LAUNCHER, the weapon's own damage, the star). That
 *  mock has been setting its name at 15/700/1 beside a `GLYPH_ART_SIZE.combat`
 *  mark since the artwork landed, while the LIVE button set the same name at
 *  12/400/0 beside the same mark. The teaching surface and the control it
 *  teaches disagreed, and the mock was the one the owner approved.
 *
 *  ⚠ SO THIS IS ONE AUTHORITY RATHER THAN TWO AGREEING NUMBERS. Both the mock
 *  and the real chip now read it. A pairing kept in two files is a pairing that
 *  drifts — which is precisely how a 12pt name ended up beside a 28dp mark in
 *  the first place, and exactly what `GLYPH_ART_SIZE`'s own note says about
 *  splitting one number into two.
 *
 *  ⚠ SIZE AND WEIGHT ONLY. Every combat COLOUR is a tone and stays at its call
 *  site: this authority must never grow a `color`, or the chip vocabulary
 *  (strike / ready / needs-approach / defensive / unavailable) would start
 *  being decided by a typography table.
 */
export const GLYPH_NAME_TYPE = {
  fontSize: 15,
  fontWeight: '700',
  letterSpacing: 1,
} as const;
