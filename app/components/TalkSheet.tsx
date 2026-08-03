// OTA-1099 — THE CONVERSATION LIVES AT THE BOTTOM OF THE SCREEN.
//
// Owner, from his first live TALK interaction (Tarek, business topic — the
// old modal stayed covering the screen): "I think the popup should be at the
// bottom of the screen like the dice rolls and just have a list of things to
// ask, and then you close when you want to be done talking. I think all
// talking should be like this."
//
// So this is a BOTTOM SHEET, not a modal: it renders in ExplorationScreen's
// controls slot — exactly where the DiceRoller goes — replacing the input box
// while the conversation is open. The feed stays visible above it, which is
// the whole point: replies land in the feed (engine/dialogue.ts routes them
// there and always has), and now the player can actually READ them while the
// topic list waits below.
//
// The exchange STAYS OPEN after a topic is raised — the reply goes to the
// feed, the list re-renders with that topic spent, and the player asks
// something else or taps STOP TALKING. That is what makes it a conversation
// rather than a menu that fires once.
//
// No spinner, no async, no model. See engine/dialogue.ts.

import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { useGameStore } from '../state/gameStore';

export function TalkSheet() {
  const ctx = useGameStore((s) => s.pendingTalk);
  const raise = useGameStore((s) => s.raiseTopic);
  const close = useGameStore((s) => s.closeTalk);
  const talked = useGameStore((s) => s.worldMemory.talkedTopics);

  if (!ctx) return null;

  const spent = (topicId: string, lineCount: number) =>
    (talked?.[`${ctx.npcId}:${topicId}`] ?? 0) >= lineCount;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.kicker}>CONVERSATION</Text>
        <Text style={styles.hint}>replies land in the feed above</Text>
      </View>
      <Text style={styles.npcName}>{ctx.npcName}</Text>

      {/* The list of things to ask — capped so the sheet never grows into a
          screen cover; past the cap it scrolls within itself. */}
      <ScrollView style={styles.topics} contentContainerStyle={styles.topicsInner}>
        {ctx.topics.map((t) => {
          const asked = spent(t.id, t.lines.length);
          return (
            <TouchableOpacity
              key={t.id}
              // A spent topic stays VISIBLE and marked rather than vanishing: a
              // list that silently shrinks reads as the game losing content, and
              // the player has no way to tell "asked already" from "never
              // existed".
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
  );
}

// Same skin as the DiceRoller this sheet shares a slot with — one bottom-of-
// screen interaction language, house tokens only.
const styles = StyleSheet.create({
  container: {
    backgroundColor: '#13110f',
    borderColor: '#3a342c',
    borderWidth: 1,
    borderRadius: 6,
    padding: 14,
    gap: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  kicker: {
    color: '#c9a86a',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 2,
  },
  hint: {
    color: '#a2977b',
    fontSize: 10,
    fontStyle: 'italic',
  },
  npcName: {
    color: '#cdbf99',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 1,
  },
  topics: {
    maxHeight: 230,
  },
  topicsInner: {
    gap: 6,
  },
  topicBtn: {
    borderColor: '#6b5c3a',
    borderWidth: 1,
    borderRadius: 4,
    backgroundColor: '#17150f',
    paddingVertical: 11,
    paddingHorizontal: 12,
  },
  topicBtnSpent: {
    borderColor: '#3a342c',
  },
  topicText: {
    color: '#e6d8b3',
    fontSize: 14,
  },
  topicTextSpent: {
    color: '#a2977b',
  },
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
});
