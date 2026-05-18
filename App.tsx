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
import { initTTSManager } from './app/voice/TTSManager';
import { startTTSController, stopTTSController } from './app/voice/TTSController';
import { createExpoFileSystemAdapter } from './app/voice/executorchAdapter';
import { checkAndApplyOTA } from './app/updates/checkAndApplyOTA';

// Wire react-native-executorch's resource fetcher at module load (before
// React renders) so any later TextToSpeechModule.fromModelName call has
// the adapter already registered. The official Expo adapter requires
// SDK 54; we're on 52 so we ship our own expo-file-system shim.
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const exec = require('react-native-executorch');
  if (typeof exec.initExecutorch === 'function') {
    exec.initExecutorch({ resourceFetcher: createExpoFileSystemAdapter() });
  }
} catch {
  // Native module not present (e.g. dev web build) — voice falls back to
  // system TTS automatically through TTSManager's engine routing.
}

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
      // Voice (TTS + STT) — opt-in via settings; init is cheap so
      // the controller can subscribe immediately. If TTS is disabled
      // the controller short-circuits inside onState. initTTSManager
      // ALSO prewarms Kokoro in the background when bundled engine is
      // enabled — model download / load / graph-compile all happen
      // while the player is on the title screen, so the first spoken
      // line plays without cold-start lag.
      void initTTSManager().then(() => startTTSController());
      // Auto-fire the same OTA check the player can run manually from
      // Settings → About → CHECK FOR OTA UPDATE. Silent: errors are
      // swallowed (a tap from the button surfaces them if they want
      // to investigate). If an update is available, the sequence
      // persists save state + tears down native handles + reloads.
      // Delayed slightly so we don't compete with the boot sequence
      // (model loads, audio init) on a slow device.
      setTimeout(() => {
        void checkAndApplyOTA({ silent: true });
      }, 1500);
    });
    return () => {
      stopAudioController();
      stopTTSController();
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
