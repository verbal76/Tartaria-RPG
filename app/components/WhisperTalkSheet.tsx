// ⚠⚠⚠ OTA-1547 — YULKA'S CONVERSATION GETS THE SCREEN.
//
// Owner, after OTA-1542 put her camp back on real dirt and the meet finally
// fired: *"yulka spoke, but then it was buried by instruction text … would a
// box on the screen that says speak to yulka pops up and when you hit it a
// talk box like the vendors pops up and the conversation is in there, that way
// it's your focus and you can accept or decline her fetch quest there and then
// you see the instructions. and the memory of that instance is persistent, but
// only for that instance."*
//
// ⚠⚠ THE SAME DISEASE OTA-1530 CURED FOR WANDERERS, in the whisper organ: the
// speech was never missing, it was buried — first by the three-command
// [system] burst fireYulkaMeet printed right behind it, then by the step's own
// open-ground filler ("You walk west… lost track of distance") which prints
// LATE in stepDirection while the whisper resolver runs EARLY. Both writers
// are silenced at the source (gameStore); this sheet is where the words live
// instead.
//
// ⚠⚠ THE BAR, NOT A POPUP. OTA-1530's dwell lesson: a card that opens itself
// covers the thing the player is reading. The meet prints her sighting and
// voice to the feed as always, and this bar appears above the input slot —
// SPEAK TO YULKA — for the player to open when they're ready. Tapping it
// raises a TalkSheet-style floating sheet (same gold frame, same
// parchment-on-soot) where the conversation is the only thing on screen and
// the decision is three buttons instead of three memorised commands. The typed
// commands still work — the buttons route through the same handlers.
//
// ⚠⚠ MEMORY OF THE INSTANCE, ON THE INSTANCE. The transcript is
// `WhisperRecord.talk`, persisted with the record itself: reopen the sheet
// mid-fetch (the bar stays, quieter) and everything she said — and the task
// brief — is still there, across app restarts. When the chain resolves, the
// record leaves activeWhispers and the memory goes with it. Persistent, but
// only for that instance — exactly as specced.
//
// ⚠ WHY THE SHEET SURVIVES THE ACCEPT: the armed check is on `talk` presence
// in a live pre-terminal stage, not on met_yulka alone. ACCEPT flips the stage
// under the open sheet; if visibility keyed on met_yulka the sheet would
// vanish mid-read with the brief still unread — the burial bug rebuilt out of
// its own cure. BUY and WALK AWAY remove the record, so those paths close the
// sheet by construction.

