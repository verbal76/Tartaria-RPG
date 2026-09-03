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
  qwenGateReason, // OTA-1635 — the skip branches say why, in the log
} from './app/diagnostics/mlHealth';
import { clearLiveBreadcrumb } from './app/engine/saveSystem'; // OTA-1276
import { TitleScreen } from './app/screens/TitleScreen';
import { SplashOverlay } from './app/components/SplashOverlay';
// ⚠ OTA-1382 — controller navigation. GamepadNav.tsx is an 8-line native stub
// that renders null; GamepadNav.web.tsx is the real PC implementation. Metro
// picks by platform, so mounting it here is inert on phones and makes App.tsx
// identical across all four lines.
import { GamepadNav } from './app/components/GamepadNav';
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
import { DedicationOverlay } from './app/components/DedicationOverlay';
import { CrashReportNoticeOverlay } from './app/components/CrashReportNoticeOverlay'; // OTA-1488
import { armQwenWarm } from './app/ai/deferredQwenWarm'; // OTA-1493
import { SummonRefusalModal } from './app/components/SummonRefusalModal'; // OTA-1495
import { StoryRevealOverlay } from './app/components/StoryRevealOverlay'; // OTA-1183
import { StoryForkOverlay } from './app/components/StoryForkOverlay'; // OTA-1065
import { MotivePickerModal } from './app/components/MotivePickerModal'; // OTA-1022
import { StoryIntroOverlay } from './app/components/StoryIntroOverlay'; // OTA-1023 — global (was exploration-only)
import { DeathOverlay } from './app/components/DeathOverlay'; // OTA-1110 — the closing scene, global by necessity
import { DogOnboardingModal } from './app/components/DogOnboardingModal'; // OTA-1027
import { WandererEncounterModal } from './app/components/WandererEncounterModal'; // OTA-1530
import { GolemNamingModal } from './app/components/GolemNamingModal'; // OTA-1027
import { KeyboardInputBar } from './app/components/KeyboardInputBar';
import { bootAudio, disposeAudio } from './app/audio/AudioManager';
import { startAudioController, stopAudioController } from './app/audio/AudioController';
import { initTTSManager } from './app/voice/TTSManager';
import { startTTSController, stopTTSController } from './app/voice/TTSController';
import { createExpoFileSystemAdapter } from './app/voice/executorchAdapter';
import { checkAndApplyOTA } from './app/updates/checkAndApplyOTA';
// OTA-1174 — read what expo thinks it is running, for the boot-check log line.
import * as Updates from 'expo-updates';
import { useUiScale } from './app/ui/uiScale';
import { loadDisplaySettings, useDisplaySettings, baseColorOf } from './app/ui/displaySettings';
import { autosaveTick, loadAutosaveDisabled, AUTOSAVE_INTERVAL_MS } from './app/ui/autosave';
import { loadUiScale } from './app/ui/displayScale'; // OTA-1227
import { initDesktopBack, useBackAction } from './app/ui/desktopBack'; // OTA-1229 — right-click / Escape = back

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
      // ⚠⚠ OTA-1380 — AND THE LEDGER, which is the durable copy. The
      // `@tartaria/lastCrash` write above is a SINGLE SLOT: crash twice and the
      // first is overwritten, so a crash loop and a one-off read identically
      // and the most informative crash — the first, before the app was already
      // sick — is the one lost. The ledger keeps the last ten. Separate try so
      // it can never cost the two writes above.
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const cl = require('./app/diagnostics/crashLedger');
        const stage = (globalThis as unknown as { __TARTARIA_BOOT_STAGE?: string }).__TARTARIA_BOOT_STAGE ?? 'unknown';
        cl.recordCrash({
          kind: 'js-fatal',
          stage,
          message: err?.message ?? String(err),
          stack: err?.stack ?? '',
          isFatal: !!isFatal,
          sinceBoot: Date.now() - bootTime,
        });
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

// ⚠⚠ OTA-1275 — how long the app must stay in the FOREGROUND before the parked
// Qwen model is rebuilt. Measured against the owner's own log-copy workflow,
// whose foreground visits ran 2.3s / 2.5s / 2.4s / 6.9s while he switched out to
// paste each part: 8s clears all of that churn, and a real play session passes
// it without noticing. Not a guess at a "nice" number — the number that makes
// app-switching free.
const QWEN_REWARM_DELAY_MS = 8_000;

