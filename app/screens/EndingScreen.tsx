// v2.4.1 (OTA 040 — Phase 6c) — Ending splash screen.
//
// Full-screen final-act presentation. Renders when player.mainQuest.phase
// === 'ended'. Shows the faction-flavored ending line in large prose,
// the run summary (character name, race, faction, ending, day count,
// Cores recovered in order), and two actions: BACK TO TITLE or
// RESURRECT (the latter only if a Resurrection Gem is available
// and the player wants to keep playing under the ending — a deferred
// option that lets the player continue exploring post-Choice without
// closing the run yet).

import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useGameStore } from '../state/gameStore';
import { endingLine, LOST_CAPITAL_LOCATIONS } from '../engine/mainQuest';
import racesData from '../data/races/races.json';
import factionsData from '../data/factions/factions.json';

const races = racesData as { id: string; name: string }[];
const factions = factionsData as { id: string; name: string }[];

function raceName(id: string): string {
  return races.find((r) => r.id === id)?.name ?? id;
}
function factionName(id: string): string {
  return factions.find((f) => f.id === id)?.name ?? id;
}
function capitalLabel(id: string): string {
  const map: Record<string, string> = {
    asgardar: 'Asgardar', samarran: 'Samarran', nimari: 'Nimari',
    drakova: 'Drakova', voronov: 'Voronov',
  };
  return map[id] ?? id;
}

export function EndingScreen() {
  const player = useGameStore((s) => s.player);
  const setScreen = useGameStore((s) => s.setScreen);

  if (!player || !player.mainQuest || player.mainQuest.phase !== 'ended' || !player.mainQuest.ending) {
    // Defensive — somehow on the ending screen without an ending.
    // Bounce back to title.
    return (
      <View style={styles.container}>
        <Text style={styles.placeholder}>No ending recorded. Returning to title.</Text>
        <TouchableOpacity style={styles.btn} onPress={() => setScreen('title')} activeOpacity={0.7}>
          <Text style={styles.btnText}>BACK TO TITLE</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const ending = player.mainQuest.ending;
  const line = endingLine(ending, player.factionId);
  const daysPlayed = Math.floor((player.hoursElapsed ?? 0) / 24);
  const coresInOrder = player.mainQuest.coresRecovered ?? [];
  const allCoresInOrder = LOST_CAPITAL_LOCATIONS.filter((c) => coresInOrder.includes(c));

  const endingLabel = ending.toUpperCase();
  const endingColor = ending === 'seal' ? '#5a6b8a' : ending === 'unleash' ? '#a85a3a' : '#7a8a5a';

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={[styles.tag, { color: endingColor }]}>YOU CHOSE</Text>
        <Text style={[styles.endingLabel, { color: endingColor }]}>{endingLabel}</Text>
        <View style={styles.rule} />

        <Text style={styles.body}>{line}</Text>

        <View style={[styles.rule, { marginTop: 28 }]} />

        <Text style={styles.tag}>RUN SUMMARY</Text>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryKey}>Character</Text>
          <Text style={styles.summaryVal}>{player.name}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryKey}>Race</Text>
          <Text style={styles.summaryVal}>{raceName(player.raceId)}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryKey}>Faction</Text>
          <Text style={styles.summaryVal}>{factionName(player.factionId)}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryKey}>Days played</Text>
          <Text style={styles.summaryVal}>{daysPlayed}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryKey}>Cores recovered</Text>
          <Text style={styles.summaryVal}>{allCoresInOrder.length}/9</Text>
        </View>
        {coresInOrder.length > 0 && (
          <Text style={styles.coresList}>
            Order: {coresInOrder.map(capitalLabel).join(' → ')}
          </Text>
        )}
        <View style={styles.summaryRow}>
          <Text style={styles.summaryKey}>Enemies defeated</Text>
          <Text style={styles.summaryVal}>{player.milestones?.enemiesDefeated ?? 0}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryKey}>Travels completed</Text>
          <Text style={styles.summaryVal}>{player.milestones?.travelsCompleted ?? 0}</Text>
        </View>

        <View style={styles.btnRow}>
          <TouchableOpacity style={styles.btn} onPress={() => setScreen('title')} activeOpacity={0.7}>
            <Text style={styles.btnText}>BACK TO TITLE</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.btn}
            onPress={() => setScreen('exploration')}
            activeOpacity={0.7}
          >
            <Text style={styles.btnText}>KEEP EXPLORING</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0908', padding: 16 },
  scroll: { paddingBottom: 32 },
  tag: { color: '#7a705c', fontSize: 11, letterSpacing: 4, fontWeight: '700', marginTop: 16 },
  endingLabel: { fontSize: 36, letterSpacing: 6, fontWeight: '800', marginTop: 8 },
  rule: { height: 1, backgroundColor: '#3a342c', marginTop: 12, marginBottom: 12 },
  body: { color: '#e6d8b3', fontSize: 14, lineHeight: 22 },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingVertical: 4,
    borderBottomColor: '#1a1714',
    borderBottomWidth: 1,
  },
  summaryKey: { color: '#7a705c', fontSize: 12, letterSpacing: 1 },
  summaryVal: { color: '#e6d8b3', fontSize: 12, fontWeight: '600' },
  coresList: { color: '#cdbf99', fontSize: 11, fontStyle: 'italic', marginTop: 6 },
  btnRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 24, gap: 8 },
  btn: {
    flex: 1,
    backgroundColor: '#1a1714',
    borderColor: '#c9a86a',
    borderWidth: 1,
    borderRadius: 4,
    paddingVertical: 14,
    alignItems: 'center',
  },
  btnText: { color: '#c9a86a', fontSize: 12, letterSpacing: 2, fontWeight: '700' },
  placeholder: { color: '#7a705c', textAlign: 'center', marginTop: 80, fontSize: 14 },
});
