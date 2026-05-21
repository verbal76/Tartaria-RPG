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
import { useGameStore } from '../state/gameStore';
import type { InventoryItem } from '../engine/types';
import { computeInventoryDelta, type InventoryDelta } from './inventoryDelta';

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
  // Modal phase. 'select' shows the input + chip row; 'results' shows
  // what landed in the pack from the action that just ran.
  const [phase, setPhase] = useState<'select' | 'results'>('select');
  const [results, setResults] = useState<InventoryDelta[]>([]);
  // Live inventory selector. We snapshot it on submit (preInv ref)
  // and diff the next change against it to surface the delta.
  const inventory = useGameStore((s) => s.player?.inventory ?? []);
  const preInvRef = useRef<InventoryItem[]>([]);
  const tcRef = useRef<number>(useGameStore.getState().player?.tc ?? 0);
  const currentTc = useGameStore((s) => s.player?.tc ?? 0);

  useEffect(() => {
    // Reset to select-mode whenever the modal re-opens.
    if (visible) {
      setText('');
      setPhase('select');
      setResults([]);
    }
    return undefined;
  }, [visible]);

  // Submit handler — captures pre-state, runs the action, diffs the
  // resulting inventory + TC. The store action for salvage's
  // material/TC outcomes lands the grant synchronously, so by the
  // time we re-read useGameStore.getState() the mutation has
  // already happened.
  const runSubmit = (target: string) => {
    Keyboard.dismiss();
    preInvRef.current = inventory.map((i) => ({ ...i }));
    tcRef.current = currentTc;
    onSubmit(target);
    // Compute delta against the current (post-action) store state.
    // Re-read directly off the store so we don't rely on this
    // component's re-render cadence.
    const liveInv = useGameStore.getState().player?.inventory ?? [];
    const liveTc = useGameStore.getState().player?.tc ?? 0;
    const delta = computeInventoryDelta(preInvRef.current, liveInv);
    if (liveTc > tcRef.current) {
      delta.unshift({ name: 'TC', quantity: liveTc - tcRef.current });
    }
    setResults(delta);
    setPhase('results');
  };

  const handleSubmit = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    runSubmit(trimmed);
  };

  const tapToSalvage = (target: string) => {
    runSubmit(target);
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
              {phase === 'results' ? (
                <>
                  <Text style={styles.title}>SALVAGE — RESULT</Text>
                  <View style={styles.rule} />
                  {results.length > 0 ? (
                    <>
                      <Text style={styles.resultsLead}>Added to your pack:</Text>
                      <View style={styles.resultList}>
                        {results.map((r) => (
                          <View key={r.name} style={styles.resultRow}>
                            <Text style={styles.resultName}>
                              ✦ {r.name}{r.quantity > 1 ? ` × ${r.quantity}` : ''}
                            </Text>
                            {r.rarity && r.name !== 'TC' && (
                              <Text style={styles.resultRarity}>{r.rarity}</Text>
                            )}
                          </View>
                        ))}
                      </View>
                    </>
                  ) : (
                    <Text style={styles.resultsLead}>
                      Nothing concrete this time — the wreck gave up no parts. (See the world log for what happened: maybe a hook landed, maybe the silt was just silt.)
                    </Text>
                  )}
                  <View style={styles.btnRow}>
                    <Pressable
                      style={({ pressed }) => [styles.btn, styles.btnPrimary, pressed && styles.btnPressed]}
                      onPress={onCancel}
                    >
                      <Text style={styles.btnTextPrimary}>CLOSE</Text>
                    </Pressable>
                  </View>
                </>
              ) : (
                <>
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
                </>
              )}
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
  // Result-phase rows. ✦ marker + rarity badge on the right.
  resultsLead: { color: '#cdbf99', fontSize: 13, lineHeight: 18, marginBottom: 10 },
  resultList: { gap: 6, marginBottom: 8 },
  resultRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1a1714',
    borderColor: '#9ec96a',
    borderWidth: 1,
    borderRadius: 3,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  resultName: { color: '#e6d8b3', fontSize: 14, fontWeight: '600' },
  resultRarity: { color: '#9ec96a', fontSize: 10, letterSpacing: 1.5 },
});
