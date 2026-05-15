// Metro config bump only -- fires android-build workflow so a fresh APK ships the latest app/** state.
//
// 2026-05-15a: initial dual-workflow pipeline (OTA fast, APK slow, path-gated triggers)

const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

module.exports = config;
