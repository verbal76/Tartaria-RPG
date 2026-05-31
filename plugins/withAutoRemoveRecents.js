// withAutoRemoveRecents — Expo config plugin that makes the
// EXIT GAME path actually remove Tartaria from the Recents list.
//
// Two layers (OTA-247):
//
//   1. Manifest: `android:autoRemoveFromRecents="true"` on any
//      activity whose name resolves to MainActivity.
//
//   2. MainActivity.kt: replace ONLY the `if (!moveTaskToBack(false))`
//      block inside the existing `invokeDefaultOnBackPressed`
//      override. Expo SDK 52's template emits:
//
//        override fun invokeDefaultOnBackPressed() {
//            if (!moveTaskToBack(false)) {
//                super.invokeDefaultOnBackPressed()
//            }
//        }
//
//      The moveTaskToBack(false) call is what backgrounds the
//      activity instead of finishing it — that's the bug. We
//      replace that single if-block with:
//
//        finishAndRemoveTask()
//        super.invokeDefaultOnBackPressed()
//
//      Surgical: we don't add a new method (no risk of duplicate
//      override), we don't replace the method signature (no regex
//      brittleness around outer brace matching). We just patch
//      ONE inner block that we can find by literal substring.
//
//      If the substring isn't in MainActivity.kt (Expo SDK changes
//      the template, the build's a bare-workflow project, etc.),
//      the layer-1 manifest flag still ships and the patch is a
//      no-op. Logged so the next AAB build's log names the gap.
//
//   Idempotent: the `moveTaskToBack` literal is gone after a
//   successful patch, so a re-run finds nothing and skips.

const { withAndroidManifest, withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

function endsWithMainActivity(name) {
  if (!name) return false;
  return name === '.MainActivity' || name.endsWith('.MainActivity');
}

function withAutoRemoveRecents(config) {
  // Layer 1 — manifest flag.
  config = withAndroidManifest(config, (cfg) => {
    const app = cfg.modResults.manifest.application?.[0];
    if (!app || !app.activity) return cfg;
    for (const activity of app.activity) {
      const name = activity.$?.['android:name'];
      if (endsWithMainActivity(name)) {
        activity.$['android:autoRemoveFromRecents'] = 'true';
      }
    }
    return cfg;
  });

  // Layer 2 — patch the moveTaskToBack block in MainActivity.
  config = withDangerousMod(config, [
    'android',
    async (cfg) => {
      const platformProjectRoot = cfg.modRequest.platformProjectRoot;
      const candidates = [
        path.join(platformProjectRoot, 'app', 'src', 'main', 'java', ...cfg.android.package.split('.'), 'MainActivity.kt'),
        path.join(platformProjectRoot, 'app', 'src', 'main', 'java', ...cfg.android.package.split('.'), 'MainActivity.java'),
      ];
      const file = candidates.find((p) => {
        try { return fs.statSync(p).isFile(); } catch { return false; }
      });
      if (!file) {
        // eslint-disable-next-line no-console
        console.warn(`[withAutoRemoveRecents] MainActivity source not found under ${platformProjectRoot}; skipping moveTaskToBack patch.`);
        return cfg;
      }
      const src0 = fs.readFileSync(file, 'utf8');
      if (!src0.includes('moveTaskToBack')) {
        // eslint-disable-next-line no-console
        console.warn(`[withAutoRemoveRecents] moveTaskToBack not in ${file}; manifest flag is the only EXIT GAME path on this build.`);
        return cfg;
      }

      // Find `if (!moveTaskToBack(...))` and the brace block right
      // after it. Walk braces to find the closing brace of that
      // if-block. Replace the whole `if (...) { ... }` with our
      // finishAndRemoveTask + super call.
      const ifIdx = src0.indexOf('if (!moveTaskToBack');
      if (ifIdx < 0) {
        // eslint-disable-next-line no-console
        console.warn(`[withAutoRemoveRecents] expected pattern 'if (!moveTaskToBack' missing in ${file}; manifest flag only.`);
        return cfg;
      }
      // Find the '{' that opens the if-block.
      const openIdx = src0.indexOf('{', ifIdx);
      if (openIdx < 0) return cfg;
      // Walk forward, counting braces, to find the matching '}'.
      let depth = 1;
      let closeIdx = openIdx + 1;
      while (closeIdx < src0.length && depth > 0) {
        const c = src0[closeIdx];
        if (c === '{') depth++;
        else if (c === '}') depth--;
        closeIdx++;
      }
      if (depth !== 0) {
        // eslint-disable-next-line no-console
        console.warn(`[withAutoRemoveRecents] could not find matching close brace for moveTaskToBack if-block; manifest flag only.`);
        return cfg;
      }
      // closeIdx points one past the matching '}'.
      const isKotlin = file.endsWith('.kt');
      const replacement = isKotlin
        ? '// withAutoRemoveRecents:onBackPressed\n      finishAndRemoveTask()\n      super.invokeDefaultOnBackPressed()'
        : '// withAutoRemoveRecents:onBackPressed\n      finishAndRemoveTask();\n      super.invokeDefaultOnBackPressed();';
      const src = src0.slice(0, ifIdx) + replacement + src0.slice(closeIdx);
      fs.writeFileSync(file, src, 'utf8');
      // eslint-disable-next-line no-console
      console.log(`[withAutoRemoveRecents] patched moveTaskToBack block in ${file} → finishAndRemoveTask.`);
      return cfg;
    },
  ]);

  return config;
}

module.exports = withAutoRemoveRecents;
