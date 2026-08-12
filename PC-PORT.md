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

## Code signing (defer to release — NOT needed for test builds)

Test `.exe` artifacts are unsigned → Windows shows "Windows protected your PC";
click **More info → Run anyway**. That's fine for our own testing. Add real
signing only when prepping a standalone release.

- **For Steam specifically, signing is largely optional** — Steam delivers through
  its own client, which sidesteps the SmartScreen warning. Signing matters most
  for **direct `.exe` downloads** outside Steam.
- **Modern constraint:** since 2023, code-signing certs must live on a hardware
  token or cloud HSM — a `.pfx` on disk / in CI secrets no longer works for new
  certs. So traditional OV/EV USB-token certs **can't be used in CI**.
- **Recommended path:** **Azure Trusted Signing** (~$10/mo) — cloud signing, no
  USB token, integrates with electron-builder, instant SmartScreen trust. Needs an
  Azure account + identity/business validation. Alternatives: SSL.com eSigner,
  DigiCert KeyLocker (cloud HSM, pricier).
- **Wiring (once a cert exists):** store the signing credentials as GitHub Secrets;
  add the electron-builder signing config to `desktop/package.json` (or an Azure
  Trusted Signing step in `build-steam-exe.yml`). Then every CI build signs the
  `.exe` automatically — no per-build work.

## Files in this scaffold

- `desktop/main.js` — Electron main; loads the web build; optional Steam init.
- `desktop/preload.js` — safe `window.tartariaDesktop` bridge (achievements).
- `desktop/package.json` — desktop-only npm package (Electron + steamworks.js).

## Display: column width and UI scale (OTA-1250)

Two things the mobile layout got wrong on a monitor, and how they are fixed.

**The column.** Five screens (Exploration, Title, Inventory, Vendor, About)
hard-coded `maxWidth: 600`. On a phone that is a no-op — phones are narrower.
On a maximized desktop window it was a 600px ribbon with the rest of the screen
empty. They now share `CONTENT_MAX_WIDTH` from `app/ui/displayScale.ts`:
**1024 on web/desktop, 600 on native.** One constant, so the screens cannot
drift apart; `__tests__/ota1250DisplayScale.test.ts` fails if a screen
re-introduces a bare 600, and its first assertion is that NATIVE is still 600
(the guard against the desktop widening leaking onto phones).

**The scale.** Settings → **Display size (S / M / L)**. Deliberately not a
resolution picker: inside a maximized window the OS owns the resolution.
S/M/L map to Electron zoom factors 0.85 / 1.0 / 1.25 — medium is 1.0, so the
default is the game as it always looked.

Wiring, renderer → Electron:

    app/ui/displayScale.ts  setUiScale()
      → window.tartariaDesktop.setZoom(factor)     [desktop/preload.js]
        → webFrame.setZoomFactor(clamped 0.5–2.0)

`webFrame` lives in the renderer, so there is no main-process round trip. The
factor is clamped in the bridge as well as the game — the bridge is the last
line before Electron, and a bad zoom makes the window unusable with no way back
to Settings.

⚠ The setting is persisted per install and **re-applied on boot from `App.tsx`**
(`loadUiScale()`), because Electron does not remember zoom across launches —
without that, a player on 'large' relaunches small.

⚠ The Settings row **feature-detects the bridge** and is absent entirely on
mobile and in a plain browser, rather than offering a switch that moves nothing.

⚠ Layout is not covered by the walker fleet — the game engine is untouched by
all of this, so no walker can observe it. It needs eyes on a real window.
