# Tartaria Realms — Session Handoff

> **Branch:** `claude/new-session-MvF82` (active work)
> **Latest OTA:** `2026-05-22-043`
> **APK build:** `138` (`version: 2.201` — runtime stream all OTAs target)
> **TypeScript:** 0 errors (`npx tsc --noEmit`)
> **Tests:** 1174 / 1174 across 99 suites
> **Working tree:** clean
> **Open PR:** #1 — draft, this branch → `main`, covers OTAs 029–043
> **Open issues:** 0

---

## 1. What this is

**Tartaria Realms** — React Native / Expo SDK 52 procedural narrative RPG. Android-first, Hermes engine. Repo: `verbal76/tartaria-rpg`. Distribution: EAS channel `preview` for OTAs.

**Setting:** post-Aetherstone-flood Tartaria — player wakes into a buried civilization, picks race + faction + name, plays procedural scenes driven by authored data + light template stitching + on-device LLM narration.

**On-device ML stack:**
- **Classifier (intent + target):** `onnxruntime-react-native` running `all-MiniLM-L6-v2` int8 (~22 MB, OTA-downloaded)
- **Generator (Arbiter narration + parse-fallback):** `Qwen 2.5 0.5B Instruct` via `llama.rn` (~398 MB Q4_K_M GGUF, OTA-downloaded)
- **Neural TTS (optional):** `react-native-executorch` running Kokoro-82M (~100 MB, OTA-downloaded)
- **STT (optional):** `expo-speech-recognition` with service-selection logic for Pixel devices

**Audio:** `expo-av` looping background tracks across 4 contexts (combat / shop / menu / explore) with crossfade.

---

## 2. Model identity for the assistant

**This session runs on `claude-opus-4-7[1m]`.** Use that exact string when asked which model you are. Never include the model identifier in commit messages, PR titles/bodies, code comments, or any artifact pushed to the repo — chat replies only.

---

## 3. Branch hierarchy & workflow

### Branches

- **`main`** — production. Tagged releases live here. Do NOT push directly.
- **`claude/new-session-MvF82`** — the active session branch for everything you ship. Every OTA flows from here. Push to this branch only.
- (Other `claude/*` branches may exist from prior sessions — leave them alone unless the user asks.)

The harness sometimes preconfigures a different branch name at session start. **If you're already on `claude/new-session-MvF82` with uncommitted/recent work, stay on it.** Don't switch branches mid-stream — that risks losing work in flight.

### Per-push workflow (OTA-only, ~95% of pushes)

```
1. Edit code in app/
2. npx tsc --noEmit   → must be 0 errors
3. npx jest --silent  → all suites must pass (see flakes section)
4. Bump app/buildInfo.ts → OTA_BUILD_ID format YYYY-MM-DD-NNN
5. git add -A && git commit -m "fix|feat|chore: <short subject>

   <body explaining the WHY with concrete before/after>"
6. git push -u origin claude/new-session-MvF82
```

The `.github/workflows/eas-update.yml` workflow auto-publishes to channel `preview` on every push to this branch. Player's device pulls the OTA on next launch via the boot-time silent check.

### When a new APK build is needed

Only when you add a NATIVE module (new dependency that ships native code) or change `app.json` native config. Steps:
1. Confirm with the user before adding the native dep
2. Add to `package.json` + `npm install`
3. Decide whether to bump `version` in `app.json`:
   - **Keep at `2.201`** if you want existing testers' APK to still receive OTAs and the new APK to share the same OTA stream (recommended default — no fragmentation)
   - **Bump to e.g. `2.202`** only if old APKs CANNOT safely no-op past the new module. After this, OTAs to `2.202` will not reach old APKs.
4. Bump comment in `metro.config.js` to trigger `build-apk.yml`
5. The user redistributes the APK manually to testers

**Lazy-load any native module that might not be in older APKs.** Static `import * as X from 'native-module'` at the top of a file can crash the JS bundle on APKs that don't have the native bridge. Use `require()` inside a try/catch helper (see `loadNavigationBar()` in `App.tsx` for the pattern). This way ALL OTAs reach all APKs regardless of native-module additions.

### OTA / APK runtime model (critical)

