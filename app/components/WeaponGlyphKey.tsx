// ⚠⚠⚠ OTA-1638 — THE KEY IS ON THE ABOUT SCREEN.
//
// Owner: *"put this glyph key in the About screen and explain the discovery
// star"* — and, in the same breath, *"put the discovery star all the way to the
// right."* So this card is the one place the row grammar is written down for
// the player:
//
//     🔥☣ launcher ✦ ★
//     coats · name · the weapon's own damage · the discovery star
//
// ⚠ IT READS THE LIVE TABLES. Every glyph and every colour below comes from
// `weaponGlyphs.ts` — the same exports the combat buttons paint from — so the
// key cannot drift from the buttons. The only prose this file owns is the one-
// line meaning beside each type and the star's explanation, and a test pins
// that every type in the table has a meaning here.

import React from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
// ⚠⚠ OTA-1766 — the ONE art table, shared with the combat weapon buttons. The
// trial's `damageIcons` went with the trial; see `combatGlyphArt.ts` for why
// this file and `InputBox` deliberately read the same table.
import { glyphArt, DISCOVERY_STAR_ART, GLYPH_ART_SIZE, GLYPH_NAME_TYPE } from '../engine/combatGlyphArt';
import {
  BASE_DAMAGE_GLYPH, BASE_GLYPH_COLOR, COATING_GLYPH, COATING_GLYPH_COLOR,
} from '../engine/weaponGlyphs';
import { canonicalDamageType } from '../engine/damageTypes';
import { WEAPONS } from '../engine/crafting';

/** ⚠⚠⚠ OTA-1667 — THE KEY IS DERIVED FROM THE CATALOG NOW, NOT HAND-LISTED.
 *
 *  Owner: *"audit the glyphs list to see if all of those damage types exist in
 *  game."* They did not. Measured across all 301 catalog weapons, run through
 *  the SAME `baseDamageGlyph` path the buttons use:
 *
 *    ⚒ bludgeoning 65 · ▲ piercing 55 · ✦ aetheric 49 · ⚔ slashing 45
 *    🔥 burn 45 · ⚡ electrical 22 · ☠ poison 9 · ❄ cold 6 · ☢ radiation 5
 *    ⚙ degradation 0 · ✱ stun 0 · ⚗ acid 0 · ☣ corruption 0
 *
 *  FOUR OF THE THIRTEEN ROWS DESCRIBED DAMAGE NO WEAPON DEALS. And ⚙ was worse
 *  than merely empty: OTA-1652 aliased `degradation → acid`, and
 *  `baseDamageGlyph` canonicalises BEFORE the lookup — so even a weapon that
 *  authored degradation would print ⚗, never ⚙. That row could not appear on a
 *  button under any circumstances, and the key promised it anyway.
 *
 *  ⚠ ACID AND CORRUPTION ARE NOT MISSING FROM THE GAME — they are missing as a
 *  weapon's OWN damage. Both are real coating families with real vials, and the
 *  COATS section below lists them correctly. The defect was listing them a
 *  second time under "own damage", where nothing can carry them.
 *
 *  ⚠⚠ SO THE FIX IS A DERIVATION, NOT A SHORTER HARD-CODED LIST. A list I prune
 *  today goes stale the first time a weapon is authored with an acid base — the
 *  key would then hide a glyph the buttons paint, which is the same class of lie
 *  in the other direction. Reading the catalog means the key cannot be wrong in
 *  either direction, ever, without a test being the thing that fails. */
const KEY_PREFERENCE = [
  'bludgeoning', 'slashing', 'piercing', 'aetheric', 'radiation', 'stun',
  'burn', 'cold', 'poison', 'acid', 'corruption', 'degradation', 'electrical',
] as const;

/** Every base damage type the weapon catalog can actually put on a button,
 *  canonicalised exactly as `baseDamageGlyph` does, in KEY_PREFERENCE order
 *  (anything the catalog gains that this file has never heard of lands at the
 *  end rather than vanishing). */
