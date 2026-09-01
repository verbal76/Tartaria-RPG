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
import { findChain, pronounForms, whisperRouteTarget } from '../engine/whispers';
import { playerGridCell } from '../state/playerGrid';

export function WhisperTalkSheet() {
  const whispers = useGameStore((s) => s.player?.activeWhispers);
  const enemies = useGameStore((s) => s.currentScene?.enemies?.length ?? 0);
  const answer = useGameStore((s) => s.answerWhisper);
  const handBack = useGameStore((s) => s.handBackWhisperGoods);
  // OTA-1549 — the course is set from INSIDE the conversation. Owner: "from
  // that talking screen, we should be able to Auto route and accept from that
  // instead of typing … that button should be highlighted inside the talk
  // screen. same as the auto route button."
  const setWhisperCourse = useGameStore((s) => s.setWhisperCourse);
  const setScreen = useGameStore((s) => s.setScreen);
  // The player's ABSOLUTE cell (arb47 / OTA-1542), subscribed so the course
  // button knows when you are already standing on the objective.
  // ⚠ Subscribe to the PLAYER (a stable reference between updates) and derive
  // the cell — a selector returning playerGridCell()'s fresh object every call
  // hands zustand a new snapshot on every render and spins.
  const player = useGameStore((s) => s.player);
  const cell = useMemo(() => (player ? playerGridCell(player) : null), [player]);
  const [open, setOpen] = useState(false);
  const scrollRef = useRef<ScrollView | null>(null);
  // ⚠⚠⚠ OTA-1613 — THE GIVER GETS TO FINISH SPEAKING. Paying out removes the
  // whisper record (arb120 closes a paid contract on the spot), which would
  // unmount this sheet mid-sentence and hand the moment straight back to the
  // generic completion card — the exact anticlimax this OTA is about. The
  // closing turns are held here instead, so the conversation stays up with his
  // line and the take in it until the player closes it themselves.
  const [farewell, setFarewell] = useState<
    { npcName: string; kicker: string; turns: { who: string; text: string }[] } | null
  >(null);

  // The one whisper with a conversation on it, still live. done/ambush_armed
  // are the chain's terminal beats — the fire is cold, the bar goes away.
  // OTA-1548 — any chain's whisper qualifies; the name, pronoun, kicker and
  // buttons all come off its ChainDef content.
  const w = useMemo(
    () => (whispers ?? []).find(
      (x) => (x.talk?.length ?? 0) > 0 && x.stage !== 'done' && x.stage !== 'ambush_armed' && findChain(x.id),
    ),
    [whispers],
  );
  const chain = w ? findChain(w.id) : undefined;
  // OTA-1548 — when the armed whisper changes identity (this one resolved,
  // another chain armed later), the sheet must not inherit the old open state
  // and pop up uninvited over the new encounter.
  const wid = w?.id;
  React.useEffect(() => { setOpen(false); }, [wid]);

  // ⚠ OTA-1613 — the farewell outlives the record, and only the player closes it.
  if (farewell) {
    return (
      <Modal visible transparent animationType="slide" onRequestClose={() => setFarewell(null)}>
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <View style={styles.header}>
              <View style={styles.headerText}>
                <Text style={styles.kicker}>{farewell.kicker}</Text>
                <Text style={styles.npcName}>{farewell.npcName}</Text>
              </View>
            </View>
            <ScrollView style={styles.transcript} contentContainerStyle={styles.transcriptInner}>
              {farewell.turns.map((t, i) => (
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
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={() => { setFarewell(null); setOpen(false); }}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <Text style={styles.primaryText}>CLOSE</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  }
  // Combat owns the controls; the bar yields (same rule as the wanderer card).
  if (!w || !chain || enemies > 0) return null;

  const c = chain.content;
  const saidWord = pronounForms(c.pronoun).subjCap.toUpperCase();
  const waitingWord = c.pronoun === 'they' ? "they're waiting" : `${c.pronoun}'s waiting`;
  const deciding = w.stage === 'met_yulka';
  // ⚠⚠ OTA-1613 — the goods are in hand and the giver is in front of you.
  const handing = w.stage === 'handback';

  const giveItBack = () => {
    const turns = handBack();
    if (turns.length) setFarewell({ npcName: c.npcName, kicker: c.kicker, turns });
    else setOpen(false);
  };

  const bar = (
    <TouchableOpacity
      style={[styles.bar, deciding || handing ? styles.barDeciding : styles.barQuiet]}
      onPress={() => setOpen(true)}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={deciding
        ? `Speak to ${c.npcName} — waiting on your answer`
        : `${c.npcName} — re-read what was said`}
    >
      <Text style={[styles.barText, deciding || handing ? styles.barTextDeciding : styles.barTextQuiet]}>
        {deciding || handing ? `▸ SPEAK TO ${c.npcName.toUpperCase()}` : `${c.npcName.toUpperCase()} — WHAT ${saidWord} SAID`}
      </Text>
      {(deciding || handing) && (
        <Text style={styles.barHintDeciding}>
          {handing ? `${c.goodsShort} in hand` : waitingWord}
        </Text>
      )}
    </TouchableOpacity>
  );

  // ⚠⚠ OTA-1549 — SET COURSE LIVES IN THE CONVERSATION. Owner: *"from that
  // talking screen, we should be able to Auto route and accept from that
  // instead of typing."* The route is the SAME whisperRouteTarget the
  // Contracts panel walks, so the sheet cannot send you anywhere Contracts
  // wouldn't — and it is stage-aware, so after ACCEPT the very same button
  // re-aims from the giver's fire onto the mark's tile without being re-read.
  const route = whisperRouteTarget(w);
  // ⚠ SUBSCRIBED, not snapshotted: the player's cell moves under this
  // component (the course walks them a tile at a time), and a getState() read
  // would leave the button offering a walk to ground they are standing on.
  const here = !!route && cell != null && cell.x === route.gridX && cell.y === route.gridY;

  const takeCourse = () => {
    if (!route) return;
    setWhisperCourse(route.gridX, route.gridY, route.label);
    setOpen(false);
    setScreen('exploration');
  };

  const choose = (choice: 'accept' | 'buy' | 'leave') => {
    answer(choice);
    // WALK AWAY ends the exchange and removes the record — close with it. A
    // successful BUY removes the record too (the unmount closes the sheet),
    // but a FAILED buy (short TC, or a giver who won't sell) keeps the record,
    // and the sheet stays up so the refusal lands in the transcript the
    // player is already looking at. ACCEPT keeps the sheet up for the brief.
    if (choice === 'leave') setOpen(false);
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
                <Text style={styles.kicker}>{c.kicker}</Text>
                <Text style={styles.npcName}>{c.npcName}</Text>
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

            {/* ⚠⚠ OTA-1549 — the route rides ABOVE the decision buttons and
                stays through every stage: while deciding it is the walk to the
                fire you are already at (so it is hidden — `here`), and the
                moment you ACCEPT it re-aims at the mark without the sheet
                closing. Filled, like the SPEAK chip: a thing you can use now. */}
            {route && !here && (
              <TouchableOpacity
                style={styles.routeBtn}
                onPress={takeCourse}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`Set course to ${route.label}`}
              >
                <Text style={styles.routeBtnText}>▸ SET COURSE TO {route.label.toUpperCase()}</Text>
              </TouchableOpacity>
            )}

            {handing ? (
              <>
                {/* ⚠⚠⚠ OTA-1613 — THE BEAT HE WAS MISSING. Owner: *"I should
                    have talked to him again, and then given my award in the
                    chat window from him."* Handing it over is a deliberate act
                    with a button, not something arrival does to you, and the
                    reply lands in this transcript rather than the world feed. */}
                <TouchableOpacity
                  style={styles.primaryBtn}
                  onPress={giveItBack}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={`Hand over ${c.goodsLong}`}
                >
                  <Text style={styles.primaryText}>HAND OVER {c.goodsShort.toUpperCase()}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.stepBackBtn}
                  onPress={() => setOpen(false)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel="Step back — hand it over later"
                >
                  <Text style={styles.stepBackText}>step back — hand it over later</Text>
                </TouchableOpacity>
              </>
            ) : deciding ? (
              <>
                <TouchableOpacity
                  style={styles.primaryBtn}
                  onPress={() => choose('accept')}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel="Take the fetch job"
                >
                  <Text style={styles.primaryText}>{c.acceptBtnLabel}</Text>
                </TouchableOpacity>
                {c.buy && c.buyBtnLabel && (
                  <TouchableOpacity
                    style={styles.secondaryBtn}
                    onPress={() => choose('buy')}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={`Buy for ${c.buy.costTc} TC`}
                  >
                    <Text style={styles.secondaryText}>{c.buyBtnLabel}</Text>
                  </TouchableOpacity>
                )}
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
  // ⚠⚠⚠ OTA-1549 — UNDECIDED IS FILLED, NOT OUTLINED. Owner: *"in the yulka
  // what she said button I didn't even see that thing. maybe if that button is
  // active and can be used we make it a different color, or we make it filled
  // in like we do the weapons that can be used during combat."* An outlined
  // gold-on-soot row above the input slot reads as chrome; the game's own
  // convention for A THING YOU CAN USE RIGHT NOW is a filled plate. So the
  // waiting state is solid gold with dark text — the loudest row on the
  // screen, because someone is standing there waiting on an answer.
  barDeciding: { backgroundColor: '#f0c96a', borderColor: '#f7dc9a' },
  // Decided: back to a quiet outlined re-read handle, not a demand.
  barQuiet: { backgroundColor: '#17150f', borderColor: '#3a342c' },
  barText: { fontSize: 13, fontWeight: '700', letterSpacing: 1.5 },
  barTextDeciding: { color: '#241a09' },
  barTextQuiet: { color: '#a2977b' },
  barHint: { color: '#a2977b', fontSize: 11, fontStyle: 'italic' },
  // The hint rides ON the filled plate while deciding, so it needs the dark ink.
  barHintDeciding: { color: '#4a3714', fontSize: 11, fontStyle: 'italic' },
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
  // OTA-1549 — the in-sheet course button, in the SET COURSE blue every other
  // route control in the game already uses (ContractsScreen.routeBtn), but
  // FILLED rather than outlined, because in here it is the live action.
  routeBtn: {
    backgroundColor: '#22364e',
    borderColor: '#6f93c4',
    borderWidth: 1,
    borderRadius: 4,
    paddingVertical: 12,
    alignItems: 'center',
  },
  routeBtnText: { color: '#cfe2ff', fontWeight: '700', letterSpacing: 1, fontSize: 11 },
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
