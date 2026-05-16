import React, { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet, AppState, type AppStateStatus } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { useGameStore } from './app/state/gameStore';
import { TitleScreen } from './app/screens/TitleScreen';
import { CharacterCreationScreen } from './app/screens/CharacterCreationScreen';
import { ExplorationScreen } from './app/screens/ExplorationScreen';
import { LogScreen } from './app/screens/LogScreen';
import { LoreScreen } from './app/screens/LoreScreen';
import { AboutScreen } from './app/screens/AboutScreen';
import { InventoryScreen } from './app/screens/InventoryScreen';
import { CraftingScreen } from './app/screens/CraftingScreen';
import { VendorScreen } from './app/screens/VendorScreen';
import { bootAudio, disposeAudio } from './app/audio/AudioManager';
import { startAudioController, stopAudioController } from './app/audio/AudioController';

export default function App() {
  const screen = useGameStore((s) => s.currentScreen);
  const hydrated = useGameStore((s) => s.hydrated);
  const hydrate = useGameStore((s) => s.hydrate);
  const bootCognitive = useGameStore((s) => s.bootCognitive);
  const shutdownCognitive = useGameStore((s) => s.shutdownCognitive);
  const resumeCognitive = useGameStore((s) => s.resumeCognitive);

  useEffect(() => {
    void hydrate().then(() => {
      void bootCognitive();
      void bootAudio().then(() => startAudioController());
    });
    return () => {
      stopAudioController();
      void disposeAudio();
    };
  }, [hydrate, bootCognitive]);

  useEffect(() => {
    const onChange = (status: AppStateStatus) => {
      if (status === 'background' || status === 'inactive') {
        void shutdownCognitive();
      } else if (status === 'active') {
        void resumeCognitive();
      }
    };
    const sub = AppState.addEventListener('change', onChange);
    return () => sub.remove();
  }, [shutdownCognitive, resumeCognitive]);

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
        {screen === 'about' && <AboutScreen />}
        {screen === 'inventory' && <InventoryScreen />}
        {screen === 'crafting' && <CraftingScreen />}
        {screen === 'vendor' && <VendorScreen />}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0a0908' },
  loading: { flex: 1, backgroundColor: '#0a0908', alignItems: 'center', justifyContent: 'center' },
});