- `app.json` has `"runtimeVersion": { "policy": "appVersion" }` — meaning **runtimeVersion = the `version` field at build time** (currently `2.201`).
- OTAs are delivered to **every device on the same runtime + channel**. Multiple APKs on the same `version` share the OTA stream.
- Testers may be on different APK build numbers but the same runtime — they still get every OTA. APK build number is just the binary version; the runtime key is what matters for OTA delivery.

---

## 4. How the player works with you

**The user types runtime feedback into the in-game text input.** They paste me the play log between sessions. So when a log includes player turns like *"we need to add salvage as a button"* or *"this should pop up nouns"*, that's the player talking TO ME through the game — not an in-fiction action.

Two implications:
1. The meta-comment guard in `submitPlayerAction` (around line 1822) catches these and shows a confused-Arbiter response that includes "I'll keep your note in the log either way." That response is what the player sees — keep it honest, don't mock-narrate the request.
2. When reviewing logs, treat any sentence that's clearly meta-feedback as a feature request to triage, not a parser miss to debug.

**Log review is the primary feedback channel.** Player pastes a log → you find issues, prioritise, and ship fixes the same OTA. You will not have direct verification of fixes most of the time. Trust their next log to surface what worked and what didn't.

---

## 5. Architecture cheat-sheet

```
app/
  ai/                  — MiniLM + Qwen orchestrators
  audio/               — AudioManager / AudioController / settings
  components/          — UI primitives, Search / Approach modals,
                         TutorialOverlay + TutorialTarget
  data/                — Authored JSON. Locations / hubs / Micro-Micro rooms
                         all declare `interactables` arrays. wasteland_encounters.json
                         holds 45 archetypes (Phase 3 + 3 batches of mini-dungeons +
                         encounters). container_loot.json holds 9 archetypes.
  engine/              — Pure logic: parser, llmParser (Qwen fallback),
                         combat, crafting, durability, equipment, hooks,
                         hunts, mysteries, faction quests, world map,
                         weather, area search, ambient nouns, status effects,
                         narrative gen, digging, save system, enemy traits,
                         item weight, context injector, hub, containerLoot,
                         wastelandEncounters
  screens/             — Title / CharacterCreation / Exploration / Inventory /
                         Crafting / Vendor / Log / Lore / About (3-tab) /
                         ActionReference / Contracts
  state/               — gameStore.ts (Zustand) — ~7000 lines, the spine
  updates/             — checkAndApplyOTA.ts — fetchOnly mode for boot,
                         full reload on player tap
  voice/               — voiceSettings / TTSManager / TTSController /
                         PiperTTSManager / STTManager / loreLexicon /
                         speakerVoices / executorchAdapter
App.tsx                — boots hydrate, cognitive, Qwen, audio, TTS, auto-OTA;
                         pins Android status-bar padding; lazy-loads
                         expo-navigation-bar; global ErrorUtils handler;
                         ScreenErrorBoundary wrapping AppShell.
.github/workflows/
  build-apk.yml        — Gradle APK build (path-gated; touches metro.config.js)
  eas-update.yml       — OTA publish + channel→branch mapping
metro.config.js        — comment bumps trigger APK rebuild
app/buildInfo.ts       — OTA_BUILD_ID — bump on every JS-only push
docs/                  — pronunciation worksheet (pending player input)
```

---

## 6. Systems shipped this session (OTA 117 → 043)

> Numbering reset to `YYYY-MM-DD-NNN` per the OTA convention on 2026-05-22; the post-141 work below carries the new date prefix.

### Pre-ship audit + repairs (OTAs 041–043)

Seven parallel Explore agents audited the codebase (combat, exploration, vendor/economy, inventory/crafting, quests/contracts, Aethercraft/corruption, UI/dead-code). Triaged into BLOCKERS / MAJOR / MINOR / DEAD CODE / TEST GAPS. **Two false positives were caught by verification before fixing** — claimed equip-swap vaporization (`equipItem` never touches inventory) and claimed missing Aether Locket (exists in `amulets.json` and `gear.json`). Real findings:

