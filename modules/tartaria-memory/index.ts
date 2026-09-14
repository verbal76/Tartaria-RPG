// ⚠ BUILD 190 — the local module's nominal entry point.
//
// It is deliberately thin, and the app does NOT import it. `app/diagnostics/
// nativeMemoryRecorder.ts` reaches the native module through
// `requireOptionalNativeModule('TartariaMemory')`, which resolves by the name
// the Swift module registers rather than by a bundler path. That matters:
// autolinking builds the native side from `expo-module.config.json` and the
// podspec and never consults this file, so binding the app to a Metro path
// would add a resolution failure mode that buys nothing.
//
// This exists so the package has the `main` its package.json declares, and so a
// reader who opens the module directory finds the one sentence that says where
// the real entry point is.

export const TARTARIA_MEMORY_NATIVE_MODULE_NAME = 'TartariaMemory';
