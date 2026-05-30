# Tartaria Realms — Version Ledger

`VERSION.md` is the **single source of truth for the version number.**
Read it before every native build; advance it on every OTA.

## Scheme — `MAJOR.MINOR.PATCH` (semantic versioning)

- **MAJOR** — a big / milestone jump (new engine lineage, major rework).
  Bumping MAJOR resets MINOR and PATCH to 0.
- **MINOR** — a significant feature wave. Bumping MINOR resets PATCH to 0.
- **PATCH** — **incremented on every OTA** since the last MINOR. So
  `3.2.17` = MAJOR 3, the 2nd significant feature wave, 17 OTAs after it.

## The two-version rule (important — do not break this)

There are two version numbers and only one moves on an OTA:

1. **Logical version** (this file + `app/buildInfo.ts` `APP_SEMVER`) —
   ships in the JS bundle, so the About screen can display it and it
   advances on **every OTA**. The PATCH digit lives here.
2. **Native / runtime version** (`app.json` `version`, with
   `runtimeVersion.policy = "appVersion"`) — this *is* the OTA runtime.
   It changes **only when a native APK/AAB is built**, and is stamped
   with the current logical version at that moment.
   **Never bump `app.json` `version` on an OTA** — it would change the
   runtime out from under installed devices and break OTA delivery.

### Workflow

- **Per OTA push:** PATCH += 1 → update `NEXT` below, update
  `APP_SEMVER` in `app/buildInfo.ts`, bump `OTA_BUILD_ID`, add a log row.
- **Significant feature:** MINOR += 1, PATCH = 0.
- **Native APK/AAB build:** stamp `app.json` `version` with the value in
  `NEXT`, then continue OTAs from there.

---

## State

- **Current native / runtime version (`app.json`):** `2.4.1`
  (the live Google Play internal-test build; dev lineage)
- **NEXT — value to stamp on the next native build:** `3.0.0`
  (the HaL-lineage promotion AAB — MAJOR jump to the new AI-restructured
  engine)
- **Current logical version (post-promotion baseline):** `3.0.0`

> Builds before `3.0.0` (the `2.x` series) predate this ledger and were
> numbered ad hoc. The scheme starts cleanly at the `3.0.0` promotion.

## Log

| Logical | OTA_BUILD_ID | Kind | Notes |
|---|---|---|---|
| 3.0.0 | (set at promotion) | AAB | HaL-lineage promotion → Play internal test. Package `com.hotatticgames.tartarprim`, key `tartaria-upload`, versionCode = CI run number. New AI stack (Qwen item-synthesis / MiniLM / Kokoro). |
