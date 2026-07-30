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
  `DISPLAY_VERSION` reads at build time (`4.28.64` as of this write).
- **Current logical version (`DISPLAY_VERSION`):** `4.28.64` — REACTIVATED at
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
| 4.28.39 → 4.28.40 | 2026-07-28-1029 | OTA | THE GREEN LIE FIXED (divergent reach copies): the weapon quick-button highlight and the enemy panel re-derived reach locally and missed the forge-stamped reach class on fused weapons — a close-only fused weapon glowed green at mid range while the attack gate refused. One exported resolver (playerWeaponReach) now feeds the gate, the button tones, and the in-range flag; category-lock test forbids new local copies. |
| 4.28.40 → 4.28.41 | 2026-07-28-1030 | OTA | STORY-THREAD COMPLETE FLOW: the completion popup used to mount the instant the final thread stage resolved, on top of the thread text still being read. The notice is now stashed and raised only when the player taps the new single COMPLETE button on the terminal stage (mid-thread stages keep CONTINUE/ABANDON); scrim/back route through COMPLETE so the payout notice can't be dropped. |
| 4.28.41 → 4.28.42 | 2026-07-28-1031 | OTA | COATING PICKERS SHOW THE EQUIPPED PIECE: weapon- and armor-coating pickers now tag each candidate that is currently worn (· EQUIPPED (main hand) / (chest) etc.) through the same instance-id resolver as the inventory EQUIPPED badge, so the tag hits the exact worn instance even among same-named duplicates. |
| 4.28.42 → 4.28.43 | 2026-07-28-1032 | OTA | CONTESTED FLEE (owner: never lost a flee roll — proven: flat DC 9 vs growing DEX made failure impossible at DEX 8+). Escapes in combat are now opposed by the fastest live pursuer's d20 + speed (bestiary AP + quick/agile/aerial/slow traits, clamp 0-14); ties go to the runner; hounds and winged things are hard to outrun, titans easy. Trap/stage escapes keep DC 9; new-character flee grace untouched. |
| 4.28.43 → 4.28.44 | 2026-07-28-1033 | OTA | OFF-HAND PROMOTION GUARD (found via the dead combatStress canary): 'attack with <weapon>' could bind the one off-hand instance to BOTH hands on name-only equipped states, silently evicting the main weapon — the guard is now id-first with a name fallback. The heavy combat sim itself repaired (living-world fights, honest floors, real time budget) and verified green end-to-end: 20k actions, 0 crashes, <1% stalls. |
| 4.28.44 → 4.28.45 | 2026-07-28-1034 | OTA | HEAVY-GATE HYGIENE: test:ci:heavy was never runnable (unquoted shell pattern) — fixed; first full sweep 24/27, the 3 red repaired (stale source-anchor window, outgrown 240s budget, metaNav OOM bounded to measured-stable 4000 with a hard leak characterization: ~1 MB/action module-scope heap growth from ~action 2000 — logged as the entry point for the world/persist open item). HANDOFF §8 reconciled (stale punch-list/backlog items struck; one deliberate residual surfaced: mysteries/storylines still turn in remotely). |
| 4.28.45 → 4.28.46 | 2026-07-28-1035 | OTA | PERSIST LEAK ROOT-CAUSED (the deepest open item, closed): sim OOMs were the jest.fn AsyncStorage mock retaining every ~400 KB disk-log rewrite (plain mock via moduleNameMapper; 12k-action proof run flat at 249 MB vs 8 GB OOM before); on device, appendLogToDisk's per-line full read-modify-write is now BATCHED — one read+write per burst instead of megabytes of bridge traffic per action. Plus corrections: all contract kinds were already face-to-face; docs and a stale comment fixed. |
| 4.28.46 → 4.28.47 | 2026-07-28-1036 | OTA | TC-GHOST CLOSE-OUT: the intermittent raid-window challengeForLocation crash investigated to its evidence floor — both occurrences co-occurred with the since-fixed 6-8 GB test-mock heap pressure; 3 armed repro attempts + 4 clean runs show zero recurrence. Permanent self-diagnosing tripwire armed in the combat canary (stack + module shape + heap on any recurrence). Test-only. |
| 4.28.47 → 4.28.48 | 2026-07-28-1037 | OTA | CONTRACTS CARD UNWEDGED (owner report, log part 16): quit-navigating left routedMission set, freezing the card's Auto-routing note over the ROUTE button, and COMPLETE-tap refusals (wrong faction etc.) spoke only to the invisible world feed. Now: stopTravel/stopWhisperCourse clear routedMission; the routed note requires a live course (heals stale saves); refused COMPLETE taps surface the Arbiter's line as a dismissible strip on the Contracts screen itself. |
| 4.28.48 → 4.28.49 | 2026-07-29-1038 | OTA | ONE KILL, ONE PRICE + STEALTH HONESTY (owner log part 16, re-verified by probe): faction patrols were reskinned from whatever the wild table rolled, so an Aetherkin walked in wearing a faction name and its kill docked that faction TWICE (measured −6 vs −3) — special templates are now excluded from faction parties and the reverence pass skips factions the kill already docked. A FAILED sneak cost nothing while a successful one always cost HP; the failed sneak now charges the group counter the Arbiter's own warning promises. Shadow Diver's +1 now rides the deciding contest, not just the gate. Plus a fragment status-expiry line and range-aware warning wording. Initiative-is-cosmetic left OPEN for the owner. |
| 4.28.49 → 4.28.50 | 2026-07-29-1039 | OTA | NO OPEN-GROUND AMBUSHES INDOORS (owner log, twice in six minutes): all three outdoor world-event spawners tested `player.hubRoomId` for "am I inside?", which only covers OUTPOST rooms — building interiors live on the store's activeBuildingId — so patrols "crossed your path in the open" in a flooded-house kitchen and a war party "crested the rise" in its study. One shared underRoof() predicate now answers for all three, locked by call-site count. Plus an honest wall-rest refusal for players carrying a plain Climbing Rope. |
| 4.28.50 → 4.28.51 | 2026-07-29-1040 | OTA | INITIATIVE DECIDES WHO SWINGS FIRST (owner: "I thought the initiative roll was the deciding factor on who went first" — it never was; the roll's only consumer was the log line). Losing it now runs the enemy volley BEFORE your strike, and a lethal volley cancels your swing; the volley is MOVED not added, so a round still holds exactly one. RAISES LETHALITY BY DESIGN. Plus the owner's second call: only the Hardened Climbing Strap anchors an elevated rest — the Reclaimer's-Rope allowance is removed on every climb. |
| 4.28.51 → 4.28.52 | 2026-07-30-1041 | OTA | THE REASON YOU CAME DOWN (story phase 1/3, promoted from golem 1018 — owner: "push all of this to HAL"): five story motives picked at creation step 3, a Skyrim-style paged opening crawl (3 universal + 2 motive + 1 faction + closing) with SKIP and About-screen REPLAY OPENING, and save migration that deals old characters a stable motive without showing them the crawl uninvited. |
| 4.28.52 → 4.28.53 | 2026-07-30-1042 | OTA | THE ARBITER HOLDS HIS TONGUE (promoted from golem 1019): the tutorial still arms at startNewGame (scene-entry hints suppressed), but the spoken beat-0 name prompt now fires from dismissStoryIntro() — guarded so REPLAY OPENING and backfilled saves can never re-speak it or restart the tutorial. |
| 4.28.53 → 4.28.54 | 2026-07-30-1043 | OTA | CHAPTER CARDS (story phase 2/3, promoted from golem 1020): every main-quest phase transition raises a full-screen chapter card (II NINE HEARTS, III THE FIRST HEART, IV THE ENDLESS STAIR, V THE MUD FLOOD NEXUS), each with a universal body + a per-motive line; 'ended' gets the 3-endings × 5-motives epilogue matrix on EndingScreen instead. |
| 4.28.54 → 4.28.55 | 2026-07-30-1044 | OTA | THE MOTIVE DRIP (story phase 3/3, promoted from golem 1021 — arc complete): five beats per motive at travel arrivals (strict order, one-shot, hour+Core gated); The Missing's trail ends at a Lost Capital with grave, lie, or the thing that walks — keepsake guaranteed, walker defeat closes the thread, resolved threads override the EndingScreen epilogue. |
| 4.28.55 → 4.28.56 | 2026-07-30-1045 | OTA | ONE-TIME VETERAN MOTIVE PICKER (twin of golem 1022): saves whose motive was DEALT by backfill (guessed, never chosen — new storyMotiveChosen flag) get asked once on load — five cards, the mud's guess tagged, CONFIRM commits forever; creation-made characters never see it. Both load paths covered (slot load + resurrection); the Arbiter acknowledges the pick in the feed. |
| 4.28.56 → 4.28.57 | 2026-07-30-1046 | OTA | REPLAY OPENING FINDABLE (twin of golem 1023; owner: "there was no replay opening" on About): About's only real entry is the title screen, where no player exists, so the player-gated button never rendered. Moved to the CharacterScreen header (BACK / CHARACTER / REPLAY OPENING, the owner's placement); the crawl overlay now mounts globally so replay plays over the sheet with no navigation. About's dead button removed; motive-picker pointer text updated. |
| 4.28.57 → 4.28.58 | 2026-07-30-1047 | OTA | FUSION LEGIBILITY (twin of golem 1024): forge-reservable inventory rows show their material kind(s) via the same helper the diversity gate counts ([organic], [stone · crystal]), and the vendor Crucible button states fee + balance before the tap (amber "25 TC — you have N" when short). Driven by the owner's log: a correct "too alike" refusal at 2 kinds, then a fee bounce at 11 TC discovered only after tapping. |
| 4.28.58 → 4.28.59 | 2026-07-30-1048 | OTA | PLAYER-FEEDBACK BATCH (twin of golem 1025): (1) Guardians finally HIT like their over-level — a flat damage bonus rides the tier die (+0 for fresh arrivals, ~+4 at the owner's level, +9 at cap), monotone-staged so the ramp never inverts ("the second boss was a fairly easy fight"); (2) the travel/room row WRAPS instead of shrinking five buttons to 55% font ("Materials… too small to read"); (3) the resonance hook weight 5 → 2 with a 2 → 5 line pool ("overused"). |
| 4.28.59 → 4.28.60 | 2026-07-30-1049 | OTA | NARRATION CONTEXT (twin of golem 1026): the Arbiter's AGGRESSION mood pool (all lines presuppose a live opponent) no longer fires without a live enemy — the mood read is one action stale, so post-combat looting drew combat menace ("which one of you to leave breathing" over a quiet crate). The Aetheric Torch mark line now rotates 4 variants instead of repeating "wrong-sounding resonance" verbatim. |
| 4.28.60 → 4.28.61 | 2026-07-30-1050 | OTA | DOG + GOLEM NAMING POPUPS (twin of golem 1027): the typed in-feed takeovers are gone — a playtester typed "rest" at the breed ask and it silently became the breed. Breed/name/sex land on one blocking DogOnboardingModal card (wedged saves heal with part-answers pre-filled); golem naming gets GolemNamingModal (SEAL THE NAME / KEEP ITS MAKING). Typed input mid-ask is never an answer. Plus: story-hook COMPLETE no longer raises the redundant second popup — the thread modal spotlights the payout in a YOUR REWARD strip. |
| 4.28.61 → 4.28.62 | 2026-07-30-1051 | OTA | MUSIC CROSSFADE + UPGRADE LIST (twin of golem 1028): music transitions are true crossfades — reflective beds melt over 2.2s, boss/combat and the market arrive as a fast 450ms shift (combat always from the opening bars), and an interrupted bed pauses in place and resumes mid-phrase on a quick return. The Crucible upgrade target list is grouped ARMOR & VESTS then WEAPONS, worn pieces first with an amber EQUIPPED badge (dog vests read ON <dog>). |
| 4.28.62 → 4.28.63 | 2026-07-30-1052 | OTA | CAPITAL TIDY-UP (twin of golem 1029): the vendor stay/leave popup is gone — it fired on every capital ROOM hop, because the room chips submit "go <dir>" and the leave-gate caught them. The trader chip gains a ✕ like the Crucible's, and BOTH dismisses are now keyed to the macro TILE: they survive interior hops and clear when you leave the tile, so coming back re-shows them. The trader / board / wanderer / Crucible banners collapse from four stacked full-width two-line boxes into one compact wrapping row. |
| 4.28.63 → 4.28.64 | 2026-07-30-1053 | OTA | PROMPT ECHO LEAK (twin of golem 1030): the Arbiter feed showed the game's own ambient BRIEF — the model recited its instructions instead of answering them, and the live streaming tail mirrored raw tokens to screen before any filter ran (the final filters dropped it, so it was never even logged). Both streaming paths now vet the preview and blank it the moment the output turns into meta-text; a new instruction-echo detector also filters the final sentences; and the ambient brief no longer opens with a narration-shaped sentence for the model to copy. |

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
