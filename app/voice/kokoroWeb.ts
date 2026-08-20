// kokoroWeb (native stub) — the real implementation is kokoroWeb.web.ts, which
// runs Kokoro TTS via ONNX (kokoro-js) in the browser/Electron. On native, the
// executorch Kokoro path is used instead, so these are never called; Metro
// resolves THIS file on android/ios and the .web.ts file on web.

export function speakWeb(_text: string, _voiceId?: string | null): void {
  /* no-op on native */
}

export function stopWeb(): void {
  /* no-op on native */
}