// ⚠⚠⚠ OTA-1462 — HOW LONG A `background` MUST LAST BEFORE WE BELIEVE IT.
//
// OTA-1275 debounced the way back IN and left the way OUT immediate, with a
// stated reason: *"The dump on `background` stays IMMEDIATE — that is the
// jetsam fix, and holding 425MB while backgrounded is what gets us killed. Only
// the reload waits."* That is right about a real background. It is wrong about
// what Android actually sends, and the owner's 2026-08-23 log is the proof —
// five of these inside ninety seconds, every one of them a few hundred
// milliseconds long:
//
//   23:52:09.808  active → background      23:52:10.163  → active (355ms)
//   23:52:51.665  active → background      23:52:51.831  → active (166ms)
//   23:54:00.671  active → background      23:54:00.874  → active (204ms)
//   23:54:15.820  active → background      23:54:16.045  → active (225ms)
//   23:54:30.087  active → background      23:54:30.483  → active (396ms)
//
// Nobody switches away and back in 204ms. That is a focus blip — a shade pull,
// a system dialog, a keyboard, a gesture — and the app never actually left.
//
// ⚠⚠ AND THE TEARDOWN LANDED AFTER THE RETURN, ON ALL FIVE. `ctx: RELEASED` is
// stamped at :10.325, :52.067, :01.021, :16.187, :30.774 — every one of them
// AFTER the matching `→ active`. So the release was not protecting a
// backgrounded app from the low-memory killer; it was freeing 425MB belonging
// to an app that was already back on screen, which the watchdog then spent
// another 425MB rebuilding eight seconds later. Five full allocate/free cycles
// of a ~425MB native context in ninety seconds, all of it pure waste — and at
// 23:54:46, 126ms into a `flee`, the process was reaped mid-action.
//
// ⚠ THE SAME BLIP ALSO BLINDED THE CRASH FORENSICS, which is why all three
// records in his ledger read `doing: (no action yet)` — see the deferred
// `clearLiveBreadcrumb` below. One cause, two symptoms.
//
// The window is measured, not guessed: every blip in that log is ≤396ms and
// every genuine background is ≥7.7s. 1500ms sits between them with almost four
// times the margin over the longest blip, and delays a real dump by 1.5s —
// which the killer does not act inside of.
const BACKGROUND_SETTLE_MS = 1_500;

