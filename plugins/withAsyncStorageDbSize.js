// withAsyncStorageDbSize — Expo config plugin that raises the
// @react-native-async-storage/async-storage Android SQLite ceiling.
//
// Why we need this (HANDOFF next-native-build queue #1):
//   Android AsyncStorage defaults to a ~6 MB SQLite DB. A player's
//   Galaxy S26 hit `persist FAILED — storage full` at only ~193 KB of
//   save because the DB itself was full (2026-06-11). OTA-490 made the
//   emergency reclaim self-heal a full DB, but the DURABLE ceiling fix
//   is native: set `AsyncStorage_db_size_in_MB` in android/gradle.properties
//   so the DB can't fill at realistic save sizes. Only takes effect on a
//   native rebuild — hence this plugin, applied at prebuild time.
//
// Same mechanism + import path as ./plugins/withJetifier.js.
const { withGradleProperties } = require('expo/config-plugins');

const DB_SIZE_MB = 50;

function withAsyncStorageDbSize(config) {
  return withGradleProperties(config, (cfg) => {
    cfg.modResults = cfg.modResults || [];
    // De-dupe — don't add twice if prebuild is re-run.
    cfg.modResults = cfg.modResults.filter(
      (r) => !(r.type === 'property' && r.key === 'AsyncStorage_db_size_in_MB'),
    );
    cfg.modResults.push({
      type: 'property',
      key: 'AsyncStorage_db_size_in_MB',
      value: String(DB_SIZE_MB),
    });
    return cfg;
  });
}

module.exports = withAsyncStorageDbSize;
