import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity } from 'react-native';
import { useGameStore } from '../state/gameStore';
import { getRaces, getFactions } from '../engine/character';

export function CharacterCreationScreen() {
  const startNewGame = useGameStore((s) => s.startNewGame);
  const setScreen = useGameStore((s) => s.setScreen);

  const [name, setName] = useState('');
  const [raceId, setRaceId] = useState(getRaces()[0]!.id);
  const [factionId, setFactionId] = useState(getFactions()[0]!.id);

  const races = getRaces();
  const factions = getFactions();

  const trimmedName = name.trim();
  const canStart = trimmedName.length >= 2;

  const handleStart = async () => {
    if (!canStart) return;
    await startNewGame({ name: trimmedName, raceId, factionId });
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>NEW EXPEDITION</Text>
      <ScrollView style={styles.scroll} contentContainerStyle={{ paddingBottom: 40 }}>
        <Text style={styles.label}>Name</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="A name to be remembered or forgotten"
          placeholderTextColor="#5a5246"
        />

        <Text style={styles.label}>Race</Text>
        {races.map((r) => (
          <TouchableOpacity
            key={r.id}
            style={[styles.option, raceId === r.id && styles.optionSelected]}
            onPress={() => setRaceId(r.id)}
          >
            <Text style={styles.optionName}>{r.name}</Text>
            <Text style={styles.optionDesc}>{r.description}</Text>
            <Text style={styles.optionMeta}>
              Base AC {r.baseAC} • {r.startingTCFormula} TC • HP bonus +{r.startingHPBonus}
            </Text>
          </TouchableOpacity>
        ))}

        <Text style={styles.label}>Faction</Text>
        {factions.map((f) => (
          <TouchableOpacity
            key={f.id}
            style={[styles.option, factionId === f.id && styles.optionSelected]}
            onPress={() => setFactionId(f.id)}
          >
            <Text style={styles.optionName}>{f.name}</Text>
            <Text style={styles.optionDesc}>{f.subtitle}</Text>
            <Text style={styles.optionMeta}>{f.goal}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.back} onPress={() => setScreen('title')}>
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.start, !canStart && styles.startDisabled]}
          onPress={handleStart}
          disabled={!canStart}
        >
          <Text style={styles.startText}>{canStart ? 'Begin' : 'Name required'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0908', padding: 16 },
  title: { color: '#e6d8b3', fontSize: 18, letterSpacing: 4, marginBottom: 12, textAlign: 'center' },
  scroll: { flex: 1 },
  label: { color: '#c9a86a', fontSize: 12, letterSpacing: 2, marginTop: 16, marginBottom: 6 },
  input: {
    backgroundColor: '#1a1714',
    borderColor: '#3a342c',
    borderWidth: 1,
    color: '#e6d8b3',
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: 4,
  },
  option: {
    backgroundColor: '#13110f',
    borderColor: '#3a342c',
    borderWidth: 1,
    padding: 10,
    borderRadius: 4,
    marginBottom: 8,
  },
  optionSelected: { borderColor: '#c9a86a' },
  optionName: { color: '#e6d8b3', fontWeight: '700', fontSize: 14 },
  optionDesc: { color: '#cdbf99', fontSize: 12, marginTop: 2 },
  optionMeta: { color: '#7a705c', fontSize: 11, marginTop: 4 },
  footer: { flexDirection: 'row', gap: 12, paddingTop: 8 },
  back: {
    flex: 1, padding: 12, borderColor: '#3a342c', borderWidth: 1, borderRadius: 4, alignItems: 'center',
  },
  backText: { color: '#7a705c', letterSpacing: 2 },
  start: {
    flex: 2, padding: 12, backgroundColor: '#3a342c', borderRadius: 4, alignItems: 'center',
  },
  startDisabled: { backgroundColor: '#1a1714', borderColor: '#3a342c', borderWidth: 1 },
  startText: { color: '#e6d8b3', fontWeight: '700', letterSpacing: 2 },
});
