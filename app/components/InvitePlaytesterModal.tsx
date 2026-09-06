// OTA-065 — Invite-playtester modal for the TitleScreen. Lets a
// player suggest a friend's Gmail address for the playtest. On
// submit, opens a mailto to hotatticgames@gmail.com with subject
// "New Playtester" and a small body containing the suggested
// address + the requester's OTA build. The owner manually
// whitelists + replies with the install link (advertised as up
// to 24 hours, usually within the hour).
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, TextInput } from 'react-native';
import { KeyboardSafeCard } from './KeyboardSafeCard';

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
    // ⚠ OTA-1718 — same wrapper shape as REPORT A BUG: a KeyboardAvoidingView
    // with a maxHeight around a card that had none, so INVITE could sit under
    // the keyboard on a short screen. The field is single-line and carries
    // `returnKeyType="send"`, so this one was survivable — but "survivable if
    // you know the return key sends" is the same bargain the report objected to.
    <KeyboardSafeCard
      visible={visible}
      onRequestClose={onCancel}
      maxWidth={420}
      testID="invite-playtester-card"
      header={(
        <View style={styles.headerRow}>
          <Text style={styles.title} accessibilityRole="header">INVITE A PLAYTESTER</Text>
          <View style={styles.ruleLine} />
        </View>
      )}
      footer={(
        <View style={styles.buttonRow}>
          <Pressable
            style={({ pressed }) => [styles.btn, styles.btnNeutral, pressed && styles.btnPressed]}
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
            <Text style={[styles.btnText, valid ? styles.btnTextPrimary : styles.btnTextDisabled]}>
              INVITE
            </Text>
          </Pressable>
        </View>
      )}
    >
      <Text style={styles.body}>
        Type the Gmail address of someone you&apos;d like added to
        the Tartaria Realms playtest. We&apos;ll whitelist them
        and email them an install link — usually within the
        hour, up to 24 hours.
      </Text>

      <Text style={styles.sectionLabel}>GMAIL ADDRESS</Text>
      <TextInput
        style={[styles.input, showError && styles.inputError]}
        placeholder="friend@gmail.com"
        placeholderTextColor="#5c5345"
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
    </KeyboardSafeCard>
  );
}

const styles = StyleSheet.create({
  // ⚠ OTA-1718 — scrim / cardWrap / card are KeyboardSafeCard's job now.
  headerRow: { marginBottom: 10 },
  title: {
    color: '#c9a86a',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 4,
  },
  ruleLine: { height: 1, backgroundColor: '#3a342c', marginTop: 6 },
  body: { color: '#cdbf99', fontSize: 12, lineHeight: 17, marginBottom: 12 },
  sectionLabel: {
    color: '#a2977b',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 2,
    marginTop: 4,
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#1a1714',
    borderColor: '#3a342c',
    borderWidth: 1,
    borderRadius: 3,
    padding: 10,
    color: '#e6d8b3',
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
  btnPrimary: { backgroundColor: '#c9a86a', borderColor: '#c9a86a' },
  btnDisabled: { backgroundColor: 'transparent', borderColor: '#3a342c' },
  btnNeutral: { backgroundColor: 'transparent', borderColor: '#3a342c' },
  btnText: { fontSize: 12, fontWeight: '700', letterSpacing: 2 },
  btnTextPrimary: { color: '#13110f' },
  btnTextDisabled: { color: '#5c5345' },
  btnTextNeutral: { color: '#cdbf99' },
});
