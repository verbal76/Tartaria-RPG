// withAutoRemoveRecents — Expo config plugin that adds
// `android:autoRemoveFromRecents="true"` to MainActivity in the
// generated AndroidManifest.xml.
//
// Why we need this:
//   TitleScreen's EXIT GAME button calls BackHandler.exitApp(), which
//   on Android calls Activity.finish(). That ends the activity (the
//   user sees their home screen) but Android keeps the task entry in
//   the Recents list and the JS process backgrounded — so when the
//   player hits the square Recents button they see Tartaria still
//   sitting there, and tapping it resumes the same process.
//
//   autoRemoveFromRecents="true" tells Android: when this activity is
//   finished, also remove its task from the Recents list. Process
//   gets reclaimed on the next OS memory pass instead of lingering.
//
//   Only kicks in when MainActivity is *finished*; pressing HOME or
//   the Recents button itself just backgrounds the activity (doesn't
//   finish it) so the normal "leave Tartaria and come back later" UX
//   is unchanged. This flag only affects the EXIT GAME path.

const { withAndroidManifest } = require('expo/config-plugins');

function withAutoRemoveRecents(config) {
  return withAndroidManifest(config, (cfg) => {
    const app = cfg.modResults.manifest.application?.[0];
    if (!app || !app.activity) return cfg;
    for (const activity of app.activity) {
      const name = activity.$?.['android:name'];
      if (name === '.MainActivity') {
        activity.$['android:autoRemoveFromRecents'] = 'true';
      }
    }
    return cfg;
  });
}

module.exports = withAutoRemoveRecents;
