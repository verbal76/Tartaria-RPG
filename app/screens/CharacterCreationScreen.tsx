import React, { useState, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity } from 'react-native';
import { useGameStore } from '../state/gameStore';
import { getRaces, getFactions } from '../engine/character';

type Step = 'race' | 'faction' | 'name';

const STEP_ORDER: Step[] = ['race', 'faction', 'name'];
const STEP_TITLE: Record<Step, string> = {
  race: 'CHOOSE YOUR RACE',
  faction: 'CHOOSE YOUR FACTION',
  name: 'NAME YOUR TARTARIAN',
};

export function CharacterCreationScreen() {
  const startNewGame = useGameStore((s) => s.startNewGame);
  const setScreen = useGameStore((s) => s.setScreen);

  const races = getRaces();
  const factions = getFactions();

  const [step, setStep] = useState<Step>('race');
  const [name, setName] = useState('');
  const [raceId, setRaceId] = useState(races[0]!.id);
  const [factionId, setFactionId] = useState(factions[0]!.id);
  const nameInputRef = useRef<TextInput>(null);

  const trimmedName = name.trim();
  const canStart = trimmedName.length >= 2;

  const stepIndex = STEP_ORDER.indexOf(step);
  const selectedRace = races.find((r) => r.id === raceId) ?? races[0]!;
  const selectedFaction = factions.find((f) => f.id === factionId) ?? factions[0]!;

  const goBack = () => {
    if (step === 'race') {
      setScreen('title');
    } else if (step === 'faction') {
      setStep('race');
    } else {
      setStep('faction');
    }
  };

  const goNext = () => {
    if (step === 'race') setStep('faction');
    else if (step === 'faction') setStep('name');
    else if (step === 'name') {
      if (canStart) {
        void startNewGame({ name: trimmedName, raceId, factionId });
      } else {
        // Name missing — pop the input back into focus so the keyboard
        // appears immediately and the player can type.
        nameInputRef.current?.focus();
      }
    }
  };

  const nextLabel = step === 'name'
    ? (canStart ? 'BEGIN' : 'NAME REQUIRED')
    : 'NEXT →';

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>NEW EXPEDITION</Text>
        <Text style={styles.headerStep}>Step {stepIndex + 1} of {STEP_ORDER.length}</Text>
      </View>
      <Text style={styles.stepTitle}>{STEP_TITLE[step]}</Text>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {step === 'race' && races.map((r) => (
          <TouchableOpacity
            key={r.id}
            style={[styles.option, raceId === r.id && styles.optionSelected]}
            onPress={() => setRaceId(r.id)}
            activeOpacity={0.7}
          >
            <Text style={styles.optionName}>{r.name}</Text>
            <Text style={styles.optionDesc}>{r.description}</Text>
            <Text style={styles.optionMeta}>
              Base AC {r.baseAC} · {r.startingTCFormula} TC · HP bonus +{r.startingHPBonus}
            </Text>
          </TouchableOpacity>
        ))}

        {step === 'faction' && (
          <>
            <Text style={styles.contextLine}>Race: {selectedRace.name}</Text>
            {factions.map((f) => (
              <TouchableOpacity
                key={f.id}
                style={[styles.option, factionId === f.id && styles.optionSelected]}
                onPress={() => setFactionId(f.id)}
                activeOpacity={0.7}
              >
                <Text style={styles.optionName}>{f.name}</Text>
                <Text style={styles.optionDesc}>{f.subtitle}</Text>
                <Text style={styles.optionMeta}>{f.goal}</Text>
              </TouchableOpacity>
            ))}
          </>
        )}

        {step === 'name' && (
          <View style={styles.nameBlock}>
            <Text style={styles.contextLine}>{selectedRace.name} · {selectedFaction.name}</Text>
            <Text style={styles.label}>Name</Text>
            <TextInput
              ref={nameInputRef}
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="A name to be remembered or forgotten"
              placeholderTextColor="#5a5246"
              autoCapitalize="words"
              autoCorrect={false}
              returnKeyType="done"
              onSubmitEditing={() => { if (canStart) void startNewGame({ name: trimmedName, raceId, factionId }); }}
            />
            <Text style={styles.nameHint}>At least 2 letters. Tap BEGIN when ready.</Text>
          </View>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={goBack}
          activeOpacity={0.7}
          hitSlop={8}
        >
          <Text style={styles.backBtnText}>← BACK</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.nextBtn, step === 'name' && !canStart && styles.nextBtnDisabled]}
          onPress={goNext}
          activeOpacity={0.7}
          hitSlop={8}
        >
          <Text style={styles.nextBtnText}>{nextLabel}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0908', padding: 12 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingBottom: 6,
  },
  headerTitle: { color: '#c9a86a', fontSize: 14, letterSpacing: 4, fontWeight: '700' },
  headerStep: { color: '#7a705c', fontSize: 11, letterSpacing: 1 },
  stepTitle: {
    color: '#e6d8b3',
    fontSize: 12,
    letterSpacing: 3,
    fontWeight: '700',
    marginTop: 8,
    marginBottom: 8,
  },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 12 },
  contextLine: { color: '#9ec96a', fontSize: 11, letterSpacing: 1, marginBottom: 8, fontStyle: 'italic' },
  label: { color: '#c9a86a', fontSize: 12, letterSpacing: 2, marginTop: 8, marginBottom: 6 },
  input: {
    backgroundColor: '#1a1714',
    borderColor: '#3a342c',
    borderWidth: 1,
    color: '#e6d8b3',
    paddingHorizontal: 10,
    paddingVertical: 12,
    borderRadius: 4,
    fontSize: 14,
  },
  nameBlock: {},
  nameHint: { color: '#7a705c', fontSize: 11, marginTop: 8, fontStyle: 'italic' },
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
  footer: { flexDirection: 'row', gap: 8, paddingTop: 8 },
  backBtn: {
    backgroundColor: '#1a1714',
    borderColor: '#3a342c',
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 16,
    paddingVertical: 12,
    minWidth: 100,
    alignItems: 'center',
  },
  backBtnText: { color: '#c9a86a', fontSize: 13, letterSpacing: 2, fontWeight: '700' },
  nextBtn: {
    flex: 1,
    backgroundColor: '#c9a86a',
    borderRadius: 4,
    paddingVertical: 12,
    alignItems: 'center',
  },
  nextBtnDisabled: { backgroundColor: '#3a342c' },
  nextBtnText: { color: '#13110f', fontSize: 13, fontWeight: '800', letterSpacing: 2 },
});
