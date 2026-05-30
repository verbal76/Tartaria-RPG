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

  // Layer 2 — patch MainActivity.kt to override onBackPressed and
  // call finishAndRemoveTask before the super.onBackPressed() chain.
  // Done via withDangerousMod so we can reach into the generated
  // native source. Idempotent: skips if the marker is already there.
  config = withDangerousMod(config, [
    'android',
    async (cfg) => {
      const projectRoot = cfg.modRequest.projectRoot;
      const platformProjectRoot = cfg.modRequest.platformProjectRoot;
      const candidates = [
        // SDK 52 default Kotlin path
        path.join(platformProjectRoot, 'app', 'src', 'main', 'java', ...cfg.android.package.split('.'), 'MainActivity.kt'),
        // legacy java fallback (no longer used by Expo 52+, kept for safety)
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

      if (file.endsWith('.kt')) {
        // Inject override of invokeDefaultOnBackPressed (the method
        // BackHandler.exitApp ultimately calls). Calling
        // finishAndRemoveTask BEFORE super.invokeDefaultOnBackPressed
        // means the task is cleared from Recents and the activity
        // finishes in one shot — no lingering task entry, no
        // backgrounded JS process.
        const injectBefore = '  override fun createReactActivityDelegate()';
        const block = `  override fun invokeDefaultOnBackPressed() {\n    ${MARKER}\n    finishAndRemoveTask()\n    super.invokeDefaultOnBackPressed()\n  }\n\n`;
        if (!src.includes(injectBefore)) {
          // eslint-disable-next-line no-console
          console.warn(`[withAutoRemoveRecents] createReactActivityDelegate anchor missing in MainActivity.kt; appending at class close instead.`);
          // Fallback: insert before the LAST '}' which closes the class.
          const lastBrace = src.lastIndexOf('}');
          src = src.slice(0, lastBrace) + '\n' + block + src.slice(lastBrace);
        } else {
          src = src.replace(injectBefore, block + injectBefore);
        }
      } else {
        // Java fallback — Expo SDK 52+ uses Kotlin but keep this path
        // so older templates don't crash the build.
        const injectBefore = '  @Override\n  protected ReactActivityDelegate createReactActivityDelegate()';
        const block = `  @Override\n  public void invokeDefaultOnBackPressed() {\n    ${MARKER}\n    finishAndRemoveTask();\n    super.invokeDefaultOnBackPressed();\n  }\n\n`;
        if (!src.includes(injectBefore)) {
          const lastBrace = src.lastIndexOf('}');
          src = src.slice(0, lastBrace) + '\n' + block + src.slice(lastBrace);
        } else {
          src = src.replace(injectBefore, block + injectBefore);
        }
      }
      fs.writeFileSync(file, src, 'utf8');
      return cfg;
    },
  ]);

  return config;
}

module.exports = withAutoRemoveRecents;
