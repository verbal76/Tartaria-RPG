import React, { useEffect, useRef, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet, AppState, Platform, StatusBar as RNStatusBar, Keyboard, Image, ImageBackground, type AppStateStatus } from 'react-native';
import { StatusBar } from 'expo-status-bar';
// expo-navigation-bar is a NATIVE module — only present in APKs built
// after it was added. Loaded via lazy require() inside the effect
// below so older APKs (testers on builds before the native module
// shipped) don't fail to load the JS bundle at import time. The
// require returns null on those builds; the effect no-ops.
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useGameStore } from './app/state/gameStore';
import { useAccessibility } from './app/state/accessibility';
import {
  loadMLHealth,
  shouldAttemptMLInit,
  shouldAttemptQwen,
  markMLInitAttempted,
  markMLInitSucceeded,
  clearInFlightBreadcrumbs,
} from './app/diagnostics/mlHealth';
import { TitleScreen } from './app/screens/TitleScreen';
import { SplashOverlay } from './app/components/SplashOverlay';
import { CharacterCreationScreen } from './app/screens/CharacterCreationScreen';
import { ExplorationScreen } from './app/screens/ExplorationScreen';
import { LogScreen } from './app/screens/LogScreen';
import { LoreScreen } from './app/screens/LoreScreen';
import { AboutScreen } from './app/screens/AboutScreen';
import { EndingScreen } from './app/screens/EndingScreen';
import { InventoryScreen } from './app/screens/InventoryScreen';
import { CharacterScreen } from './app/screens/CharacterScreen';
import { MapScreen } from './app/screens/MapScreen';
import { CraftingScreen } from './app/screens/CraftingScreen';
import { VendorScreen } from './app/screens/VendorScreen';
import { ActionReferenceScreen } from './app/screens/ActionReferenceScreen';
import { ContractsScreen } from './app/screens/ContractsScreen';
import { WorldScreen } from './app/screens/WorldScreen';
import { TutorialOverlay } from './app/components/TutorialOverlay';
import { CallDogModal } from './app/components/CallDogModal';
import { DiscoveryRevealModal } from './app/components/DiscoveryRevealModal';
import { AetherStatPickerModal } from './app/components/AetherStatPickerModal';
import { ChapterCardOverlay } from './app/components/ChapterCardOverlay'; // OTA-1020
import { StoryForkOverlay } from './app/components/StoryForkOverlay'; // OTA-1065
import { MotivePickerModal } from './app/components/MotivePickerModal'; // OTA-1022
import { StoryIntroOverlay } from './app/components/StoryIntroOverlay'; // OTA-1023 — global (was exploration-only)
import { DogOnboardingModal } from './app/components/DogOnboardingModal'; // OTA-1027
import { GolemNamingModal } from './app/components/GolemNamingModal'; // OTA-1027
import { KeyboardInputBar } from './app/components/KeyboardInputBar';
import { bootAudio, disposeAudio } from './app/audio/AudioManager';
import { startAudioController, stopAudioController } from './app/audio/AudioController';
import { initTTSManager } from './app/voice/TTSManager';
import { startTTSController, stopTTSController } from './app/voice/TTSController';
import { createExpoFileSystemAdapter } from './app/voice/executorchAdapter';
import { checkAndApplyOTA } from './app/updates/checkAndApplyOTA';
import { useUiScale } from './app/ui/uiScale';
import { loadDisplaySettings, useDisplaySettings, baseColorOf } from './app/ui/displaySettings';

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
      // OTA-237 — crash diagnostics. Stash the last error message +
      // stage to AsyncStorage so the NEXT launch's title screen can
      // surface "last crash: <stage>: <message>" instead of the player
      // staring at a blank home screen with no clue why. Best-effort —
      // AsyncStorage may not be ready yet, in which case the catch
      // swallows and we lose this one but won't double-crash trying
      // to report.
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const AS = require('@react-native-async-storage/async-storage').default;
        const stage = (globalThis as unknown as { __TARTARIA_BOOT_STAGE?: string }).__TARTARIA_BOOT_STAGE ?? 'unknown';
        void AS.setItem(
          '@tartaria/lastCrash',
          JSON.stringify({
            stage,
            message: (err?.message ?? String(err)).slice(0, 500),
            stack: (err?.stack ?? '').slice(0, 2000),
            isFatal: !!isFatal,
            sinceBoot: Date.now() - bootTime,
            timestamp: Date.now(),
          }),
        ).catch(() => { /* ignore */ });
      } catch { /* ignore — AS not ready */ }
      // OTA-343 — also snapshot the EXACT save bytes of the active slot so
      // the next launch can COPY CRASHED SAVE for repro. Separate try so a
      // failure here never blocks the lastCrash write above. Best-effort and
      // fire-and-forget; captureActiveCrashSave never throws.
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const cs = require('./app/diagnostics/crashSave');
        const stage = (globalThis as unknown as { __TARTARIA_BOOT_STAGE?: string }).__TARTARIA_BOOT_STAGE ?? 'unknown';
        void cs.captureActiveCrashSave(`fatal:${stage}`);
      } catch { /* ignore — module/AS not ready */ }
      const sinceBoot = Date.now() - bootTime;
      // OTA-237 — was sinceBoot > 5000. Cut to 800ms because the
      // current player crash repros within 1 second of title screen
      // mount and the 5s window was suppressing the reload-recovery.
      // Reload loop is mitigated by the `reloaded` latch (one reload
      // per cold-start session) — if the crash repros on the reload,
      // the next launch falls through without another reload and the
      // user sees the actual crash diagnostic on the title screen.
      if (isFatal && !reloaded && sinceBoot > 800 && Updates?.isEnabled) {
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
  // arb140 — set when WE parked a READY Qwen on a real `background` so the
  // `active` handler knows to re-warm it. (Manual disable / failed / skipped
  // never set this, so we never fight the user's choice.)
  const qwenParkedRef = useRef(false);

  // Android immersive mode — hide the navigation bar (3-button bar at
  // the bottom) and let the status bar overlay-swipe back. Same UX as
  // Wordscapes / most full-screen games: gain the system bar real
  // estate, swipe up from the bottom (or down from the top) to peek
  // them back when needed. No-op on iOS.
  // OTA-898 (SA-6) — load device accessibility prefs (reduce-motion) once at
  // boot, off the game-save path. Cheap single AsyncStorage read; failure falls
  // back to defaults.
  useEffect(() => {
    void useAccessibility.getState().hydrateAccessibility();
  }, []);

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
    // OTA-237 — tag each boot stage on a global so the crash handler
    // can name the offender in the diagnostic. Cheap; only writes a
    // string. The crash handler reads __TARTARIA_BOOT_STAGE if the
    // process dies.
    const setStage = (s: string) => {
      (globalThis as unknown as { __TARTARIA_BOOT_STAGE?: string }).__TARTARIA_BOOT_STAGE = s;
    };
    // arb78 — load the player's saved background settings (notifies the
    // AppShell's useDisplaySettings hook once storage resolves).
    void loadDisplaySettings();
    // OTA-405 — GATE A safety cap. otaBootResolved opens the character-entry
    // gate; it's normally set the moment the boot OTA check resolves below.
    // But if hydrate() rejects (or any boot step throws before that line),
    // the gate would stay locked forever and brick the player out of their
    // own saves. This timer force-opens it after 8s no matter what — longer
    // than the OTA check's own 5s budget, so the normal path always wins the
    // race and this only fires on a genuinely stuck boot.
    const otaGateSafetyCap = setTimeout(() => {
      if (!useGameStore.getState().otaBootResolved) {
        useGameStore.setState({ otaBootResolved: true });
      }
    }, 8000);
    setStage('hydrate:start');
    void hydrate()
      .then(async () => {
        setStage('hydrate:done');
        // OTA-367 — BOOT-FRONT auto-apply. Check for an OTA update FIRST,
        // before the mind (Qwen), voice (Kokoro/Piper), and audio modules
        // start. If one is staged, apply it now (reloadAsync) — nothing
        // native is open yet, so the reload can't race a half-initialised
        // module or an in-flight save the way the old mid-load banner-tap
        // could (that race crashed to home AND could persist player=null
        // over the slot). Automatic: no tap required.
        //
        // Fails safe: a disabled env (dev / Expo Go), no update, a slow /
        // offline check (capped at 5s), or any error all fall THROUGH to
        // the normal boot below. The check resolves fast when up to date;
        // it only blocks longer while actually downloading an update.
        try {
          setStage('ota:check');
          const otaResult = await checkAndApplyOTA({ silent: true, checkTimeoutMs: 5000, skipTeardown: true });
          if (otaResult === 'applied') {
            // reloadAsync fired — the JS bridge is restarting onto the new
            // bundle. Do NOT boot the native models; this context is dead.
            // Leave otaBootResolved FALSE — the reload starts a fresh boot
            // that will resolve the gate on the new bundle.
            return;
          }
          setStage('ota:done');
        } catch (otaErr) {
          // eslint-disable-next-line no-console
          console.warn('boot-front OTA check failed (proceeding to load):', otaErr);
        }
        // OTA-405 — GATE A: the boot OTA check is done and we are staying on
        // THIS bundle this launch (the 'applied' path returned above). Open
        // the character-entry gate so the TitleScreen can let the player
        // load / create. Until now it was locked so nobody could load a save
        // onto a bundle about to reloadAsync (the OTA-234 corruption window).
        useGameStore.setState({ otaBootResolved: true });
        // OTA-272 — ML init now gated by mlHealth crash counter. On
        // certain ARMv8.2 Android devices (Snapdragon 865 family —
        // Galaxy S20, Pixel 5, OnePlus 8) the native ML libs crash
        // with SIGSEGV/SIGILL during init (upstream CPU-variant
        // bug we can't patch in an OTA). The mlHealth module
        // detects "previous launch attempted init but never
        // succeeded" (the native crash aborts the process before
        // JS can mark success) and increments a counter; ≥2 crashes
        // and it auto-disables ML for that install. The app stays
        // playable on template narration; the player never sees
        // the "app keeps stopping" loop.
        setStage('mlhealth:load');
        void loadMLHealth().then((health) => {
          setStage('mlhealth:done');
          if (!shouldAttemptMLInit()) {
            // eslint-disable-next-line no-console
            console.warn(
              `mlHealth: cognitive init held (${health.crashCount} crashes detected). Template parsing this session.`,
            );
            // The MiniLM classifier sits on the CRITICAL boot path, so it stays
            // gated by the strict general guard (no boot-loop risk).
            setStage('cognitive:skipped');
            useGameStore.setState({ cognitiveStatus: 'skipped' });
            // arb125 — but the general guard is polluted by OS-kill-during-load
            // FALSE POSITIVES (the "attempted, no success" breadcrumb trips
            // whenever the OS kills the app mid model-load), so it must not
            // permanently bench QWEN on a device that has loaded a model before.
            // Qwen's boot is DEFERRED + crash-caught, so retrying it can't
            // boot-loop the critical path — and a successful init resets the
            // general crash state (markMLInitSucceeded), healing the classifier
            // on the NEXT launch. So honor only Qwen's own guards here.
            if (shouldAttemptQwen()) {
              setTimeout(() => {
                if (!shouldAttemptQwen()) {
                  setStage('qwen:skipped');
                  useGameStore.setState({ qwenStatus: 'skipped' });
                  return;
                }
                setStage('qwen:start');
                void markMLInitAttempted();
                void bootQwen()
                  .then(() => {
                    setStage('qwen:done');
                    void markMLInitSucceeded();
                  })
                  .catch((e) => {
                    // eslint-disable-next-line no-console
                    console.warn('bootQwen failed:', e);
                  });
              }, 3000);
            } else {
              setStage('qwen:skipped');
              useGameStore.setState({ qwenStatus: 'skipped' });
            }
            return;
          }
          if (health.detectedCrashThisBoot) {
            // eslint-disable-next-line no-console
            console.warn(
              `mlHealth: detected previous-launch crash; this is attempt ${health.crashCount}/${'2'} before auto-disable.`,
            );
          }
          // Boot order: classifier (small, fast) first so target
          // resolution is available as soon as the player starts a
          // game. Generative model (large, slow) kicks off afterward
          // without blocking — templates carry the Arbiter until
          // it's ready. Qwen init is deferred by 3 seconds (post
          // OTA-272) so even if the bootQwen path crashes natively,
          // the title screen has already painted and the player can
          // close cleanly.
          setStage('cognitive:start');
          void markMLInitAttempted();
          void bootCognitive().then(() => {
            setStage('cognitive:done');
            void markMLInitSucceeded();
            // Defer Qwen init 3s — see comment above.
            setTimeout(() => {
              // OTA-351 — skip Qwen entirely if its completion-crash guard has
              // tripped (repeated native SIGSEGVs during generation on this
              // device). The classifier above already booted; the Arbiter uses
              // template narration. Fully playable.
              if (!shouldAttemptQwen()) {
                // eslint-disable-next-line no-console
                console.warn('mlHealth: Qwen disabled (completion-crash guard). Template narration this session.');
                setStage('qwen:skipped');
                return;
              }
              setStage('qwen:start');
              void markMLInitAttempted();
              void bootQwen()
                .then(() => {
                  setStage('qwen:done');
                  void markMLInitSucceeded();
                })
                .catch((e) => {
                  // eslint-disable-next-line no-console
                  console.warn('bootQwen failed:', e);
                });
            }, 3000);
          }).catch((e) => {
            // eslint-disable-next-line no-console
            console.warn('bootCognitive failed:', e);
          });
        }).catch((e) => {
          // eslint-disable-next-line no-console
          console.warn('mlHealth load failed (proceeding without gate):', e);
          // Defensive fallback: if the health module itself errors
          // out, run the original boot path. ML libs may still crash
          // but we won't have made things worse.
          setStage('cognitive:start');
          void bootCognitive().then(() => {
            setStage('cognitive:done');
            // OTA-351 — honor the Qwen completion-crash guard on this path too.
            if (!shouldAttemptQwen()) { setStage('qwen:skipped'); return; }
            void bootQwen().catch((err) => {
              // eslint-disable-next-line no-console
              console.warn('bootQwen failed:', err);
            });
          }).catch((err) => {
            // eslint-disable-next-line no-console
            console.warn('bootCognitive failed:', err);
          });
        });
        setStage('audio:start');
        void bootAudio().then(() => {
          setStage('audio:done');
          startAudioController();
        }).catch((e) => {
          // eslint-disable-next-line no-console
          console.warn('bootAudio failed:', e);
        });
        // Voice (TTS + STT) — opt-in via settings; init is cheap so
        // the controller can subscribe immediately. If TTS is disabled
        // the controller short-circuits inside onState. initTTSManager
        // ALSO prewarms Kokoro in the background when bundled engine is
        // enabled — model download / load / graph-compile all happen
        // while the player is on the title screen, so the first spoken
        // line plays without cold-start lag.
        setStage('tts:start');
        void initTTSManager().then(() => {
          setStage('tts:done');
          startTTSController();
        }).catch((e) => {
          // eslint-disable-next-line no-console
          console.warn('initTTSManager failed:', e);
        });
        // OTA-367 — the old +1.5s fetchOnly background check + TitleScreen
        // "tap to apply" banner was REMOVED. That banner-tap was the exact
        // mid-load apply path that crashed to home (native modules still
        // spinning up while reloadAsync swapped the bundle) and could
        // corrupt the save. The boot-FRONT auto-apply above now handles
        // updates cleanly before anything native starts; the AboutScreen
        // "CHECK FOR OTA UPDATE" button remains for a deliberate
        // mid-session apply from a stable state.
        setStage('boot:complete');
      })
      .catch((e) => {
        // OTA-237 — hydrate failure path was previously unhandled,
        // letting the rejection surface to the ErrorUtils handler
        // which would suppress it during the (previous) 5-second
        // window and leave the player with a black screen. Catch +
        // log so the next launch's TitleScreen can show the message.
        setStage('hydrate:failed');
        // eslint-disable-next-line no-console
        console.error('hydrate failed:', e);
        try {
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const AS = require('@react-native-async-storage/async-storage').default;
          void AS.setItem(
            '@tartaria/lastCrash',
            JSON.stringify({
              stage: 'hydrate:failed',
              message: ((e as Error)?.message ?? String(e)).slice(0, 500),
              stack: ((e as Error)?.stack ?? '').slice(0, 2000),
              timestamp: Date.now(),
            }),
          ).catch(() => { /* ignore */ });
        } catch { /* ignore */ }
        // OTA-343 — capture the crashing save bytes so the next launch can
        // COPY CRASHED SAVE. A hydrate failure often IS a corrupt active
        // save (the 338 brick), so this is the most important capture path.
        try {
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const cs = require('./app/diagnostics/crashSave');
          void cs.captureActiveCrashSave('hydrate:failed');
        } catch { /* ignore */ }
      });
    return () => {
      clearTimeout(otaGateSafetyCap);
      stopAudioController();
      stopTTSController();
      void disposeAudio();
    };
  }, [hydrate, bootCognitive, bootQwen]);

  useEffect(() => {
    const onChange = (status: AppStateStatus) => {
      if (status === 'background' || status === 'inactive') {
        // OTA-368 — flush progress the moment the app leaves the
        // foreground. Backgrounding is the most common way a session
        // ends (the OS may reclaim the process without another tick), so
        // this is the single highest-value autosave point. persist()
        // self-guards on no-slot / no-player / invalid record.
        void useGameStore.getState().persist();
        void shutdownCognitive();
        // arb140 — only DUMP the ~400MB Qwen model on a REAL `background`
        // (the process may be reclaimed). A transient `inactive` — notification
        // shade, app-switcher peek, a permission/keyboard event — must NOT kill
        // it: doing so benched the Arbiter for the WHOLE session, because the
        // `active` handler never re-warmed it (every line fell back to
        // template/reason=qwen-not-ready; the long-travel log showed exactly
        // this — init succeeded at boot, then status=idle for 20 min). Remember
        // that WE parked a ready model so `active` knows to bring it back.
        if (status === 'background') {
          if (useGameStore.getState().qwenStatus === 'ready') qwenParkedRef.current = true;
          void shutdownQwen();
        }
        // arb126 — leaving the foreground is an ORDERLY exit, so any Qwen
        // completion / TTS breadcrumb still sitting in storage did NOT crash the
        // process. Wipe it now, before the OS can reclaim us. A breadcrumb that
        // survives to next boot then means a real FOREGROUND native crash — the
        // only signal the completion/voice guards should ever act on. This stops
        // a benign swipe-away / background from being mis-counted as a crash and
        // falsely benching the Arbiter (the user never crashes, yet the guard
        // disabled Qwen + flagged a Kokoro "voice crash" off one benign close).
        void clearInFlightBreadcrumbs();
      } else if (status === 'active') {
        void resumeCognitive();
        // Re-hide the navigation bar — Android sometimes restores it
        // after the app comes back from background (system dialogs,
        // keyboard close events). Idempotent and cheap.
        if (Platform.OS === 'android') {
          const NB = loadNavigationBar();
          if (NB) void NB.setVisibilityAsync('hidden').catch(() => { /* ignore */ });
        }
        // arb140 — re-warm Qwen if WE parked it on `background`. The old
        // comment feared re-triggering the download UI, but the GGUF is already
        // on disk after first launch, so bootQwen()'s download step returns
        // instantly (fraction 0→1, no UI) — only the ~1-5s context reload runs,
        // in the background. Without this, one transient background killed the
        // Arbiter's LLM voice for the rest of the session. Guarded by the
        // parked flag so a user who manually disabled Qwen stays disabled.
        if (qwenParkedRef.current) {
          qwenParkedRef.current = false;
          void bootQwen();
        }
      }
    };
    const sub = AppState.addEventListener('change', onChange);
    return () => sub.remove();
  }, [shutdownCognitive, resumeCognitive, shutdownQwen, bootQwen]);

  // OTA-368 — periodic autosave. persist() fires on every meaningful
  // action, but a player who sits idle (reading, thinking) between
  // actions has no recent write; if a rollback or crash happens then,
  // the gap is whatever they last did. A gentle 90s timer bounds that
  // loss to ~90s of idle. The write is atomic + cheap, and persist()
  // self-guards (no slot / no player / invalid record → no-op), so the
  // timer can fire unconditionally even on the title screen.
  useEffect(() => {
    const AUTOSAVE_MS = 90_000;
    const timer = setInterval(() => {
      void useGameStore.getState().persist();
    }, AUTOSAVE_MS);
    return () => clearInterval(timer);
  }, []);

  // OTA-857 — the world's REAL-TIME heartbeat. The war used to advance only when
  // the player took actions that burned in-game hours, so a player who opened the
  // World board and watched saw a frozen feed ("still nothing populating"). This
  // wall-clock timer ticks the sim on its own, no matter what screen is open, so
  // patrols roam + clash + get mauled continuously and the board is a live scroll.
  // worldRealtimeTick() self-guards (no player / title / creation / ending → no-op)
  // and does NOT persist (the 90s autosave + player actions flush worldMemory), so
  // it's cheap to fire unconditionally.
  useEffect(() => {
    const WORLD_HEARTBEAT_MS = 6_000;
    const timer = setInterval(() => {
      useGameStore.getState().worldRealtimeTick();
    }, WORLD_HEARTBEAT_MS);
    return () => clearInterval(timer);
  }, []);

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
      {/* OTA-237 — global modals wrapped in their own SilentBoundary.
          Previously these mounted OUTSIDE any error boundary; a render
          error in TutorialOverlay / CallDogModal / etc became a
          process crash because React doesn't catch unhandled child
          errors at the SafeAreaProvider level. SilentBoundary catches
          + returns null so the rest of the UI keeps rendering. */}
      <SilentBoundary tag="TutorialOverlay">
        {/* TutorialOverlay sits OUTSIDE SafeAreaView so its absolute
            positioning matches measureInWindow coords from the targets
            (which report screen-absolute, not safe-area-relative). */}
        <TutorialOverlay />
      </SilentBoundary>
      <SilentBoundary tag="CallDogModal">
        <CallDogModal />
      </SilentBoundary>
      <SilentBoundary tag="DiscoveryRevealModal">
        <DiscoveryRevealModal />
      </SilentBoundary>
      <SilentBoundary tag="AetherStatPickerModal">
        <AetherStatPickerModal />
      </SilentBoundary>
      {/* OTA-1020 — chapter cards mount GLOBALLY (not per-screen) because
          main-quest phase transitions fire from more than one screen: travel
          arrival lands on exploration, but the Nexus choice fires from
          Contracts. Wherever the arc turns, the card shows. */}
      {/* OTA-1065 — ABOVE the chapter card in the tree so a decision is never
          drawn under a marker. raiseDueFork already yields to a live card, so
          in practice they never both want the screen; this is the belt to that
          braces. */}
      <SilentBoundary tag="StoryForkOverlay">
        <StoryForkOverlay />
      </SilentBoundary>
      <SilentBoundary tag="ChapterCardOverlay">
        <ChapterCardOverlay />
      </SilentBoundary>
      {/* OTA-1022 — one-time veteran motive picker, raised by the load paths
          for saves whose motive was dealt by backfill rather than chosen. */}
      <SilentBoundary tag="MotivePickerModal">
        <MotivePickerModal />
      </SilentBoundary>
      {/* OTA-1023 — the opening crawl mounts GLOBALLY (it lived on the
          exploration screen only, which forced REPLAY OPENING to navigate
          there first). Now REPLAY plays right over whatever screen raised
          it — the CharacterScreen header button included. */}
      <SilentBoundary tag="StoryIntroOverlay">
        <StoryIntroOverlay />
      </SilentBoundary>
      {/* OTA-1027 — dog onboarding + golem naming moved out of the typed feed
          into blocking popups (a playtester typed "rest" at the breed ask and
          the old takeover swallowed it as the answer). */}
      <SilentBoundary tag="DogOnboardingModal">
        <DogOnboardingModal />
      </SilentBoundary>
      <SilentBoundary tag="GolemNamingModal">
        <GolemNamingModal />
      </SilentBoundary>
      <SilentBoundary tag="KeyboardInputBar">
        <KeyboardInputBar />
      </SilentBoundary>
    </SafeAreaProvider>
  );
}

