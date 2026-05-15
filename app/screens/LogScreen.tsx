import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useGameStore } from '../state/gameStore';
import { readFullLog } from '../engine/saveSystem';

export function LogScreen() {
  const setScreen = useGameStore((s) => s.setScreen);
  const [diskLog, setDiskLog] = useState<string>('Loading…');

  useEffect(() => {
    readFullLog().then((text) => setDiskLog(text || '(no log yet)'));
  }, []);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => setScreen('title')}><Text style={styles.back}>← back</Text></TouchableOpacity>
        <Text style={styles.title}>FULL GAME LOG</Text>
        <View style={{ width: 60 }} />
      </View>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <Text style={styles.body}>{diskLog}</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0908', padding: 12 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  back: { color: '#7a705c', fontSize: 13 },
  title: { color: '#e6d8b3', letterSpacing: 4, fontSize: 14 },
  scroll: { flex: 1, backgroundColor: '#13110f', borderColor: '#3a342c', borderWidth: 1, borderRadius: 4, padding: 8 },
  content: { paddingBottom: 24 },
  body: { color: '#cdbf99', fontFamily: 'monospace', fontSize: 11, lineHeight: 16 },
});
