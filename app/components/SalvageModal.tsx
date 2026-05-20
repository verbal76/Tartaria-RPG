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
} from 'react-native';

interface Props {
  visible: boolean;
  /** Scene-noun pool from buildChipPool. We filter for things that
   *  look salvageable (constructs, drones, wreckage, machinery, etc.)
   *  and surface those as the chip row. */
  hints?: string[];
  onSubmit: (target: string) => void;
  onCancel: () => void;
}

// Salvage chip filter — match nouns that suggest mechanical / metal /
// pre-flood relic the player could strip for parts. Player-explicit
// quick-action mirroring Search/Approach. The submitted text routes
// through the investigate intent (salvage is a synonym there as of
// OTA 140), so an active wreck_construct / fallen_sentinel / etc.
// hook advances naturally; otherwise the engine narrates a generic
// salvage outcome via the investigate handler.
const SALVAGE_PATTERN = /construct|automaton|drone|sentinel|wreck|husk|machinery|machine|scrap|circuit|gear|plating|core|relic|robot|rust|broken|fallen|toppled|cog|rig|engine|hull|chassis|frame/i;

function isSalvageable(noun: string): boolean {
  return SALVAGE_PATTERN.test(noun);
}

export function SalvageModal({ visible, hints, onSubmit, onCancel }: Props) {
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

  const tapToSalvage = (target: string) => {
    Keyboard.dismiss();
    onSubmit(target);
  };

  const sceneHints = (hints ?? []).filter(isSalvageable).slice(0, 5);
  const commonHints = ['the wreck', 'the construct', 'the drone', 'the machinery', 'the husk'];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
      statusBarTranslucent
    >
      <TouchableWithoutFeedback onPress={onCancel}>
        <View style={styles.scrim}>
          <TouchableWithoutFeedback>
            <View style={styles.card}>
              <Text style={styles.title}>SALVAGE</Text>
              <View style={styles.rule} />
              <Text style={styles.body}>
                Pull a core, strip the plating, pry the circuits — name the
                wreck, construct, automaton, drone, or piece of pre-flood
                machinery you want to break down. Active mechanical hooks
                (toppled constructs, fallen sentinels) advance on tap.
              </Text>

              <TextInput
                ref={inputRef}
                style={styles.input}
                value={text}
                onChangeText={setText}
                placeholder='e.g. "the construct", "the drone", "the wreck"'
                placeholderTextColor="#5a5246"
                onSubmitEditing={handleSubmit}
                returnKeyType="search"
                autoCorrect={false}
                autoCapitalize="none"
              />

              {sceneHints.length > 0 && (
                <>
                  <Text style={styles.chipLabel}>In this scene</Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.chipScrollRow}
                  >
                    {sceneHints.map((h) => (
                      <Pressable
                        key={`scene-${h}`}
                        style={({ pressed }) => [styles.chip, styles.chipScene, pressed && styles.btnPressed]}
                        onPress={() => tapToSalvage(h)}
                      >
                        <Text style={styles.chipTextScene} numberOfLines={1}>{h}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </>
              )}
              <Text style={styles.chipLabel}>Common</Text>
              <View style={styles.chipRow}>
                {commonHints.map((h) => (
                  <Pressable
                    key={`common-${h}`}
                    style={({ pressed }) => [styles.chip, pressed && styles.btnPressed]}
                    onPress={() => tapToSalvage(h)}
                  >
                    <Text style={styles.chipText} numberOfLines={1}>{h}</Text>
                  </Pressable>
                ))}
              </View>

              <View style={styles.btnRow}>
                <Pressable
                  style={({ pressed }) => [styles.btn, styles.btnNeutral, pressed && styles.btnPressed]}
                  onPress={onCancel}
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
                >
                  <Text style={styles.btnTextPrimary}>SALVAGE</Text>
                </Pressable>
              </View>
            </View>
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
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#13110f',
    borderColor: '#c9a86a',
    borderWidth: 1,
    borderRadius: 4,
    padding: 14,
  },
  title: { color: '#c9a86a', fontSize: 14, fontWeight: '800', letterSpacing: 4 },
  rule: { height: 1, backgroundColor: '#3a342c', marginTop: 6, marginBottom: 10 },
  body: { color: '#e6d8b3', fontSize: 13, lineHeight: 18, marginBottom: 10 },
  input: {
    backgroundColor: '#1a1714',
    borderColor: '#3a342c',
    borderWidth: 1,
    color: '#e6d8b3',
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderRadius: 3,
    fontSize: 14,
  },
  chipLabel: { color: '#7a705c', fontSize: 10, letterSpacing: 1.5, marginTop: 10, marginBottom: 4 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chipScrollRow: { flexDirection: 'row', gap: 6, paddingLeft: 2, paddingRight: 8 },
  chip: {
    backgroundColor: '#1a1714',
    borderColor: '#3a342c',
    borderWidth: 1,
    borderRadius: 3,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  chipScene: { borderColor: '#9ec96a' },
  chipText: { color: '#cdbf99', fontSize: 12 },
  chipTextScene: { color: '#9ec96a', fontSize: 12 },
  btnRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 14 },
  btn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 3,
    borderWidth: 1,
    minWidth: 80,
    alignItems: 'center',
  },
  btnPressed: { opacity: 0.7 },
  btnDisabled: { opacity: 0.3 },
  btnPrimary: { backgroundColor: '#c9a86a', borderColor: '#c9a86a' },
  btnNeutral: { backgroundColor: 'transparent', borderColor: '#3a342c' },
  btnTextPrimary: { color: '#13110f', fontWeight: '700', letterSpacing: 2, fontSize: 12 },
  btnTextNeutral: { color: '#cdbf99', fontWeight: '700', letterSpacing: 2, fontSize: 12 },
});
