import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useGameStore } from '../state/gameStore';
import { useContentPackStore } from '../state/contentPackStore';
import { getRaces, getFactions } from '../engine/character';
import { hasTableOverride, tableOverrideCount } from '../engine/contentPack';

// Tungsten Spire — the 'name' step is gone. New flow: race → faction →
// BEGIN. The player gives their name in-game when the Arbiter prompts
// inside the outpost (handled by the tutorial state machine). This
// removes the in-screen TextInput that was driving the Android soft-
// keyboard race the Nickel Tine + Zinc Anvil OTAs were chasing.

type Step = 'race' | 'faction';

const STEP_ORDER: Step[] = ['race', 'faction'];
const STEP_TITLE: Record<Step, string> = {
  race: 'CHOOSE YOUR RACE',
  faction: 'CHOOSE YOUR FACTION',
};

export function CharacterCreationScreen() {
  const startNewGame = useGameStore((s) => s.startNewGame);
  const setScreen = useGameStore((s) => s.setScreen);

  // engine_Dev — re-read the race/faction lists whenever the content pack
  // changes (an upload, or the persisted pack finishing its boot hydrate), so
  // creation always shows the CURRENT pack instead of whatever was loaded the
  // instant this screen first mounted. Subscribing to these store fields forces
  // the re-render; getRaces()/getFactions() then pull the live override.
  useContentPackStore((s) => s.tables);
  useContentPackStore((s) => s.hydrated);
  useContentPackStore((s) => s.contentVersion);
  const races = getRaces();
  const factions = getFactions();

  const [step, setStep] = useState<Step>('race');
  const [raceId, setRaceId] = useState(races[0]!.id);
  const [factionId, setFactionId] = useState(factions[0]!.id);

  // engine_Dev — visible source indicator so it's obvious whether the screen is
  // showing an uploaded pack or the built-in default (and whether an upload took).
  const racesCustom = hasTableOverride('races');
  const factionsCustom = hasTableOverride('factions');
  const packLine = step === 'race'
    ? (racesCustom ? `● custom races — ${tableOverrideCount('races')} loaded` : '○ built-in races (upload a Races pack in the dev console to replace these)')
    : (factionsCustom ? `● custom factions — ${tableOverrideCount('factions')} loaded` : '○ built-in factions (upload a Factions pack in the dev console)');

  // If the pack changed (upload / late hydrate) and the previously-selected id
  // is no longer in the list, snap to the first entry of the current pack.
  useEffect(() => {
    if (!races.some((r) => r.id === raceId)) setRaceId(races[0]!.id);
  }, [races, raceId]);
  useEffect(() => {
    if (!factions.some((f) => f.id === factionId)) setFactionId(factions[0]!.id);
  }, [factions, factionId]);

  const stepIndex = STEP_ORDER.indexOf(step);
  const selectedRace = races.find((r) => r.id === raceId) ?? races[0]!;
  const selectedFaction = factions.find((f) => f.id === factionId) ?? factions[0]!;

  const goBack = () => {
    if (step === 'race') {
      setScreen('title');
    } else {
      setStep('race');
    }
  };

  const goNext = () => {
    if (step === 'race') {
      setStep('faction');
      return;
    }
    // Faction step → straight into the game with an empty name; the
    // Arbiter prompts for it in the outpost. tutorialStep starts at 0
    // (the name beat) and the InputBox routes the next submission as
    // the player's name.
    void startNewGame({ name: '', raceId, factionId });
  };

  const nextLabel = step === 'faction' ? 'BEGIN' : 'NEXT →';

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>NEW EXPEDITION</Text>
        <Text style={styles.headerStep}>Step {stepIndex + 1} of {STEP_ORDER.length}</Text>
      </View>
      <Text style={styles.stepTitle}>{STEP_TITLE[step]}</Text>
      <Text style={[styles.packLine, (step === 'race' ? racesCustom : factionsCustom) ? styles.packLineOn : styles.packLineOff]}>
        {packLine}
      </Text>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {step === 'race' && races.map((r) => {
          const statBumps = r.racialStatBonuses ?? {};
          const statBumpStrs = Object.entries(statBumps)
            .filter(([, v]) => (v ?? 0) !== 0)
            .map(([k, v]) => `${v! > 0 ? '+' : ''}${v} ${k.slice(0, 3).toUpperCase()}`);
          return (
            <TouchableOpacity
              key={r.id}
              style={[styles.option, raceId === r.id && styles.optionSelected]}
              onPress={() => setRaceId(r.id)}
              activeOpacity={0.7}
            >
              <Text style={styles.optionName}>{r.name}</Text>
              <Text style={styles.optionDesc}>{r.description}</Text>
              <Text style={styles.optionMeta}>
                COMBAT · AC {r.baseAC} · barehand {r.barehandDamage}
              </Text>
              {r.racialACBonus && r.racialACBonus !== 'No inherent AC bonus' && (
                <Text style={styles.optionMetaSub}>↳ {r.racialACBonus}</Text>
              )}
              {statBumpStrs.length > 0 && (
                <Text style={styles.optionMeta}>
                  STATS · {statBumpStrs.join(', ')} (always on)
                </Text>
              )}
              {raceId === r.id && r.traits && r.traits.length > 0 && (
                <View style={styles.optionTraits}>
                  {r.traits.map((t, i) => (
                    <Text key={i} style={styles.optionTrait}>· {t}</Text>
                  ))}
                  <Text style={styles.optionTraitNote}>
                    (Per-day powers and immunities arrive in a follow-up update.)
                  </Text>
                </View>
              )}
              <Text style={styles.optionMeta}>
                KIT · {r.startingTCFormula} TC · HP bonus +{r.startingHPBonus}
              </Text>
              {raceId === r.id && r.flavor && (
                <Text style={styles.optionFlavor}>{r.flavor}</Text>
              )}
            </TouchableOpacity>
          );
        })}

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
                {factionId === f.id && f.flavor && (
                  <Text style={styles.optionFlavor}>{f.flavor}</Text>
                )}
              </TouchableOpacity>
            ))}
            <View style={styles.beginBlock}>
              <Text style={styles.contextLine}>
                {selectedRace.name} · {selectedFaction.name}
              </Text>
              <Text style={styles.beginHint}>
                Tap BEGIN below. The Arbiter will greet you in the outpost and ask your name.
              </Text>
            </View>
          </>
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
          style={styles.nextBtn}
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
  container: { flex: 1, backgroundColor: 'transparent', padding: 12 },
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
  packLine: { fontSize: 10, letterSpacing: 0.5, marginBottom: 8 },
  packLineOn: { color: '#9ec96a' },
  packLineOff: { color: '#7a705c', fontStyle: 'italic' },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 12 },
  contextLine: { color: '#9ec96a', fontSize: 11, letterSpacing: 1, marginBottom: 8, fontStyle: 'italic' },
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
  optionMeta: { color: '#7a705c', fontSize: 11, marginTop: 4, letterSpacing: 0.5 },
  optionMetaSub: { color: '#c9a86a', fontSize: 10, marginTop: 2, fontStyle: 'italic' },
  optionTraits: { marginTop: 8, paddingLeft: 6, borderLeftColor: '#3a342c', borderLeftWidth: 2 },
  optionTrait: { color: '#9ec96a', fontSize: 11, lineHeight: 16, marginBottom: 2 },
  optionTraitNote: { color: '#c9a86a', fontSize: 10, marginTop: 4, fontStyle: 'italic' },
  optionFlavor: {
    color: '#a89776',
    fontSize: 12,
    marginTop: 8,
    paddingTop: 8,
    borderTopColor: '#3a342c',
    borderTopWidth: 1,
    fontStyle: 'italic',
    lineHeight: 17,
  },
  beginBlock: {
    marginTop: 12,
    padding: 10,
    backgroundColor: '#13110f',
    borderColor: '#3a342c',
    borderWidth: 1,
    borderRadius: 4,
  },
  beginHint: { color: '#cdbf99', fontSize: 12, lineHeight: 17, fontStyle: 'italic' },
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
  nextBtnText: { color: '#13110f', fontSize: 13, fontWeight: '800', letterSpacing: 2 },
});
