// OTA — HOW MANY, not "do you want to continue?". Owner: "instead of having the
// continue crafting, let's assume they always want to continue crafting — never
// close the crafting menu till they hit a back button. So that pop-up becomes
// 'how many of that item do we want to craft?' ... you have the plus and minus
// buttons or Craft Max ... and then it just completes that crafting task and
// stays in the crafting menu."
//
// Pre-fix (OTA-264) a tap crafted exactly one and then ASKED whether to keep
// going — a question whose answer was always yes. Ten stews meant twenty taps
// and ten identical questions. The step moves to the front instead: pick the
// count, craft them all, stay put.
import React, { useEffect, useState } from 'react';
import { Modal, View, Text, Pressable, StyleSheet, TouchableWithoutFeedback } from 'react-native';

import { tartariaKitStyles as kit } from '../ui/tartariaKit';
interface Props {
  visible: boolean;
  /** Result name of the recipe being made — the modal's title. */
  recipeName: string;
  /** How many the pack can actually make right now (substitution-aware). */
  max: number;
  onConfirm: (count: number) => void;
  onCancel: () => void;
}

/* ⚠⚠⚠ PHASE 3 — THE PLANES ARE THE DEPTH; the kit style is only the material.
 * Each fragment below belongs to ONE physical family, and which one a control
 * gets is decided by its INTERACTION CONTRACT, never by what its style key is
 * called: CTL for a thing you strike, TAB for a thing you switch between, ROW
 * for a thing you select or open. A full-width list row wearing the command
 * key's sidewall is the same category error as a button with no depth at all.
 *
 * ⚠⚠ They are absolutely positioned, `pointerEvents="none"` children inside a
 * box the control already owns, so adopting them moves nothing by a pixel, and
 * any SEMANTIC colour the call site already carries layers on top and still
 * wins. Construction is what the object IS; state is what it is IN. */
const CTL_PLANES = (
  <>
    <View style={kit.controlPlaneTop} pointerEvents="none" />
    <View style={kit.controlPlaneBottom} pointerEvents="none" />
    <View style={kit.controlPlaneContact} pointerEvents="none" />
  </>
);

export function CraftQuantityModal({ visible, recipeName, max, onConfirm, onCancel }: Props) {
  const [count, setCount] = useState(1);

  // Re-open on a different recipe (or a changed ceiling) starts at one again.
  useEffect(() => { if (visible) setCount(1); }, [visible, recipeName, max]);

  if (!visible) return null;

  const capped = Math.max(1, max);
  const clamp = (n: number) => Math.max(1, Math.min(capped, n));
  const atMin = count <= 1;
  const atMax = count >= capped;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onCancel}>
      <TouchableWithoutFeedback onPress={onCancel} accessible={false}>
        <View style={styles.backdrop}>
          <TouchableWithoutFeedback onPress={() => {}} accessible={false}>
            <View style={styles.card}>
              <Text style={styles.title}>{recipeName}</Text>
              <Text style={styles.sub}>
                {capped === 1 ? 'Materials for one.' : `Materials for ${capped}.`}
              </Text>

              <View style={styles.stepper}>
                <Pressable
                  onPress={() => setCount((c) => clamp(c - 1))}
                  disabled={atMin}
                  style={[kit.ctl, styles.step, atMin && styles.stepOff]}
                  accessibilityRole="button"
                  accessibilityLabel="One fewer"
                  accessibilityState={{ disabled: atMin }}
                >
                  <Text style={[styles.stepText, atMin && styles.stepTextOff]}>−</Text>
                  {CTL_PLANES}
                </Pressable>

                <Text style={styles.count} accessibilityLabel={`Crafting ${count}`}>{count}</Text>

                <Pressable
                  onPress={() => setCount((c) => clamp(c + 1))}
                  disabled={atMax}
                  style={[kit.ctl, styles.step, atMax && styles.stepOff]}
                  accessibilityRole="button"
                  accessibilityLabel="One more"
                  accessibilityState={{ disabled: atMax }}
                >
                  <Text style={[styles.stepText, atMax && styles.stepTextOff]}>+</Text>
                  {CTL_PLANES}
                </Pressable>

                <Pressable
                  onPress={() => setCount(capped)}
                  disabled={atMax}
                  style={[kit.ctl, styles.maxBtn, atMax && styles.stepOff]}
                  accessibilityRole="button"
                  accessibilityLabel={`Craft the maximum, ${capped}`}
                  accessibilityState={{ disabled: atMax }}
                >
                  <Text style={[styles.maxText, atMax && styles.stepTextOff]}>MAX</Text>
                  {CTL_PLANES}
                </Pressable>
              </View>

              <View style={styles.actions}>
                <Pressable onPress={onCancel} style={[kit.ctl, styles.btn]} accessibilityRole="button">
                  <Text style={styles.btnText}>CANCEL</Text>
                  {CTL_PLANES}
                </Pressable>
                <Pressable
                  onPress={() => onConfirm(count)}
                  style={[kit.ctl, styles.btn, styles.btnPrimary]}
                  accessibilityRole="button"
                  accessibilityLabel={`Craft ${count} ${recipeName}`}
                >
                  <Text style={[styles.btnText, styles.btnTextPrimary]}>
                    CRAFT{count > 1 ? ` ×${count}` : ''}
                  </Text>
                  {CTL_PLANES}
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
  backdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.72)',
    alignItems: 'center', justifyContent: 'center', padding: 24,
  },
  card: {
    width: '100%', maxWidth: 420, backgroundColor: '#17150f',
    borderWidth: 1, borderColor: '#6b5c3a', borderRadius: 6, padding: 20,
  },
  title: { color: '#e0c179', fontSize: 15, letterSpacing: 0.5 },
  sub: { color: '#a2977b', fontSize: 12, marginTop: 4, fontStyle: 'italic' },
  stepper: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    marginTop: 20, marginBottom: 4,
  },
  step: {
    width: 52, height: 44, borderWidth: 1, borderColor: '#6b5c3a', borderRadius: 4,
    alignItems: 'center', justifyContent: 'center',
  },
  stepOff: { opacity: 0.35 },
  stepText: { color: '#e0c179', fontSize: 22, lineHeight: 26 },
  stepTextOff: { color: '#a2977b' },
  count: {
    color: '#f0e6cc', fontSize: 26, minWidth: 76, textAlign: 'center',
  },
  maxBtn: {
    marginLeft: 12, paddingHorizontal: 14, height: 44, borderWidth: 1,
    borderColor: '#6b5c3a', borderRadius: 4, alignItems: 'center', justifyContent: 'center',
  },
  maxText: { color: '#9ec96a', fontSize: 12, letterSpacing: 1.5 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 22 },
  btn: {
    paddingVertical: 10, paddingHorizontal: 18, borderWidth: 1,
    borderColor: '#6b5c3a', borderRadius: 4, marginLeft: 10,
  },
  btnPrimary: { borderColor: '#9ec96a' },
  btnText: { color: '#a2977b', fontSize: 12, letterSpacing: 1.5 },
  btnTextPrimary: { color: '#9ec96a' },
});
