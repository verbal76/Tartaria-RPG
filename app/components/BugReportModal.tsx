// OTA-063 — Bug-report modal for the TitleScreen. Lets the player
// pick the character the bug happened on (or "General — no
// character"), type a description, and submit. The actual send
// (clipboard staging + mailto open) lives on the TitleScreen side
// so this component stays presentation-only and easy to test.
import React, { useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  TextInput,
  TouchableWithoutFeedback,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import type { SlotSummary } from '../engine/saveSystem';

interface Props {
  visible: boolean;
  slots: SlotSummary[];
  onCancel: () => void;
  /** Called when the player taps SEND. slot is null when the
   *  player chose "General — no character". */
  onSend: (args: { slot: SlotSummary | null; description: string }) => void;
}

export function BugReportModal({ visible, slots, onCancel, onSend }: Props) {
  // 'general' sentinel for the "no character" option. Real slot IDs
  // are slot_{base36}, so no collision risk.
  const [selectedId, setSelectedId] = useState<string | 'general'>('general');
  const [description, setDescription] = useState('');

  // Reset state every time the modal opens — bug reports should
  // start fresh, not carry over a half-typed description from a
  // previous open.
  useEffect(() => {
    if (visible) {
      setSelectedId('general');
      setDescription('');
    }
  }, [visible]);

  const canSend = description.trim().length > 0;

  const handleSend = (): void => {
    if (!canSend) return;
    const slot = selectedId === 'general'
      ? null
      : slots.find((s) => s.slotId === selectedId) ?? null;
    onSend({ slot, description: description.trim() });
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
      statusBarTranslucent
    >
      <TouchableWithoutFeedback onPress={onCancel}>
        <View style={styles.scrim} accessibilityViewIsModal={true}>
          <TouchableWithoutFeedback>
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
              style={styles.cardWrap}
            >
              <View style={styles.card}>
                <View style={styles.headerRow}>
                  <Text style={styles.title} accessibilityRole="header">REPORT A BUG</Text>
                  <View style={styles.ruleLine} />
                </View>

                <Text style={styles.body}>
                  Pick the character the bug happened on, then describe
                  what went wrong. Your description, device info, and
                  the most recent log entries (newest first) will be
                  copied to your clipboard — paste them into the email
                  body before sending.
                </Text>

                <Text style={styles.sectionLabel}>CHARACTER</Text>
                <ScrollView
                  style={styles.slotList}
                  contentContainerStyle={styles.slotListContent}
                  showsVerticalScrollIndicator
                >
                  <SlotRow
                    label="General — no character"
                    sub="Title-screen / startup / setup issues"
                    selected={selectedId === 'general'}
                    onPress={() => setSelectedId('general')}
                  />
                  {slots.map((s) => (
                    <SlotRow
                      key={s.slotId}
                      label={`${s.playerName}${s.dead ? ' (fallen)' : ''}`}
                      sub={`HP ${s.hp}/${s.hpMax} · saved ${formatAgo(s.savedAt)}`}
                      selected={selectedId === s.slotId}
                      onPress={() => setSelectedId(s.slotId)}
                    />
                  ))}
                  {slots.length === 0 && (
                    <Text style={styles.emptyHint}>
                      (no characters yet — only General is available)
                    </Text>
                  )}
                </ScrollView>

                <Text style={styles.sectionLabel}>DESCRIBE THE ISSUE</Text>
                <TextInput
                  style={styles.input}
                  multiline
                  numberOfLines={4}
                  placeholder="What did you expect? What actually happened? Any reproduction steps?"
                  placeholderTextColor="#46555a"
                  value={description}
                  onChangeText={setDescription}
                  textAlignVertical="top"
                />

                <View style={styles.buttonRow}>
                  <Pressable
                    style={({ pressed }) => [
                      styles.btn,
                      styles.btnNeutral,
                      pressed && styles.btnPressed,
                    ]}
                    onPress={onCancel}
                    accessibilityRole="button"
                  >
                    <Text style={[styles.btnText, styles.btnTextNeutral]}>CANCEL</Text>
                  </Pressable>
                  <Pressable
                    style={({ pressed }) => [
                      styles.btn,
                      canSend ? styles.btnPrimary : styles.btnDisabled,
                      pressed && styles.btnPressed,
                    ]}
                    onPress={handleSend}
                    disabled={!canSend}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: !canSend }}
                  >
                    <Text
                      style={[
                        styles.btnText,
                        canSend ? styles.btnTextPrimary : styles.btnTextDisabled,
                      ]}
                    >
                      SEND
                    </Text>
                  </Pressable>
                </View>
              </View>
            </KeyboardAvoidingView>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

function SlotRow({
  label,
  sub,
  selected,
  onPress,
}: {
  label: string;
  sub: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={({ pressed }) => [
        styles.slotRow,
        selected && styles.slotRowSelected,
        pressed && styles.slotRowPressed,
      ]}
    >
      <View style={styles.radio}>
        {selected && <View style={styles.radioDot} />}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.slotLabel, selected && styles.slotLabelSelected]}>
          {label}
        </Text>
        <Text style={styles.slotSub}>{sub}</Text>
      </View>
    </Pressable>
  );
}

