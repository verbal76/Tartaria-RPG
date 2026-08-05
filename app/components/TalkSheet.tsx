// OTA-1118 — TALKING IS ITS OWN SCREEN NOW.
//
// Owner, from the device: "the talk box is bigger than the exploration window
// so I don't get to see what he actually says unless I stop talking." Then,
// weighing the fix: "should talking be a whole separate full or 3/4 screen
// popup that way the story text is the only thing to read."
//
// Yes — but only because the REPLIES MOVED IN WITH IT. A full-screen popup
// that still routed answers to the feed behind it would be the current bug
// made total: you'd have to close the conversation to read every single line.
// What makes the tall view work is that the exchange is rendered INSIDE it.
// Ask, read the answer where you're already looking, ask the next thing. STOP
// TALKING is a choice, never a step you're forced through to see what was said.
//
// The transcript is every feed entry stamped at or after `pendingTalk.startedAtTs`
// — a WINDOW on the real feed, not a copy. dialogue.ts still routes every reply
// through appendLog exactly as it always has, so the exploration log remains the
// whole record and closing the conversation leaves the history intact behind it.
//
// ⚠ OTA-1121 — the window is keyed on a TIMESTAMP, and it must stay one. The
// first cut used an INDEX (`gameLog.length` at open), which is silently wrong the
// moment the buffer reaches its cap: gameLog is `.slice(-MAX_LOG_IN_MEMORY)`d on
// every append, so past 500 entries the array stops growing and every index
// shifts down by one per line. The mark then pointed past the end forever and the
// transcript rendered EMPTY — replies still arriving in the exploration feed
// behind the sheet, which is precisely the bug this whole view was built to fix.
// It only showed up in long sessions, which is to say: in real ones.
//
// The collapse bar (OTA-1117's approved design, kept as an OPTION rather than a
// requirement): the sheet drops to a single breadcrumb row showing who you're
// talking to and how many questions are left, so you can read the world behind
// it and tap once to come back. Nothing is lost on collapse — same conversation,
// same scroll, same spent topics.
//
// OTA-1119 — the sheet FLOATS. Owner: "let's shrink the width of the talk
// screen so it doesn't touch the edges of the screen and let's put the outside
// edge detail [a brighter] gold color so it pops and you understand a border is
// there." It was welded to the bottom bezel, which gave it no readable edge —
// it read as the app rather than as a layer over the app. Now it sits inside a
// gutter on all four sides, framed in a gold brighter than anything inside it,
// and the darkened world visible around it is what tells you this is something
// you are standing in and can step out of.
//
// No spinner, no async, no model. See engine/dialogue.ts.

