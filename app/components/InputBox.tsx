import React, { useState } from 'react';
import { View, TextInput, TouchableOpacity, Text, StyleSheet } from 'react-native';

interface Props {
  onSubmit: (text: string) => void;
  onOpenInventory: () => void;
  inCombat: boolean;
  equippedMain: string | null;
  equippedOff: string | null;
  /** Current combat range — surfaces advance/retreat buttons when meaningful. */
  range?: 'arm' | 'close' | 'far' | null;
}

const PEACE_QUICK = ['look', 'search', 'rest'] as const;

// Trim a weapon name down to fit comfortably on a button. Examples:
// "Aetheric Crystal Blade" → "Crystal Blade"
// "Mud-fist Wraps"          → "Mud-fist"
// "Sentinel Cleaver"        → "Cleaver"
function shortWeaponLabel(name: string): string {
  const tokens = name.split(/\s+/);
  if (tokens.length <= 2) return name;
  return tokens.slice(-2).join(' ');
}

export function InputBox({ onSubmit, onOpenInventory, inCombat, equippedMain, equippedOff, range }: Props) {
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
            {equippedMain ? (
              <QuickBtn
                label={shortWeaponLabel(equippedMain).toLowerCase()}
                onPress={() => onSubmit(`attack with the ${equippedMain.toLowerCase()}`)}
              />
            ) : null}
            {equippedOff ? (
              <QuickBtn
                label={`off: ${shortWeaponLabel(equippedOff).toLowerCase()}`}
                onPress={() => onSubmit(`attack with the off-hand ${equippedOff.toLowerCase()}`)}
              />
            ) : null}
            <QuickBtn label="dodge" defensive onPress={() => onSubmit('dodge')} />
            {range && range !== 'arm' && (
              <QuickBtn label="advance" onPress={() => onSubmit('advance')} />
            )}
            {range && range !== 'far' && (
              <QuickBtn label="step back" onPress={() => onSubmit('step back')} />
            )}
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
  defensive,
}: {
  label: string;
  onPress: () => void;
  defensive?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[styles.quick, defensive && styles.quickDefensive]}
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
