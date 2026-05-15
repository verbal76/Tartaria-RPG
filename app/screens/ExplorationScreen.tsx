import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, KeyboardAvoidingView, Platform } from 'react-native';
import { useGameStore } from '../state/gameStore';
import { StatsPanel } from '../components/StatsPanel';
import { InventoryPanel } from '../components/InventoryPanel';
import { AdventureFeed } from '../components/AdventureFeed';
import { InputBox } from '../components/InputBox';
import { DiceRoller } from '../components/DiceRoller';

export function ExplorationScreen() {
  const player = useGameStore((s) => s.player);
  const gameLog = useGameStore((s) => s.gameLog);
  const submit = useGameStore((s) => s.submitPlayerAction);
  const setScreen = useGameStore((s) => s.setScreen);
  const beginScene = useGameStore((s) => s.beginScene);
  const currentScene = useGameStore((s) => s.currentScene);
  const pendingRolls = useGameStore((s) => s.pendingRolls);
  const resolveRollStep = useGameStore((s) => s.resolveRollStep);
  const cancelPendingRolls = useGameStore((s) => s.cancelPendingRolls);

  if (!player) {
    return (
      <View style={styles.container}>
        <Text style={styles.placeholder}>No expedition is underway.</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.topRow}>
        <View style={styles.statsCol}>
          <StatsPanel player={player} />
        </View>
        <View style={styles.invCol}>
          <InventoryPanel items={player.inventory} />
        </View>
      </View>

      <View style={styles.sceneBar}>
        <Text style={styles.sceneText}>
          {currentScene
            ? `${currentScene.location.name}  /  ${currentScene.weather.name}${currentScene.hazard ? `  /  ${currentScene.hazard.name}` : ''}`
            : 'No scene'}
        </Text>
        <TouchableOpacity onPress={beginScene}>
          <Text style={styles.sceneBtn}>↻</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.feed}>
        <AdventureFeed entries={gameLog} />
      </View>

      <View style={styles.controls}>
        {pendingRolls ? (
          <DiceRoller
            state={pendingRolls}
            onRoll={resolveRollStep}
            onCancel={cancelPendingRolls}
          />
        ) : (
          <InputBox onSubmit={submit} />
        )}
        <View style={styles.menuRow}>
          <TouchableOpacity onPress={() => setScreen('title')}>
            <Text style={styles.menu}>title</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setScreen('log')}>
            <Text style={styles.menu}>full log</Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0908', padding: 8, gap: 6 },
  topRow: { flexDirection: 'row', gap: 6, height: 150 },
  statsCol: { flex: 1.2 },
  invCol: { flex: 1 },
  sceneBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 8, paddingVertical: 4, backgroundColor: '#13110f',
    borderColor: '#3a342c', borderWidth: 1, borderRadius: 4,
  },
  sceneText: { color: '#c9a86a', fontSize: 11, letterSpacing: 1 },
  sceneBtn: { color: '#cdbf99', fontSize: 16, paddingHorizontal: 8 },
  feed: { flex: 1 },
  controls: { gap: 6 },
  menuRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4 },
  menu: { color: '#7a705c', fontSize: 11, letterSpacing: 1 },
  placeholder: { color: '#7a705c', textAlign: 'center', marginTop: 80 },
});