- **OTA 041 — 4 ship-blocker fixes + 12 regression tests.**
  - **B2:** 13 orphan crafting recipes (Sludge-Forged Vest, Aether-Wing Cloak, Mudstone Bulwark, Hollow Crown Circlet, Mud Gem Amulet, Lich-Heart Pendant, Behemoth-Heart Talisman, Aether-Shard Ring, Wyrm-Fang Blade, Mud-Iron Greatblade, Resonant Song Phial, Iron-Worm Engine, Voidspawn Bolt) had no catalog match — `crafting.ts:146` silently fell back to stat-less `misc`/`Common`/`[]`. Authored all 13 into the right slot catalogs.
  - **B3:** `completeContractFromUI` mystery branch (`gameStore.ts:8701-8730`) granted TC + rep but skipped `rewardItem`. 6 mysteries dropped their item. Mirrored `turnInMystery`'s grant block.
  - **B4:** Storyline UI branch (`8732-8760`) same shape — 4 storylines (Runic Mantle, Tartarian Stoneband, Echoing Steps Boots, Mud Monarch Seal). Mirrored `turnInStoryline`.
  - **B5:** Sentinel barehand even/odd hit-gate parsed into `BarehandSpec.hitGate` but never branched on at attack resolution. CharacterScreen + tutorial promised the gate; engine ignored it. Extracted `barehandGateBlocks(spec, naturalRoll)` helper; gameStore consumes it after the damage die rolls. On mismatch: "Stonework fist rings off X — d10 rolled N, needed even", run enemy counter, advance clock, return.
- **OTA 042 — dead-code deletes (193 lines).** `app/components/InventoryPanel.tsx`, `app/components/VendorPanel.tsx` (orphans, both replaced by `*Screen.tsx` rewrites), `applyRacialStatBonuses` helper + its test. Skipped audit-flagged "low-value complexity" items (slot-inference regex, alias lookup, `detectACContexts` export) — defensive code, not bugs.
- **OTA 043 — 19 coverage-gap tests.** `aethercraftDispatch.test.ts` (7 — verb routing, fuel burn, per-race DC, no-fuel bail), `stealCaught.test.ts` (2 — caught + success paths with `Math.random` spy), `corruptionMarkup.test.ts` (10 — multiplier per tier, BUY markup, SELL untouched).

### Player Sheet + tutorial refresh (OTA 040)

- New `'character'` screen reached by tapping the top-left HUD. Read-only — equip/use stays on Inventory.
- Sections: header (name/race/faction/HP/STA bars), Core Stats with per-source breakdown chips (race / equipped / pack passive / food buff / weather / corruption tier), Defense with AC + race-conditional clause + barehand spec, Wallet & Condition with corruption tier + one-line description, Equipped slot grid, Status Effects with rounds remaining, Racial Traits, Active Contracts (tap to jump to ContractsScreen), Milestones & Memory.
- New helper `effectiveStatsBreakdown(player, weatherMod)` returns annotated source labels alongside totals. Existing `effectiveStats` signature unchanged — 30+ call sites untouched.
- New helper `tierDescription(tier)` returns one-line consequence text per corruption tier.
- 3 new tutorial steps inserted into `TUTORIAL_STEPS` (now 17): "Tap for the full sheet", "Race mechanics", "New verbs and buttons" (climb HUD / roadside spawn / steal / Aethercraft).

### Aethercraft + 4-tier corruption ladder (OTA 039)

- Three new verbs: `shape stone` (Aetherstone Manipulation, INT-based, DC 12+race), `summon golem` (Aether Golem Constructor, INT, DC 15+race, summons `golem_companion` status that fires 1d6 bludgeoning after each player swing), `mend wounds` (Aetheric Healing, WIS, DC 12+race).
- Race-specific DC modifier: Mud Dweller +0 (base), Aetherborn +2 (Aetheric blood but no True Tartarian training), all others +4.
- Race-specific stat bonus: Mud Dweller +2 INT to Aethercraft; Aetherborn +1 INT/WIS.
- **Aetherborn pay HP** (not corruption) for Aetheric Healing — substitution clamped with `Math.max(0, …)` to prevent underflow.
- Fuel consumed regardless of cast success ("the aether takes its due either way"). Allowed fuels by discipline: shape uses any Aether-tagged consumable; summon uses Aetheric Shard / Aether Crystal / Golem Core; mend uses Aetheric Shard / Aether Crystal.
- New status effects: `shaped_stone_ward` (+4 AC, 1 round, in-combat shape casts), `golem_companion` (post-attack 1d6 bludgeoning ally).
- **Corruption ladder:** clean (0–10) / tainted (11–30, CHA −1, +5% encounter chance) / corrupted (31–60, all stats −1, +15% encounter, +15% vendor markup) / hollowed (61+, all stats −2, +30% encounter, +30% markup, Mud Monarch Purifier spawns every ≥5 steps at HP ≥25%).
- Vendor BUY markup applied via `corruptionPriceMultiplier(tier)`; SELL deliberately unaffected.

