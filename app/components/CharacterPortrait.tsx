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
// ⚠ AND IT IS THE TITLE ALONE, ON NOTHING. The first draft set it under a "WHY
// YOU CAME DOWN" eyebrow and a rule, on a dim plate; the owner cut all of it —
// *"the stylized writing should just be the two words like 'The Exile'"*, then
// *"the title for the reason should have 0 background, and the text needs to be
// more stylized."* He is right twice over: a label explains, and this does not
// need explaining; and a plate makes a mark sit ON the picture rather than IN
// it. Two words in gold on the painting itself read as a title the character
// CARRIES. The same two words boxed and captioned read as a form field.
//
// ⚠ WHICH MOVES THE LEGIBILITY JOB FROM THE PLATE ONTO THE GLYPHS. With nothing
// behind it, gold type has to survive a lantern, a pale sky and a wet stone
// floor. So: the house gold (#e8c766, the same one ChapterCardOverlay's titles
// use), a serif face, wide tracking, and a hard dark shadow doing the work the
// plate used to. The same reasoning removes the emblem's plate — the crests are
// alpha cut-outs with their own heavy dark masses, so they hold themselves.
//
// ⚠⚠ AND THE SAME RULE THEN APPLIED TO THE BOTTOM CAPTION. Owner: *"both words
// on the bottom where it shows the race and faction ... should also have no
// shading behind them and be in the same text as the text for the reason you
// went down there."* So the floor scrim came off too, and both marks now draw
// from ONE shared type object (`MARK_TYPE`) rather than two style blocks that
// happen to agree today. "The same text as" is a requirement about the future as
// much as the present: two blocks with matching values are one careless edit
// away from disagreeing, and nothing would fail when they did.
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
import { View, Image, Text, StyleSheet, Platform, useWindowDimensions } from 'react-native';
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

/** ⚠⚠ THE BANNER'S ONE TYPEFACE, shared by both marks by COMPOSITION rather than
 *  by two style blocks that happen to match. The owner asked for the bottom
 *  caption to be "in the same text as" the motive title; spreading one object
 *  into both is what keeps that true after the next edit to either.
 *
 *  ⚠ The shadow is the load-bearing part. Nothing sits behind either mark any
 *  more, so gold type has to hold against whatever the painting puts under it —
 *  a lit lantern, a pale sky, a wet stone floor. Colour is the house gold, the
 *  same one ChapterCardOverlay's titles use. */
const MARK_TYPE = {
  color: '#e8c766',
  fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  fontStyle: 'italic' as const,
  textShadowColor: 'rgba(0,0,0,0.95)',
  textShadowOffset: { width: 0, height: 1 },
  textShadowRadius: 7,
};

export function CharacterPortrait({
  raceId,
  factionId,
  raceName,
  factionName,
  motiveId,
  characterName,
  sex,
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
  /** ⚠ OTA-1441 — the ♂/♀ mark the owner asked for over the player image:
   *  *"it didn't put the male or female symbol on the character image."* Rides
   *  the caption in the banner's one type. Absent on saves predating the pick
   *  (OTA-1439 made sex optional) — then nothing shows, which is correct: the
   *  game never asked that character. */
  sex?: 'male' | 'female' | null;
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
        // ⚠ NO PLATE BEHIND IT. The emblem is an alpha cut-out and sits directly
        // on the painting, which is what makes it read as a mark ON the
        // character rather than a badge stuck over them.
        <Image source={crest} style={styles.crest} resizeMode="contain" />
      ) : null}
      {/* ⚠ The motive, opposite the emblem — the title, on nothing. Its shadow
          is what keeps it legible over an unpredictable painting; a plate would
          make it a badge instead of a mark. */}
      {motive ? (
        <Text style={styles.motiveTitle} numberOfLines={1}>
          {motive.title}
        </Text>
      ) : null}
      {/* ⚠ The race and faction, on nothing, in the motive's own type. Two lines
          allowed rather than one: the longest real pairing ("Architectural
          Sentinels · Conspiracy Architects") will not fit a phone's width at this
          size, and wrapping reads better than an ellipsis eating half a faction's
          name. */}
      {raceName ? (
        <Text style={styles.caption} numberOfLines={2}>
          {sex === 'male' ? '♂  ' : sex === 'female' ? '♀  ' : ''}
          {raceName}
          {factionName ? `  ·  ${factionName}` : ''}
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
  crest: {
    position: 'absolute',
    top: 10,
    left: 10,
    width: CREST_SIZE,
    height: CREST_SIZE,
  },
  // ⚠ Two words, on nothing, carrying the corner by themselves. Title AS
  // AUTHORED ("The Exile", not "THE EXILE") — shouting it would turn a title
  // back into the label that was cut.
  motiveTitle: {
    ...MARK_TYPE,
    position: 'absolute',
    top: 12,
    right: 12,
    maxWidth: '56%',
    textAlign: 'right',
    fontSize: 21,
    letterSpacing: 2,
  },
  // ⚠ Same type as the motive, smaller. The size is the ONLY difference, and it
  // has to be one: this line carries two full names where the motive carries two
  // words, and at 21px the longest pairing does not fit any phone.
  caption: {
    ...MARK_TYPE,
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 10,
    fontSize: 16,
    letterSpacing: 1.2,
    textAlign: 'center',
  },
});
