# Tartaria Realms — PC / Steam Port (`steam_Dev` line)

This branch (`steam_Dev`) is the **isolated PC development line**, forked from
`HaL2001` at its newest code. Goal: ship the game on **Windows (Steam)** as a
desktop app, reusing the existing React Native game code via **react-native-web**
wrapped in **Electron**, with **Steamworks** for achievements/overlay/cloud.

It is hardened the same way as the mobile lines: its own `app.json` identity
(name "Tartaria Realms PC (Steam Dev)", id `…tartarprim.steamdev`, channel
`steam-dev`) so it can never cross-publish a mobile OTA or collide with the live
AAB/IPA. **Pushing this branch triggers no mobile workflow** (`steam_Dev` is not in
any workflow trigger list).

## How updates reach players (NOT OTAs)

Expo OTAs are mobile-only and do **not** apply to the desktop build. On desktop:

- **Steam = the update channel.** Rebuild the web bundle, push a new depot via
  **Steampipe** (`steamcmd`), and Steam auto-updates every player. PC fixes are
  "rebuild + push depot," not an OTA. Still just a JS rebuild — only delivery changes.
- (A standalone, non-Steam Electron build could use `electron-updater` instead.)

So mobile (OTA) and PC (Steam depot) update independently — no bleed in either
direction.

## Architecture

```
RN game code (app/, App.tsx)  ──react-native-web──►  web bundle (dist/)
                                                          │
                                              copied to desktop/web-build/
                                                          │
                                   Electron (desktop/main.js) loads it in a window
                                                          │
                                   Steamworks (steamworks.js) ── achievements/overlay
```

The game UI (buttons, typing, scenes, inventory, combat, saves) is plain RN that
react-native-web renders to HTML — it ports cleanly. Mouse clicks replace taps.

## The real work: native modules that don't exist on web

These RN-native modules must be **stubbed for web** (the game already falls back
to template narration / silent text when they're absent, so a playable build is
day-one):

| Module | Mobile role | Desktop plan |
|---|---|---|
| `llama.rn` (**Qwen**) | on-device AI narration | swap runtime → `node-llama-cpp` / Ollama (same GGUF). Stub first → template narration. |
| `onnxruntime-react-native` + **Kokoro** | bundled TTS voice | swap runtime → ONNX Runtime (kokoro-js / onnxruntime-node). Stub first → silent. |
| `expo-av` | background music / SFX | replace with HTML5 `<audio>` (react-native-web has no native AV). |
| `expo-speech` / speech-recognition | TTS + voice input | browser Web Speech API, or drop (PC is mouse/keyboard). |
| `expo-file-system` | model/voice downloads | Node `fs` in Electron, or bundle assets. |
| `@react-native-async-storage/async-storage` | saves | works on web (localStorage) — verify cap headroom. |

**Stub strategy:** Metro web aliases (or a `*.web.ts` shim per module) that export
no-op/safe surfaces so `expo export --platform web` compiles. Wire the real
desktop runtimes back in a later pass (Qwen, then Kokoro).

## Steam achievements

The desktop wrapper already exposes `window.tartariaDesktop.unlockAchievement(id)`
(see `desktop/preload.js`). Achievements are then mostly **mapping events the
engine already fires** (quest complete, boss down, title earned, milestones) to
that call. Requires a **Steam partner account** (one-time ~$100 app fee) to define
the achievement set in the Steamworks backend, and the real `STEAM_APP_ID`.
⚠️ Verify the exact `steamworks.js` achievement method name against the installed
version before relying on `desktop/main.js`'s call.

## Next steps (rough order)

1. Add web deps to **root** `package.json`: `react-dom`, `react-native-web`
   (+ `@expo/metro-runtime`). Confirm `npx expo export --platform web` runs.
2. Add the native-module **web stubs** (table above) until the export compiles
   clean. Target: a playable, template-narration, silent build in a browser.
3. `cd desktop && npm i` → copy `dist/` → `desktop/web-build/` → `npm start`.
   Confirm the game runs in an Electron window with mouse/keyboard.
4. `electron-builder` → a Windows folder build; smoke-test.
5. Provision the Steam app id; wire achievements to engine events; test with the
   Spacewar (480) app id first.
6. Re-add **Qwen** (node-llama-cpp/Ollama), then **Kokoro** (ONNX) as desktop
   runtimes behind the same game hooks.

## Files in this scaffold

- `desktop/main.js` — Electron main; loads the web build; optional Steam init.
- `desktop/preload.js` — safe `window.tartariaDesktop` bridge (achievements).
- `desktop/package.json` — desktop-only npm package (Electron + steamworks.js).