import React, { useMemo, useRef, useState } from 'react';
import { Modal, View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { useGameStore } from '../state/gameStore';

export function WhisperTalkSheet() {
  const whispers = useGameStore((s) => s.player?.activeWhispers);
  const enemies = useGameStore((s) => s.currentScene?.enemies?.length ?? 0);
  const answer = useGameStore((s) => s.answerYulka);
  const [open, setOpen] = useState(false);
  const scrollRef = useRef<ScrollView | null>(null);

  // The one whisper with a conversation on it, still live. done/ambush_armed
  // are the chain's terminal beats — the fire is cold, the bar goes away.
  const w = useMemo(
    () => (whispers ?? []).find(
      (x) => (x.talk?.length ?? 0) > 0 && x.stage !== 'done' && x.stage !== 'ambush_armed',
    ),
    [whispers],
  );

  // Combat owns the controls; the bar yields (same rule as the wanderer card).
  if (!w || enemies > 0) return null;

  const deciding = w.stage === 'met_yulka';

  const bar = (
    <TouchableOpacity
      style={[styles.bar, deciding ? styles.barDeciding : styles.barQuiet]}
      onPress={() => setOpen(true)}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={deciding
        ? 'Speak to Yulka — she is waiting on your answer'
        : 'Yulka — re-read what she said'}
    >
      <Text style={[styles.barText, deciding ? styles.barTextDeciding : styles.barTextQuiet]}>
        {deciding ? 'SPEAK TO YULKA' : 'YULKA — WHAT SHE SAID'}
      </Text>
      {deciding && <Text style={styles.barHint}>she's waiting</Text>}
    </TouchableOpacity>
  );

  const choose = (choice: 'accept' | 'buy' | 'leave') => {
    answer(choice);
    // BUY / WALK AWAY end the exchange and remove the record — close with it.
    // ACCEPT keeps the sheet up: the send-off and the task brief land in the
    // transcript the player is already looking at.
    if (choice !== 'accept') setOpen(false);
  };

  return (
    <>
      {bar}
      <Modal
        visible={open}
        transparent
        animationType="slide"
        onRequestClose={() => setOpen(false)}
      >
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <View style={styles.header}>
              <View style={styles.headerText}>
                <Text style={styles.kicker}>AT THE FIRE</Text>
                <Text style={styles.npcName}>Yulka</Text>
              </View>
              <TouchableOpacity
                style={styles.closeBtn}
                onPress={() => setOpen(false)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Step back — the conversation keeps"
              >
                <Text style={styles.closeText}>▾</Text>
              </TouchableOpacity>
            </View>

            <ScrollView
              ref={scrollRef}
              style={styles.transcript}
              contentContainerStyle={styles.transcriptInner}
              onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
            >
              {(w.talk ?? []).map((t, i) => (
                <Text
                  key={`${i}-${t.who}`}
                  style={[
                    styles.transcriptLine,
                    t.who === 'you' && styles.youLine,
                    t.who === 'note' && styles.noteLine,
                  ]}
                >
                  {t.text}
                </Text>
              ))}
            </ScrollView>

            {deciding ? (
              <>
                <TouchableOpacity
                  style={styles.primaryBtn}
                  onPress={() => choose('accept')}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel="Take the fetch job — five Discs on return"
                >
                  <Text style={styles.primaryText}>TAKE THE JOB — FIVE DISCS ON RETURN</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.secondaryBtn}
                  onPress={() => choose('buy')}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel="Buy five Discs for fifty TC"
                >
                  <Text style={styles.secondaryText}>BUY — 50 TC FOR 5 DISCS</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.secondaryBtn}
                  onPress={() => choose('leave')}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel="Walk away from her fire"
                >
                  <Text style={styles.secondaryText}>WALK AWAY</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.stepBackBtn}
                  onPress={() => setOpen(false)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel="Step back and decide later"
                >
                  <Text style={styles.stepBackText}>step back — decide later</Text>
                </TouchableOpacity>
              </>
            ) : (
              <TouchableOpacity
                style={styles.primaryBtn}
                onPress={() => setOpen(false)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <Text style={styles.primaryText}>CLOSE</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>
    </>
  );
}

// TalkSheet's palette, deliberately: the whisper conversation must read as the
// same kind of place as a vendor conversation, just with a fire in it.
const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 6,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 6,
  },
  // Undecided: the loudest row on the screen — she asked you to decide NOW.
  barDeciding: { backgroundColor: '#2a1f12', borderColor: '#f0c96a' },
  // Decided: a quiet re-read handle, not a demand.
  barQuiet: { backgroundColor: '#17150f', borderColor: '#3a342c' },
  barText: { fontSize: 13, fontWeight: '700', letterSpacing: 1.5 },
  barTextDeciding: { color: '#f0c96a' },
  barTextQuiet: { color: '#a2977b' },
  barHint: { color: '#a2977b', fontSize: 11, fontStyle: 'italic' },
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 14,
    paddingVertical: 22,
    backgroundColor: 'rgba(0,0,0,0.78)',
  },
  sheet: {
    height: '92%',
    backgroundColor: '#13110f',
    borderColor: '#f0c96a',
    borderWidth: 2,
    borderRadius: 14,
    padding: 14,
    gap: 8,
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerText: { flex: 1 },
  kicker: { color: '#c9a86a', fontSize: 10, fontWeight: '700', letterSpacing: 2 },
  npcName: { color: '#cdbf99', fontSize: 18, fontWeight: '700', letterSpacing: 1, marginTop: 2 },
  closeBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#3a342c',
  },
  closeText: { color: '#c9a86a', fontSize: 16, fontWeight: '700' },
  transcript: {
    flex: 1,
    borderColor: '#3a342c',
    borderWidth: 1,
    borderRadius: 6,
    backgroundColor: '#0f0d0b',
    paddingHorizontal: 10,
  },
  transcriptInner: { paddingVertical: 10, gap: 10 },
  transcriptLine: { color: '#e6d8b3', fontSize: 15, lineHeight: 22 },
  // Your choice, on TalkSheet's off-white plate — the one authored-by-you line.
  youLine: {
    backgroundColor: '#f2ead6',
    color: '#2b2419',
    fontWeight: '600',
    paddingVertical: 5,
    paddingHorizontal: 9,
    borderRadius: 4,
    borderLeftWidth: 3,
    borderLeftColor: '#c8a44d',
    marginTop: 6,
    marginBottom: 2,
    overflow: 'hidden',
  },
  // The task brief: out-of-voice, framed like the system information it is —
  // and re-readable here for the whole fetch leg, which is the point.
  noteLine: {
    color: '#8aa0a4',
    fontSize: 14,
    lineHeight: 21,
    borderColor: '#3a342c',
    borderWidth: 1,
    borderRadius: 4,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: '#13110f',
  },
  primaryBtn: {
    borderColor: '#c9a86a',
    borderWidth: 1,
    borderRadius: 4,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: '#2a1f12',
  },
  primaryText: { color: '#c9a86a', fontSize: 12, fontWeight: '700', letterSpacing: 1.5 },
  secondaryBtn: {
    borderColor: '#6b5c3a',
    borderWidth: 1,
    borderRadius: 4,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: '#17150f',
  },
  secondaryText: { color: '#e6d8b3', fontSize: 12, letterSpacing: 1.5 },
  stepBackBtn: { alignSelf: 'center', paddingVertical: 8, paddingHorizontal: 12 },
  stepBackText: {
    color: '#8aa0a4',
    fontSize: 11,
    letterSpacing: 0.6,
    textDecorationLine: 'underline',
  },
});
