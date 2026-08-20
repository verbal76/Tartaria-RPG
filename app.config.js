// ⚠⚠ OTA-1384 — ONE CONFIG, FOUR PRODUCTS. Step 4a of the branch collapse.
//
// Until now the four product lines were four git BRANCHES, and the only thing
// that actually differed in their Expo config was four strings. Everything else
// — slug, version, runtimeVersion policy, projectId, icons, splash, plugins,
// permissions — was already identical on all four.
//
// This file replaces `app.json` as the config entry point. Expo prefers
// `app.config.js` when both exist, and `app.json` is still read as the base, so
// nothing here duplicates settings: the base file stays the single home for the
// ~60 shared keys, and this file overrides the four that are per-product.
//
// ⚠ SELECTED BY ENV VAR, defaulting to golem. A build says which product it is:
//     TARTARIA_LINE=hal   eas build ...
//     TARTARIA_LINE=steam npx expo export
//   An unset var builds golem, which is the dev line — so a forgotten env var
//   produces the developer's own build, never someone else's shipping product.
//
// ⚠ AN UNKNOWN NAME IS A HARD ERROR, not a silent fallback. `TARTARIA_LINE=hal2001`
//   (a plausible typo for `hal`) must stop the build, because the failure mode of
//   guessing is publishing golem's binary to HAL's channel — the exact
//   cross-product accident this whole exercise exists to prevent.
//
// ⚠ PROVEN, NOT ASSUMED. `scripts/verify-lines.mjs` renders the resolved config
//   for all four lines through Expo's own resolver and compares it against the
//   config each branch produces today. Byte-identical or the check fails.

const base = require('./app.json');

/** The complete set of per-product differences. Four strings each; if this table
 *  ever needs a fifth field, that is worth a second look — it means a product
 *  difference has appeared that is not a name, an id or a channel. */
const LINES = {
  golem: {
    name: 'Golem',
    channel: 'golem-line',
    id: 'com.hotatticgames.tartarprim.golem',
    fallenSharing: 'open',
  },
  hal: {
    name: 'Tartaria Realms HAL',
    channel: 'hal2001',
    id: 'com.hotatticgames.tartarprim.hal2001',
    // ⚠ HAL is the live channel — the build other people are actually playing.
    // The fallen exchange is visible only to the two names on
    // SHARING_UNLOCK_NAMES here. Promoting it is this one word.
    fallenSharing: 'gated',
  },
  steam: {
    name: 'Tartaria Realms PC (Steam Dev)',
    channel: 'steam-dev',
    id: 'com.hotatticgames.tartarprim.steamdev',
    fallenSharing: 'open',
  },
  html: {
    name: 'Tartaria Realms (Web)',
    channel: 'html-dev',
    id: 'com.hotatticgames.tartarprim.htmldev',
    fallenSharing: 'open',
  },
};

const requested = process.env.TARTARIA_LINE || 'golem';
const line = LINES[requested];
if (!line) {
  throw new Error(
    `TARTARIA_LINE="${requested}" is not a product line. ` +
    `Expected one of: ${Object.keys(LINES).join(', ')}. ` +
    `Refusing to guess — a wrong guess publishes one product's binary to another's channel.`,
  );
}

module.exports = ({ config }) => {
  // `config` is app.json's expo block, already loaded by Expo. Spread it so any
  // key added to app.json later is inherited here with no edit to this file.
  const expo = { ...base.expo, ...config };
  return {
    ...expo,
    name: line.name,
    android: { ...expo.android, package: line.id },
    ios: { ...expo.ios, bundleIdentifier: line.id },
    updates: {
      ...expo.updates,
      requestHeaders: { ...(expo.updates && expo.updates.requestHeaders), 'expo-channel-name': line.channel },
    },
    extra: {
      ...expo.extra,
      // ⚠ The product flag reaches the RUNNING APP through `extra`, which is the
      // only channel a build-time value has into React Native. `crashReportDsn`
      // already uses this path, so the pattern is proven in-tree.
      // app/config/features.ts reads it and falls back to 'open' if absent, so a
      // config that fails to load degrades to the ordinary product rather than
      // to a broken one.
      tartariaLine: requested,
      fallenSharing: line.fallenSharing,
    },
  };
};

module.exports.LINES = LINES;
