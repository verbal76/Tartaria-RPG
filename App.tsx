import React, { useEffect } from 'react';
import { View, Text, ActivityIndicator, StyleSheet, AppState, Platform, StatusBar as RNStatusBar, type AppStateStatus } from 'react-native';
import { StatusBar } from 'expo-status-bar';
// expo-navigation-bar is a NATIVE module — only present in APKs built
// after it was added. Loaded via lazy require() inside the effect
// below so older APKs (testers on builds before the native module
// shipped) don't fail to load the JS bundle at import time. The
// require returns null on those builds; the effect no-ops.
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useGameStore } from './app/state/gameStore';
import { TitleScreen } from './app/screens/TitleScreen';
import { CharacterCreationScreen } from './app/screens/CharacterCreationScreen';
import { ExplorationScreen } from './app/screens/ExplorationScreen';
import { LogScreen } from './app/screens/LogScreen';
import { LoreScreen } from './app/screens/LoreScreen';
import { AboutScreen } from './app/screens/AboutScreen';
import { InventoryScreen } from './app/screens/InventoryScreen';
import { CharacterScreen } from './app/screens/CharacterScreen';
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

// Lazy-load expo-navigation-bar. The package is a native module bridged
// only in APKs built AFTER it was added to dependencies — older
// installed APKs (existing testers) don't have the bridge. A static
// import at the top of App.tsx could blow up at JS-bundle-load time on
// those builds and leave testers stuck. require() inside a try/catch
// resolves the JS shim if present and returns null otherwise; callers
// no-op on null. Cached after first successful load.
let _navigationBarCache: typeof import('expo-navigation-bar') | null | undefined;
function loadNavigationBar(): typeof import('expo-navigation-bar') | null {
  if (_navigationBarCache !== undefined) return _navigationBarCache;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    _navigationBarCache = require('expo-navigation-bar');
  } catch {
    _navigationBarCache = null;
  }
  return _navigationBarCache ?? null;
}

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
    const NB = loadNavigationBar();
    if (!NB) return;
    void NB.setBehaviorAsync('overlay-swipe').catch(() => { /* ignore */ });
    void NB.setVisibilityAsync('hidden').catch(() => { /* ignore */ });
    // OTA 026 — re-hide the navigation bar EVERY time the keyboard
    // shows or hides. Android often re-shows the system nav bar
    // when a TextInput gains focus (FeedbackModal, exploration
    // input bar, etc.). Playtester: "every time I go to use the
    // take notes option ... all of the Android buttons come back
    // on the screen." Keyboard.addListener fires on every show /
    // hide; we re-assert hidden on both events so a brief flash
    // is the worst the player sees.
    const { Keyboard } = require('react-native');
    const reHide = () => {
      void NB.setVisibilityAsync('hidden').catch(() => { /* ignore */ });
    };
    const showSub = Keyboard.addListener('keyboardDidShow', reHide);
    const hideSub = Keyboard.addListener('keyboardDidHide', reHide);
    return () => {
      try { showSub.remove(); } catch { /* ignore */ }
      try { hideSub.remove(); } catch { /* ignore */ }
    };
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
          const NB = loadNavigationBar();
          if (NB) void NB.setVisibilityAsync('hidden').catch(() => { /* ignore */ });
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
      <ScreenErrorBoundary>
        <AppShell screen={screen} />
      </ScreenErrorBoundary>
      {/* TutorialOverlay sits OUTSIDE SafeAreaView so its absolute
          positioning matches measureInWindow coords from the targets
          (which report screen-absolute, not safe-area-relative). */}
      <TutorialOverlay />
    </SafeAreaProvider>
  );
}