// ⚠ OTA-1495 — subscribes so the modal file stays presentational (message in,
// dismiss out) and cannot drift into owning refusal logic.
function SummonRefusalGate() {
  const message = useGameStore((s) => s.summonRefusal);
  const dismiss = useGameStore((s) => s.dismissSummonRefusal);
  return <SummonRefusalModal message={message} onDismiss={dismiss} />;
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
  // ⚠⚠ OTA-1275 — the re-warm timer. See the app-state handler below: the model
  // reload is DEBOUNCED on continuous foreground so app-switching cannot thrash
  // a ~425MB native load/free cycle every couple of seconds.
  const qwenRewarmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // ⚠ OTA-1358 — the classifier resume gets the same settled-foreground debounce
  // the Qwen re-warm earned. resumeCognitive() used to fire a native ONNX
  // session create on EVERY `active` twitch — the third freeze died 1ms into
  // one of those transitions — and a 2-second app-switch does not need the
  // classifier back at all.
  const cognitiveResumeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // ⚠⚠⚠ OTA-1462 — the teardown timer. A `background` no longer tears anything
  // down on the spot; it ARMS this, and a `active` inside the window disarms it
  // with nothing having happened. See BACKGROUND_SETTLE_MS.
  const backgroundTeardownTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      // ⚠⚠⚠ OTA-1593 — AND THE DYING BREATH LEARNS THE BOOT. The owner's last
      // seven process kills all read `stage native:cognition:done · (no action
      // yet) · alive 0ms after it`: every one died between the classifier's
      // first job and the first screen, and NOTHING in that window stamped the
      // crumb — the heartbeat only runs on the exploration screen, so the
      // ledger could not narrow the window past "after the classifier, before
      // the game". This global already names every boot step (28 call sites,
      // one writer); mirroring it into the phase stamp means the next
      // boot-time kill names the exact step it died under — qwen:deferred,
      // audio:start and boot:complete are three different suspects with three
      // different fixes. Lazy require + swallow: a boot tracer that can break
      // boot is worse than no tracer.
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const save = require('./app/engine/saveSystem') as typeof import('./app/engine/saveSystem');
        save.stampBreadcrumbPhase(`boot:${s}`);
      } catch { /* an instrument may never break the thing it measures */ }
    };
    // arb78 — load the player's saved background settings (notifies the
    // AppShell's useDisplaySettings hook once storage resolves).
    void loadDisplaySettings();
    // ⚠⚠ OTA-1380 — hydrate the crash ledger and the delivery preference at
    // boot. Both are read SYNCHRONOUSLY later (crashLedgerSummary and
    // reportingStatusLine serve the About screen and the bug report, neither of
    // which can grow a loading state), so the read has to have happened by then
    // or those blocks report "(not loaded yet)" on the one screen a player
    // opens when something has gone wrong.
    //
    // ⚠ The flush is deliberately AFTER both loads and is itself a no-op unless
    // a transport is installed AND the player opted in. It was wired at OTA-1380
    // so that adding a transport later would need no boot change — and OTA-1401
    // added one, with exactly the boot change that predicted: none. The only new
    // line is the install below it.
    void (async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const cl = require('./app/diagnostics/crashLedger');
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const cr = require('./app/diagnostics/crashReporter');
        // ⚠⚠ OTA-1401 — LAZY require, AND THAT IS LOAD-BEARING, NOT STYLE.
        // `@sentry/react-native` is a NATIVE module. This OTA reaches devices
        // running an APK compiled before it existed, and a bundle that imports
        // it at module scope fails to load on every one of them — whereupon
        // expo-updates abandons the update and reverts, silently, looking
        // exactly like "the update never arrived" (the OTA-1174 symptom). The
        // installer itself require()s the SDK lazily too; this require only
        // reaches our own file, which is pure JS.
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const st = require('./app/diagnostics/sentryTransport');
        st.installSentryIfAvailable();
        await cl.loadCrashLedger();
        await cr.loadReportingPref();
        // ⚠ OTA-1488 — the FIRST send waits for the one-time opt-out notice:
        // nothing leaves the device before the player has seen the popup that
        // says it will. The overlay flushes on dismissal; once the notice flag
        // is stored, every later boot takes this flush as before.
        if (!(await cr.crashNoticeNeeded())) await cr.flushCrashReports();
        // ⚠⚠ OTA-1504 — THE DURABLE SEND-LOG RETRY. A bundle the owner tapped
        // out and then force-closed (his exact habit, and the proven killer of
        // every bundle on 2026-08-25) is sitting in a file; each boot re-sends
        // it until its attempts are spent — even after a flush() that claimed
        // success, because that claim has been caught lying. Behind the same
        // told-first gate as the crash flush: nothing leaves before the notice.
        if (!(await cr.crashNoticeNeeded())) {
          // ⚠⚠⚠ OTA-1512 — WAIT FOR THE OTA CHECK BEFORE SPENDING AN ATTEMPT.
          // The owner's 22:02 log caught this retry firing INTO an update: the
          // send started at :32.453 and `ota: Restarting to apply…` landed at
          // :33.270, 0.8s later. No ~270KB envelope uploads in 0.8s, and
          // reloadAsync takes the whole JS context down with it — so the
          // attempt was spent on a process that was already dying. The boot on
          // the far side of that restart then burned a THIRD attempt 25ms in,
          // before the Sentry transport even existed.
          //
          // `otaBootResolved` is exactly the right signal and already exists:
          // the OTA path sets it only when the check is done AND we are staying
          // on this bundle (the 'applied' branch returns without setting it,
          // precisely because that context is dead). Waiting on it means a
          // restarting boot never attempts at all, and a staying boot attempts
          // with a live transport and a network no longer busy with the update.
          const staying = await new Promise<boolean>((resolve) => {
            if (useGameStore.getState().otaBootResolved) { resolve(true); return; }
            const timer = setTimeout(() => { unsub(); resolve(false); }, 15_000);
            const unsub = useGameStore.subscribe((st) => {
              if (st.otaBootResolved) { clearTimeout(timer); unsub(); resolve(true); }
            });
          });
          if (staying) {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const pb = require('./app/diagnostics/pendingBundle');
            const line = await pb.retryPendingBundleAtBoot();
            if (line) useGameStore.getState().appendLog('debug', line);
          }
        }
      } catch { /* diagnostics must never block a boot */ }
    })();
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
        // ⚠⚠ OTA-1174 — THE UPDATE PATH NOW SAYS WHAT IT DID, ON THE DEVICE LOG.
        //
        // Owner, stuck on OTA-1171 while 1195 and 1196 sat published and unreachable:
        // *"it hasn't been able to pull an update after that."* Both were verified
        // published to hal2001 AND preview, iOS, runtimeVersion 2.4.1 — the server side
        // was provably fine — and there was NOTHING on the device that could say why they
        // were not landing. This block swallowed every failure into a `console.warn`,
        // which no bug report has ever carried, and `silent: true` threw away the status
        // and error callbacks entirely. An update path with no telemetry is one you can
        // only debug by guessing, which is exactly the afternoon that produced this.
        //
        // ⚠ ADDITIVE ONLY, AND DELIBERATELY SO. Not one line of control flow changes
        // here: same call, same options, same branches, same fall-through. This is the
        // one code path where a clever fix that goes wrong leaves the player with no way
        // to receive the correction — so it gets logging and nothing else.
        const otaLog = (m: string): void => {
          try { useGameStore.getState().appendLog('debug', m); } catch { /* never block boot */ }
        };
        try {
          setStage('ota:check');
          // What expo thinks it is running RIGHT NOW, before we ask for anything. If this
          // disagrees with OTA_BUILD_ID the device is running a bundle it did not expect.
          try {
            const U = Updates as unknown as { isEnabled?: boolean; updateId?: string | null; channel?: string | null; runtimeVersion?: string | null };
            otaLog(`ota: boot check — enabled=${U.isEnabled} channel=${U.channel ?? '?'} rt=${U.runtimeVersion ?? '?'} updateId=${U.updateId ?? '(embedded)'}`);
          } catch { /* diagnostics must never gate the check */ }
          const otaResult = await checkAndApplyOTA({
            silent: true,
            // ⚠⚠⚠ OTA-1453 — 5s WAS TOO SHORT, AND LOSING THAT RACE COSTS A WHOLE
            // SESSION. Owner: *"most will never think to restart right away and will
            // miss an update"* — and, of a second player's phone, *"why does hers
            // always have to update 2-3 times to catch up when everyone else's only
            // takes the newest one."* Both reports are this one number.
            //
            // ⚠⚠ THIS IS THE ONLY WINDOW IN THE APP WHERE AN UPDATE CAN LAND ON THE
            // START THAT FINDS IT. It runs before bootQwen / bootCognitive / bootAudio
            // / initTTSManager, which is what makes `skipTeardown` honest — there are
            // no native handles to race. OTA-404 proved what happens anywhere later:
            // reloadAsync while those four are mid-init drops the process to the home
            // screen ("title screen visible for 1 second then drops to the phone's
            // homescreen"), and OTA-405 reverted it. So a check that does not answer
            // HERE cannot be applied until the next launch, and the player spends this
            // whole session on the old bundle.
            //
            // ⚠⚠ WHAT THE SHORT BUDGET WAS PROTECTING, AND WHY 10s STILL PROTECTS IT.
            // It exists so an OFFLINE launch is not held at the splash — real, but
            // priced wrong. A live network answers this in well under a second, so the
            // extra time is spent only by a device that is offline or on a cold radio
            // — and a cold radio at launch is exactly the case that was failing. 10s is
            // not a fresh magic number either: it is `checkAndApplyOTA`'s own default,
            // which every other caller already uses. The boot-front was the single
            // place that shortened it, and the single place where losing costs most.
            //
            // ⚠ The DOWNLOAD budget is untouched (240s, OTA-369). This is the "is there
            // one?" question, not the transfer.
            checkTimeoutMs: 10_000,
            skipTeardown: true,
            // ⚠ `silent` only suppresses UI. These now land in the device log, so a
            // report shows 'Checking…' → 'Downloading…' → what happened, or where it
            // stopped. A stall between two of these lines names its own step.
            onStatus: (m) => otaLog(`ota: ${m}`),
            onError: (m) => otaLog(`⚠ ota error: ${m}`),
          });
          otaLog(`ota: boot check result = ${otaResult}`);
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
          // ⚠ AND ON THE DEVICE LOG TOO. A console.warn reaches a developer with a cable
          // attached; it has never once reached a pasted bug report, which is the only
          // channel that actually exists between this app and the person fixing it.
          otaLog(`⚠ ota: boot check FAILED — ${otaErr instanceof Error ? otaErr.message : String(otaErr)} (staying on this bundle)`);
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
              // ⚠⚠ OTA-1493 — the 3s boot timer became the FIRST PLAYER ACTION.
              // Six native-death receipts (sentry-inbox/crash_*): every kill was
              // boot-adjacent, "no action yet", inside the ctx lifecycle this
              // timer started. The guard re-checks at fire time, as the timer did.
              setStage('qwen:deferred');
              armQwenWarm(() => {
                if (!shouldAttemptQwen()) {
                  setStage('qwen:skipped');
                  useGameStore.setState({ qwenStatus: 'skipped' });
                  // OTA-1635 — the log says why the Arbiter is on templates.
                  try { useGameStore.getState().appendLog('debug', `qwen: SKIPPED this session — ${qwenGateReason()}`); } catch { /* ignore */ }
                  return;
                }
                setStage('qwen:start');
                void markMLInitAttempted();
                void bootQwen()
                  .then(() => {
                    // ⚠⚠ OTA-1180 — CHECK, DON'T ASSUME. `bootQwen()` RESOLVES ON FAILURE.
                    // See the twin call site below for the measurement and the consequence;
                    // both sites had the identical defect and both are fixed.
                    const ok = useGameStore.getState().qwenStatus === 'ready';
                    setStage(ok ? 'qwen:done' : 'qwen:failed');
                    if (ok) void markMLInitSucceeded();
                  })
                  .catch((e) => {
                    // eslint-disable-next-line no-console
                    console.warn('bootQwen failed:', e);
                  });
              });
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
            // ⚠⚠ OTA-1493 — "defer 3s" became "defer to the first player
            // action"; see the twin site above for the receipts.
            setStage('qwen:deferred');
            armQwenWarm(() => {
              // OTA-351 — skip Qwen entirely if its completion-crash guard has
              // tripped (repeated native SIGSEGVs during generation on this
              // device). The classifier above already booted; the Arbiter uses
              // template narration. Fully playable.
              if (!shouldAttemptQwen()) {
                // eslint-disable-next-line no-console
                console.warn('mlHealth: Qwen disabled (completion-crash guard). Template narration this session.');
                setStage('qwen:skipped');
                // OTA-1635 — and say so where the owner can read it.
                try { useGameStore.getState().appendLog('debug', `qwen: SKIPPED this session — ${qwenGateReason()}`); } catch { /* ignore */ }
                return;
              }
              setStage('qwen:start');
              void markMLInitAttempted();
              void bootQwen()
                .then(() => {
                  // ⚠⚠ OTA-1180 — `bootQwen()` RESOLVES WHETHER OR NOT THE MODEL LOADED, AND
                  // THIS TREATED THAT AS SUCCESS. Its own comment says so outright:
                  // "qwen.initialize() swallows errors and sets its own internal status to
                  // 'failed' rather than throwing" — it then sets `qwenStatus: 'failed'` and
                  // returns normally. So a failed load reached `.then()` and was recorded as
                  // an init success.
                  //
                  // ⚠⚠ MEASURED — owner's report, 2026-08-09, build 1202. The header claims
                  // a healthy init while every other signal says the model never loaded:
                  //     Boot stage: qwen:done
                  //     Last init success: 2026-08-09T03:28:28.017Z
                  //     Status: active (no crashes detected) · Crash count: 0
                  //     Model contexts — Opened: 0 · Live now: 0     ← never loaded
                  //     ⚠⚠ MEMORY WARNING #1 — qwen='failed'          ← never loaded
                  //     arbiter: template (reason=qwen-not-ready)     ← never loaded
                  //
                  // ⚠⚠ AND IT IS NOT COSMETIC. `markMLInitSucceeded()` deliberately WIPES
                  // `KEY_CRASH_COUNT` and `KEY_DISABLED` (arb124: a real success proves the
                  // device can load the model). Calling it after a FAILED load resets the
                  // guard that exists to bench Qwen after repeated failures — so the counter
                  // can never reach its threshold of 2, and the protection is permanently
                  // defeated. `Crash count: 0` in that report is the guard being wiped, not
                  // a healthy device.
                  const ok = useGameStore.getState().qwenStatus === 'ready';
                  setStage(ok ? 'qwen:done' : 'qwen:failed');
                  if (ok) void markMLInitSucceeded();
                })
                .catch((e) => {
                  // eslint-disable-next-line no-console
                  console.warn('bootQwen failed:', e);
                });
            });
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
            // OTA-1493 — and defer to the first action on this path too.
            setStage('qwen:deferred');
            armQwenWarm(() => {
              if (!shouldAttemptQwen()) {
                setStage('qwen:skipped');
                try { useGameStore.getState().appendLog('debug', `qwen: SKIPPED this session — ${qwenGateReason()}`); } catch { /* ignore */ } // OTA-1635
                return;
              }
              void bootQwen().catch((err) => {
                // eslint-disable-next-line no-console
                console.warn('bootQwen failed:', err);
              });
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
        // ⚠⚠ OTA-1275 — CANCEL ANY PENDING RE-WARM, on `inactive` too. This is
        // the half that stops the thrash: a foreground visit shorter than the
        // debounce never loads the model at all, so leaving again costs nothing.
        if (qwenRewarmTimer.current) {
          clearTimeout(qwenRewarmTimer.current);
          qwenRewarmTimer.current = null;
          useGameStore.getState().appendLog('debug', 'qwen: re-warm cancelled (left the foreground first)');
        }
        // OTA-1358 — a foreground visit shorter than the debounce never
        // recreates the classifier session either.
        if (cognitiveResumeTimer.current) {
          clearTimeout(cognitiveResumeTimer.current);
          cognitiveResumeTimer.current = null;
        }
        // ⚠⚠⚠ OTA-1462 — EVERYTHING BELOW IS DEFERRED, AND NOTHING ABOVE IS.
        //
        // The split is the whole fix. Above: `persist()`, `shutdownCognitive()`
        // and the two timer cancellations — all cheap, all idempotent, and
        // persisting immediately is the one thing a blip must NOT delay, because
        // a real kill can follow one. Below: the destructive half — freeing
        // ~425MB and erasing the forensic breadcrumb — which must only happen
        // once we believe the app has actually gone.
        //
        // ⚠ IF THE PLAYER COMES BACK INSIDE THE WINDOW, NONE OF THIS RUNS AT
        // ALL. Not "runs and is undone" — never runs. That is what makes the
        // re-warm unnecessary too: the context was never released, so there is
        // nothing to rebuild, and the 425MB round-trip disappears rather than
        // being merely postponed.
        if (status === 'background' && !backgroundTeardownTimer.current) {
          backgroundTeardownTimer.current = setTimeout(() => {
            backgroundTeardownTimer.current = null;
            // ⚠⚠ THE PARK FLAG IS SET HERE, NOT AT `background`. Setting it up
            // there would mark the model parked on a blip that never released
            // it, and the `active` handler would then "re-warm" a context that
            // was live the whole time — a 425MB load to replace nothing. The
            // flag means "we took it away", so it belongs where we take it away.
            if (useGameStore.getState().qwenStatus === 'ready') qwenParkedRef.current = true;
            void shutdownQwen();
            // arb126 — leaving the foreground is an ORDERLY exit, so any Qwen
            // completion / TTS breadcrumb still sitting in storage did NOT crash
            // the process. Wipe it, before the OS can reclaim us. A breadcrumb
            // that survives to next boot then means a real FOREGROUND native
            // crash — the only signal the completion/voice guards should ever
            // act on. This stops a benign swipe-away from being mis-counted as a
            // crash and falsely benching the Arbiter.
            void clearInFlightBreadcrumbs();
            // ⚠⚠⚠ OTA-1276 SET THIS UP; OTA-1462 IS WHY IT KEPT LYING. An
            // orderly exit clears the live breadcrumb, so one that SURVIVES to
            // the next boot means the process died while still live. Correct —
            // but on the immediate path a 300ms blip wiped the crumb of a
            // LIVE PLAYER ACTION, and the next render stamp rebuilt one from
            // scratch with `what: '(no action yet)'`.
            //
            // That is precisely what the owner's ledger shows. All three
            // `native-death` records say `doing: (no action yet) · room ? ·
            // screen ?`, and the newest of them is timestamped 126ms into a
            // `flee` the log records plainly. Five OTAs of forensics, answering
            // "nothing was happening" every time something was. Deferring the
            // clear past the blip is what lets the crumb keep the action.
            void clearLiveBreadcrumb();
          }, BACKGROUND_SETTLE_MS);
        }
      } else if (status === 'active') {
        // ⚠⚠⚠ OTA-1462 — DISARM. A return inside the window means the app never
        // really left: no context freed, no breadcrumb erased, nothing to undo.
        if (backgroundTeardownTimer.current) {
          clearTimeout(backgroundTeardownTimer.current);
          backgroundTeardownTimer.current = null;
        }
        // OTA-1358 — debounced, mirroring the Qwen re-warm below. The classifier
        // is enrichment: nothing the player is waiting on breaks while it waits
        // for a settled foreground.
        if (!cognitiveResumeTimer.current) {
          cognitiveResumeTimer.current = setTimeout(() => {
            cognitiveResumeTimer.current = null;
            void resumeCognitive();
          }, QWEN_REWARM_DELAY_MS);
        }
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
        // ⚠⚠ OTA-1275 — DEBOUNCED, because the un-debounced version turned the
        // owner's own bug-report workflow into a memory grinder. His 4.29.197
        // log, while he was copying it to me in parts:
        //
        //   14:00:22 active   ctx OPENED  ≈425MB
        //   14:00:25 background ctx RELEASED   (2.5s later)
        //   14:00:28 active   ctx OPENED  ≈425MB
        //   14:00:31 background ctx RELEASED   (2.3s later)
        //   14:00:35 active   ctx OPENED  ≈425MB
        //   14:00:41 active   ctx OPENED  ≈425MB
        //
        // SIX full model loads in four minutes, four of them inside twenty
        // seconds — every app-switch tore down and rebuilt ~425MB of native
        // context. arb140 was right that a parked model must come back; it just
        // brought it back INSTANTLY, so every switch-away paid full price.
        //
        // ⚠ And a 2.5s visit is shorter than the load itself ("~1-5s context
        // reload"), so the release lands DURING an in-flight init — precisely
        // the orphan shape OTA-1177 filed as its leading unmeasured suspect
        // (dispose before `this.context` is assigned frees nothing). Waiting for
        // a settled foreground makes that race structurally unreachable rather
        // than merely unlikely.
        //
        // The dump on `background` stays IMMEDIATE — that is the jetsam fix, and
        // holding 425MB while backgrounded is what gets us killed. Only the
        // reload waits.
        if (qwenParkedRef.current && !qwenRewarmTimer.current) {
          qwenRewarmTimer.current = setTimeout(() => {
            qwenRewarmTimer.current = null;
            qwenParkedRef.current = false;
            useGameStore.getState().appendLog('debug', `qwen: re-warming after ${QWEN_REWARM_DELAY_MS}ms settled foreground`);
            void bootQwen();
          }, QWEN_REWARM_DELAY_MS);
        }
      }
    };
    const sub = AppState.addEventListener('change', onChange);
    return () => {
      sub.remove();
      if (qwenRewarmTimer.current) { clearTimeout(qwenRewarmTimer.current); qwenRewarmTimer.current = null; }
      if (cognitiveResumeTimer.current) { clearTimeout(cognitiveResumeTimer.current); cognitiveResumeTimer.current = null; } // OTA-1358
      // ⚠ OTA-1462 — and the teardown timer, or a pending release fires against
      // a torn-down subscription after the listener is gone.
      if (backgroundTeardownTimer.current) { clearTimeout(backgroundTeardownTimer.current); backgroundTeardownTimer.current = null; }
    };
  }, [shutdownCognitive, resumeCognitive, shutdownQwen, bootQwen]);

  // OTA-368 — periodic autosave. persist() fires on every meaningful
  // action, but a player who sits idle (reading, thinking) between
  // actions has no recent write; if a rollback or crash happens then,
  // the gap is whatever they last did. A gentle 90s timer bounds that
  // loss to ~90s of idle. The write is atomic + cheap, and persist()
  // self-guards (no slot / no player / invalid record → no-op), so the
  // timer can fire unconditionally even on the title screen.
  // OTA-1209 — the timer is now TOGGLEABLE (Settings -> RUN, default ON) at
  // the owner's ask after a lost session — the protection existed, the
  // control and the visibility didn't. Cadence unchanged: 90s already beats
  // the 2-10 minute industry span, do not loosen it to look "standard".
  useEffect(() => {
    void loadAutosaveDisabled(); // warm the per-install flag before the first beat
    // OTA-1227 — and re-apply the saved UI scale: Electron does not remember
    // the zoom across launches, so without this a 'large' player relaunches small.
    void loadUiScale();
    // OTA-1229 — attach the desktop back routes (right-click + Escape). No-op
    // on a phone, and idempotent, so a re-run of this effect costs nothing.
    initDesktopBack();
    const timer = setInterval(() => {
      const s = useGameStore.getState();
      void autosaveTick({ persist: s.persist, player: s.player, activeSlotId: s.activeSlotId });
    }, AUTOSAVE_INTERVAL_MS);
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
      {/* The dedication card — raised only by the name beat, for the one name it
          is written for. Mounted globally like the chapter card so it lands over
          whatever the opening is doing at that moment. */}
      <SilentBoundary tag="DedicationOverlay">
        <DedicationOverlay />
      </SilentBoundary>
      {/* ⚠ OTA-1488 — the one-time crash-delivery notice (owner's ask, with his
          own screenshot inside). Mounted globally so it lands on the first boot
          after OTA-1487 regardless of screen; it also holds the first flush
          until dismissed — told first, sent second. */}
      <SilentBoundary tag="CrashReportNoticeOverlay">
        <CrashReportNoticeOverlay />
      </SilentBoundary>
      {/* ⚠ OTA-1495 — the summon-mid-fight refusal, raised where a feed line
          could not be seen. Mounted globally beside the other overlays because
          the summon button exists on more than one screen. */}
      <SilentBoundary tag="SummonRefusalModal">
        <SummonRefusalGate />
      </SilentBoundary>
      {/* OTA-1183 — a completed collectible story, read whole. Mounted beside the
          chapter card because it is the same register of beat, and globally because a
          set can close from any screen that can grant loot. */}
      <SilentBoundary tag="StoryRevealOverlay">
        <StoryRevealOverlay />
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
      {/* ⚠ OTA-1110 — THE DEATH SCREEN, and it mounts LAST on purpose. Owner:
          "stop anything else from happening after i hit 0." A character can
          die on the exploration screen, mid-climb, inside a hub room or with
          another modal already up, so this cannot live on one screen — and
          being the last sibling means it renders OVER anything that was
          already on the way in when the killing blow landed. */}
      <SilentBoundary tag="DeathOverlay">
        <DeathOverlay />
      </SilentBoundary>
      {/* OTA-1027 — dog onboarding + golem naming moved out of the typed feed
          into blocking popups (a playtester typed "rest" at the breed ask and
          the old takeover swallowed it as the answer). */}
      <SilentBoundary tag="DogOnboardingModal">
        <DogOnboardingModal />
      </SilentBoundary>
      {/* ⚠ OTA-1530 — the road-stranger's introduction, taken out of the arrival
          feed where six world lines landed on top of it in the same millisecond.
          Mounted beside the other blocking cards, and behind the same
          SilentBoundary: a popup that throws must never take the game with it. */}
      <SilentBoundary tag="WandererEncounterModal">
        <WandererEncounterModal />
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
    // ⚠ OTA-1380 — a recovered screen crash is still a crash, and it is the one
    // the player is LEAST likely to report: the recovery card makes it look
    // handled, so nobody files it. Recorded at a distinct kind so a boundary
    // catch is never mistaken for a process death when reading the ledger.
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const cl = require('./app/diagnostics/crashLedger');
      cl.recordCrash({
        kind: 'js-boundary',
        stage: 'screen-render',
        message: error?.message ?? String(error),
        stack: errorInfo?.componentStack ?? error?.stack ?? '',
        isFatal: false,
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
  // ⚠⚠ OTA-1229 — THE BOTTOM OF THE BACK STACK. Owner, on the PC build: *"right
  // click on the mouse should be the back button."* This is the FIRST handler
  // registered, and the stack runs top-down, so it is the LAST consulted — a
  // right-click inside the TAKE popup closes TAKE, not the screen beneath it.
  //
  // ⚠ AND AT THE GAME ITSELF, BACK DOES NOTHING. 'exploration', 'title',
  // 'character_creation' and 'ending' all fall through deliberately: a
  // right-click that dumped the player out of a fight, or off the ending they
  // just earned, is the worst possible reading of the convention. Back only
  // ever means "leave this sub-screen" — which is what a PC player expects, and
  // the only thing it can safely do here.
  useBackAction(true, () => {
    if (screen === 'exploration' || screen === 'title' || screen === 'character_creation' || screen === 'ending') {
      return false;
    }
    const st = useGameStore.getState();
    st.setScreen(st.player ? 'exploration' : 'title');
    return true;
  });
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
      {/* ⚠ OTA-1384 — the parchment grain + vignette give MOBILE its "aged paper"
          look, but react-native-web mis-renders both: resizeMode="repeat" draws
          ONE copy in the corner (a hard-edged square) and the stretched vignette
          reads as a crisp colour split. On web/desktop we drop them and show the
          solid base colour the player picked in Settings.
          ⚠ `Platform.OS !== 'web'` is ALWAYS TRUE on a phone, so this wrapper is
          behaviour-neutral here. It exists so App.tsx is the SAME FILE on all
          four products — the last source difference between the lines. */}
      {Platform.OS !== 'web' && (
        <>
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
        </>
      )}
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
      {/* PC / Steam Deck controller navigation. Renders nothing on phones
          (native stub); on web it drives the on-screen-button highlight. */}
      <GamepadNav />
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
