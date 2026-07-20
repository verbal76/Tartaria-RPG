// OTA-065 — Invite-playtester modal for the TitleScreen. Lets a
// player suggest a friend's Gmail address for the playtest. On
// submit, opens a mailto to hotatticgames@gmail.com with subject
// "New Playtester" and a small body containing the suggested
// address + the requester's OTA build. The owner manually
// whitelists + replies with the install link (advertised as up
// to 24 hours, usually within the hour).
import React, { useEffect, useState } from 'react';
import { getGameTitle } from '../engine/contentPack';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  TouchableWithoutFeedback,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';

interface Props {
  visible: boolean;
  onCancel: () => void;
  /** Called when the player taps INVITE with a valid Gmail
   *  address. Caller is responsible for the mailto open. */
  onSend: (gmail: string) => void;
}

// Gmail accepts dots, plus-tags, and digits in the local part.
// Pattern matches the canonical form: 1+ chars of letters /
// digits / . / _ / % / + / -, then @gmail.com (case-insensitive
// on the domain since Gmail folds the domain). Trimmed + lower-
// cased before testing so leading whitespace from autocomplete
// doesn't trip the check.
const GMAIL_PATTERN = /^[a-z0-9._%+-]+@gmail\.com$/;

function isValidGmail(raw: string): boolean {
  const trimmed = raw.trim().toLowerCase();
  if (trimmed.length === 0 || trimmed.length > 254) return false;
  return GMAIL_PATTERN.test(trimmed);
}

export function InvitePlaytesterModal({ visible, onCancel, onSend }: Props) {
  const [gmail, setGmail] = useState('');
  const [touched, setTouched] = useState(false);

  // Reset every time the modal opens — invites should start
  // fresh, not carry over a half-typed address from a previous
  // open.
  useEffect(() => {
    if (visible) {
      setGmail('');
      setTouched(false);
    }
  }, [visible]);

  const valid = isValidGmail(gmail);
  const showError = touched && gmail.length > 0 && !valid;

  const handleSend = (): void => {
    setTouched(true);
    if (!valid) return;
    onSend(gmail.trim().toLowerCase());
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
                  <Text style={styles.title} accessibilityRole="header">INVITE A PLAYTESTER</Text>
                  <View style={styles.ruleLine} />
                </View>

                <Text style={styles.body}>
                  Type the Gmail address of someone you'd like added to
                  the {getGameTitle()} playtest. We'll whitelist them
                  and email them an install link — usually within the
                  hour, up to 24 hours.
                </Text>

                <Text style={styles.sectionLabel}>GMAIL ADDRESS</Text>
                <TextInput
                  style={[styles.input, showError && styles.inputError]}
                  placeholder="friend@gmail.com"
                  placeholderTextColor="#46555a"
                  value={gmail}
                  onChangeText={setGmail}
                  onBlur={() => setTouched(true)}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  inputMode="email"
                  returnKeyType="send"
                  onSubmitEditing={handleSend}
                />
                {showError && (
                  <Text style={styles.errorLine}>
                    Needs to be a valid @gmail.com address.
                  </Text>
                )}

                <Text style={styles.body}>
                  Tapping INVITE opens your email app with a draft to
                  hotatticgames@gmail.com — just tap Send.
                </Text>

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
                      valid ? styles.btnPrimary : styles.btnDisabled,
                      pressed && styles.btnPressed,
                    ]}
                    onPress={handleSend}
                    disabled={!valid}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: !valid }}
                  >
                    <Text
                      style={[
                        styles.btnText,
                        valid ? styles.btnTextPrimary : styles.btnTextDisabled,
                      ]}
                    >
                      INVITE
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

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  cardWrap: { width: '100%', maxWidth: 420 },
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
  input: {
    backgroundColor: '#131c1f',
    borderColor: '#2b3a3e',
    borderWidth: 1,
    borderRadius: 3,
    padding: 10,
    color: '#d6e4e8',
    fontSize: 14,
    marginBottom: 6,
  },
  inputError: { borderColor: '#c97a7a' },
  errorLine: {
    color: '#c97a7a',
    fontSize: 11,
    marginBottom: 8,
    marginTop: -2,
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
