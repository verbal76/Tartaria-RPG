# RPG Engine (dev) — PC / Windows build

This is the desktop build for the **`Dev_engine_PC`** branch. It packages the dev
engine as a single portable Windows `.exe` so you can run it on a PC (e.g. spread
the game and the dev console across two monitors). It is a faithful copy of the
live-Tartaria `steam_Dev` desktop build pattern, **rebranded and kept fully
isolated** from both the mobile `engine_Dev` line and the live-Tartaria lines.

## How it works

The mobile build runs React Native natively. The PC build instead exports the app
to a **web bundle** (`react-native-web`) and wraps it in **Electron**:

1. `npx expo export --platform web` → `dist/` (the whole engine as web assets).
2. `scripts/harden-web-bundle.sh dist` strips source maps + lightly obfuscates the JS.
3. `dist/*` is copied into `desktop/web-build/`.
4. `electron-builder` packages `desktop/` into a portable `.exe`.

`desktop/main.js` serves the bundle over a tiny localhost HTTP server (Expo's
absolute asset paths 404 under `file://`) and writes a diagnostic log to your
Desktop (`RPG-Engine-Dev-log.txt`) so any black-screen launch is debuggable.

### Native modules → web

`metro.config.js` swaps the native-only modules (`llama.rn`,
`onnxruntime-react-native`, `react-native-executorch`, `expo-speech-recognition`)
to a no-op stub (`web-stubs/native-noop.js`) on the `web` target. The block is
platform-gated, so it is inert on Android/iOS.

### Narrator on desktop

The on-device LLM (`llama.rn`) doesn't exist on desktop, so the narrator runs
through **`HttpLlamaRuntime`** against a local OpenAI-compatible LLM server
(`runtimeFactory.web.ts` picks it on the web target). Default: **Ollama** at
`http://127.0.0.1:11434/v1` serving `qwen2.5:1.5b-instruct`. Override at build/run
time with `EXPO_PUBLIC_LLM_BASE_URL`, `EXPO_PUBLIC_LLM_MODEL`,
`EXPO_PUBLIC_LLM_API_KEY`. Also works with llama.cpp's server or LM Studio.

To use the narrator on PC, install Ollama and `ollama pull qwen2.5:1.5b-instruct`
(or point the env vars at whatever local server/model you run).

## Building

### Automatic (CI)

Every push to `Dev_engine_PC` runs `.github/workflows/build-engine-exe.yml`, which
does all four steps above and uploads the `.exe` as the **`engine-dev-pc-exe`**
artifact. Download it from the workflow run. No store/EAS/OTA channel is touched.

### Local

```bash
# from repo root
npm install --legacy-peer-deps
npm run export:web                     # → dist/
bash scripts/harden-web-bundle.sh dist # optional hardening
mkdir -p desktop/web-build && cp -r dist/* desktop/web-build/
cd desktop
npm install
npm run dist                           # → desktop/release/*.exe
# or, for live dev against `expo start --web`:
#   (root) npm run web      # serves on :8081
#   (desktop) npm run start:dev
```

## Isolation guarantees

- Separate Electron `appId`: `com.hotatticgames.tartarprim.engine.desktop`.
- All PC-only files (`desktop/`, `web-stubs/`, `scripts/harden-web-bundle.sh`,
  `obfuscator.config.json`, `runtimeFactory.web.ts`, `HttpLlamaRuntime.ts`,
  `build-engine-exe.yml`) live **only on `Dev_engine_PC`** and never merge back to
  `engine_Dev`. The shared engine code is byte-identical across both branches.
- Workflow runs **only** on `Dev_engine_PC` and produces only a `.exe` artifact.

## Branch sync

Every OTA on `engine_Dev` is merged forward into `Dev_engine_PC` so the next `.exe`
carries the latest engine state. PC-only files never flow the other direction.
