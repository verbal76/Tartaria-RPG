# Tartaria Realms — Session Handoff

> **Dev branch:** `claude/new-session-MvF82` — **THE main development branch**. Every change ships from here. No separate "dev" or "preview" branch. See §3 for the 100% walkthrough.
> **OTA channel:** `preview` (EAS). Every push to this dev branch auto-publishes an OTA via `.github/workflows/eas-update.yml`. Players on APK 207+ pull on next launch.
> **🚫 APK BUILD HOLD — Google internal test in progress.** Do NOT trigger `build-apk.yml`. Do NOT bump `version` in `app.json`. Do NOT add native modules. All ship-able work is OTA-only. See §3 for the full rule set.
> **App version (in `app.json`):** `2.4.1` — frozen for the duration of the internal test. APK at runtime 2.4.1 is published as `apk-build-207` (+ test-only auto-rebuilds at the same runtime).
> **Latest OTA:** `2026-05-30-069` (HANDOFF.md discrepancy fix — synced the doc's "latest OTA" references to `buildInfo.ts`. The OTA-068 rewrite bumped `buildInfo.ts` to 068 but left this doc reading 067; the last *feature* OTA was 067, the rest-spam ambush fix).
> **Working tree:** clean. **Origin: in sync.**
> **TypeScript:** clean (`npx tsc --noEmit` reports only pre-existing `expo-navigation-bar` / `expo-speech` / `TTSManager` errors unrelated to recent work).
> **Tests:** `__tests__/durability` and the rest of the canary set pass. Many large suites OOM-fail in the sandbox on the missing `llama.rn` module mock — pre-existing environmental issue, not from recent work.

---

## 0. **READ THIS FIRST — Regression-prevention checklist**

*This section was added 2026-05-30 in response to a string of self-inflicted regressions where work was built without checking what was already on the branch. Multiple Claude sessions push to this same branch in parallel, so the remote can move 10+ commits ahead between your fetch and your push. Follow this checklist before every task.*

### 🚫 ABSOLUTE NO-GO ITEMS (Google internal test in progress)

- **DO NOT trigger an APK build.** Don't bump `metro.config.js`. Don't add native modules. Don't bump `version` in `app.json`. All work in this period is OTA-only. Full rules in §3.
- **DO NOT push to `main`.** Push only to `claude/new-session-MvF82` (THE dev branch — see §3).
- If a planned change would require any of the above, STOP and confirm with the user. The answer is almost certainly "wait until the internal test resolves."

### Before you write a single line of code

1. **`git fetch origin claude/new-session-MvF82`** — always. Always.
2. **`git log HEAD..origin/claude/new-session-MvF82 --oneline | head -30`** — if there's anything in there, **pull-rebase first**:
   ```
   git pull --rebase origin claude/new-session-MvF82
   ```
   Don't start work on a stale base.
3. **Search the codebase for the feature you're about to build.** Parallel sessions ship fast. Before writing `repairFromPack` (real example from 2026-05-30), grep for `repair`. Before building a third-party-notices system, grep for `NOTICES`. Before adding a new screen, grep for the screen name. The actual exploits from this session:
   - Built `requiredRepairMaterials` / `repairChecklist` / `applyRepair` / `repairFromPack` — every one of them duplicated existing `repairCostMaterials` and `repairInventoryItem` already on the remote. Had to delete it all during rebase.
   - Removed a "REPAIR tab" from CraftingScreen that I'd never seen — it landed on the remote during my work via OTA-059.
4. **Find the next free OTA number from the remote, not from memory.** `grep OTA_BUILD_ID app/buildInfo.ts` shows what's on disk; the **last entry in the comment block above it** is the highest OTA shipped. Use `last + 1`. Don't pick "next from today" — the date prefix is informational; the **NNN counter is global and monotonic across days**. See §4 for the exact rule.

### Before each push

1. **Re-run `git fetch` + `git status` + `git log HEAD..origin/<branch> --oneline`** in case more work landed during your edits.
2. **If the remote moved:** `git pull --rebase` first. Resolve conflicts deliberately (see §4 below). Do not skip-and-retry-push your way through.
3. **Verify the OTA number you picked is still free.** If your `OTA-064` is now `OTA-068`, bump it again before commit.

### When a rebase has conflicts

1. **For every conflict, ask: "is this two sessions writing the same feature?"** If yes, drop yours and use theirs (their work is already integrated with whatever else they touched). Almost every conflict you'll see is this shape.
2. **Don't try to keep both sides.** Two `repairFromPack`-style implementations of the same thing both compile but only one runs. The one that doesn't run is dead code that the next refactor will trip on.
3. **After resolving, check `git diff --staged` for accidental noise** — auto-merging can pull in formatting drift or duplicate imports that compile but read badly.

### When you ship a feature, also ship the trigger context

- **If you added a new state field**, document it in `WorldMemory` / `PlayerCharacter` with a comment explaining what the optional means and what reads it.
- **If you added a one-time popup / nudge**, the trigger lives in the screen that opens it — not in the action that grants the unlock. Mounted-on-screen triggers are the most reliable. See `app/components/FirstUseNudgeOverlay.tsx` for the pattern.
- **If you changed an existing handler**, scan for **every other handler that does the same shape of work**. Rest has TWO paths in `gameStore.ts` (parser-routed at ~line 4818 + dead store-method around line 11950). Wire your fix into the live one and explicitly note the dead one in the commit body.

### Wave-this-session lessons that recurred

1. **OTA numbering drift** (2026-05-30) — picked `2026-05-30-054` for in-pack repair when the remote was already at `2026-05-26-063`. Rebase forced a re-bump to `OTA-064`. Always check remote first.
2. **Duplicate-system blindness** (2026-05-30) — built four functions that already existed under different names. The user pointed out parallel work would surface this. Now an explicit checklist item.
3. **Dead-code path mis-wire** (lessons carried from prior session, e.g. OTA-050 fix) — wired the OTA-043 rest-pull into the dead store-method `rest()` action, missed the live parser-routed handler. Always grep `case '<verb>':` AND the named method.
4. **Tutorial regression** (2026-05-30) — parallel work added 12 concept steps to the 11-step screen tour without converting them to first-use popups, so a brand-new player saw 23 popups before play started. Fixed in OTA-066 by trimming to 9 tour steps + moving the rest behind `triggerFirstUseNudge`. The shape to avoid: don't pile sequential popups onto an already-shipped flow — gate new feature intros to first-use.
5. **Silent no-op via early-return** (2026-05-30) — rest-ambush rolled correctly (~22% × time-of-day) but the spawn path called `pickWastelandEncounter` which returned non-combat archetypes 38% of the time; those silently failed the `if (enc.enemyName)` check and the ambush was invisible. Fixed in OTA-067. The shape: any place a "did the thing happen?" boolean is the contract, downstream conditional logic that maps "happen" → "show the thing" is a footgun. Verify the visible-output side after every behavioral change.

---

## 1. What this is

**Tartaria Realms** — React Native / Expo SDK 52 procedural narrative RPG. Android-first, Hermes engine. Repo: `verbal76/tartaria-rpg`. Distribution: EAS channel `preview` for OTAs.

**Setting:** post-Aetherstone-flood Tartaria — player wakes into a buried civilization, picks race + faction + name, plays procedural scenes driven by authored data + light template stitching + on-device LLM narration.

**On-device ML stack** (all Apache-2.0 / MIT / BSD-3-Clause — verified for commercial release, see Settings → NOTICES tab):
- **Classifier (intent + target):** `onnxruntime-react-native` running `all-MiniLM-L6-v2` int8 (~22 MB, OTA-downloaded)
- **Generator (Arbiter narration + parse-fallback):** `Qwen 2.5 0.5B Instruct` via `llama.rn` (~398 MB Q4_K_M GGUF, OTA-downloaded)
- **Neural TTS (optional):** `react-native-executorch` running Kokoro-82M (~100 MB, OTA-downloaded)

**Audio:** `expo-av` looped tracks across 4 contexts (combat / shop / menu / explore) with crossfade.

---

## 2. Model identity for the assistant

This session runs on **`claude-opus-4-7[1m]`**. Use that exact string when asked which model you are. Never include the model identifier in commit messages, PR titles/bodies, code comments, or any artifact pushed to the repo — chat replies only.

---

## 3. Branch hierarchy & parallel-session reality

### **THE 100% WALKTHROUGH — read this before touching anything**

There is **one** active development branch and **one** OTA stream. Everything you ship goes through both.

#### The dev branch

- **`claude/new-session-MvF82`** — this is **THE main development branch**. Every change (code, content, fixes, features, OTAs) lands here. **There is no separate "dev" branch.** This is it.
- The user's playtests run off the OTAs published from this branch. Your push → OTA publish → user sees it on next app launch.
- Multiple Claude sessions push here concurrently. The remote moved 20+ commits ahead during a single in-session edit on 2026-05-30. Always `git fetch` before starting and again before pushing (see §0).

#### Where every OTA goes

Every push to `claude/new-session-MvF82` triggers `.github/workflows/eas-update.yml`, which runs `eas update --branch preview --channel preview`. The flow:

```
git push to claude/new-session-MvF82
  → GitHub Actions fires eas-update.yml
  → EAS publishes the new JS bundle to EAS branch `preview`
  → EAS channel `preview` is mapped to EAS branch `preview`
  → Player's APK is built against EAS channel `preview` + runtime version 2.4.1
  → On next app launch, the boot-time silent check pulls the new bundle
  → Player sees the change after one app restart
```

So **every commit you push goes to channel `preview` automatically**. No manual publish step. The mapping (`preview` channel ↔ `preview` branch) is set up server-side and is checked + re-asserted at the start of every workflow run.

#### Other branches in the repo (leave them alone)

- **`main`** — production. Tagged releases live here. **Do NOT push directly to `main`.** PR #1 (draft, this branch → main) is the merge path when ready.
- **`HaL2001`** — experimental sandbox from prior sessions. Was kept in lockstep with the dev branch via cherry-picks in the 2026-05-26 era. Not actively maintained right now — don't push to it unless the user asks.
- **Other `claude/*` branches** — leftovers from prior sessions. Leave them alone.

#### **APK build hold — Google internal test in progress (DO NOT TRIGGER A BUILD)**

The game is currently in a **Google Play internal test**. While that test is running:

- **Do NOT trigger `build-apk.yml`.** The workflow fires when `metro.config.js` changes; leave that file alone.
- **Do NOT bump the `version` field in `app.json`.** Bumping the app version invalidates the runtime version (since `runtimeVersion: { policy: 'appVersion' }`) and would break OTA delivery to every device on `2.4.1` — including the internal-test devices.
- **Do NOT add a new native module.** Native deps require an APK rebuild + redistribution, which the internal test gate blocks for the duration.
- **All ship-able work in this period MUST be OTA-only.** That means JS / TS / JSON / asset edits that are picked up by the EAS bundle. If a planned change would require a native rebuild, **stop and confirm with the user** — the answer is probably "wait until the internal test resolves."
- If you find yourself thinking "I need to install X native package to do this" — surface that to the user as a tradeoff, don't act.

The APK currently in the internal test is build **#207** (or later builds carrying the same `2.4.1` runtime, e.g. APK 210). All OTAs from this branch reach those devices automatically. **Do not change anything about the APK distribution or rebuild while the internal test is open.**

### The parallel-session pattern (important)

Multiple Claude sessions are often working on this branch at once. On 2026-05-30 the remote moved 20+ commits ahead during a single uninterrupted in-session edit. The harness sometimes starts you on a stale local copy. **Always `git fetch origin claude/new-session-MvF82` and rebase before starting work.**

When you `git push -u origin claude/new-session-MvF82` and get rejected with "fetch first":

```
git pull --rebase origin claude/new-session-MvF82
# resolve every conflict — see §0 rules above
git push -u origin claude/new-session-MvF82
```

### Per-push workflow (OTA-only, ~95% of pushes)

```
0. git fetch origin claude/new-session-MvF82
   git log HEAD..origin/claude/new-session-MvF82 --oneline | head -30
   → if there's anything, git pull --rebase first
1. Edit code in app/
2. npx tsc --noEmit   → 0 errors (ignore the pre-existing expo-speech / TTSManager noise)
3. Bump app/buildInfo.ts → next free OTA_BUILD_ID (check remote!)
4. git add -A && git commit -m "fix|feat|chore: <subject>"
5. git push -u origin claude/new-session-MvF82
```

### When a new APK build is needed

**🚫 Currently blocked — Google internal test in progress. See §3 for the hold rules.**

When the hold lifts, the conditions that warrant a new APK build are:
- Adding a NATIVE module (a `package.json` dep with native bindings)
- Changing `app.json` native config (permissions, entitlements, navigation bar, status bar config, etc.)
- Bumping `version` in `app.json` (which changes the runtimeVersion via the `appVersion` policy and forces all OTAs onto the new runtime)

Steps (only when the hold lifts):
1. Confirm with the user before adding the native dep
2. Add to `package.json` + `npm install`
3. Decide whether to bump `version` in `app.json`:
   - Keep at the current version to share OTA stream with existing testers (recommended default)
   - Bump only if old APKs can't safely no-op past the new module
4. Bump comment in `metro.config.js` to trigger `build-apk.yml`
5. The user redistributes the APK manually (or pushes a new internal-test build)

**Lazy-load any native module that might not be in older APKs.** Static `import * as X from 'native-module'` at the top of a file can crash the bundle on APKs that don't have the native bridge. Use `require()` inside a try/catch helper (see `loadNavigationBar()` in `App.tsx`).

### OTA / APK runtime model

- `app.json` has `"runtimeVersion": { "policy": "appVersion" }` — meaning **runtimeVersion = the `version` field at build time** (currently `2.4.1`).
- OTAs are delivered to **every device on the same runtime + channel**.
- Multiple APKs on the same `version` share the OTA stream. Build number is just the binary version; runtime is what matters for OTA delivery.

---

## 4. OTA numbering

Format: `YYYY-MM-DD-NNN`.

- **`NNN` is a global monotonic counter, NOT a per-day counter.** The date prefix is informational only — the counter must always be `(last shipped NNN) + 1` regardless of date.
- The last shipped NNN is the **highest** value mentioned in `app/buildInfo.ts` (it has a running comment block of every OTA's notes).
- When the remote moves ahead of you mid-work, fetch + grep the new buildInfo.ts to find the new floor, then bump again.
- 2026-05-30 example: I picked `2026-05-30-054` for in-pack repair, rebased to find remote at `2026-05-26-063`, had to bump to `2026-05-30-064`. Now we're at `2026-05-30-069`.

---

## 5. How the player works with you

**The user types runtime feedback into the in-game text input.** They paste me the play log between sessions. So when a log includes player turns like *"we need to add salvage as a button"* or *"this should pop up nouns"*, that's the player talking TO ME through the game — not an in-fiction action.

Two implications:
1. The meta-comment guard in `submitPlayerAction` catches these and shows a confused-Arbiter response that includes "I'll keep your note in the log either way." That response is what the player sees — keep it honest, don't mock-narrate the request.
2. When reviewing logs, treat any sentence that's clearly meta-feedback as a feature request to triage, not a parser miss to debug.

**Log review is the primary feedback channel.** Player pastes a log → you find issues, prioritise, and ship fixes the same OTA. You will not have direct verification of fixes most of the time. Trust their next log to surface what worked and what didn't.

**Style preferences carried from prior sessions:**
- Two-three sentences with a recommendation + the main tradeoff for exploratory questions; only implement after agreement.
- Don't write multi-paragraph proposals unless asked.
- Default to writing no comments in code. Only comment when WHY is non-obvious (hidden constraint, subtle invariant, workaround for a specific bug). One short line max.
- Don't reference PR / task context inside code comments — they belong in commit bodies.

---

## 6. Architecture cheat-sheet

```
app/
  ai/                  — MiniLM + Qwen orchestrators
  audio/               — AudioManager / AudioController / settings
  components/          — UI primitives, Search / Approach modals,
                         TutorialOverlay + TutorialTarget,
                         FirstUseNudgeOverlay (OTA-066),
                         BrandedModal (now accepts bodyNode for custom content)
  data/                — Authored JSON. items/materials.json, items/weapons.json,
                         items/armor.json, items/gear.json, items/amulets.json,
                         items/rings.json, items/recipes.json. wasteland_encounters.json
                         (49 archetypes). lore/concepts.json. lore/mystery-seeds.json.
                         thirdPartyNotices.ts (license texts, OTA-065).
                         firstUseNudges.ts (one-shot popup content, OTA-066).
  engine/              — Pure logic: parser, llmParser (Qwen fallback),
                         combat, crafting, durability, scrapEngine (repairCostMaterials),
                         equipment, hooks, hunts, mysteries, faction quests, world map,
                         weather, area search, ambient nouns, status effects,
                         narrative gen, digging, save system, enemy traits,
                         item weight, context injector, hub, containerLoot,
                         wastelandEncounters, encounter (pickEnemyForLocation +
                         pickEnemyForLocationGuaranteed (OTA-067))
  screens/             — Title / CharacterCreation / Exploration / Inventory /
                         Crafting (2 tabs now after OTA-064 dropped the REPAIR tab) /
                         Vendor / Log / Lore / About (5 tabs: SESSION/SFX/LORE/ABOUT/NOTICES) /
                         ActionReference / Contracts / Character (Player Sheet) / Map
  state/               — gameStore.ts (Zustand) — ~15,500 lines, the spine.
                         Key actions: triggerFirstUseNudge / dismissFirstUseNudge,
                         repairInventoryItem (the field-repair path — DO NOT
                         duplicate as repairFromPack), markRepairNudgeShown.
  updates/             — checkAndApplyOTA.ts — fetchOnly mode for boot,
                         full reload on player tap
  voice/               — voiceSettings / TTSManager / TTSController /
                         PiperTTSManager (Kokoro) / STTManager / loreLexicon /
                         speakerVoices / executorchAdapter
App.tsx                — boots hydrate, cognitive, Qwen, audio, TTS, auto-OTA;
                         pins Android status-bar padding; lazy-loads
                         expo-navigation-bar; global ErrorUtils handler;
                         ScreenErrorBoundary wrapping AppShell;
                         mounts TutorialOverlay + FirstUseNudgeOverlay at root.
.github/workflows/
  build-apk.yml        — Gradle APK build (path-gated; touches metro.config.js)
  eas-update.yml       — OTA publish on every push to claude/new-session-MvF82
metro.config.js        — comment bumps trigger APK rebuild
app/buildInfo.ts       — OTA_BUILD_ID — bump on every JS-only push.
                         Running comment block above the export documents
                         every OTA's reason. Reading the comments back is the
                         fastest way to learn what's been done recently.
```

---

## 7. This session's OTAs (2026-05-30, OTAs 064 → 067)

Detailed for the immediate handoff. Earlier OTAs (020 → 063) are documented in the per-OTA comments at the top of `app/buildInfo.ts` and in git log subject lines.

### OTA-064 — in-pack repair UX + dropped Crafting REPAIR tab

**Trigger:** *"All right, so let's remove the repair tab tab outline the item that needs repaired in red and the first time that happens give him a nudge and then when they click on the item in their inventory we can add another modal button that says repair, and when we hit the repair button it should tell you what is needed and if you have that item it should be green and if you do not it should be red."*

What shipped:
- Removed REPAIR tab from `CraftingScreen` (now 2 tabs: CRAFT / RECIPES). The tab existed from OTA-059's 3-tab restructure; this OTA drops it because field-repair now lives in the pack item modal.
- Red border on inventory rows when `current < max` durability (helper: `needsRepair(item)` in `engine/durability.ts`).
- Repair button added to the existing item modal between Use and Scrap when the item needs repair.
- Second modal opens with the material checklist: green line if you have enough, red if not. Confirm calls the existing `repairInventoryItem(itemId)` action — **do not duplicate as `repairFromPack`**; the existing path uses the consistent 2× scrap-output cost rule.
- One-time nudge fires the first time the player opens the pack with any worn item, persisted via `worldMemory.repairNudgeShown`.
- Vendor TC repair (`repair <item>` at any vendor) is untouched and still works as the coexisting path.

**Regression cost incurred:** built `requiredRepairMaterials` / `repairChecklist` / `applyRepair` / `repairFromPack` first, then deleted them all during rebase because the existing `repairCostMaterials` and `repairInventoryItem` already did the job. Total wasted work: ~20 minutes of code + a full conflict resolution. Lesson is now in §0.

### OTA-065 — third-party notices screen

**Trigger:** user asked whether the model + native lib licenses (MiniLM, Qwen, Kokoro, llama.rn, onnxruntime, executorch) permit commercial sale. After verifying every license against the source repos, the answer was **yes** — but each license requires the full text be surfaced to the user.

What shipped:
- New `NOTICES` tab as the 5th tab in Settings (gear icon → NOTICES).
- New file `app/data/thirdPartyNotices.ts` containing the full Apache-2.0 / MIT / BSD-3-Clause license texts plus per-component metadata (role, copyright holder, source URL).
- Each notice card collapses by default — tap to expand the full license text. URLs are selectable for copy-paste.
- All eight shipped open-source items covered: MiniLM, Qwen2.5-0.5B, Kokoro-82M, react-native-executorch, ExecuTorch runtime (BSD-3-Clause names six contributors: Meta, Arm, Qualcomm, Apple, MediaTek, NXP), llama.rn, llama.cpp, onnxruntime-react-native.

**Required-before-release sanity check** the user should know:
- Don't use Meta / Arm / Qualcomm / Apple / MediaTek / NXP / Microsoft in marketing as an endorsement (BSD-3-Clause non-endorsement clause).
- Soft note: MiniLM's *training data* (MS MARCO, GooAQ) has non-commercial terms. Mainstream legal read is dataset terms bind the dataset, not the trained weights. Counsel sanity-check is the cheap hedge if MiniLM is used for search/retrieval over user data. Not a blocker.
- The big one that would have killed it — Qwen License's 100M-MAU clause — does **not** apply to the 0.5B model we ship (it's the 3B/72B variants that carry that license).

### OTA-066 — tutorial trim + first-use nudges

**Trigger:** *"how did we get back to the 23 popup tutorial?"* — parallel work over the prior 5 days had grown `TUTORIAL_STEPS` from 11 (the slim screen tour we shipped) to **23 steps**, including concept dumps for race mechanics, golems, contracts, core guardians, resurrection gems, etc. A new player saw 23 popups before play started.

User's clarification: *"keep all of the ones for the main screen right for the exploration screen. keep all those as a series of pop-ups, but then anything that isn't immediately available on that main screen should be a separate pop-up on first use"*.

What shipped:
- `TUTORIAL_STEPS` trimmed from 23 → **9 steps** that only highlight regions of the main exploration screen: welcome, stats, enemy panel, scene bar, feed, travel row, quick row, input row, closing.
- New infrastructure for one-time first-use popups:
  - `WorldMemory.seenFirstUseNudges?: string[]` — persists with save.
  - `gameStore.pendingFirstUseNudge: string | null` — single-modal queue.
  - `gameStore.triggerFirstUseNudge(id)` — no-op if already seen or another nudge is pending.
  - `gameStore.dismissFirstUseNudge()` — marks seen + persists.
  - `app/data/firstUseNudges.ts` — nudge titles + bodies.
  - `app/components/FirstUseNudgeOverlay.tsx` — top-level overlay mounted in `App.tsx`.
- 9 triggers wired into the screens / events that introduce each feature:
  - `CharacterScreen` mount → `character_sheet_intro` (covers race mechanics + stats-grow-with-use)
  - `InventoryScreen` mount → `inventory_intro`
  - `VendorScreen` mount (non-tutorial-demo) → `vendor_intro`
  - `ContractsScreen` mount → `contracts_intro`
  - `ActionReferenceScreen` mount → `actions_intro`
  - `AboutScreen` mount (with player loaded) → `settings_intro`
  - `ExplorationScreen` mount (with player loaded) → `resurrection_gems_intro`
  - `runAethercraft` golem-summon success → `golem_intro`
  - First Lost Capital entry (in `triggerMainQuest` path) → `core_guardians_intro`

### OTA-067 — rest-spam ambush no-op fix

**Trigger:** *"how can I spam rest that many times and still not have any interactions? I spammed them like 25 times and I had one fight"*. Log confirmed: 25 rests, 1 actual ambush, several "Something passed close while you slept" flavor lines.

Root cause: the rest-ambush roll (22% × time-of-day per OTA-029/030) **did fire correctly**. But the spawn fallback called `pickWastelandEncounter`, which returns non-combat archetypes (NPCs, dialogue beats, treasure caches) ~38% of the time for any given location. Those have no `enemyName`, so the `if (enc && enc.enemyName)` check silently failed and the player only saw the flavor line. Net experience: ambush rolled but no fight ~38% of the time it succeeded.

What shipped:
- New helper `pickEnemyForLocationGuaranteed(location)` in `engine/encounter.ts` — same rarity-capped weighted pick as `pickEnemyForLocation` but skips the upfront `chance(40 + danger*8)` gate. Use when the caller has already rolled and decided a fight is on.
- Rest-ambush block now tries `pickWastelandEncounter` first (preserves the mini-dungeon / skirmish variety when it lands a combat archetype), then falls back to `pickEnemyForLocationGuaranteed` so every successful ambush roll materialises a real enemy.
- After the fix: 25 back-to-back wilderness rests is ~99.8% certain to roll at least one ambush; average 5–7 ambushes per 25 rests.

---

## 8. Open tasks

### Carried from earlier waves (still open)

- **Wife's Kokoro recovery** after APK 207 install. She was on v2.0.1, so none of the 23-* OTAs reached her. Once she installs APK 207, the CLEAR BUNDLED VOICE CACHE button + 50 MB min-reuse auto-recovery apply. If BUNDLED voice still fails, COPY VOICE INFO now produces a full diagnostic (error message, full stack, free disk, executorch cache inventory). Right answer falls out of the paste-back.
- **Player creation approval screen NOT WIRED.** User is generating 14 portrait PNGs (7 races × M/F) using `docs/race-image-generation-guide.md`. When they drop them into `assets/portraits/`, a UI screen needs to show race portrait + approval flow during character creation. Filename: `<race_id>_m.png` / `<race_id>_f.png`. Straight RN `Image` should work — no APK rebuild needed.
- **Pronunciation worksheet** — `docs/pronunciation-worksheet.md`. Player fills rows and sends back. Batch into `loreLexicon.ts`.
- **PR #1 description refresh** — draft this branch → `main`. Stale relative to all 2026-05-26+ work. Use the per-OTA comments in `app/buildInfo.ts` as the source material.
- **Mechanical informant + catalyst gates on hunts** (carried from OTA-055). Templates currently narrative + UI only; engine still auto-advances on `checkKind` skill match. New `HuntDef` fields needed (`informantNpc`, `informantLocationId`, `catalystItemName`), advance-gate logic per stageType, forced transit-ambush spawns at stage 2/5.
- **7/5 templates for mysteries + storylines** — engine support is generic, mostly authoring work.
- **Inventory-full silently swallows hunt/mystery/storyline reward items on UI completion** (`gameStore.ts:8669-8679` area). Audit minor, deferred.
- **`gameStore.ts` never swept top-to-bottom for dead code** (~15k lines now). Chunked sweep recommended before major refactor.

### From this session (open if not noted otherwise)

- **None of the new first-use nudges have been playtested.** OTA-066 wires 9 triggers but the user hasn't reported back on whether the new intros land at the right moments. Watch the next log for "wait, why didn't I get the X intro?" or "the Y intro fired at a weird time."
- **Verify in-pack repair UX** lands cleanly with the materials checklist colour-coding on-device. The repair material rule (2× scrap output) might feel expensive for low-tier gear — let the player call it.
- **Verify OTA-067 rest-ambush fix on-device** — ask the player to spam rest a few times and confirm they see ambushes landing at roughly 1-in-5 rates instead of 1-in-25.

### Watch list / known flakes (not ship-blocking)

- `ambientNounVariety.test.ts` "small pools" flake — passes in isolation, intermittent in full runs.
- `climbRopeMechanics.test.ts` cross-test flake (weather tick eats stamina) — passes in isolation.
- `twoYearChaosSim` "geographic loops ≤1" flake — RNG variance against an asymptote-of-threshold metric.
- `combatStress` / `domesticStress` / `metaNavStress` OOM-abort in the sandbox at 700-day length — infrastructure ceiling, not a regression.
- Many test suites currently fail in the sandbox on missing `llama.rn` mock — environmental, not from recent code changes.

### Decided won't-do

- STT investment beyond service-selection.
- Cloud TTS (offline-first per project architecture).
- Continuous listening / hot-word (battery + privacy).

---

## 9. Workflows used this session — what + why (carry these forward)

These are the workflows I leaned on in the 2026-05-30 session. Documenting them so the next chat doesn't re-derive them and so the wins / misses are explicit.

### Investigation workflow

**Use the `Explore` subagent for code-discovery questions** that span >3 files or that you need a curated punch list out of. The pattern that worked:

> "Find and report: (1) where X lives — file + line, (2) what reads it, (3) what writes it, (4) any flakes / stale comments / TODOs about it. Be precise with file paths and line numbers. Don't paraphrase code — quote enough that I can locate the exact spots. Under 400 words."

`Explore` reads excerpts and won't pull whole files into the main context. Hits used this session:
- Locating the existing repair tab + inventory item modal before building the in-pack repair UX. **Saved the user from a full duplicate-system mistake.** The agent returned: "Currently there is **NO dedicated Repair tab** in CraftingScreen on this base, repair lives only as a vendor chat command." (I had to discover the truth — that the tab existed on the remote — after rebasing.)
- Diagnosing the 23-popup tutorial regression: agent listed every step + every other popup in the onboarding flow. Caught the repair-nudge as the 24th popup that pushed it over.
- Diagnosing the rest-spam ambush exploit: agent traced the ambush block, the time-of-day multipliers, the spawn-fallback, AND the silent `if (enc.enemyName)` no-op — full root-cause in one round.

**Use `general-purpose` subagent for tasks that need WebFetch / WebSearch + cross-source verification.** Used for license verification (MiniLM, Qwen, Kokoro, llama.rn, onnxruntime, executorch) — agent fetched the actual LICENSE files from the source repos and cross-checked HuggingFace metadata (with explicit "could not fetch HF pages — used WebSearch fallback" honesty about what was first-party verified vs not). Output format I gave it ("**A. <name>** / License / Commercial use / Attribution / Threshold gotchas / Source URL fetched") made the report immediately usable.

**Don't use subagents for tasks the main context can do in 1-2 tool calls.** Direct `Read` / `Bash grep` is faster than spinning up an agent when the target is known.

### Git workflow (with the actual mistakes I made)

The standard loop:

```
git fetch origin claude/new-session-MvF82
git log HEAD..origin/claude/new-session-MvF82 --oneline | head -30
git pull --rebase origin claude/new-session-MvF82   # if anything was there

# ... edit ...

npx tsc --noEmit 2>&1 | grep -v "expo-navigation-bar\|expo-speech\|TTSManager"
# bump app/buildInfo.ts → next free NNN (check remote first)
git add -A
git commit -m "$(cat <<'EOF'
<prefix>: <subject>

<body>

OTA: 2026-05-30-NNN
EOF
)"
git push -u origin claude/new-session-MvF82
```

**What I did wrong this session (so you don't repeat):**

1. **Started OTA-064 work without fetching.** Picked OTA number `2026-05-30-054`, wrote 250+ lines of new code (`requiredRepairMaterials`, `repairChecklist`, `applyRepair`, `repairFromPack`, modal wiring, types update), then pushed. Got rejected. Rebased. Discovered:
   - Remote was at OTA-063 (had moved 20+ commits ahead during my work).
   - The "repair tab" the user asked me to remove EXISTED on remote (added by OTA-059) but not on my base — so I'd been working from a stale picture.
   - The functions I wrote (`repairChecklist` + `applyRepair`) duplicated `repairCostMaterials` + `repairInventoryItem` that were already on the remote.
   - I had to delete most of my durability.ts work, delete the new gameStore action, then re-wire the InventoryScreen modal to use the existing `repairInventoryItem`. ~20 minutes wasted.

2. **Rebase resolution discipline matters.** During the conflict resolution I kept HEAD's expanded modal-button list (had Use / Scrap / Drop that my base didn't have) AND added my new Repair button in the correct slot. The shape that works: read HEAD's version, read your version, write the union when both are real additions; pick HEAD's version and drop yours when both are doing the same thing under different names.

3. **Always test-bump.** After every rebase, re-run `npx tsc --noEmit` and re-bump `app/buildInfo.ts` even if you already bumped it — the new number you picked might collide with a remote OTA.

### OTA numbering workflow

NNN is **global monotonic**, not per-day. To find the next free number:

```
grep -n "OTA_BUILD_ID\|OTA-0" app/buildInfo.ts | head -20
# The HIGHEST NNN in the file is the floor. Bump by 1.
# When in doubt, fetch and re-grep.
```

The file has a running comment block above the `export const OTA_BUILD_ID = ...` line that documents every OTA's reason. Add to it on every push — that comment block is the per-OTA record for the next chat.

### Verification before declaring done

- **Typecheck filtered for noise:** `npx tsc --noEmit 2>&1 | grep -v "expo-navigation-bar\|expo-speech\|TTSManager"`. The three pre-existing errors are environmental and not from your work — filtering them out lets you see real new errors.
- **Test-run targeted suites:** `npx jest <suite-name>` rather than the full suite. The full suite OOM-fails in this sandbox on missing `llama.rn` mocks (~50 suites affected, all environmental).
- **For UI changes:** explicitly tell the user you couldn't visually verify (no device in sandbox). Don't claim success on UI changes you haven't seen.

### Document-as-you-go

Every OTA in this session has a comment block above the `OTA_BUILD_ID` export in `app/buildInfo.ts` that explains the trigger, the change, and (for fixes) the root cause. This is the per-OTA log the next chat will read. **Add to it on every push, even small ones.**

---

## 10. Critical files / hotspots

- **`app/state/gameStore.ts`** — ~15,500 lines. Action handlers, combat resolution, scene management, Aethercraft (`runAethercraft` around line 15408), corruption markup, completeContractFromUI reward grants, tutorial advance, OTA-update flag, the rest-ambush spawn block (around line 5082, watch this if you touch encounter spawning). **Two rest paths exist — parser-routed `case 'rest':` (~line 4818, the live one) and dead store-method `rest()` (~line 11950). Always wire fixes into the live one and note the dead one in the commit.**
- **`app/state/gameStore.ts:repairInventoryItem`** (~line 12226) — the field-repair action. Material-based (consumes scrap-output × 2). Do not duplicate as `repairFromPack` — that mistake was made and reverted on 2026-05-30.
- **`app/engine/durability.ts`** — `needsRepair`, `wearItemByName`, `wearItemById`, `stampDurability`, `repairCost`, `repairItem`. Material requirements live in `scrapEngine.ts:repairCostMaterials`.
- **`app/engine/scrapEngine.ts`** — `repairCostMaterials(item)` returns the cost = 2× scrap output for the item.
- **`app/engine/encounter.ts`** — `pickEnemyForLocation` (gated by chance, used for travel rolls) + `pickEnemyForLocationGuaranteed` (no gate, used when caller has already rolled — added in OTA-067 for rest ambushes).
- **`app/engine/wastelandEncounters.ts`** — `pickWastelandEncounter` (49 archetypes, mix of `treasure` / `npc` / `skirmish` / `mini_dungeon`). Caller must check `enc.enemyName` because non-combat archetypes don't have one — this footgun caused OTA-067.
- **`app/components/tutorialSteps.ts`** — `TUTORIAL_STEPS` (9 steps after OTA-066 trim, all on exploration screen).
- **`app/data/firstUseNudges.ts`** — one-shot popup content for the 9 features not in the screen tour.
- **`app/components/FirstUseNudgeOverlay.tsx`** — top-level overlay, reads `pendingFirstUseNudge` and renders BrandedModal.
- **`app/data/thirdPartyNotices.ts`** — full license texts for every shipped open-source dependency. Add to this file when a new dependency lands.
- **`app/screens/AboutScreen.tsx`** — 5 tabs now (SESSION / SFX / LORE / ABOUT / NOTICES). First-time settings-open triggers `settings_intro` nudge.
- **`app/screens/CraftingScreen.tsx`** — 2 tabs (CRAFT / RECIPES). REPAIR tab was removed in OTA-064.
- **`app/screens/InventoryScreen.tsx`** — red row outline on worn items + Repair button in item modal + checklist sub-modal. Triggers `inventory_intro` nudge.
- **`app/engine/types.ts`** — shared interfaces. `WorldMemory` now has `repairNudgeShown?: boolean` and `seenFirstUseNudges?: string[]`.
- **`App.tsx`** — boot sequence, AppState handling, error boundary, lazy native-module loader, OTA flag wiring, **mounts TutorialOverlay + FirstUseNudgeOverlay**.
- **`app/buildInfo.ts`** — OTA_BUILD_ID + running comment block of every OTA's reason. **Reading the comments back is the fastest way to learn what's been done.**
- **`app/components/BrandedModal.tsx`** — now accepts optional `bodyNode: ReactNode` for callers that need colored / structured body content (added for the repair material checklist).

---

## 11. Quick-start commands

```bash
# ALWAYS run first
git fetch origin claude/new-session-MvF82
git log HEAD..origin/claude/new-session-MvF82 --oneline | head -30
# if anything is there:
git pull --rebase origin claude/new-session-MvF82

# Typecheck (ignore expo-speech / expo-navigation-bar / TTSManager noise)
npx tsc --noEmit 2>&1 | grep -v "expo-navigation-bar\|expo-speech\|TTSManager"

# Tests (most fail in sandbox on missing llama.rn mock — environmental)
npx jest --silent <suite-name>

# Find the next free OTA number
grep "OTA_BUILD_ID" app/buildInfo.ts
# (then bump the trailing NNN by 1)

# Status / log
git log --oneline -10
git status

# Standard push (OTA-only)
git add -A
git commit -m "fix: <subject>"
git push -u origin claude/new-session-MvF82
```

---

## 12. Status effect reference

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
| `food_buff` | consumable use | per-food stat buff | typically 3–6 rounds |
| `shaped_stone_ward` | `shape stone` cast in combat | +4 AC | 1 round |
| `golem_companion` | `summon golem` cast success | post-attack 1d6 bludgeoning ally hit | 3 rounds |

---

## 13. Enemy trait reference

Set on enemy entries in `enemies.json`. Read via `enemyTraits.ts`.

- **Stat mods:** `armored` (+2 AC) · `weak_armor` (-2 AC) · `agile` (+1 AC) · `quick` (+1 attack) · `slow` (-1 attack) · `savage` (+1 attack)
- **Damage filters:** `resist:<damageType>` (×0.5) · `vulnerable:<damageType>` (×1.5)
- **On-hit status:** `bleeder` (50% bleed 3r) · `venomous` (35% poison 3r) · `concussive` (20% stun 1r)
- **Per-round / first-strike:** `regenerate` (+1 HP/round) · `fast_regen` (+2/round) · `ambush_strike` (+2 first hit)

---

## 14. Combat invariants

### Loot lands in `player.inventory`, not `droppedItems`

When the player kills an enemy, the loot path in `resolveEnemyDefeat` grants items directly into `player.inventory` (and bumps the `enemiesDefeated` milestone). It does NOT populate `currentScene.droppedItems`. The `droppedItems` pool is reserved for unclaimed loot — items the player leaves on the ground or items dropped by stealing / scattering. Stress-test authors who check `droppedItems.length` after combat will see 0 and conclude nothing dropped; they should look at `player.inventory` deltas.

### `gameLog` has a 500-entry cap with same-channel merge

`appendLog` caps the log at 500 entries and **collapses consecutive same-channel lines** into a single multi-line entry when they fire within the same render tick. Consequences:
- Counting `gameLog.length` will under-count when the system emits a burst of same-channel messages (a single combat round can emit 6+ `'combat'` lines that show as 1 entry).
- Searching for a specific line should use `gameLog.flatMap` over text content, not slot-position arithmetic.
- Old entries fall off the front when the cap is hit; long stress tests can't read early-game entries and expect them to still be there.

### Nat-1 always misses, nat-20 always crits

In `resolveRollStep` and `applyEnemyCounter`, the d20 attack roll's **raw value** overrides the bonus math at the floor and ceiling:
- Natural 1 → forced miss (success = false), no damage step.
- Natural 20 → forced hit (success = true) AND `critical = true`, which doubles the dice count on the follow-up damage step (player) or re-rolls and sums the damage notation (enemy).

Symmetric — applies to both sides. Combat log surfaces `✓ CRITICAL HIT` / `✗ FUMBLE` on the trigger. Mirror this rule in any new combat stress test that computes hit rate locally — a missed attack drains `pendingRolls` before you can read `success` back off the store.

---

## 15. Commit conventions

- **Prefix:** `feat:` / `fix:` / `chore:` / `refactor:` / `debug:` / `test:` / `perf:` / `ui:` / `content:` / `docs:`
- **Subject:** one line, lowercase after prefix, concrete and specific
- **Body:** explain the WHY with concrete before/after. Reference OTA numbers when fixing earlier bugs. End with the OTA number: `OTA: 2026-05-30-XXX`.
- **Never include** the model identifier (`claude-opus-4-7[1m]`) in any committed artifact.
- **Pass commit messages via heredoc:**
  ```
  git commit -m "$(cat <<'EOF'
  feat: <subject>

  <body>

  OTA: YYYY-MM-DD-NNN
  EOF
  )"
  ```

---

## 16. For the next chat — picking up where I left off

**Read §0 first. Read §0 first. Read §0 first.** The regression-prevention checklist is the most important part of this document.

**State at handoff (2026-05-30, end of the in-pack repair + notices + tutorial trim + rest-fix mini-wave):**

- App version: `2.4.1`. Latest OTA: `2026-05-30-069`. Working tree clean. Origin in sync.
- This session shipped 4 *feature* OTAs in this branch: OTA-064 (in-pack repair UX + drop Crafting REPAIR tab), OTA-065 (third-party notices screen — required for commercial release), OTA-066 (tutorial 23 → 9 + first-use nudges for the rest), OTA-067 (rest-spam ambush no-op fix). OTA-068 was the HANDOFF.md rewrite and OTA-069 this doc-sync fix (both docs-only, no behavior change).
- Parallel sessions are pushing aggressively. The remote moved 20+ commits ahead during a single in-session edit on 2026-05-30. **Always fetch + rebase before starting work.**

**Things in flight / immediate next steps:**

1. **Verify OTAs 064-067 on-device** via the player's next log. The four user-facing changes that need real-world feedback:
   - Red-outlined items in inventory + Repair flow lands cleanly (OTA-064)
   - First-use nudges fire at the right moments (OTA-066)
   - Rest spam now produces ambushes (OTA-067)
   - Notices tab is reachable + readable (OTA-065)
2. **Wife's Kokoro recovery** after APK 207 install — paste-back from the new diagnostic will tell us why bundled voice dies on her device.
3. **Player creation approval screen** — wire it when the 14 race portrait PNGs land in `assets/portraits/`.
4. **PR #1 description refresh** — stale; cover the v2.4.1 baseline + everything since.
5. **Pronunciation worksheet** — still pending player input.

**Watch list (full list in §8):**
- Recurring sandbox test-suite failures on missing `llama.rn` mock — environmental.
- `twoYearChaosSim` geographic-loop flake — RNG variance.
- `gameStore.ts` still never swept top-to-bottom for dead code (~15k lines).
- Inventory-full silent swallow on UI quest completion — audit minor.

**The user's working style — important context (carried forward):**

- Game playtested on Android, OTA-delivered. Pastes in-game logs and screenshots. Treat anything that looks like meta-feedback as a feature request, not a parser miss.
- Ships fast: defaults to OTA-only delivery, native rebuild only for new modules. Test → OTA bump → commit → push is the loop.
- Wants reasoning surfaced briefly — two-three sentences with a recommendation and main tradeoff for exploratory questions. Only implement after agreement.
- Multiple parallel Claude sessions on the same branch. Coordinate via `git fetch` before every task and again before every push.

---

That's the lay of the land at OTA `2026-05-30-069`. The four feature OTAs from this session went fast because each one was small and well-scoped, but the rebase cost on OTA-064 was real (~20 minutes wasted building duplicate work). The §0 checklist is the antidote — follow it.