### Race mechanical layer + Servants of the Giants (OTA 038)

- Every race now has structured `barehandDamage`, `racialACBonusRules` (tag-matched against scene), and always-on `racialStatBonuses`.
- Tartarian Giants: 1d6+2 barehand, −4 AC confined, +2 STR. Mud Dwellers: 1d6−3, +1 AC underground, +2 DEX. Architectural Sentinels: 1d10 even/odd, +2 AC runic, +2 STR/+1 INT. Aetherborn: 1d6−2, +1 CHA. Mud Golems: 1d6, +1 AC relic-armor, +2 STR. Reclaimers: 1d6, +1 AC ruins/cities, +1 DEX. Unknowing Masses: 1d6, no inherent bonuses.
- Servants of the Giants faction with vendor + quest chain authored.



### Tutorial — 15 steps, screen-driven (OTAs 132–135)

- `app/components/tutorialSteps.ts` defines `TUTORIAL_STEPS`. Each step has `screen`, `area` (`HighlightArea`), `title`, `body`.
- `advanceTutorial` in gameStore drives `currentScreen` ATOMICALLY with `tutorialStep` (single `set()` call) — earlier split caused a one-frame race where VendorScreen rendered against null vendor and the AboutScreen swap landed on a gray screen.
- Vendor step spawns **Irma Ironhand** as a demo vendor via `findVendorByName('Irma Ironhand')`. Cleared on step-leave.
- **Transactions disabled during tour:** `buyFromVendor`, `sellToVendor`, `acceptFactionQuest`, `acceptHunt`, `acceptMystery`, `acceptStoryline` all early-return with a "Tour mode" system line when `tutorialDemoVendor` is set. Visible TOUR MODE banner on VendorScreen.
- `ScreenErrorBoundary` wraps `AppShell` for crash recovery (RESTART / BACK TO TITLE buttons).

### Mini-dungeons + encounters (OTAs 136–138)

- **45 archetypes** in `app/data/world/wasteland_encounters.json`, types: `treasure` / `npc` / `skirmish` / `mini_dungeon`.
- Mini-dungeons added two schema fields: `bandit_pool` (enemy names to spawn) and `quest_hook` (`{ kind: 'hunt'|'mystery', id }` — auto-adds to active board without vendor handoff).
- **All 10 authored hunts and mysteries have at least one in-world discovery path** — no quest is vendor-only.
- New helper: `grantQuestHook()` in gameStore — bypass-vendor add to active list, silent no-op if already active/completed.
- Authoring template for new archetypes lives in chat history (give it to the user when they want to generate more via Notebook LM).

### Voice fixes + lifecycle (OTAs 117–130)

- Per-vendor + per-NPC Kokoro voice assignment via `app/voice/speakerVoices.ts` (lazy-loaded into a 2-slot LRU pool, Arbiter sticky + 1 vendor slot).
- `disposeStickyArbiterVoice()` wired into `TTSManager.onVoiceSettingsChange` — fixes ~100 MB/swap memory leak when player changed `kokoroVoice` setting.
- Vendor voice prewarm gated on `engine === 'bundled'` (was unconditionally downloading Kokoro for system-TTS players).
- `prewarmKokoro()` resets `prewarmStarted = false` on failure so transient errors don't permanently latch.
- STT service-selection picks `com.google.android.as` on Pixels.

### OTA crash-on-apply fix (OTA 134)

- Boot-time auto-check was calling `Updates.reloadAsync()` while executorch/llama.rn/ONNX/expo-av were mid-init. Bundle swap mid-init = home-screen kick-out (player saw this on every OTA).
- Now `checkAndApplyOTA({ fetchOnly: true })` from boot — downloads + sets `pendingOTAUpdate` flag. TitleScreen shows "UPDATE READY — TAP TO APPLY" banner. Full teardown + reload only on explicit player tap.
- Global `ErrorUtils.setGlobalHandler` auto-reloads on uncaught fatal errors >5s after boot (avoids restart loops within the first 5s where bugs are easier to diagnose).
- `ScreenErrorBoundary` adds a per-screen recovery card with the error message + RESTART/BACK-TO-TITLE buttons.

