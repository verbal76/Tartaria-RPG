// OTA-1113 — CUSTOM DIFFICULTY. Owner: "create a custom selection that fires a
// popup and lets you check what systems they want to effect."
//
// The survey the owner brought back names the roguelite pattern — Slay the
// Spire's Ascension, Hades' Heat — as the cleanest difficulty design in the
// medium, because each step is legible and the player chooses which axis to
// make harder. Its recommendation for everyone else is "presets as the front
// door, custom as an advanced option that maps to the same variables". That is
// exactly this screen: the four presets stay where they are, and CUSTOM is the
// same twelve variables with the player holding the switches.
//
// Two controls, not twelve sliders:
//   INTENSITY — which preset's numbers the checked systems borrow.
//   SYSTEMS   — which dials that intensity is allowed to touch.
// Everything unchecked runs at 'owed', the identity row. So "let it come, but
// only for the fights" is expressible, and so is "bury me with them, but leave
// my loot alone". A slider per system would have been finer and unreadable on
// a phone, and would have exploded the QA surface the survey warns about.
//
// Rows are grouped by LEVER TYPE and the type is shown, because the survey's
// most useful distinction is that multipliers, rule changes and content swaps
// feel completely different at the same nominal difficulty — and a player
// choosing their own difficulty deserves to see they are picking between kinds
// of change, not just amounts.

