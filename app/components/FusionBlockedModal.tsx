// OTA — the Crucible says no, out loud. Owner: "if you don't have enough to
// fuse, don't let it have you still go through the menu? I honestly thought I
// was fusing all those things. have a pop-up letting you know you no longer
// have enough materials to make an item and then have the whole fuse crucible
// thing close — but let that pop up hang for a second so you get a chance to
// read it."
//
// ROOT CAUSE this replaces: OTA-801 made a FAILED gate open the picker anyway
// ("OPEN THE PICKER instead of dead-ending on a refusal line ... rather than
// tapping FUSE again and again into the same arbiter refusal"). That was a
// band-aid over refusal spam, and it traded a visible annoyance for an
// invisible one — a menu the player cannot act in, with NO log line at all. A
// device session showed three `fuse` commands producing exactly one log line
// each (the player's own echo) and ten minutes of a dead button. The picker now
// opens ONLY when a fusion is actually possible; when it isn't, this modal says
// precisely what is short and the Crucible closes.
//
// It HOLDS until dismissed (that was the ask) with a generous auto-close as a
// safety so it can never trap the screen.
import React, { useEffect } from 'react';
import { Modal, View, Text, Pressable, StyleSheet, TouchableWithoutFeedback } from 'react-native';
import { tartariaKitStyles as kit } from '../ui/tartariaKit';

/* ⚠⚠ PHASE 3 — migrated off the deprecated control dialect (a 1dp literal-gold
 * or cold-grey outline with no face, side or contact). The control is now the
 * one Tartaria physical control; its handler, role, label and geometry are
 * unchanged. */
/** ⚠⚠⚠ OTA-1806 — THE PLANES ARE A FUNCTION OF THE FINGER NOW.
 *  Pressed, the sidewall collapses and crosses to the TOP, the light catches
 *  BELOW the face, and the contact band is not drawn — a key pushed home is not
 *  standing on anything. Frozen at their resting heights, as these were, a key
 *  could travel 3dp and never lose height, which is most of a depression. */
const ctlPlanes = (pressed: boolean) => (
  <>
    <View style={pressed ? kit.controlPlaneTopPressed : kit.controlPlaneTop} pointerEvents="none" />
    <View style={pressed ? kit.controlPlaneBottomPressed : kit.controlPlaneBottom} pointerEvents="none" />
    {pressed ? null : <View style={kit.controlPlaneContact} pointerEvents="none" />}
  </>
);
/** The resting planes, for a surface that has no press to report. */
const CTL_PLANES = ctlPlanes(false);
import { useGameStore } from '../state/gameStore';

/** Safety net only — the player is expected to tap. Long enough to read two
 *  lines of copy without hurrying. */
const AUTO_CLOSE_MS = 9000;

export function FusionBlockedModal() {
  const notice = useGameStore((s) => s.fusionBlockedNotice);
  const clear = useGameStore((s) => s.clearFusionBlockedNotice);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => clear(), AUTO_CLOSE_MS);
    return () => clearTimeout(t);
  }, [notice, clear]);

  if (!notice) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={clear}>
      <TouchableWithoutFeedback onPress={clear} accessible={false}>
        <View style={styles.backdrop}>
          <TouchableWithoutFeedback onPress={() => {}} accessible={false}>
            <View
              style={styles.card}
              accessibilityRole="alert"
              accessibilityLabel={`${notice.title}. ${notice.body}`}
            >
              <Text style={styles.title}>{notice.title}</Text>
              <Text style={styles.body}>{notice.body}</Text>
              {!!notice.hint && <Text style={styles.hint}>{notice.hint}</Text>}
              <Pressable
                onPress={clear}
                style={({ pressed }) => [kit.ctl, styles.btn, pressed && kit.controlPressed]}
                accessibilityRole="button"
                accessibilityLabel="Close the Crucible"
              >
{({ pressed }) => (<>
                <Text style={styles.btnText}>UNDERSTOOD</Text>
                {ctlPlanes(pressed)}
              </>)}
</Pressable>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#17150f',
    borderWidth: 1,
    borderColor: '#6b5c3a',
    borderRadius: 6,
    padding: 20,
  },
  title: {
    color: '#e0c179',
    fontSize: 13,
    letterSpacing: 1.5,
    marginBottom: 12,
    textTransform: 'uppercase',
  },
  body: { color: '#cdbf99', fontSize: 14, lineHeight: 21 },
  hint: { color: '#a2977b', fontSize: 12, lineHeight: 18, marginTop: 10, fontStyle: 'italic' },
  btn: { marginTop: 20, alignSelf: 'flex-end', paddingVertical: 10, paddingHorizontal: 18 },
  btnText: { color: '#e0c179', fontSize: 12, letterSpacing: 1.5 },
});