export function baseTypesInPlay(): string[] {
  const seen = new Set<string>();
  for (const w of WEAPONS) {
    const c = canonicalDamageType((w as { damageType?: string }).damageType);
    // A type with no glyph paints nothing on the button, so it has no row here.
    if (c && BASE_DAMAGE_GLYPH[c]) seen.add(c);
  }
  const order = [...KEY_PREFERENCE] as string[];
  return [...seen].sort((a, b) => {
    const ia = order.indexOf(a); const ib = order.indexOf(b);
    return (ia < 0 ? order.length : ia) - (ib < 0 ? order.length : ib);
  });
}

export const BASE_TYPE_MEANING: Record<string, string> = {
  bludgeoning: 'blunt force — clubs, hammers, fists',
  slashing: 'edges — blades, claws',
  piercing: 'points — arrows, bolts, spears',
  aetheric: 'aether — rune-casters and relic weapons (force and psychic count as aetheric)',
  radiation: 'rad-burn from old cores',
  stun: 'concussion — stops the target',
  burn: 'fire',
  cold: 'frost (frost counts as cold)',
  poison: 'venom and toxins',
  // ⚠ Kept as meanings even though no weapon deals them as a BASE type today —
  // they are live coating families, and if a weapon is ever authored with one,
  // baseTypesInPlay() adds the row and it must already have words.
  acid: 'corrosion — eats metal and constructs',
  corruption: 'blight — rots the living',
  degradation: 'rust and rot (counts as acid)',
  electrical: 'lightning and shock',
};

export const COAT_KEY_ORDER = ['burn', 'cold', 'poison', 'acid', 'corruption', 'electrical'] as const;

export const COAT_MEANING: Record<string, string> = {
  burn: 'incendiary coat — burns for a few turns',
  cold: 'frost coat — chills and slows',
  poison: 'venom coat — poisons the living',
  acid: 'acid coat — corrodes metal and constructs',
  corruption: 'corruption coat — rots the living',
  electrical: 'charged coat — shocks',
};

/** The star, explained once, in the words the buttons live by. */
export const STAR_EXPLAINED: readonly string[] = [
  'The ★ sits all the way to the right. It appears when something this weapon delivers — a coat, or its own base type — is a weakness of the enemy in front of you that you have actually discovered.',
  'Discovered means one of three things: a boss shows its weaknesses on its card; a character with Wisdom 12 or more reads any enemy on sight; everyone else learns a weakness by hitting the thing, and the game remembers it for that kind of enemy.',
  'No star means "not known to bite", never "known not to bite". The button reads the same verdict as the enemy card, so it can never tell you more than the card does.',
];

/** ⚠ OTA-1766 — THE ROW GRAMMAR AS A STRING. The card no longer RENDERS this —
 *  it draws the example from the same artwork a button paints — but the string
 *  stays: it is the grammar in one line for a screen reader, for prose, and for
 *  the tests that pin the order. The characters in it are the ones the fallback
 *  path still uses. */
export const GLYPH_KEY_EXAMPLE = '🔥☣ launcher ✦ ★';

/* \u26a0\u26a0\u26a0 OTA-1766 \u2014 THE ARTWORK IS THE GLYPH NOW, AND THE TEXT GLYPH IS THE
 * FALLBACK RATHER THAN THE DELETED THING.
 *
 * Owner: *"The new images should replace the actual old glyphs in the real Lore
 * legend."* So `type` resolves art through the one shared table and the row
 * paints an `<Image>` where it painted a character.
 *
 * \u26a0 THE CHARACTER PATH STAYS FOR THE TWO TYPES THE PACK DOES NOT DRAW. The
 * approved set covers eleven of `BASE_DAMAGE_GLYPH`'s thirteen; `degradation`
 * and `stun` have no image. Neither can reach a weapon button today (OTA-1667
 * measured zero of each across all 301 catalog weapons, and `degradation`
 * canonicalises to `acid` before any lookup) \u2014 but this key is DERIVED from the
 * catalog precisely so it cannot lie in either direction, and a type that gains
 * a weapon tomorrow must show something rather than an empty box.
 *
 * \u26a0 THE LABEL AND THE MEANING ARE UNTOUCHED. The picture supplements the word;
 * it never replaces it. Same rule the trial ran under.
 * \u26a0 NO TINT. `contain` on a square box against a 1:1 source, so nothing is
 * stretched or cropped. The per-kind `color` still reaches the fallback
 * character, which is the only thing it can colour. */