import React, { useState } from 'react';
import { Modal, View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import {
  PRESET_TIERS,
  PRESSURE_PROFILES,
  DIFFICULTY_SYSTEMS,
  DEFAULT_PRESSURE,
  type DifficultySystemId,
  type PressureTier,
  type PressureCustom,
} from '../engine/pressure';

const KIND_LABEL: Record<string, string> = {
  multiplier: 'AMOUNT',
  rule: 'RULE',
  content: 'WHAT YOU FIGHT',
};

export interface DifficultyCustomModalProps {
  visible: boolean;
  /** Seed state — an existing custom config when editing, else undefined. */
  initial?: PressureCustom;
  onCancel: () => void;
  onConfirm: (custom: PressureCustom) => void;
}

export function DifficultyCustomModal({ visible, initial, onCancel, onConfirm }: DifficultyCustomModalProps) {
  const [intensity, setIntensity] = useState<Exclude<PressureTier, 'custom'>>(
    initial?.intensity ?? DEFAULT_PRESSURE,
  );
  const [systems, setSystems] = useState<DifficultySystemId[]>(initial?.systems ?? []);

  const toggle = (id: DifficultySystemId) =>
    setSystems((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  if (!visible) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.kicker}>CUSTOM DIFFICULTY</Text>
          <Text style={styles.lede}>
            Pick how hard, then pick what it is allowed to touch. Anything left unchecked plays
            exactly as the standard run does.
          </Text>

          <Text style={styles.section}>HOW HARD</Text>
          <View style={styles.intensityRow}>
            {PRESET_TIERS.map((id) => (
              <Pressable
                key={id}
                onPress={() => setIntensity(id)}
                style={[styles.intensityChip, intensity === id && styles.intensityChipOn]}
                accessibilityRole="radio"
                accessibilityState={{ selected: intensity === id }}
                accessibilityLabel={PRESSURE_PROFILES[id].label}
              >
                <Text style={[styles.intensityText, intensity === id && styles.intensityTextOn]}>
                  {PRESSURE_PROFILES[id].label.replace(/^"|"$/g, '')}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.section}>WHAT IT TOUCHES</Text>
          <ScrollView style={styles.list} contentContainerStyle={styles.listPad}>
            {DIFFICULTY_SYSTEMS.map((sys) => {
              const on = systems.includes(sys.id);
              return (
                <Pressable
                  key={sys.id}
                  onPress={() => toggle(sys.id)}
                  style={[styles.row, on && styles.rowOn]}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={`${sys.label}. ${sys.blurb}`}
                >
                  <Text style={[styles.box, on && styles.boxOn]}>{on ? '✓' : ' '}</Text>
                  <View style={styles.rowText}>
                    <View style={styles.rowHead}>
                      <Text style={[styles.rowLabel, on && styles.rowLabelOn]}>{sys.label}</Text>
                      <Text style={styles.rowKind}>{KIND_LABEL[sys.kind] ?? ''}</Text>
                    </View>
                    <Text style={styles.rowBlurb}>{sys.blurb}</Text>
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>

          <Text style={styles.count}>
            {systems.length === 0
              ? 'Nothing checked — this plays as the standard run.'
              : `${systems.length} of ${DIFFICULTY_SYSTEMS.length} systems at this intensity.`}
          </Text>

          <View style={styles.buttons}>
            <Pressable onPress={onCancel} style={styles.btn} accessibilityRole="button" accessibilityLabel="Cancel">
              <Text style={styles.btnText}>CANCEL</Text>
            </Pressable>
            <Pressable
              onPress={() => onConfirm({ intensity, systems })}
              style={[styles.btn, styles.btnPrimary]}
              accessibilityRole="button"
              accessibilityLabel="Confirm custom difficulty"
            >
              <Text style={[styles.btnText, styles.btnTextPrimary]}>USE THIS</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(4,6,8,0.94)', justifyContent: 'center', padding: 16 },
  sheet: {
    backgroundColor: '#17150f',
    borderColor: '#6b5c3a',
    borderWidth: 1,
    borderRadius: 8,
    padding: 18,
    maxHeight: '92%',
  },
  kicker: { color: '#c9a86a', fontSize: 12, fontWeight: '700', letterSpacing: 2, marginBottom: 8 },
  lede: { color: '#a2977b', fontSize: 12, lineHeight: 18, marginBottom: 16 },
  section: { color: '#7c8f6a', fontSize: 10, fontWeight: '700', letterSpacing: 2, marginBottom: 8 },
  intensityRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 16 },
  intensityChip: {
    borderColor: '#3a342c', borderWidth: 1, borderRadius: 4,
    paddingVertical: 7, paddingHorizontal: 10,
  },
  intensityChipOn: { borderColor: '#c9a86a', backgroundColor: '#241f16' },
  intensityText: { color: '#8d8674', fontSize: 11 },
  intensityTextOn: { color: '#e8dcc0', fontWeight: '700' },
  list: { maxHeight: 320 },
  listPad: { paddingBottom: 4 },
  row: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    paddingVertical: 9, paddingHorizontal: 8,
    borderRadius: 4, borderColor: 'transparent', borderWidth: 1,
  },
  rowOn: { borderColor: '#4d5a3a', backgroundColor: '#1c1b13' },
  box: {
    width: 20, height: 20, textAlign: 'center', lineHeight: 19,
    borderColor: '#5a5344', borderWidth: 1, borderRadius: 3,
    color: '#7c8f6a', fontSize: 13, fontWeight: '700', overflow: 'hidden',
  },
  boxOn: { borderColor: '#7c8f6a', color: '#a8c48a' },
  rowText: { flex: 1 },
  rowHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  rowLabel: { color: '#cdbf99', fontSize: 13, flexShrink: 1 },
  rowLabelOn: { color: '#e8dcc0', fontWeight: '700' },
  rowKind: { color: '#5a5344', fontSize: 9, fontWeight: '700', letterSpacing: 1 },
  rowBlurb: { color: '#8d8674', fontSize: 11, lineHeight: 16, marginTop: 2 },
  count: { color: '#7c8f6a', fontSize: 11, fontStyle: 'italic', marginTop: 12, marginBottom: 12 },
  buttons: { flexDirection: 'row', gap: 8 },
  btn: {
    flex: 1, borderColor: '#5a5344', borderWidth: 1, borderRadius: 4,
    paddingVertical: 12, alignItems: 'center',
  },
  btnPrimary: { borderColor: '#c9a86a', backgroundColor: '#241f16' },
  btnText: { color: '#a2977b', fontSize: 12, fontWeight: '700', letterSpacing: 2 },
  btnTextPrimary: { color: '#e8dcc0' },
});
