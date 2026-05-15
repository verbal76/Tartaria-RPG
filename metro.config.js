// Metro config bump only -- fires android-build workflow so a fresh APK ships the latest app/** state.
//
// 2026-05-15a: initial dual-workflow pipeline (OTA fast, APK slow, path-gated triggers)
// 2026-05-15b: patch Kotlin 1.9.24 -> 1.9.25 in android/build.gradle for Compose compiler compat
// 2026-05-15c: interactive dice roller — player rolls each die, enemy counter-attacks on miss/wound
// 2026-05-15d: Kotlin patch — sed both quote styles + gradle -Pandroid.kotlinVersion + KOTLIN_VERSION env + debug grep
// 2026-05-15e: replace sed hacks with gradle.properties append (canonical mechanism) and strip commit message from build logs/release notes
// 2026-05-15f: proper Kotlin fix — expo-build-properties plugin sets 1.9.25 at prebuild time; sed + suppressCheck as belt-and-suspenders
// 2026-05-15g: REAL root cause — patch kotlin=1.9.24 → 1.9.25 in node_modules libs.versions.toml (RN + gradle-plugin) before prebuild
// 2026-05-15h: pin onnxruntime-android to 1.20.0 (avoid latest.integration → maven-metadata.xml SAX bug)
// 2026-05-15i: bump onnxruntime-android pin to 1.22.0 — 1.20.0 missing Ort::Value() default ctor + zero-arg GetSymbolicDimensions used by JS bindings
// 2026-05-15j: APK refresh — ship cumulative OTA work since last APK (lore-aware Arbiter, stamina, multi-slot saves, investigate split). OTAs not landing on device; APK update unblocks playtest while we diagnose.
// 2026-05-15k: APK refresh #2 — bake in the combat-narration fixes (parser combat override, weapon-aware narration, Arbiter combat awareness, enemy stat block with HP bar, multi-slot save system). OTAs still unconfirmed; ship as native binary.
// 2026-05-15l: HOTFIX APK — multi-slot save load lost currentScene, leaving "No scene" + every action silently no-oping. hydrate / loadSlotIntoGame now beginScene() on restore; submitPlayerAction auto-recovers if scene is null.
// 2026-05-15m: APK refresh — adds CHECK FOR OTA UPDATE button on About screen + live Updates.* diagnostics (runtimeVersion, channel, updateId, isEnabled, isEmbeddedLaunch). User can manually pull OTAs when automatic check-on-load fails.
// 2026-05-15n: APK refresh — About screen rewrite. APK build number from native versionCode (set by build-apk.yml from github.run_number), last OTA applied + published-at timestamp from Updates.* live values, cleaned up the "policy" object display. expo-application 6.0.0 added.
// 2026-05-15o: APK refresh — always start at main menu (no auto-resume), permadeath marks character "DEAD" on slot list instead of erasing, Resurrection Gems dropped ~0.5% per kill saved install-wide, dead slots gated behind gem spend.

const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

module.exports = config;