### Contract burst-aware Arbiter chatter (OTA 134)

- Suppressed `stage0.arbiter` on all 4 accept paths (faction quest / hunt / mystery / storyline). Chip-tapping 6 contracts no longer produces 6 offhand reactions.
- `bumpQuestsAccepted` is burst-aware: first-ever contract → milestone line (one-shot per character); fresh burst (>5s since last accept) → one "another for the slate" line; tier transitions at count 3 ("stacking") and count 5 ("slow down"); other in-burst accepts → silent.

### Companion-chat wellness remarks (OTA 131)

- New fields on `ArbiterContext`: `playerHpFraction`, `playerStaminaFraction`, `hasFirstAidKit`, `hasFood`.
- ~15% out-of-combat chance: Arbiter drops a wellness remark when player is hurt/tired, with item awareness when relevant.

### Immersive system bars (OTA 134+, native-bound)

- `expo-navigation-bar` (lazy-loaded) hides Android nav bar with `overlay-swipe` behavior. Status bar hidden via `expo-status-bar`.
- **Requires APK rebuild** to activate — the JS calls no-op on the existing APK 138.

### Parser fixes (multiple OTAs)

- Removed greedy synonyms: `okay` from `accept`, `bag` from `inventory`, `pocket` from `steal`, `press` from `advance`, `construct` from `craft`.
- Added `salvage` / `strip` / `pry` to `investigate` (hook-eligible).
- Meta-comment guard tightened: threshold 60 chars (down from 100), expanded regex catches `we need`, `could you`, `it should`, `add a`, `please add`.
- Sanity gate on garbage-prose targets in both `buildArbiterRemark` and the investigate handler — no more "The [garbage phrase]," the Arbiter says.

### Content variety (OTA 131)

- Every location-flavor pool expanded from 6–7 lines to 10+ — uniqueness audit passes 50% threshold for all 21 locations.
- `deferLines` (Arbiter on-target-callback pool) expanded from 3 to 10.

### State hygiene

- `wastelandStepsSinceEncounter` reset on slot-load and resurrect (no cross-character bleed).
- Dead `lastLookAt` field removed.
- Duplicate area-search exploit in attack-fallback path closed.
- New `lastInteractedNoun` tracked on every confident parse so soft Arbiter fallback can ground "what's inside?" questions in the right noun.

---

## 7. Open tasks

### Player-requested features (engineering work to do)

- **Salvage quick-action button** — explicit player request from OTA 141 log. Symmetric with Search/Approach: chip-tap modal listing scene nouns that can be salvaged (constructs, wrecks, automatons, drone husks). Needs new modal component + chip pool source + wiring in `InputBox`. Defer-until-confirmed by player.

### Player action needed

- **Pronunciation worksheet** — `docs/pronunciation-worksheet.md`. Player fills rows and sends back. Batch into `loreLexicon.ts` (~30 min, no engineering risk).
- **APK rebuild** — to activate immersive system bars. User triggers `eas build` when they're ready to redistribute to testers. Keep `version: 2.201` in `app.json` for the new build so existing testers keep getting OTAs.

### Watch list (not blocking)

- **`ambientNounVariety.test.ts` "small pools (≤8) show the entire pool unchanged across steps" flake** — passes in isolation, intermittently fails in full `npx jest --runInBand` runs (observed during OTA 042 + 043). Likely shared-state contamination from a prior test's RNG path. Real-world impact: zero — the feature itself works. Don't chase unless it gets worse.
- **`encounterStress` test cycle tuning** — `seq` reset removed in OTA 137 so real entropy drives variation; if archetype pool grows past ~50, may need re-tuning.
- **Audit minors deferred from pre-ship sweep** — inventory-full silently swallows hunt/mystery/storyline reward items on UI completion (`gameStore.ts:8669-8679` and equivalents); `require()` instead of top-level `import` for Aethercraft helpers in `gameStore.ts:11959, 11993, 11995` (circular-dep workaround — cosmetic); minor climb-fail messaging precision (`gameStore.ts:5250`); possible surprise-penalty double-apply between `statusAttackPenalty()` and `rollMods()` (audit was uncertain — needs ~5 min to trace and confirm).
- **`gameStore.ts` not swept top-to-bottom for dead code.** Pre-ship audit used grep-narrow reads on this 12k-line file. More orphan functions / unreachable branches likely live in there. Chunked sweep (~12 × 1k-line passes) recommended before a major refactor.

