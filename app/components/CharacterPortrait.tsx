// ⚠⚠ OTA-1434 — WHO YOU ARE, AT THE TOP OF THE SHEET.
//
// Owner: *"when you hit your character portrait and it goes into your full
// breakdown of your character at the very top should be the portrait of your
// character with their faction icon shrunken down and put in the top left corner
// as an overlay."*
//
// Two pieces of art the game already has, in one banner: the race portrait as
// the plate, the faction emblem small in the top-left. Both are looked up by the
// ids on the player record, so this component never learns a race or faction
// name and a tenth of either needs no edit here.
//
// ⚠ AND THE THIRD CHOICE, TOP RIGHT. Owner: *"on the top right there should be a
// stylized text ... telling you what path you chose as your reason for being
// there."* Character creation asks three questions — WHAT you are, WHO took you
// in, and WHY you came down — and until now the sheet showed the first two and
// dropped the third. So the banner carries all three: race as the plate, faction
// as the emblem, motive as the mark opposite it.
//
// ⚠ AND IT IS THE TITLE ALONE. The first draft set it under a "WHY YOU CAME
// DOWN" eyebrow and a rule; the owner cut both — *"the stylized writing should
// just be the two words like 'The Exile'."* He is right, and the reason is worth
// keeping: a label explains, and this does not need explaining. Two words in
// gold in the corner of your own portrait read as a title the character CARRIES.
// The same two words under a caption read as a form field. The explanation was
// costing the thing it explained.
//
// ⚠ THE HEIGHT IS MEASURED FROM THE IMAGE, NOT GUESSED. The seven portraits do
// not share an aspect — 0.667 twice, 0.800 twice, 0.847, 0.866, and aetherborn
// alone at 1.250 LANDSCAPE. A fixed band would letterbox some and crop others,
// and the crop is the dangerous half: these are two-figure compositions with the
// heads in the upper third, so a centred cover-crop decapitates them. So the
// band takes its height from `Image.resolveAssetSource`, which reports the real
// pixel size of a static require, and only falls back to a cap when the picture
// is taller than the screen can spare.
//
// ⚠ AND IT IS `contain`, NEVER `cover`. When the aspect fits under the cap the
// two are identical anyway; when it does not, `contain` letterboxes against a
// dark plate (invisible) where `cover` would cut faces off. The moment the
// portraits are ever regenerated to one shared aspect, this fits them exactly
// with no change here.

import React from 'react';
import { View, Image, Text, StyleSheet, useWindowDimensions } from 'react-native';
import { racePortrait } from '../engine/racePortraits';
import { factionCrest } from '../engine/factionCrests';
import { motiveById, assignMotive } from '../engine/story';

/** Fraction of screen height the banner may take before it is capped. A sheet
 *  is for reading numbers; the portrait sets the scene and then gets out of the
 *  way, so it never owns more than this much of the first screenful. */
const MAX_SCREEN_FRACTION = 0.42;

/** The faction emblem's size in the corner. Large enough to recognise the
 *  device, small enough that it reads as a mark ON the portrait rather than a
 *  second picture beside it. */
const CREST_SIZE = 76;

