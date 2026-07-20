import React, { useState, useEffect, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  TouchableWithoutFeedback,
  Pressable,
  Keyboard,
  KeyboardAvoidingView,
} from 'react-native';

interface Props {
  visible: boolean;
  /** Vendor name in the scene, if any — the header names who you're lifting
   *  from. */
  vendorName?: string;
  /** The vendor's offer item names, surfaced as green chips — tap one to
   *  attempt to lift THAT item. */
  vendorOffers?: string[];
  /** Ambient / NPC nouns you can pickpocket when there's no vendor (opportunistic
   *  sleight-of-hand grabs). */
  npcHints?: string[];
  /** The player picks a mark/item (or types one) and the engine runs the
   *  Stealth check. Success → it's yours, quiet and clean. Failure → if your
   *  Stealth is high you withdraw unseen; if it's low against a vendor, you're
   *  caught and the fight is real. */
  onSubmit: (target: string) => void;
  onCancel: () => void;
}

// OTA-847 (STEALTH SYSTEM) — PICKPOCKET modal. Replaces the old out-of-combat
// APPROACH picker (whose walk-up-to-a-noun job is retired). Same UI shape as
// ApproachModal so it feels consistent, minus the stealth toggle — pickpocket
// IS the stealth action, so there's nothing to toggle. Rolls Stealth vs the
// mark's awareness.
export function PickpocketModal({
  visible,
  vendorName,
  vendorOffers,
  npcHints,
  onSubmit,
  onCancel,
}: Props) {
  const [text, setText] = useState('');
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (visible) setText('');
    return undefined;
  }, [visible]);

  const handleSubmit = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    Keyboard.dismiss();
    onSubmit(trimmed);
  };

  const tapTarget = (target: string) => {
    Keyboard.dismiss();
    onSubmit(target);
  };

  const offers = vendorOffers ?? [];
  const npcs = npcHints ?? [];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
      statusBarTranslucent
    >
      <TouchableWithoutFeedback onPress={onCancel} accessibilityRole="button" accessibilityLabel="Close">
        <KeyboardAvoidingView style={styles.scrim} behavior="padding" accessibilityViewIsModal={true}>
          <TouchableWithoutFeedback>
            <View style={styles.card}>
              <Text style={styles.title} accessibilityRole="header">PICKPOCKET</Text>
              <View style={styles.rule} />
              <Text style={styles.body}>
                {vendorName
                  ? `Lift something off ${vendorName} without them noticing. Rolls STEALTH — a clean hand takes it quiet; a clumsy one gets caught, and the steel comes out.`
                  : 'Palm something off a mark or out of the open without being seen. Rolls STEALTH.'}
              </Text>

              <TextInput
                ref={inputRef}
                style={styles.input}
                value={text}
                onChangeText={setText}
                placeholder='e.g. "the coin pouch", "the amulet"'
                placeholderTextColor="#c9a86a"
                onSubmitEditing={handleSubmit}
                returnKeyType="go"
                autoCorrect={false}
                autoCapitalize="none"
              />

              {offers.length > 0 && (
                <>
                  <Text style={styles.chipLabel}>{vendorName ? `${vendorName}'s goods` : 'On offer'}</Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.chipScrollRow}
                  >
                    {offers.map((o) => (
                      <Pressable
                        key={`offer-${o}`}
                        style={({ pressed }) => [styles.chip, styles.chipScene, pressed && styles.btnPressed]}
                        onPress={() => tapTarget(o)}
                        accessibilityRole="button"
                      >
                        <Text style={styles.chipTextScene} numberOfLines={1}>{o}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </>
              )}

              {npcs.length > 0 && (
                <>
                  <Text style={styles.chipLabel}>Within reach</Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.chipScrollRow}
                  >
                    {npcs.map((h) => (
                      <Pressable
                        key={`npc-${h}`}
                        style={({ pressed }) => [styles.chip, pressed && styles.btnPressed]}
                        onPress={() => tapTarget(h)}
                        accessibilityRole="button"
                      >
                        <Text style={styles.chipText} numberOfLines={1}>{h}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </>
              )}

              <View style={styles.btnRow}>
                <Pressable
                  style={({ pressed }) => [styles.btn, styles.btnNeutral, pressed && styles.btnPressed]}
                  onPress={onCancel}
                  accessibilityRole="button"
                >
                  <Text style={styles.btnTextNeutral}>CANCEL</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [
                    styles.btn,
                    styles.btnPrimary,
                    !text.trim() && styles.btnDisabled,
                    pressed && styles.btnPressed,
                  ]}
                  onPress={handleSubmit}
                  disabled={!text.trim()}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: !text.trim() }}
                >
                  <Text style={styles.btnTextPrimary}>LIFT</Text>
                </Pressable>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  card: { width: '100%', maxWidth: 380, backgroundColor: '#13110f', borderColor: '#c9a86a', borderWidth: 1, borderRadius: 4, padding: 14 },
  title: { color: '#c9a86a', fontSize: 14, fontWeight: '800', letterSpacing: 4 },
  rule: { height: 1, backgroundColor: '#3a342c', marginTop: 6, marginBottom: 10 },
  body: { color: '#e6d8b3', fontSize: 13, lineHeight: 18, marginBottom: 10 },
  input: { backgroundColor: '#1a1714', borderColor: '#3a342c', borderWidth: 1, color: '#e6d8b3', paddingHorizontal: 10, paddingVertical: 9, borderRadius: 3, fontSize: 14 },
  chipLabel: { color: '#a2977b', fontSize: 10, letterSpacing: 1.5, marginTop: 10, marginBottom: 4 },
  chipScrollRow: { flexDirection: 'row', gap: 6, paddingLeft: 2, paddingRight: 8 },
  chip: { backgroundColor: '#1a1714', borderColor: '#3a342c', borderWidth: 1, borderRadius: 3, paddingHorizontal: 10, paddingVertical: 6 },
  chipScene: { borderColor: '#9ec96a' },
  chipText: { color: '#cdbf99', fontSize: 12 },
  chipTextScene: { color: '#9ec96a', fontSize: 12 },
  btnRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 14 },
  btn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 3, borderWidth: 1, minWidth: 80, alignItems: 'center' },
  btnPressed: { opacity: 0.7 },
  btnDisabled: { opacity: 0.3 },
  btnPrimary: { backgroundColor: '#c9a86a', borderColor: '#c9a86a' },
  btnNeutral: { backgroundColor: 'transparent', borderColor: '#3a342c' },
  btnTextPrimary: { color: '#13110f', fontWeight: '700', letterSpacing: 2, fontSize: 12 },
  btnTextNeutral: { color: '#cdbf99', fontWeight: '700', letterSpacing: 2, fontSize: 12 },
});
