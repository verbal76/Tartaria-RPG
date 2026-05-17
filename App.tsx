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
import { ActionReferenceScreen } from './app/screens/ActionReferenceScreen';
import { ContractsScreen } from './app/screens/ContractsScreen';
import { TutorialOverlay } from './app/components/TutorialOverlay';
import { bootAudio, disposeAudio } from './app/audio/AudioManager';
import { startAudioController, stopAudioController } from './app/audio/AudioController';

export default function App() {
  const screen = useGameStore((s) => s.currentScreen);
  const hydrated = useGameStore((s) => s.hydrated);
  const hydrate = useGameStore((s) => s.hydrate);
  const bootCognitive = useGameStore((s) => s.bootCognitive);
  const shutdownCognitive = useGameStore((s) => s.shutdownCognitive);
  const resumeCognitive = useGameStore((s) => s.resumeCognitive);
  const bootQwen = useGameStore((s) => s.bootQwen);
  const shutdownQwen = useGameStore((s) => s.shutdownQwen);

  useEffect(() => {
    void hydrate().then(() => {
      // Boot order: classifier (small, fast) first so target resolution is
      // available as soon as the player starts a game. Generative model
      // (large, slow) kicks off afterward without blocking — templates carry
      // the Arbiter until it's ready.
      void bootCognitive().then(() => {
        void bootQwen();
      });
      void bootAudio().then(() => startAudioController());
    });
    return () => {
      stopAudioController();
      void disposeAudio();
    };
  }, [hydrate, bootCognitive, bootQwen]);

  useEffect(() => {
    const onChange = (status: AppStateStatus) => {
      if (status === 'background' || status === 'inactive') {
        void shutdownCognitive();
        void shutdownQwen();
      } else if (status === 'active') {
        void resumeCognitive();
        // Qwen does not auto-resume — re-bootQwen would re-trigger the
        // download UI; we leave it dormant and let the user restart it
        // manually from the About screen if they want it back.
      }
    };
    const sub = AppState.addEventListener('change', onChange);
    return () => sub.remove();
  }, [shutdownCognitive, resumeCognitive, shutdownQwen]);

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
        {screen === 'actions' && <ActionReferenceScreen />}
        {screen === 'contracts' && <ContractsScreen />}
      </SafeAreaView>
      {/* TutorialOverlay sits OUTSIDE SafeAreaView so its absolute
          positioning matches measureInWindow coords from the targets
          (which report screen-absolute, not safe-area-relative). */}
      <TutorialOverlay />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0a0908' },
  loading: { flex: 1, backgroundColor: '#0a0908', alignItems: 'center', justifyContent: 'center' },
});