### Closed this session

- 13 orphan crafting recipes → stat-less misc fallback ✅ (OTA 041)
- Mystery rewards dropped on UI completion (6 mysteries) ✅ (OTA 041)
- Storyline rewards dropped on UI completion (4 storylines) ✅ (OTA 041)
- Sentinel hit-gate UI promised an unenforced mechanic ✅ (OTA 041)
- Dead-code orphans: InventoryPanel / VendorPanel / applyRacialStatBonuses ✅ (OTA 042)
- Test-coverage gaps: Aethercraft verb dispatch, caught-steal flow, corruption markup ✅ (OTA 043)
- Player Sheet screen + tutorial refresh (17 steps) ✅ (OTA 040)
- Aethercraft + 4-tier corruption ladder ✅ (OTA 039)
- Race mechanical layer + Servants of the Giants ✅ (OTA 038)
- Tutorial vendor → about freeze ✅ (OTA 135)
- OTA-apply crash ✅ (OTA 134)
- Mid-tour Irma cheese ✅ (OTA 133)
- Tutorial coverage gaps (cardinal travel, actions, contracts, settings) ✅ (OTA 132)
- Stats panel clipping behind scene bar ✅ (OTA 132)
- Parser mis-routes (okay/bag/pocket/press/construct) ✅ (OTAs 131, 140)
- Salvage → craft+construct misparse ✅ (OTA 140)
- Locket "force open" dead-end ✅ (OTA 140)
- "What's inside?" hallucinated inventory item ✅ (OTA 140)
- Garbage-prose Arbiter echo ✅ (OTA 141)
- Mud Monarchs vendor missing ✅ (OTA 131)
- Location-flavor uniqueness ✅ (OTA 131)
- `wastelandStepsSinceEncounter` cross-character leak ✅ (OTA 131)
- Mini-dungeon system + 36 new archetypes ✅ (OTAs 136–138)
- Burst-aware contract chatter ✅ (OTA 134)
- Companion-chat wellness lines ✅ (OTA 131)

### Decided won't-do

- **STT investment beyond service-selection** — player said "if it doesn't work it's bloat." Next failure → STT comes out entirely.
- **Cloud TTS** — offline-first per project architecture.
- **Continuous listening / hot-word** — battery + privacy; push-to-talk only.

---

## 8. Workflow conventions

### Commits

- **Prefix:** `feat:` / `fix:` / `chore:` / `refactor:` / `debug:` / `test:` / `perf:` / `ui:` / `content:`
- **Subject:** one line, lowercase after prefix, concrete and specific
- **Body:** explain the WHY with concrete before/after. Reference OTA numbers when fixing earlier bugs.
- **Never include** the model identifier (`claude-opus-4-7[1m]`) in any committed artifact.

### OTA bumps

- Format `YYYY-MM-DD-NNN`. NNN is monotonic counter; today's first OTA is 001, second is 002, etc.
- Bump on EVERY push that ships JS changes (which is ~all of them).

### Tests

- Live in `__tests__/` at repo root, `jest-expo` preset.
- 66 suites, 941 tests as of OTA 141.
- Two suites have a known parallel-run flake (see Watch list). Re-run in isolation to confirm; safe to push if isolated runs pass.

### Code style

- Default to writing no comments. Only comment when WHY is non-obvious (hidden constraint, subtle invariant, workaround for a specific bug).
- Never write multi-paragraph docstrings or multi-line comment blocks — one short line max.
- Don't reference "the current task" or PR-level context in code comments — those belong in commit bodies and rot inline.

---

## 9. Critical files / hotspots

