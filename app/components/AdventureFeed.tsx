import React, { useEffect, useRef } from 'react';
import { ScrollView, View, Text, StyleSheet } from 'react-native';
import type { GameLogEntry, LogChannel } from '../engine/types';

interface Props { entries: GameLogEntry[]; }

const channelColors: Record<LogChannel, string> = {
  player: '#7fb8ff',
  arbiter: '#c9a86a',
  world: '#cdbf99',
  system: '#7a705c',
  combat: '#e07a5f',
  reward: '#9ec96a',
};

export function AdventureFeed({ entries }: Props) {
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    scrollRef.current?.scrollToEnd({ animated: true });
  }, [entries.length]);

  return (
    <ScrollView ref={scrollRef} style={styles.container} contentContainerStyle={styles.content}>
      {entries.map((entry) => (
        <View key={entry.id} style={styles.entry}>
          <Text style={[styles.channel, { color: channelColors[entry.channel] }]}>
            {entry.channel === 'player' ? 'YOU' : entry.channel.toUpperCase()}
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
