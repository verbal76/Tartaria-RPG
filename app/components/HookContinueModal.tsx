import React, { useRef, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  Pressable,
  StyleSheet,
  TouchableWithoutFeedback,
  ScrollView,
  Dimensions,
} from 'react-native';
import type { HookContinueStage } from '../engine/types';

// OTA-259 / OTA-263 — CONTINUE popup for multi-stage investigation
// hooks.
//
// OTA-259 introduced the popup to remove the "re-open investigate
// menu between stages" friction. OTA-263 refines it per player
// feedback (two refinement rounds):
//   - The popup ACCUMULATES each stage's text in-place as the
//     player taps CONTINUE, so the whole thread arc is in the modal
//     and the player doesn't have to read past the dimmed scrim to
//     re-check the prior stage.
//   - LATER → ABANDON. Player said "there is no later, either you
//     continue or abandon it." ABANDON marks the hook resolved so
//     it can't be re-opened (the player committed to walking away).
//   - CONTINUE and ABANDON are the ONLY buttons — no separate CLOSE
//     state. Player clarified: "both close it out, you either
//     continue to the end of it, or abandon it." On the terminal
//     stage, CONTINUE just dismisses (continueHook's defensive
//     branch handles the no-more-stages case by clearing pending
//     state); ABANDON dismisses + marks the (already-resolved) hook
//     resolved. The title flips to "★★ STORY THREAD COMPLETE" so
//     the player knows tapping CONTINUE means "I'm done reading."
//
// The previous stage's narration also goes to the world feed (log)
// via resolveHookOneStep's existing appendLog calls, so the player
// has a permanent record. The popup is the in-flight experience.

interface Props {
  visible: boolean;
  /** Noun the player tapped to start the thread — title decoration
   *  ("at the {noun}") so the player knows which thread they're
   *  in if a scene has multiple hooks. */
  noun: string;
  /** Every stage that's fired in this thread session, in order. */
  stageHistory: HookContinueStage[];
  /** True when the terminal stage (outcome.done) has fired. Drives
   *  the title swap ("STORY THREAD COMPLETE") so the player knows
   *  CONTINUE just dismisses; no separate button affordance. */
  completed: boolean;
  onContinue: () => void;
  onAbandon: () => void;
  /** OTA-284 — vendor name when the current scene has a spawned
   *  vendor (typically from a spawn_vendor effect fired by THIS
   *  thread, e.g. the Roadfire Reclaimer campfire). When set, a
   *  TRADE NOW button renders between CONTINUE and ABANDON so the
   *  player can act on the "tap to trade" narration instead of
   *  CONTINUE-ing past the trade opportunity. Undefined → no
   *  TRADE button rendered, modal looks the same as pre-OTA-284. */
  vendorName?: string;
  /** OTA-284 — handler for TRADE NOW. Should dismiss the modal
   *  (typically via dismissHookContinue — leaves the hook unresolved
   *  so the player can re-investigate the noun later to continue the
   *  thread) AND navigate to the vendor screen. */
  onTrade?: () => void;
}

// Cap the scroll height so the popup doesn't push off-screen on a
// very long thread (e.g., 6-stage hooks). Same height-aware pattern
// as OTA-262 in SalvageModal.
const STAGE_SCROLL_MAX_HEIGHT = Math.max(
  240,
  Math.floor(Dimensions.get('window').height - 320),
);