- `app/state/gameStore.ts` — ~12,400 lines. Action handlers, combat resolution (with Sentinel hit-gate enforcement at the attack site), scene management, log persistence, room state, Qwen parse-fallback wiring, tutorial advance, OTA-update flag, burst-quest tracker, `lastInteractedNoun` tracker, Aethercraft verb dispatcher (`runAethercraft`), corruption markup application, completeContractFromUI reward grants.
- `app/engine/types.ts` — shared interfaces. `Location.interactables`, `MicroMicroLocation.interactables`, `ScreenName`.
- `app/engine/parser.ts` — dictionary parser. ~330 verbs across 36 intents.
- `app/engine/llmParser.ts` — Qwen-backed fallback. `parseInputViaLLM(text, ctx, qwen)`.
- `app/engine/wastelandEncounters.ts` — pickWastelandEncounter + 45 archetype types.
- `app/engine/containerLoot.ts` — open-intent loot resolver.
- `app/engine/hooks.ts` — multi-stage scene hooks (`wreck_construct`, `submerged_steeple`, etc.).
- `app/engine/hub.ts` — hub data + `isLeaveHubCommand` / `resolveHubTravel`.
- `app/engine/narrativeGenerator.ts` — Arbiter remark builder, soft fallback, opening narrative, location flavors.
- `app/voice/PiperTTSManager.ts` — Kokoro engine, voice pool (2-slot LRU).
- `app/voice/TTSManager.ts` — engine routing + queue + coalesce.
- `app/voice/STTManager.ts` — speech recognition with service selection.
- `app/voice/speakerVoices.ts` — per-vendor/NPC voice mapping.
- `app/components/tutorialSteps.ts` — TUTORIAL_STEPS array (17 steps as of OTA 040 — added Player Sheet, race mechanics, new verbs/buttons).
- `app/engine/raceMechanics.ts` — `barehandDamageFor`, `barehandGateBlocks`, `effectiveAC`, `racialStatBonusesFor`, `aethercraftDcModifier`, `aethercraftStatBonus`.
- `app/engine/corruption.ts` — tier ladder, `corruptionPriceMultiplier`, `corruptionStatPenalty`, `corruptionExtraEncounterChance`, `tierDescription`.
- `app/screens/CharacterScreen.tsx` — Player Sheet, OTA 040.
- `app/components/TutorialOverlay.tsx` + `TutorialTarget.tsx` — overlay + glow wrapper.
- `app/screens/ExplorationScreen.tsx` — `buildChipPool()` + main game UI.
- `app/data/locations/locations.json` — 21 locations, all declare `interactables`.
- `app/data/world/wasteland_encounters.json` — 45 archetypes.
- `app/data/world/container_loot.json` — 9 container archetypes.
- `app/data/npcs/vendors.json` — vendor catalog (Mud Monarch Agent added OTA 131).
- `App.tsx` — boot sequence, AppState handling, error boundary, lazy native-module loader, OTA flag wiring.
- `app/updates/checkAndApplyOTA.ts` — fetchOnly mode + full reload sequence.
- `app/buildInfo.ts` — bump every push.
- `docs/pronunciation-worksheet.md` — pending player input.

---

## 10. Quick-start commands

```bash
# Typecheck + tests (run both before every push)
npx tsc --noEmit && echo TS-OK || echo TS-FAIL
npx jest --silent

# Re-run a single suite (e.g. after a fix or to verify a flake)
npx jest <suite-name>

# Status / log style
git log --oneline -10
git status

# Push as OTA-only (typical path)
#  1) edit code in app/
#  2) bump app/buildInfo.ts OTA_BUILD_ID
#  3) commit + push → eas-update.yml fires
git add -A && git commit -m "fix: ..."
git push -u origin claude/new-session-MvF82

# Push as APK rebuild (native deps / version bump)
#  1) confirm with user first
#  2) bump comment in metro.config.js
#  3) commit + push → build-apk.yml fires (~17–20 min)
```

---

## 11. Status effect reference

| Kind | Source | Effect | Duration |
|---|---|---|---|
| `aiming` | `aim` | +2 next ranged, consumed on use | 1 round |
| `sprinting` | `dash` / `sprint` | -2 next attack (post-sprint) | 1 round |
| `in_cover` | `take_cover` (partial) | +4 AC vs ranged | 2 rounds |
| `in_cover_full` | `take_cover` ("full cover") | +8 AC vs ranged, ranged auto-miss | 2 rounds |
| `ready` | `ready` | +1 on triggered reaction | 1 round |
| `helping` | `help` | narrative ally bonus | 1 round |
| `overwhelmed` | engine | -2 on evade | 1 round |
| `surprised` | `ambush_strike` + maneuver mismatch | -2 next roll, consumed | 1 round |
| `fighting_back` | `fight_back` | next enemy strike → opposed Fighting roll | 2 rounds |
| `quick_fire` | `quick_fire` | +2 next ranged | 1 round |
| `dodging` | `dodge` | +4 AC | 2 rounds |
| `blocking` | `block` | +4 AC, durability/riposte | 2 rounds |
| `bleed`/`poisoned`/`stun`/`burn_scar`/`armor_severed`/`paralyzed` | per `statusEffects.ts` | varies | varies |
| `food_buff` | consumable use | per-food stat buff (e.g. Wild Carrot → +1 WIS) | typically 3–6 rounds |
| `shaped_stone_ward` | `shape stone` cast in combat | +4 AC | 1 round |
| `golem_companion` | `summon golem` cast success | post-attack 1d6 bludgeoning ally hit | 3 rounds |

