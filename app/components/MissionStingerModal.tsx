// ⚠⚠⚠ OTA-1600 — THE STINGER: a text cutscene for the moment the mission's
// fight stands up.
//
// Owner: *"should the big boss of the mission have a line of dialogue on a pop
// up to pull your attention back into the mission. like the ambush could have
// had a pop up with the mission title up top and something like the ambush
// leader yells there he is, make short work of him or something? not a talk
// card, just a popup to focus your attention? a text cutscenes?"*
//
// His own log made the case for him: the raider pack and the Reaver's arrival
// were single lines scrolling past in combat noise, and he typed "still didn't
// progress" while standing in the middle of the mission's own fight.
//
// ⚠ NOT a talk card — no choices, no NPC memory, one button, then the fight.
// Raised from `pendingMissionStinger`, which the ONE writer (advanceHunt) sets
// only when bodies actually stood up; the authored line also lands in the log,
// so the record keeps what the popup said. No tips opt-out here: this is story
// content, not a tutorial — silencing tips must not silence the missions.
//
// House palette per OTA-1043: a popup off the MissionCompleteModal palette
// reads as a different game.
//
// ⚠⚠ OTA-1602 — THE BEAT CARD wears the same curtain. Owner: *"multistage
// missions like the market heists either need a cutscene pop-up like the
// fight announcements or a conversation card pop up in between stages to
// separate and progress the mission."* A stage that closes on its own tile
// has no travel leg, no arrival, no stinger — so the closing prose and the
// next objective come up on this card with a CONTINUE button instead of
// FIGHT (the `cta` prop), and the optional `next` line says where the story
// goes. Same component, same palette: one curtain for the missions.
import React from 'react';
import { Modal, View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { tControlDepth, tartariaKitStyles as kit } from '../ui/tartariaKit';

/* ⚠⚠ PHASE 3 — migrated off the deprecated control dialect. The control keeps
 * its handler, role, label and geometry; only the material changed, and the
 * press now collapses the sidewall instead of only shifting a colour. */
const ctlPlanes = (pressed: boolean) => (
  <>
    <View style={pressed ? kit.controlPlaneTopPressed : kit.controlPlaneTop} pointerEvents="none" />
    <View style={pressed ? kit.controlPlaneBottomPressed : kit.controlPlaneBottom} pointerEvents="none" />
    {pressed ? null : <View style={kit.controlPlaneContact} pointerEvents="none" />}
  </>
);

// ⚠⚠⚠ OTA-1622 — EVERY CLOSE COMES THROUGH HERE NOW, and the card carries what
// the close handed over (`granted`) above the next line. Owner: *"I spent so
// much time on that scaled never even knowing that I had it."*
export function MissionStingerModal({
  stinger, onClose, cta = 'FIGHT',
}: {
  stinger: { title: string; line: string; next?: string | null; granted?: string[] } | null;
  onClose: () => void;
  cta?: string;
}) {
  return (
    <Modal visible={!!stinger} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={kit.momentScrim} accessibilityViewIsModal={true}>
        <View style={styles.card}>
          <Text style={styles.kicker} accessibilityRole="header">
            {(stinger?.title ?? '').toUpperCase()}
          </Text>
          <View style={styles.rule} />
          {/* ⚠⚠⚠ OTA-1862 — THE SHOUT SCROLLS SO THE CTA CANNOT LEAVE. This card
              hangs straight off `momentScrim`, and until this pass gave it a
              ceiling of its own (see `styles.card`) nothing bounded it at all
              — not the card, not a body, and not the kit, whose new Family B
              ceiling this beat's governed exception keeps it away from. Its
              height was a pure function of content that is AUTHORED and VARIABLE:
              `line` is the beat's prose and `granted` is a list whose length comes
              from the stage's own receipts. A long shout with a handful of grants
              ran past the smallest supported viewport, centred, so both ends left
              the screen at once and the one way out went with the bottom.
              The shape is OTA-1614's, the one Family A has used since: the title
              and its rule pinned above, the CTA pinned below, and the middle — the
              part whose height comes from the beat — scrolls. A ScrollView sized by
              its content is invisible when there is room, so a short stinger reads
              exactly as it always has. */}
          <ScrollView style={styles.bodyWrap} contentContainerStyle={styles.bodyPad}>
            <Text style={styles.line}>{stinger?.line ?? ''}</Text>
            {stinger?.granted?.length
              ? stinger.granted.map((g) => <Text key={g} style={styles.granted}>✦ {g} — in your pack.</Text>)
              : null}
            {stinger?.next ? <Text style={styles.next}>{stinger.next}</Text> : null}
          </ScrollView>
          <Pressable
            style={({ pressed }) => [kit.ctl, styles.btn, tControlDepth(pressed)]}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={cta === 'FIGHT' ? 'Close and fight' : 'Continue the mission'}
          >
            {({ pressed }) => (<>
              <Text style={styles.btnText}>{cta}</Text>
              {ctlPlanes(pressed)}
            </>)}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  // ⚠⚠ OTA-1778 — `backdrop` moved to the kit (`momentScrim`). Zero pixels: this
  // file already centred and padded; what it loses is a private copy of values
  // the kit owns. The owner asked for momentScrim across ALL SIX beats, and
  // consistent outer geometry is not the same instruction as taking the card —
  // this modal stays experiential in its card treatment.
  /* ⚠⚠⚠ OTA-1862 — AND THE CEILING HAD TO BE WRITTEN HERE, BECAUSE THE RULING
   * KEPT THIS CARD PRIVATE. The kit's `momentCard` gained `maxHeight: '85%'` in
   * this same pass, and every other direct child of `momentScrim` inherits it
   * from there — but OTA-1777's governed exception says this beat *"remains
   * EXPERIENTIAL"* and keeps its own card, so the kit's ceiling does not reach
   * it. Taking `tMomentCard` to get the ceiling would buy safety by overturning
   * an owner ruling, which is the wrong trade; the ceiling is the SAFE OUTER
   * GEOMETRY that OTA-1778 already settled belongs to every beat, and the rim,
   * the ground and the air stay this card's own. So the one value is copied and
   * the exception survives intact. ⚠ It is also the value that makes the body's
   * `flexShrink` mean anything: with no cap on the card there is nothing for the
   * region to yield to, and a scroller that never shrinks never scrolls. */
  card: {
    width: '100%', maxWidth: 440, maxHeight: '85%', backgroundColor: '#17150f',
    borderWidth: 1, borderColor: '#c9a86a', borderRadius: 6, padding: 20,
  },
  /* ⚠⚠ OTA-1862 — the beat's own region: it yields to the card's 85% ceiling
   * (`flexShrink`) and stays content-sized when there is room (`flexGrow: 0`),
   * the same two words BrandedModal's `scrollArea` carries. No cap of its own —
   * the card's ceiling is the only limit this beat needs. */
  bodyWrap: { flexShrink: 1, flexGrow: 0 },
  bodyPad: { paddingBottom: 2 },
  kicker: { color: '#c9a86a', fontSize: 11, letterSpacing: 2 },
  rule: { height: 1, backgroundColor: '#6b5c3a', marginVertical: 14 },
  // The shout is the whole card — set large, with air, like a title card.
  line: { color: '#f0e6cc', fontSize: 18, lineHeight: 27 },
  // OTA-1602 — the "what's next" footnote under a beat, quieter than the prose.
  next: { color: '#c9a86a', fontSize: 13, lineHeight: 19, marginTop: 14 },
  // OTA-1622 — the receipt: what this close put in the pack.
  granted: { color: '#e6d7a8', fontSize: 14, lineHeight: 20, marginTop: 12 },
  btn: { alignSelf: 'flex-end', marginTop: 22, paddingVertical: 10, paddingHorizontal: 22 },
  btnPressed: { backgroundColor: '#1f1b12' },
  btnText: { color: '#c9a86a', fontSize: 12, letterSpacing: 1.5 },
});
