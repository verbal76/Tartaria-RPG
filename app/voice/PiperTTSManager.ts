// PiperTTSManager — STUB (post sherpa-onnx revert).
//
// The bundled-voice path is parked until we can integrate sherpa-onnx
// (or an equivalent) without an ABI collision against
// onnxruntime-react-native. Microsoft never released ORT 1.24.4
// upstream; sherpa-onnx@0.4.3 vendors a custom 1.24.4-qnn build that
// has no Maven coordinate match for ORT-RN, so two `libonnxruntime.so`
// + `libonnxruntime4j_jni.so` files coexist in the APK and crash at
// first ORT call regardless of which Gradle's `pickFirst` keeps.
//
// This stub mirrors the original API surface (speak / stopAndClear /
// isSpeaking / isPiperAvailable / disposePiperEngine / getModelDir /
// resetPiperAvailability) so TTSManager continues to compile and the
// engine = 'bundled' path returns the same "no-op, fall through to
// system" behaviour the original did when no model was installed.
//
// When sherpa-onnx ships a release that consumes ORT as a Maven
// dependency (matching react-native-fast-tflite's TFLite pattern,
// which avoids the duplicate .so problem entirely), restore the real
// implementation from git history (commit 8538712).

import * as FileSystem from 'expo-file-system';

const MODEL_DIR = (FileSystem.documentDirectory ?? '') + 'tartaria-piper/';

export async function isPiperAvailable(): Promise<boolean> {
  return false;
}

export function isSpeaking(): boolean {
  return false;
}

export function resetPiperAvailability(): void {
  /* stub */
}

export function speak(_text: string): number {
  return -1;
}

export async function stopAndClear(): Promise<void> {
  /* stub */
}

export async function disposePiperEngine(): Promise<void> {
  /* stub */
}

export function getModelDir(): string {
  return MODEL_DIR;
}