export function CharacterPortrait({
  raceId,
  factionId,
  raceName,
  factionName,
  motiveId,
  characterName,
}: {
  raceId: string | null | undefined;
  factionId: string | null | undefined;
  raceName?: string;
  factionName?: string;
  /** The story motive id. May be absent on saves predating OTA-1018. */
  motiveId?: string | null;
  /** Only used to derive a motive when the save has none — same seed the rest
   *  of the story layer uses, so the sheet cannot disagree with the crawl. */
  characterName?: string;
}) {
  const { width, height } = useWindowDimensions();
  const portrait = racePortrait(raceId);
  const crest = factionCrest(factionId);

  // ⚠ No portrait, no banner — and no empty box where one would have been. A
  // race added without art must leave the sheet looking deliberate rather than
  // broken.
  if (!portrait) return null;

  // ⚠ A SAVE MAY HAVE NO MOTIVE — the field postdates OTA-1018, and older
  // characters were dealt one deterministically by `assignMotive` rather than
  // stored. Deriving it the same way here means the banner shows the SAME motive
  // the opening crawl and the story drip already use for that character, instead
  // of inventing a second answer to the same question.
  const motive = motiveById(motiveId ?? (characterName ? assignMotive(characterName) : undefined));

  // The image's REAL size. resolveAssetSource returns null in some environments
  // (and under jest's asset mock), so the fallback is the cap rather than a
  // crash or a zero-height view.
  const meta = Image.resolveAssetSource(portrait) as { width?: number; height?: number } | null;
  const aspect = meta?.width && meta?.height ? meta.width / meta.height : undefined;
  const cap = height * MAX_SCREEN_FRACTION;
  const bandH = aspect ? Math.min(width / aspect, cap) : cap;

  return (
    <View
      style={[styles.band, { height: bandH }]}
      accessible
      accessibilityRole="image"
      accessibilityLabel={[
        raceName ?? 'Your character',
        factionName ? `of the ${factionName}` : '',
        motive ? `came down for ${motive.title}` : '',
      ].filter(Boolean).join(', ')}
    >
      <Image source={portrait} style={styles.portrait} resizeMode="contain" />
      {crest ? (
        // ⚠ The emblem sits on its own dim plate. The crests are cut-outs with
        // real alpha, so on a light patch of a portrait — a lantern, a pale sky —
        // fine gold filigree would otherwise disappear into it.
        <View style={styles.crestPlate} pointerEvents="none">
          <Image source={crest} style={styles.crest} resizeMode="contain" />
        </View>
      ) : null}
      {/* ⚠ The motive, opposite the emblem — the title and nothing else. Its own
          dim plate for the same reason the crest has one: fine gold type over a
          lantern or a pale sky would otherwise vanish into the painting. */}
      {motive ? (
        <View style={styles.motivePlate} pointerEvents="none">
          <Text style={styles.motiveTitle} numberOfLines={1}>{motive.title}</Text>
        </View>
      ) : null}
      {/* A faint floor to the band so the sheet's first card does not appear to
          float off the bottom edge of the picture. */}
      <View style={styles.floor} pointerEvents="none" />
      {raceName ? (
        <Text style={styles.caption} numberOfLines={1}>
          {raceName.toUpperCase()}
          {factionName ? `  ·  ${factionName.toUpperCase()}` : ''}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  band: {
    width: '100%',
    backgroundColor: '#0d0b09',
    borderBottomWidth: 1,
    borderBottomColor: '#3a3128',
    overflow: 'hidden',
    justifyContent: 'center',
  },
  portrait: { width: '100%', height: '100%' },
  crestPlate: {
    position: 'absolute',
    top: 8,
    left: 8,
    width: CREST_SIZE + 10,
    height: CREST_SIZE + 10,
    borderRadius: 6,
    backgroundColor: 'rgba(8,7,6,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  crest: { width: CREST_SIZE, height: CREST_SIZE },
  motivePlate: {
    position: 'absolute',
    top: 8,
    right: 8,
    maxWidth: '52%',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 6,
    backgroundColor: 'rgba(8,7,6,0.55)',
    alignItems: 'flex-end',
  },
  // ⚠ Two words, and they have to carry the corner on their own now that the
  // label is gone — so a size up, wide tracking, and the title as AUTHORED
  // ("The Exile", not "THE EXILE"). Shouting it would turn a title back into a
  // label, which is the thing that was just removed.
  motiveTitle: {
    color: '#e2cf9c',
    fontSize: 18,
    letterSpacing: 2.5,
    textAlign: 'right',
  },
  floor: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 44,
    backgroundColor: 'rgba(13,11,9,0.55)',
  },
  caption: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 10,
    color: '#c9b98d',
    fontSize: 11,
    letterSpacing: 2,
    textAlign: 'center',
  },
});
