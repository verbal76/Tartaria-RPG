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
  `DISPLAY_VERSION` reads at build time (`4.28.39` as of this write).
- **Current logical version (`DISPLAY_VERSION`):** `4.28.39` — REACTIVATED at
  `4.28.3` on 2026-07-26 after freezing at `4.1.0` (OTA-602; see the catch-up
  ledger below), then PATCH +1 per OTA through the 993–1016 run.

> Builds before `3.0.0` (the `2.x` series) predate this ledger and were
> numbered ad hoc. The scheme starts cleanly at the `3.0.0` promotion.

## Log

| Logical | OTA_BUILD_ID | Kind | Notes |
|---|---|---|---|
| 3.0.0 | (set at promotion) | AAB | HaL-lineage promotion → Play internal test. Package `com.hotatticgames.tartarprim`, key `tartaria-upload`, versionCode = CI run number. New AI stack (Qwen item-synthesis / MiniLM / Kokoro). |
| 3.4.11 → 4.1.0 | OTA-602 | OTA | Last bump before the tracker froze (title-screen relabel era). Everything after shipped without moving the number. |
| 4.28.3 | 2026-07-26-992-game-version | OTA | TRACKER REACTIVATED — caught up 389 frozen OTAs via the wave ledger below. From here: PATCH every OTA, MINOR per feature wave. |
| 4.28.4 → 4.28.15 | 2026-07-26-993 … -1004 | OTA | The device-log root-cause run (truth batch, stat toasts, accept parity, portable words) plus two owner features: THE HOLLOWED (998 + 1004) and the healing / offer-budget / weather-locality tuning (1001–1003). PATCH per OTA as the rule says. **The Hollowed is wave-sized** — fold it into the next MINOR bump rather than renumbering builds already on devices. |
| 4.28.16 → 4.28.18 | 2026-07-27-1005 … -1007 | OTA | The Crucible batch, all three from one device session. **1005** opened the salvage valve — a 50-name catalog-absent curio pool drops at 18% per salvaged noun, so the fuse Crucible finally has fuel (it had been structurally starved since arb61 filtered salvage down to catalog names). **1007** made a Crucible that can't fire say so: the OTA-801 consolation-picker is removed, a modal names the shortfall and holds until read, and the vendor rig checks before charging. **1006** moved the crafting decision to the front — a quantity picker with −/+ and MAX replaces OTA-264's "continue crafting?" question, and the menu stays open until BACK. |
| 4.28.19 → 4.28.23 | 2026-07-27-1008 … -1012 | OTA | The trust batch: build-scoped voice-crash counter (1008), the 42-weapon Charisma-to-hit data fix + runtime backstop (1009), the mission-complete holding popup with its 7-site choke point (1010), the punctuation/article-insensitive travel-by-name matcher (1011), and the owner-requested ROOT-CAUSE AUDIT of the whole run (1012) — which found and fixed two defects in this session's own fixes: the Club batch-craft net-zero miscount and the ambiguous-partial silent pick. |
| 4.28.24 → 4.28.27 | 2026-07-27-1013 … -1016 | OTA | THE STUDS-DOWN TEARDOWN (owner: "take all of opus fixes down to the studs"). Five parallel audits re-derived every OTA-992..1004 root cause against pre-fix code: 13 audited, 5 clean, 8 with defects, ~30 findings. **1013** the stranded Mud-Frosted Bead curio (portability × curio catalog-absence). **1014** exploits+spawns: gear farm re-closed, sigil farm head-gated + permanently ledgered, revenant escort/building gates, trait-keyed reverence, live fallen cache, slot-priority kits, road-weather sentinel, the rumour names the fallen that rises. **1015** contracts+toasts: single-active enforced at ACTIVATION across kinds, parked grants say so, the 8 base-stat toasts fixed + lock hardened. **1016** input+world: qwen guard word-level both directions, reach-class refusals, indoor course clear, pitch-keyed offer rotation, tag-aware weather bias, dog-frame heals, exact-landmark climb precedence. |
| 4.28.27 → 4.28.28 | 2026-07-27-1017 | OTA | THE RESIDUALS, CLOSED (owner: "complete 1-4 that were left open"). THE RECLAIM: full gear snapshots at death; a Hollowed put to rest hands back the died-in weapon outright (pristine, owner's call) and armor rolls grant the REAL pieces, never trophies; KO-strips count as put to rest; legacy seeded kits pin at first generation. Previews promise the scaled heal. The sky is remembered per location (self-pruning map, legacy slot migrates). Hollowed: proven-progress gate (10 kills or 12h), per-tile roll bank, retried memorial write, no boss spawn over a live fight. |
| 4.28.28 → 4.28.29 | 2026-07-27-1018 | OTA | The Fallen roll marks the STILL-WALKING: un-avenged memorial entries carry an amber warning line and the header counts them — the player can finally see which dead are still out there as risable Hollowed. |
| 4.28.29 → 4.28.30 | 2026-07-27-1019 | OTA | Codex tabs always on screen (owner screenshot: "there is no fallen tab under lore"): the 7-tab row was a cue-less horizontal scroll hiding FALLEN and LORE past the right edge; it now wraps onto a second line. |
| 4.28.30 → 4.28.31 | 2026-07-27-1020 | OTA | Every coating racks (owner: bandolier refused some coatings). Category: identity-by-instance-tag-snapshot — old instances keep minted tags forever. canonicalItemTags (instance ∪ catalog) + isWeaponCoatingItem; bandolier gate, throw burst, coat-a-weapon, equip guard, drinkable gate all routed; whole-catalog sweep locked in tests. |
| 4.28.31 → 4.28.32 | 2026-07-27-1021 | OTA | RESTITUTION (snapshot-audit batch A): legacy catalog-name migrations (Boltcaster→Beacon Rifle, Greaves→Mantle w/ slot move, torches, golem armaments) applied on every load to inventory/equipped/golem/recipes; golem armament joins the load heal passes; resurrection loads migrated worldMemory + canon-location resync. |
| 4.28.32 → 4.28.33 | 2026-07-27-1022 | OTA | FAIL-OPEN HOLES CLOSED (snapshot-audit batch B): quest-lock, forge blocklists, substitute-drain rarity guard, collect_only — all canonical (instance ∪ catalog / catalog-first). New canonicalItemKind + canonicalItemRarity; tag union widened to amulets/rings/dog gear. Whole-catalog fail-closed sweeps locked in tests. |
| 4.28.33 → 4.28.34 | 2026-07-27-1023 | OTA | ECONOMY CANONICAL (snapshot-audit batch C): sell/scrap/repair/golem-feed/coating-drink resolve kind/rarity/tags against the live catalog; trophy discount is catalog-authoritative (dies on promotion); stale-vs-fresh parity locked in tests. |
| 4.28.34 → 4.28.35 | 2026-07-27-1024 | OTA | IDENTITY TAIL (snapshot-audit batch D): ~25 remaining sites canonical (sections, throwable cluster, sigils, tools, substitution, digging, racial gear, faction catalysts, rope/treat/torch/barehand/food/repair-perk) + fused-kind load guard + CHA stat-channel heal + exact-ingredient substitution exclusion. |
| 4.28.35 → 4.28.36 | 2026-07-27-1025 | OTA | GUARD-RAILS (snapshot-audit batch E, closes the audit): catalog-name ratchet (snapshot + script + build-failing lock on unmigrated removals), orphan-safe ABANDON, def-resolving contract count, staged-record turn-in gate, loud location fallback, canonical deep-link/relic-perk/trade-away. |
| 4.28.36 → 4.28.37 | 2026-07-27-1026 | OTA | KILL-BEAT FREEZE FIXED (owner report: 7-8s hang on the killing roll): the canonical identity helpers were uncached linear catalog scans multiplied by the kill path's inventory loops; per-name memo caches restore pre-audit speed (281ms → 25ms in the probe) with identical semantics. |
| 4.28.37 → 4.28.38 | 2026-07-27-1027 | OTA | CRAFT-SCREEN STALL FIXED (pre-existing): ingredientShortfall annotated the whole inventory per recipe — 130× per open and per repair tap; WeakMap annotation cache on the immutable inventory array → 900ms → 3-23ms. Plus canCraft/drain exact-ingredient exclusion parity. |
| 4.28.38 → 4.28.39 | 2026-07-27-1028 | OTA | WEDGED BANDOLIER FIXED (ghost equip references): racked/stowed ids whose items left the pack by any path other than throw/unrack rendered as empty-but-cap-counting slots; ghost sweep on load + live-id cap checks for bandolier AND tool pouch. |

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
