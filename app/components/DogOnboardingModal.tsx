// OTA-1050 — DOG ONBOARDING POPUP. A playtester at the rescue moment typed
// "rest", thought the naming beat was another fight, and the old in-feed
// takeover silently stored "rest" as the breed. The three asks (breed, name,
// sex) now land together on one blocking card in the house style — answers
// you can see and change before committing. Raised whenever
// worldMemory.pendingDogOnboarding is non-null, so a save wedged partway
// through the old typed flow heals here too (its part-answers pre-fill).
// No dismiss-without-answering: the dog is already rescued; it needs a name.
import React, { useState } from 'react';
import { Modal, View, Text, TextInput, Pressable, StyleSheet, ScrollView } from 'react-native';
import { useGameStore } from '../state/gameStore';
import { defaultDogName } from '../engine/dogCompanion';

export function DogOnboardingModal() {
  const pending = useGameStore((s) => s.worldMemory.pendingDogOnboarding);
  const player = useGameStore((s) => s.player);
  const confirm = useGameStore((s) => s.confirmDogOnboarding);
  // null = untouched (falls back to any part-answer a wedged save carried).
  const [breed, setBreed] = useState<string | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [sex, setSex] = useState<'boy' | 'girl' | null>(null);

  if (!pending || !player) return null;
  const breedVal = breed ?? pending.breed ?? '';
  const nameVal = name ?? pending.name ?? '';
  const commit = () => {
    if (!sex) return;
    confirm(breedVal, nameVal, sex);
    // Reset local state so the NEXT dog (a fresh save) starts blank.
    setBreed(null);
    setName(null);
    setSex(null);
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={commit}>
      <View style={styles.backdrop}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <Text style={styles.kicker}>THE RESCUE IS DONE</Text>
          <Text style={styles.title} accessibilityRole="header">THE DOG IS YOURS</Text>
          <Text style={styles.sub}>
            The Arbiter waits with the ledger open. Three answers and the road is open.
          </Text>

          <View style={styles.card}>
            <Text style={styles.fieldLabel}>WHAT KIND OF DOG IS IT?</Text>
            <TextInput
              style={styles.input}
              value={breedVal}
              onChangeText={setBreed}
              placeholder="mutt, pitbull, shepherd…"
              placeholderTextColor="#5a6a6e"
              maxLength={24}
              accessibilityLabel="Dog breed"
            />

            <Text style={styles.fieldLabel}>WHAT WILL YOU NAME THEM?</Text>
            <View style={styles.nameRow}>
              <TextInput
                style={[styles.input, styles.nameInput]}
                value={nameVal}
                onChangeText={setName}
                placeholder="a name for the road"
                placeholderTextColor="#5a6a6e"
                maxLength={16}
                accessibilityLabel="Dog name"
              />
              <Pressable
                onPress={() => setName(defaultDogName())}
                style={styles.rollBtn}
                accessibilityRole="button"
                accessibilityLabel="Roll a name"
              >
                <Text style={styles.rollText}>⚄ ROLL</Text>
              </Pressable>
            </View>

            <Text style={styles.fieldLabel}>BOY OR GIRL?</Text>
            <View style={styles.pillRow}>
              {(['boy', 'girl'] as const).map((s) => (
                <Pressable
                  key={s}
                  onPress={() => setSex(s)}
                  style={[styles.pill, sex === s && styles.pillSel]}
                  accessibilityRole="button"
                  accessibilityLabel={s === 'boy' ? 'Boy' : 'Girl'}
                >
                  <Text style={[styles.pillText, sex === s && styles.pillTextSel]}>{s.toUpperCase()}</Text>
                </Pressable>
              ))}
            </View>
          </View>

          <Pressable
            onPress={commit}
            style={[styles.confirmBtn, !sex && styles.confirmBtnDisabled]}
            disabled={!sex}
            accessibilityRole="button"
            accessibilityLabel="Take them with you"
          >
            <Text style={[styles.confirmText, !sex && styles.confirmTextDisabled]}>TAKE THEM WITH YOU</Text>
          </Pressable>
          <Text style={styles.hint}>
            A blank breed or name is fine — the mud fills in. Boy or girl needs an answer.
          </Text>
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
    backgroundColor: 'rgba(20, 24, 26, 0.6)',
  },
  fieldLabel: { color: '#8aa0a4', fontSize: 11, letterSpacing: 3, fontWeight: '700', marginTop: 12, marginBottom: 6 },
  input: {
    borderColor: '#3a4448',
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: '#e6d8b3',
    fontSize: 15,
    backgroundColor: 'rgba(10, 13, 15, 0.8)',
  },
  nameRow: { flexDirection: 'row', gap: 8 },
  nameInput: { flex: 1 },
  rollBtn: {
    borderColor: '#3a4448',
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 12,
    justifyContent: 'center',
    backgroundColor: 'rgba(20, 24, 26, 0.6)',
  },
  rollText: { color: '#8aa0a4', fontSize: 12, letterSpacing: 1, fontWeight: '700' },
  pillRow: { flexDirection: 'row', gap: 10 },
  pill: {
    flex: 1,
    borderColor: '#3a4448',
    borderWidth: 1,
    borderRadius: 4,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: 'rgba(20, 24, 26, 0.6)',
  },
  pillSel: { borderColor: '#c9a86a', backgroundColor: 'rgba(42, 31, 18, 0.75)' },
  pillText: { color: '#8aa0a4', fontSize: 13, letterSpacing: 3, fontWeight: '700' },
  pillTextSel: { color: '#c9a86a' },
  confirmBtn: {
    borderColor: '#c9a86a',
    borderWidth: 1,
    borderRadius: 4,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 14,
    backgroundColor: '#2a1f12',
  },
  confirmBtnDisabled: { borderColor: '#3a4448', backgroundColor: 'rgba(20, 24, 26, 0.6)' },
  confirmText: { color: '#c9a86a', fontSize: 13, letterSpacing: 2, fontWeight: '700' },
  confirmTextDisabled: { color: '#5a6a6e' },
  hint: { color: '#5a6a6e', fontSize: 11, textAlign: 'center', marginTop: 14 },
});
