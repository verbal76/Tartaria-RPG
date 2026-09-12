// ⚠ OTA-1444 — THE ONE-TIME VETERAN ♂/♀ ASK. Saves that predate the OTA-1439
// creation pick have no recorded sex, so the portrait banner (OTA-1443) shows
// no sign for them. Owner: *"I don't want any character no matter where they
// are in their journey ... whether they haven't touched it in 2 months or they
// played yesterday ... to all be able to see all of the new character build
// portraits"* — so the record is completed the same way OTA-1022 completed the
// motive: asked once, properly, in the Arbiter's voice.
//
// ⚠ IT LIVES ON THE CHARACTER SHEET, not the load path — the owner's trigger:
// *"soon as they open their character ... there should be a real quick
// follow-up question."* The sheet is where the incomplete banner would be
// seen, so the ask arrives exactly where the gap would show.
//
// ⚠ UNLIKE THE MOTIVE PICKER THERE IS NO GUESS TO KEEP. The mud could deal a
// motive; it must not deal a sex — wrong half the time by construction. So
// nothing is preselected, CONFIRM stays dead until a sign is chosen (the same
// rule the creation screen enforces on its NEXT), and backing out (Android
// back) simply postpones: the ask returns next time the sheet opens, because
// the missing datum — not a transient flag — is what raises it.
import React, { useState } from 'react';
import { Modal, View, Text, Pressable, StyleSheet } from 'react-native';
import { useGameStore } from '../state/gameStore';
import { T, tartariaKitStyles as kit } from '../ui/tartariaKit';

/* ⚠⚠⚠ PHASE 3 — THIS DIALOG WAS THE CLEAREST SPECIMEN OF THE DEPRECATED
 * CONTROL DIALECT, and the owner ruled the whole family dead. What shipped
 * here: MALE was a cold blue-grey outlined tile, FEMALE-selected became a
 * filled brown-gold slab, and SO MARK THE RECORD was a third treatment again —
 * three different species of object in one 80-line dialog, none of them the
 * Tartaria control. Physical construction and semantic state were conflated.
 *
 * ⚠⚠ NOW ALL THREE ARE ONE OBJECT. `kit.ctl` supplies the face, rim and
 * directional pair; the three planes give the face a side and a contact
 * shadow; `kit.ctlOn` marks the chosen one with gold on its left and right
 * WITHOUT taking away its construction. Unselected and selected are the same
 * key — one of them is marked.
 *
 * ⚠ BEHAVIOUR IS UNTOUCHED: the same handlers, the same `disabled` on an
 * unmade choice, the same roles, labels and `accessibilityState`, the same
 * postpone-on-back. Only the material changed. */
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

export function SexPickerModal() {
  const player = useGameStore((s) => s.player);
  const confirm = useGameStore((s) => s.confirmSexPick);
  const [selected, setSelected] = useState<'male' | 'female' | null>(null);
  const [dismissed, setDismissed] = useState(false);

  // The data is the flag: a character with a recorded sex is never asked.
  if (!player || player.sex || dismissed) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => setDismissed(true)}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.kicker}>THE LEDGER GREW A LINE</Text>
          <Text style={styles.title} accessibilityRole="header">MALE OR FEMALE?</Text>
          <Text style={styles.sub}>
            The Arbiter turns back to an old page. &ldquo;You came down before the record
            asked this of anyone. It asks now: when the buried country speaks to you
            before it has learned your name — is it sir, or miss?&rdquo;
          </Text>
          <View style={styles.row}>
            {(['male', 'female'] as const).map((sx) => {
              const isSel = selected === sx;
              return (
                <Pressable
                  key={sx}
                  onPress={() => setSelected(sx)}
                  style={({ pressed }) => [kit.ctl, styles.signCard, isSel && kit.ctlOn, pressed && kit.controlPressed]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSel }}
                  accessibilityLabel={sx === 'male' ? 'Male' : 'Female'}
                >
{({ pressed }) => (<>
                  <Text style={[styles.signGlyph, isSel && styles.signGlyphSel]}>
                    {sx === 'male' ? '♂' : '♀'}
                  </Text>
                  <Text style={[styles.signWord, isSel && styles.signWordSel]}>
                    {sx === 'male' ? 'MALE' : 'FEMALE'}
                  </Text>
                  {ctlPlanes(pressed)}
                </>)}
</Pressable>
              );
            })}
          </View>
          <Pressable
            onPress={() => { if (selected) confirm(selected); }}
            disabled={!selected}
            style={({ pressed }) => [kit.ctl, styles.confirmBtn, kit.ctlOn, !selected && kit.ctlDead, pressed && kit.controlPressed]}
            accessibilityRole="button"
            accessibilityState={{ disabled: !selected }}
            accessibilityLabel="Confirm"
          >
{({ pressed }) => (<>
            <Text style={styles.confirmText}>SO MARK THE RECORD</Text>
            {ctlPlanes(pressed)}
          </>)}
</Pressable>
          <Text style={styles.hint}>Asked once, kept forever. It changes how strangers address you — nothing else.</Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(4, 6, 8, 0.97)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  card: { paddingVertical: 20 },
  // ⚠ PHASE 3 — the cold blue-grey text belonged to the deprecated dialect and
  // is what made this dialog read as a different game. The words now take the
  // kit's own ink, exactly as every other Tartaria surface does.
  kicker: { color: T.inkDim, fontSize: 11, letterSpacing: 5, fontWeight: '700', textAlign: 'center' },
  title: { color: T.ink, fontSize: 22, letterSpacing: 2, fontWeight: '800', textAlign: 'center', marginTop: 8 },
  sub: { color: T.inkDim, fontSize: 13, lineHeight: 20, textAlign: 'center', marginTop: 12, marginBottom: 18 },
  row: { flexDirection: 'row', gap: 10 },
  /* ⚠⚠ GEOMETRY ONLY. The face, the rim, the radius and the directional pair
   * all come from `kit.ctl`; `kit.ctlOn` marks the chosen sign. Nothing here
   * moves a box, so the dialog's layout is byte-identical to what shipped. */
  signCard: { flex: 1, paddingVertical: 22, alignItems: 'center' },
  signGlyph: { color: T.inkDim, fontSize: 52, lineHeight: 56 },
  signGlyphSel: { color: T.gold },
  signWord: { color: T.inkDim, fontSize: 13, letterSpacing: 3, fontWeight: '700', marginTop: 6 },
  signWordSel: { color: T.gold },
  confirmBtn: { paddingVertical: 14, alignItems: 'center', marginTop: 14 },
  confirmText: { color: T.gold, fontSize: 13, letterSpacing: 2, fontWeight: '700' },
  hint: { color: T.inkQuiet, fontSize: 11, textAlign: 'center', marginTop: 14 },
});