function KeyRow({ glyph, color, name, meaning, type }: {
  glyph: string; color: string; name: string; meaning: string; type: string;
}) {
  const art = glyphArt(type);
  return (
    <View style={styles.row} accessible accessibilityLabel={`${name}: ${meaning}`}>
      {art !== undefined ? (
        <Image
          source={art}
          style={styles.artCell}
          resizeMode="contain"
          testID={`glyph-art-${type}`}
        />
      ) : (
        <Text style={[styles.cell, { color }]} testID={`glyph-text-${type}`}>{`\u200a${glyph}\u200a`}</Text>
      )}
      <Text style={styles.name}>{name.toUpperCase()}</Text>
      <Text style={styles.meaning}>{meaning}</Text>
    </View>
  );
}

export function WeaponGlyphKey() {
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title} accessibilityRole="header">WEAPON GLYPHS</Text>
      </View>
      <Text style={styles.hint}>
        Every weapon button in a fight reads the same way, left to right: the coats on it, its name,
        its own damage type, and the discovery star.
      </Text>
      {/* ⚠⚠⚠ OTA-1766 — THE EXAMPLE IS BUILT FROM THE SAME ARTWORK THE BUTTON
          PAINTS, RATHER THAN FROM A STRING OF THE OLD CHARACTERS.
          This file's header is on record that the key must not drift from the
          buttons — it exists to SHOW the player what one looks like. Leaving
          `🔥☣ LAUNCHER ✦ ★` here would have shipped a legend illustrating a
          button that no longer exists, one line above a table of the artwork
          that replaced it. It is drawn at the COMBAT size, because a button is
          what it is a picture of. */}
      <View style={styles.example}>
        <Image source={glyphArt('burn')} style={styles.exampleMark} resizeMode="contain" />
        <Image source={glyphArt('corruption')} style={styles.exampleMark} resizeMode="contain" />
        <Text style={styles.exampleText}>LAUNCHER</Text>
        <Image source={glyphArt('aetheric')} style={[styles.exampleMark, styles.exampleBase]} resizeMode="contain" />
        <Image source={DISCOVERY_STAR_ART} style={[styles.exampleMark, styles.exampleStar]} resizeMode="contain" />
      </View>
      <Text style={styles.exampleHint}>coats · name · own damage · star</Text>

      <Text style={styles.sub} accessibilityRole="header">OWN DAMAGE — after the name</Text>
      {baseTypesInPlay().map((k) => (
        <KeyRow
          key={k}
          type={k}
          glyph={BASE_DAMAGE_GLYPH[k] ?? '?'}
          color={BASE_GLYPH_COLOR[k] ?? '#ffffff'}
          name={k}
          meaning={BASE_TYPE_MEANING[k] ?? ''}
        />
      ))}

      <Text style={styles.sub} accessibilityRole="header">COATS — on the left, in the order applied</Text>
      {COAT_KEY_ORDER.map((k) => (
        <KeyRow
          key={k}
          /* ⚠⚠ THE SAME `type` KEY AS THE BASE ROWS ABOVE, WHICH IS THE WHOLE
           * POINT. Owner: *"Burn, Cold, Poison, and Electrical use the same
           * image whether they appear as base damage or a coat."* Because both
           * sections resolve art by canonical damage type, that is not a rule
           * this file enforces — it is a rule it cannot break. */
          type={k}
          glyph={COATING_GLYPH[k]}
          color={COATING_GLYPH_COLOR[k]}
          name={k}
          meaning={COAT_MEANING[k] ?? ''}
        />
      ))}

      <Text style={styles.sub} accessibilityRole="header">THE DISCOVERY STAR, LAST</Text>
      {/* ⚠ OTA-1766 — the star gets a row of its own so the player sees the
          artwork they will meet on the button, not a character standing in for
          it. It is a VERDICT, not a damage family, so it is deliberately not in
          the damage table and does not sit in either section above. */}
      <View style={styles.row} accessible accessibilityLabel="The discovery star">
        <Image
          source={DISCOVERY_STAR_ART}
          style={styles.artCell}
          resizeMode="contain"
          testID="glyph-art-discovery-star"
        />
        <Text style={styles.name}>DISCOVERY</Text>
        <Text style={styles.meaning}>a weakness you have found</Text>
      </View>
      {STAR_EXPLAINED.map((line, i) => (
        <Text key={i} style={styles.star}>{line}</Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderColor: '#3a342c',
    borderWidth: 1,
    borderRadius: 3,
    padding: 10,
    marginTop: 14,
    marginBottom: 14,
    backgroundColor: '#1a1714',
  },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  title: { color: '#c9a86a', fontSize: 12, fontWeight: '800', letterSpacing: 3 },
  hint: { color: '#cdbf99', fontSize: 12, lineHeight: 18 },
  /* ⚠ OTA-1766 — a ROW now, because the example is made of boxes and text the
   * way a real button is. It keeps its dark inlay: this one IS a picture of a
   * button, and the button has a fill of its own. */
  example: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    paddingVertical: 8,
    backgroundColor: '#0d0b09',
    borderRadius: 3,
  },
  /* ⚠ OTA-1781 — THE PAIRING COMES FROM THE AUTHORITY NOW. These three values
   * were typed here first and the live weapon button never got them; both read
   * `GLYPH_NAME_TYPE` so the picture of the button and the button cannot drift
   * apart again. Colour and margin stay local — they are this row's, not the
   * control family's. */
  exampleText: { color: '#e6dcc3', ...GLYPH_NAME_TYPE, marginLeft: 4 },
  /* ⚠ COMBAT size, not Lore's — this is a picture of a weapon button. */
  exampleMark: { width: GLYPH_ART_SIZE.combat, height: GLYPH_ART_SIZE.combat, marginRight: 3 },
  exampleBase: { marginLeft: 7 },
  exampleStar: { marginLeft: 5, marginRight: 0 },
  exampleHint: { color: '#a2977b', fontSize: 10, letterSpacing: 2, textAlign: 'center', marginTop: 4, marginBottom: 6 },
  sub: { color: '#c9a86a', fontSize: 10, fontWeight: '700', letterSpacing: 2, marginTop: 12, marginBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 3 },
  /* ⚠⚠⚠ OTA-1766 — THE ARTWORK CELL. THE FOOTPRINT THE CHARACTER HELD.
   *
   * `GLYPH_ART_SIZE.lore` is 28 — the `width: 28` the text glyph's cell has had
   * since OTA-1568, which is the established footprint and the one the pack's
   * own notes say to try first. A square, because the source is 1:1; `contain`
   * on the Image means the artwork is never stretched or cropped inside it.
   *
   * ⚠⚠ NO GROUND BEHIND IT, AND THAT IS THE OWNER'S STANDING CALL CARRIED
   * FORWARD. On seeing the trial render: *"if we have these I don't think we
   * need the black outline anymore."* The dark inlay and the black halo exist
   * because a TEXT glyph is a bare single-colour shape that needs a ground to
   * stay legible against a player-tuned background. Illustrated artwork brings
   * its own ground, so both are gone from this cell. */
  artCell: { width: GLYPH_ART_SIZE.lore, height: GLYPH_ART_SIZE.lore },
  /* ⚠ THE CHARACTER CELL SURVIVES FOR `degradation` AND `stun`, the two types
   * the approved pack does not draw. Same 28-wide footprint so a fallback row
   * lines up with the artwork rows above and below it. It keeps its 15pt; it no
   * longer keeps the dark inlay, which came off in OTA-1763 and stays off. */
  cell: {
    width: 28,
    textAlign: 'center',
    fontSize: 15,
  },
  name: { color: '#cdbf99', fontSize: 11, letterSpacing: 1, width: 92 },
  meaning: { color: '#a2977b', fontSize: 11, flex: 1, lineHeight: 15 },
  star: { color: '#cdbf99', fontSize: 12, lineHeight: 18, marginBottom: 6 },
});
