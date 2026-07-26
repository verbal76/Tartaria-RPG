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

- **Per OTA push:** PATCH += 1 → update `DISPLAY_VERSION` in
  `app/buildInfo.ts` (the character-select / About game version) in the same
  edit as the `OTA_BUILD_ID` bump. (The old `APP_SEMVER` field never survived
  the buildInfo rework — `DISPLAY_VERSION` is the carrier now.) Log rows here
  are for MINOR/MAJOR moves and native builds, not every PATCH.
- **Significant feature:** MINOR += 1, PATCH = 0.
- **Native APK/AAB build:** stamp `app.json` `version` with the value in
  `NEXT`, then continue OTAs from there.

---

## State

- **Current native / runtime version (`app.json`):** `2.4.1`
  (the live Google Play internal-test build; dev lineage)
- **NEXT — value to stamp on the next native build:** whatever
  `DISPLAY_VERSION` reads at build time (`4.28.15` as of this write).
- **Current logical version (`DISPLAY_VERSION`):** `4.28.15` — REACTIVATED at
  `4.28.3` on 2026-07-26 after freezing at `4.1.0` (OTA-602; see the catch-up
  ledger below), then PATCH +1 per OTA through the 993–1004 run.

> Builds before `3.0.0` (the `2.x` series) predate this ledger and were
> numbered ad hoc. The scheme starts cleanly at the `3.0.0` promotion.

## Log

| Logical | OTA_BUILD_ID | Kind | Notes |
|---|---|---|---|
| 3.0.0 | (set at promotion) | AAB | HaL-lineage promotion → Play internal test. Package `com.hotatticgames.tartarprim`, key `tartaria-upload`, versionCode = CI run number. New AI stack (Qwen item-synthesis / MiniLM / Kokoro). |
| 3.4.11 → 4.1.0 | OTA-602 | OTA | Last bump before the tracker froze (title-screen relabel era). Everything after shipped without moving the number. |
| 4.28.3 | 2026-07-26-992-game-version | OTA | TRACKER REACTIVATED — caught up 389 frozen OTAs via the wave ledger below. From here: PATCH every OTA, MINOR per feature wave. |
| 4.28.4 → 4.28.15 | 2026-07-26-993 … -1004 | OTA | The device-log root-cause run (truth batch, stat toasts, accept parity, portable words) plus two owner features: THE HOLLOWED (998 + 1004) and the healing / offer-budget / weather-locality tuning (1001–1003). PATCH per OTA as the rule says. **The Hollowed is wave-sized** — fold it into the next MINOR bump rather than renumbering builds already on devices. |

## Catch-up ledger — how 4.1.0 became 4.28.3 (2026-07-26)

MAJOR stayed **4**: same engine lineage since the AI-restructure promotion.
MINOR: 1 (at the freeze) + **27 significant feature waves** shipped between
OTA-603 and OTA-991 = **28**. PATCH: OTAs after the last wave closed (escorts,
OTA-989) → 990, 991, 992 = **3**. The waves, in ship order:

1. OTA-630–631 — instant Crucible forging (background naming)
2. OTA-636–637 — typed-damage combat rework (procs/DOTs, weak/resist gating)
3. OTA-642 — single-active mission system + auto-routing
4. OTA-643–646 — weapon coatings (+ armor resists)
5. OTA-650–655 — fusion picker + crafting-screen overhaul
6. OTA-668–673 — mission tracking + universal contract pause
7. OTA-675/690/707 — throwables & bandolier overhaul
8. OTA-691–692 — faction sigils
9. OTA-710–712 — gesture intent + provokable encounters
10. OTA-716–724/731 — found-only recipe discovery + Rare/Legendary expansion
11. OTA-726–730 — economy/gold-sink wave (paid services, premium stock)
12. OTA-~740–789 — the Hidden Market (square nav, all-faction brokering, rotation)
13. OTA-795 — dodge rework (opposed-contest AC-bypass gamble)
14. OTA-806–809 — social rework: parley + menace
15. OTA-815–819 — engaging-combat rework (scaling, packs, per-spawn weaknesses)
16. OTA-835 — race abilities become real mechanics
17. OTA-836–838 — visible-depth QoL (tap-to-explain, codex/bestiary)
18. OTA-843–845 — emergent depth (Chronicle, World Pulse, The Fallen)
19. OTA-847 — stealth system
20. OTA-849–868 — the LIVING WORLD war arc
21. OTA-869–870 — authored-questline content sprint (all 9 factions arced)
22. OTA-910–915 — the Great Climbs + Skyreacher drop + the Aetherkin
23. OTA-927–930 — the POWER rating + lens slot
24. OTA-947/959 — combat rebalance (defense de-runaway + legibility)
25. OTA-960–967 — loot audit + boss spoils table
26. OTA-973–978 — real-heights climbing arc + reach
27. OTA-985–989 — escort missions
