// Metro config bump only -- fires android-build workflow so a fresh APK ships the latest app/** state.
//
// 2026-05-15a: initial dual-workflow pipeline (OTA fast, APK slow, path-gated triggers)
// 2026-05-15b: patch Kotlin 1.9.24 -> 1.9.25 in android/build.gradle for Compose compiler compat
// 2026-05-15c: interactive dice roller — player rolls each die, enemy counter-attacks on miss/wound

const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

module.exports = config;
