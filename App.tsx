import React, { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { useGameStore } from './app/state/gameStore';
import { TitleScreen } from './app/screens/TitleScreen';
import { CharacterCreationScreen } from './app/screens/CharacterCreationScreen';
import { ExplorationScreen } from './app/screens/ExplorationScreen';
import { LogScreen } from './app/screens/LogScreen';
import { LoreScreen } from './app/screens/LoreScreen';

export default function App() {
  const screen = useGameStore((s) => s.currentScreen);
  const hydrated = useGameStore((s) => s.hydrated);
  const hydrate = useGameStore((s) => s.hydrate);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  if (!hydrated) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color="#c9a86a" />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <StatusBar style="light" />
        {screen === 'title' && <TitleScreen />}
        {screen === 'character_creation' && <CharacterCreationScreen />}
        {screen === 'exploration' && <ExplorationScreen />}
        {screen === 'log' && <LogScreen />}
        {screen === 'lore' && <LoreScreen />}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0a0908' },
  loading: { flex: 1, backgroundColor: '#0a0908', alignItems: 'center', justifyContent: 'center' },
});
