/* eslint-disable no-undef, @typescript-eslint/no-unused-expressions */
// OTA-1012 — PLAIN AsyncStorage test mock (no jest.fn). The official
// @react-native-async-storage jest mock wraps every method in jest.fn(),
// and jest.fn RECORDS EVERY CALL'S ARGUMENTS forever. The disk game-log
// appends a ~400 KB buffer per line (see saveSystem.appendLogToDisk), so
// every long-running sim retained every buffer version until V8 hit its
// 8 GB heap wall — the entire "world/persist super-linear tail growth"
// phenomenon was THIS, not game state. package.json's jest.moduleNameMapper
// resolves the official mock path here, so the 100+ existing
// `jest.mock('@react-native-async-storage/async-storage', ...)` blocks all
// pick this up with zero per-file edits. Same API + behavior, no recording.

const asMock = {
  __INTERNAL_MOCK_STORAGE__: {},

  setItem: async (key, value, callback) => {
    const setResult = await asMock.multiSet([[key, value]], undefined);
    callback && callback(setResult);
    return setResult;
  },

  getItem: async (key, callback) => {
    const getResult = await asMock.multiGet([key], undefined);
    const result = getResult[0] ? getResult[0][1] : null;
    callback && callback(null, result);
    return result;
  },

  removeItem: (key, callback) => asMock.multiRemove([key], callback),

  mergeItem: (key, value, callback) => asMock.multiMerge([[key, value]], callback),

  clear: async (callback) => {
    asMock.__INTERNAL_MOCK_STORAGE__ = {};
    callback && callback(null);
    return null;
  },

  getAllKeys: async () => Object.keys(asMock.__INTERNAL_MOCK_STORAGE__),

  flushGetRequests: () => {},

  multiGet: async (keys, callback) => {
    const values = keys.map((key) => [
      key,
      asMock.__INTERNAL_MOCK_STORAGE__[key] || null,
    ]);
    callback && callback(null, values);
    return values;
  },

  multiSet: async (keyValuePairs, callback) => {
    keyValuePairs.forEach((keyValue) => {
      asMock.__INTERNAL_MOCK_STORAGE__[keyValue[0]] = keyValue[1];
    });
    callback && callback(null);
    return null;
  },

  multiRemove: async (keys, callback) => {
    keys.forEach((key) => {
      if (asMock.__INTERNAL_MOCK_STORAGE__[key]) {
        delete asMock.__INTERNAL_MOCK_STORAGE__[key];
      }
    });
    callback && callback(null);
    return null;
  },

  multiMerge: async (keyValuePairs, callback) => {
    keyValuePairs.forEach(([key, value]) => {
      const oldValue = asMock.__INTERNAL_MOCK_STORAGE__[key];
      asMock.__INTERNAL_MOCK_STORAGE__[key] =
        oldValue != null
          ? JSON.stringify(deepMerge(JSON.parse(oldValue), JSON.parse(value)))
          : value;
    });
    callback && callback(null);
    return null;
  },

  useAsyncStorage: (key) => ({
    getItem: (...args) => asMock.getItem(key, ...args),
    setItem: (...args) => asMock.setItem(key, ...args),
    mergeItem: (...args) => asMock.mergeItem(key, ...args),
    removeItem: (...args) => asMock.removeItem(key, ...args),
  }),
};

// Minimal deep merge matching the official mock's merge-options behavior for
// JSON data (objects merge recursively, arrays concat, scalars overwrite).
function deepMerge(a, b) {
  if (Array.isArray(a) && Array.isArray(b)) return [...a, ...b];
  if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) {
    const out = { ...a };
    for (const k of Object.keys(b)) {
      out[k] = b[k] === undefined ? out[k] : (k in out ? deepMerge(out[k], b[k]) : b[k]);
    }
    return out;
  }
  return b === undefined ? a : b;
}

module.exports = asMock;