// OTA-237 — lightweight error boundary for globally-rendered overlays.
// Catches render errors, logs the tag + error to the boot-stage trail
// (so the next launch's diagnostic can name the offender), and renders
// null so the rest of the app keeps working. Unlike ScreenErrorBoundary
// (which shows a recovery card), these overlays disappearing silently
// is the right UX — they're not the primary screen.
class SilentBoundary extends React.Component<
  { tag: string; children: React.ReactNode },
  { failed: boolean }
> {
  constructor(props: { tag: string; children: React.ReactNode }) {
    super(props);
    this.state = { failed: false };
  }
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error) {
    // eslint-disable-next-line no-console
    console.warn(`SilentBoundary[${this.props.tag}] caught:`, error?.message, error?.stack);
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const AS = require('@react-native-async-storage/async-storage').default;
      void AS.setItem(
        `@tartaria/lastCrash`,
        JSON.stringify({
          stage: `overlay:${this.props.tag}`,
          message: (error?.message ?? String(error)).slice(0, 500),
          stack: (error?.stack ?? '').slice(0, 2000),
          timestamp: Date.now(),
        }),
      ).catch(() => { /* ignore */ });
    } catch { /* ignore */ }
  }
  render() {
    if (this.state.failed) return null;
    return this.props.children;
  }
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
  componentDidCatch(error: Error, errorInfo: { componentStack?: string }) {
    // Surface to the JS log so the next bug report COPY ALL captures it.
    // eslint-disable-next-line no-console
    console.warn('ScreenErrorBoundary caught:', error?.message, errorInfo?.componentStack);
    // OTA-343 — a screen render crash is also a crash; capture the active
    // save bytes so COPY CRASHED SAVE can export them next launch. The
    // ScreenErrorBoundary shows a recovery card (not a process death), but
    // the save that drove the bad render is exactly what we want for repro.
    // arb130 — ALSO capture the error message + React component stack, so the
    // crashed-save report names the EXACT component that faulted/looped (e.g.
    // pinning "Maximum update depth exceeded" to its screen/overlay) — no adb.
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const cs = require('./app/diagnostics/crashSave');
      void cs.captureActiveCrashSave('screen-render', {
        error: (error?.message ?? String(error)).slice(0, 300),
        componentStack: (errorInfo?.componentStack ?? '').slice(0, 1800),
      });
    } catch { /* ignore */ }
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
  // OTA 023 — see prior comment for why insets are trusted directly.
  // arb77 — top-padding FLOOR. iPad in portrait (status bar hidden) reports a
  // tiny/zero top inset, so the top row (settings gear) clipped against the
  // physical edge. Math.max(top, 14) gives a small floor that fixes iPad
  // portrait without over-padding notched iPhones (their top inset >> 14).
  const top = Math.max(insets.top, 14);
  const bottom = insets.bottom;
  // OTA 23-005 — global responsive scale. useWindowDimensions inside
  // useUiScale is reactive: orientation flips, foldable splits, and
  // any OS-driven dimension change re-renders this AppShell and the
  // scale recomputes. Every screen rendered below inherits the new
  // scale via the wrapper transform — no per-screen changes needed.
  const ui = useUiScale();
  // arb78 — player-tunable background. Re-renders live as sliders change.
  const display = useDisplaySettings();
  // OTA-182 — keyboard-aware interior height. The wrapper View has
  // a FIXED HEIGHT (interiorHeight) inside a `transform: scale`
  // container. Android's native adjustResize can't shrink a fixed-
  // height transformed View; KeyboardAvoidingView inside also can't
  // see the keyboard's footprint because the parent's height stays
  // constant. Net effect: when the keyboard pops up, the InputBox
  // text field gets covered.
  // Fix: subscribe to keyboardDidShow / keyboardDidHide and shrink
  // interiorHeight by the keyboard's reported height. The wrapping
  // View shrinks → InputBox at the bottom rises above the keyboard
  // — same effect adjustResize would have given on a non-scaled
  // container. Player ask: "whenever I am using the keyboard the
  // text box I am typing into needs to be pushed above the keyboard
  // so I am see what I am typing."
  const [keyboardOffset, setKeyboardOffset] = useState(0);
  useEffect(() => {
    const onShow = (e: { endCoordinates: { height: number } }) => {
      setKeyboardOffset(e.endCoordinates.height);
    };
    const onHide = (): void => setKeyboardOffset(0);
    const showSub = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', onShow);
    const hideSub = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', onHide);
    return () => { showSub.remove(); hideSub.remove(); };
  }, []);
  // OTA-190 — minimum bottom-padding floor so the bottom row of the
  // ExplorationScreen (quick action chips + input + Act) isn't
  // mashed flush against the screen edge on Android devices where
  // immersive mode hides the nav bar and the safe-area inset reports
  // 0. Player ask: "I need the main screen to always auto adjust to
  // not be mushed into the very bottom on all devices." Math.max
  // keeps the bigger value when the device DOES report an inset
  // (gesture-area phones, iOS home-indicator devices).
  const bottomPad = Math.max(bottom, 12);
  // Available interior height the wrapper paints into (the safe
  // outer View handles the status/nav bar insets). Subtract the
  // keyboard's logical-pixel height so the text input rises into
  // view when typing.
  const interiorHeight = ui.logicalHeight - (top + bottomPad + keyboardOffset) / ui.scale;
  return (
    <View style={[styles.root, { backgroundColor: baseColorOf(display) }]}>
      {/* arb76/arb78 — player-tunable "aged artifact" background. Full-bleed,
          behind everything, OUTSIDE the safe-area padding so it bleeds under
          the bars. Umber base (styles.root) → faint tiled parchment (~5%) →
          radial vignette that darkens the margins but keeps the center clear.
          pointerEvents none so it never eats a touch. */}
      {/* arb84 — parchment tiles via ImageBackground (a plain <Image> with
          resizeMode="repeat" does NOT tile — it draws ONE 256px copy in the
          top-left corner, which read as a hard-edged lighter rectangle / the
          "color split"). ImageBackground tiles reliably; opacity goes on the
          CONTAINER style (not imageStyle, which iOS ignored) so it dims
          reliably AND repeats. */}
      <ImageBackground
        source={require('./assets/textures/parchment.png')}
        resizeMode="repeat"
        style={[StyleSheet.absoluteFill, { opacity: display.textureOpacity }]}
      />
      <Image
        source={require('./assets/textures/vignette.png')}
        resizeMode="stretch"
        style={[StyleSheet.absoluteFill, { opacity: display.vignetteStrength }]}
      />
      <View style={[styles.safe, { paddingTop: top, paddingBottom: bottomPad, paddingLeft: insets.left, paddingRight: insets.right }]}>
        <StatusBar style="light" hidden />
        <View
          style={{
            width: ui.logicalWidth,
            height: interiorHeight,
            transform: [{ scale: ui.scale }],
            transformOrigin: 'top left',
          }}
        >
          {screen === 'title' && <TitleScreen />}
          {screen === 'character_creation' && <CharacterCreationScreen />}
          {screen === 'exploration' && <ExplorationScreen />}
          {screen === 'log' && <LogScreen />}
          {screen === 'lore' && <LoreScreen />}
          {screen === 'about' && <AboutScreen />}
          {screen === 'inventory' && <InventoryScreen />}
          {screen === 'character' && <CharacterScreen />}
          {screen === 'map' && <MapScreen />}
          {screen === 'crafting' && <CraftingScreen />}
          {screen === 'vendor' && <VendorScreen />}
          {screen === 'actions' && <ActionReferenceScreen />}
          {screen === 'contracts' && <ContractsScreen />}
          {screen === 'world' && <WorldScreen />}
          {screen === 'ending' && <EndingScreen />}
        </View>
      </View>
      {/* OTA-471 — opening splash overlay at the ROOT (outside the safe-area
          padding + scale transform), so it's full-bleed with no parchment
          margins. Self-dismisses after ~2s on first launch. */}
      <SplashOverlay />
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
  // arb76 — root holds the umber base + full-bleed background layers.
  root: {
    flex: 1,
    backgroundColor: '#241C17', // warm umber — lightened ~18% from #1A1412 (player: too dark)
  },
  // safe is now transparent so the root's artifact background shows through.
  safe: {
    flex: 1,
    backgroundColor: 'transparent',
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
