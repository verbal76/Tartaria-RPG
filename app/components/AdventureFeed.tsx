import React, { useEffect, useRef } from 'react';
import { ScrollView, View, Text, StyleSheet } from 'react-native';
import type { GameLogEntry, LogChannel } from '../engine/types';

interface Props { entries: GameLogEntry[]; }

const channelColors: Record<LogChannel, string> = {
  player: '#7fb8ff',
  arbiter: '#c9a86a',
  world: '#cdbf99',
  system: '#a89a7a',  // dice roll results — warm amber, readable
  combat: '#e07a5f',
  reward: '#9ec96a',
  cognitive: '#7a705c',  // dim grey — debug-style, not story content
  debug: '#605648',  // dimmer still — only shows up in the COPY ALL log
};

// The `cognitive` channel is MiniLM's emotion/intent classifier output —
// useful as a dev diagnostic but pure noise to the player. The `debug`
// channel is engine-side diagnostics (parser decisions, combat range
// transitions). Both still land in the on-disk log so we can read them in
// LogScreen → COPY ALL when chasing a bug.
const HIDDEN_CHANNELS: ReadonlySet<LogChannel> = new Set(['cognitive', 'debug']);

export function AdventureFeed({ entries }: Props) {
  const scrollRef = useRef<ScrollView>(null);
  const visible = entries.filter((e) => !HIDDEN_CHANNELS.has(e.channel));

  useEffect(() => {
    scrollRef.current?.scrollToEnd({ animated: true });
  }, [visible.length]);

  return (
    <ScrollView ref={scrollRef} style={styles.container} contentContainerStyle={styles.content}>
      {visible.map((entry) => (
        <View key={entry.id} style={styles.entry}>
          <Text style={[styles.channel, { color: channelColors[entry.channel] }]}>
            {entry.channel === 'player' ? 'YOU'
              : entry.channel === 'system' && entry.text.startsWith('d') ? 'ROLL'
              : entry.channel.toUpperCase()}
          </Text>
          <Text style={[styles.body, { color: channelColors[entry.channel] }]}>
            {entry.text}
          </Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0908',
    borderColor: '#3a342c',
    borderWidth: 1,
    borderRadius: 4,
    padding: 8,
  },
  content: { paddingBottom: 12 },
  entry: { marginBottom: 8 },
  channel: { fontSize: 10, fontWeight: '700', letterSpacing: 1, marginBottom: 2 },
  body: { fontSize: 14, lineHeight: 20 },
});
