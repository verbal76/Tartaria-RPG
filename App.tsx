import React, { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet, AppState, Platform, StatusBar as RNStatusBar, type AppStateStatus } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as NavigationBar from 'expo-navigation-bar';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
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

// Global crash safety net. If anything during boot or runtime throws
// uncaught, the default React Native red-box on a release build is a
// black screen → home screen kick-out. Installing a handler that logs
// the error and triggers Updates.reloadAsync() instead lets the player
// see one black flash and come back into a clean process — far better
// than dropping them to the launcher with no signal anything happened.
// Errors during the FIRST 5 seconds after boot are ignored for reload
// purposes (the player's about to relaunch anyway and a reload loop
// would hide the real bug); after that, one reload per crash window.
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const Updates = require('expo-updates') as typeof import('expo-updates');
  const bootTime = Date.now();
  let reloaded = false;
  const errorUtils = (globalThis as unknown as { ErrorUtils?: { getGlobalHandler: () => (err: Error, isFatal?: boolean) => void; setGlobalHandler: (h: (err: Error, isFatal?: boolean) => void) => void } }).ErrorUtils;
  if (errorUtils?.setGlobalHandler) {
    const prev = errorUtils.getGlobalHandler();
    errorUtils.setGlobalHandler((err, isFatal) => {
      try { prev?.(err, isFatal); } catch { /* ignore */ }
      const sinceBoot = Date.now() - bootTime;
      if (isFatal && !reloaded && sinceBoot > 5000 && Updates?.isEnabled) {
        reloaded = true;
        // Brief delay so any pending React render / log flush completes
        // before the bridge swap. reloadAsync is async; we don't await
        // because the handler can't return a promise.
        setTimeout(() => { void Updates.reloadAsync().catch(() => { /* native side will surface */ }); }, 800);
      }
    });
  }
} catch {
  // expo-updates missing (dev build / Expo Go) — no safety net, but
  // the dev environment surfaces errors well enough on its own.
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

  // Android immersive mode — hide the navigation bar (3-button bar at
  // the bottom) and let the status bar overlay-swipe back. Same UX as
  // Wordscapes / most full-screen games: gain the system bar real
  // estate, swipe up from the bottom (or down from the top) to peek
  // them back when needed. No-op on iOS.
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    void NavigationBar.setBehaviorAsync('overlay-swipe').catch(() => { /* ignore */ });
    void NavigationBar.setVisibilityAsync('hidden').catch(() => { /* ignore */ });
    // The system can re-show the navigation bar when the keyboard opens
    // or a system dialog appears; AppState 'active' transitions are a
    // reliable hook to reassert hidden state. The listener below in the
    // other useEffect already handles 'active' — we re-hide there too.
  }, []);

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
      // Boot-time OTA check. fetchOnly: download the update in the
      // background but DO NOT reload here — auto-reload mid-boot
      // crashes the process to home because native modules
      // (executorch Kokoro, llama.rn Qwen, ONNX MiniLM, expo-av Sound)
      // are still spinning up while reloadAsync swaps the JS bundle.
      // The pendingOTAUpdate flag drives a TitleScreen banner that
      // offers the player a one-tap apply from a clean state.
      setTimeout(() => {
        if (useGameStore.getState().currentScreen !== 'title') return;
        void checkAndApplyOTA({ silent: true, fetchOnly: true }).then((result) => {
          if (result === 'pending') {
            useGameStore.setState({ pendingOTAUpdate: true });
          }
        });
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
        // Re-hide the navigation bar — Android sometimes restores it
        // after the app comes back from background (system dialogs,
        // keyboard close events). Idempotent and cheap.
        if (Platform.OS === 'android') {
          void NavigationBar.setVisibilityAsync('hidden').catch(() => { /* ignore */ });
        }
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
      <AppShell screen={screen} />
      {/* TutorialOverlay sits OUTSIDE SafeAreaView so its absolute
          positioning matches measureInWindow coords from the targets
          (which report screen-absolute, not safe-area-relative). */}
      <TutorialOverlay />
    </SafeAreaProvider>
  );
}

// Inner shell — needs useSafeAreaInsets which only resolves inside a
// SafeAreaProvider. We compute one paddingTop = max(insets.top,
// android-status-bar-height) so the top row clears the system bar on
// every device without DOUBLING the inset (the previous SafeAreaView
// edges='top' + my custom paddingTop stacked on devices where the
// OEM does report a top inset — the player called this out as
// over-padded). Math.max is the right merge: take whichever is bigger,
// not both.
function AppShell({ screen }: { screen: ReturnType<typeof useGameStore.getState>['currentScreen'] }) {
  const insets = useSafeAreaInsets();
  const top = Math.max(insets.top, ANDROID_STATUS_PAD);
  const bottom = insets.bottom;
  return (
    <View style={[styles.safe, { paddingTop: top, paddingBottom: bottom }]}>
      <StatusBar style="light" hidden />
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
    </View>
  );
}

// Floor value used when SafeAreaView's reported top inset is 0 on
// edge-to-edge Android ROMs (Pixel + some Samsung). AppShell does
// Math.max(insets.top, ANDROID_STATUS_PAD) so we get the bigger of
// the two — never both stacked, never the BACK button under the
// clock.
const ANDROID_STATUS_PAD =
  Platform.OS === 'android' ? RNStatusBar.currentHeight ?? 24 : 0;

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#0a0908',
  },
  loading: { flex: 1, backgroundColor: '#0a0908', alignItems: 'center', justifyContent: 'center' },
});
