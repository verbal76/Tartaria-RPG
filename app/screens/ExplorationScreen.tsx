import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, KeyboardAvoidingView, Platform } from 'react-native';
import { useGameStore } from '../state/gameStore';
import { StatsPanel } from '../components/StatsPanel';
import { InventoryPanel } from '../components/InventoryPanel';
import { AdventureFeed } from '../components/AdventureFeed';
import { InputBox } from '../components/InputBox';
import { DiceRoller } from '../components/DiceRoller';
import { EnemyPanel, type EnemyView } from '../components/EnemyPanel';

export function ExplorationScreen() {
  const player = useGameStore((s) => s.player);
  const gameLog = useGameStore((s) => s.gameLog);
  const submit = useGameStore((s) => s.submitPlayerAction);
  const setScreen = useGameStore((s) => s.setScreen);
  const beginScene = useGameStore((s) => s.beginScene);
  const currentScene = useGameStore((s) => s.currentScene);
  const currentEnemyHp = useGameStore((s) => s.currentEnemyHp);
  const pendingRolls = useGameStore((s) => s.pendingRolls);
  const resolveRollStep = useGameStore((s) => s.resolveRollStep);
  const cancelPendingRolls = useGameStore((s) => s.cancelPendingRolls);
  const saveAndExitToTitle = useGameStore((s) => s.saveAndExitToTitle);

  const [activeEnemyIdx, setActiveEnemyIdx] = useState(0);

  // The engine is still single-enemy today, but the panel takes an array so
  // when multi-enemy scenes get added, no UI change is needed.
  const enemyViews: EnemyView[] = useMemo(() => {
    if (!currentScene?.enemy) return [];
    return [
      {
        enemy: currentScene.enemy,
        currentHp: currentEnemyHp ?? currentScene.enemy.hp,
      },
    ];
  }, [currentScene?.enemy, currentEnemyHp]);

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
        <Text style={styles.sceneText} numberOfLines={1}>
          {currentScene
            ? `${currentScene.location.name}  /  ${currentScene.weather.name}${currentScene.hazard ? `  /  ${currentScene.hazard.name}` : ''}`
            : 'No scene'}
        </Text>
        <View style={styles.sceneBarBtns}>
          <TouchableOpacity onPress={beginScene} hitSlop={8}>
            <Text style={styles.sceneBtn}>↻</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setScreen('about')} hitSlop={8}>
            <Text style={styles.sceneBtn}>⚙</Text>
          </TouchableOpacity>
        </View>
      </View>

      {enemyViews.length > 0 && (
        <EnemyPanel
          enemies={enemyViews}
          activeIndex={Math.min(activeEnemyIdx, enemyViews.length - 1)}
          onSelectActive={setActiveEnemyIdx}
        />
      )}

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
          <TouchableOpacity onPress={() => { void saveAndExitToTitle(); }}>
            <Text style={styles.menu}>save & exit</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setScreen('log')}>
            <Text style={styles.menu}>full log</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setScreen('about')}>
            <Text style={styles.menu}>about</Text>
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
  sceneText: { color: '#c9a86a', fontSize: 11, letterSpacing: 1, flex: 1 },
  sceneBarBtns: { flexDirection: 'row', gap: 4 },
  sceneBtn: { color: '#cdbf99', fontSize: 16, paddingHorizontal: 8 },
  feed: { flex: 1 },
  controls: { gap: 6 },
  menuRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4 },
  menu: { color: '#7a705c', fontSize: 11, letterSpacing: 1 },
  placeholder: { color: '#7a705c', textAlign: 'center', marginTop: 80 },
});
