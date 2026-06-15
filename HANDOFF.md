# Tartaria Realms — START HERE (main branch pointer)

> **You are on the `main` branch. Active development does NOT happen here.**

`main` is a stale snapshot with **no engine code**. All live work — engine code,
OTA updates, the canonical issue tracker, the build timeline, and the full
handoff — lives on the feature branches, NOT here.

## What to do first

1. **Switch to the ACTIVE DEVELOPMENT branch — `golem-line`:**
   ```
   git fetch origin golem-line
   git checkout golem-line
   ```
2. **Read the real handoff there:** `HANDOFF.md` on `golem-line` is the full
   source of truth. Its **CURRENT WORK PHASE block at the very top** gives you the
   phase, the branch topology, the latest OTA, the codename scheme, and the
   step-by-step procedures — read that block first.
3. **Read `CLAUDE.md`** (also on the branch) for the working rules.

## Current phase (as of 2026-06-15) — THREE lines

Each line is its **own app id + OTA channel**, so the apps install side-by-side
on a phone and never cross-publish. The isolation lever is `app.json`
(`expo-channel-name` + `bundleIdentifier` / `android.package`).

- **`golem-line`** — **the ACTIVE dev branch; do all work here.** Forked from
  `HaL2001` at OTA-620 (newest code). App id `…tartarprim.golem`, channel
  `golem-line`.
- **`HaL2001`** — the **LIVE line, currently FROZEN** to mature ~1 week and gather
  player feedback (last shipped = OTA-620). App id `…tartarprim.hal2001`, channel
  `hal2001`. **Do NOT push to it unless the user explicitly says "QoL for HAL".**
- **`arbiters-line`** — dormant separate line (app id `…tartarprim.arbiters`,
  channel `arbiters-line`); holds 45 of its own commits (OTA-563→599). Leave alone.

## Key facts

- **Active dev branch:** `golem-line` — channel `golem-line`, app id `…tartarprim.golem`
- **Live (frozen) branch:** `HaL2001` — channel `hal2001`, app id `…tartarprim.hal2001`
- **Latest OTA:** `OTA-620 (Bibinilium Glow)` — `app/buildInfo.ts`
  `OTA_BUILD_ID = '2026-06-12-620'`. Next OTA on golem-line = **621**.
- **Codename scheme:** systematic IUPAC name of `(OTA-NNN − 400)` + a flavor word
  (e.g. 620 → 220 "Bibinilium"; next 621 → "Bibiunium"). Full rule is in the top
  block of the `golem-line` `HANDOFF.md`.
- **App version (rt floor):** `2.4.1` — pinned for OTA delivery (`runtimeVersion`
  policy `appVersion`).
- **Project:** Expo account `hot-attic-games`, slug `tartaria-`.

---

*This file exists only to redirect a fresh session to the active branch
(`golem-line`). Do not treat it as the issue tracker — the real, full `HANDOFF.md`
is on `golem-line`.*
