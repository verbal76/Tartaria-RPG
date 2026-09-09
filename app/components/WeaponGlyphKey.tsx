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
// ⚠ OTA-1763 — the illustrated-icon TRIAL. Nothing else in the game reads this.
import { DAMAGE_ICON_IDS, DAMAGE_ICON_LABEL, damageIcon } from '../engine/damageIcons';
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

      <IconTrial />
    </View>
  );
}

/* ⚠⚠⚠ OTA-1763 — THE ILLUSTRATED-ICON TRIAL BLOCK. A LAB, NOT A MIGRATION.
 *
 * Owner: *"We are going to test the new illustrated icon library in ONE isolated
 * surface first... The immediate deliverable is the Lore cheat sheet displaying
 * them so I can LOOK AT THEM ON MY PHONE."*
 *
 * ⚠ EVERYTHING ABOVE THIS LINE IS UNTOUCHED. The text-glyph key still reads the
 * live `weaponGlyphs` tables the combat buttons paint from, and live combat,
 * InputBox, the weapon buttons, inventory and the engine are not modified at all.
 * This block is additive and deleting it removes the entire experiment.
 *
 * ⚠⚠ THREE SIZES IN ONE PASS, WHICH IS THE POINT. The owner asked for A/current,
 * B/+4 and C/+8 *"without requiring three unrelated redesigns of the screen"*.
 * So one row per concept, three boxes per row, sharing the label — the artwork is
 * the only thing that varies across a row, which is what makes it a comparison
 * rather than three screenshots of three layouts.
 *
 * ⚠⚠⚠ THE BASE SIZE IS NOT ASSUMED FROM THE 15pt TEXT GLYPH. The owner warned
 * against exactly that: *"Do not blindly assume that the old 15pt Text glyph
 * dimension translates directly into the correct Image dimension."* A 15pt glyph
 * sits in a 28pt-wide cell whose HEIGHT is the line box, not 28. So A is the
 * cell's measured WIDTH (28) as a square, which is the honest reading of "the
 * footprint the glyph currently occupies", and the render reports what each box
 * actually measures rather than what this file asked for. */
const TRIAL_SIZES = [
  { key: 'A', px: 28, note: 'current' },
  { key: 'B', px: 32, note: '+4' },
  { key: 'C', px: 36, note: '+8' },
] as const;

function IconTrial() {
  return (
    <View style={styles.trial}>
      <Text style={styles.sub} accessibilityRole="header">
        ⚠ ILLUSTRATED ICON TRIAL — PROVISIONAL
      </Text>
      <Text style={styles.trialHint}>
        Artwork under evaluation. Not wired into combat. The text glyphs above are
        still what the game paints. Three sizes per row: A {TRIAL_SIZES[0].px}dp ·
        B {TRIAL_SIZES[1].px}dp · C {TRIAL_SIZES[2].px}dp.
      </Text>
      <View style={styles.trialHead}>
        <Text style={styles.trialHeadName}> </Text>
        {TRIAL_SIZES.map((s) => (
          <Text key={s.key} style={[styles.trialHeadCell, { width: s.px }]}>{s.key}</Text>
        ))}
      </View>
      {DAMAGE_ICON_IDS.map((id) => {
        const src = damageIcon(id);
        if (src === undefined) return null;
        return (
          <View key={id} style={styles.trialRow} testID={`damage-icon-row-${id}`}>
            {/* ⚠ The label is PRESERVED beside the art, never replaced by it. */}
            <Text style={styles.trialName} numberOfLines={1}>{DAMAGE_ICON_LABEL[id]}</Text>
            {TRIAL_SIZES.map((s) => (
              <View key={s.key} style={[styles.trialCell, { width: s.px, height: s.px }]}>
                {/* ⚠⚠ NO `tintColor`. These are illustrated RGBA artwork, not
                    monochrome glyphs, and `contain` on a square box keeps the
                    1:1 source unstretched and uncropped. */}
                <Image
                  source={src}
                  style={{ width: s.px, height: s.px }}
                  resizeMode="contain"
                  accessibilityLabel={`${DAMAGE_ICON_LABEL[id]} icon, ${s.px} density pixels`}
                  testID={`damage-icon-${id}-${s.key}`}
                />
              </View>
            ))}
          </View>
        );
      })}
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
  /* ⚠⚠⚠ OTA-1763 — THE DARK CELL AND THE HALO CAME OFF HERE, AND ONLY HERE.
   * Owner: *"if we have these I don't think we need the black outline anymore"*
   * and, when asked which of the two surviving places that meant, *"not the ones
   * on the weapons during combat yet."* So: this key, not the buttons.
   *
   * ⚠⚠ AND THAT COSTS SOMETHING, WHICH IS WORTH KNOWING RATHER THAN DISCOVERING.
   * OTA-1568/1569 gave this cell the buttons' own dark inlay and black halo
   * precisely so the key would SHOW the player what a button looks like — the
   * file's header is on record that the key must not drift from the buttons.
   * While combat keeps its halo and this key does not, the key no longer mirrors
   * them exactly. That is a DELIBERATE, TEMPORARY state of a provisional
   * experiment, in the same way the trial artwork is not in combat either, and
   * it resolves whichever way the owner's call goes: combat loses its halo too,
   * or this one comes back. It is one line either way.
   *
   * ⚠ The 15pt and the width 28 STAY. Those are the measurements the trial's
   * A/B/C sizes are calibrated against, and moving them would silently change
   * what the comparison means. */
  cell: {
    width: 28,
    textAlign: 'center',
    fontSize: 15,
  },
  name: { color: '#cdbf99', fontSize: 11, letterSpacing: 1, width: 92 },
  meaning: { color: '#a2977b', fontSize: 11, flex: 1, lineHeight: 15 },
  star: { color: '#cdbf99', fontSize: 12, lineHeight: 18, marginBottom: 6 },
  // ── OTA-1763 trial block ──────────────────────────────────────────────────
  // ⚠ Its own rule above it so the experiment is visibly separate from the key.
  trial: { marginTop: 14, borderTopColor: '#3a342c', borderTopWidth: 1, paddingTop: 10 },
  trialHint: { color: '#a2977b', fontSize: 11, lineHeight: 16, marginBottom: 8 },
  trialHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  trialHeadName: { width: 92 },
  trialHeadCell: { color: '#a2977b', fontSize: 9, letterSpacing: 1, textAlign: 'center' },
  trialRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 3 },
  trialName: { color: '#cdbf99', fontSize: 11, letterSpacing: 1, width: 92 },
  /* ⚠⚠ THE DARK INLAY IS GONE, AND THAT IS THE OWNER'S CALL ON SEEING THE ART.
   * Owner: *"if we have these I don't think we need the black outline anymore.
   * I like how those render."*
   * The `#0d0b09` cell and the black halo exist because a TEXT GLYPH is a bare
   * shape in one colour and needs a ground to stay legible against whatever the
   * player has tuned the background to. Illustrated artwork brings its own
   * ground, so the inlay is doing nothing for seven of the nine — and for the
   * three that sit on transparency it was adding a black tile the artwork never
   * asked for. The box stays, because it is what keeps the three sizes aligned
   * in their columns; only the paint is removed.
   * ⚠ The text-glyph rows ABOVE still use `cell`, halo and all. Those are the
   * live combat vocabulary and are untouched. */
  trialCell: { alignItems: 'center', justifyContent: 'center' },
});