import React, { useMemo, useRef, useState } from 'react';
import { Modal, View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { useGameStore } from '../state/gameStore';
import { lockedTeaserLabel } from '../engine/dialogue';

export function TalkSheet() {
  const ctx = useGameStore((s) => s.pendingTalk);
  const raise = useGameStore((s) => s.raiseTopic);
  const close = useGameStore((s) => s.closeTalk);
  const tapTeaser = useGameStore((s) => s.tapLockedTeaser);
  const talked = useGameStore((s) => s.worldMemory.talkedTopics);
  const gameLog = useGameStore((s) => s.gameLog);

  // Collapsed = breadcrumb only. Local state: a conversation that survives a
  // collapse is the point, so this must NOT live in the store's pendingTalk
  // (which persists) — it's a view preference for this glance, nothing more.
  const [collapsed, setCollapsed] = useState(false);
  const transcriptRef = useRef<ScrollView | null>(null);

  const spent = useMemo(() => {
    const npcId = ctx?.npcId;
    return (topicId: string, lineCount: number) =>
      !!npcId && (talked?.[`${npcId}:${topicId}`] ?? 0) >= lineCount;
  }, [ctx?.npcId, talked]);

  // Unasked first, asked sunk — but never hidden. A list that silently shrinks
  // reads as the game losing content, and the player has no way to tell "asked
  // already" from "never existed". Authored order is preserved inside each half
  // (Array.prototype.sort is stable), so the ladder still reads as a ladder.
  const ordered = useMemo(() => {
    if (!ctx) return [];
    return [...ctx.topics].sort((a, b) => {
      const aAsked = spent(a.id, a.lines.length);
      const bAsked = spent(b.id, b.lines.length);
      return aAsked === bAsked ? 0 : aAsked ? 1 : -1;
    });
  }, [ctx, spent]);

  const remaining = useMemo(
    () => ordered.filter((t) => !spent(t.id, t.lines.length)).length,
    [ordered, spent],
  );

  // The exchange itself: every feed line since this conversation opened. Sliced,
  // not stored — the log is the record of truth and this is a window on it.
  const transcript = useMemo(
    () => (ctx ? gameLog.filter((e) => e.ts >= ctx.startedAtTs) : []),
    [ctx, gameLog],
  );

  if (!ctx) return null;

  const breadcrumb = (
    <TouchableOpacity
      style={styles.bar}
      onPress={() => setCollapsed(false)}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`Talking with ${ctx.npcName}, ${remaining} question${remaining === 1 ? '' : 's'} left. Tap to reopen.`}
    >
      <View style={styles.barLeft}>
        <Text style={styles.barChevron}>▴</Text>
        <Text style={styles.barName} numberOfLines={1}>{ctx.npcName}</Text>
      </View>
      <Text style={styles.barCount}>
        {remaining > 0 ? `${remaining} left` : 'nothing left to ask'}
      </Text>
    </TouchableOpacity>
  );

  return (
    <>
      {/* The breadcrumb holds the controls slot whether the sheet is up or not,
          so collapsing never leaves an empty gap where the input box was. */}
      {breadcrumb}

      <Modal
        visible={!collapsed}
        transparent
        animationType="slide"
        onRequestClose={() => setCollapsed(true)}
      >
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <View style={styles.header}>
              <View style={styles.headerText}>
                <Text style={styles.kicker}>CONVERSATION</Text>
                <Text style={styles.npcName} numberOfLines={1}>{ctx.npcName}</Text>
              </View>
              <TouchableOpacity
                style={styles.collapseBtn}
                onPress={() => setCollapsed(true)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Collapse the conversation — it stays open"
              >
                <Text style={styles.collapseText}>▾</Text>
              </TouchableOpacity>
            </View>

            {/* THE EXCHANGE — the reason this view exists. */}
            <ScrollView
              ref={transcriptRef}
              style={styles.transcript}
              contentContainerStyle={styles.transcriptInner}
              onContentSizeChange={() => transcriptRef.current?.scrollToEnd({ animated: true })}
            >
              {transcript.length === 0 ? (
                <Text style={styles.transcriptEmpty}>
                  {ctx.npcName} waits for you to say something.
                </Text>
              ) : (
                transcript.map((e) => (
                  <Text key={e.id} style={styles.transcriptLine}>{e.text}</Text>
                ))
              )}
            </ScrollView>

            <Text style={styles.trayLabel}>ASK ABOUT</Text>

            <ScrollView style={styles.topics} contentContainerStyle={styles.topicsInner}>
              {ordered.map((t) => {
                const asked = spent(t.id, t.lines.length);
                return (
                  <TouchableOpacity
                    key={t.id}
                    style={[styles.topicBtn, asked && styles.topicBtnSpent]}
                    onPress={() => raise(t.id)}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={asked ? `${t.label}, already asked` : t.label}
                  >
                    <Text style={[styles.topicText, asked && styles.topicTextSpent]}>
                      {asked ? `${t.label}  (asked)` : t.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}

              {/* OTA-1113 — the door the player can see: a COUNT of what's still
                  gated shut, never the labels. Appears only once this person has
                  placed you (lockedCount is 0 below `known` and for the wronged).
                  Tapping it gets an in-voice deflection — the person telling you,
                  in character, that the rest is earned. */}
              {ctx.lockedCount > 0 && (
                <TouchableOpacity
                  style={styles.teaserBtn}
                  onPress={tapTeaser}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={`${ctx.lockedCount} locked topic${ctx.lockedCount > 1 ? 's' : ''} — ask about them`}
                >
                  <Text style={styles.teaserText}>
                    {lockedTeaserLabel(ctx.npcName, ctx.regard, ctx.lockedCount)}
                  </Text>
                </TouchableOpacity>
              )}
            </ScrollView>

            <TouchableOpacity
              style={styles.stopBtn}
              onPress={close}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Stop talking"
            >
              <Text style={styles.stopText}>STOP TALKING</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

// House tokens only — the same parchment-on-soot palette the DiceRoller and the
// old bottom sheet used, so the tall view reads as the same game, just bigger.
const styles = StyleSheet.create({
  // OTA-1119 — the sheet is INSET from every edge rather than welded to the
  // bottom of the screen. Owner: "let's shrink the width of the talk screen so
  // it doesn't touch the edges of the screen and let's put the outside edge
  // detail [a brighter] gold color so it pops and you understand a border is
  // there." A panel that runs to the bezel has no readable edge — it reads as
  // the app, not as a thing laid over the app. The darkened world showing in
  // the gutter is what tells you the conversation is a layer you can leave.
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 14,
    paddingVertical: 22,
    backgroundColor: 'rgba(0,0,0,0.78)',
  },
  sheet: {
    // Was 88% welded to the bottom. Slightly shorter now that it floats, so the
    // gutter is visible top AND bottom — the border has to be seen to work.
    height: '92%',
    backgroundColor: '#13110f',
    // Brighter than any gold inside the sheet (#c9a86a kicker, #6b5c3a topic
    // rows), and 2px so it survives a mid-range phone's rounding. The frame is
    // deliberately the loudest edge on screen.
    borderColor: '#f0c96a',
    borderWidth: 2,
    borderRadius: 14,
    padding: 14,
    gap: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerText: { flex: 1 },
  kicker: {
    color: '#c9a86a',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 2,
  },
  npcName: {
    color: '#cdbf99',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 1,
    marginTop: 2,
  },
  collapseBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#3a342c',
  },
  collapseText: { color: '#c9a86a', fontSize: 16, fontWeight: '700' },
  // The exchange gets the larger share: this is what the owner could not read.
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
  transcriptEmpty: { color: '#a2977b', fontSize: 14, fontStyle: 'italic', lineHeight: 20 },
  trayLabel: {
    color: '#8aa0a4',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.6,
    marginTop: 2,
  },
  // Capped so a 16-topic vendor cannot push the exchange off the screen — the
  // exact failure this OTA exists to fix, reintroduced from the other side.
  topics: { maxHeight: '34%' },
  topicsInner: { gap: 6 },
  topicBtn: {
    borderColor: '#6b5c3a',
    borderWidth: 1,
    borderRadius: 4,
    backgroundColor: '#17150f',
    paddingVertical: 11,
    paddingHorizontal: 12,
  },
  topicBtnSpent: { borderColor: '#3a342c' },
  topicText: { color: '#e6d8b3', fontSize: 14 },
  topicTextSpent: { color: '#a2977b' },
  // OTA-1113 — the teaser row reads as a held door, not a question: dashed
  // border, muted ink, same tap affordance as the topics above it.
  teaserBtn: {
    borderColor: '#3a342c',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 4,
    backgroundColor: '#13110f',
    paddingVertical: 11,
    paddingHorizontal: 12,
  },
  teaserText: { color: '#a2977b', fontSize: 14, fontStyle: 'italic' },
  stopBtn: {
    backgroundColor: '#3a342c',
    borderRadius: 4,
    paddingVertical: 12,
    alignItems: 'center',
  },
  stopText: {
    color: '#c9a86a',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 2,
  },
  // The collapsed breadcrumb: one row in the controls slot, same height as the
  // input box it stands in for, so collapsing doesn't shift the feed.
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#17150f',
    borderColor: '#6b5c3a',
    borderWidth: 1,
    borderRadius: 6,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  barLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  barChevron: { color: '#c9a86a', fontSize: 14, fontWeight: '700' },
  barName: { color: '#cdbf99', fontSize: 14, fontWeight: '700', letterSpacing: 1 },
  barCount: { color: '#a2977b', fontSize: 11, fontStyle: 'italic' },
});
