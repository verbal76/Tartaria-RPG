// withAutoRemoveRecents — Expo config plugin that makes the
// EXIT GAME path actually remove Tartaria from the Recents list
// AND fully terminate the process.
//
// Why we need this:
//   TitleScreen's EXIT GAME button calls BackHandler.exitApp(),
//   which on Android (RN 0.76) ends up calling
//   ReactActivity.invokeDefaultOnBackPressed() → super.onBackPressed()
//   → Activity.finish(). That ends the activity, but the task entry
//   stays in Recents and the JS process backgrounded — so when the
//   player hits the square Recents button they see Tartaria still
//   sitting there.
//
// Two layers of defense (OTA-245 rewrite):
//
//   1. Manifest: add `android:autoRemoveFromRecents="true"` to ANY
//      activity whose name resolves to MainActivity (defensive vs.
//      Expo SDK changes — earlier versions of this plugin matched
//      only the exact `.MainActivity` string and could silently miss
//      a fully-qualified name).
//
//   2. MainActivity.kt: inject an `onBackPressed` override that
//      calls `finishAndRemoveTask()` and then `super.onBackPressed()`.
//      finishAndRemoveTask is the guaranteed way to clear the task
//      from Recents — it's the same API the launcher uses.
//
//   The combination handles both the "Recents lingering" case
//   (manifest flag) and the "JS process won't die" case
//   (finishAndRemoveTask which signals the OS to reclaim).
//
//   Only kicks in on the EXIT GAME path; pressing HOME or the
//   Recents button itself just backgrounds the activity (doesn't
//   call invokeDefaultOnBackPressed) so the normal "leave Tartaria
//   and come back later" UX is unchanged.

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

  // Layer 2 — patch MainActivity.kt so EXIT GAME actually exits.
  //
  // The Expo SDK 52 template already provides an
  // `invokeDefaultOnBackPressed` override on MainActivity that calls
  // `moveTaskToBack(false)` and only falls through to
  // `super.invokeDefaultOnBackPressed()` when moveTaskToBack returns
  // false. That's why EXIT GAME backgrounds the activity instead of
  // finishing it — the task lingers in Recents and the process
  // stays alive.
  //
  // We REPLACE that existing override's body (don't add a new method
  // — Kotlin rejects duplicate overrides as "Conflicting overloads"
  // at compile time, which was the OTA-245-first-AAB build failure).
  // The new body calls `finishAndRemoveTask()` AND `super.invokeDefault
  // OnBackPressed()`, which terminates the activity AND clears it from
  // Recents. Combined with the manifest flag, EXIT GAME fully exits.
  //
  // Idempotent via the marker comment. If the template ever changes
  // and the existing override anchor isn't found, we fall back to
  // adding a new override before `createReactActivityDelegate`.
  config = withDangerousMod(config, [
    'android',
    async (cfg) => {
      const platformProjectRoot = cfg.modRequest.platformProjectRoot;
      const candidates = [
        // SDK 52 default Kotlin path
        path.join(platformProjectRoot, 'app', 'src', 'main', 'java', ...cfg.android.package.split('.'), 'MainActivity.kt'),
        // legacy java fallback (Expo 52+ uses Kotlin; kept for safety)
        path.join(platformProjectRoot, 'app', 'src', 'main', 'java', ...cfg.android.package.split('.'), 'MainActivity.java'),
      ];
      const file = candidates.find((p) => {
        try { return fs.statSync(p).isFile(); } catch { return false; }
      });
      if (!file) {
        // eslint-disable-next-line no-console
        console.warn(`[withAutoRemoveRecents] MainActivity source not found under ${platformProjectRoot}; skipping onBackPressed patch.`);
        return cfg;
      }
      let src = fs.readFileSync(file, 'utf8');
      const MARKER = '// withAutoRemoveRecents:onBackPressed';
      if (src.includes(MARKER)) return cfg;

      // Kotlin path — Expo SDK 52 default. Match the existing
      // override block tolerantly (any whitespace, any indent). The
      // canonical template form is:
      //   override fun invokeDefaultOnBackPressed() {
      //     if (!moveTaskToBack(false)) {
      //       super.invokeDefaultOnBackPressed()
      //     }
      //   }
      if (file.endsWith('.kt')) {
        // Match the entire override block, including the inner
        // moveTaskToBack `if {}` brace nesting. The `[^{}]*\{[^{}]*\}`
        // pattern eats one level of nested braces, which is the
        // template form. Greedy `[^{}]` segments stay inside the
        // current brace level — anchors are the two outer braces.
        const existingOverride = /override\s+fun\s+invokeDefaultOnBackPressed\s*\(\)\s*\{[^{}]*\{[^{}]*\}[^{}]*\}/m;
        const replacementBody = `override fun invokeDefaultOnBackPressed() {
    ${MARKER}
    // Player ask: EXIT GAME should actually exit. Expo SDK 52's
    // template called moveTaskToBack(false) here, which just
    // backgrounded the activity — task stayed in Recents.
    // finishAndRemoveTask() destroys the activity AND clears the
    // task entry, which is what the launcher uses to fully exit
    // an app. Combined with autoRemoveFromRecents="true" on the
    // manifest, EXIT GAME now drops the player to the home
    // screen with no Tartaria entry in Recents.
    finishAndRemoveTask()
    super.invokeDefaultOnBackPressed()
  }`;
        if (existingOverride.test(src)) {
          src = src.replace(existingOverride, replacementBody);
        } else {
          // Fallback: no existing override — add a fresh one before
          // createReactActivityDelegate or, failing that, before the
          // last brace of the class. Same as the original plan.
          const block = `  ${replacementBody}\n\n`;
          const anchor = '  override fun createReactActivityDelegate()';
          if (src.includes(anchor)) {
            src = src.replace(anchor, block + anchor);
          } else {
            const lastBrace = src.lastIndexOf('}');
            src = src.slice(0, lastBrace) + '\n' + block + src.slice(lastBrace);
          }
        }
      } else {
        // Java fallback — same nested-brace pattern.
        const existingOverrideJava = /@Override\s*\n\s*public\s+void\s+invokeDefaultOnBackPressed\s*\(\)\s*\{[^{}]*\{[^{}]*\}[^{}]*\}/m;
        const javaReplacement = `@Override
  public void invokeDefaultOnBackPressed() {
    ${MARKER}
    finishAndRemoveTask();
    super.invokeDefaultOnBackPressed();
  }`;
        if (existingOverrideJava.test(src)) {
          src = src.replace(existingOverrideJava, javaReplacement);
        } else {
          const lastBrace = src.lastIndexOf('}');
          src = src.slice(0, lastBrace) + '\n  ' + javaReplacement + '\n' + src.slice(lastBrace);
        }
      }
      fs.writeFileSync(file, src, 'utf8');
      return cfg;
    },
  ]);

  return config;
}

module.exports = withAutoRemoveRecents;