function formatAgo(ts: number): string {
  const delta = Date.now() - ts;
  if (delta < 60_000) return 'just now';
  if (delta < 3_600_000) return `${Math.round(delta / 60_000)}m ago`;
  if (delta < 86_400_000) return `${Math.round(delta / 3_600_000)}h ago`;
  return `${Math.round(delta / 86_400_000)}d ago`;
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  cardWrap: { width: '100%', maxWidth: 420, maxHeight: '90%' },
  card: {
    backgroundColor: '#0e1618',
    borderColor: '#6ab0c9',
    borderWidth: 1,
    borderRadius: 4,
    padding: 14,
  },
  headerRow: { marginBottom: 10 },
  title: {
    color: '#6ab0c9',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 4,
  },
  ruleLine: { height: 1, backgroundColor: '#2b3a3e', marginTop: 6 },
  body: { color: '#bcd2db', fontSize: 12, lineHeight: 17, marginBottom: 12 },
  sectionLabel: {
    color: '#6c8088',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 2,
    marginTop: 4,
    marginBottom: 6,
  },
  slotList: {
    maxHeight: 180,
    borderColor: '#2b3a3e',
    borderWidth: 1,
    borderRadius: 3,
    backgroundColor: '#131c1f',
  },
  slotListContent: { padding: 4 },
  slotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderRadius: 3,
    gap: 10,
  },
  slotRowSelected: { backgroundColor: '#2a2520' },
  slotRowPressed: { opacity: 0.7 },
  radio: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#6ab0c9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#6ab0c9',
  },
  slotLabel: { color: '#bcd2db', fontSize: 13 },
  slotLabelSelected: { color: '#d6e4e8', fontWeight: '700' },
  slotSub: { color: '#6c8088', fontSize: 10, marginTop: 1 },
  emptyHint: { color: '#6c8088', fontSize: 11, padding: 10, fontStyle: 'italic' },
  input: {
    backgroundColor: '#131c1f',
    borderColor: '#2b3a3e',
    borderWidth: 1,
    borderRadius: 3,
    padding: 10,
    color: '#d6e4e8',
    fontSize: 13,
    minHeight: 80,
    marginBottom: 10,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  btn: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 3,
    borderWidth: 1,
    alignItems: 'center',
  },
  btnPressed: { opacity: 0.7 },
  btnPrimary: { backgroundColor: '#6ab0c9', borderColor: '#6ab0c9' },
  btnDisabled: { backgroundColor: 'transparent', borderColor: '#2b3a3e' },
  btnNeutral: { backgroundColor: 'transparent', borderColor: '#2b3a3e' },
  btnText: { fontSize: 12, fontWeight: '700', letterSpacing: 2 },
  btnTextPrimary: { color: '#0e1618' },
  btnTextDisabled: { color: '#46555a' },
  btnTextNeutral: { color: '#bcd2db' },
});
