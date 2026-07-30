import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useGameStore } from '../state/gameStore';
import { getRaces, getFactions } from '../engine/character';
import { getStoryMotives } from '../engine/story'; // OTA-1041

// Tungsten Spire — the 'name' step is gone. New flow: race → faction →
// BEGIN. The player gives their name in-game when the Arbiter prompts
// inside the outpost (handled by the tutorial state machine). This
// removes the in-screen TextInput that was driving the Android soft-
// keyboard race the Nickel Tine + Zinc Anvil OTAs were chasing.

// OTA-1041 — a third step: THE REASON YOU CAME DOWN. The motive shapes the
// opening crawl and (phases 2-3) the story beats woven through the main quest.
type Step = 'race' | 'faction' | 'motive';

const STEP_ORDER: Step[] = ['race', 'faction', 'motive'];
const STEP_TITLE: Record<Step, string> = {
  race: 'CHOOSE YOUR RACE',
  faction: 'CHOOSE YOUR FACTION',
  motive: 'WHY DID YOU COME DOWN?',
};

export function CharacterCreationScreen() {
  const startNewGame = useGameStore((s) => s.startNewGame);
  const setScreen = useGameStore((s) => s.setScreen);

  const races = getRaces();
  const factions = getFactions();

  const motives = getStoryMotives();

  const [step, setStep] = useState<Step>('race');
  const [raceId, setRaceId] = useState(races[0]!.id);
  const [factionId, setFactionId] = useState(factions[0]!.id);
  const [motiveId, setMotiveId] = useState(motives[0]!.id);

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
    if (step === 'race') {
      setStep('faction');
      return;
    }
    if (step === 'faction') {
      setStep('motive');
      return;
    }
    // Motive step → straight into the game with an empty name; the
    // Arbiter prompts for it in the outpost. tutorialStep starts at 0
    // (the name beat) and the InputBox routes the next submission as
    // the player's name. The motive drives the opening crawl.
    void startNewGame({ name: '', raceId, factionId, motiveId });
  };

  const nextLabel = step === 'motive' ? 'BEGIN' : 'NEXT →';

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle} accessibilityRole="header">NEW EXPEDITION</Text>
        <Text style={styles.headerStep}>Step {stepIndex + 1} of {STEP_ORDER.length}</Text>
      </View>
      <Text style={styles.stepTitle} accessibilityRole="header">{STEP_TITLE[step]}</Text>

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
              accessibilityRole="button"
              accessibilityState={{ selected: raceId === r.id }}
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
                accessibilityRole="button"
                accessibilityState={{ selected: factionId === f.id }}
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
                One more step: the reason you came down.
              </Text>
            </View>
          </>
        )}

        {step === 'motive' && (
          <>
            {/* OTA-1041 — THE REASON YOU CAME DOWN. The pick shapes the opening
                crawl now and the story beats woven through the main quest in
                later phases. There is no wrong answer and no stat attached —
                this is who you are, not what you roll. */}
            <Text style={styles.contextLine}>
              {selectedRace.name} · {selectedFaction.name}
            </Text>
            {motives.map((m) => (
              <TouchableOpacity
                key={m.id}
                style={[styles.option, motiveId === m.id && styles.optionSelected]}
                onPress={() => setMotiveId(m.id)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityState={{ selected: motiveId === m.id }}
              >
                <Text style={styles.optionName}>{m.title}</Text>
                <Text style={styles.optionDesc}>{m.blurb}</Text>
                {motiveId === m.id && (
                  <Text style={styles.optionFlavor}>{m.pages[0]?.split('\n')[0] ?? ''}</Text>
                )}
              </TouchableOpacity>
            ))}
            <View style={styles.beginBlock}>
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
          accessibilityRole="button"
        >
          <Text style={styles.backBtnText}>← BACK</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.nextBtn}
          onPress={goNext}
          activeOpacity={0.7}
          hitSlop={8}
          accessibilityRole="button"
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
  headerStep: { color: '#a2977b', fontSize: 11, letterSpacing: 1 },
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
  optionMeta: { color: '#a2977b', fontSize: 11, marginTop: 4, letterSpacing: 0.5 },
  optionMetaSub: { color: '#c9a86a', fontSize: 10, marginTop: 2, fontStyle: 'italic' },
  optionTraits: { marginTop: 8, paddingLeft: 6, borderLeftColor: '#3a342c', borderLeftWidth: 2 },
  optionTrait: { color: '#9ec96a', fontSize: 11, lineHeight: 16, marginBottom: 2 },
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
