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
                  style={[styles.signCard, isSel && styles.signCardSel]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSel }}
                  accessibilityLabel={sx === 'male' ? 'Male' : 'Female'}
                >
                  <Text style={[styles.signGlyph, isSel && styles.signGlyphSel]}>
                    {sx === 'male' ? '♂' : '♀'}
                  </Text>
                  <Text style={[styles.signWord, isSel && styles.signWordSel]}>
                    {sx === 'male' ? 'MALE' : 'FEMALE'}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Pressable
            onPress={() => { if (selected) confirm(selected); }}
            disabled={!selected}
            style={[styles.confirmBtn, !selected && styles.confirmBtnDead]}
            accessibilityRole="button"
            accessibilityState={{ disabled: !selected }}
            accessibilityLabel="Confirm"
          >
            <Text style={styles.confirmText}>SO MARK THE RECORD</Text>
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
  kicker: { color: '#8aa0a4', fontSize: 11, letterSpacing: 5, fontWeight: '700', textAlign: 'center' },
  title: { color: '#d8cfc0', fontSize: 22, letterSpacing: 2, fontWeight: '800', textAlign: 'center', marginTop: 8 },
  sub: { color: '#a2977b', fontSize: 13, lineHeight: 20, textAlign: 'center', marginTop: 12, marginBottom: 18 },
  row: { flexDirection: 'row', gap: 10 },
  signCard: {
    flex: 1,
    borderColor: '#3a4448',
    borderWidth: 1,
    borderRadius: 4,
    paddingVertical: 22,
    alignItems: 'center',
    backgroundColor: 'rgba(20, 24, 26, 0.6)',
  },
  signCardSel: { borderColor: '#c9a86a', backgroundColor: 'rgba(42, 31, 18, 0.75)' },
  signGlyph: { color: '#8aa0a4', fontSize: 52, lineHeight: 56 },
  signGlyphSel: { color: '#c9a86a' },
  signWord: { color: '#8aa0a4', fontSize: 13, letterSpacing: 3, fontWeight: '700', marginTop: 6 },
  signWordSel: { color: '#c9a86a' },
  confirmBtn: {
    borderColor: '#c9a86a',
    borderWidth: 1,
    borderRadius: 4,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 14,
    backgroundColor: '#2a1f12',
  },
  confirmBtnDead: { opacity: 0.35 },
  confirmText: { color: '#c9a86a', fontSize: 13, letterSpacing: 2, fontWeight: '700' },
  hint: { color: '#5a6a6e', fontSize: 11, textAlign: 'center', marginTop: 14 },
});
