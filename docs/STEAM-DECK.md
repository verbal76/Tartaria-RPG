# Steam Deck / Steam Machine — compatibility matrix

Valve's "Steam Deck Verified" / Steam Machine requirements, mapped to what Tartaria Realms does today.
**Status words are literal:** MET = implemented and covered by a test in this repo; PARTIAL = built, with a
named gap; NEEDS DEVICE = cannot be established without Deck hardware; OWNER = a Steamworks-partner-site or
account action no code can do.

The Steam build is the Electron wrapper in `desktop/` loading the Expo **web** export. Everything in this
pass is gated to that wrapper / the web bundle's `.web.tsx` halves: **the native (mobile) bundle is
unchanged**, so no mobile OTA is implied by any of it.

| # | Valve requirement | Status | What implements it |
|---|---|---|---|
| 1 | Supports the Deck's physical controls; default config reaches ALL content; no in-game setup needed | **PARTIAL** | `GamepadNav.web.tsx`: D-pad + left stick move spatially between every focusable control, A activates, B backs out (Escape), popup focus capture, right stick scrolls, LB/RB page, Y jumps to the command field. It reads the standard Gamepad API, which Steam's default **Gamepad** template feeds. **Gap:** it has not been driven on a real Deck. Anything not a DOM-focusable control (a custom gesture-only surface) is unreachable by design — a content audit with a controller is still owed. |
| 2 | Glyphs match the input in use; no mouse/keyboard glyphs under a controller | **MET** (Xbox-layout glyphs) | `gamepad/controllerHints.ts` + `inputMode.ts`: a strip of A/B/X/Y/D-Pad/R-Stick/LB/Menu shows only while a pad is the active input, the cursor is hidden (`body.gp-mode`), and the hint set contains no keyboard/mouse words (pinned). Deck, Steam Controller and Xbox pads share the A/B/X/Y layout. **Not done:** the SteamInput API's per-device glyph art (PlayStation/Switch layouts). Recommended by Valve, not required. |
| 3 | Text input uses Steam's keyboard API, or a controller-only built-in entry | **MET (both)** | A on a text field → `steamTextInput` (`desktop/main.js`, `steamworks.js` `utils.showGamepadTextInput`); if Steam isn't running or declines, the built-in keyboard (`gamepad/onScreenKeyboard.ts`) opens. English only (the game is English). Covers the typed-command box and character naming. |
| 4 | Playable default config: 30 fps at 800p | **NEEDS DEVICE** | Not measured. Honest state: the game is a text/button UI with light rendering; the risk is the voice stack (Kokoro via WebGPU/WASM) and WebGPU on Linux/gamescope, neither measurable here. `enable-unsafe-webgpu` is on; if Chromium's Vulkan WebGPU is unavailable on the Deck it falls back to WASM, which is slower. **Action:** profile on a Deck (frame time, voice on/off) before submission. |
| 5 | No device-compatibility warnings (OS / GPU unsupported) | **MET** | No such message exists in the UI or the wrapper (pinned: `main.js` contains no "unsupported"/"launcher" text). The Qwen/voice paths degrade silently to templates on desktop. |
| 6 | Launchers must be controller-navigable (prefer none) | **MET** | There is no launcher: the window loads the game directly. |
| 7 | Proton (Windows build) | **PARTIAL** | The recommended path is the **native Linux** build, not Proton. The Windows portable `.exe` is built too; it has not been run under Proton. |
| 8 | Runs at a Deck-supported resolution (1280x800 preferred) | **MET** | `deckProfile.js`: opens at 1280x800 (clamped to the screen); under Game Mode (`SteamGamepadUI` / gamescope) the window is fullscreen and borderless. |
| 9 | Text legible at 30 cm: nothing under 9 px at 1280x800 (12 px recommended) | **MET (enforced at render)** | The shared UI contains 6 declarations at 8 px and 44 at 9 px (470 of 1,033 are under 12 px). Rather than edit hundreds of shared styles (which would reflow the phone UI), the Deck build sets Chromium's `minimumFontSize: 12` on the window, which clamps every rendered font. Not verified visually on a Deck: a clamp can overflow a tight label; check the dense screens (inventory rows, stat panel). |

## Things only the owner can do

* **Steam app id.** `desktop/main.js` still defaults to `STEAM_APP_ID=480` (Spacewar). Text entry, the
  Deck detector and achievements only work against the real id.
* **Steam Input default configuration.** The Steamworks partner site holds the controller config. Pick the
  **Gamepad** template (Xbox mapping) as the default, which is what `GamepadNav` reads; do not ship a
  keyboard/mouse-style default.
* **Ship the Linux build as a depot, not only an AppImage.** An AppImage needs FUSE; a plain unpacked
  `linux-unpacked` directory is the reliable Steam depot. `desktop/package.json` currently builds AppImage.

## How to run it on a Deck locally (no Actions)

1. `npm run export:web` at the repo root, copy `dist/` to `desktop/web-build/`.
2. In `desktop/`: `npm ci && TARTARIA_DECK=1 TARTARIA_FULLSCREEN=1 npx electron .` (these env vars stand in
   for Game Mode and the Deck detector on a dev machine).
3. Check each row above. `TARTARIA_MIN_FONT=14` overrides the text floor while tuning.
