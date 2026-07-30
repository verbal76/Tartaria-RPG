// OTA-1022 — THE ONE-TIME VETERAN MOTIVE PICKER. Saves that predate the
// story feature were DEALT a motive by backfill (a deterministic guess, never
// a choice). Owner: "let's do the one time motive picker" — on the first load
// after this OTA, such a character gets asked once, properly: five cards,
// the mud's guess marked, CONFIRM commits forever. There is no dismiss-
// without-answering: the ask is owed exactly once, so closing (Android back)
// confirms the current selection rather than wedging the save in limbo.
import React, { useState } from 'react';
import { Modal, View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { useGameStore } from '../state/gameStore';
import { getStoryMotives } from '../engine/story';

export function MotivePickerModal() {
  const pending = useGameStore((s) => s.motivePickerPending);
  const player = useGameStore((s) => s.player);
  const confirm = useGameStore((s) => s.confirmMotivePick);
  const dealt = player?.storyMotive;
  const [selected, setSelected] = useState<string | null>(null);

  if (!pending || !player) return null;
  const current = selected ?? dealt ?? 'debt';
  const commit = () => confirm(current);

  return (
    <Modal visible transparent animationType="fade" onRequestClose={commit}>
      <View style={styles.backdrop}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <Text style={styles.kicker}>YOUR STORY, YOUR REASON</Text>
          <Text style={styles.title} accessibilityRole="header">WHY DID YOU COME DOWN?</Text>
          <Text style={styles.sub}>
            Your walk below began before the buried country learned to ask. The mud made
            its guess — marked below. Keep it, or set the record straight. This is asked
            once, and never again.
          </Text>
          {getStoryMotives().map((m) => {
            const isSel = m.id === current;
            return (
              <Pressable
                key={m.id}
                onPress={() => setSelected(m.id)}
                style={[styles.card, isSel && styles.cardSel]}
                accessibilityRole="button"
                accessibilityLabel={`${m.title}. ${m.blurb}`}
              >
                <View style={styles.cardHead}>
                  <Text style={[styles.cardTitle, isSel && styles.cardTitleSel]}>{m.title.toUpperCase()}</Text>
                  {m.id === dealt && <Text style={styles.guessTag}>THE MUD'S GUESS</Text>}
                </View>
                <Text style={styles.cardBlurb}>{m.blurb}</Text>
              </Pressable>
            );
          })}
          <Pressable onPress={commit} style={styles.confirmBtn} accessibilityRole="button" accessibilityLabel="Confirm motive">
            <Text style={styles.confirmText}>THIS IS WHY I CAME DOWN</Text>
          </Pressable>
          <Text style={styles.hint}>You can read your opening any time: About → REPLAY OPENING.</Text>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(4, 6, 8, 0.97)',
    justifyContent: 'center',
  },
  scroll: { paddingHorizontal: 24, paddingVertical: 40 },
  kicker: { color: '#8aa0a4', fontSize: 11, letterSpacing: 5, fontWeight: '700', textAlign: 'center' },
  title: { color: '#d8cfc0', fontSize: 22, letterSpacing: 2, fontWeight: '800', textAlign: 'center', marginTop: 8 },
  sub: { color: '#a2977b', fontSize: 13, lineHeight: 20, textAlign: 'center', marginTop: 12, marginBottom: 18 },
  card: {
    borderColor: '#3a4448',
    borderWidth: 1,
    borderRadius: 4,
    padding: 14,
    marginBottom: 10,
    backgroundColor: 'rgba(20, 24, 26, 0.6)',
  },
  cardSel: { borderColor: '#c9a86a', backgroundColor: 'rgba(42, 31, 18, 0.75)' },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { color: '#8aa0a4', fontSize: 13, letterSpacing: 3, fontWeight: '700' },
  cardTitleSel: { color: '#c9a86a' },
  guessTag: { color: '#7c8f6a', fontSize: 9, letterSpacing: 2, fontWeight: '700' },
  cardBlurb: { color: '#c9bfa4', fontSize: 13, lineHeight: 19, marginTop: 6 },
  confirmBtn: {
    borderColor: '#c9a86a',
    borderWidth: 1,
    borderRadius: 4,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 10,
    backgroundColor: '#2a1f12',
  },
  confirmText: { color: '#c9a86a', fontSize: 13, letterSpacing: 2, fontWeight: '700' },
  hint: { color: '#5a6a6e', fontSize: 11, textAlign: 'center', marginTop: 14 },
});
