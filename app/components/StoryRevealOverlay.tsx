// OTA-1183 — THE STORY, WHOLE. The payoff a completed collectible set never had.
//
// ⚠ PUNCHLIST P1: finishing a 5–7 fragment character story used to flip a pill style and
// print a banner on a screen the player had to go looking for. 57 fragments — the largest
// gather loop in the game — ending in a line of text nobody was told about.
//
// Owner's call on what it should be (2026-08-09): *"they should end in story screen like
// the chapters screens that put the whole story together to read, and it should say
// whatever the collectable sets name is is complete."*
//
// So this is modelled on ChapterCardOverlay (OTA-1020) — same full-screen register, same
// dark ground, same tap-to-dismiss — with one deliberate difference: **the chapter card
// dismisses on a tap anywhere, and this does not.** A chapter card is a marker over
// narration already waiting underneath; this is the thing the player spent the whole loop
// earning, and dismissing several pages of it with a stray thumb while scrolling would be
// the loop ending in nothing all over again. Dismissal is an explicit button.
import React from 'react';
import { Modal, View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { useGameStore } from '../state/gameStore';
import { assembledStory } from '../engine/collectables';

import { tartariaKitStyles as kit } from '../ui/tartariaKit';
/* ⚠⚠⚠ PHASE 3 — THE PLANES ARE THE DEPTH; the kit style is only the material.
 * Each fragment below belongs to ONE physical family, and which one a control
 * gets is decided by its INTERACTION CONTRACT, never by what its style key is
 * called: CTL for a thing you strike, TAB for a thing you switch between, ROW
 * for a thing you select or open. A full-width list row wearing the command
 * key's sidewall is the same category error as a button with no depth at all.
 *
 * ⚠⚠ They are absolutely positioned, `pointerEvents="none"` children inside a
 * box the control already owns, so adopting them moves nothing by a pixel, and
 * any SEMANTIC colour the call site already carries layers on top and still
 * wins. Construction is what the object IS; state is what it is IN. */
const CTL_PLANES = (
  <>
    <View style={kit.controlPlaneTop} pointerEvents="none" />
    <View style={kit.controlPlaneBottom} pointerEvents="none" />
    <View style={kit.controlPlaneContact} pointerEvents="none" />
  </>
);

export function StoryRevealOverlay() {
  const reveal = useGameStore((s) => s.storyReveal);
  const dismiss = useGameStore((s) => s.dismissStoryReveal);
  const collectables = useGameStore((s) => s.player?.collectables);

  if (!reveal) return null;
  // ⚠ Re-derived at render from the player's OWN list, never carried in the reveal. A
  // reveal that survived a reload cannot show text that was not earned.
  const built = assembledStory(reveal.storyId, collectables ?? []);
  if (!built) return null;
  const { story, parts } = built;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={dismiss}>
      <View style={styles.backdrop}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollPad}
          showsVerticalScrollIndicator={true}
        >
          <Text style={styles.kicker}>COLLECTION COMPLETE</Text>
          {/* Owner: "it should say whatever the collectable sets name is is complete." */}
          <Text style={styles.title} accessibilityRole="header">
            {story.characterName}
          </Text>
          <Text style={styles.completeLine}>
            {story.characterName}&apos;s story is complete — {parts.length} of {story.fragments.length} fragments recovered.
          </Text>
          {story.characterBlurb ? (
            <Text style={styles.blurb}>{story.characterBlurb}</Text>
          ) : null}
          <View style={styles.rule} />

          {parts.map((f, i) => (
            <View key={f.id} style={styles.part}>
              {/* The fragment's own title and kind — a journal page and a letter should
                  not read as one undifferentiated wall. */}
              <Text style={styles.partKicker}>
                {String(f.kind ?? 'fragment').toUpperCase()} · {i + 1} of {parts.length}
              </Text>
              <Text style={styles.partTitle}>{f.title}</Text>
              <Text style={styles.body}>{f.body}</Text>
            </View>
          ))}

          <View style={styles.rule} />
          <Text style={styles.footer}>
            Kept on the Collectibles tab. You can read it again any time.
          </Text>

          <Pressable
            style={[kit.ctl, styles.btn]}
            onPress={dismiss}
            accessibilityRole="button"
            accessibilityLabel="Close the story"
          >
            <Text style={styles.btnText}>CLOSE</Text>
            {CTL_PLANES}
          </Pressable>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(4, 6, 8, 0.97)' },
  scroll: { flex: 1 },
  scrollPad: { paddingHorizontal: 26, paddingTop: 54, paddingBottom: 48 },
  kicker: {
    color: '#8aa0a4', fontSize: 11, letterSpacing: 6,
    fontWeight: '700', textAlign: 'center',
  },
  title: {
    color: '#d8cfc0', fontSize: 26, letterSpacing: 2,
    fontWeight: '700', textAlign: 'center', marginTop: 10,
  },
  completeLine: {
    color: '#cdbf99', fontSize: 13, textAlign: 'center',
    marginTop: 8, lineHeight: 19,
  },
  blurb: {
    color: '#8aa0a4', fontSize: 13, fontStyle: 'italic',
    textAlign: 'center', marginTop: 12, lineHeight: 20,
  },
  rule: {
    height: 1, backgroundColor: '#2b3236',
    marginVertical: 22, marginHorizontal: 8,
  },
  part: { marginBottom: 26 },
  partKicker: {
    color: '#6f8388', fontSize: 10, letterSpacing: 3,
    fontWeight: '700', marginBottom: 4,
  },
  partTitle: {
    color: '#cdbf99', fontSize: 15, fontWeight: '700',
    marginBottom: 8, lineHeight: 21,
  },
  // ⚠ Generous line height on purpose — these are multi-paragraph journal entries and
  // letters, not log lines. The whole point of the screen is that it is readable.
  body: { color: '#c6c2b8', fontSize: 14, lineHeight: 23 },
  footer: {
    color: '#6f8388', fontSize: 12, textAlign: 'center',
    fontStyle: 'italic', marginBottom: 22,
  },
  btn: {
    alignSelf: 'center', paddingVertical: 12, paddingHorizontal: 42,
    borderWidth: 1, borderColor: '#3a4348', backgroundColor: '#141a1d',
  },
  btnText: { color: '#cdbf99', fontSize: 13, letterSpacing: 3, fontWeight: '700' },
});