export function HookContinueModal({
  visible,
  noun,
  stageHistory,
  completed,
  onContinue,
  onAbandon,
  vendorName,
  onTrade,
}: Props) {
  const scrollRef = useRef<ScrollView>(null);

  // Auto-scroll to the newest stage as it's appended so the player
  // sees the freshly-fired beat without having to scroll manually.
  // Triggered on history length change (a new stage was added).
  useEffect(() => {
    if (!visible) return;
    // Small delay so the layout reflows with the new content before
    // we scroll — otherwise scrollToEnd targets the old bottom.
    const t = setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    }, 50);
    return () => clearTimeout(t);
  }, [visible, stageHistory.length]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onAbandon}
      statusBarTranslucent
    >
      {/* OTA-263 — scrim restored to normal opacity (0.7) since the
          modal now contains the full thread text and the world feed
          behind it doesn't need to stay readable. Bigger card so
          long stages have room to breathe. */}
      <TouchableWithoutFeedback onPress={onAbandon}>
        <View style={styles.scrim} accessibilityViewIsModal={true}>
          <TouchableWithoutFeedback>
            <View style={styles.card}>
              <Text style={styles.title} accessibilityRole="header">
                {completed ? '★★ STORY THREAD COMPLETE' : '★ STORY THREAD'}
              </Text>
              <Text style={styles.subtitle}>at the {noun}</Text>
              <View style={styles.rule} />

              <ScrollView
                ref={scrollRef}
                style={[styles.stageScroll, { maxHeight: STAGE_SCROLL_MAX_HEIGHT }]}
                contentContainerStyle={styles.stageList}
              >
                {stageHistory.map((stage, i) => (
                  <View key={`stage-${i}`} style={styles.stageBlock}>
                    <Text style={styles.stageLabel}>{stage.label}</Text>
                    <Text style={styles.stageLine}>{stage.line}</Text>
                    {stage.reward ? (
                      <Text style={styles.stageReward}>{stage.reward}</Text>
                    ) : null}
                    {stage.arbiterLine ? (
                      <Text style={styles.stageArbiter}>"{stage.arbiterLine}"</Text>
                    ) : null}
                  </View>
                ))}
              </ScrollView>

              {/* CONTINUE / [TRADE NOW] / ABANDON. TRADE NOW only
                  appears when a vendor has been spawned in the
                  current scene (typically by the hook itself via
                  spawn_vendor effect). Player feedback (Pixel 10
                  Pro XL): the narration says "Roadfire Reclaimer
                  sits by the fire — tap to trade" but CONTINUE moved
                  past it without ever giving access to the vendor.
                  TRADE NOW closes the modal (without resolving the
                  hook — player can re-investigate the noun to
                  resume) and navigates to the vendor screen. */}
              <View style={styles.btnRow}>
                <Pressable
                  style={({ pressed }) => [styles.btn, styles.btnPrimary, pressed && styles.btnPressed]}
                  onPress={onContinue}
                  accessibilityRole="button"
                >
                  <Text style={styles.btnTextPrimary}>CONTINUE →</Text>
                </Pressable>
                {vendorName && onTrade ? (
                  <Pressable
                    style={({ pressed }) => [styles.btn, styles.btnTrade, pressed && styles.btnPressed]}
                    onPress={onTrade}
                    accessibilityRole="button"
                  >
                    <Text style={styles.btnTextTrade}>TRADE NOW</Text>
                  </Pressable>
                ) : null}
                <Pressable
                  style={({ pressed }) => [styles.btn, styles.btnNeutral, pressed && styles.btnPressed]}
                  onPress={onAbandon}
                  accessibilityRole="button"
                >
                  <Text style={styles.btnTextNeutral}>ABANDON</Text>
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
    maxWidth: 420,
    backgroundColor: '#0e1618',
    borderColor: '#6ab0c9',
    borderWidth: 1,
    borderRadius: 4,
    padding: 14,
  },
  title: { color: '#6ab0c9', fontSize: 13, fontWeight: '800', letterSpacing: 3 },
  subtitle: { color: '#6c8088', fontSize: 11, marginTop: 2, fontStyle: 'italic', letterSpacing: 1 },
  rule: { height: 1, backgroundColor: '#2b3a3e', marginTop: 8, marginBottom: 8 },
  stageScroll: { },
  stageList: { gap: 12, paddingVertical: 4 },
  stageBlock: {
    backgroundColor: '#131c1f',
    borderLeftColor: '#6ab0c9',
    borderLeftWidth: 2,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 6,
  },
  stageLabel: { color: '#6ab0c9', fontSize: 10, fontWeight: '700', letterSpacing: 1.5 },
  stageLine: { color: '#d6e4e8', fontSize: 13, lineHeight: 19 },
  stageReward: { color: '#9ec96a', fontSize: 12, lineHeight: 17 },
  stageArbiter: { color: '#bf9b6a', fontSize: 12, fontStyle: 'italic', lineHeight: 17 },
  btnRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 12 },
  btn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 3,
    borderWidth: 1,
    minWidth: 96,
    alignItems: 'center',
  },
  btnPressed: { opacity: 0.7 },
  btnPrimary: { backgroundColor: '#6ab0c9', borderColor: '#6ab0c9' },
  btnNeutral: { backgroundColor: 'transparent', borderColor: '#2b3a3e' },
  // OTA-284 — TRADE NOW button. Distinct treatment so it reads as
  // "alternative path" not "primary action" (CONTINUE is primary).
  // Olive/sage outline matches the existing vendor-banner accent on
  // ExplorationScreen so the visual link is implicit.
  btnTrade: { backgroundColor: '#131c1f', borderColor: '#9ec96a' },
  btnTextPrimary: { color: '#0e1618', fontWeight: '700', letterSpacing: 2, fontSize: 12 },
  btnTextNeutral: { color: '#bcd2db', fontWeight: '700', letterSpacing: 2, fontSize: 12 },
  btnTextTrade: { color: '#9ec96a', fontWeight: '700', letterSpacing: 2, fontSize: 12 },
});
