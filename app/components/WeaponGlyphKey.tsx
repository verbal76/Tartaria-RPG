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
import { View, Text, StyleSheet } from 'react-native';
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

export const GLYPH_KEY_EXAMPLE = '🔥☣ launcher ✦ ★';

function KeyRow({ glyph, color, name, meaning }: { glyph: string; color: string; name: string; meaning: string }) {
  return (
    <View style={styles.row} accessible accessibilityLabel={`${glyph} ${name}: ${meaning}`}>
      <Text style={[styles.cell, { color }]}>{`\u200a${glyph}\u200a`}</Text>
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
      <Text style={styles.example}>{GLYPH_KEY_EXAMPLE.toUpperCase()}</Text>
      <Text style={styles.exampleHint}>coats · name · own damage · star</Text>

      <Text style={styles.sub} accessibilityRole="header">OWN DAMAGE — after the name</Text>
      {baseTypesInPlay().map((k) => (
        <KeyRow
          key={k}
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
          glyph={COATING_GLYPH[k]}
          color={COATING_GLYPH_COLOR[k]}
          name={k}
          meaning={COAT_MEANING[k] ?? ''}
        />
      ))}

      <Text style={styles.sub} accessibilityRole="header">★ — the discovery star, last</Text>
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
  example: {
    color: '#e6dcc3',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 1,
    textAlign: 'center',
    marginTop: 10,
    paddingVertical: 8,
    backgroundColor: '#0d0b09',
    borderRadius: 3,
  },
  exampleHint: { color: '#a2977b', fontSize: 10, letterSpacing: 2, textAlign: 'center', marginTop: 4, marginBottom: 6 },
  sub: { color: '#c9a86a', fontSize: 10, fontWeight: '700', letterSpacing: 2, marginTop: 12, marginBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 3 },
  // The same dark cell and halo the buttons paint the glyph on (OTA-1568/1569).
  cell: {
    width: 28,
    textAlign: 'center',
    fontSize: 15,
    backgroundColor: '#0d0b09',
    borderRadius: 3,
    textShadowColor: '#000000',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 3,
  },
  name: { color: '#cdbf99', fontSize: 11, letterSpacing: 1, width: 92 },
  meaning: { color: '#a2977b', fontSize: 11, flex: 1, lineHeight: 15 },
  star: { color: '#cdbf99', fontSize: 12, lineHeight: 18, marginBottom: 6 },
});
