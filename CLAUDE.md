# Tartaria-RPG — Working Notes

## Shipping rule: OTA-only

Every change is shipped as an **OTA update** unless a native build
is the only way to accomplish it. Default flow per change:

1. Edit code in `app/` / `__tests__/` / `docs/` etc.
2. Bump `OTA_BUILD_ID` in `app/buildInfo.ts` (`YYYY-MM-DD-NNN`
   format; increment NNN per change)
3. `git add -A && git commit && git push` to the current
   feature branch — the OTA update server picks it up

**Native build is only required when:**
- Adding a new native module / Expo plugin (camera, BLE, etc.)
- Changing `app.json` / `app.config.js` runtime version
- Modifying native iOS/Android files under `ios/` or `android/`
- Bumping the Expo SDK version
- Anything that changes the JS engine, Hermes config, or
  native permissions manifest

For everything else — engine logic, JSON catalog edits, UI
component changes, screens, hooks, tests, assets that are
bundled JS-side — OTA is the only path. Don't suggest
`eas build` / native rebuilds for changes that fit in the JS
bundle.

If unsure whether a change requires a build, default to OTA and
let the harness reject if it can't be applied — it's faster than
the round trip of a native rebuild.
