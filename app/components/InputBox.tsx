import React, { useRef, useState } from 'react';
import { View, TextInput, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { TutorialTarget } from './TutorialTarget';

interface Props {
  onSubmit: (text: string) => void;
  onOpenInventory: () => void;
  onOpenSearch: () => void;
  onOpenCrafting: () => void;
  inCombat: boolean;
  equippedMain: string | null;
  equippedOff: string | null;
  /** Current combat range — surfaces advance/retreat buttons when meaningful. */
  range?: 'arm' | 'close' | 'far' | null;
}

// Peace-mode quick buttons. 'look' = generic look-around (no target).
// 'search' = opens a search prompt where the player names what to search.
// 'rest', 'dig' = direct verbs.
const PEACE_QUICK_DIRECT = ['look', 'rest', 'dig'] as const;

// Trim a weapon name down to fit comfortably on a button. Examples:
// "Aetheric Crystal Blade" → "Crystal Blade"
// "Mud-fist Wraps"          → "Mud-fist"
// "Sentinel Cleaver"        → "Cleaver"
function shortWeaponLabel(name: string): string {
  const tokens = name.split(/\s+/);
  if (tokens.length <= 2) return name;
  return tokens.slice(-2).join(' ');
}

export function InputBox({ onSubmit, onOpenInventory, onOpenSearch, onOpenCrafting, inCombat, equippedMain, equippedOff, range }: Props) {
  const [text, setText] = useState('');
  const inputRef = useRef<TextInput>(null);

  const handleSubmit = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
    // Android IME composition buffer keeps the tail of long inputs even
    // after setText('') — controlled-value pattern alone isn't enough.
    // Call the native clear() method too so the on-screen input actually
    // empties out. Playtest screenshot showed "? it should make that
    // what is going on right now" stuck in the box after Act.
    setText('');
    inputRef.current?.clear();
  };

  return (
    <View style={styles.container}>
      <TutorialTarget area="quick-row" style={styles.quickRow}>
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
            {/* Inventory access stays prominent in combat — playtest report
                flagged "pack" at the end of the row as easy to miss. Sits
                right after the weapons so swap/quaff flows are reachable
                without scanning past dodge/block/advance. */}
            <QuickBtn label="inventory" onPress={onOpenInventory} />
            <QuickBtn label="dodge" defensive onPress={() => onSubmit('dodge')} />
            <QuickBtn label="block" defensive onPress={() => onSubmit('block')} />
            {range && range !== 'arm' && (
              <QuickBtn label="advance" onPress={() => onSubmit('advance')} />
            )}
            {range && range !== 'far' && (
              <QuickBtn label="step back" onPress={() => onSubmit('step back')} />
            )}
            {/* Always-available escape. Iron Fog can lock advance/step
                back, so the player needs a visible flee button or they'll
                think the game is stuck. Routes to escape intent → skill
                check → enemies cleared on success. */}
            <QuickBtn label="flee" defensive onPress={() => onSubmit('flee')} />
          </>
        ) : (
          <>
            {PEACE_QUICK_DIRECT.map((qa) => (
              <QuickBtn key={qa} label={qa} onPress={() => onSubmit(qa)} />
            ))}
            <QuickBtn label="search" onPress={onOpenSearch} />
            <QuickBtn label="craft" onPress={onOpenCrafting} />
            <QuickBtn label="inventory" onPress={onOpenInventory} />
          </>
        )}
      </TutorialTarget>
      <TutorialTarget area="input-row" style={styles.inputRow}>
        <TextInput
          ref={inputRef}
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder={inCombat ? 'What do you do? (or use quick buttons)' : 'What do you do?'}
          placeholderTextColor="#5a5246"
          onSubmitEditing={handleSubmit}
          returnKeyType="send"
          // Disable autocorrect AND autocomplete so Android IME doesn't
          // reinsert composition tail after submit.
          autoCorrect={false}
          autoCapitalize="none"
          autoComplete="off"
          textContentType="none"
        />
        <TouchableOpacity style={styles.send} onPress={handleSubmit}>
          <Text style={styles.sendText}>Act</Text>
        </TouchableOpacity>
      </TutorialTarget>
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
