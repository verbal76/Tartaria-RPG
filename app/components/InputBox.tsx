import React, { useState } from 'react';
import { View, TextInput, TouchableOpacity, Text, StyleSheet } from 'react-native';

interface Props {
  onSubmit: (text: string) => void;
  onOpenInventory: () => void;
  inCombat: boolean;
  hasEquippedWeapon: boolean;
}

// Context-aware quick actions. Out of combat the player has the
// exploration verbs they need; in combat the row swaps to fast
// physical options + a dodge defensive stance.
const PEACE_QUICK = ['look', 'search', 'rest'] as const;

export function InputBox({ onSubmit, onOpenInventory, inCombat, hasEquippedWeapon }: Props) {
  const [text, setText] = useState('');

  const handleSubmit = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
    setText('');
  };

  return (
    <View style={styles.container}>
      <View style={styles.quickRow}>
        {inCombat ? (
          <>
            <QuickBtn label="punch" onPress={() => onSubmit('punch')} />
            <QuickBtn label="kick" onPress={() => onSubmit('kick')} />
            <QuickBtn
              label={hasEquippedWeapon ? 'weapon' : 'weapon —'}
              dim={!hasEquippedWeapon}
              onPress={() => onSubmit(hasEquippedWeapon ? 'attack with my weapon' : 'attack')}
            />
            <QuickBtn label="dodge" defensive onPress={() => onSubmit('dodge')} />
          </>
        ) : (
          <>
            {PEACE_QUICK.map((qa) => (
              <QuickBtn key={qa} label={qa} onPress={() => onSubmit(qa)} />
            ))}
            <QuickBtn label="inventory" onPress={onOpenInventory} />
          </>
        )}
      </View>
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder={inCombat ? 'What do you do? (or use quick buttons)' : 'What do you do?'}
          placeholderTextColor="#5a5246"
          onSubmitEditing={handleSubmit}
          returnKeyType="send"
          autoCorrect={false}
          autoCapitalize="none"
        />
        <TouchableOpacity style={styles.send} onPress={handleSubmit}>
          <Text style={styles.sendText}>Act</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function QuickBtn({
  label,
  onPress,
  dim,
  defensive,
}: {
  label: string;
  onPress: () => void;
  dim?: boolean;
  defensive?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[styles.quick, defensive && styles.quickDefensive, dim && styles.quickDim]}
      onPress={onPress}
    >
      <Text style={[styles.quickText, defensive && styles.quickDefensiveText]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { gap: 6 },
  quickRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  quick: {
    backgroundColor: '#1a1714',
    borderColor: '#3a342c',
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 4,
  },
  quickDim: { opacity: 0.45 },
  quickDefensive: { borderColor: '#6a9bbf' },
  quickText: { color: '#cdbf99', fontSize: 12 },
  quickDefensiveText: { color: '#6a9bbf' },
  inputRow: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  input: {
    flex: 1,
    backgroundColor: '#1a1714',
    borderColor: '#3a342c',
    borderWidth: 1,
    color: '#e6d8b3',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 4,
    fontSize: 14,
  },
  send: {
    backgroundColor: '#3a342c',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 4,
  },
  sendText: { color: '#e6d8b3', fontWeight: '700' },
});
