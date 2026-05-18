// withJetifier — Expo config plugin that enables jetifier in the
// prebuild's android/gradle.properties so legacy `com.android.support:*`
// dependencies are auto-converted to AndroidX equivalents at build time.
//
// Why we need this:
//   @react-native-voice/voice (3.2.4) declares
//   `implementation "com.android.support:appcompat-v7:..."` in its
//   android/build.gradle. Without jetifier, that pulls
//   support-compat:28.0.0 alongside androidx.core:1.13.1 → manifest
//   merger fails on conflicting `application@appComponentFactory`
//   values. Jetifier rewrites the support-lib refs to AndroidX so
//   the duplicate disappears.
//
// Expo SDK 52 ships with `android.useAndroidX=true` already set, but
// jetifier is OFF by default (AndroidX-only mode). This plugin flips
// it ON only for builds that need it.

const { withGradleProperties } = require('@expo/config-plugins');

function withJetifier(config) {
  return withGradleProperties(config, (cfg) => {
    cfg.modResults = cfg.modResults || [];
    // De-dupe — don't add twice if the user re-runs prebuild.
    const has = (key) => cfg.modResults.some(
      (r) => r.type === 'property' && r.key === key,
    );
    if (!has('android.enableJetifier')) {
      cfg.modResults.push({
        type: 'property',
        key: 'android.enableJetifier',
        value: 'true',
      });
    }
    if (!has('android.useAndroidX')) {
      cfg.modResults.push({
        type: 'property',
        key: 'android.useAndroidX',
        value: 'true',
      });
    }
    return cfg;
  });
}

module.exports = withJetifier;
