// Web-only no-op stub for native-ONLY modules that have no browser/desktop build:
//   llama.rn · onnxruntime-react-native · react-native-executorch · expo-speech-recognition
//
// Metro swaps these module names to THIS file when platform === 'web' (see
// metro.config.js). The desktop/web build has no on-device AI/voice runtime yet,
// and the game's managers already try/catch these and fall back to template
// narration + silent text — so a no-op here keeps the bundle compiling and the
// game rendering. Real desktop runtimes (node-llama-cpp / ONNX Runtime) get wired
// in later, behind the same hooks.
//
// A recursive Proxy resolves ANY access shape without throwing at import/load:
// default import, `import * as x`, named imports, `new X()`, and chained calls
// `x.y.z()` all return safe no-ops.
/* eslint-disable */

function noop() { return stub; }

const handler = {
  get(_target, prop) {
    if (prop === '__esModule') return true;
    if (prop === 'default') return stub;
    if (prop === Symbol.toPrimitive) return function () { return ''; };
    if (prop === Symbol.iterator) return function* () {};
    return stub;
  },
  apply() { return stub; },
  construct() { return {}; },
};

const stub = new Proxy(noop, handler);

module.exports = stub;