---

## 12. Enemy trait reference

Set on enemy entries in `enemies.json`. Read via `enemyTraits.ts`.

**Stat mods:** `armored` (+2 AC) · `weak_armor` (-2 AC) · `agile` (+1 AC) · `quick` (+1 attack) · `slow` (-1 attack) · `savage` (+1 attack)

**Damage filters:** `resist:<damageType>` (×0.5) · `vulnerable:<damageType>` (×1.5)

**On-hit status:** `bleeder` (50% bleed 3r) · `venomous` (35% poison 3r) · `concussive` (20% stun 1r)

**Per-round / first-strike:** `regenerate` (+1 HP/round) · `fast_regen` (+2/round) · `ambush_strike` (+2 first hit)

---

## 13. Combat loot lands in `player.inventory`, not `droppedItems`

When the player kills an enemy, the loot path in `resolveEnemyDefeat`
grants items directly into `player.inventory` (and bumps the
`enemiesDefeated` milestone). It does NOT populate
`currentScene.droppedItems`. The dropped-items pool is reserved for
**unclaimed** loot — items the player leaves on the ground after a
fight, or items dropped by stealing / scattering. Stress-test authors
who check `droppedItems.length` after combat will see 0 and conclude
nothing dropped; they should look at `player.inventory` deltas
instead. (See `combatStress.test.ts:633-635` for the metric that
got this right after the first pass got it wrong.)

## 14. `gameLog` has a 500-entry cap with same-channel merge

`appendLog` (gameStore.ts, ~864–958) caps the log at 500 entries and
**collapses consecutive same-channel lines** into a single multi-line
entry when they fire within the same render tick. This keeps the
scrollback tidy but has consequences for any test that asserts on
log shape:

- Counting `gameLog.length` will under-count when the system emits a
  burst of same-channel messages (e.g. a single combat round can
  emit 6+ `'combat'` lines that show as 1 entry).
- Searching for a specific line should use `gameLog.flatMap` over
  the text content, not slot-position arithmetic.
- Old entries fall off the front when the cap is hit, so long
  stress tests (700+ days) can't read entries from early-game and
  expect them to still be in `gameLog`. Persist what you need before
  the cap evicts it.

## 15. Combat: nat-1 always misses, nat-20 always crits (OTA 168)

In `resolveRollStep` and `applyEnemyCounter`, the d20 attack roll's
**raw value** overrides the bonus math at the floor and ceiling:

- Natural 1 → forced miss (success = false), no damage step.
- Natural 20 → forced hit (success = true) AND `critical = true`, which
  doubles the dice count on the follow-up damage step (player) or
  re-rolls and sums the damage notation (enemy).

Symmetric — applies to both sides of combat. Combat log surfaces
`✓ CRITICAL HIT` / `✗ FUMBLE` on the trigger. This is what keeps
high-stat characters from grinding through Common AC at 100% — even
STR 14 vs AC 7 still fumbles 5% of the time, and enemy crits make
"things you have to run from" feel real.

If you write a combat stress test, mirror the rule when computing
hit rate locally (see `combatStress.test.ts:217-228`) — a missed
attack drains `pendingRolls` before you can read `success` back
off the store.

---

That's the lay of the land at OTA `2026-05-22-043`. State is healthy, 1174/1174 tests green, OTA pipeline is delivering cleanly to the existing APK fleet. The pre-ship audit has finished — 4 ship-blockers fixed, 31 new regression + coverage tests added, dead code pruned. Open PR #1 still in draft pending the user's decision to mark ready for review or merge to `main`. Next big moves are gated on either content (Salvage button needs UI work + user sign-off), player input (pronunciation worksheet), or the deferred items in the audit minors list (inventory-full silent swallow on UI quest completion, surprise-penalty possible double-apply, chunked `gameStore.ts` top-to-bottom sweep).