// Per-screen render guard. Wraps the screen switch in a React error
// boundary so a single screen crash falls back to a recovery card
// instead of leaving the app on a frozen gray background (which is
// what JS render errors do when no boundary catches them — Android
// renders the View container and nothing inside it). The recovery
// card dumps the error message + offers "RESTART" (reloadAsync) and
// "BACK TO TITLE" (setScreen('title')) so the player has a path out
// without killing the process.
class ScreenErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error) {
    // Surface to the JS log so the next bug report COPY ALL captures it.
    // eslint-disable-next-line no-console
    console.warn('ScreenErrorBoundary caught:', error?.message, error?.stack);
  }
  reset = () => this.setState({ error: null });
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <View style={styles.errorRoot}>
        <Text style={styles.errorTitle}>SOMETHING BROKE</Text>
        <Text style={styles.errorBody}>{this.state.error.message || 'Unknown render error.'}</Text>
        <Text style={styles.errorHint}>
          Your progress is saved. Tap RESTART for a fresh process, or BACK TO TITLE to keep playing
          without a restart.
        </Text>
        <View style={styles.errorBtnRow}>
          <View style={styles.errorBtn} onTouchEnd={() => {
            this.reset();
            useGameStore.setState({ currentScreen: 'title', tutorialStep: null });
          }}>
            <Text style={styles.errorBtnText}>BACK TO TITLE</Text>
          </View>
          <View style={styles.errorBtn} onTouchEnd={() => {
            try {
              // eslint-disable-next-line @typescript-eslint/no-var-requires
              const Updates = require('expo-updates') as typeof import('expo-updates');
              if (Updates?.isEnabled) void Updates.reloadAsync().catch(() => { /* ignore */ });
            } catch { /* ignore */ }
          }}>
            <Text style={styles.errorBtnText}>RESTART</Text>
          </View>
        </View>
      </View>
    );
  }
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
  // OTA 023 — playtester caught the bug: we're hiding both bars
  // (StatusBar `hidden` below, expo-navigation-bar setVisibilityAsync
  // 'hidden' at boot) but the AppShell still reserved ~24px at the
  // top via Math.max(insets.top, ANDROID_STATUS_PAD). When the bars
  // are hidden the insets correctly report 0, but the forced
  // ANDROID_STATUS_PAD floor overrode that and kept stealing screen
  // space the player never gets back. Trust the insets — they reflect
  // the actual unsafe area on this device. If a player swipes the
  // system UI back via overlay-swipe behavior, the brief overlap is
  // acceptable; we don't want to permanently reserve space for it.
  const top = insets.top;
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
      {screen === 'character' && <CharacterScreen />}
      {screen === 'crafting' && <CraftingScreen />}
      {screen === 'vendor' && <VendorScreen />}
      {screen === 'actions' && <ActionReferenceScreen />}
      {screen === 'contracts' && <ContractsScreen />}
    </View>
  );
}

// OTA 023 — ANDROID_STATUS_PAD removed. The pad was forcing 24px
// of top padding even when the status bar was hidden (which is
// always the case in this app: <StatusBar hidden /> at boot).
// SafeAreaProvider insets already report the correct value (0
// when the bar is hidden, the gesture-area height when not), so
// the forced floor was always wrong when the bar wasn't there.
// Constant + RNStatusBar import retained as documentation; remove
// in a future cleanup if no consumer surfaces.
const ANDROID_STATUS_PAD =
  Platform.OS === 'android' ? RNStatusBar.currentHeight ?? 24 : 0;
void ANDROID_STATUS_PAD;

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#0a0908',
  },
  loading: { flex: 1, backgroundColor: '#0a0908', alignItems: 'center', justifyContent: 'center' },
  errorRoot: { flex: 1, backgroundColor: '#0a0908', padding: 24, justifyContent: 'center' },
  errorTitle: { color: '#c9a86a', fontSize: 16, fontWeight: '800', letterSpacing: 3, textAlign: 'center', marginBottom: 10 },
  errorBody: { color: '#e07a5f', fontSize: 12, textAlign: 'center', marginBottom: 12, fontFamily: Platform.OS === 'android' ? 'monospace' : undefined },
  errorHint: { color: '#cdbf99', fontSize: 12, textAlign: 'center', lineHeight: 18, marginBottom: 18 },
  errorBtnRow: { flexDirection: 'row', justifyContent: 'center', gap: 12 },
  errorBtn: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderColor: '#c9a86a',
    borderWidth: 1,
    borderRadius: 3,
    backgroundColor: '#2a1f12',
  },
  errorBtnText: { color: '#c9a86a', fontSize: 11, fontWeight: '800', letterSpacing: 2 },
});
