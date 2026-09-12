/* ⚠⚠⚠ THE PLAYER'S FACTION, EMBEDDED IN THE PANEL BEHIND THE TRANSCRIPT.
 *
 * Owner: *"barely see it, but have it noticeable in the text box."* The intent
 * is an insignia discovered rather than announced — large, centred, faint, and
 * personal to the active character.
 *
 * ⚠⚠ IT IS PART OF THE HUD, NOT PART OF THE TRANSCRIPT, and that distinction
 * decides the whole implementation. An emblem printed onto the log would scroll
 * away with the lines it sat under and would grow the scroll extent; an emblem
 * belonging to the PANEL stays put while text moves over it. So this is an
 * absolutely positioned sibling of the feed, inside the panel's own box: it
 * takes part in no layout, adds no content height, and the transcript's own
 * ScrollView is untouched.
 *
 * ⚠ AND IT NEVER TAKES A TOUCH. `pointerEvents="none"` on the layer, because it
 * covers a scrolling surface and the feed's own action chips. An overlay that
 * swallowed a tap would break the scroll and the chip silently — the worst kind
 * of decorative change. The suite asserts it and a negative control proves the
 * assertion bites.
 *
 * ⚠ SAFE WHEN A FACTION HAS NO ART. `crestArt`/`factionCrest` return undefined
 * rather than a fallback, and this renders nothing at all — no substitute
 * emblem, no broken image, and the panel is unaffected. That is the required
 * degradation, not an edge case to be tidied away later.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { Image, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { factionCrest, crestArt } from '../engine/factionCrests';
import { containCrestField } from '../ui/crestField';

/** ⚠ VERY FAINT, AND DELIBERATELY THE CONSERVATIVE END OF THE RANGE. The
 *  combat text must stay unquestionably dominant, so this starts low: visible
 *  against the dark panel when you look for it, gone when you are reading. It
 *  is a single named number rather than an inline literal so a device review
 *  can move it in one place.
 *
 *  ⚠⚠ VISUAL LANGUAGE PHASE 1 — 0.055 → 0.10, AND THIS IS THAT DEVICE REVIEW
 *  DOING EXACTLY WHAT THE NUMBER WAS NAMED FOR. Owner, on the physical build:
 *  the sigil was *"effectively invisible."* 0.055 was a guess made without a
 *  phone in hand and it guessed low; this is the same claim at a strength that
 *  can actually be recognised. It is still under a tenth, still an insignia
 *  DISCOVERED rather than announced, and the transcript is still unquestionably
 *  the dominant thing in the panel. Nothing else about the layer moves: same
 *  containment, same inset, same absolute placement, same silence.
 *
 *  ⚠ WHETHER 0.10 IS RIGHT IS NOT A QUESTION A TEST CAN ANSWER. The suite bounds
 *  it (above zero, below 0.12) because a bound is a real claim; where inside
 *  that band it belongs is the owner's eye on the device. */
export const WATERMARK_OPACITY = 0.10;

/** ⚠ Breathing room so the sigil never touches the frame — the owner asked for
 *  it explicitly, and it is a FRACTION of the measured panel rather than a dp
 *  constant, so it means the same thing on any phone. */
export const WATERMARK_INSET = 0.08;

export function FactionWatermark({ factionId, testID = 'faction-watermark' }: {
  /** ⚠ THE PLAYER'S OWN `factionId`, passed from the store by the screen. This
   *  component does not reach for a faction itself, and must not: the authority
   *  is `PlayerCharacter.factionId` and a second reader is a second answer. */
  factionId: string | null | undefined;
  testID?: string;
}) {
  const [box, setBox] = useState<{ width: number; height: number } | null>(null);

  /* ⚠ ONE MEASUREMENT, AND IT ONLY SETTLES WHEN THE PANEL ACTUALLY CHANGES.
   * The transcript re-renders on every log line; this must not. Comparing
   * before setting keeps a combat round from re-laying-out the emblem. */
  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setBox((prev) => (
      prev && Math.abs(prev.width - width) < 0.5 && Math.abs(prev.height - height) < 0.5
        ? prev
        : { width, height }
    ));
  }, []);

  /* ⚠ THE ASSET AND THE ARITHMETIC ARE BOTH MEMOISED ON THEIR REAL INPUTS —
   * the faction and the measured box — so a log line costs nothing here. The
   * `require`d asset is a module-level number in the registry; resolving it per
   * render would be the "repeatedly resolve assets during every log-line
   * render" the owner ruled out. */
  const art = useMemo(() => crestArt(factionId), [factionId]);
  const source = useMemo(() => factionCrest(factionId), [factionId]);
  const place = useMemo(
    () => (box && art ? containCrestField(box, art, WATERMARK_INSET) : null),
    [box, art],
  );

  // No faction, no art for it, or a panel not yet measured: draw nothing.
  if (!source || !art) return null;

  return (
    <View style={styles.layer} pointerEvents="none" onLayout={onLayout} testID={`${testID}-layer`}>
      {place ? (
        <Image
          source={source}
          testID={testID}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          /* ⚠ `contain` because the nine crests are NOT square and carry no
           *  margin — the registry's own note. Letting the aspect fall out of
           *  the file is the registry's standing instruction to every consumer. */
          resizeMode="contain"
          style={[styles.mark, place]}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  /** Fills the panel it is dropped into, participates in nothing. */
  layer: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  mark: { position: 'absolute', opacity: WATERMARK_OPACITY },
});
