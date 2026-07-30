// OTA-1027 — GOLEM NAMING POPUP. Same treatment as the dog onboarding: the
// old flow captured the NEXT TYPED INPUT as the golem's name (or "skip"),
// which read as just another feed line and could swallow a combat command.
// Raised whenever pendingGolemNaming is set and a golem stands; a flag left
// over from a golem that died/dismissed before naming self-clears.
import React, { useEffect, useState } from 'react';
import { Modal, View, Text, TextInput, Pressable, StyleSheet, ScrollView } from 'react-native';
import { useGameStore } from '../state/gameStore';

export function GolemNamingModal() {
  const pending = useGameStore((s) => s.pendingGolemNaming);
  const golem = useGameStore((s) => s.player?.golem);
  const confirm = useGameStore((s) => s.confirmGolemName);
  const [name, setName] = useState('');

  // Heal a stale flag: golem vanished (dismissed / died) before naming.
  useEffect(() => {
    if (pending && !golem) confirm(null);
  }, [pending, golem, confirm]);

  if (!pending || !golem) return null;
  const seal = () => {
    if (!name.trim()) return;
    confirm(name);
    setName('');
  };
  const keep = () => {
    confirm(null);
    setName('');
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={keep}>
      <View style={styles.backdrop}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <Text style={styles.kicker}>THE CONSTRUCT WAKES</Text>
          <Text style={styles.title} accessibilityRole="header">NAME YOUR GOLEM</Text>
          <Text style={styles.sub}>
            You gave it life. It answers to its making — {golem.name} — until you seal
            something better into the Aetherstone.
          </Text>

          <View style={styles.card}>
            <Text style={styles.fieldLabel}>A NAME, IF YOU HAVE ONE</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder={golem.name}
              placeholderTextColor="#5a6a6e"
              maxLength={16}
              accessibilityLabel="Golem name"
            />
          </View>

          <Pressable
            onPress={seal}
            style={[styles.confirmBtn, !name.trim() && styles.confirmBtnDisabled]}
            disabled={!name.trim()}
            accessibilityRole="button"
            accessibilityLabel="Seal the name"
          >
            <Text style={[styles.confirmText, !name.trim() && styles.confirmTextDisabled]}>SEAL THE NAME</Text>
          </Pressable>
          <Pressable onPress={keep} style={styles.keepBtn} accessibilityRole="button" accessibilityLabel="Keep its making">
            <Text style={styles.keepText}>KEEP ITS MAKING</Text>
          </Pressable>
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
  fieldLabel: { color: '#8aa0a4', fontSize: 11, letterSpacing: 3, fontWeight: '700', marginBottom: 6 },
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
  keepBtn: {
    borderColor: '#3a4448',
    borderWidth: 1,
    borderRadius: 4,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 10,
    backgroundColor: 'rgba(20, 24, 26, 0.6)',
  },
  keepText: { color: '#8aa0a4', fontSize: 12, letterSpacing: 2, fontWeight: '700' },
});
